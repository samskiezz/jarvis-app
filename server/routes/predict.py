"""POST /functions/predict — the unified prediction engine endpoint.

Reuses the existing auth pattern (``optional_bearer``: public read by default,
locked behind the bearer when JARVIS_REQUIRE_AUTH=true). Delegates to
``services.prediction.predict`` which never raises on a normal question, so this
route does not 500 on ordinary input.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services.prediction import predict

try:
    from ..ml.forecast import forecast_learned, _available_models
except Exception:  # pragma: no cover
    forecast_learned = None  # type: ignore
    _available_models = None  # type: ignore

try:
    from ..ml.patterns import discover_patterns
except Exception:  # pragma: no cover
    discover_patterns = None  # type: ignore

try:
    from ..services.self_improvement import evaluate_forecast, improvement_status
except Exception:  # pragma: no cover
    evaluate_forecast = None  # type: ignore
    improvement_status = None  # type: ignore

try:  # P0 self-improvement: log every forecast so it can be scored vs reality later.
    from ..services import history_lake as _hl
except Exception:  # pragma: no cover - history lake is optional
    _hl = None

router = APIRouter()


class PredictRequest(BaseModel):
    question: str
    params: Optional[dict[str, Any]] = None


def _forward_test_log_enabled() -> bool:
    """Forecast logging into the forward-test loop is OPT-IN via env so that
    ordinary requests / imports / tests never write to the History Lake DB unless
    the operator has explicitly enabled the self-improvement loop."""
    return os.environ.get("FORWARD_TEST_LOG", "").strip().lower() in ("1", "true", "yes", "on")


# Domains whose forecasts have a numeric realized value the loop can resolve later
# (a price/level). Event-probability/trajectory results are not auto-scored here.
_LOGGABLE_DOMAINS = {"crypto", "series", "growth", "generic"}


def _log_forecast(result: dict[str, Any]) -> None:
    """Fire-and-forget: when ``FORWARD_TEST_LOG`` is truthy, persist a real
    ``/functions/predict`` crypto/series forecast to the History Lake so live
    usage feeds the closed forward-test loop (``score_due_forecasts`` grades it
    once the horizon elapses). Guarded so tests/imports never hit the DB unless
    enabled, and so only resolvable numeric-level domains are logged. Never raises;
    a logging failure must not affect the response."""
    if _hl is None or not isinstance(result, dict):
        return
    if not _forward_test_log_enabled():
        return
    domain = result.get("domain")
    if domain not in _LOGGABLE_DOMAINS:
        return
    try:
        pred = result.get("prediction") or {}
        interval = pred.get("interval") or {}
        method = result.get("method") or {}
        point = pred.get("point_estimate", pred.get("value"))
        if point is None:  # insufficient_data result -> nothing to score
            return
        # Preserve the data the forward-test resolver needs: the asset + the
        # baseline (last observed value) + the resolve timestamp, alongside the
        # model drivers, so score_due can later fetch the realized value.
        data = result.get("data") or {}
        as_of = data.get("as_of")
        drivers = dict(result.get("drivers") or {})
        drivers.setdefault("asset", result.get("target"))
        drivers.setdefault("source", "crypto" if domain == "crypto" else "series")
        history = data.get("history") or []
        if history and isinstance(history[-1], dict) and history[-1].get("v") is not None:
            drivers.setdefault("baseline", history[-1]["v"])
        # The engine's ``result["horizon"]`` is a human label ("24h"); derive the
        # NUMERIC horizon (hours) + resolve timestamp from the forecast point's ts
        # relative to ``as_of`` so score_due can mature/resolve it correctly.
        horizon = None
        forecast_pts = data.get("forecast") or []
        if as_of is not None and forecast_pts and isinstance(forecast_pts[0], dict):
            ft_ts = forecast_pts[0].get("t")
            if isinstance(ft_ts, (int, float)) and ft_ts > as_of:
                horizon = (float(ft_ts) - float(as_of)) / 3_600_000.0
                drivers.setdefault("resolve_ts", int(ft_ts))
        _hl.record_forecast(
            question=result.get("question"),
            domain=domain,
            target=result.get("target"),
            horizon=horizon,
            point=point,
            low=interval.get("low"),
            high=interval.get("high"),
            confidence=interval.get("confidence"),
            probability=pred.get("probability"),
            method=method.get("name") if isinstance(method, dict) else None,
            drivers=drivers,
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


# ── Pattern Oracle Self-Improvement routes (APPEND ONLY) ──────────────────────

class LearnedForecastRequest(BaseModel):
    series: list[float]
    horizon: int
    model: str = "auto"


class PatternRequest(BaseModel):
    series: list[float]
    window: int = 7


class EvaluateRequest(BaseModel):
    forecast_id: str
    actuals: list[float]


@router.post("/v1/predict/learned")
async def learned_forecast_route(
    req: LearnedForecastRequest, _token: str | None = Depends(optional_bearer)
):
    """Learned-model forecast endpoint.  Preserves existing ``/functions/predict``
    behaviour; this adds model-driven forecasting with calibrated intervals."""
    if forecast_learned is None:
        return {"error": "forecast module unavailable"}
    return await forecast_learned(req.series, req.horizon, req.model)


@router.get("/v1/predict/patterns")
async def patterns_route(
    series: list[float] = Query(...), window: int = 7, _token: str | None = Depends(optional_bearer)
):
    """Discover motifs, discords, regimes, and anomalies in a time-series."""
    if discover_patterns is None:
        return {"error": "pattern module unavailable"}
    return await discover_patterns(series, window)


@router.get("/v1/predict/models")
async def models_route(_token: str | None = Depends(optional_bearer)):
    """List available learned forecast models and their current scores."""
    models = _available_models() if _available_models is not None else []
    return {"models": models}


@router.post("/v1/predict/evaluate")
async def evaluate_route(
    req: EvaluateRequest, _token: str | None = Depends(optional_bearer)
):
    """Submit actual realised values to evaluate a past forecast."""
    if evaluate_forecast is None:
        return {"error": "self-improvement module unavailable"}
    return await evaluate_forecast(req.forecast_id, req.actuals)


@router.get("/v1/predict/improvement")
async def improvement_route(_token: str | None = Depends(optional_bearer)):
    """Self-improvement loop status: model scores, pending retrains, recent evals."""
    if improvement_status is None:
        return {"error": "self-improvement module unavailable"}
    return await improvement_status()
