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


# ── Autopilot endpoints (read-only) ────────────────────────────────────────
import json as _json
import os as _os

_ROOT = _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
_AP_REPORTS = _os.path.join(_ROOT, "autopilot", "reports")
_AP_INTEL = _os.path.join(_ROOT, "autopilot", "intelligence")
_AP_STATE = _os.path.join(_ROOT, "autopilot", "state")
_AP_ROADMAP = _os.path.join(_ROOT, "autopilot", "roadmap")


def _read_json_safe(path: str, default: Any = None) -> Any:
    if not _os.path.exists(path):
        return default
    try:
        with open(path, encoding="utf-8") as fh:
            return _json.load(fh)
    except (OSError, _json.JSONDecodeError):
        return default


@router.get("/autopilot/status")
def autopilot_status(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return _read_json_safe(_os.path.join(_AP_REPORTS, "system-status.json"),
                           default={"ok": False, "error": "no status yet"})


@router.get("/autopilot/reports/{name}")
def autopilot_reports(name: str, _t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    safe = _os.path.basename(name)
    if not safe.endswith(".json"):
        safe = safe + ".json"
    p = _os.path.join(_AP_REPORTS, safe)
    data = _read_json_safe(p)
    if data is None:
        raise HTTPException(status_code=404, detail=f"no report {safe}")
    return data


@router.get("/autopilot/roadmap")
def autopilot_roadmap(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return {
        "next": _read_json_safe(_os.path.join(_AP_ROADMAP, "next-actions.json"),
                                  default={"next": []}),
        "backlog": _read_json_safe(_os.path.join(_AP_ROADMAP, "backlog.json"),
                                    default=[]),
    }


@router.get("/autopilot/resources")
def autopilot_resources(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return _read_json_safe(_os.path.join(_AP_INTEL, "resource-map.json"),
                           default={"ok": False})


@router.get("/autopilot/unknowns")
def autopilot_unknowns(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return _read_json_safe(_os.path.join(_AP_INTEL, "unknown-systems.json"),
                           default={"ok": False})


@router.get("/autopilot/subsystems")
def autopilot_subsystems(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return _read_json_safe(_os.path.join(_AP_INTEL, "subsystem-registry.json"),
                           default={"ok": False})


@router.get("/autopilot/proposals")
def autopilot_proposals(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    prop_dir = _os.path.join(_AP_REPORTS, "proposals")
    if not _os.path.isdir(prop_dir):
        return {"proposals": [], "count": 0}
    items: list[dict[str, Any]] = []
    try:
        for f in sorted(_os.listdir(prop_dir), reverse=True)[:50]:
            if f.endswith(".md"):
                p = _os.path.join(prop_dir, f)
                try:
                    st = _os.stat(p)
                except OSError:
                    continue
                items.append({"name": f, "size": st.st_size, "mtime": st.st_mtime})
    except OSError:
        pass
    return {"proposals": items, "count": len(items)}


class _ApproveBody(BaseModel):
    proposal_id: str
    decision: str  # "approve" | "reject"
    note: str | None = None


@router.post("/autopilot/approve")
def autopilot_approve(body: _ApproveBody, _t: str = Depends(require_bearer)) -> dict[str, Any]:
    history_path = _os.path.join(_AP_STATE, "approval-history.jsonl")
    _os.makedirs(_AP_STATE, exist_ok=True)
    import time as _time
    entry = {
        "ts": _time.time(),
        "proposal_id": body.proposal_id,
        "decision": body.decision,
        "note": body.note or "",
    }
    try:
        with open(history_path, "a", encoding="utf-8") as fh:
            fh.write(_json.dumps(entry) + "\n")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    append_audit(action="autopilot.approval", actor="bearer",
                 outcome=body.decision,
                 detail={"proposal_id": body.proposal_id})
    return {"ok": True, "recorded": entry}
