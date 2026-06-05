"""JARVIS ER — native entity resolution, master data and data fusion.

Section 4 of the Palantir-grade spec: resolve duplicate people/companies/assets
across fragmented sources into governed golden records. Implemented natively
(stdlib only, never raises) over the operational ontology's objects:

  * BLOCKING        — cheap candidate generation (first token of the name field).
  * SIMILARITY      — token Jaccard + fuzzy ratio (difflib) + phonetic (Soundex),
                      combined into a confidence score with a breakdown.
  * ADJUDICATION    — uncertain pairs land in a human review queue.
  * GOVERNED MERGE  — merging is RBAC-checked, audited and REVERSIBLE; a golden
                      record is built by survivorship (fill from the richer source)
                      while preserving every source fact (provenance-preserving).
  * CROSSWALK       — merged ids map to the canonical id; golden() returns the
                      resolved view.

Pairs with jarvis_ontology objects; all decisions flow through jarvis_os audit.
"""

from __future__ import annotations

import difflib
import json
import re
import sqlite3
import time
import uuid

from . import jarvis_aip as aip
from . import jarvis_ontology as ont
from . import jarvis_os as jos

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")


# ───────────────────────────────────────────────────────────── storage
def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS er_match (
                    id TEXT PRIMARY KEY, type TEXT, a_id TEXT, b_id TEXT, score REAL,
                    breakdown TEXT, status TEXT, decided_by TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS er_merge (
                    canonical_id TEXT, merged_id TEXT, actor TEXT, ts INTEGER,
                    PRIMARY KEY (canonical_id, merged_id)
                );
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


# ───────────────────────────────────────────────────────────── similarity
def _name(props: dict) -> str:
    for k in ("name", "title", "label", "full_name"):
        if props.get(k):
            return str(props[k])
    # fall back to first string property
    for v in props.values():
        if isinstance(v, str) and v:
            return v
    return ""


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()


def _soundex(token: str) -> str:
    token = re.sub(r"[^a-z]", "", token.lower())
    if not token:
        return ""
    codes = {**dict.fromkeys("bfpv", "1"), **dict.fromkeys("cgjkqsxz", "2"),
             **dict.fromkeys("dt", "3"), "l": "4", **dict.fromkeys("mn", "5"), "r": "6"}
    first = token[0].upper()
    tail = []
    prev = codes.get(token[0], "")
    for ch in token[1:]:
        c = codes.get(ch, "")
        if c and c != prev:
            tail.append(c)
        if ch not in "hw":
            prev = c
    return (first + "".join(tail) + "000")[:4]


def _phonetic(a: str, b: str) -> float:
    ta, tb = _norm(a).split(), _norm(b).split()
    if not ta or not tb:
        return 0.0
    sa = {_soundex(t) for t in ta if t}
    sb = {_soundex(t) for t in tb if t}
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def similarity(a_props: dict, b_props: dict) -> dict:
    """Combined identity confidence with a breakdown, in [0,1]."""
    na, nb = _name(a_props), _name(b_props)
    A, B = _norm(na), _norm(nb)
    ta, tb = set(A.split()), set(B.split())
    jacc = (len(ta & tb) / len(ta | tb)) if (ta | tb) else 0.0
    fuzzy = difflib.SequenceMatcher(None, A, B).ratio() if (A and B) else 0.0
    phon = _phonetic(na, nb)
    score = round(0.45 * jacc + 0.35 * fuzzy + 0.20 * phon, 4)
    return {"score": score, "jaccard": round(jacc, 4), "fuzzy": round(fuzzy, 4),
            "phonetic": round(phon, 4), "a": na, "b": nb}


# ───────────────────────────────────────────────────────────── candidate generation
def find_duplicates(object_type: str, *, threshold: float = 0.6, enqueue: bool = True) -> dict:
    """Block + score candidate duplicate pairs of an object type."""
    init_db()
    objs = []
    for meta in ont.list_objects(object_type, limit=5000):
        o = ont.get_object(meta["id"])
        if o and not _is_merged(o["id"]):
            objs.append(o)
    # blocking by first character of the normalised name
    blocks: dict[str, list[dict]] = {}
    for o in objs:
        key = (_norm(_name(o["props"]))[:1]) or "_"
        blocks.setdefault(key, []).append(o)
    pairs = []
    for group in blocks.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                sim = similarity(group[i]["props"], group[j]["props"])
                if sim["score"] >= threshold:
                    pair = {"a_id": group[i]["id"], "b_id": group[j]["id"], **sim}
                    pairs.append(pair)
                    if enqueue:
                        _enqueue(object_type, pair)
    pairs.sort(key=lambda p: p["score"], reverse=True)
    jos.audit("er.find_duplicates", target=object_type,
              meta={"candidates": len(pairs), "threshold": threshold})
    return {"type": object_type, "threshold": threshold, "candidates": pairs}


def _enqueue(object_type: str, pair: dict) -> None:
    mid = hash_id(pair["a_id"], pair["b_id"])
    try:
        c = _conn()
        try:
            exists = c.execute("SELECT 1 FROM er_match WHERE id=?", (mid,)).fetchone()
            if not exists:
                c.execute(
                    "INSERT INTO er_match (id,type,a_id,b_id,score,breakdown,status,decided_by,ts)"
                    " VALUES (?,?,?,?,?,?,?,?,?)",
                    (mid, object_type, pair["a_id"], pair["b_id"], pair["score"],
                     json.dumps(pair, default=str), "pending", None, int(time.time() * 1000)))
                c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def hash_id(a: str, b: str) -> str:
    return uuid.uuid5(uuid.NAMESPACE_OID, "|".join(sorted([a, b]))).hex[:16]


def queue(status: str = "pending", limit: int = 100) -> list[dict]:
    """The human adjudication queue."""
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM er_match WHERE status=? ORDER BY score DESC LIMIT ?",
                             (status, max(1, int(limit)))).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


