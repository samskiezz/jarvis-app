"""POST /functions/predict — the unified prediction engine endpoint.

Reuses the existing auth pattern (``optional_bearer``: public read by default,
locked behind the bearer when JARVIS_REQUIRE_AUTH=true). Delegates to
``services.prediction.predict`` which never raises on a normal question, so this
route does not 500 on ordinary input.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services.prediction import predict

try:  # P0 self-improvement: log every forecast so it can be scored vs reality later.
    from ..services import history_lake as _hl
except Exception:  # pragma: no cover - history lake is optional
    _hl = None

router = APIRouter()


class PredictRequest(BaseModel):
    question: str
    params: Optional[dict[str, Any]] = None


def _log_forecast(result: dict[str, Any]) -> None:
    """Fire-and-forget: persist the issued forecast to the History Lake so the
    self-improvement loop (score_due_forecasts) can grade it once the horizon
    elapses. Never raises; a logging failure must not affect the response."""
    if _hl is None or not isinstance(result, dict):
        return
    try:
        pred = result.get("prediction") or {}
        interval = pred.get("interval") or {}
        method = result.get("method") or {}
        _hl.record_forecast(
            question=result.get("question"),
            domain=result.get("domain"),
            target=result.get("target"),
            horizon=result.get("horizon_hours") or result.get("horizon"),
            point=pred.get("point_estimate", pred.get("value")),
            low=interval.get("low"),
            high=interval.get("high"),
            confidence=interval.get("confidence"),
            probability=pred.get("probability"),
            method=method.get("name") if isinstance(method, dict) else None,
            drivers=result.get("drivers"),
        )
    except Exception:
        pass  # self-improvement logging is best-effort


@router.post("/functions/predict")
async def predict_route(
    req: PredictRequest, _token: str | None = Depends(optional_bearer)
):
    """Forecast anything: returns the prediction schema with an honest
    confidence interval / probability + stated assumptions and caveats.
    Every issued forecast is logged (best-effort) to the History Lake so the
    engine can later score itself against realized outcomes and improve."""
    result = predict(req.question, req.params)
    _log_forecast(result)
    return result
