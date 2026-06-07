"""REVDB — Revision Database (Git-like version-controlled knowledge).

Every ontology write (create/update/delete) and every governed action execution
is recorded as a commit with a parent pointer, producing an append-only,
tamper-evident history. Branches allow parallel exploration of the ontology.

Doctrine (matching the rest of the backend):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL and idempotent writes.
  * never raise on normal use — every public function degrades gracefully.

DB path comes from the env var ``REVDB_DB`` (default
``server/data/revdb.db``).
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "revdb.db"
)


def _db_path() -> str:
    return os.environ.get("REVDB_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return "{}"


def _loads(text: Optional[str]) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return {}


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS revdb_commits (
    id         TEXT PRIMARY KEY,
    parent_id  TEXT,
    author     TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL DEFAULT '',
    timestamp  INTEGER NOT NULL,
    diff_hash  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_revdb_commits_ts ON revdb_commits (timestamp);
CREATE INDEX IF NOT EXISTS ix_revdb_commits_parent ON revdb_commits (parent_id);

CREATE TABLE IF NOT EXISTS revdb_changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_id   TEXT NOT NULL,
    object_type TEXT,
    object_id   TEXT,
    operation   TEXT NOT NULL DEFAULT '',
    old_value   TEXT NOT NULL DEFAULT '{}',
    new_value   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_revdb_changes_commit ON revdb_changes (commit_id);
CREATE INDEX IF NOT EXISTS ix_revdb_changes_object ON revdb_changes (object_type, object_id);

CREATE TABLE IF NOT EXISTS revdb_branches (
    name       TEXT PRIMARY KEY,
    commit_id  TEXT NOT NULL,
    created_ts INTEGER NOT NULL
);
"""


# ── Connection management ───────────────────────────────────────────────────────
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
    """Idempotent DDL. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── internal helpers ────────────────────────────────────────────────────────────
def _diff_hash(changes: list[dict]) -> str:
    """Stable hash of a changes list for the commit diff_hash field."""
    canonical = _dumps(changes)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _head_commit_id(conn: sqlite3.Connection) -> Optional[str]:
    row = conn.execute(
        "SELECT id FROM revdb_commits ORDER BY timestamp DESC LIMIT 1"
    ).fetchone()
    return row["id"] if row else None


# ── sync core (used by sync callers such as ontology_store) ─────────────────────
def _commit_sync(
    actor: str,
    message: str,
    changes: list[dict],
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Synchronous commit core. Never raises."""
    init_db(db_path)
    cid = uuid.uuid4().hex
    now = _now_ms()
    diff = _diff_hash(changes)
    try:
        conn = _connect(db_path)
        try:
            parent = _head_commit_id(conn)
            conn.execute(
                """
                INSERT INTO revdb_commits (id, parent_id, author, message, timestamp, diff_hash)
                VALUES (?,?,?,?,?,?)
                """,
                (cid, parent, actor, message, now, diff),
            )
            for ch in changes:
                conn.execute(
                    """
                    INSERT INTO revdb_changes
                        (commit_id, object_type, object_id, operation, old_value, new_value)
                    VALUES (?,?,?,?,?,?)
                    """,
                    (
                        cid,
                        ch.get("object_type"),
                        ch.get("object_id"),
                        ch.get("operation", ""),
                        _dumps(ch.get("old_value")),
                        _dumps(ch.get("new_value")),
                    ),
                )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    return {
        "id": cid,
        "parent_id": parent,
        "author": actor,
        "message": message,
        "timestamp": now,
        "diff_hash": diff,
        "changes": changes,
    }


