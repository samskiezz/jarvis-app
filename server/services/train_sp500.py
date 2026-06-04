"""HIGH-SCALE pooled cross-sectional training + honest backtest for the PATTERN
ORACLE forecaster across the ENTIRE S&P 500 (all ~500 constituents, not the
index).

Idea
----
Instead of fitting one model per stock, we POOL the causal feature rows of every
S&P 500 name into a single cross-sectional training set and fit ONE global
gradient-boosted model (plus quantile members for intervals). Pooling many names
gives the learner far more samples and forces it to learn signal that
*generalizes across stocks* rather than overfitting a single series — this
improves robustness/generalization.

HONESTY: pooled cross-sectional training improves robustness and generalization,
but it does NOT beat market efficiency. Real out-of-sample 1-step daily
directional accuracy lands around ~50-55%; level accuracy is barely better than
(and often statistically tied with) the persistence baseline. We report the TRUE
metrics — never a fabricated 99%.

Pipeline
--------
* ``build_dataset`` — for each ticker fetch daily history (``yahoo_daily``,
  throttled) or use an injected ``series_map`` for offline/testing, build the
  SAME causal feature matrix used by :class:`MLForecaster`
  (``forecaster_ml._supervised``), label = forward log-return over
  ``horizon_steps``, and pool all rows with a per-row UTC time index + integer
  ticker id + sector. A strict TIME-based split (train = older dates, test =
  newest ~20%, threshold computed on the GLOBAL pooled timeline) guarantees no
  look-ahead and no same-day cross-ticker leakage.
* ``train_global`` — standardize on TRAIN ONLY, fit one
  ``HistGradientBoostingRegressor`` (point/median) + quantile members
  (alpha in {0.05, 0.5, 0.95}) on the pooled train rows.
* ``evaluate_global`` — on the held-out NEWEST test rows compute pooled
  level-accuracy (1-MAPE on reconstructed price), directional accuracy, interval
  coverage, and skill-vs-persistence, plus a per-sector breakdown.

Reuses MLForecaster's feature engineering verbatim (imported, not reinvented).
"""

from __future__ import annotations

import time
from typing import Any, Optional, Sequence

import numpy as np

from .forecaster import _as_values_times
from .forecaster_ml import (
    _EPS,
    _MAX_LOOKBACK,
    _supervised,
)

# ── optional sklearn (graceful) ───────────────────────────────────────────────
try:
    from sklearn.ensemble import HistGradientBoostingRegressor

    _SKLEARN_OK = True
except Exception:  # noqa: BLE001
    _SKLEARN_OK = False


# minimum finite points a series needs before it can yield any supervised row
def _min_points(horizon_steps: int) -> int:
    return _MAX_LOOKBACK + int(horizon_steps) + 4


