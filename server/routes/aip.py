"""AIP routes — the AI/Prediction layer endpoints.

Mounts the grounded-answer + prediction-engine tools from ``services.aip`` under
``/v1/aip``. Reuses the existing ``optional_bearer`` auth (public read by
default; locked behind the bearer when ``JARVIS_REQUIRE_AUTH=true``). Every
handler delegates to a service function that never raises, so these routes do
not 500 on ordinary input.

Mount in ``server/main.py`` with:

    from .routes import aip as aip_routes
    app.include_router(aip_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import aip

router = APIRouter(prefix="/v1/aip", tags=["aip"])


class AskRequest(BaseModel):
    question: str


class PredictRequest(BaseModel):
    question: str
    params: Optional[dict[str, Any]] = None


@router.post("/ask")
async def ask_route(req: AskRequest, _token: str | None = Depends(optional_bearer)):
    """Grounded answer: retrieve over the ontology, fold in risk signals + live
    markets, compose a factual reply (Kimi-grounded when a key is configured)."""
    return aip.answer_grounded(req.question)


@router.post("/predict")
async def predict_route(req: PredictRequest, _token: str | None = Depends(optional_bearer)):
    """Surface the unified prediction engine via the AIP tool wrapper."""
    return aip.predict_tool(req.question, req.params)


@router.get("/oracle")
async def oracle_route(
    asset: str = Query(..., description="Asset/ticker to score, e.g. bitcoin / xrp"),
    source: str = Query("crypto", description="Series source hint"),
    _token: str | None = Depends(optional_bearer),
):
    """Trained-model conviction/direction/volatility signal for ``asset``."""
    return aip.oracle_signal(asset, source)


@router.get("/skill")
async def skill_route(
    domain: Optional[str] = Query(None, description="Optional domain filter"),
    _token: str | None = Depends(optional_bearer),
):
    """Self-improvement scorecard: skill_summary + forward-test roll-up."""
    return aip.skill_scorecard(domain)
