"""JARVIS Nexus Phase 3 — control plane view (/v1/control/*).

The single read surface for "what is the whole system doing right now": the live
service roster, the controller's latest snapshot, and the recent coordinated bus
activity (system/service/correlation/health). Read-only and defensive.
"""
from __future__ import annotations

import json
import subprocess

from fastapi import APIRouter, Request

from ..services import jarvis_events as _bus
from ..services import registry_store

router = APIRouter()

_TOPICS = ("system", "service", "correlation", "health", "cost", "gpu", "tasks", "control")
_ALLOWED_ACTIONS = {"restart"}
_LOCAL = {"127.0.0.1", "::1", "localhost", "testclient"}


def _recent(limit: int = 25) -> list[dict]:
    try:
        c = _bus._conn()
        try:
            qmarks = ",".join("?" for _ in _TOPICS)
            rows = c.execute(
                f"SELECT seq,ts,stream,type,payload,actor FROM jevt_event "
                f"WHERE stream IN ({qmarks}) ORDER BY seq DESC LIMIT ?",
                (*_TOPICS, limit),
            ).fetchall()
        finally:
            c.close()
        out = []
        for r in rows:
            d = dict(r)
            d["topic"] = d.pop("stream")
            d["payload"] = json.loads(d.get("payload") or "{}")
            out.append(d)
        return out
    except Exception:  # noqa: BLE001
        return []


@router.get("/v1/control/state")
async def state():
    svcs = registry_store.list_services()
    recent = _recent(25)
    snapshot = next((e for e in recent if e["topic"] == "system" and e["type"] == "snapshot"), None)
    tasks = next((e for e in recent if e["topic"] == "tasks" and e["type"] == "status"), None)
    return {
        "services": {
            "count": len(svcs),
            "alive": sum(1 for s in svcs if s.get("alive")),
            "roster": svcs,
        },
        "latest_snapshot": snapshot,
        "latest_tasks": tasks,
        "recent_events": recent,
    }


@router.post("/v1/control/intervene")
async def intervene(body: dict, request: Request):
    """Operator-gated remediation: restart a registered service. Localhost-only
    (the :3000 operator UI proxies from this host), validated against the
    registry roster, no shell (list args) — bounded to our own pm2 processes."""
    host = (request.client.host if request.client else "") or ""
    if host not in _LOCAL:
        return {"ok": False, "error": "intervene is localhost-only"}
    sid = str(body.get("id") or "").strip()
    action = str(body.get("action") or "restart").strip()
    if action not in _ALLOWED_ACTIONS:
        return {"ok": False, "error": f"unsupported action (allowed: {sorted(_ALLOWED_ACTIONS)})"}
    roster = {s["id"] for s in registry_store.list_services()}
    if sid not in roster:
        return {"ok": False, "error": "unknown service id (not in registry)"}
    try:
        r = subprocess.run(["pm2", "restart", sid], capture_output=True, text=True, timeout=30)
        ok = r.returncode == 0
        detail = (r.stderr or r.stdout or "").strip()[-200:]
    except Exception as e:  # noqa: BLE001
        ok, detail = False, str(e)
    try:
        _bus.emit("control", "intervene", {"id": sid, "action": action, "ok": ok}, actor="operator")
    except Exception:  # noqa: BLE001
        pass
    return {"ok": ok, "id": sid, "action": action, "detail": detail}
