"""PREDICTION-IN-CHAT routes (P9 #66).

Surfaces the flagship prediction engine inside the analyst CHAT, so the chat UI
can decide whether a free-text message is a forecast request and, if so, get a
grounded natural-language answer carrying the point estimate, calibrated
interval, confidence and an explicit honesty line.

Endpoints (mounted under ``/v1/chat``):
  * ``POST /v1/chat/predict`` body ``{message, params?}`` — if the message is a
        forecast request, run the prediction engine and return
        ``{handled, answer, prediction, extracted}``; else ``{handled: False}``.
  * ``POST /v1/chat/route``   body ``{message}`` — classify the message as
        ``{intent: "prediction"|"other", ...}`` so the UI routes it.

Reuses ``optional_bearer`` (public read by default; locked behind the bearer
when ``JARVIS_REQUIRE_AUTH=true``). Every handler delegates to a service
function that never raises, so these routes do not 500 on ordinary input.

Mount in ``server/main.py`` with::

    from .routes import chat_predict as chat_predict_routes
    app.include_router(chat_predict_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import chat_predict as chat_predict_svc

router = APIRouter(prefix="/v1/chat", tags=["chat"])


class PredictBody(BaseModel):
    message: str
    params: Optional[dict[str, Any]] = None


class RouteBody(BaseModel):
    message: str


@router.post("/predict")
async def predict_endpoint(
    body: PredictBody,
    _token: str | None = Depends(optional_bearer),
):
    """Forecast-in-chat: detect intent, run the prediction engine when it fires,
    and return a grounded answer + the structured prediction. Never 500s."""
    return chat_predict_svc.answer_with_prediction(body.message, body.params)


@router.post("/route")
async def route_endpoint(
    body: RouteBody,
    _token: str | None = Depends(optional_bearer),
):
    """Classify a chat message as a prediction request or other, with the
    extracted target/horizon so the UI/chat can decide where to send it."""
    return chat_predict_svc.route(body.message)
