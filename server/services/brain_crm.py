"""BRAIN CRM — tiered, evidence-cited people enrichment (the "second brain"
PEOPLE-CRM layer, mirroring COG-second-brain's tiered contact dossiers).

The idea (the COG pattern): you don't write a person's dossier up front. You
just *mention* people as they come up in notes, meetings, and conversations.
Each mention is recorded as a dated, source-cited observation. A person's
profile then assembles itself from those observations at a depth that grows
with how much you actually know:

  * ``stub``     (>=1 mention)  — name + role + a one-line summary.
  * ``moderate`` (>=3 mentions) — adds a snapshot, working-style, strengths.
  * ``full``     (>=8 mentions, OR any "meeting"-sourced observation) — the
                                  complete dossier with every observation cited.

Nothing is fabricated: every line of the assembled profile is backed by one or
more recorded observations, each carrying its source citation and a confidence.

Storage: stdlib ``sqlite3`` only, DB path from env ``BRAIN_CRM_DB`` (default
``server/data/brain_crm.db``). Idempotent DDL + idempotent-ish writes. Every
public function degrades gracefully and NEVER raises.

It also mirrors a person into the vault as a ``kind=entity`` note via the
existing second-brain store (imported, never edited), degrading silently if
that import fails.

Public surface:
  * ``mention(person, context, source=None) -> dict``  — record an observation.
  * ``profile(person) -> dict``                        — tiered, cited profile.
  * ``people() -> list[dict]``                         — roster w/ tier + count.
"""

from __future__ import annotations

import os
import re
import sqlite3
import time
import uuid
from typing import Any, Optional

# ── graceful import of the second-brain vault (never edit it; only import) ─────────
try:
    from . import second_brain as sb  # type: ignore
except Exception:  # noqa: BLE001 - degrade gracefully if import fails
    sb = None  # type: ignore


# ── DB location ────────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "brain_crm.db"
)

# Tier thresholds (mention counts). A "meeting" source forces the full tier.
_TIER_MODERATE = 3
_TIER_FULL = 8

# Source words that read as a high-signal, in-person interaction → full tier.
_MEETING_RE = re.compile(r"\b(meet|meeting|call|1:1|one[- ]on[- ]one|interview|sync)\b", re.IGNORECASE)