# ── DATASET ───────────────────────────────────────────────────────────────────
def build_dataset(
    tickers: Sequence[Any],
    *,
    horizon_steps: int = 1,
    years: int = 5,
    max_names: Optional[int] = None,
    throttle: float = 0.25,
    test_fraction: float = 0.20,
    series_map: Optional[dict[str, Sequence]] = None,
    fetcher=None,
    sector_map: Optional[dict[str, str]] = None,
    progress: bool = False,
) -> dict:
    """Build a POOLED cross-sectional supervised dataset across many tickers.

    Parameters
    ----------
    tickers
        Either a list of ticker strings, or a list of ``{"ticker", "sector"}``
        dicts (as returned by ``scrapers.sp500_constituents``).
    horizon_steps
        Forecast horizon in trading days; label is the forward log-return.
    years
        Years of daily history to request per name (mapped to a Yahoo range).
    max_names
        Cap the number of tickers processed (None = all).
    throttle
        Seconds to sleep between network fetches (respect Yahoo rate limits).
    test_fraction
        Newest fraction of the GLOBAL pooled timeline held out for test.
    series_map
        OFFLINE injection: ``{ticker: [{"t": ms, "v": price}, ...] or [floats]}``.
        When provided, NO network is touched (used by tests).
    fetcher
        Optional callable ``fetcher(ticker, rng) -> series`` overriding the
        default ``scrapers.yahoo_daily`` (also lets tests bypass network).
    sector_map
        Optional ``{ticker: sector}`` (auto-derived from dict tickers).
    progress
        Print per-name progress.

    Returns a dict with pooled arrays and the time-split index:
      ``X, y, times, ticker_ids, ticker_names, sectors, p0`` (origin price for
      each row, used to reconstruct price levels), ``split_ts`` (train/test
      boundary), ``train_mask`` / ``test_mask``, ``feature_names``, and counts.
    """
    # normalize ticker list + sector map
    sec_map: dict[str, str] = dict(sector_map or {})
    norm: list[str] = []
    for t in tickers:
        if isinstance(t, dict):
            sym = str(t.get("ticker") or t.get("symbol") or "").strip().upper()
            if not sym:
                continue
            if t.get("sector"):
                sec_map.setdefault(sym, str(t["sector"]))
            norm.append(sym)
        else:
            norm.append(str(t).strip().upper())
    if max_names is not None:
        norm = norm[: int(max_names)]

    # default network fetcher (lazy import so tests stay offline)
    rng = f"{max(1, int(years))}y"
    if fetcher is None and series_map is None:
        from .scrapers import yahoo_daily

        def fetcher(sym, r=rng):  # noqa: ANN001
            return yahoo_daily(sym, rng=r)

    h = int(max(1, horizon_steps))
    feature_names: list[str] = []

    X_parts: list[np.ndarray] = []
    y_parts: list[np.ndarray] = []
    t_parts: list[np.ndarray] = []
    p0_parts: list[np.ndarray] = []
    id_parts: list[np.ndarray] = []
    ticker_names: list[str] = []
    sector_per_id: list[str] = []

    n_attempt = 0
    n_used = 0
    n_skipped = 0
    for sym in norm:
        n_attempt += 1
        # obtain the series
        if series_map is not None:
            series = series_map.get(sym)
        else:
            try:
                series = fetcher(sym)
            except Exception:  # noqa: BLE001
                series = None
            if throttle and throttle > 0:
                time.sleep(throttle)
        if not series:
            n_skipped += 1
            if progress:
                print(f"  [{n_attempt}/{len(norm)}] {sym:<6} skip (no data)")
            continue

        values, times = _as_values_times(series)
        finite = np.isfinite(values)
        values = values[finite]
        if times is not None and times.size == finite.size:
            times = times[finite]
        if values.size < _min_points(h) or not np.all(values > 0):
            n_skipped += 1
            if progress:
                print(f"  [{n_attempt}/{len(norm)}] {sym:<6} skip ({values.size} pts)")
            continue

        # synthesize a monotone time axis if the series had no timestamps, so
        # the global time-split still has a consistent ordering per name.
        if times is None or times.size != values.size:
            times = np.arange(values.size, dtype=float) * 86_400_000.0

        X, y, origins, names = _supervised(values, times, horizon_steps=h)
        if X.shape[0] == 0:
            n_skipped += 1
            if progress:
                print(f"  [{n_attempt}/{len(norm)}] {sym:<6} skip (no rows)")
            continue
        if not feature_names:
            feature_names = names

        tid = len(ticker_names)
        ticker_names.append(sym)
        sector_per_id.append(sec_map.get(sym, "Unknown"))

        X_parts.append(X)
        y_parts.append(y)
        t_parts.append(times[origins])           # origin timestamp per row
        p0_parts.append(values[origins])         # origin price per row
        id_parts.append(np.full(X.shape[0], tid, dtype=int))
        n_used += 1
        if progress:
            print(f"  [{n_attempt}/{len(norm)}] {sym:<6} ok ({X.shape[0]} rows, {values.size} pts)")

    if not X_parts:
        return {
            "X": np.empty((0, 0)), "y": np.empty((0,)), "times": np.empty((0,)),
            "p0": np.empty((0,)), "ticker_ids": np.empty((0,), dtype=int),
            "ticker_names": [], "sectors": [], "feature_names": [],
            "split_ts": None, "train_mask": np.empty((0,), dtype=bool),
            "test_mask": np.empty((0,), dtype=bool),
            "n_stocks": 0, "n_rows": 0, "n_train": 0, "n_test": 0,
            "n_attempted": n_attempt, "n_skipped": n_skipped,
        }

    X = np.vstack(X_parts)
    y = np.concatenate(y_parts)
    times = np.concatenate(t_parts)
    p0 = np.concatenate(p0_parts)
    ticker_ids = np.concatenate(id_parts)

    # ── strict GLOBAL time split: test = newest `test_fraction` of all rows ────
    # Compute the boundary on the pooled timeline so the same calendar instant
    # divides train/test for EVERY ticker -> no same-day cross-ticker leakage
    # and no look-ahead. Use a quantile of the (pooled) origin timestamps.
    order = np.argsort(times, kind="mergesort")
    sorted_ts = times[order]
    cut = int(round((1.0 - float(test_fraction)) * (len(sorted_ts) - 1)))
    cut = min(max(cut, 0), len(sorted_ts) - 1)
    split_ts = float(sorted_ts[cut])
    # train = strictly-earlier origins; test = origins at/after the boundary.
    train_mask = times < split_ts
    test_mask = times >= split_ts
    # guard degenerate splits (e.g. many rows share the boundary timestamp)
    if not train_mask.any() or not test_mask.any():
        # fall back to a positional split on the sorted timeline
        train_idx = order[: cut]
        train_mask = np.zeros(len(times), dtype=bool)
        train_mask[train_idx] = True
        test_mask = ~train_mask

    return {
        "X": X, "y": y, "times": times, "p0": p0,
        "ticker_ids": ticker_ids, "ticker_names": ticker_names,
        "sectors": sector_per_id, "feature_names": feature_names,
        "split_ts": split_ts,
        "train_mask": train_mask, "test_mask": test_mask,
        "horizon_steps": h,
        "n_stocks": n_used, "n_rows": int(X.shape[0]),
        "n_train": int(train_mask.sum()), "n_test": int(test_mask.sum()),
        "n_attempted": n_attempt, "n_skipped": n_skipped,
    }


