"""JARVIS Nexus — service registry store.

Single source of truth for "which services exist on this host". Backed by one
SQLite table (server/data/registry.db). Additive and DEFENSIVE: every function
swallows its own errors so a registry hiccup can never break a service boot.

Part of Nexus Phase 1 (mutual visibility). See audit/MASTER_TASKLIST.md.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time

_DB = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "registry.db"))
_FRESH_MS = 60_000  # a service is "alive" if seen in the last 60s


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.execute(
                """CREATE TABLE IF NOT EXISTS service(
                    id TEXT PRIMARY KEY, name TEXT, port INTEGER, role TEXT,
                    base_url TEXT, transport TEXT, health_path TEXT, routes_json TEXT,
                    pid INTEGER, status TEXT, first_seen INTEGER, last_seen INTEGER, meta_json TEXT)"""
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def upsert(d: dict) -> dict:
    """Announce/refresh a service. Preserves first_seen across re-announces."""
    init_db()
    now = int(time.time() * 1000)
    try:
        c = _conn()
        try:
            row = c.execute("SELECT first_seen FROM service WHERE id=?", (d.get("id"),)).fetchone()
            first = row["first_seen"] if row else now
            c.execute(
                """INSERT OR REPLACE INTO service
                   (id,name,port,role,base_url,transport,health_path,routes_json,pid,status,first_seen,last_seen,meta_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    d.get("id"), d.get("name") or d.get("id"), d.get("port"), d.get("role", ""),
                    d.get("base_url", ""), d.get("transport", "http"), d.get("health_path", "/health"),
                    json.dumps(d.get("routes") or []), d.get("pid"), d.get("status", "ok"),
                    first, now, json.dumps(d.get("meta") or {}),
                ),
            )
            c.commit()
        finally:
            c.close()
        return {"ok": True, "id": d.get("id")}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def heartbeat(sid: str, status: str = "ok", metrics: dict | None = None) -> dict:
    init_db()
    now = int(time.time() * 1000)
    try:
        c = _conn()
        try:
            meta = json.dumps({"metrics": metrics or {}})
            cur = c.execute(
                "UPDATE service SET last_seen=?, status=?, meta_json=? WHERE id=?",
                (now, status, meta, sid),
            )
            c.commit()
            updated = cur.rowcount
        finally:
            c.close()
        return {"ok": True, "id": sid, "updated": updated}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def _row(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["routes"] = json.loads(d.pop("routes_json") or "[]")
    d["meta"] = json.loads(d.pop("meta_json") or "{}")
    now = int(time.time() * 1000)
    d["alive"] = (now - (d.get("last_seen") or 0)) < _FRESH_MS
    return d


def list_services() -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM service ORDER BY name").fetchall()
        finally:
            c.close()
        return [_row(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


def resolve(sid: str) -> dict | None:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM service WHERE id=?", (sid,)).fetchone()
        finally:
            c.close()
        return _row(r) if r else None
    except Exception:  # noqa: BLE001
        return None
