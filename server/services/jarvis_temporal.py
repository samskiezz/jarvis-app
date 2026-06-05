"""JARVIS TEMPORAL — the bitemporal model: what was true, when, and when we learned it.

Palantir's temporal model knows two clocks for every fact:
  * VALID TIME       — when the fact was true in the real world.
  * TRANSACTION TIME — when the system learned it.

This module records property facts along BOTH axes (stdlib only, never raises) so
you can ask "as of <valid_time>, as known at <tx_time>". Facts are append-only;
history is never destroyed (immutable provenance).
"""

from __future__ import annotations

import sqlite3
import time

from . import jarvis_os as jos

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.execute(
                """CREATE TABLE IF NOT EXISTS temporal_fact (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, object_id TEXT, prop TEXT,
                    value TEXT, valid_from INTEGER, tx_time INTEGER, actor TEXT, source TEXT
                )"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_tf ON temporal_fact(object_id,prop,valid_from,tx_time)")
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def record(object_id: str, prop: str, value, *, valid_from: int | None = None,
           actor: str = "system", source: str = "") -> dict:
    """Append a bitemporal fact. ``valid_from`` defaults to now (ms)."""
    init_db()
    now = int(time.time() * 1000)
    vf = int(valid_from) if valid_from is not None else now
    try:
        c = _conn()
        try:
            c.execute("INSERT INTO temporal_fact (object_id,prop,value,valid_from,tx_time,actor,source)"
                      " VALUES (?,?,?,?,?,?,?)", (object_id, prop, str(value), vf, now, actor, source))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    jos.audit("temporal.record", actor=actor, target=f"{object_id}.{prop}",
              meta={"value": str(value)[:80], "valid_from": vf})
    return {"status": "recorded", "object_id": object_id, "prop": prop,
            "valid_from": vf, "tx_time": now}


def as_of(object_id: str, *, valid_time: int | None = None, tx_time: int | None = None) -> dict:
    """Reconstruct an object's properties as they were true at ``valid_time``, as
    the system knew them at ``tx_time``. Both default to 'now' (latest)."""
    init_db()
    now = int(time.time() * 1000)
    vt = int(valid_time) if valid_time is not None else now
    tt = int(tx_time) if tx_time is not None else now
    try:
        c = _conn()
        try:
            rows = c.execute(
                "SELECT prop,value,valid_from,tx_time FROM temporal_fact "
                "WHERE object_id=? AND valid_from<=? AND tx_time<=? ORDER BY prop, valid_from, tx_time",
                (object_id, vt, tt)).fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        rows = []
    # for each prop keep the fact with the greatest (valid_from, tx_time) within the cutoffs
    best: dict[str, tuple] = {}
    for r in rows:
        key = r["prop"]
        cur = best.get(key)
        cand = (r["valid_from"], r["tx_time"], r["value"])
        if cur is None or cand[:2] >= cur[:2]:
            best[key] = cand
    return {"object_id": object_id, "valid_time": vt, "tx_time": tt,
            "props": {k: v[2] for k, v in best.items()}}


def history(object_id: str, prop: str | None = None, limit: int = 200) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            if prop:
                rows = c.execute("SELECT * FROM temporal_fact WHERE object_id=? AND prop=? ORDER BY id DESC LIMIT ?",
                                 (object_id, prop, max(1, int(limit)))).fetchall()
            else:
                rows = c.execute("SELECT * FROM temporal_fact WHERE object_id=? ORDER BY id DESC LIMIT ?",
                                 (object_id, max(1, int(limit)))).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


def snapshot_object(object_id: str, *, actor: str = "system") -> dict:
    """Capture an ontology object's current props as bitemporal facts (valid now)."""
    if ont is None:
        return {"status": "ontology_unavailable"}
    obj = ont.get_object(object_id)
    if not obj:
        return {"status": "not_found"}
    n = 0
    for k, v in (obj.get("props") or {}).items():
        record(object_id, k, v, actor=actor, source="ontology-snapshot")
        n += 1
    return {"status": "snapshotted", "object_id": object_id, "facts": n}
