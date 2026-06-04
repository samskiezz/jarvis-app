"""WORKSHOP routes — pivot / aggregation analysis over the live object model.

Public reads (optional_bearer). They aggregate the ontology objects and the
History Lake series into dashboard-ready shapes (histogram / group-by / pivot /
per-series stats). The underlying :mod:`server.services.workshop` never raises,
so these routes always return a JSON body.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import workshop

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
