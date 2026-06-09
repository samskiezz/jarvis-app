"""CORRELATOR — the non-stop cross-correlation engine.

The ontology is full of the SAME real-world thing stored many times (e.g. `arxiv api` appears 2,644×
as both DataSource and Document). Nothing recognises that, so counts inflate and the graph never
"knows" one thing is another. This daemon fixes that, forever:

  • scans ont_object, groups by a normalised name key (conservative EXACT match → high precision,
    no false merges like "Port" vs "Source Port")
  • elects a CANONICAL object per group (preferred type order, then stable id)
  • writes SAME_AS links member→canonical (idempotent, rate-limited) — the "places it" / graph wiring
  • maintains a corr_entity index (resolved entities, member counts, the types they span)

NON-DESTRUCTIVE: it never deletes or merges an object — only adds links + an index. Safe to run
forever next to the live writers. Ticks every pass, grows as new objects land.

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.services.correlator [interval_s]
Env:  BRAIN_DB, CORR_INTERVAL_S (default 45), CORR_LINK_CAP (new SAME_AS links per pass, default 4000)
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import time

BRAIN_DB = os.environ.get("BRAIN_DB", "server/data/brain.db")
LINK_CAP = int(os.environ.get("CORR_LINK_CAP", "4000"))

# which type "wins" as the canonical entity when the same name spans types
TYPE_RANK = {"Topic": 0, "Concept": 1, "DomainSubject": 2, "Place": 3, "Asset": 4, "Sensor": 5,
             "DataSource": 6, "AcquisitionPoint": 7, "Measurement": 8, "ScientificPublication": 9,
             "Document": 10, "Event": 11, "EarthquakeEvent": 12, "SpeciesOccurrence": 13}


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(BRAIN_DB, timeout=60)
    c.execute("PRAGMA busy_timeout=60000")
    return c


def _norm(name: str) -> str:
    s = (name or "").strip().lower()
    return re.sub(r"\s+", " ", s)


def _name_of(props: str) -> str:
    try:
        j = json.loads(props)
        return (j.get("label") or j.get("topic_name") or j.get("name") or j.get("title") or "")
    except Exception:  # noqa: BLE001
        return ""


def _ensure(c: sqlite3.Connection) -> None:
    c.execute("""CREATE TABLE IF NOT EXISTS corr_entity(
        corr_key TEXT PRIMARY KEY, canonical_id TEXT, canonical_name TEXT, canonical_type TEXT,
        members INTEGER, types TEXT, updated_ts INTEGER)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_corr_members ON corr_entity(members DESC)")
    c.commit()


def run_pass(c: sqlite3.Connection) -> dict:
    rows = c.execute("SELECT id,type,props FROM ont_object").fetchall()
    groups: dict[str, list[tuple[str, str]]] = {}
    for oid, typ, props in rows:
        k = _norm(_name_of(props))
        if len(k) < 2:
            continue
        groups.setdefault(k, []).append((oid, typ))

    raw = len(rows)
    multi = {k: m for k, m in groups.items() if len(m) > 1}
    dup_members = sum(len(m) for m in multi.values())
    # distinct entities after dedup = raw minus the savings (each group of M collapses to 1)
    distinct = raw - (dup_members - len(multi))

    # which members already have a SAME_AS link (so each pass makes NEW progress, capped)
    linked = {r[0] for r in c.execute("SELECT from_id FROM ont_link WHERE type='SAME_AS'")}

    now = int(time.time())
    ent_rows = []
    new_links = []
    for k, members in multi.items():
        ms = sorted(members, key=lambda m: (TYPE_RANK.get(m[1], 99), m[0]))
        canon_id, canon_type = ms[0]
        types = ",".join(sorted({t for _, t in members}))
        ent_rows.append((k, canon_id, k, canon_type, len(members), types, now))
        for oid, _typ in ms[1:]:
            if oid not in linked and len(new_links) < LINK_CAP:
                new_links.append((f"sameas:{oid}->{canon_id}", "SAME_AS", oid, canon_id, now))

    # upsert the resolved-entity index (full, light)
    c.executemany(
        "INSERT INTO corr_entity(corr_key,canonical_id,canonical_name,canonical_type,members,types,updated_ts) "
        "VALUES(?,?,?,?,?,?,?) ON CONFLICT(corr_key) DO UPDATE SET "
        "canonical_id=excluded.canonical_id, canonical_type=excluded.canonical_type, "
        "members=excluded.members, types=excluded.types, updated_ts=excluded.updated_ts",
        ent_rows)
    c.commit()
    # add SAME_AS links in small chunks (idempotent), rate-limited per pass
    for i in range(0, len(new_links), 1000):
        c.executemany("INSERT OR IGNORE INTO ont_link(id,type,from_id,to_id,ts) VALUES(?,?,?,?,?)",
                      new_links[i:i + 1000])
        c.commit()

    return {"raw": raw, "groups": len(multi), "dup_members": dup_members,
            "distinct": distinct, "new_links": len(new_links)}


_STOP = {"the", "and", "for", "with", "data", "api", "from", "into", "your", "this", "that",
         "all", "are", "was", "has", "have", "not", "via", "per", "new", "set", "use"}