# ── TRAIN ─────────────────────────────────────────────────────────────────────
def train_global(
    dataset: dict,
    *,
    seed: int = 42,
    fast: bool = False,
) -> dict:
    """Fit ONE global point model + quantile members on the pooled TRAIN rows.

    Standardization statistics are computed on TRAIN ONLY (leakage guard).
    Returns a model bundle dict consumed by ``evaluate_global``.
    """
    if not _SKLEARN_OK:
        raise RuntimeError("scikit-learn is required for train_global")

    X = dataset["X"]
    y = dataset["y"]
    tr = dataset["train_mask"]
    if X.shape[0] == 0 or not tr.any():
        raise ValueError("empty training set")

    X_fit, y_fit = X[tr], y[tr]
    mean = X_fit.mean(axis=0)
    std = X_fit.std(axis=0)
    std = np.where(std < _EPS, 1.0, std)
    Xs_fit = (X_fit - mean) / std

    max_iter = 80 if fast else 200

    point = HistGradientBoostingRegressor(
        loss="squared_error",
        max_iter=max_iter,
        learning_rate=0.05,
        max_depth=3,
        l2_regularization=1.0,
        min_samples_leaf=50,
        early_stopping=True,
        validation_fraction=0.15,
        random_state=seed,
    )
    point.fit(Xs_fit, y_fit)

    q_models: dict[float, Any] = {}
    for alpha in (0.05, 0.5, 0.95):
        gbr = HistGradientBoostingRegressor(
            loss="quantile",
            quantile=alpha,
            max_iter=max_iter,
            learning_rate=0.05,
            max_depth=3,
            l2_regularization=1.0,
            min_samples_leaf=50,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=seed,
        )
        gbr.fit(Xs_fit, y_fit)
        q_models[alpha] = gbr

    return {
        "point": point,
        "q_models": q_models,
        "feat_mean": mean,
        "feat_std": std,
        "feature_names": dataset.get("feature_names", []),
        "n_fit": int(tr.sum()),
        "horizon_steps": dataset.get("horizon_steps", 1),
    }


