"""SAVE / SHARE / ANNOTATE GRAPH INVESTIGATIONS (P5 #43).

A SQLite-backed (stdlib ``sqlite3``, no ORM) store for saved graph
investigations: a named case pins a set of seed object ids, carries free-text
notes, accumulates annotations (on a node / edge / the whole case), and can be
shared with other principals at a role. The *current* subgraph for a case is
resolved on read by reusing :func:`server.services.graph.subgraph` over the
saved seeds — investigations store the seeds, not a frozen graph, so a re-opened
case reflects the live ontology.

Design rules (mirrors ``ontology_store.py`` / ``history_lake.py``):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``).
  * never raise on normal use — every public function degrades to a safe value.

DB path comes from env ``INVESTIGATIONS_DB`` (default
``server/data/investigations.db``).
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

# graph reuse is best-effort so the store still works in a stripped environment.
try:
    from . import graph as _graph  # type: ignore
except Exception:  # noqa: BLE001
    _graph = None


# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "investigations.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``INVESTIGATIONS_DB``."""
    return os.environ.get("INVESTIGATIONS_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else [], default=str)
    except (TypeError, ValueError):
        return "[]"


def _loads(text: Optional[str], default: Any) -> Any:
    if not text:
        return default
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return default


# ── Schema (idempotent) ──────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS investigation (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    owner      TEXT,
    seeds_json TEXT NOT NULL DEFAULT '[]',
    notes      TEXT NOT NULL DEFAULT '',
    created_ts INTEGER NOT NULL,
    updated_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS investigation_annotation (
    id               TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL,
    target           TEXT NOT NULL DEFAULT 'case',
    text             TEXT NOT NULL DEFAULT '',
    actor            TEXT,
    ts               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_annotation_inv ON investigation_annotation (investigation_id, ts);

CREATE TABLE IF NOT EXISTS investigation_share (
    id               TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL,
    principal        TEXT NOT NULL,
    role             TEXT NOT NULL DEFAULT 'viewer',
    ts               INTEGER NOT NULL,
    UNIQUE (investigation_id, principal)
);
CREATE INDEX IF NOT EXISTS ix_share_inv ON investigation_share (investigation_id);
"""


# ── Connection management ────────────────────────────────────────────────────────
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
    """Create all tables/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── row mappers ────────────────────────────────────────────────────────────────
def _row_to_investigation(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "owner": r["owner"],
        "seeds": _loads(r["seeds_json"], []),
        "notes": r["notes"],
        "created_ts": r["created_ts"],
        "updated_ts": r["updated_ts"],
    }


def _row_to_annotation(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "investigation_id": r["investigation_id"],
        "target": r["target"],
        "text": r["text"],
        "actor": r["actor"],
        "ts": r["ts"],
    }


def _row_to_share(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "investigation_id": r["investigation_id"],
        "principal": r["principal"],
        "role": r["role"],
        "ts": r["ts"],
    }


def _norm_seeds(seeds: Any) -> list[str]:
    if seeds is None:
        return []
    if isinstance(seeds, str):
        raw = seeds.replace(" ", ",")
        return [s.strip() for s in raw.split(",") if s.strip()]
    try:
        return [str(s).strip() for s in seeds if s is not None and str(s).strip()]
    except TypeError:
        return []


# ── Investigations CRUD ──────────────────────────────────────────────────────────
def create_investigation(
    name: str,
    owner: Optional[str] = None,
    seeds: Any = None,
    notes: str = "",
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Create a saved investigation pinning ``seeds`` (ids). Returns the stored
    dict (with a generated ``id``) or None on error. Never raises."""
    init_db(db_path)
    try:
        iid = uuid.uuid4().hex
        now = _now_ms()
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO investigation (id, name, owner, seeds_json, notes, created_ts, updated_ts)
                VALUES (?,?,?,?,?,?,?)
                """,
                (iid, str(name or ""), owner, _dumps(_norm_seeds(seeds)), str(notes or ""), now, now),
            )
            conn.commit()
            return get_investigation(iid, db_path=db_path)
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def list_investigations(*, db_path: Optional[str] = None) -> list[dict]:
    """All investigations, newest-first. Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM investigation ORDER BY created_ts DESC, id DESC"
            ).fetchall()
            return [_row_to_investigation(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_investigation(
    investigation_id: str,
    *,
    role: Optional[str] = None,
    depth: int = 1,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Return one investigation with its saved seeds, annotations, shares, and the
    *resolved current subgraph* (via :func:`graph.subgraph` over the seeds). None
    if unknown. Never raises."""
    if not investigation_id:
        return None
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute(
                "SELECT * FROM investigation WHERE id=?", (investigation_id,)
            ).fetchone()
            if r is None:
                return None
            inv = _row_to_investigation(r)

            ann_rows = conn.execute(
                "SELECT * FROM investigation_annotation WHERE investigation_id=? ORDER BY ts ASC, id ASC",
                (investigation_id,),
            ).fetchall()
            share_rows = conn.execute(
                "SELECT * FROM investigation_share WHERE investigation_id=? ORDER BY ts ASC, id ASC",
                (investigation_id,),
            ).fetchall()
        finally:
            conn.close()

        inv["annotations"] = [_row_to_annotation(a) for a in ann_rows]
        inv["shares"] = [_row_to_share(s) for s in share_rows]

        # Resolve the live subgraph by reusing graph.subgraph over the seeds.
        subgraph = {"nodes": [], "edges": []}
        if _graph is not None:
            try:
                try:
                    d = max(0, int(depth))
                except (TypeError, ValueError):
                    d = 1
                subgraph = _graph.subgraph(inv["seeds"], depth=d, role=role)
            except Exception:  # noqa: BLE001
                subgraph = {"nodes": [], "edges": []}
        inv["subgraph"] = {
            "nodes": subgraph.get("nodes", []),
            "edges": subgraph.get("edges", []),
            "n_nodes": len(subgraph.get("nodes", [])),
            "n_edges": len(subgraph.get("edges", [])),
        }
        return inv
    except sqlite3.Error:
        return None


def delete_investigation(investigation_id: str, *, db_path: Optional[str] = None) -> bool:
    """Delete an investigation plus its annotations and shares. Returns True if a
    row was removed. Never raises."""
    if not investigation_id:
        return False
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute("DELETE FROM investigation WHERE id=?", (investigation_id,))
            conn.execute(
                "DELETE FROM investigation_annotation WHERE investigation_id=?", (investigation_id,)
            )
            conn.execute(
                "DELETE FROM investigation_share WHERE investigation_id=?", (investigation_id,)
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except sqlite3.Error:
        return False


# ── Annotations ──────────────────────────────────────────────────────────────────
def add_annotation(
    investigation_id: str,
    target: str,
    text: str,
    actor: Optional[str] = None,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Annotate a node / edge / the case itself. ``target`` is a free-form pointer
    (e.g. ``"case"``, ``"node:sam"``, ``"edge:sam|psg|OWNS"``). Returns the stored
    annotation or None (incl. when the investigation is unknown). Never raises."""
    if not investigation_id:
        return None
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            exists = conn.execute(
                "SELECT 1 FROM investigation WHERE id=?", (investigation_id,)
            ).fetchone()
            if exists is None:
                return None
            aid = uuid.uuid4().hex
            now = _now_ms()
            conn.execute(
                """
                INSERT INTO investigation_annotation (id, investigation_id, target, text, actor, ts)
                VALUES (?,?,?,?,?,?)
                """,
                (aid, investigation_id, str(target or "case"), str(text or ""), actor, now),
            )
            # touch the parent so updated_ts reflects activity
            conn.execute(
                "UPDATE investigation SET updated_ts=? WHERE id=?", (now, investigation_id)
            )
            conn.commit()
            r = conn.execute(
                "SELECT * FROM investigation_annotation WHERE id=?", (aid,)
            ).fetchone()
            return _row_to_annotation(r) if r else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def annotations(investigation_id: str, *, db_path: Optional[str] = None) -> list[dict]:
    """All annotations for an investigation, oldest-first. Never raises."""
    if not investigation_id:
        return []
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM investigation_annotation WHERE investigation_id=? ORDER BY ts ASC, id ASC",
                (investigation_id,),
            ).fetchall()
            return [_row_to_annotation(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── Shares ───────────────────────────────────────────────────────────────────────
def share(
    investigation_id: str,
    principal: str,
    role: str = "viewer",
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Share an investigation with ``principal`` at ``role``. Idempotent on
    ``(investigation_id, principal)`` — re-sharing updates the role. Returns the
    stored share or None (incl. unknown investigation). Never raises."""
    if not investigation_id or not principal:
        return None
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            exists = conn.execute(
                "SELECT 1 FROM investigation WHERE id=?", (investigation_id,)
            ).fetchone()
            if exists is None:
                return None
            now = _now_ms()
            sid = uuid.uuid5(
                uuid.NAMESPACE_URL, f"{investigation_id}|{principal}"
            ).hex
            conn.execute(
                """
                INSERT INTO investigation_share (id, investigation_id, principal, role, ts)
                VALUES (?,?,?,?,?)
                ON CONFLICT(investigation_id, principal) DO UPDATE SET
                    role = excluded.role,
                    ts = excluded.ts
                """,
                (sid, investigation_id, str(principal), str(role or "viewer"), now),
            )
            conn.commit()
            r = conn.execute(
                "SELECT * FROM investigation_share WHERE investigation_id=? AND principal=?",
                (investigation_id, str(principal)),
            ).fetchone()
            return _row_to_share(r) if r else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def shares(investigation_id: str, *, db_path: Optional[str] = None) -> list[dict]:
    """All shares for an investigation. Never raises."""
    if not investigation_id:
        return []
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM investigation_share WHERE investigation_id=? ORDER BY ts ASC, id ASC",
                (investigation_id,),
            ).fetchall()
            return [_row_to_share(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
