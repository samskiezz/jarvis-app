"""Offline, deterministic tests for the pooled cross-sectional S&P 500 trainer.

NO network, NO API key, seeded RNG. Synthetic per-"ticker" price series are
injected directly via ``series_map`` so ``build_dataset`` never touches Yahoo.
Run from the repo root:

    python3 -m pytest server/tests/test_train_sp500.py -q

Covers:
  (a) build_dataset pools several synthetic tickers into one cross-sectional set
      and the strict TIME split has NO leakage (max train date < min test date);
  (b) train_global fits ONE global model and evaluate_global returns FINITE
      metrics with directional in [0,1] and coverage in [0,1];
  (c) per-sector breakdown is produced and well-formed;
  (d) graceful behaviour on empty / unusable input (no raise).
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np  # noqa: E402
import pytest  # noqa: E402

from server.services.train_sp500 import (  # noqa: E402
    build_dataset,
    evaluate_global,
    train_global,
)

_DAY_MS = 86_400_000.0


def _synth_series(n=420, p0=50.0, phi=0.6, trend=0.0004, sigma=0.006, seed=0):
    """Deterministic AR(1)-in-returns + small trend positive price series with
    daily timestamps -> [{"t": ms, "v": price}, ...]."""
    rng = np.random.default_rng(seed)
    r = 0.0
    price = float(p0)
    out = []
    t0 = 1_600_000_000_000  # fixed epoch ms (deterministic)
    for i in range(n):
        eps = float(rng.normal(0.0, sigma))
        r = phi * r + eps + trend
        price = max(0.01, price * math.exp(r))
        out.append({"t": int(t0 + i * _DAY_MS), "v": price})
    return out


def _series_map(n_tickers=6, n=420):
    """A small basket of synthetic tickers across two sectors (aligned dates)."""
    smap = {}
    sectors = {}
    for k in range(n_tickers):
        sym = f"SYN{k}"
        smap[sym] = _synth_series(
            n=n, p0=20.0 + 8.0 * k, phi=0.5 + 0.05 * k,
            trend=0.0003 + 0.0001 * k, sigma=0.005 + 0.0005 * k, seed=100 + k,
        )
        sectors[sym] = "SectorA" if k % 2 == 0 else "SectorB"
    return smap, sectors


# ── (a) pooled dataset + strict no-leakage time split ─────────────────────────
def test_build_dataset_pools_and_time_split_has_no_leakage():
    smap, sectors = _series_map()
    ds = build_dataset(
        list(smap.keys()),
        horizon_steps=1,
        series_map=smap,
        sector_map=sectors,
        test_fraction=0.20,
    )
    assert ds["n_stocks"] == len(smap)
    assert ds["n_rows"] > 0
    assert ds["n_train"] > 0 and ds["n_test"] > 0
    assert ds["X"].shape[0] == ds["n_rows"]
    assert ds["X"].shape[1] == len(ds["feature_names"]) > 0

    # STRICT no-leakage: every train origin must be strictly older than every
    # test origin on the pooled timeline.
    times = ds["times"]
    tr, te = ds["train_mask"], ds["test_mask"]
    assert times[tr].max() < times[te].min(), "train/test time split leaks"
    # masks partition the rows
    assert int(tr.sum() + te.sum()) == ds["n_rows"]
    assert not np.any(tr & te)


# ── (b) global train + honest finite metrics ──────────────────────────────────
def test_train_global_and_evaluate_returns_finite_bounded_metrics():
    smap, sectors = _series_map()
    ds = build_dataset(
        list(smap.keys()), horizon_steps=1, series_map=smap, sector_map=sectors
    )
    model = train_global(ds, fast=True)
    assert model["point"] is not None
    assert set(model["q_models"].keys()) == {0.05, 0.5, 0.95}
    assert model["n_fit"] == ds["n_train"]

    m = evaluate_global(ds, model)
    assert m["n_test"] == ds["n_test"]

    # directional accuracy and coverage are probabilities in [0,1]
    assert m["directional_acc"] is not None
    assert 0.0 <= m["directional_acc"] <= 1.0
    assert 0.0 <= m["coverage"] <= 1.0

    # level accuracies and skill must be finite numbers
    for key in ("level_acc", "level_acc_persist", "skill_vs_persist"):
        assert m[key] is not None and math.isfinite(m[key]), key

    # HONESTY guard: this is near-random-walk synthetic data; directional must
    # NOT be a fabricated near-perfect number.
    assert m["directional_acc"] < 0.95, "implausibly high directional acc (fabricated?)"


# ── (c) per-sector breakdown ──────────────────────────────────────────────────
def test_per_sector_breakdown_is_wellformed():
    smap, sectors = _series_map()
    ds = build_dataset(
        list(smap.keys()), horizon_steps=1, series_map=smap, sector_map=sectors
    )
    model = train_global(ds, fast=True)
    m = evaluate_global(ds, model)
    by_sector = m["by_sector"]
    assert set(by_sector.keys()) <= {"SectorA", "SectorB"}
    assert by_sector, "expected at least one sector"
    total_n = sum(s["n"] for s in by_sector.values())
    assert total_n == ds["n_test"]
    for s in by_sector.values():
        assert s["n"] > 0
        if s["directional_acc"] is not None:
            assert 0.0 <= s["directional_acc"] <= 1.0
        assert 0.0 <= s["coverage"] <= 1.0


# ── (d) graceful on empty / unusable input ────────────────────────────────────
def test_build_dataset_empty_is_graceful():
    ds = build_dataset(["NOPE"], horizon_steps=1, series_map={"NOPE": []})
    assert ds["n_stocks"] == 0
    assert ds["n_rows"] == 0
    assert ds["n_train"] == 0 and ds["n_test"] == 0
    # train_global on an empty pooled set raises a clear ValueError (not a crash)
    with pytest.raises(ValueError):
        train_global(ds)