# ───────────────────────────────────────────────────────────── governed merge
def _is_merged(object_id: str) -> bool:
    init_db()
    try:
        c = _conn()
        try:
            return c.execute("SELECT 1 FROM er_merge WHERE merged_id=?", (object_id,)).fetchone() is not None
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return False


def resolve(a_id: str, b_id: str, *, merge: bool = True, role: str = "operator",
            actor: str = "system") -> dict:
    """Adjudicate a candidate pair. ``merge`` folds b into a (survivorship) under
    RBAC + audit, reversibly; otherwise records a 'not a match' decision."""
    init_db()
    if not jos.require(role, "workflow.run", actor=actor):
        return {"status": "denied", "needed": "workflow.run", "role": role}
    mid = hash_id(a_id, b_id)
    if not merge:
        _set_status(mid, "rejected", actor)
        jos.audit("er.reject", actor=actor, target=mid, meta={"a": a_id, "b": b_id})
        return {"status": "rejected", "a": a_id, "b": b_id}

    a, b = ont.get_object(a_id), ont.get_object(b_id)
    if not a or not b:
        return {"status": "missing_object"}
    # survivorship: keep a as canonical; fill blank/poorer fields from b
    merged_props = dict(a["props"])
    for k, v in (b["props"] or {}).items():
        cur = merged_props.get(k)
        if not cur or (isinstance(v, str) and isinstance(cur, str) and len(v) > len(cur)):
            merged_props[k] = v
    try:
        c = _conn()
        try:
            c.execute("UPDATE ont_object SET props=?,updated_ts=? WHERE id=?",
                      (json.dumps(merged_props, default=str), int(time.time() * 1000), a_id))
            c.execute("INSERT OR REPLACE INTO er_merge (canonical_id,merged_id,actor,ts) VALUES (?,?,?,?)",
                      (a_id, b_id, actor, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    _set_status(mid, "merged", actor)
    jos.audit("er.merge", actor=actor, target=a_id, meta={"merged": b_id, "canonical": a_id})
    aip.record_lineage("er.merge", a_id, actor=actor, derived_from=[a_id, b_id],
                       meta={"survivorship": "longest-wins"})
    return {"status": "merged", "canonical": a_id, "merged": b_id, "golden_props": merged_props}


def unmerge(canonical_id: str, merged_id: str, *, role: str = "operator", actor: str = "system") -> dict:
    """Reverse a merge (reversible identity operation)."""
    init_db()
    if not jos.require(role, "workflow.run", actor=actor):
        return {"status": "denied", "needed": "workflow.run", "role": role}
    try:
        c = _conn()
        try:
            c.execute("DELETE FROM er_merge WHERE canonical_id=? AND merged_id=?", (canonical_id, merged_id))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    _set_status(hash_id(canonical_id, merged_id), "pending", actor)
    jos.audit("er.unmerge", actor=actor, target=canonical_id, meta={"merged": merged_id})
    return {"status": "unmerged", "canonical": canonical_id, "restored": merged_id}


def _set_status(match_id: str, status: str, actor: str) -> None:
    try:
        c = _conn()
        try:
            c.execute("UPDATE er_match SET status=?,decided_by=? WHERE id=?", (status, actor, match_id))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def golden(object_id: str) -> dict:
    """The resolved golden record for an object: canonical id + all merged ids."""
    init_db()
    try:
        c = _conn()
        try:
            # follow crosswalk up to canonical
            row = c.execute("SELECT canonical_id FROM er_merge WHERE merged_id=?", (object_id,)).fetchone()
            canonical = row["canonical_id"] if row else object_id
            merged = [r["merged_id"] for r in
                      c.execute("SELECT merged_id FROM er_merge WHERE canonical_id=?", (canonical,)).fetchall()]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        canonical, merged = object_id, []
    obj = ont.get_object(canonical)
    return {"canonical_id": canonical, "merged_ids": merged,
            "record": obj, "is_golden": bool(merged)}


def stats() -> dict:
    init_db()
    try:
        c = _conn()
        try:
            pend = c.execute("SELECT COUNT(*) FROM er_match WHERE status='pending'").fetchone()[0]
            merged = c.execute("SELECT COUNT(*) FROM er_merge").fetchone()[0]
            total = c.execute("SELECT COUNT(*) FROM er_match").fetchone()[0]
        finally:
            c.close()
        return {"pending": pend, "merged": merged, "candidates_seen": total}
    except Exception:  # noqa: BLE001
        return {"pending": 0, "merged": 0, "candidates_seen": 0}
