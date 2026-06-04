"""OPS routes — ALERTING / RULES engine + CASE MANAGEMENT (Gotham-style ops).

A ready-to-mount ``APIRouter`` exposing the WATCHTOWER (rules/alerts) and the
investigation case files. Reads use ``optional_bearer`` (public unless
JARVIS_REQUIRE_AUTH=true, matching the rest of the read API); writes require a
valid bearer via ``require_bearer``.

Wire it in ``server/main.py`` with::

    from .routes import ops as ops_routes
    app.include_router(ops_routes.router)

Endpoints:
  Rules / alerts
    * ``GET  /v1/rules``               — list rules (public read).
    * ``POST /v1/rules``               — create a rule (bearer).
    * ``POST /v1/rules/evaluate``      — evaluate a context, fire matching alerts
                                          (bearer). If no context is supplied the
                                          current live-intel snapshot is used.
    * ``GET  /v1/alerts``              — list alerts, optional ?status= (public).
    * ``POST /v1/alerts/{id}/ack``     — acknowledge an alert (bearer).
  Cases
    * ``GET  /v1/cases``               — list cases, optional ?status= (public).
    * ``POST /v1/cases``               — create a case (bearer).
    * ``GET  /v1/cases/{id}``          — fetch one case (public).
    * ``POST /v1/cases/{id}/notes``    — append a note (bearer).
    * ``POST /v1/cases/{id}/entities`` — attach an entity id (bearer).
    * ``POST /v1/cases/{id}/status``   — set the case status (bearer).
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import alerts as alerts_svc
from ..services import cases as cases_svc

router = APIRouter()


# ── request models ───────────────────────────────────────────────────────────────
class RuleIn(BaseModel):
    name: str
    expr: Any = Field(default_factory=dict, description="Declarative JSON condition")
    target: Optional[str] = None
    severity: int = 50
    enabled: bool = True


class EvaluateIn(BaseModel):
    context: Optional[dict] = Field(
        default=None,
        description="Data dict to evaluate rules against. If omitted, the live-intel snapshot is used.",
    )


class CaseIn(BaseModel):
    title: str
    status: str = "open"
    entity_ids: list[str] = Field(default_factory=list)


class NoteIn(BaseModel):
    text: str
    by: Optional[str] = None


class EntityIn(BaseModel):
    entity_id: str


class StatusIn(BaseModel):
    status: str


# ── rules / alerts ───────────────────────────────────────────────────────────────
@router.get("/v1/rules")
async def get_rules(
    enabled_only: bool = Query(default=False),
    _token: str | None = Depends(optional_bearer),
):
    items = alerts_svc.list_rules(enabled_only=enabled_only)
    return {"items": items, "count": len(items)}


@router.post("/v1/rules")
async def post_rule(body: RuleIn, _token: str = Depends(require_bearer)):
    rule_id = alerts_svc.create_rule(
        body.name,
        body.expr,
        target=body.target,
        severity=body.severity,
        enabled=body.enabled,
    )
    if rule_id is None:
        raise HTTPException(status_code=400, detail="could not create rule")
    return {"id": rule_id, "rule": alerts_svc.get_rule(rule_id)}


@router.post("/v1/rules/evaluate")
async def post_evaluate(body: EvaluateIn, _token: str = Depends(require_bearer)):
    context = body.context
    if context is None:
        # Fall back to the live-intel snapshot, flattened into a few useful metrics.
        context = await _live_intel_context()
    fired = alerts_svc.evaluate(context)
    return {"fired": fired, "count": len(fired)}


@router.get("/v1/alerts")
async def get_alerts(
    status: Optional[str] = Query(default=None),
    _token: str | None = Depends(optional_bearer),
):
    items = alerts_svc.list_alerts(status=status)
    return {"items": items, "count": len(items)}


@router.post("/v1/alerts/{alert_id}/ack")
async def post_ack(
    alert_id: int,
    by: Optional[str] = Query(default=None),
    token: str = Depends(require_bearer),
):
    who = by or "operator"
    ok = alerts_svc.ack_alert(alert_id, who)
    if not ok:
        raise HTTPException(status_code=404, detail="unknown alert id")
    return {"id": alert_id, "status": "acked", "ack_by": who}


# ── cases ────────────────────────────────────────────────────────────────────────
@router.get("/v1/cases")
async def get_cases(
    status: Optional[str] = Query(default=None),
    _token: str | None = Depends(optional_bearer),
):
    items = cases_svc.list_cases(status=status)
    return {"items": items, "count": len(items)}


@router.post("/v1/cases")
async def post_case(body: CaseIn, _token: str = Depends(require_bearer)):
    case_id = cases_svc.create_case(
        body.title, status=body.status, entity_ids=body.entity_ids
    )
    if case_id is None:
        raise HTTPException(status_code=400, detail="could not create case")
    return {"id": case_id, "case": cases_svc.get_case(case_id)}


@router.get("/v1/cases/{case_id}")
async def get_one_case(case_id: int, _token: str | None = Depends(optional_bearer)):
    case = cases_svc.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="unknown case id")
    return case


@router.post("/v1/cases/{case_id}/notes")
async def post_note(case_id: int, body: NoteIn, _token: str = Depends(require_bearer)):
    case = cases_svc.add_note(case_id, body.text, by=body.by or "operator")
    if case is None:
        raise HTTPException(status_code=404, detail="unknown case id")
    return case


@router.post("/v1/cases/{case_id}/entities")
async def post_entity(case_id: int, body: EntityIn, _token: str = Depends(require_bearer)):
    case = cases_svc.attach_entity(case_id, body.entity_id)
    if case is None:
        raise HTTPException(status_code=404, detail="unknown case id")
    return case


@router.post("/v1/cases/{case_id}/status")
async def post_status(case_id: int, body: StatusIn, _token: str = Depends(require_bearer)):
    case = cases_svc.set_status(case_id, body.status)
    if case is None:
        raise HTTPException(status_code=404, detail="unknown case id")
    return case


# ── helpers ──────────────────────────────────────────────────────────────────────
async def _live_intel_context() -> dict:
    """Flatten the live-intel snapshot into an evaluation context with a few
    convenience metrics plus the raw snapshot for field-path rules. Never raises.
    """
    snapshot: dict[str, Any] = {}
    try:
        from ..services.live_intel import get_live_intel

        snapshot = await get_live_intel()
    except Exception:  # noqa: BLE001 — evaluation context must always be available
        snapshot = {}
    ctx: dict[str, Any] = dict(snapshot) if isinstance(snapshot, dict) else {}
    # Convenience metrics for simple ``{"metric": ...}`` rules.
    try:
        mags = [
            q.get("mag")
            for q in (snapshot.get("earthquakes") or [])
            if isinstance(q, dict) and isinstance(q.get("mag"), (int, float))
        ]
        if mags:
            ctx["earthquake_max_mag"] = max(mags)
            ctx["earthquake_count"] = len(mags)
    except Exception:  # noqa: BLE001
        pass
    return ctx
