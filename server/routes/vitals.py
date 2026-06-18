"""VITALS routes — fills mini-app gap #16 (app-vitals).

Cluster C6 product-spec skeleton. The Vitals app shows the owner's biometric
trends (HR, HRV, SpO2, sleep, steps, weight). 2026 stack choice: rather than
plug directly into Apple HealthKit / Garmin Connect (both require platform-
specific OAuth dances), accept observations via this generic REST contract and
let the iOS Shortcut / Garmin webhook / Open Wearables bridge POST into it.

Open Wearables (https://openwearables.io/integrations/apple-health) and the
Garmin Health API (https://developer.garmin.com/gc-developer-program/health-api/)
both speak JSON over HTTPS, so a one-day adapter per source can land later.

  POST /v1/vitals/observation
      { "metric": "hr|hrv|spo2|steps|weight_kg|sleep_min|...",
        "value": <float>, "unit": "...", "ts": <epoch_s>,
        "source": "apple_health|garmin|whoop|manual" }

  GET  /v1/vitals/trend?metric=hr&hours=24
      → [{"ts":..., "value":...}, ...]

  GET  /v1/vitals/latest
      → most-recent reading per known metric.

Storage: SQLite at server/data/vitals.db (additive — never destructive).
"""
from __future__ import annotations

import os
import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Body, Depends, Query

from ..auth import optional_bearer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("VITALS_DB", os.path.join(ROOT, "data", "vitals.db"))

router = APIRouter(prefix="/v1/vitals", tags=["vitals"])


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS observations(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            metric TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT,
            source TEXT DEFAULT 'manual'
        )"""
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS ix_obs_metric_ts ON observations(metric, ts DESC)"
    )
    c.commit()
    return c


@router.post("/observation")
async def post_observation(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        metric = str(body.get("metric") or "").strip().lower()
        if not metric:
            return {"ok": False, "error": "metric required"}
        try:
            value = float(body.get("value"))
        except (TypeError, ValueError):
            return {"ok": False, "error": "value must be numeric"}
        ts = int(body.get("ts") or time.time())
        c = _db()
        try:
            cur = c.execute(
                "INSERT INTO observations(ts, metric, value, unit, source) "
                "VALUES(?,?,?,?,?)",
                (
                    ts,
                    metric,
                    value,
                    str(body.get("unit") or ""),
                    str(body.get("source") or "manual"),
                ),
            )
            c.commit()
            return {"ok": True, "id": cur.lastrowid, "ts": ts}
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "stub-pending-spec"}


@router.get("/trend")
async def get_trend(
    metric: str = Query(..., min_length=1),
    hours: int = Query(24, ge=1, le=24 * 365),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        since = int(time.time()) - hours * 3600
        c = _db()
        try:
            rows = c.execute(
                "SELECT ts, value, unit, source FROM observations "
                "WHERE metric=? AND ts >= ? ORDER BY ts ASC",
                (metric.lower(), since),
            ).fetchall()
            return {
                "ok": True,
                "metric": metric.lower(),
                "points": [
                    {"ts": r[0], "value": r[1], "unit": r[2], "source": r[3]}
                    for r in rows
                ],
                "count": len(rows),
                "source": "live" if rows else "stub-pending-spec",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "error": str(e),
            "metric": metric,
            "points": [],
            "source": "stub-pending-spec",
        }


@router.get("/latest")
async def get_latest(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    try:
        c = _db()
        try:
            rows = c.execute(
                "SELECT metric, MAX(ts) AS ts, value, unit, source FROM observations "
                "GROUP BY metric ORDER BY ts DESC"
            ).fetchall()
            items = {
                r[0]: {"ts": r[1], "value": r[2], "unit": r[3], "source": r[4]}
                for r in rows
            }
            return {
                "ok": True,
                "items": items,
                "count": len(items),
                "source": "live" if items else "stub-pending-spec",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "items": {}, "source": "stub-pending-spec"}
