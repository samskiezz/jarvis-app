"""TEMPORAL ANALYSIS routes — the temporal pillar (Gotham-style).

Public read endpoints (reusing ``server/auth.py``; ``optional_bearer`` so the
local/playable build streams without a key unless JARVIS_REQUIRE_AUTH=true):

  * ``GET  /v1/temporal/range``      — observations in [t0,t1] + descriptive stats.
  * ``GET  /v1/temporal/events``     — threshold-crossing events for a series.
  * ``GET  /v1/temporal/patterns``   — z-score anomalies + rolling volatility.
  * ``GET  /v1/temporal/replay``     — N cumulative frames for a UI scrubber.
  * ``GET  /v1/temporal/object/{object_id}/versions`` — ontology version trail.
  * ``POST /v1/temporal/timeline``   — merged threshold-event feed across series.

Mount in ``main.py`` with::

    from .routes import temporal as temporal_routes
    app.include_router(temporal_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import temporal as svc

router = APIRouter(prefix="/v1/temporal", tags=["temporal"])


@router.get("/range")
async def range_endpoint(
    series_id: str = Query(..., description="series id to query"),
    t0: Optional[int] = Query(None, description="epoch-ms lower bound (inclusive)"),
    t1: Optional[int] = Query(None, description="epoch-ms upper bound (inclusive)"),
    _token: str | None = Depends(optional_bearer),
):
    """Observations in the inclusive window [t0,t1] with basic stats."""
    return svc.range_query(series_id, t0, t1)


@router.get("/events")
async def events_endpoint(
    series_id: str = Query(..., description="series id to scan"),
    threshold: Optional[float] = Query(None, description="crossing threshold (auto=mean+1σ if omitted)"),
    direction: str = Query("up", description="up | down | both"),
    _token: str | None = Depends(optional_bearer),
):
    """Threshold-crossing events along the series."""
    events = svc.event_sequence(series_id, threshold=threshold, direction=direction)
    return {
        "series_id": series_id,
        "threshold": threshold,
        "direction": direction,
        "count": len(events),
        "events": events,
    }


@router.get("/patterns")
async def patterns_endpoint(
    series_id: str = Query(..., description="series id to scan"),
    _token: str | None = Depends(optional_bearer),
):
    """z-score spike anomalies + rolling-volatility windows."""
    return svc.pattern_scan(series_id)


@router.get("/replay")
async def replay_endpoint(
    series_id: str = Query(..., description="series id to downsample"),
    n_frames: int = Query(60, ge=1, le=1000, description="number of scrubber frames"),
    _token: str | None = Depends(optional_bearer),
):
    """Evenly-spaced cumulative frames for a UI time-scrubber."""
    frames = svc.replay_frames(series_id, n_frames=n_frames)
    return {"series_id": series_id, "n_frames": len(frames), "frames": frames}


@router.get("/object/{object_id}/versions")
async def object_versions_endpoint(
    object_id: str,
    _token: str | None = Depends(optional_bearer),
):
    """Temporal version trail of an ontology object."""
    versions = svc.object_versions(object_id)
    return {"object_id": object_id, "count": len(versions), "versions": versions}


class TimelineBody(BaseModel):
    series_ids: Optional[list[str]] = None
    limit: int | None = None


@router.post("/timeline")
async def timeline_endpoint(
    body: TimelineBody,
    _token: str | None = Depends(optional_bearer),
):
    """Merged, time-sorted threshold-event feed across the given series."""
    events = svc.timeline(body.series_ids, limit=body.limit or 200)
    return {"count": len(events), "events": events}
