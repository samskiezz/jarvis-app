"""REPORTS routes — BRIEF generation, saved reports + saved DASHBOARDS.

A ready-to-mount ``APIRouter`` exposing intelligence-brief generation, a saved
report store, and saved dashboard definitions with live widget resolution.
Reads use ``optional_bearer`` (public unless JARVIS_REQUIRE_AUTH=true, matching
the rest of the read API); writes require a valid bearer via ``require_bearer``.

Wire it in ``server/main.py`` with::

    from .routes import reports as reports_routes
    app.include_router(reports_routes.router)

Endpoints:
  Reports
    * ``POST /v1/reports/generate``     — generate a brief from
                                          {case_id?, entity_ids?, query?, save?} (bearer).
    * ``GET  /v1/reports``              — list saved reports (public).
    * ``POST /v1/reports``              — save a report (bearer).
    * ``GET  /v1/reports/{id}``         — fetch one saved report (public).
    * ``GET  /v1/reports/{id}/export``  — export ?fmt=md|json (public).
  Dashboards
    * ``GET  /v1/dashboards``           — list saved dashboards (public).
    * ``POST /v1/dashboards``           — save a dashboard (bearer).
    * ``GET  /v1/dashboards/{id}``      — fetch one dashboard (public).
    * ``POST /v1/dashboards/{id}/resolve`` — resolve all widgets to live data (public).
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import dashboards as dash_svc
from ..services import reports as reports_svc

router = APIRouter()


# ── request models ───────────────────────────────────────────────────────────────
class GenerateIn(BaseModel):
    case_id: Optional[int] = None
    entity_ids: Optional[list[str]] = None
    query: Optional[str] = None
    polish: bool = False
    save: bool = False


class ReportIn(BaseModel):
    title: str
    body: str
    meta: dict = Field(default_factory=dict)


class DashboardIn(BaseModel):
    name: str
    widgets: list[dict] = Field(default_factory=list)


# ── reports ──────────────────────────────────────────────────────────────────────
@router.post("/v1/reports/generate")
async def post_generate(body: GenerateIn, _token: str = Depends(require_bearer)):
    brief = reports_svc.generate_brief(
        case_id=body.case_id,
        entity_ids=body.entity_ids,
        query=body.query,
        polish=body.polish,
    )
    result: dict[str, Any] = {"brief": brief}
    if body.save:
        rid = reports_svc.save_report(
            brief["title"],
            brief["markdown"],
            meta={
                "case_id": body.case_id,
                "entity_ids": body.entity_ids,
                "query": body.query,
                "generated": True,
            },
        )
        result["id"] = rid
    return result


@router.get("/v1/reports")
async def get_reports(_token: str | None = Depends(optional_bearer)):
    items = reports_svc.list_reports()
    return {"items": items, "count": len(items)}


@router.post("/v1/reports")
async def post_report(body: ReportIn, _token: str = Depends(require_bearer)):
    rid = reports_svc.save_report(body.title, body.body, meta=body.meta)
    if rid is None:
        raise HTTPException(status_code=400, detail="could not save report")
    return {"id": rid, "report": reports_svc.get_report(rid)}


@router.get("/v1/reports/{report_id}")
async def get_one_report(report_id: int, _token: str | None = Depends(optional_bearer)):
    rep = reports_svc.get_report(report_id)
    if rep is None:
        raise HTTPException(status_code=404, detail="unknown report id")
    return rep


@router.get("/v1/reports/{report_id}/export")
async def get_export(
    report_id: int,
    fmt: str = Query(default="md"),
    _token: str | None = Depends(optional_bearer),
):
    if reports_svc.get_report(report_id) is None:
        raise HTTPException(status_code=404, detail="unknown report id")
    content = reports_svc.export(report_id, fmt=fmt)
    return {"id": report_id, "fmt": fmt, "content": content}


# ── dashboards ───────────────────────────────────────────────────────────────────
@router.get("/v1/dashboards")
async def get_dashboards(_token: str | None = Depends(optional_bearer)):
    items = dash_svc.list_dashboards()
    return {"items": items, "count": len(items)}


@router.post("/v1/dashboards")
async def post_dashboard(body: DashboardIn, _token: str = Depends(require_bearer)):
    did = dash_svc.save_dashboard(body.name, body.widgets)
    if did is None:
        raise HTTPException(status_code=400, detail="could not save dashboard")
    return {"id": did, "dashboard": dash_svc.get_dashboard(did)}


@router.get("/v1/dashboards/{dashboard_id}")
async def get_one_dashboard(
    dashboard_id: int, _token: str | None = Depends(optional_bearer)
):
    dash = dash_svc.get_dashboard(dashboard_id)
    if dash is None:
        raise HTTPException(status_code=404, detail="unknown dashboard id")
    return dash


@router.post("/v1/dashboards/{dashboard_id}/resolve")
async def post_resolve(
    dashboard_id: int, _token: str | None = Depends(optional_bearer)
):
    resolved = dash_svc.resolve_dashboard(dashboard_id)
    if resolved is None:
        raise HTTPException(status_code=404, detail="unknown dashboard id")
    return resolved
