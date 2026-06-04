"""PREDICTION-IN-CHAT bridge (P9 #66).

Surfaces the flagship prediction engine (:mod:`services.prediction`) inside the
analyst CHAT without touching the analyst itself. The chat UI can call:

  * :func:`detect_prediction_intent` — a cheap heuristic that decides whether a
    free-text chat message is asking for a *forecast* (vs. a normal lookup /
    chit-chat). Returns ``(is_prediction, extracted)`` where ``extracted`` holds
    the best-effort ``{target, horizon, horizon_hours}`` pulled from the text.
  * :func:`answer_with_prediction` — when the intent fires, calls
    ``prediction.predict(...)`` and formats a grounded natural-language answer
    carrying the point estimate, calibrated interval, confidence and (when the
    domain provides it) directional probability / conviction, plus an explicit
    HONESTY line clarifying that the interval is a calibrated model band, NOT a
    99%-directional guarantee. Returns ``{handled, answer, prediction}`` or
    ``{handled: False}``.

Design rules (mirroring prediction.py / scenario.py):
  * Best-effort import of the prediction engine; any failure degrades to an
    honest ``handled: False`` rather than raising.
  * Every public function NEVER raises and NEVER touches the network itself —
    the only network is inside ``prediction.predict`` (which is itself guarded
    and skippable by supplying ``params.series``). Tests monkeypatch
    ``prediction.predict`` so this module is exercised fully offline.
"""

from __future__ import annotations

import re
from typing import Any, Optional

# ── Best-effort reuse of the flagship prediction engine ─────────────────────────
try:  # pragma: no cover - import guard
    from . import prediction as _prediction
except Exception:  # noqa: BLE001
    _prediction = None  # type: ignore[assignment]


# The explicit honesty line every prediction answer carries. Calibrated band,
# NOT a directional certainty claim.
HONESTY_LINE = (
    "Honesty: this is a calibrated model interval (a probabilistic band), "
    "NOT a 99% directional guarantee — the true value can fall outside it."
)

# Verbs/nouns that signal a forecasting request.
_PREDICT_WORDS = (
    "predict",
    "forecast",
    "projection",
    "project ",
    "will ",
    "expected",
    "estimate",
    "outlook",
    "how high",
    "how low",
    "where will",
    "what will",
    "chance of",
    "probability of",
    "odds of",
    "likelihood",
)

# A horizon phrase like "in 24h", "in 1 week", "over the next 2 days", "by 2029".
_HORIZON_RE = re.compile(
    r"\b(?:in|over|within|next|by|after)\b[^.?!]*?"
    r"(\d+(?:\.\d+)?)\s*"
    r"(min|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|"
    r"month|months|y|year|years)\b",
    re.IGNORECASE,
)
_BARE_HORIZON_RE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*"
    r"(min|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|"
    r"month|months|y|year|years)\b",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\bby\s+(20[2-9]\d)\b", re.IGNORECASE)


def _detect_target(message: str) -> Optional[str]:
    """Best-effort extraction of a forecast target (a crypto ticker/asset).

    Reuses the prediction engine's ticker map when importable; otherwise a small
    built-in set so detection still works if the engine is absent."""
    ql = (message or "").lower()
    ticker_map = {}
    if _prediction is not None:
        ticker_map = getattr(_prediction, "_TICKER_TO_ID", {}) or {}
    if not ticker_map:
        ticker_map = {
            "btc": 1, "bitcoin": 1, "eth": 1, "ethereum": 1, "xrp": 1,
            "ripple": 1, "sol": 1, "solana": 1, "doge": 1, "dogecoin": 1,
        }
    for tok in re.findall(r"[a-z\-]+", ql):
        if tok in ticker_map:
            return tok
    return None


