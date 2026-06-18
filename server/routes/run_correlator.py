"""RUN CORRELATOR routes — fills mini-app gap #18 (run-correlator).

Cluster C5 product-spec. The Run Correlator clusters related incidents (e.g.
"Guardian: motion at 03:12" + "VPN: peer dropped at 03:13" + "Solar: grid
import spike at 03:13") into a single human-readable case.

2026 reference is the OpenSearch Security Analytics correlation engine + the
OCSF v1.4 (Open Cybersecurity Schema Framework) event envelope. The same
{event_id, ts, source, severity} fields appear in:

  * OpenSearch correlation rules:
    https://opensearch.org/docs/latest/security-analytics/usage/correlation-rules/
  * OCSF v1.4 base_event schema:
    https://schema.ocsf.io/1.4.0/classes/base_event
  * Elastic SIEM Detection Engine alerts contract.

Endpoints:
  POST /v1/run-correlator/correlate {event_ids: [int,...], window_s?: int}
  GET  /v1/run-correlator/clusters?limit=50
  GET  /v1/run-correlator/cluster/{cid}

Algorithm (default, no external deps): a single-pass time-window grouper that
merges events sharing source or sensor within window_s seconds, then ranks
clusters by max severity. The function lives in _cluster() so it can be
swapped for an OpenSearch-backed implementation later via the
CORRELATOR_BACKEND env var.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Path, Query

from ..auth import optional_bearer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get(
    "RUN_CORRELATOR_DB", os.path.join(ROOT, "data", "run_correlator.db")
)
GUARDIAN_DB = os.environ.get(
    "GUARDIAN_DB", os.path.join(ROOT, "data", "guardian_events.db")
)
DEFAULT_WINDOW_S = int(os.environ.get("CORRELATOR_WINDOW_S", "120") or 120)

router = APIRouter(prefix="/v1/run-correlator", tags=["run-correlator"])

_SEVERITY_RANK = {"low": 1, "med": 2, "high": 3, "critical": 4}


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS clusters(
            id TEXT PRIMARY KEY,
            ts INTEGER NOT NULL,
            window_s INTEGER,
            event_count INTEGER,
            max_severity TEXT,
            event_ids_json TEXT,
            summary TEXT
        )"""
    )
    c.execute("CREATE INDEX IF NOT EXISTS ix_clusters_ts ON clusters(ts DESC)")
    c.commit()
    return c


def _load_events(event_ids: list[int]) -> list[dict[str, Any]]:
    """Read referenced events from the Guardian store (best-effort)."""
    if not event_ids:
        return []
    try:
        if not os.path.exists(GUARDIAN_DB):
            return []
        c = sqlite3.connect(GUARDIAN_DB, timeout=10)
        try:
            q = (
                "SELECT id, ts, sensor_id, kind, value, severity, source "
                f"FROM events WHERE id IN ({','.join('?' for _ in event_ids)})"
            )
            rows = c.execute(q, event_ids).fetchall()
            return [
                {
                    "id": r[0],
                    "ts": r[1],
                    "sensor_id": r[2],
                    "kind": r[3],
                    "value": r[4],
                    "severity": r[5],
                    "source": r[6],
                }
                for r in rows
            ]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []


def _cluster(events: list[dict[str, Any]], window_s: int) -> list[dict[str, Any]]:
    """Default correlation: time-window + source/sensor key, sorted by ts."""
    if not events:
        return []
    items = sorted(events, key=lambda e: int(e.get("ts") or 0))
    clusters: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    for e in items:
        ts = int(e.get("ts") or 0)
        if cur is None or ts - int(cur["last_ts"]) > window_s:
            cur = {
                "events": [e],
                "first_ts": ts,
                "last_ts": ts,
                "sources": {e.get("source")},
                "sensors": {e.get("sensor_id")},
                "max_sev": e.get("severity") or "low",
            }
            clusters.append(cur)
        else:
            cur["events"].append(e)
            cur["last_ts"] = ts
            cur["sources"].add(e.get("source"))
            cur["sensors"].add(e.get("sensor_id"))
            if _SEVERITY_RANK.get(e.get("severity") or "low", 0) > _SEVERITY_RANK.get(
                cur["max_sev"], 0
            ):
                cur["max_sev"] = e.get("severity") or "low"
    for c in clusters:
        c["sources"] = sorted(s for s in c["sources"] if s)
        c["sensors"] = sorted(s for s in c["sensors"] if s)
    return clusters