def _tokens(name: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", (name or "").lower()) if len(w) > 3 and w not in _STOP}


def link_topics(c: sqlite3.Connection, cap: int = 20000) -> dict:
    """Connect ORPHAN Topics to related objects (Document/Concept/DomainSubject/DataSource) by shared
    distinctive name tokens → RELATES_TO links. This is the missing cross-correlation: it turns the
    7,000 topic islands into a connected graph. Conservative (>=2 shared distinctive tokens), idempotent."""
    now = int(time.time())
    tok2topics: dict[str, set] = {}
    for tid, props in c.execute("SELECT id,props FROM ont_object WHERE type='Topic'"):
        try:
            j = json.loads(props); nm = j.get("topic_name") or j.get("label") or ""
        except Exception:  # noqa: BLE001
            nm = ""
        for t in _tokens(nm):
            tok2topics.setdefault(t, set()).add(tid)
    # drop over-generic tokens (map to too many topics → noise)
    tok2topics = {t: s for t, s in tok2topics.items() if len(s) <= 40}
    existing = {r[0] for r in c.execute("SELECT from_id FROM ont_link WHERE type='RELATES_TO'")}
    new, seen = [], set()
    for oid, props in c.execute("SELECT id,props FROM ont_object WHERE type IN "
                                "('Document','Concept','DomainSubject','DataSource')"):
        if oid in existing:
            continue
        try:
            j = json.loads(props); nm = j.get("label") or j.get("name") or ""
        except Exception:  # noqa: BLE001
            nm = ""
        cand: dict = {}
        for t in _tokens(nm):
            for tid in tok2topics.get(t, ()):
                cand[tid] = cand.get(tid, 0) + 1
        for tid, score in cand.items():
            if score >= 2 and (oid, tid) not in seen:
                seen.add((oid, tid))
                new.append((f"relates:{oid}->{tid}", "RELATES_TO", oid, tid, now))
        if len(new) >= cap:
            break
    for i in range(0, len(new), 1000):
        c.executemany("INSERT OR IGNORE INTO ont_link(id,type,from_id,to_id,ts) VALUES(?,?,?,?,?)",
                      new[i:i + 1000])
        c.commit()
    linked_topics = c.execute("SELECT count(DISTINCT to_id) FROM ont_link WHERE type='RELATES_TO'").fetchone()[0]
    return {"new_relates": len(new), "topics_now_connected": linked_topics}


def stats() -> dict:
    try:
        c = _conn()
        _ensure(c)

        def one(q):
            try:
                return c.execute(q).fetchone()[0] or 0
            except Exception:  # noqa: BLE001
                return 0
        raw = one("SELECT count(*) FROM ont_object")
        groups = one("SELECT count(*) FROM corr_entity")
        members = one("SELECT sum(members) FROM corr_entity")
        sameas = one("SELECT count(*) FROM ont_link WHERE type='SAME_AS'")
        relates = one("SELECT count(*) FROM ont_link WHERE type='RELATES_TO'")
        topics_connected = one("SELECT count(DISTINCT to_id) FROM ont_link WHERE type='RELATES_TO'")
        topics_total = one("SELECT count(*) FROM ont_object WHERE type='Topic'")
        distinct = raw - (members - groups) if members else raw
        top = [{"name": n, "members": m, "types": t} for n, m, t in c.execute(
            "SELECT canonical_name,members,types FROM corr_entity ORDER BY members DESC LIMIT 8")]
        c.close()
        return {"raw_objects": raw, "resolved_entities": groups, "duplicates_collapsed": (members - groups) if members else 0,
                "distinct_after_dedup": distinct, "sameas_links": sameas, "topic_links": relates,
                "topics_connected": topics_connected, "topics_total": topics_total, "top": top}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:120]}


def run_forever(interval_s: float = 45.0) -> None:
    print(f"[correlator] starting — non-stop cross-correlation, every {interval_s}s, link cap {LINK_CAP}/pass",
          flush=True)
    idle, prev_raw, passes = 0, -1, 0
    while True:
        try:
            c = _conn()
            _ensure(c)
            s = run_pass(c)
            passes += 1
            lt = {}
            if passes == 1 or passes % 3 == 0:   # connect orphan topics to related objects periodically
                lt = link_topics(c)
            c.close()
            print(f"[correlator] raw={s['raw']:,} resolved_groups={s['groups']:,} "
                  f"dup_members={s['dup_members']:,} distinct={s['distinct']:,} +links={s['new_links']:,}"
                  + (f" | +{lt['new_relates']} topic-links ({lt['topics_now_connected']} topics connected)"
                     if lt.get("new_relates") else ""), flush=True)
            # adaptive backoff: when there's no new work, sleep longer; snap back when data arrives
            idle = idle + 1 if (s["new_links"] == 0 and not lt.get("new_relates") and s["raw"] == prev_raw) else 0
            prev_raw = s["raw"]
        except Exception as e:  # noqa: BLE001
            print(f"[correlator] error: {str(e)[:160]}", flush=True)
            try:
                from . import feedback_bus as _fb
                _fb.record("server/services/correlator.py", "exception", str(e)[:200], "error")
            except Exception:  # noqa: BLE001
                pass
            idle = 0
        time.sleep(interval_s if idle == 0 else min(interval_s * (idle + 1), 300))


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        print(json.dumps(stats(), indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "once":
        c = _conn(); _ensure(c); print(run_pass(c)); c.close()
    else:
        run_forever(float(sys.argv[1]) if len(sys.argv) > 1 else float(os.environ.get("CORR_INTERVAL_S", "45")))
