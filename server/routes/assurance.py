"""Mission-Control / Assurance endpoints.

Read-only by default. POST endpoints (dispatch, run_invariants) require bearer.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer

from assurance.commands.bus import get_bus as get_cmd_bus
from assurance.commands.types import Command
from assurance.events.bus import get_bus as get_evt_bus
from assurance.audit.log import read_recent as read_audit, append_audit
from assurance.audit.redact import redact_value
from assurance.telemetry.snapshot import get_snapshot, health_snapshot
from assurance.telemetry.export import to_prometheus
from assurance.workflows.workflows import list_workflows
from assurance.invariants.runner import run_all, read_latest_report, write_report
from assurance.invariants.registry import registered_names

router = APIRouter(prefix="/assurance", tags=["assurance"])


# ── Health ─────────────────────────────────────────────────────────────────
@router.get("/health")
def health(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    snap = health_snapshot()
    snap["invariants"] = read_latest_report() or {"ran": False}
    return snap


# ── Commands ───────────────────────────────────────────────────────────────
@router.get("/commands")
def commands(limit: int = 200, _t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    bus = get_cmd_bus()
    items = [redact_value(c.model_dump()) for c in bus.history(limit=max(1, min(limit, 1000)))]
    return {"ok": True, "registered": bus.registered(), "items": items, "count": len(items)}


class _DispatchBody(BaseModel):
    name: str
    actor: str = "ui"
    payload: dict[str, Any] = {}
    dry_run: bool = True
    approved: bool = False
    idempotency_key: str | None = None


@router.post("/dispatch")
def dispatch_command(body: _DispatchBody, _t: str = Depends(require_bearer)) -> dict[str, Any]:
    bus = get_cmd_bus()
    cmd = Command(
        name=body.name,
        actor=body.actor,
        payload=body.payload,
        dry_run=body.dry_run,
        approved=body.approved,
        idempotency_key=body.idempotency_key,
    )
    out = bus.dispatch(cmd)
    return redact_value(out.model_dump())


# ── Events ─────────────────────────────────────────────────────────────────
@router.get("/events")
def events(limit: int = 200, name: str | None = None,
           _t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    items = [redact_value(e.model_dump())
             for e in get_evt_bus().history(limit=max(1, min(limit, 1000)), name=name)]
    return {"ok": True, "items": items, "count": len(items)}


# ── Telemetry ──────────────────────────────────────────────────────────────
@router.get("/telemetry")
def telemetry(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return get_snapshot()


@router.get("/metrics", response_model=None)
def metrics_prom(_t: str | None = Depends(optional_bearer)):
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(to_prometheus(), media_type="text/plain; version=0.0.4")


# ── Invariants ─────────────────────────────────────────────────────────────
@router.get("/invariants")
def invariants(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return {"ok": True, "registered": registered_names(), "latest": read_latest_report()}


@router.post("/run_invariants")
def run_invariants(_t: str = Depends(require_bearer)) -> dict[str, Any]:
    rep = run_all()
    write_report(rep)
    append_audit(
        action="assurance.run_invariants",
        actor="bearer",
        outcome="ok" if rep.overall_ok else "failure",
        detail={"passed": rep.passed, "total": rep.total},
    )
    return rep.model_dump()


# ── Workflows ──────────────────────────────────────────────────────────────
@router.get("/workflows")
def workflows(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return {"ok": True, "workflows": list_workflows()}


# ── Audit ──────────────────────────────────────────────────────────────────
@router.get("/audit")
def audit(limit: int = 200, _t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    items = read_audit(limit=max(1, min(limit, 1000)))
    return {"ok": True, "items": items, "count": len(items)}


# ── Full mission-control report ────────────────────────────────────────────
@router.get("/report")
def report(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return {
        "ok": True,
        "health": health_snapshot(),
        "invariants": read_latest_report(),
        "workflows": list_workflows(),
        "commands_recent": [redact_value(c.model_dump())
                            for c in get_cmd_bus().history(limit=50)],
        "events_recent": [redact_value(e.model_dump())
                          for e in get_evt_bus().history(limit=100)],
        "audit_recent": read_audit(limit=50),
        "telemetry": get_snapshot(),
    }