# Light role inference from observation text ("is a/the <role>", "works as <role>").
_ROLE_RE = re.compile(
    r"\b(?:is|works|serves|acts)\s+(?:a|an|the|as)\s+([a-z][a-z &/-]{2,40}?)(?:\.|,|;| at | for | of |$)",
    re.IGNORECASE,
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``BRAIN_CRM_DB`` before
    the first connection."""
    return os.environ.get("BRAIN_CRM_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _norm_name(person: Any) -> str:
    return " ".join(str(person or "").split()).strip()


def _key(name: str) -> str:
    return name.strip().lower()


# ── schema (idempotent) ─────────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS person (
    key            TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    mention_count  INTEGER NOT NULL DEFAULT 0,
    first_ts       INTEGER NOT NULL,
    last_ts        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS observation (
    id          TEXT PRIMARY KEY,
    person_key  TEXT NOT NULL,
    context     TEXT NOT NULL DEFAULT '',
    source      TEXT,
    confidence  REAL NOT NULL DEFAULT 0.6,
    ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_obs_person ON observation (person_key);
CREATE INDEX IF NOT EXISTS ix_obs_ts ON observation (ts);
"""


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create tables/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── observation confidence + idempotency ────────────────────────────────────────────
def _confidence_for(source: Optional[str], context: str) -> float:
    """A transparent, heuristic confidence for one observation.

    Higher when the observation is sourced (we know where it came from) and from
    a high-signal interaction (a meeting/call). Never raises; clamped to [0,1]."""
    try:
        conf = 0.5
        s = str(source or "")
        if s.strip():
            conf += 0.15
        if _MEETING_RE.search(s) or _MEETING_RE.search(str(context or "")):
            conf += 0.2
        if len(str(context or "").split()) >= 6:
            conf += 0.1
        return max(0.0, min(1.0, round(conf, 3)))
    except Exception:  # noqa: BLE001
        return 0.5


def _obs_id(person_key: str, context: str, source: Optional[str]) -> str:
    """Deterministic observation id so re-recording the exact same observation
    (same person + context + source) is idempotent rather than duplicated."""
    raw = f"crm|{person_key}|{str(context or '').strip().lower()}|{str(source or '').strip().lower()}"
    return uuid.uuid5(uuid.NAMESPACE_URL, raw).hex


def mention(
    person: str,
    context: str,
    source: Optional[str] = None,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Record an observation about ``person`` and (idempotently) bump their
    mention_count.

    ``context`` is the free-text thing you learned/observed; ``source`` is where
    it came from (e.g. ``"meeting 2026-06-04"``, ``"email"``, a note title). Re-
    recording the identical (person, context, source) is a no-op on the count.

    Returns ``{ok, person, mention_count, observation_id, new}``. Never raises."""
    name = _norm_name(person)
    if not name:
        return {"ok": False, "person": "", "mention_count": 0, "new": False,
                "error": "empty person"}
    ctx = str(context or "").strip()
    key = _key(name)
    oid = _obs_id(key, ctx, source)
    conf = _confidence_for(source, ctx)
    now = _now_ms()
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            existing = conn.execute(
                "SELECT 1 FROM observation WHERE id=?", (oid,)
            ).fetchone()
            is_new = existing is None
            if is_new:
                conn.execute(
                    """
                    INSERT INTO observation (id, person_key, context, source, confidence, ts)
                    VALUES (?,?,?,?,?,?)
                    """,
                    (oid, key, ctx, (str(source) if source is not None else None), conf, now),
                )
            # upsert the person row; only bump the count for a genuinely new obs.
            row = conn.execute("SELECT * FROM person WHERE key=?", (key,)).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO person (key, name, mention_count, first_ts, last_ts) VALUES (?,?,?,?,?)",
                    (key, name, 1 if is_new else 0, now, now),
                )
            else:
                conn.execute(
                    "UPDATE person SET name=?, mention_count=mention_count+?, last_ts=? WHERE key=?",
                    (name, 1 if is_new else 0, now, key),
                )
            conn.commit()
            cnt_row = conn.execute(
                "SELECT mention_count FROM person WHERE key=?", (key,)
            ).fetchone()
            count = int(cnt_row["mention_count"]) if cnt_row else 0
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return {"ok": False, "person": name, "mention_count": 0, "new": False,
                "error": "store error"}

    return {"ok": True, "person": name, "mention_count": count,
            "observation_id": oid, "new": is_new}


# ── tier determination ──────────────────────────────────────────────────────────────
def _tier(count: int, has_meeting: bool) -> str:
    if has_meeting or count >= _TIER_FULL:
        return "full"
    if count >= _TIER_MODERATE:
        return "moderate"
    return "stub"


def _infer_role(observations: list[dict]) -> Optional[str]:
    """Best-effort role inference from observation contexts. Returns None if no
    role-shaped phrase is found. Transparent + heuristic; never raises."""
    for obs in observations:
        try:
            m = _ROLE_RE.search(str(obs.get("context") or ""))
            if m:
                role = " ".join(m.group(1).split()).strip(" .,;")
                if role:
                    return role
        except Exception:  # noqa: BLE001
            continue
    return None


def _citations(observations: list[dict]) -> list[dict]:
    """Structured source citations for a profile — one per observation, with the
    observed text, where it came from, its confidence and when."""
    cites: list[dict] = []
    for i, obs in enumerate(observations, 1):
        cites.append(
            {
                "ref": i,
                "observation_id": obs.get("id"),
                "context": obs.get("context"),
                "source": obs.get("source") or "(unsourced)",
                "confidence": obs.get("confidence"),
                "ts": obs.get("ts"),
            }
        )
    return cites


def _read_observations(key: str, db_path: Optional[str]) -> list[dict]:
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT id, context, source, confidence, ts FROM observation "
                "WHERE person_key=? ORDER BY ts ASC",
                (key,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def _mirror_person_note(name: str, body_md: str, confidence: float) -> Optional[str]:
    """Upsert a ``kind=entity`` person note into the vault. Returns the note id or
    None. Degrades silently if the second-brain import failed / errors."""
    if sb is None:
        return None
    try:
        note = sb.upsert_note(
            "entity",
            name,
            body_md,
            frontmatter={"crm": True, "role": "person"},
            confidence=confidence,
        )
        return note.get("id") if isinstance(note, dict) else None
    except Exception:  # noqa: BLE001
        return None


def _assemble_body(name: str, tier: str, role: Optional[str], observations: list[dict],
                   cites: list[dict]) -> str:
    """Render the tiered, citation-tagged markdown profile body. Deeper tiers add
    sections; every claim references its observation by [n]."""
    lines: list[str] = [f"# {name}"]
    role_line = role or "unknown"
    one_liner = observations[-1]["context"] if observations else ""

    # stub: name + role + one-line summary (always present)
    lines.append("")
    lines.append(f"**Role:** {role_line}")
    if one_liner:
        lines.append(f"**Summary:** {one_liner} [1]" if cites else f"**Summary:** {one_liner}")

    if tier in ("moderate", "full"):
        lines.append("")
        lines.append("## Snapshot")
        lines.append(f"- Known via {len(observations)} observation(s).")
        # working style + strengths: surface high-confidence observations.
        strong = sorted(observations, key=lambda o: -float(o.get("confidence") or 0))[:3]
        if strong:
            lines.append("")
            lines.append("## Working style / strengths")
            for obs in strong:
                ref = next((c["ref"] for c in cites if c["observation_id"] == obs["id"]), "")
                lines.append(f"- {obs.get('context')} [{ref}]")

    if tier == "full":
        lines.append("")
        lines.append("## Complete dossier")
        for c in cites:
            src = c["source"]
            lines.append(f"- [{c['ref']}] {c['context']} — *source:* {src} "
                         f"(confidence {c['confidence']})")

    # always append a Sources section so citations are explicit.
    if cites:
        lines.append("")
        lines.append("## Sources")
        for c in cites:
            lines.append(f"- [{c['ref']}] {c['source']} ({c['confidence']})")
    return "\n".join(lines) + "\n"


def profile(person: str, *, db_path: Optional[str] = None) -> dict:
    """Assemble a tiered, source-cited profile for ``person`` from their recorded
    observations, and mirror it into the vault as a ``kind=entity`` note.

    Returns ``{ok, person, tier, mention_count, role, confidence, summary,
    citations, body_md, note_id, observations}``. Honest empty (tier ``"none"``)
    when the person has no observations. Never raises."""
    name = _norm_name(person)
    empty = {"ok": False, "person": name, "tier": "none", "mention_count": 0,
             "role": None, "confidence": 0.0, "summary": "", "citations": [],
             "body_md": "", "note_id": None, "observations": []}
    if not name:
        return empty
    key = _key(name)
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            prow = conn.execute("SELECT * FROM person WHERE key=?", (key,)).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return empty
    if prow is None:
        return empty

    observations = _read_observations(key, db_path)
    count = int(prow["mention_count"]) if prow["mention_count"] is not None else len(observations)
    has_meeting = any(
        _MEETING_RE.search(str(o.get("source") or "")) or _MEETING_RE.search(str(o.get("context") or ""))
        for o in observations
    )
    tier = _tier(count, has_meeting)
    role = _infer_role(observations)
    cites = _citations(observations)
    confs = [float(o.get("confidence") or 0) for o in observations]
    confidence = round(sum(confs) / len(confs), 3) if confs else 0.0
    summary = observations[-1]["context"] if observations else ""

    body_md = _assemble_body(name, tier, role, observations, cites)
    note_id = _mirror_person_note(name, body_md, confidence)

    return {
        "ok": True,
        "person": name,
        "tier": tier,
        "mention_count": count,
        "role": role,
        "confidence": confidence,
        "summary": summary,
        "citations": cites,
        "body_md": body_md,
        "note_id": note_id,
        "observations": observations,
    }


def people(*, db_path: Optional[str] = None) -> list[dict]:
    """The roster: ``[{person, tier, mention_count}, ...]`` ordered by mention
    count (most-known first). Never raises; empty store → []."""
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            prows = conn.execute(
                "SELECT key, name, mention_count FROM person ORDER BY mention_count DESC, name ASC"
            ).fetchall()
            out: list[dict] = []
            for r in prows:
                key = r["key"]
                count = int(r["mention_count"] or 0)
                obs = conn.execute(
                    "SELECT source, context FROM observation WHERE person_key=?", (key,)
                ).fetchall()
                has_meeting = any(
                    _MEETING_RE.search(str(o["source"] or "")) or _MEETING_RE.search(str(o["context"] or ""))
                    for o in obs
                )
                out.append({"person": r["name"], "tier": _tier(count, has_meeting),
                            "mention_count": count})
            return out
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
