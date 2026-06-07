"""WORKSHOP routes — pivot / aggregation analysis over the live object model.

Public reads (optional_bearer). They aggregate the ontology objects and the
History Lake series into dashboard-ready shapes (histogram / group-by / pivot /
per-series stats). The underlying :mod:`server.services.workshop` never raises,
so these routes always return a JSON body.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import workshop
from ..data import workshop_models as wm

router = APIRouter()


class HistogramRequest(BaseModel):
    field: str
    bins: int = 10
    type: str | None = None
    objects: list[dict] | None = None
    series: list[float] | None = None


class GroupByRequest(BaseModel):
    field: str
    agg: str = "count"
    value_field: str | None = None
    type: str | None = None
    objects: list[dict] | None = None


class PivotRequest(BaseModel):
    rows_field: str
    cols_field: str
    agg: str = "count"
    value_field: str | None = None
    type: str | None = None
    objects: list[dict] | None = None


@router.post("/v1/workshop/histogram")
async def workshop_histogram(req: HistogramRequest,
                             _token: str | None = Depends(optional_bearer)):
    """Histogram of a numeric field over objects (or an explicit series)."""
    return workshop.histogram(
        req.field, bins=req.bins, objects=req.objects,
        type=req.type, series=req.series,
    )


@router.post("/v1/workshop/groupby")
async def workshop_groupby(req: GroupByRequest,
                           _token: str | None = Depends(optional_bearer)):
    """Group objects by a field and aggregate."""
    return workshop.group_by(
        req.field, agg=req.agg, value_field=req.value_field,
        objects=req.objects, type=req.type,
    )


@router.post("/v1/workshop/pivot")
async def workshop_pivot(req: PivotRequest,
                         _token: str | None = Depends(optional_bearer)):
    """Pivot objects into a rows × cols aggregation table."""
    return workshop.pivot(
        req.rows_field, req.cols_field, agg=req.agg,
        value_field=req.value_field, objects=req.objects, type=req.type,
    )


@router.get("/v1/workshop/series/{series_id}/stats")
async def workshop_series_stats(series_id: str,
                                _token: str | None = Depends(optional_bearer)):
    """Mean / std / min / max + linear trend for a History Lake series."""
    return workshop.series_stats(series_id)


# ── Workshop App Builder CRUD ────────────────────────────────────────────────
class AppCreate(BaseModel):
    name: str
    owner_id: str | None = None
    layout: dict | None = None


class AppUpdate(BaseModel):
    name: str | None = None
    layout: dict | None = None


class AppOut(BaseModel):
    id: str
    name: str
    owner_id: str | None = None
    layout: dict
    is_published: bool
    created_at: int
    updated_at: int


@router.post("/v1/workshop/apps", response_model=AppOut)
async def create_app(req: AppCreate,
                     _token: str = Depends(require_bearer)):
    """Create a new Workshop app."""
    result = wm.create_app(name=req.name, owner_id=req.owner_id, layout=req.layout)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/v1/workshop/apps")
async def list_apps(owner_id: str | None = None,
                    include_published: bool = True,
                    _token: str | None = Depends(optional_bearer)):
    """List Workshop apps (optionally filtered by owner)."""
    return {"apps": wm.list_apps(owner_id=owner_id, include_published=include_published)}


@router.get("/v1/workshop/apps/{app_id}", response_model=AppOut)
async def get_app(app_id: str,
                  _token: str | None = Depends(optional_bearer)):
    """Get a single Workshop app definition."""
    result = wm.get_app(app_id)
    if result is None:
        raise HTTPException(status_code=404, detail="App not found")
    return result


@router.put("/v1/workshop/apps/{app_id}", response_model=AppOut)
async def update_app(app_id: str,
                     req: AppUpdate,
                     _token: str = Depends(require_bearer)):
    """Save / update a Workshop app layout and metadata."""
    result = wm.update_app(app_id, name=req.name, layout=req.layout)
    if result is None:
        raise HTTPException(status_code=404, detail="App not found")
    return result


@router.delete("/v1/workshop/apps/{app_id}")
async def delete_app(app_id: str,
                     _token: str = Depends(require_bearer)):
    """Delete a Workshop app."""
    ok = wm.delete_app(app_id)
    if not ok:
        raise HTTPException(status_code=404, detail="App not found")
    return {"deleted": True}


@router.post("/v1/workshop/apps/{app_id}/publish", response_model=AppOut)
async def publish_app(app_id: str,
                      _token: str = Depends(require_bearer)):
    """Publish a Workshop app so others can view it."""
    result = wm.publish_app(app_id)
    if result is None:
        raise HTTPException(status_code=404, detail="App not found")
    return result
