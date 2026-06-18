"""GUARDIAN sensor / incident routes — fills mini-app gap #15 (app-guardian).

Cluster C6 product-spec skeleton. The Guardian app surfaces home-sensor events
(motion, door/window, leak, smoke, CO, fall-detect) and lets the user mark them
as incidents. Stage-1 ships a SQLite-backed event store and a clean REST seam so
that any sensor source can POST in without further code work:

  POST /v1/guardian/event
      { "sensor_id": "...", "kind": "motion|door|leak|...",
        "value": "open|closed|true|...", "severity": "low|med|high",
        "ts": <epoch_s optional>, "source": "homeassistant|zigbee2mqtt|manual" }

  GET  /v1/guardian/incidents?limit=50&since=<epoch_s>
      → recent events, severity-ranked.

  GET  /v1/guardian/status
      → summary counts + last-event-ts.

  POST /v1/guardian/ack
      { "id": <int> } — flip the incident's ack flag.

Recommended wiring (2026):
  * Home Assistant Long-Lived Access Token → cron-poll /api/states and POST
    each interesting entity into /v1/guardian/event. Reference:
    https://developers.home-assistant.io/docs/api/rest/
  * Zigbee2MQTT → MQTT bridge → small script that re-publishes to this endpoint.

The route is bearer-protected via optional_bearer so it follows the rest of the
backend's read-public/write-keyed posture. Failure modes degrade — every
handler returns ``{"ok": False, "error": "..."}`` rather than raising 500.
"""
from __future__ import annotations

import os
import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Body, Depends, Query

from ..auth import optional_bearer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../server
DB_PATH = os.environ.get(
    "GUARDIAN_DB", os.path.join(ROOT, "data", "guardian_events.db")
)

router = APIRouter(prefix="/v1/guardian", tags=["guardian"])

_VALID_SEVERITY = {"low", "med", "high", "critical"}


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            sensor_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            value TEXT,
            severity TEXT DEFAULT 'low',
            source TEXT DEFAULT 'manual',
            ack INTEGER DEFAULT 0
        )"""
    )
    c.execute("CREATE INDEX IF NOT EXISTS ix_events_ts ON events(ts DESC)")
    c.commit()
    return c


def _row(r: tuple) -> dict[str, Any]:
    return {
        "id": r[0],
        "ts": r[1],
        "sensor_id": r[2],
        "kind": r[3],
        "value": r[4],
        "severity": r[5],
        "source": r[6],
        "ack": bool(r[7]),
    }


@router.post("/event")
async def post_event(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        sensor_id = str(body.get("sensor_id") or "").strip()
        kind = str(body.get("kind") or "").strip()
        if not sensor_id or not kind:
            return {"ok": False, "error": "sensor_id and kind are required"}
        severity = str(body.get("severity") or "low").lower()
        if severity not in _VALID_SEVERITY:
            severity = "low"
        ts = int(body.get("ts") or time.time())
        c = _db()
        try:
            cur = c.execute(
                "INSERT INTO events(ts, sensor_id, kind, value, severity, source) "
                "VALUES(?,?,?,?,?,?)",
                (
                    ts,
                    sensor_id,
                    kind,
                    str(body.get("value") or ""),
                    severity,
                    str(body.get("source") or "manual"),
                ),
            )
            c.commit()
            return {"ok": True, "id": cur.lastrowid, "ts": ts}
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "stub-pending-spec"}


@router.get("/incidents")
async def get_incidents(
    limit: int = Query(50, ge=1, le=500),
    since: int | None = Query(None),
    severity: str | None = Query(None),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            sql = "SELECT id, ts, sensor_id, kind, value, severity, source, ack FROM events"
            args: list[Any] = []
            clauses: list[str] = []
            if since is not None:
                clauses.append("ts >= ?")
                args.append(int(since))
            if severity and severity in _VALID_SEVERITY:
                clauses.append("severity = ?")
                args.append(severity)
            if clauses:
                sql += " WHERE " + " AND ".join(clauses)
            sql += " ORDER BY ts DESC LIMIT ?"
            args.append(limit)
            rows = c.execute(sql, args).fetchall()
            return {
                "ok": True,
                "items": [_row(r) for r in rows],
                "count": len(rows),
                "source": "live" if rows else "stub-pending-spec",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "items": [], "source": "stub-pending-spec"}


@router.get("/status")
async def get_status(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    try:
        c = _db()
        try:
            total = c.execute("SELECT COUNT(*) FROM events").fetchone()[0]
            unack = c.execute("SELECT COUNT(*) FROM events WHERE ack=0").fetchone()[0]
            last_ts = c.execute("SELECT MAX(ts) FROM events").fetchone()[0]
            high = c.execute(
                "SELECT COUNT(*) FROM events WHERE severity IN ('high','critical') AND ack=0"
            ).fetchone()[0]
            return {
                "ok": True,
                "total_events": int(total),
                "unack": int(unack),
                "high_open": int(high),
                "last_event_ts": int(last_ts) if last_ts else None,
                "source": "live" if total else "stub-pending-spec",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "stub-pending-spec"}


@router.post("/ack")
async def ack_event(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        eid = int(body.get("id") or 0)
        if eid <= 0:
            return {"ok": False, "error": "id required"}
        c = _db()
        try:
            c.execute("UPDATE events SET ack=1 WHERE id=?", (eid,))
            c.commit()
            return {"ok": True, "id": eid}
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
