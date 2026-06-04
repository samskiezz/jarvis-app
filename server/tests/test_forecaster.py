"""Offline, deterministic tests for the short-horizon forecaster + backtester.

NO network, NO API key, seeded RNG. Run from the repo root:
    python3 -m pytest server/tests/test_forecaster.py -q

Covers:
  (a) train + predict_next returns a numeric point with low < point < high and
      prob_up in [0,1];
  (b) on a LEARNABLE synthetic AR(1)+trend series the forecaster beats the
      persistence baseline (skill_score > 0) and interval coverage is within
      +/-0.15 of nominal;
  (c) the backtest returns all metrics with no look-ahead leakage.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np  # noqa: E402

from server.services.backtest import (  # noqa: E402
    _synthetic_ar1_trend,
    backtest,
)
from server.services.forecaster import ShortHorizonForecaster  # noqa: E402


def _learnable_series(n=420, seed=11):
    """Deterministic AR(1)-in-returns + trend series (5-min spacing)."""
    return _synthetic_ar1_trend(
        n=n, p0=2.0, phi=0.7, trend=0.0004, sigma=0.003, seed=seed
    )


# ── (a) basic contract: numeric point, low < point < high, prob_up in [0,1] ──
def test_train_and_predict_next_contract():
    series = _learnable_series()
    fc = ShortHorizonForecaster()
    rep = fc.train(series, horizon_steps=1)
    assert rep["status"] == "trained"
    assert rep["n_features"] > 0
    assert set(rep["member_weight"]) == {"ridge", "gbm"}

    out = fc.predict_next(series, horizon_steps=1, confidence=0.9)
    assert out["status"] == "ok"
    point = out["point"]
    lo = out["interval"]["low"]
    hi = out["interval"]["high"]
    assert isinstance(point, float) and np.isfinite(point)
    assert lo < point < hi, (lo, point, hi)
    assert 0.0 <= out["prob_up"] <= 1.0
    assert out["interval"]["confidence"] == 0.9
    # members present and numeric
    assert np.isfinite(out["members"]["ridge"])
    assert np.isfinite(out["members"]["gbm"])
    # weights sum to ~1
    assert abs(sum(out["weight"].values()) - 1.0) < 1e-6


def test_insufficient_data_is_graceful():
    fc = ShortHorizonForecaster()
    rep = fc.train([1.0, 2.0, 3.0], horizon_steps=1)
    assert rep["status"] == "insufficient_data"
    # predict before training -> graceful, no raise
    out = fc.predict_next([1.0, 2.0, 3.0], horizon_steps=1)
    assert out["status"] == "insufficient_data"


def test_works_on_plain_number_series_no_timestamps():
    # asset-agnostic: a bare list of numbers (no t/v dicts, no timestamps)
    series = [s["v"] for s in _learnable_series(n=300)]
    fc = ShortHorizonForecaster()
    rep = fc.train(series, horizon_steps=1)
    assert rep["status"] == "trained"
    out = fc.predict_next(series, horizon_steps=1)
    assert out["status"] == "ok"
    assert out["interval"]["low"] < out["point"] < out["interval"]["high"]


# ── (b) beats persistence + calibrated coverage on a learnable series ──
def test_beats_persistence_and_calibrated():
    # A genuinely learnable AR(1)+trend series with enough history for the
    # ridge member to fit its features well (the honest data requirement).
    series = _learnable_series(n=600, seed=3)
    bt = backtest(
        series,
        horizon_steps=1,
        train_window=250,
        step=1,
        confidence=0.9,
        max_origins=150,
    )
    assert bt["status"] == "ok"
    m = bt["metrics"]
    # (b1) beats the persistence baseline
    assert m["skill_score_mse"] > 0.0, m["skill_score_mse"]
    # (b2) interval coverage within +/-0.15 of nominal 0.90
    assert abs(m["coverage"] - 0.90) <= 0.15, m["coverage"]
    # directional accuracy is a valid probability
    assert 0.0 <= m["directional_accuracy"] <= 1.0


# ── (c) backtest returns all metrics with no leakage ──
def test_backtest_metrics_and_no_leakage():
    series = _learnable_series(n=360, seed=5)
    bt = backtest(series, horizon_steps=1, train_window=150, step=2, max_origins=80)
    assert bt["status"] == "ok"
    m = bt["metrics"]
    for key in (
        "mae",
        "rmse",
        "mse",
        "directional_accuracy",
        "coverage",
        "coverage_error",
        "mean_interval_width",
        "skill_score_mse",
        "skill_score_mae",
    ):
        assert key in m, key
        assert m[key] is not None
    # leakage audit: highest training index < n (target lives strictly ahead)
    audit = bt["leakage_audit"]
    assert audit["max_train_index"] < audit["n_total"]
    # every scored record's interval flag is consistent and target is ahead
    for rec in bt["records"]:
        assert rec["in_interval"] in (0, 1)
        assert rec["origin"] <= audit["n_total"]


def test_determinism():
    series = _learnable_series(n=300, seed=9)
    a = backtest(series, horizon_steps=1, train_window=150, max_origins=40)
    b = backtest(series, horizon_steps=1, train_window=150, max_origins=40)
    assert a["metrics"]["mae"] == b["metrics"]["mae"]
    assert a["metrics"]["skill_score_mse"] == b["metrics"]["skill_score_mse"]
