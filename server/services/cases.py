"""CASE MANAGEMENT — investigation case files (Gotham-style ops).

A SQLite-backed (stdlib ``sqlite3``, no ORM) store of investigation cases. Each
case has a title/status, an append-only note log, and a set of attached entity
ids (referencing the ontology in ``server/data/ontology.py``).

Table (idempotent DDL):
  * ``case`` — (id, title, status, created_ts, notes_json, entity_ids_json).

``notes_json`` is a JSON list of ``{"ts": epoch_ms, "by": str, "text": str}``.
``entity_ids_json`` is a JSON list of entity-id strings (deduped, order-preserved).

Design doctrine (mirrors history_lake.py / alerts.py):
  * stdlib ``sqlite3`` only.
  * idempotent DDL; never raise on normal use.

DB path comes from env ``OPS_DB`` (default ``server/data/ops.db``) — the same DB
as the alerts engine. Tests pass an explicit temp path via the env var.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any, Optional

# ── DB location (shared with alerts.py) ─────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ops.db"
)


def _db_path() -> str:
    return os.environ.get("OPS_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS "case" (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'open',
    created_ts      INTEGER NOT NULL,
    notes_json      TEXT    NOT NULL DEFAULT '[]',
    entity_ids_json TEXT    NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS ix_case_status ON "case" (status);
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
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create the case table if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── helpers ──────────────────────────────────────────────────────────────────────
def _case_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["notes"] = json.loads(d.pop("notes_json", None) or "[]")
    except (TypeError, ValueError):
        d["notes"] = []
    try:
        d["entity_ids"] = json.loads(d.pop("entity_ids_json", None) or "[]")
    except (TypeError, ValueError):
        d["entity_ids"] = []
    return d


def _load_raw(conn: sqlite3.Connection, case_id: int) -> Optional[sqlite3.Row]:
    return conn.execute('SELECT * FROM "case" WHERE id=?', (int(case_id),)).fetchone()


# ── CRUD ─────────────────────────────────────────────────────────────────────────
def create_case(
    title: str,
    *,
    status: str = "open",
    entity_ids: Optional[list[str]] = None,
    db_path: Optional[str] = None,
) -> Optional[int]:
    """Create a new investigation case. Returns the new case id or ``None``."""
    ids: list[str] = []
    for e in entity_ids or []:
        s = str(e)
        if s not in ids:
            ids.append(s)
    try:
        ids_json = json.dumps(ids)
    except (TypeError, ValueError):
        ids_json = "[]"
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                '''
                INSERT INTO "case" (title, status, created_ts, notes_json, entity_ids_json)
                VALUES (?,?,?,?,?)
                ''',
                (str(title or "case"), str(status or "open"), _now_ms(), "[]", ids_json),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_cases(status: Optional[str] = None, db_path: Optional[str] = None) -> list[dict]:
    """List cases (newest first), optionally filtered by ``status``."""
    try:
        conn = _connect(db_path)
        try:
            q = 'SELECT * FROM "case"'
            args: list[Any] = []
            if status is not None:
                q += " WHERE status = ?"
                args.append(status)
            q += " ORDER BY id DESC"
            rows = conn.execute(q, args).fetchall()
            return [_case_to_dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_case(case_id: int, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch a single case (with parsed notes + entity_ids), or ``None``."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, case_id)
            return _case_to_dict(row) if row else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def add_note(
    case_id: int,
    text: str,
    *,
    by: str = "system",
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Append a note to a case's note log. Returns the updated case, or ``None``
    if the case does not exist / on error."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, case_id)
            if row is None:
                return None
            try:
                notes = json.loads(row["notes_json"] or "[]")
                if not isinstance(notes, list):
                    notes = []
            except (TypeError, ValueError):
                notes = []
            notes.append({"ts": _now_ms(), "by": str(by or "system"), "text": str(text or "")})
            conn.execute(
                'UPDATE "case" SET notes_json=? WHERE id=?',
                (json.dumps(notes, default=str), int(case_id)),
            )
            conn.commit()
            return _case_to_dict(_load_raw(conn, case_id))
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def attach_entity(
    case_id: int,
    entity_id: str,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Attach an entity id to a case (deduped). Returns the updated case, or
    ``None`` if the case does not exist / on error."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, case_id)
            if row is None:
                return None
            try:
                ids = json.loads(row["entity_ids_json"] or "[]")
                if not isinstance(ids, list):
                    ids = []
            except (TypeError, ValueError):
                ids = []
            eid = str(entity_id)
            if eid not in [str(x) for x in ids]:
                ids.append(eid)
            conn.execute(
                'UPDATE "case" SET entity_ids_json=? WHERE id=?',
                (json.dumps(ids, default=str), int(case_id)),
            )
            conn.commit()
            return _case_to_dict(_load_raw(conn, case_id))
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def set_status(
    case_id: int,
    status: str,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Set a case's status (e.g. 'open' | 'investigating' | 'closed'). Returns
    the updated case, or ``None`` if the case does not exist / on error."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, case_id)
            if row is None:
                return None
            conn.execute(
                'UPDATE "case" SET status=? WHERE id=?',
                (str(status or "open"), int(case_id)),
            )
            conn.commit()
            return _case_to_dict(_load_raw(conn, case_id))
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


# Bootstrap the default DB on import.
init_db()