def _detect_horizon(message: str) -> tuple[Optional[str], Optional[float]]:
    """Return ``(label, horizon_hours)`` parsed from the message, or (None, None).

    Prefers the prediction engine's own parser (so chat and engine agree) and
    falls back to a local regex when the engine is unavailable."""
    q = message or ""
    hours: Optional[float] = None
    if _prediction is not None and hasattr(_prediction, "_parse_horizon_hours"):
        try:
            hours = _prediction._parse_horizon_hours(q)  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            hours = None
    if hours is None:
        hours = _local_horizon_hours(q)
    if hours is None:
        return None, None
    return _label(hours), hours


def _local_horizon_hours(q: str) -> Optional[float]:
    m = _HORIZON_RE.search(q) or _BARE_HORIZON_RE.search(q)
    if m:
        n = float(m.group(1))
        unit = m.group(2).lower()
        if unit.startswith("min"):
            return n / 60.0
        if unit in ("h", "hr", "hrs", "hour", "hours"):
            return n
        if unit in ("d", "day", "days"):
            return n * 24.0
        if unit in ("w", "week", "weeks"):
            return n * 24.0 * 7.0
        if unit.startswith("month"):
            return n * 24.0 * 30.0
        if unit in ("y", "year", "years"):
            return n * 24.0 * 365.25
    ym = _YEAR_RE.search(q)
    if ym:
        import time

        target_year = int(ym.group(1))
        now_year = time.gmtime().tm_year
        if target_year > now_year:
            return (target_year - now_year) * 365.25 * 24.0
    return None


def _label(hours: Optional[float]) -> Optional[str]:
    if hours is None:
        return None
    if hours < 1:
        return f"{hours * 60:.0f} min"
    if hours < 48:
        return f"{hours:.0f}h"
    if hours < 24 * 60:
        return f"{hours / 24:.1f}d"
    return f"{hours / 24 / 365.25:.2f}y"


def detect_prediction_intent(message: str) -> tuple[bool, dict[str, Any]]:
    """Heuristic: is this chat message asking for a forecast?

    Returns ``(is_prediction, extracted)`` where ``extracted`` carries the
    best-effort ``{target, horizon, horizon_hours}``. Intent fires when a
    forecasting verb/phrase is present, OR a recognised asset is paired with a
    horizon phrase (e.g. "btc in 24h"). Never raises."""
    extracted: dict[str, Any] = {"target": None, "horizon": None, "horizon_hours": None}
    try:
        q = (message or "").strip()
        if not q:
            return False, extracted
        ql = q.lower()

        target = _detect_target(q)
        label, hours = _detect_horizon(q)
        extracted["target"] = target
        extracted["horizon"] = label
        extracted["horizon_hours"] = hours

        has_verb = any(w in ql for w in _PREDICT_WORDS)
        # An asset + a horizon clause is itself a forecast request.
        asset_with_horizon = bool(target) and hours is not None
        is_pred = bool(has_verb or asset_with_horizon)
        return is_pred, extracted
    except Exception:  # noqa: BLE001 - detection must never raise
        return False, extracted


def _fmt_value(v: Any) -> str:
    if isinstance(v, (int, float)):
        av = abs(v)
        if av != 0 and (av < 0.01 or av >= 1_000_000):
            return f"{v:.4g}"
        return f"{v:,.2f}"
    if isinstance(v, dict):
        return ", ".join(f"{k}={_fmt_value(val)}" for k, val in v.items())
    return str(v)


