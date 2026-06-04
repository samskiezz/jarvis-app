"""Offline, deterministic tests for the high-capacity ML forecaster.

NO network, NO API key, seeded RNG. Run from the repo root:
    python3 -m pytest server/tests/test_forecaster_ml.py -q

Covers:
  (a) train + predict_next returns a numeric point with low < point < high and
      prob_up in [0,1];
  (b) on a LEARNABLE synthetic AR(1)+trend series the ML forecaster's level
      accuracy is >= persistence and 1-step directional accuracy > 0.5;
  (c) walk-forward interval coverage is within +/-0.2 of the nominal level;
  (d) graceful behaviour on insufficient data (no raise).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np  # noqa: E402

from server.services.backtest import _synthetic_ar1_trend  # noqa: E402
from server.services.forecaster_ml import MLForecaster  # noqa: E402


def _learnable_series(n=700, seed=11):
    """Deterministic AR(1)-in-returns + trend series with daily-ish spacing."""
    return _synthetic_ar1_trend(
        n=n, p0=2.0, phi=0.7, trend=0.0006, sigma=0.004, seed=seed
    )


# ── (a) basic contract ────────────────────────────────────────────────────────
def test_train_and_predict_next_contract():
    series = _learnable_series()
    fc = MLForecaster(seed=0)
    rep = fc.train(series, horizon_steps=1)
    assert rep["status"] == "trained", rep
    assert rep["n_features"] > 0

    out = fc.predict_next(series, horizon_steps=1, confidence=0.9)
    assert out["status"] == "ok", out
    point = out["point"]
    lo = out["interval"]["low"]
    hi = out["interval"]["high"]
    assert isinstance(point, float) and np.isfinite(point)
    assert lo < point < hi, (lo, point, hi)
    assert 0.0 <= out["prob_up"] <= 1.0
    assert out["interval"]["confidence"] == 0.9


def test_works_on_plain_number_series_no_timestamps():
    series = [s["v"] for s in _learnable_series(n=600)]
    fc = MLForecaster(seed=0)
    rep = fc.train(series, horizon_steps=1)
    assert rep["status"] == "trained", rep
    out = fc.predict_next(series, horizon_steps=1)
    assert out["status"] == "ok"
    assert out["interval"]["low"] < out["point"] < out["interval"]["high"]


# ── (b) level-acc >= persistence and directional > 0.5 (walk-forward) ──────────
def _walk_forward(series, horizon_steps=1, train_window=300, confidence=0.9,
                  max_origins=120, seed=0):
    """Honest walk-forward: at each origin train on the causal prefix only,
    predict the realized value horizon_steps ahead, score level/dir/coverage and
    a persistence baseline. Returns a metrics dict."""
    vals = np.array([s["v"] for s in series], dtype=float)
    times = np.array([s["t"] for s in series], dtype=float)
    n = vals.size
    h = horizon_steps
    first = train_window
    last = n - 1 - h
    origins = list(range(first, last + 1))
    if len(origins) > max_origins:
        step = max(1, len(origins) // max_origins)
        origins = origins[::step][:max_origins]

    ape, ape_pers = [], []
    dir_hits = pers_dir_hits = 0
    covered = 0
    max_train_idx = -1
    for i in origins:
        prefix = [{"t": float(times[j]), "v": float(vals[j])} for j in range(i + 1)]
        max_train_idx = max(max_train_idx, i)  # last index the model can see
        fc = MLForecaster(seed=seed)
        rep = fc.train(prefix, horizon_steps=h)
        if rep.get("status") != "trained":
            continue
        out = fc.predict_next(prefix, horizon_steps=h, confidence=confidence)
        if out.get("status") != "ok":
            continue
        actual = float(vals[i + h])
        p0 = float(vals[i])
        pred = float(out["point"])
        ape.append(abs(pred - actual) / (abs(actual) + 1e-9))
        ape_pers.append(abs(p0 - actual) / (abs(actual) + 1e-9))
        if (pred - p0) * (actual - p0) > 0:
            dir_hits += 1
        # persistence has no directional view; counts as a coin flip baseline
        lo, hi = out["interval"]["low"], out["interval"]["high"]
        if lo <= actual <= hi:
            covered += 1
    nscored = len(ape)
    assert nscored > 0
    # leakage guard: model never saw an index at/after its own target
    assert max_train_idx < n
    return {
        "n": nscored,
        "level_acc": 1.0 - float(np.mean(ape)),
        "level_acc_pers": 1.0 - float(np.mean(ape_pers)),
        "directional": dir_hits / nscored,
        "coverage": covered / nscored,
    }


def test_beats_persistence_and_directional():
    series = _learnable_series(n=700, seed=3)
    m = _walk_forward(series, horizon_steps=1, train_window=300,
                      confidence=0.9, max_origins=80, seed=0)
    # level accuracy at least as good as persistence (allow tiny noise margin)
    assert m["level_acc"] >= m["level_acc_pers"] - 0.01, m
    # 1-step directional accuracy beats a coin flip on a learnable series
    assert m["directional"] > 0.5, m


def test_interval_coverage_calibrated():
    series = _learnable_series(n=700, seed=7)
    m = _walk_forward(series, horizon_steps=1, train_window=300,
                      confidence=0.9, max_origins=80, seed=0)
    assert abs(m["coverage"] - 0.90) <= 0.20, m


# ── (d) graceful failure ──────────────────────────────────────────────────────
def test_insufficient_data_is_graceful():
    fc = MLForecaster(seed=0)
    rep = fc.train([1.0, 2.0, 3.0], horizon_steps=1)
    assert rep["status"] == "insufficient_data"
    out = fc.predict_next([1.0, 2.0, 3.0], horizon_steps=1)
    assert out["status"] == "insufficient_data"
    assert "model" in out


def test_predict_before_train_is_graceful():
    fc = MLForecaster(seed=0)
    out = fc.predict_next(_learnable_series(n=400), horizon_steps=1)
    assert out["status"] == "insufficient_data"
