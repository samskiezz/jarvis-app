"""AUDIT — hash-chained, append-only, tamper-evident audit log (Gotham governance).

A SQLite-backed (stdlib ``sqlite3``) ledger of *who did what to which resource*.
Every row carries the hash of the previous row, and its own
``hash = sha256(prev_hash + canonical_payload)``. Because each link depends on
the one before it (like a KGIKLedger / blockchain), mutating any historical row
breaks the chain from that point on — which :func:`verify_chain` detects.

Doctrine (matching the rest of the backend): stdlib only, never raise — every
public function degrades gracefully and returns a safe value on error.

DB path comes from the env var ``AUDIT_DB`` (default ``server/data/audit.db``).
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
from typing import Any, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "audit.db"
)

# The genesis prev_hash for the first row in the chain.
GENESIS = "0" * 64


def _db_path() -> str:
    return os.environ.get("AUDIT_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    actor     TEXT    NOT NULL,
    action    TEXT    NOT NULL,
    resource  TEXT    NOT NULL DEFAULT '',
    detail    TEXT    NOT NULL DEFAULT '{}',
    prev_hash TEXT    NOT NULL,
    hash      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log (ts);
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
    """Create the audit_log table/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── hashing ──────────────────────────────────────────────────────────────────────
def _canonical(ts: int, actor: str, action: str, resource: str, detail_json: str) -> str:
    """Stable string form of a row's content (excluding its own hash). Order and
    separators are fixed so the same content always hashes identically."""
    return "|".join((str(ts), actor, action, resource, detail_json))


def _row_hash(prev_hash: str, ts: int, actor: str, action: str, resource: str, detail_json: str) -> str:
    """``sha256(prev_hash + canonical_payload)`` — the chain link for one row."""
    payload = prev_hash + _canonical(ts, actor, action, resource, detail_json)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _dump_detail(detail: Any) -> str:
    try:
        return json.dumps(detail if detail is not None else {}, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return "{}"


# ── append ───────────────────────────────────────────────────────────────────────
def record(
    actor: Any,
    action: Any,
    resource: Any = "",
    detail: Any = None,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Append one tamper-evident entry to the audit chain.

    Returns the stored entry dict (incl. ``id``, ``prev_hash``, ``hash``) or
    ``None`` on error. Fire-and-forget friendly — never raises.
    """
    actor_s = str(actor) if actor is not None else "anonymous"
    action_s = str(action) if action is not None else "unknown"
    resource_s = str(resource) if resource is not None else ""
    detail_json = _dump_detail(detail)
    ts = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1"
            ).fetchone()
            prev_hash = row["hash"] if row else GENESIS
            h = _row_hash(prev_hash, ts, actor_s, action_s, resource_s, detail_json)
            cur = conn.execute(
                """
                INSERT INTO audit_log (ts, actor, action, resource, detail, prev_hash, hash)
                VALUES (?,?,?,?,?,?,?)
                """,
                (ts, actor_s, action_s, resource_s, detail_json, prev_hash, h),
            )
            conn.commit()
            return {
                "id": int(cur.lastrowid),
                "ts": ts,
                "actor": actor_s,
                "action": action_s,
                "resource": resource_s,
                "detail": detail_json,
                "prev_hash": prev_hash,
                "hash": h,
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None


# ── verify ───────────────────────────────────────────────────────────────────────
def verify_chain(db_path: Optional[str] = None) -> dict:
    """Recompute the hash chain and check it end-to-end.

    Returns ``{"ok": bool, "length": int, "broken_at": id|None}``. The chain is
    valid when every row's ``prev_hash`` matches the previous row's ``hash`` and
    every row's ``hash`` equals the recomputed hash of its content. An empty log
    is valid. Never raises.
    """
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT id, ts, actor, action, resource, detail, prev_hash, hash "
                "FROM audit_log ORDER BY id ASC"
            ).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return {"ok": False, "length": 0, "broken_at": None}

    prev = GENESIS
    n = 0
    for r in rows:
        n += 1
        # Chain linkage: this row must point at the previous row's hash.
        if r["prev_hash"] != prev:
            return {"ok": False, "length": len(rows), "broken_at": int(r["id"])}
        # Content integrity: recompute the hash from the stored content.
        expected = _row_hash(
            r["prev_hash"], r["ts"], r["actor"], r["action"], r["resource"], r["detail"]
        )
        if expected != r["hash"]:
            return {"ok": False, "length": len(rows), "broken_at": int(r["id"])}
        prev = r["hash"]
    return {"ok": True, "length": n, "broken_at": None}


# ── read ─────────────────────────────────────────────────────────────────────────
def tail(n: int = 50, db_path: Optional[str] = None) -> list[dict]:
    """Return the most recent ``n`` entries, newest first. Never raises."""
    try:
        limit = max(1, int(n))
    except (TypeError, ValueError):
        limit = 50
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT id, ts, actor, action, resource, detail, prev_hash, hash "
                "FROM audit_log ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# Bootstrap the default DB on import so the first record/verify finds the table.
init_db()