# ── EVALUATE ──────────────────────────────────────────────────────────────────
def evaluate_global(dataset: dict, model: dict) -> dict:
    """Honest pooled out-of-sample scorecard on the held-out NEWEST test rows.

    Metrics (all on the test split):
      * ``level_acc``        — 1 - MAPE of reconstructed price vs actual.
      * ``level_acc_persist``— same for the persistence (return=0) baseline.
      * ``directional_acc``  — fraction of rows whose predicted return sign
                               matches the realized return sign (zeros excluded).
      * ``coverage``         — empirical coverage of the [q05,q95] interval.
      * ``skill_vs_persist`` — 1 - MAE_model / MAE_persist on the RETURN target
                               (>0 means we beat persistence; ~0 means tied).
      * ``by_sector``        — same metrics broken out per GICS sector.
    """
    X = dataset["X"]
    y = dataset["y"]
    p0 = dataset["p0"]
    te = dataset["test_mask"]
    sectors = dataset.get("sectors", [])
    ticker_ids = dataset.get("ticker_ids")

    out: dict[str, Any] = {
        "n_test": int(te.sum()),
        "level_acc": None, "level_acc_persist": None,
        "directional_acc": None, "coverage": None,
        "skill_vs_persist": None, "by_sector": {},
    }
    if X.shape[0] == 0 or not te.any():
        return out

    mean = model["feat_mean"]
    std = model["feat_std"]
    Xs = (X[te] - mean) / std
    y_true = y[te]
    p0_te = p0[te]

    pred_ret = model["point"].predict(Xs)
    q_lo = model["q_models"][0.05].predict(Xs)
    q_hi = model["q_models"][0.95].predict(Xs)
    q_lo, q_hi = np.minimum(q_lo, q_hi), np.maximum(q_lo, q_hi)

    # reconstruct price levels from predicted / actual returns (positive series)
    price_pred = p0_te * np.exp(pred_ret)
    price_true = p0_te * np.exp(y_true)
    price_persist = p0_te  # persistence: next price == last price

    def _level_acc(pred: np.ndarray, actual: np.ndarray) -> float:
        denom = np.abs(actual)
        ok = denom > _EPS
        if not ok.any():
            return float("nan")
        mape = np.mean(np.abs(pred[ok] - actual[ok]) / denom[ok])
        return float(1.0 - mape)

    def _dir_acc(pred_r: np.ndarray, actual_r: np.ndarray) -> Optional[float]:
        nz = np.abs(actual_r) > _EPS
        if not nz.any():
            return None
        return float(np.mean(np.sign(pred_r[nz]) == np.sign(actual_r[nz])))

    def _coverage(lo: np.ndarray, hi: np.ndarray, actual_r: np.ndarray) -> float:
        return float(np.mean((actual_r >= lo) & (actual_r <= hi)))

    def _skill(pred_r: np.ndarray, actual_r: np.ndarray) -> float:
        mae_model = float(np.mean(np.abs(pred_r - actual_r)))
        mae_persist = float(np.mean(np.abs(actual_r)))  # persistence return = 0
        if mae_persist <= _EPS:
            return 0.0
        return float(1.0 - mae_model / mae_persist)

    out["level_acc"] = _level_acc(price_pred, price_true)
    out["level_acc_persist"] = _level_acc(price_persist, price_true)
    out["directional_acc"] = _dir_acc(pred_ret, y_true)
    out["coverage"] = _coverage(q_lo, q_hi, y_true)
    out["skill_vs_persist"] = _skill(pred_ret, y_true)
    out["mae_return_model"] = float(np.mean(np.abs(pred_ret - y_true)))
    out["mae_return_persist"] = float(np.mean(np.abs(y_true)))

    # ── per-sector breakdown ──────────────────────────────────────────────────
    if sectors and ticker_ids is not None:
        sec_te = np.array([sectors[i] for i in ticker_ids[te]])
        by_sector: dict[str, dict] = {}
        for sec in sorted(set(sec_te.tolist())):
            m = sec_te == sec
            if not m.any():
                continue
            by_sector[sec] = {
                "n": int(m.sum()),
                "level_acc": _level_acc(price_pred[m], price_true[m]),
                "level_acc_persist": _level_acc(price_persist[m], price_true[m]),
                "directional_acc": _dir_acc(pred_ret[m], y_true[m]),
                "coverage": _coverage(q_lo[m], q_hi[m], y_true[m]),
                "skill_vs_persist": _skill(pred_ret[m], y_true[m]),
            }
        out["by_sector"] = by_sector

    return out
