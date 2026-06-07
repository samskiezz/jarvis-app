"""WORKSHOP MODELS — persistent app definitions for the Workshop builder.

A SQLite-backed store (stdlib ``sqlite3``, no ORM) for user-created Workshop apps:
  * ``workshop_apps`` — app definition (name, owner, layout JSON, publish flag).

Design rules:
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``).
  * never raise on normal use — every public function degrades gracefully.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "workshop.db"
)


def _db_path() -> str:
    return os.environ.get("WORKSHOP_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, default=str)
    except (TypeError, ValueError):
        return "{}"


def _loads(text: Optional[str]) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return {}


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
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass
    return conn


_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS workshop_apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT,
    layout_json TEXT NOT NULL DEFAULT '{}',
    is_published INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);
"""


def _ensure_schema(conn: sqlite3.Connection):
    conn.executescript(_SCHEMA_SQL)
    conn.commit()


def init_db(db_path: Optional[str] = None):
    try:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
        finally:
            conn.close()
    except Exception:
        pass


def create_app(name: str, owner_id: Optional[str] = None,
               layout: Optional[dict] = None,
               db_path: Optional[str] = None) -> dict:
    init_db(db_path)
    app_id = str(uuid.uuid4())
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            conn.execute(
                "INSERT INTO workshop_apps (id, name, owner_id, layout_json, is_published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (app_id, name, owner_id, _dumps(layout), 0, now, now)
            )
            conn.commit()
            return {
                "id": app_id,
                "name": name,
                "owner_id": owner_id,
                "layout": layout or {},
                "is_published": False,
                "created_at": now,
                "updated_at": now,
            }
        finally:
            conn.close()
    except Exception:
        return {"error": "Failed to create app"}


def list_apps(owner_id: Optional[str] = None,
              include_published: bool = True,
              db_path: Optional[str] = None) -> list[dict]:
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            if owner_id is not None:
                if include_published:
                    rows = conn.execute(
                        "SELECT * FROM workshop_apps WHERE owner_id = ? OR is_published = 1 ORDER BY updated_at DESC",
                        (owner_id,)
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM workshop_apps WHERE owner_id = ? ORDER BY updated_at DESC",
                        (owner_id,)
                    ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM workshop_apps ORDER BY updated_at DESC"
                ).fetchall()
            return [_row_to_dict(r) for r in rows]
        finally:
            conn.close()
    except Exception:
        return []


def get_app(app_id: str, db_path: Optional[str] = None) -> Optional[dict]:
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            row = conn.execute(
                "SELECT * FROM workshop_apps WHERE id = ?", (app_id,)
            ).fetchone()
            if not row:
                return None
            return _row_to_dict(row)
        finally:
            conn.close()
    except Exception:
        return None


def update_app(app_id: str,
               name: Optional[str] = None,
               layout: Optional[dict] = None,
               db_path: Optional[str] = None) -> Optional[dict]:
    init_db(db_path)
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            existing = conn.execute(
                "SELECT * FROM workshop_apps WHERE id = ?", (app_id,)
            ).fetchone()
            if not existing:
                return None
            updates = []
            params = []
            if name is not None:
                updates.append("name = ?")
                params.append(name)
            if layout is not None:
                updates.append("layout_json = ?")
                params.append(_dumps(layout))
            updates.append("updated_at = ?")
            params.append(now)
            params.append(app_id)
            conn.execute(
                f"UPDATE workshop_apps SET {', '.join(updates)} WHERE id = ?",
                params
            )
            conn.commit()
            return get_app(app_id, db_path)
        finally:
            conn.close()
    except Exception:
        return None


def delete_app(app_id: str, db_path: Optional[str] = None) -> bool:
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            cur = conn.execute("DELETE FROM workshop_apps WHERE id = ?", (app_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except Exception:
        return False


def publish_app(app_id: str, db_path: Optional[str] = None) -> Optional[dict]:
    init_db(db_path)
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            cur = conn.execute(
                "UPDATE workshop_apps SET is_published = 1, updated_at = ? WHERE id = ?",
                (now, app_id)
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
            return get_app(app_id, db_path)
        finally:
            conn.close()
    except Exception:
        return None


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "owner_id": row["owner_id"],
        "layout": _loads(row["layout_json"]),
        "is_published": bool(row["is_published"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
