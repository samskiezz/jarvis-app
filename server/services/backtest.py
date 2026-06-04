"""Walk-forward (rolling-origin) TESTER for the short-horizon forecaster.

Implements the BACKTESTING harness from
``docs/PATTERN_ORACLE/08_SELF_IMPROVEMENT_AND_MLOPS.md`` §6/§14: rolling-origin
evaluation with strict leakage guards (each origin trains on the trailing
window only, then predicts ``horizon_steps`` ahead and is scored against the
realized value). Reports the skill scorecard:

  - MAE, RMSE                              (§1.3.1/1.3.2)
  - directional accuracy                   (sign of move vs realized sign)
  - interval coverage (PICP)               (§1.3.4, should ≈ confidence)
  - skill score vs persistence baseline    (§1.3.5: 1 − MSE_model/MSE_persist)

``five_minute_test`` loads a REAL ~5-minute crypto series from CoinGecko
(``market_chart?days=1`` returns ~5-min granularity, free & keyless) by reusing
``prediction.load_crypto_series``, trains, and backtests 1-step-ahead (= 5 min).
If the network is unavailable it falls back to a supplied or synthetic series
and SAYS SO honestly in the result (``source`` / ``honest_note``).

Pure numpy / math only.
"""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence

import numpy as np

from . import prediction as P
from .forecaster import ShortHorizonForecaster, _as_values_times


def backtest(
    series: Sequence,
    *,
    horizon_steps: int = 1,
    train_window: int = 200,
    step: int = 1,
    confidence: float = 0.9,
    forecaster_kwargs: Optional[dict] = None,
    max_origins: Optional[int] = None,
) -> dict:
    """Rolling-origin walk-forward backtest.

    At each origin ``t`` (advancing by ``step``), the forecaster is trained on
    ``series[t-train_window : t]`` (PAST ONLY) and predicts the value
    ``horizon_steps`` ahead; the prediction is compared to the realized
    ``series[t-1 + horizon_steps]``. No future data ever enters a train window
    (leakage guard), and the realized target is strictly outside the window.

    Returns a metrics dict + per-origin records.
    """
    values, times = _as_values_times(series)
    values = values[np.isfinite(values)]
    n = values.size
    h = int(max(1, horizon_steps))
    step = int(max(1, step))
    fk = dict(forecaster_kwargs or {})

    fc = ShortHorizonForecaster(**fk)
    min_train = fc._min_len(h)
    train_window = int(max(train_window, min_train))

    if n < train_window + h:
        return {
            "status": "insufficient_data",
            "reason": (
                f"need >= train_window+horizon = {train_window + h} points, got {n}"
            ),
            "n": int(n),
        }

    # first origin: the index of the FIRST point NOT in the initial train window.
    # train window = values[t-train_window : t]; target = values[t-1+h].
    # require t-1+h <= n-1  ->  t <= n-h.
    origins = list(range(train_window, n - h + 1, step))
    if max_origins is not None and len(origins) > max_origins:
        # keep the most RECENT origins (most relevant skill estimate)
        origins = origins[-int(max_origins):]

    preds: list[float] = []
    actuals: list[float] = []
    p0s: list[float] = []
    lows: list[float] = []
    highs: list[float] = []
    records: list[dict] = []
    max_train_end = -1  # leakage audit: highest index ever visible in training

    for t in origins:
        train_lo = t - train_window
        train_vals = values[train_lo:t]
        train_times = times[train_lo:t] if times is not None else None
        train_series = _pack(train_vals, train_times)

        # leakage guard: training data ends strictly before the target index
        target_idx = (t - 1) + h
        assert train_lo + train_window - 1 < target_idx, "look-ahead leakage!"
        max_train_end = max(max_train_end, t - 1)

        rep = fc.train(train_series, horizon_steps=h)
        if rep.get("status") != "trained":
            continue
        out = fc.predict_next(train_series, horizon_steps=h, confidence=confidence)
        if out.get("status") != "ok":
            continue

        p0 = float(train_vals[-1])
        actual = float(values[target_idx])
        point = float(out["point"])
        lo = float(out["interval"]["low"])
        hi = float(out["interval"]["high"])

        preds.append(point)
        actuals.append(actual)
        p0s.append(p0)
        lows.append(lo)
        highs.append(hi)
        records.append(
            {
                "origin": int(t),
                "p0": p0,
                "point": point,
                "actual": actual,
                "low": lo,
                "high": hi,
                "in_interval": int(lo <= actual <= hi),
                "prob_up": float(out.get("prob_up", 0.5)),
            }
        )

    if not preds:
        return {
            "status": "insufficient_data",
            "reason": "no origin produced a scorable forecast",
            "n": int(n),
        }

    yp = np.asarray(preds)
    ya = np.asarray(actuals)
    y0 = np.asarray(p0s)
    lo = np.asarray(lows)
    hi = np.asarray(highs)

    err = yp - ya
    mae = float(np.mean(np.abs(err)))
    mse = float(np.mean(err ** 2))
    rmse = float(math.sqrt(mse))

    # directional accuracy: sign of predicted move vs sign of realized move
    pred_dir = np.sign(yp - y0)
    real_dir = np.sign(ya - y0)
    nonzero = real_dir != 0
    dir_acc = (
        float(np.mean(pred_dir[nonzero] == real_dir[nonzero]))
        if nonzero.any()
        else float("nan")
    )

    # interval coverage (PICP)
    coverage = float(np.mean((ya >= lo) & (ya <= hi)))
    mpiw = float(np.mean(hi - lo))

    # persistence baseline: y_hat = last value (p0)
    persist_err = y0 - ya
    mse_persist = float(np.mean(persist_err ** 2))
    mae_persist = float(np.mean(np.abs(persist_err)))
    skill_mse = 1.0 - (mse / mse_persist) if mse_persist > 0 else float("nan")
    skill_mae = 1.0 - (mae / mae_persist) if mae_persist > 0 else float("nan")

    return {
        "status": "ok",
        "n": int(n),
        "n_origins": len(preds),
        "horizon_steps": h,
        "train_window": train_window,
        "step": step,
        "confidence": confidence,
        "metrics": {
            "mae": mae,
            "rmse": rmse,
            "mse": mse,
            "directional_accuracy": dir_acc,
            "coverage": coverage,
            "nominal_coverage": confidence,
            "coverage_error": coverage - confidence,
            "mean_interval_width": mpiw,
            "mae_persistence": mae_persist,
            "rmse_persistence": float(math.sqrt(mse_persist)),
            "skill_score_mse": skill_mse,
            "skill_score_mae": skill_mae,
        },
        "leakage_audit": {
            "max_train_index": int(max_train_end),
            "n_total": int(n),
            "note": "each train window ends strictly before its target index",
        },
        "records": records,
    }