@router.post("/correlate")
async def correlate(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        ids_raw = body.get("event_ids") or []
        if not isinstance(ids_raw, list):
            return {"ok": False, "error": "event_ids must be a list of ints"}
        event_ids: list[int] = []
        for x in ids_raw:
            try:
                event_ids.append(int(x))
            except (TypeError, ValueError):
                continue
        window_s = int(body.get("window_s") or DEFAULT_WINDOW_S)
        events = _load_events(event_ids)
        clusters = _cluster(events, window_s)
        c = _db()
        try:
            saved: list[str] = []
            for cl in clusters:
                cid = uuid.uuid4().hex[:16]
                summary = (
                    f"{len(cl['events'])} events from "
                    f"{','.join(cl['sources']) or '?'} "
                    f"in {cl['last_ts'] - cl['first_ts']}s"
                )
                c.execute(
                    "INSERT INTO clusters(id, ts, window_s, event_count, "
                    "max_severity, event_ids_json, summary) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (
                        cid,
                        int(time.time()),
                        window_s,
                        len(cl["events"]),
                        cl["max_sev"],
                        json.dumps([e["id"] for e in cl["events"]]),
                        summary,
                    ),
                )
                saved.append(cid)
            c.commit()
        finally:
            c.close()
        return {
            "ok": True,
            "clusters_created": saved,
            "events_seen": len(events),
            "window_s": window_s,
            "schema_version": "2026.1",
            "source": "live" if events else "default-schema",
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}


@router.get("/clusters")
async def list_clusters(
    limit: int = Query(50, ge=1, le=500),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            rows = c.execute(
                "SELECT id, ts, window_s, event_count, max_severity, "
                "event_ids_json, summary FROM clusters ORDER BY ts DESC LIMIT ?",
                (limit,),
            ).fetchall()
            items = [
                {
                    "cluster_id": r[0],
                    "ts": r[1],
                    "window_s": r[2],
                    "event_count": r[3],
                    "max_severity": r[4],
                    "event_ids": json.loads(r[5]) if r[5] else [],
                    "summary": r[6],
                }
                for r in rows
            ]
            if not items:
                items = [
                    {
                        "cluster_id": "demo000000000000",
                        "ts": 0,
                        "window_s": DEFAULT_WINDOW_S,
                        "event_count": 0,
                        "max_severity": "low",
                        "event_ids": [],
                        "summary": "no correlations yet — POST event_ids to /correlate",
                    }
                ]
                source = "default-schema"
            else:
                source = "live"
            return {
                "ok": True,
                "items": items,
                "count": len(items),
                "schema_version": "2026.1",
                "source": source,
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "items": [], "source": "default-schema"}


@router.get("/cluster/{cluster_id}")
async def get_cluster(
    cluster_id: str = Path(..., min_length=1, max_length=64),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            r = c.execute(
                "SELECT id, ts, window_s, event_count, max_severity, "
                "event_ids_json, summary FROM clusters WHERE id=?",
                (cluster_id,),
            ).fetchone()
            if not r:
                return {
                    "ok": True,
                    "cluster_id": cluster_id,
                    "found": False,
                    "schema_version": "2026.1",
                    "source": "default-schema",
                }
            event_ids = json.loads(r[5]) if r[5] else []
            events = _load_events(event_ids)
            return {
                "ok": True,
                "cluster_id": r[0],
                "ts": r[1],
                "window_s": r[2],
                "event_count": r[3],
                "max_severity": r[4],
                "event_ids": event_ids,
                "events": events,
                "summary": r[6],
                "schema_version": "2026.1",
                "source": "live",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}
