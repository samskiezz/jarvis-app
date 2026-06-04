"""Offline, deterministic, fast tests for the PATTERN ORACLE :class:`OracleModel`.

NO network, NO API key, seeded RNG, synthetic series with an EMBEDDED learnable
signal. Run from the repo root:

    python3 -m pytest server/tests/test_oracle_model.py -q

Asserts:
  * train + predict returns the full conviction dict with valid ranges;
  * on the learnable signal the HIGH-CONVICTION subset beats all-bars dir-acc
    (conviction works — the central design claim);
  * volatility head R^2 > 0;
  * save/load round-trips.
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np  # noqa: E402

from server.services.oracle_model import (  # noqa: E402
    OracleDataset,
    OracleModel,
    evaluate,
    purged_time_folds,
)


def _signal_series(n=2600, seed=7, phi=0.55, sigma_base=0.004):
    """AR(1)-in-returns price series with STATE-DEPENDENT volatility.

    Returns carry an AR(1) signal (so direction is partly predictable from
    lagged returns) and the noise scale is modulated by a slow latent regime
    (so |return| / volatility is strongly predictable). Both make the model's
    two genuinely-predictable heads (direction-on-conviction, volatility) work.
    """
    rng = np.random.default_rng(seed)
    # slow regime drives the volatility scale (predictable from recent rvol)
    regime = np.cumsum(rng.normal(0, 1, n))
    vol_scale = sigma_base * (1.0 + 1.6 * (np.sin(regime / 40.0) * 0.5 + 0.5))
    r = np.zeros(n)
    eps = rng.normal(0, 1, n) * vol_scale
    r[0] = eps[0]
    for t in range(1, n):
        r[t] = phi * r[t - 1] + eps[t]
    price = 50.0 * np.exp(np.cumsum(r))
    t0 = 1_600_000_000_000
    step = 86_400_000  # daily
    return [{"t": t0 + i * step, "v": float(price[i])} for i in range(n)]


def _build_dataset(horizon=1, seeds=(1, 2, 3, 4)):
    series_map = {f"SYN:{s}": _signal_series(n=2200, seed=s) for s in seeds}
    return series_map, OracleDataset.from_series_map(series_map, horizon_steps=horizon)


# ── purged CV sanity ──────────────────────────────────────────────────────────
def test_purged_folds_no_overlap_and_embargo():
    folds = list(purged_time_folds(1000, n_folds=4, embargo=5))
    assert folds, "expected folds"
    for tr, va in folds:
        assert tr.max() < va.min(), "train must precede val (forward-chaining)"
        # embargo gap honored
        assert va.min() - tr.max() >= 1


# ── (a) contract ──────────────────────────────────────────────────────────────
def test_train_and_predict_contract():
    series_map, ds = _build_dataset()
    assert len(ds) > 500
    train_ds, _ = ds.time_split(0.2)
    model = OracleModel(horizon_steps=1, act_threshold=0.2)
    rep = model.train(train_ds, hyperparam_search=True, ret_series_map=series_map)
    assert rep["status"] == "trained", rep
    assert rep["n_features"] > 0

    out = model.predict(series_map["SYN:1"], horizon_steps=1)
    assert out["status"] == "ok", out
    assert 0.0 <= out["prob_up"] <= 1.0
    assert 0.0 <= out["conviction"] <= 1.0
    assert out["vol_pred"] >= 0.0
    assert isinstance(out["act"], bool)
    assert out["direction"] in ("up", "down")
    # level head was trained -> point + interval present
    assert out["point"] is not None
    assert out["interval"]["low"] < out["point"] < out["interval"]["high"]


# ── (b) CONVICTION WORKS — high-conviction beats all-bars ─────────────────────
def test_conviction_subset_beats_all_bars():
    series_map, ds = _build_dataset()
    train_ds, test_ds = ds.time_split(0.25)
    model = OracleModel(horizon_steps=1)
    model.train(train_ds, hyperparam_search=True)
    sc = evaluate(model, test_ds)

    all_acc = sc["all_bars_dir_acc"]
    # top-10% conviction slice must beat the all-bars baseline
    top10 = next(r for r in sc["dir_acc_top_conviction"] if r["top_frac"] == 0.10)
    assert top10["dir_acc"] > all_acc, (top10, all_acc)
    # and beat a coin flip on the selective subset
    assert top10["dir_acc"] > 0.5


# ── (c) volatility head has real skill ────────────────────────────────────────
def test_volatility_r2_positive():
    series_map, ds = _build_dataset()
    train_ds, test_ds = ds.time_split(0.25)
    model = OracleModel(horizon_steps=1)
    model.train(train_ds, hyperparam_search=False)
    sc = evaluate(model, test_ds)
    assert sc["vol_r2"] > 0.0, sc["vol_r2"]
    assert sc["vol_corr"] > 0.0


# ── (d) save / load round-trip ────────────────────────────────────────────────
def test_save_load_roundtrip():
    series_map, ds = _build_dataset()
    train_ds, _ = ds.time_split(0.2)
    model = OracleModel(horizon_steps=1)
    model.train(train_ds, hyperparam_search=False, ret_series_map=series_map)

    out1 = model.predict(series_map["SYN:1"])
    with tempfile.TemporaryDirectory() as d:
        p = str(Path(d) / "oracle.joblib")
        model.save(p)
        loaded = OracleModel.load(p)
    out2 = loaded.predict(series_map["SYN:1"])
    assert loaded.fitted
    assert abs(out1["prob_up"] - out2["prob_up"]) < 1e-9
    assert abs(out1["vol_pred"] - out2["vol_pred"]) < 1e-9


# ── (e) online update keeps the model fitted ──────────────────────────────────
def test_online_update():
    series_map, ds = _build_dataset()
    train_ds, rest = ds.time_split(0.5)
    model = OracleModel(horizon_steps=1)
    model.train(train_ds, hyperparam_search=False)
    rep = model.update(rest, prior=train_ds, rolling_window=5000)
    assert rep["status"] == "trained"
    assert rep["mode"] == "online_update"
    assert model.fitted