def _pack(values: np.ndarray, times: Optional[np.ndarray]) -> list:
    if times is not None and times.size == values.size:
        return [{"t": float(t), "v": float(v)} for t, v in zip(times, values)]
    return [float(v) for v in values]


def _synthetic_ar1_trend(
    n: int = 400,
    *,
    p0: float = 1.0,
    phi: float = 0.6,
    trend: float = 0.0003,
    sigma: float = 0.004,
    seed: int = 7,
) -> list[dict]:
    """A deterministic, *learnable* AR(1)-in-returns price series with drift.

    Log-returns follow r_t = trend + phi*(r_{t-1}-trend) + eps_t. The AR(1)
    structure is exactly what the lagged-return ridge features can exploit, so a
    competent forecaster should beat persistence. 5-minute spacing timestamps.
    """
    rng = np.random.default_rng(seed)
    r = np.zeros(n)
    eps = rng.normal(0.0, sigma, n)
    r[0] = trend + eps[0]
    for t in range(1, n):
        r[t] = trend + phi * (r[t - 1] - trend) + eps[t]
    prices = p0 * np.exp(np.cumsum(r))
    t0 = 1_700_000_000_000  # ms
    five_min = 5 * 60 * 1000
    return [{"t": t0 + i * five_min, "v": float(v)} for i, v in enumerate(prices)]


def five_minute_test(
    asset: str = "xrp",
    *,
    horizon_steps: int = 1,
    train_window: int = 150,
    step: int = 1,
    confidence: float = 0.9,
    series: Optional[Sequence] = None,
    max_origins: Optional[int] = 60,
) -> dict:
    """Load a REAL ~5-minute crypto series, train, and backtest 1-step (=5 min).

    Honest fallbacks:
      - ``series`` supplied        -> use it (source='supplied').
      - else CoinGecko days=1      -> ~5-min granularity (source='coingecko').
      - else synthetic AR(1)+trend -> source='synthetic', honest_note set.
    """
    source = None
    honest_note = None
    asset_used = asset

    if series is not None:
        loaded = list(series)
        source = "supplied"
    else:
        # CoinGecko market_chart?days=1 returns ~5-minute granularity for crypto.
        loaded = P.load_crypto_series(asset, days=1)
        if loaded and len(loaded) >= train_window + horizon_steps:
            source = f"coingecko:days=1 ({asset})"
        else:
            loaded = _synthetic_ar1_trend(n=max(400, train_window + 120))
            source = "synthetic"
            honest_note = (
                "Live 5-minute series unavailable (no network / rate limited). "
                "Free stock intraday needs an API key; crypto 5-min is free & "
                "keyless via CoinGecko market_chart?days=1. Fell back to a "
                "deterministic synthetic AR(1)+trend series to demonstrate the "
                "engine, which is asset-agnostic once trained."
            )
            asset_used = "synthetic-ar1"

    # sampling interval sanity for the result (median spacing in seconds)
    vals, times = _as_values_times(loaded)
    spacing_s = None
    if times is not None and times.size >= 2:
        diffs = np.diff(times)
        diffs = diffs[diffs > 0]
        if diffs.size:
            spacing_s = float(np.median(diffs)) / 1000.0

    bt = backtest(
        loaded,
        horizon_steps=horizon_steps,
        train_window=train_window,
        step=step,
        confidence=confidence,
        max_origins=max_origins,
    )

    # also produce a single live "next 5 minutes" prediction from the full series
    fc = ShortHorizonForecaster()
    train_rep = fc.train(loaded, horizon_steps=horizon_steps)
    live_pred = None
    if train_rep.get("status") == "trained":
        live_pred = fc.predict_next(
            loaded, horizon_steps=horizon_steps, confidence=confidence
        )

    return {
        "asset": asset_used,
        "source": source,
        "honest_note": honest_note,
        "n_points": int(vals.size),
        "sampling_interval_seconds": spacing_s,
        "horizon_steps": horizon_steps,
        "horizon_label": f"{horizon_steps} step(s) ~ "
        + (f"{(spacing_s or 300) * horizon_steps / 60:.0f} min" if spacing_s else "5 min"),
        "live_prediction": live_pred,
        "train_report": train_rep,
        "backtest": bt,
    }