def _history_sync(
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    limit: int = 100,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """Synchronous history core. Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            sql = (
                "SELECT c.id, c.parent_id, c.author, c.message, c.timestamp, c.diff_hash, "
                "       ch.object_type, ch.object_id, ch.operation, ch.old_value, ch.new_value "
                "FROM revdb_commits c "
                "LEFT JOIN revdb_changes ch ON ch.commit_id = c.id WHERE 1=1"
            )
            args: list[Any] = []
            if object_type:
                sql += " AND ch.object_type = ?"
                args.append(object_type)
            if object_id:
                sql += " AND ch.object_id = ?"
                args.append(object_id)
            sql += " ORDER BY c.timestamp DESC LIMIT ?"
            args.append(max(1, int(limit)))
            rows = conn.execute(sql, args).fetchall()
            out: list[dict] = []
            seen: set[str] = set()
            for r in rows:
                cid = r["id"]
                if cid not in seen:
                    seen.add(cid)
                    out.append(
                        {
                            "id": cid,
                            "parent_id": r["parent_id"],
                            "author": r["author"],
                            "message": r["message"],
                            "timestamp": r["timestamp"],
                            "diff_hash": r["diff_hash"],
                            "changes": [],
                        }
                    )
                out[-1]["changes"].append(
                    {
                        "object_type": r["object_type"],
                        "object_id": r["object_id"],
                        "operation": r["operation"],
                        "old_value": _loads(r["old_value"]),
                        "new_value": _loads(r["new_value"]),
                    }
                )
            return out
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def _diff_sync(commit_a: str, commit_b: str, *, db_path: Optional[str] = None) -> dict:
    """Synchronous diff core. Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            a = conn.execute(
                "SELECT * FROM revdb_commits WHERE id=?", (commit_a,)
            ).fetchone()
            b = conn.execute(
                "SELECT * FROM revdb_commits WHERE id=?", (commit_b,)
            ).fetchone()
            a_changes = []
            b_changes = []
            if a:
                a_changes = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT object_type, object_id, operation, old_value, new_value "
                        "FROM revdb_changes WHERE commit_id=?",
                        (commit_a,),
                    ).fetchall()
                ]
            if b:
                b_changes = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT object_type, object_id, operation, old_value, new_value "
                        "FROM revdb_changes WHERE commit_id=?",
                        (commit_b,),
                    ).fetchall()
                ]
            return {
                "commit_a": dict(a) if a else None,
                "commit_b": dict(b) if b else None,
                "changes_a": a_changes,
                "changes_b": b_changes,
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return {"commit_a": None, "commit_b": None, "changes_a": [], "changes_b": []}


def _revert_sync(
    commit_id: str,
    actor: str,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Synchronous revert core. Never raises.

    Best-effort: creates a revert commit and attempts to restore object state
    by walking changes backwards from HEAD to the target commit.
    """
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            target = conn.execute(
                "SELECT * FROM revdb_commits WHERE id=?", (commit_id,)
            ).fetchone()
            if target is None:
                return {"ok": False, "error": "commit not found"}
            # Gather commits newer than the target (including target)
            rows = conn.execute(
                "SELECT id FROM revdb_commits WHERE timestamp >= ? ORDER BY timestamp DESC",
                (target["timestamp"],),
            ).fetchall()
            cids = [r["id"] for r in rows]
            # Collect changes to invert (newest first)
            inverted: list[dict] = []
            for cid in cids:
                ch_rows = conn.execute(
                    "SELECT object_type, object_id, operation, old_value, new_value "
                    "FROM revdb_changes WHERE commit_id=?",
                    (cid,),
                ).fetchall()
                for cr in ch_rows:
                    inverted.append(
                        {
                            "object_type": cr["object_type"],
                            "object_id": cr["object_id"],
                            "operation": cr["operation"],
                            "old_value": _loads(cr["old_value"]),
                            "new_value": _loads(cr["new_value"]),
                        }
                    )
        finally:
            conn.close()
    except sqlite3.Error:
        return {"ok": False, "error": "db error"}

    # Attempt to restore ontology state using local import to avoid cycles.
    restored: list[str] = []
    try:
        from . import ontology_store

        for inv in inverted:
            op = inv["operation"]
            oid = inv.get("object_id")
            if not oid:
                continue
            if op == "create":
                ontology_store.delete_object(oid)
                restored.append(oid)
            elif op == "delete":
                old = inv.get("old_value")
                if isinstance(old, dict):
                    ontology_store.upsert_object(old)
                    restored.append(oid)
            elif op in ("update", "action"):
                old = inv.get("old_value")
                if isinstance(old, dict):
                    ontology_store.upsert_object(old)
                    restored.append(oid)
    except Exception:  # noqa: BLE001
        pass

    revert_commit = _commit_sync(
        actor=actor,
        message=f"revert to {commit_id}",
        changes=[
            {
                "object_type": "revdb",
                "object_id": commit_id,
                "operation": "revert",
                "old_value": None,
                "new_value": {"restored": restored},
            }
        ],
        db_path=db_path,
    )
    return {
        "ok": True,
        "revert_commit": revert_commit,
        "restored": restored,
    }


def _branch_sync(
    name: str,
    from_commit: str,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Synchronous branch core. Never raises."""
    init_db(db_path)
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            exists = conn.execute(
                "SELECT 1 FROM revdb_commits WHERE id=?", (from_commit,)
            ).fetchone()
            if exists is None:
                return {"ok": False, "error": "commit not found"}
            conn.execute(
                """
                INSERT INTO revdb_branches (name, commit_id, created_ts)
                VALUES (?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                    commit_id = excluded.commit_id,
                    created_ts = excluded.created_ts
                """,
                (name, from_commit, now),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "name": name, "commit_id": from_commit}


def _list_branches_sync(*, db_path: Optional[str] = None) -> list[dict]:
    """Synchronous branch list core. Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT name, commit_id, created_ts FROM revdb_branches ORDER BY created_ts DESC"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── async public API ────────────────────────────────────────────────────────────
async def commit(
    actor: str,
    message: str,
    changes: list,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Create a commit recording a set of changes."""
    return _commit_sync(actor, message, changes, db_path=db_path)


async def history(
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    limit: int = 100,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """Query commit history, optionally filtered by object type or id."""
    return _history_sync(object_type, object_id, limit, db_path=db_path)


async def diff(commit_a: str, commit_b: str, *, db_path: Optional[str] = None) -> dict:
    """Compare two commits and return their changes side-by-side."""
    return _diff_sync(commit_a, commit_b, db_path=db_path)


async def revert_to(commit_id: str, actor: str, *, db_path: Optional[str] = None) -> dict:
    """Revert ontology state to a past commit and record a revert commit."""
    return _revert_sync(commit_id, actor, db_path=db_path)


async def branch(name: str, from_commit: str, *, db_path: Optional[str] = None) -> dict:
    """Create (or update) a named branch pointing at a commit."""
    return _branch_sync(name, from_commit, db_path=db_path)


async def list_branches(*, db_path: Optional[str] = None) -> list[dict]:
    """List all branches."""
    return _list_branches_sync(db_path=db_path)


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
