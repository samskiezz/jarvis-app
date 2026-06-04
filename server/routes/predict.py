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

router = APIRouter()


class PredictRequest(BaseModel):
    question: str
    params: Optional[dict[str, Any]] = None


@router.post("/functions/predict")
async def predict_route(
    req: PredictRequest, _token: str | None = Depends(optional_bearer)
):
    """Forecast anything: returns the prediction schema with an honest
    confidence interval / probability + stated assumptions and caveats."""
    return predict(req.question, req.params)
