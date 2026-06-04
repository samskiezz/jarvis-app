"""History Lake / skill routes (PATTERN ORACLE P0).

Endpoints (reusing the existing auth deps in ``server/auth.py``):
  * ``GET  /v1/history/series``        — list the series catalog (public read).
  * ``GET  /v1/history/series/{id}``   — paginated observations for one series.
  * ``GET  /v1/predict/skill``         — rolling skill summary (optional ?domain=).
  * ``POST /v1/history/ingest``        — trigger ingest_all (admin, bearer required).

Reads use ``optional_bearer`` (public unless JARVIS_REQUIRE_AUTH=true), matching
the live-intel/predict read endpoints; the ingest trigger uses ``require_bearer``.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import optional_bearer, require_bearer
from ..services import history_lake as lake

router = APIRouter()


@router.get("/v1/history/series")
async def get_series_list(_token: str | None = Depends(optional_bearer)):
    """List the series catalog with observation counts + ts bounds."""
    items = lake.list_series()
    return {"items": items, "count": len(items)}


@router.get("/v1/history/series/{series_id}")
async def get_series_observations(
    series_id: str,
    since: Optional[int] = Query(default=None, description="epoch ms lower bound (inclusive)"),
    limit: int = Query(default=500, ge=1, le=10000),
    _token: str | None = Depends(optional_bearer),
):
    """Return observations for one series (most-recent ``limit`` rows, ascending)."""
    obs = lake.read_series(series_id, since=since, limit=limit)
    if not obs:
        # Distinguish "no such series / no data" — 404 only when the series is unknown.
        known = any(s["series_id"] == series_id for s in lake.list_series())
        if not known:
            raise HTTPException(status_code=404, detail="unknown series_id")
    return {"series_id": series_id, "observations": obs, "count": len(obs)}


@router.get("/v1/predict/skill")
async def get_skill(
    domain: Optional[str] = Query(default=None),
    _token: str | None = Depends(optional_bearer),
):
    """Rolling skill metrics (MAE/RMSE/coverage/mean skill) over scored forecasts."""
    return lake.skill_summary(domain)


@router.post("/v1/history/ingest")
async def trigger_ingest(_token: str = Depends(require_bearer)):
    """Admin: run every ingestion adapter once and return the audit summary."""
    # Imported lazily so importing this route module never pulls the feed loaders.
    from ..services.ingestion import ingest_all

    return ingest_all()
