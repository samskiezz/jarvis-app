"""OBJECT DATA FUNNEL / CDC SYNC — dataset ↔ object orchestration (Ontology V2).

One-way and reverse sync between dataset rows and ontology objects, with:
  * hash-based change detection (insert / update / delete)
  * soft-delete support
  * row-level lineage in ``funnel_sync_log``
  * idempotent, resumable design
  * polling-based watcher registry (Layer A CDC)

Dataset content is staged into ``funnel_staged_row`` (or pulled from the
History Lake for series-bound datasets). The sync engine diffs against
``funnel_row_hash`` to decide what changed.

Doctrine (matching the rest of the backend): stdlib ``sqlite3`` only, never
raise — every public function degrades gracefully.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
import uuid
from typing import Any, Callable, Optional

from . import datasets as ds_svc
from . import ontology_store as store

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "funnel.db"
)


def _db_path() -> str:
    return os.environ.get("FUNNEL_DB", _DEFAULT_DB)


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


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS funnel_sync_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    dataset_id   TEXT NOT NULL,
    object_type  TEXT,
    row_key      TEXT NOT NULL DEFAULT '',
    operation    TEXT NOT NULL,
    detail_json  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_fsl_dataset ON funnel_sync_log (dataset_id, ts);

CREATE TABLE IF NOT EXISTS funnel_row_hash (
    dataset_id   TEXT NOT NULL,
    row_key      TEXT NOT NULL,
    row_hash     TEXT NOT NULL,
    object_id    TEXT,
    updated_ts   INTEGER NOT NULL,
    PRIMARY KEY (dataset_id, row_key)
);
CREATE INDEX IF NOT EXISTS ix_frh_dataset ON funnel_row_hash (dataset_id);

CREATE TABLE IF NOT EXISTS funnel_staged_row (
    dataset_id   TEXT NOT NULL,
    row_key      TEXT NOT NULL,
    row_json     TEXT NOT NULL DEFAULT '{}',
    updated_ts   INTEGER NOT NULL,
    PRIMARY KEY (dataset_id, row_key)
);
CREATE INDEX IF NOT EXISTS ix_fsr_dataset ON funnel_staged_row (dataset_id);

CREATE TABLE IF NOT EXISTS funnel_watcher (
    id           TEXT PRIMARY KEY,
    dataset_id   TEXT NOT NULL,
    callback_ref TEXT,
    interval_s   INTEGER NOT NULL DEFAULT 60,
    last_poll_ts INTEGER,
    active       INTEGER NOT NULL DEFAULT 1
);
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
def _row_hash(row: dict) -> str:
    canonical = json.dumps(row, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


def _log_sync(
    dataset_id: str,
    object_type: Optional[str],
    row_key: str,
    operation: str,
    detail: dict,
) -> None:
    try:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO funnel_sync_log
                    (ts, dataset_id, object_type, row_key, operation, detail_json)
                VALUES (?,?,?,?,?,?)
                """,
                (_now_ms(), dataset_id, object_type, row_key, operation, _dumps(detail)),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _get_existing_hashes(dataset_id: str) -> dict[str, dict[str, Any]]:
    try:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT row_key, object_id, row_hash FROM funnel_row_hash WHERE dataset_id=?",
                (dataset_id,),
            ).fetchall()
            return {
                r["row_key"]: {"hash": r["row_hash"], "oid": r["object_id"]}
                for r in rows
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return {}


def _update_hash(dataset_id: str, row_key: str, h: str, oid: str, now: int) -> None:
    try:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO funnel_row_hash
                    (dataset_id, row_key, row_hash, object_id, updated_ts)
                VALUES (?,?,?,?,?)
                ON CONFLICT(dataset_id, row_key) DO UPDATE SET
                    row_hash=excluded.row_hash,
                    object_id=excluded.object_id,
                    updated_ts=excluded.updated_ts
                """,
                (dataset_id, row_key, h, oid, now),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _drop_hash(dataset_id: str, row_key: str) -> None:
    try:
        conn = _connect()
        try:
            conn.execute(
                "DELETE FROM funnel_row_hash WHERE dataset_id=? AND row_key=?",
                (dataset_id, row_key),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── staged rows (dataset content staging) ────────────────────────────────────────
def stage_rows(dataset_id: str, rows: list[dict]) -> dict:
    """Load rows into the funnel staging area for a dataset."""
    init_db()
    now = _now_ms()
    try:
        conn = _connect()
        try:
            for row in rows:
                key = str(row.get("id", row.get("key", uuid.uuid4().hex)))
                conn.execute(
                    """
                    INSERT INTO funnel_staged_row (dataset_id, row_key, row_json, updated_ts)
                    VALUES (?,?,?,?)
                    ON CONFLICT(dataset_id, row_key) DO UPDATE SET
                        row_json=excluded.row_json,
                        updated_ts=excluded.updated_ts
                    """,
                    (dataset_id, key, _dumps(row), now),
                )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "staged": len(rows)}


def get_staged_rows(dataset_id: str) -> list[dict]:
    """Read staged rows for a dataset."""
    init_db()
    try:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT row_key, row_json FROM funnel_staged_row WHERE dataset_id=?",
                (dataset_id,),
            ).fetchall()
            return [{"key": r["row_key"], **_loads(r["row_json"])} for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def clear_staged_rows(dataset_id: str) -> dict:
    """Remove all staged rows for a dataset."""
    init_db()
    try:
        conn = _connect()
        try:
            conn.execute(
                "DELETE FROM funnel_staged_row WHERE dataset_id=?", (dataset_id,)
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


# ── sync engine ──────────────────────────────────────────────────────────────────
async def sync_dataset_to_objects(
    dataset_id: str,
    object_type: str,
    mapping: dict,
    soft_delete: bool = True,
) -> dict:
    """One-way sync: staged dataset rows → ontology objects."""
    init_db()
    rows = get_staged_rows(dataset_id)
    existing_hashes = _get_existing_hashes(dataset_id)
    if not rows and not existing_hashes:
        return {"ok": True, "processed": 0, "inserted": 0, "updated": 0, "deleted": 0}

    inserted = updated = deleted = 0
    now = _now_ms()
    current_keys: set[str] = set()

    for row in rows:
        key = str(row.get("key", row.get("id", uuid.uuid4().hex)))
        current_keys.add(key)

        props: dict[str, Any] = {}
        for prop_key, row_key in mapping.items():
            if row_key in row:
                props[prop_key] = row[row_key]

        h = _row_hash(row)
        oid = existing_hashes.get(key, {}).get("oid")

        if oid is None:
            oid = uuid.uuid4().hex
            store.upsert_object(
                {
                    "id": oid,
                    "type": object_type,
                    "label": str(props.get("label", props.get("name", oid))),
                    "props": props,
                }
            )
            inserted += 1
            _log_sync(dataset_id, object_type, key, "insert", {"object_id": oid})
        elif existing_hashes.get(key, {}).get("hash") != h:
            obj = store.get_object(oid)
            if obj:
                existing_props = dict(obj.get("props") or {})
                existing_props.update(props)
                store.upsert_object({"id": oid, "props": existing_props})
            updated += 1
            _log_sync(dataset_id, object_type, key, "update", {"object_id": oid})
        else:
            _log_sync(dataset_id, object_type, key, "noop", {"object_id": oid})

        _update_hash(dataset_id, key, h, oid, now)

    # Detect deletes
    for old_key in existing_hashes:
        if old_key not in current_keys:
            old_oid = existing_hashes[old_key]["oid"]
            if soft_delete:
                obj = store.get_object(old_oid)
                if obj:
                    props = dict(obj.get("props") or {})
                    props["_deleted"] = True
                    store.upsert_object({
                        "id": old_oid,
                        "type": obj.get("type"),
                        "label": obj.get("label"),
                        "mark": obj.get("mark"),
                        "props": props,
                    })
            deleted += 1
            _log_sync(dataset_id, object_type, old_key, "delete",
                      {"object_id": old_oid, "soft": soft_delete})
            _drop_hash(dataset_id, old_key)

    return {
        "ok": True,
        "processed": len(rows),
        "inserted": inserted,
        "updated": updated,
        "deleted": deleted,
    }


async def sync_objects_to_dataset(
    object_type: str, dataset_id: str, *, clear_first: bool = True
) -> dict:
    """Reverse sync: objects of a given type → staged dataset rows."""
    init_db()
    objects = store.query_objects(type=object_type, limit=10000)
    rows: list[dict] = []
    for obj in objects:
        rows.append(
            {
                "id": obj.get("id"),
                "type": obj.get("type"),
                "label": obj.get("label"),
                **(obj.get("props") or {}),
            }
        )
    if clear_first:
        clear_staged_rows(dataset_id)
    return stage_rows(dataset_id, rows)


# ── watcher / CDC Layer A ───────────────────────────────────────────────────────
async def watch_dataset(dataset_id: str, callback: Callable[..., Any]) -> str:
    """Register a polling watcher. Returns watcher_id."""
    init_db()
    wid = uuid.uuid4().hex
    try:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO funnel_watcher
                    (id, dataset_id, callback_ref, interval_s, last_poll_ts, active)
                VALUES (?,?,?,?,?,?)
                """,
                (wid, dataset_id, str(callback), 60, _now_ms(), 1),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass
    return wid


def list_watchers(dataset_id: Optional[str] = None) -> list[dict]:
    """List active watchers."""
    init_db()
    try:
        conn = _connect()
        try:
            sql = "SELECT * FROM funnel_watcher WHERE active=1"
            args: list[Any] = []
            if dataset_id:
                sql += " AND dataset_id=?"
                args.append(dataset_id)
            sql += " ORDER BY last_poll_ts DESC"
            rows = conn.execute(sql, args).fetchall()
            return [
                {
                    "id": r["id"],
                    "dataset_id": r["dataset_id"],
                    "interval_s": r["interval_s"],
                    "last_poll_ts": r["last_poll_ts"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── sync status & logs ───────────────────────────────────────────────────────────
def get_sync_logs(dataset_id: Optional[str] = None, limit: int = 100) -> list[dict]:
    """Row-level lineage log."""
    init_db()
    try:
        conn = _connect()
        try:
            sql = "SELECT * FROM funnel_sync_log WHERE 1=1"
            args: list[Any] = []
            if dataset_id:
                sql += " AND dataset_id=?"
                args.append(dataset_id)
            sql += " ORDER BY ts DESC LIMIT ?"
            args.append(limit)
            rows = conn.execute(sql, args).fetchall()
            return [
                {
                    "id": r["id"],
                    "ts": r["ts"],
                    "dataset_id": r["dataset_id"],
                    "object_type": r["object_type"],
                    "row_key": r["row_key"],
                    "operation": r["operation"],
                    "detail": _loads(r["detail_json"]),
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_sync_status(dataset_id: str) -> dict:
    """Aggregated sync status for a dataset."""
    init_db()
    try:
        conn = _connect()
        try:
            row = conn.execute(
                """
                SELECT MAX(ts) AS last_ts, COUNT(*) AS total
                FROM funnel_sync_log WHERE dataset_id=?
                """,
                (dataset_id,),
            ).fetchone()
            last_ts = row["last_ts"] if row else None
            total = row["total"] if row else 0

            ops = conn.execute(
                """
                SELECT operation, COUNT(*) AS c
                FROM funnel_sync_log WHERE dataset_id=? GROUP BY operation
                """,
                (dataset_id,),
            ).fetchall()
            op_counts = {r["operation"]: r["c"] for r in ops}

            rh = conn.execute(
                "SELECT COUNT(*) AS c FROM funnel_row_hash WHERE dataset_id=?",
                (dataset_id,),
            ).fetchone()
            tracked_rows = rh["c"] if rh else 0

            return {
                "dataset_id": dataset_id,
                "last_sync_ts": last_ts,
                "total_operations": total,
                "operations": op_counts,
                "tracked_rows": tracked_rows,
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return {
            "dataset_id": dataset_id,
            "last_sync_ts": None,
            "total_operations": 0,
            "operations": {},
            "tracked_rows": 0,
        }