def _compose_answer(pred: dict, extracted: dict) -> str:
    """Compose a terse, grounded NL answer from a prediction-engine result."""
    domain = pred.get("domain") or "generic"
    target = pred.get("target") or extracted.get("target") or "the target"
    horizon = pred.get("horizon") or extracted.get("horizon")
    prediction = pred.get("prediction") or {}
    method = (pred.get("method") or {}).get("name") or "model"

    point = prediction.get("point_estimate", prediction.get("value"))
    unit = prediction.get("unit") or ""
    interval = prediction.get("interval") or {}
    lo = interval.get("low")
    hi = interval.get("high")
    conf = interval.get("confidence")
    prob = prediction.get("probability")

    # insufficient-data path: be honest, surface what's needed.
    if point is None and prob is None:
        caveats = pred.get("caveats") or []
        need = caveats[0] if caveats else "more data is required."
        lines = [
            f"PREDICTION · {target}" + (f" · {horizon}" if horizon else ""),
            f"Insufficient data to forecast: {need}",
            HONESTY_LINE,
        ]
        return "\n".join(lines)

    head = f"PREDICTION · {target}" + (f" · {horizon}" if horizon else "") + f" · {domain}"
    lines = [head]

    if point is not None:
        unit_str = f" {unit}" if unit and unit not in ("probability",) else ""
        lines.append(f"Point estimate: {_fmt_value(point)}{unit_str} (via {method}).")
    if lo is not None and hi is not None:
        conf_str = f" at {conf:.0%} confidence" if isinstance(conf, (int, float)) and conf else ""
        lines.append(f"Calibrated interval: [{_fmt_value(lo)}, {_fmt_value(hi)}]{conf_str}.")
    if isinstance(prob, (int, float)):
        if unit == "probability":
            lines.append(f"Probability: {prob:.1%}.")
        else:
            lines.append(f"Directional probability (P up): {prob:.1%}.")

    # conviction, when the engine surfaced one in drivers.
    drivers = pred.get("drivers") or {}
    conviction = drivers.get("conviction")
    if conviction is not None:
        lines.append(f"Conviction: {_fmt_value(conviction)}.")

    lines.append(HONESTY_LINE)
    return "\n".join(lines)


def answer_with_prediction(message: str, params: Optional[dict] = None) -> dict:
    """If ``message`` is a forecast request, run the prediction engine and format
    a grounded NL answer. Never raises; never touches the network itself.

    Returns ``{handled: True, answer, prediction, extracted}`` when a prediction
    was produced (including an honest insufficient-data answer), else
    ``{handled: False, extracted}`` so the caller routes to the normal analyst.
    """
    is_pred, extracted = detect_prediction_intent(message)
    if not is_pred:
        return {"handled": False, "extracted": extracted}
    if _prediction is None:
        return {
            "handled": False,
            "extracted": extracted,
            "note": "prediction engine not importable in this process",
        }

    call_params: dict[str, Any] = dict(params or {})
    if extracted.get("target") and "target" not in call_params:
        call_params["target"] = extracted["target"]
    if extracted.get("horizon_hours") is not None and "horizon_hours" not in call_params:
        call_params["horizon_hours"] = extracted["horizon_hours"]

    try:
        pred = _prediction.predict(message, call_params)
    except Exception as exc:  # noqa: BLE001 - engine is guarded but be safe
        return {
            "handled": True,
            "answer": (
                "PREDICTION could not complete: the engine errored and was "
                f"handled gracefully ({type(exc).__name__}).\n" + HONESTY_LINE
            ),
            "prediction": None,
            "extracted": extracted,
        }

    if not isinstance(pred, dict):
        return {"handled": False, "extracted": extracted}

    try:
        answer = _compose_answer(pred, extracted)
    except Exception:  # noqa: BLE001 - formatting must never raise
        answer = "PREDICTION produced a result.\n" + HONESTY_LINE

    return {"handled": True, "answer": answer, "prediction": pred, "extracted": extracted}


def route(message: str) -> dict:
    """Lightweight router: classify a chat message as ``prediction`` or ``other``
    so the UI/chat can decide where to send it. Never raises."""
    is_pred, extracted = detect_prediction_intent(message)
    return {
        "intent": "prediction" if is_pred else "other",
        "is_prediction": bool(is_pred),
        "target": extracted.get("target"),
        "horizon": extracted.get("horizon"),
        "horizon_hours": extracted.get("horizon_hours"),
    }
