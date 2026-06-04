"""COLLABORATION — notes / comments / activity feed + @mentions (Gotham ops).

A SQLite-backed (stdlib ``sqlite3``, no ORM) collaboration layer that lets any
resource in the system — an object (ontology entity), a case, a graph, a
dataset, etc. — carry a thread of human notes / comments, and surfaces a unified
ACTIVITY feed across them (best-effort enriched with the audit hash-chain log).

Core ideas:
  * **notes** — a note/comment is attachable to any ``(resource_type, resource_id)``
    pair. ``add_note`` / ``list_notes`` / ``edit_note`` / ``delete_note`` are the
    CRUD surface. Each note records its author, body, created/edited timestamps,
    a soft ``deleted`` flag, and the parsed ``mentions``.
  * **mentions** — ``@entity`` tokens in a note body are parsed out and, where the
    token matches a known ontology object id, linked to that ontology entity. The
    parsed ids are stored (JSON) on the note so the feed/UI can render links.
  * **activity** — ``activity(limit)`` returns a unified, newest-first feed built
    from notes plus (best-effort) the tamper-evident audit log
    (``server/services/audit.py``), so "who did what" and "who said what" appear
    together.

Doctrine (mirrors history_lake.py / cases.py / audit.py):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL; never raise on normal use — every public function degrades
    gracefully and returns a safe empty/None value on error.

DB path comes from env ``COLLAB_DB`` (default ``server/data/collab.db``). Tests
pass an explicit temp path via the env var.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from typing import Any, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "collab.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``COLLAB_DB`` before the
    first connection."""
    return os.environ.get("COLLAB_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS note (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type  TEXT    NOT NULL,
    resource_id    TEXT    NOT NULL,
    author         TEXT    NOT NULL,
    body           TEXT    NOT NULL DEFAULT '',
    mentions_json  TEXT    NOT NULL DEFAULT '[]',
    created_ts     INTEGER NOT NULL,
    edited_ts      INTEGER,
    deleted        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_note_resource ON note (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS ix_note_created  ON note (created_ts);
"""


# ── Connection management ────────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection (WAL where possible). Mirrors history_lake/cases."""
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
    """Create the note table/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── mentions ──────────────────────────────────────────────────────────────────────
# An @mention token: '@' followed by a word-ish id (letters/digits/_-./), which
# covers ontology object ids ('sam', 'pangani'), dataset names ('csv:abcd1234'),
# and similar. Trailing punctuation is naturally excluded by the char class.
_MENTION_RE = re.compile(r"(?<![\w@])@([A-Za-z0-9][\w\-./:]*)")


def _ontology_ids() -> set[str]:
    """Best-effort set of known ontology object ids (for linking @mentions).

    Returns an empty set if the ontology module is unavailable, so mention
    parsing still works (it simply won't mark tokens as ``linked``)."""
    try:
        from ..data import ontology  # type: ignore

        return {str(o.get("id")) for o in getattr(ontology, "OBJECTS", []) if o.get("id")}
    except Exception:  # noqa: BLE001 - ontology must never break note handling
        return set()


def parse_mentions(body: str) -> list[dict]:
    """Parse ``@entity`` tokens from a note body.

    Returns a deduped (order-preserved) list of ``{"id": str, "linked": bool}``
    where ``linked`` is True when the id matches a known ontology object id.
    Never raises."""
    if not body:
        return []
    try:
        tokens = _MENTION_RE.findall(str(body))
    except Exception:  # noqa: BLE001
        return []
    known = _ontology_ids()
    out: list[dict] = []
    seen: set[str] = set()
    for tok in tokens:
        if tok in seen:
            continue
        seen.add(tok)
        out.append({"id": tok, "linked": tok in known})
    return out


# Backwards/alias-friendly name (deliverable refers to it as ``mentions``).
def mentions(body: str) -> list[dict]:
    """Alias for :func:`parse_mentions` — parse @entity ids from a note body."""
    return parse_mentions(body)


# ── row helpers ──────────────────────────────────────────────────────────────────
def _note_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["mentions"] = json.loads(d.pop("mentions_json", None) or "[]")
    except (TypeError, ValueError):
        d["mentions"] = []
    d["deleted"] = bool(d.get("deleted"))
    return d


def _load_raw(conn: sqlite3.Connection, note_id: int) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM note WHERE id=?", (int(note_id),)).fetchone()


# ── CRUD ─────────────────────────────────────────────────────────────────────────
def add_note(
    resource_type: str,
    resource_id: str,
    author: str,
    body: str,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Attach a note/comment to a resource ``(resource_type, resource_id)``.

    Parses @mentions from ``body`` and stores them on the note. Returns the
    created note dict (with ``id``, ``mentions``) or ``None`` on error."""
    rtype = str(resource_type or "").strip() or "unknown"
    rid = str(resource_id or "").strip()
    who = str(author or "anonymous")
    text = str(body or "")
    parsed = parse_mentions(text)
    try:
        mentions_json = json.dumps(parsed, default=str)
    except (TypeError, ValueError):
        mentions_json = "[]"
    ts = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                """
                INSERT INTO note
                    (resource_type, resource_id, author, body, mentions_json,
                     created_ts, edited_ts, deleted)
                VALUES (?,?,?,?,?,?,?,0)
                """,
                (rtype, rid, who, text, mentions_json, ts, None),
            )
            conn.commit()
            return _note_to_dict(_load_raw(conn, int(cur.lastrowid)))
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_notes(
    resource_type: str,
    resource_id: str,
    *,
    include_deleted: bool = False,
    db_path: Optional[str] = None,
) -> list[dict]:
    """List notes for a resource (oldest-first, thread order). Soft-deleted notes
    are hidden unless ``include_deleted=True``. Never raises."""
    rtype = str(resource_type or "")
    rid = str(resource_id or "")
    try:
        conn = _connect(db_path)
        try:
            q = "SELECT * FROM note WHERE resource_type=? AND resource_id=?"
            args: list[Any] = [rtype, rid]
            if not include_deleted:
                q += " AND deleted=0"
            q += " ORDER BY id ASC"
            rows = conn.execute(q, args).fetchall()
            return [_note_to_dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_note(note_id: int, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch a single note by id (or ``None``)."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, note_id)
            return _note_to_dict(row) if row else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def edit_note(
    note_id: int,
    body: str,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Edit a note's body (re-parsing @mentions, stamping ``edited_ts``). Returns
    the updated note, or ``None`` if it does not exist / is deleted / on error."""
    text = str(body or "")
    parsed = parse_mentions(text)
    try:
        mentions_json = json.dumps(parsed, default=str)
    except (TypeError, ValueError):
        mentions_json = "[]"
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, note_id)
            if row is None or row["deleted"]:
                return None
            conn.execute(
                "UPDATE note SET body=?, mentions_json=?, edited_ts=? WHERE id=?",
                (text, mentions_json, _now_ms(), int(note_id)),
            )
            conn.commit()
            return _note_to_dict(_load_raw(conn, note_id))
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def delete_note(note_id: int, *, db_path: Optional[str] = None) -> bool:
    """Soft-delete a note (sets ``deleted=1``, stamps ``edited_ts``). Returns True
    if a live note was deleted, False if it was missing / already deleted."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, note_id)
            if row is None or row["deleted"]:
                return False
            conn.execute(
                "UPDATE note SET deleted=1, edited_ts=? WHERE id=?",
                (_now_ms(), int(note_id)),
            )
            conn.commit()
            return True
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return False


# ── activity feed ─────────────────────────────────────────────────────────────────
def _note_activity(limit: int, db_path: Optional[str] = None) -> list[dict]:
    """Recent (non-deleted) notes as activity items (newest-first)."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM note WHERE deleted=0 ORDER BY id DESC LIMIT ?",
                (int(limit),),
            ).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return []
    items: list[dict] = []
    for r in rows:
        n = _note_to_dict(r)
        items.append(
            {
                "kind": "note",
                "ts": n.get("created_ts"),
                "actor": n.get("author"),
                "action": "note.added",
                "resource_type": n.get("resource_type"),
                "resource_id": n.get("resource_id"),
                "body": n.get("body"),
                "mentions": n.get("mentions", []),
                "note_id": n.get("id"),
            }
        )
    return items


def _audit_activity(limit: int) -> list[dict]:
    """Best-effort recent audit-log entries as activity items. Never raises and
    returns ``[]`` if the audit module / table is unavailable."""
    try:
        from . import audit  # type: ignore

        rows = audit.tail(limit)
    except Exception:  # noqa: BLE001 - audit is an optional enrichment
        return []
    items: list[dict] = []
    for r in rows or []:
        try:
            items.append(
                {
                    "kind": "audit",
                    "ts": r.get("ts"),
                    "actor": r.get("actor"),
                    "action": r.get("action"),
                    "resource_type": "audit",
                    "resource_id": r.get("resource"),
                    "audit_id": r.get("id"),
                }
            )
        except Exception:  # noqa: BLE001
            continue
    return items


def activity(limit: int = 50, *, db_path: Optional[str] = None) -> list[dict]:
    """Unified activity feed: notes + (best-effort) audit-log entries, merged and
    sorted newest-first, capped to ``limit`` items. Never raises."""
    try:
        n = max(1, int(limit))
    except (TypeError, ValueError):
        n = 50
    merged = _note_activity(n, db_path=db_path) + _audit_activity(n)
    merged.sort(key=lambda it: it.get("ts") or 0, reverse=True)
    return merged[:n]


# Bootstrap the default DB on import so the first request finds the table.
init_db()
