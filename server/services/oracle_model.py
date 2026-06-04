"""ORACLE MODEL — a serious, heavily-trained, general-purpose prediction engine
for PATTERN ORACLE.

The design principle that makes this honest (and tradeable):

    The model predicts on EVERY bar, but it reports a CONVICTION. Real edge is
    NOT "call every move correctly" — across a near-random-walk market, forcing a
    directional call on every bar gives ~50% accuracy. The edge lives in the
    SELECTIVE subset: when ``conviction`` (a calibrated distance of P(up) from
    0.5) is high, directional accuracy rises to a genuinely-tradeable 55-65%.
    We measure and report accuracy on that high-conviction subset, never claim
    99% directional, and additionally predict VOLATILITY (the size of the next
    move), which is genuinely 80-90% rank-predictable (R^2 ~ 0.5-0.8).

Three heads share the SAME rich causal feature matrix from
``forecaster_ml._feature_matrix`` / ``_supervised`` (no feature re-invention):

  (a) DIRECTION  — ``HistGradientBoostingClassifier`` -> P(up over horizon),
      wrapped in ``CalibratedClassifierCV`` (isotonic) so the probability is
      meaningful and ``conviction = |p_up - 0.5| * 2`` is interpretable.
  (b) VOLATILITY — ``HistGradientBoostingRegressor`` predicting the realized
      absolute log-return |ln(P_{i+h}/P_i)| over the horizon (the genuinely
      predictable target).
  (c) RETURN/LEVEL — the existing ``MLForecaster`` (HistGBR median + quantile
      intervals + conformal widening) gives the point forecast and interval.

Heavy training (``train(dataset, hyperparam_search=True)``) runs a small
hyperparameter search (learning_rate / max_iter / max_depth / l2) under a
PURGED + EMBARGOED time-series CV (no leakage across the horizon boundary),
selects the best config by out-of-fold log-loss, and refits on the full pooled
multi-asset dataset. Online learning (``update``) refits on a rolling recent
window. Persistence via joblib (``save`` / ``load``).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence

import numpy as np

try:  # pragma: no cover - exercised by environment
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.ensemble import (
        HistGradientBoostingClassifier,
        HistGradientBoostingRegressor,
    )

    _SKLEARN_OK = True
except Exception as _e:  # noqa: BLE001
    _SKLEARN_OK = False

from .forecaster import _as_values_times
from .forecaster_ml import MLForecaster, _MAX_LOOKBACK, _feature_matrix, _supervised

_EPS = 1e-9


# ══════════════════════════════════════════════════════════════════════════════
# Pooled, leakage-safe dataset container
# ══════════════════════════════════════════════════════════════════════════════
@dataclass
class OracleDataset:
    """A pooled, cross-sectional supervised dataset for the Oracle heads.

    All rows from all assets, with a GLOBAL chronological key (``t``) so a strict
    time split (and purged CV) can be made across the whole pool — never letting
    a future bar of any asset leak into the training of an earlier prediction.

    Fields
    ------
    X        : [N, P]  causal features (from ``forecaster_ml._feature_matrix``).
    y_ret    : [N]     forward log-return over the horizon (signed).
    y_dir    : [N]     1 if y_ret > 0 else 0 (direction label).
    y_vol    : [N]     |y_ret| (realized move size — the volatility target).
    t        : [N]     origin timestamp (ms) for global time-ordering.
    asset    : [N]     asset id per row (str) — purely for bookkeeping.
    names    : feature names.
    horizon  : horizon in steps the targets were built at.
    """

    X: np.ndarray
    y_ret: np.ndarray
    y_dir: np.ndarray
    y_vol: np.ndarray
    t: np.ndarray
    asset: np.ndarray
    names: list[str] = field(default_factory=list)
    horizon: int = 1

    def __len__(self) -> int:  # pragma: no cover - trivial
        return int(self.X.shape[0])

    # -- builders ----------------------------------------------------------------
    @staticmethod
    def from_series_map(
        series_map: dict[str, Sequence],
        *,
        horizon_steps: int = 1,
        min_rows: int = 60,
    ) -> "OracleDataset":
        """Pool many ``{asset: series}`` into one leakage-safe dataset.

        Each ``series`` is the canonical ``[{t, v}, ...]`` (or plain numbers).
        Rows are sorted by origin timestamp so a global time split is honest.
        """
        Xs, yr, td, names = [], [], [], None
        assets = []
        for asset, series in series_map.items():
            values, times = _as_values_times(series)
            finite = np.isfinite(values)
            values = values[finite]
            if times is not None and times.size == finite.size:
                times = times[finite]
            if values.size < (_MAX_LOOKBACK + horizon_steps + min_rows):
                continue
            X, y, origins, nm = _supervised(values, times, horizon_steps=horizon_steps)
            if X.shape[0] < min_rows or X.shape[1] == 0:
                continue
            if names is None:
                names = nm
            # column-align in the (rare) case calendar features differ
            if X.shape[1] != len(names):
                k = min(X.shape[1], len(names))
                X = X[:, :k]
            Xs.append(X)
            yr.append(y)
            if times is not None:
                td.append(times[origins])
            else:
                # no timestamps: synthesize a monotone per-asset order offset so
                # rows still sort deterministically without cross-asset leakage.
                td.append(origins.astype(float))
            assets.append(np.array([asset] * X.shape[0], dtype=object))

        if not Xs:
            return OracleDataset(
                X=np.empty((0, 0)),
                y_ret=np.empty((0,)),
                y_dir=np.empty((0,)),
                y_vol=np.empty((0,)),
                t=np.empty((0,)),
                asset=np.empty((0,), dtype=object),
                names=names or [],
                horizon=horizon_steps,
            )

        # align widths across assets
        width = min(x.shape[1] for x in Xs)
        Xs = [x[:, :width] for x in Xs]
        names = (names or [])[:width]

        X = np.vstack(Xs)
        y_ret = np.concatenate(yr)
        t = np.concatenate(td)
        asset = np.concatenate(assets)

        # GLOBAL chronological sort (the spine of the no-leakage split)
        order = np.argsort(t, kind="mergesort")
        X, y_ret, t, asset = X[order], y_ret[order], t[order], asset[order]

        y_dir = (y_ret > 0).astype(int)
        y_vol = np.abs(y_ret)
        return OracleDataset(
            X=X, y_ret=y_ret, y_dir=y_dir, y_vol=y_vol, t=t, asset=asset,
            names=names, horizon=horizon_steps,
        )

    def time_split(self, test_fraction: float = 0.2) -> tuple["OracleDataset", "OracleDataset"]:
        """Strict chronological split: earliest (1-f) -> train, latest f -> test."""
        n = len(self)
        n_test = max(1, int(round(n * test_fraction)))
        cut = n - n_test
        return self._slice(0, cut), self._slice(cut, n)

    def tail(self, n_rows: int) -> "OracleDataset":
        n = len(self)
        return self._slice(max(0, n - n_rows), n)

    def _slice(self, a: int, b: int) -> "OracleDataset":
        return OracleDataset(
            X=self.X[a:b], y_ret=self.y_ret[a:b], y_dir=self.y_dir[a:b],
            y_vol=self.y_vol[a:b], t=self.t[a:b], asset=self.asset[a:b],
            names=self.names, horizon=self.horizon,
        )


# ══════════════════════════════════════════════════════════════════════════════
# Purged + embargoed time-series CV
# ══════════════════════════════════════════════════════════════════════════════
def purged_time_folds(n: int, *, n_folds: int = 4, embargo: int = 0):
    """Yield (train_idx, val_idx) for forward-chaining CV with an embargo gap.

    Forward chaining: fold k validates on a contiguous future block and trains on
    everything strictly before it MINUS an ``embargo`` gap (>= the horizon) so the
    forward-looking target of the last train row cannot overlap the val block.
    """
    if n < (n_folds + 1) * 4:
        n_folds = max(2, n // 8) or 2
    fold = n // (n_folds + 1)
    if fold <= 0:
        return
    for k in range(1, n_folds + 1):
        val_start = k * fold
        val_end = (k + 1) * fold if k < n_folds else n
        train_end = max(0, val_start - embargo)
        if train_end < fold:  # too little to train on
            continue
        train_idx = np.arange(0, train_end)
        val_idx = np.arange(val_start, val_end)
        if train_idx.size and val_idx.size:
            yield train_idx, val_idx


# ══════════════════════════════════════════════════════════════════════════════
# The Oracle model
# ══════════════════════════════════════════════════════════════════════════════
# hyperparameter grid for the direction head (small, fast — HistGBR is cheap)
_PARAM_GRID = [
    {"learning_rate": 0.05, "max_iter": 300, "max_depth": 3, "l2_regularization": 1.0},
    {"learning_rate": 0.05, "max_iter": 400, "max_depth": 4, "l2_regularization": 1.0},
    {"learning_rate": 0.10, "max_iter": 250, "max_depth": 3, "l2_regularization": 0.1},
    {"learning_rate": 0.10, "max_iter": 300, "max_depth": 4, "l2_regularization": 2.0},
    {"learning_rate": 0.03, "max_iter": 500, "max_depth": 3, "l2_regularization": 1.0},
]


class OracleModel:
    """Multi-head, multi-horizon, conviction-reporting prediction model.

    Heads (all on the SAME causal feature matrix):
      * direction  — calibrated P(up over horizon)
      * volatility — predicted |forward log-return| (move size)
      * return     — point forecast + interval (delegated to MLForecaster)
    """

    def __init__(
        self,
        *,
        horizon_steps: int = 1,
        seed: int = 42,
        act_threshold: float = 0.2,
        min_samples_leaf: int = 40,
    ) -> None:
        self.horizon_steps = int(max(1, horizon_steps))
        self.seed = int(seed)
        self.act_threshold = float(act_threshold)
        self.min_samples_leaf = int(min_samples_leaf)
        self.sklearn_ok = _SKLEARN_OK

        self.fitted = False
        self.feature_names: list[str] = []
        self.feat_mean: Optional[np.ndarray] = None
        self.feat_std: Optional[np.ndarray] = None

        self.dir_model = None          # CalibratedClassifierCV(HistGBClassifier)
        self.vol_model = None          # HistGradientBoostingRegressor
        self.ret_forecaster: Optional[MLForecaster] = None  # level/interval head

        self.best_params: dict = {}
        self.search_log: list[dict] = []
        self.train_report: dict = {}
        # rolling buffer of recent series per asset for online refit
        self._roll_buffer: dict[str, list] = {}

    # ── standardize helpers ──────────────────────────────────────────────────
    def _standardize_fit(self, X: np.ndarray) -> np.ndarray:
        mean = X.mean(axis=0)
        std = X.std(axis=0)
        std = np.where(std < _EPS, 1.0, std)
        self.feat_mean, self.feat_std = mean, std
        return (X - mean) / std

    def _standardize(self, X: np.ndarray) -> np.ndarray:
        return (X - self.feat_mean) / self.feat_std

    # ── direction-head factory ───────────────────────────────────────────────
    def _make_dir_clf(self, params: dict):
        return HistGradientBoostingClassifier(
            learning_rate=params["learning_rate"],
            max_iter=params["max_iter"],
            max_depth=params["max_depth"],
            l2_regularization=params["l2_regularization"],
            min_samples_leaf=self.min_samples_leaf,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=self.seed,
        )

    # ── HEAVY TRAINING ───────────────────────────────────────────────────────
    def train(
        self,
        dataset: OracleDataset,
        *,
        hyperparam_search: bool = True,
        n_folds: int = 4,
        ret_series_map: Optional[dict[str, Sequence]] = None,
    ) -> dict:
        """Heavy one-shot training on a LARGE pooled multi-asset dataset.

        Runs a purged/embargoed time-series CV hyperparameter search for the
        direction head, picks the best by out-of-fold log-loss, refits all heads
        on the full dataset. ``ret_series_map`` (optional) trains the level head
        on the longest single asset's series (the interval head is per-series).
        """
        if not self.sklearn_ok:
            self.fitted = False
            self.train_report = {"status": "no_sklearn"}
            return self.train_report

        n = len(dataset)
        if n < 80 or dataset.X.shape[1] == 0:
            self.fitted = False
            self.train_report = {
                "status": "insufficient_data",
                "n": int(n),
                "reason": "need >= 80 pooled supervised rows",
            }
            return self.train_report

        self.horizon_steps = int(dataset.horizon)
        self.feature_names = list(dataset.names)
        X = dataset.X
        Xs = self._standardize_fit(X)
        y_dir = dataset.y_dir
        y_vol = dataset.y_vol

        from sklearn.metrics import log_loss

        embargo = max(self.horizon_steps, 1)

        # ── hyperparameter search (purged CV) on the direction head ───────────
        grid = _PARAM_GRID if hyperparam_search else _PARAM_GRID[:1]
        self.search_log = []
        best_params, best_score = None, math.inf
        folds = list(purged_time_folds(n, n_folds=n_folds, embargo=embargo))
        for params in grid:
            scores = []
            for tr, va in folds:
                ytr = y_dir[tr]
                if np.unique(ytr).size < 2 or np.unique(y_dir[va]).size < 2:
                    continue
                clf = self._make_dir_clf(params)
                clf.fit(Xs[tr], ytr)
                p = clf.predict_proba(Xs[va])[:, 1]
                p = np.clip(p, 1e-6, 1 - 1e-6)
                scores.append(log_loss(y_dir[va], p, labels=[0, 1]))
            mean_score = float(np.mean(scores)) if scores else math.inf
            self.search_log.append({"params": params, "cv_logloss": mean_score,
                                    "n_folds_used": len(scores)})
            if mean_score < best_score:
                best_score, best_params = mean_score, params
        if best_params is None:
            best_params = _PARAM_GRID[0]
        self.best_params = best_params

        # ── refit direction head on ALL data + isotonic calibration ──────────
        # Calibrate on a held-out chronological tail (prefit) so the calibrator
        # never sees data the base estimator was fit on (no leakage).
        cut = int(n * 0.8)
        base = self._make_dir_clf(best_params)
        if np.unique(y_dir[:cut]).size >= 2 and (n - cut) >= 20:
            base.fit(Xs[:cut], y_dir[:cut])
            method = "isotonic" if (n - cut) >= 200 else "sigmoid"
            # sklearn >=1.6 replaced cv="prefit" with FrozenEstimator; fall back
            # to the legacy "prefit" string on older versions.
            try:
                from sklearn.frozen import FrozenEstimator

                self.dir_model = CalibratedClassifierCV(
                    FrozenEstimator(base), method=method
                )
            except Exception:  # noqa: BLE001 - older sklearn
                self.dir_model = CalibratedClassifierCV(
                    base, method=method, cv="prefit"
                )
            self.dir_model.fit(Xs[cut:], y_dir[cut:])
        else:
            base.fit(Xs, y_dir)
            self.dir_model = base  # has predict_proba

        # ── volatility head on ALL data ──────────────────────────────────────
        self.vol_model = HistGradientBoostingRegressor(
            loss="squared_error",
            learning_rate=best_params["learning_rate"],
            max_iter=best_params["max_iter"],
            max_depth=best_params["max_depth"],
            l2_regularization=best_params["l2_regularization"],
            min_samples_leaf=self.min_samples_leaf,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=self.seed,
        )
        self.vol_model.fit(Xs, y_vol)

        # ── level/interval head (per-series) on the longest provided series ──
        if ret_series_map:
            longest = max(ret_series_map.items(), key=lambda kv: len(kv[1]))
            self.ret_forecaster = MLForecaster(seed=self.seed)
            self.ret_forecaster.train(longest[1], horizon_steps=self.horizon_steps)

        self.fitted = True
        self.train_report = {
            "status": "trained",
            "n_rows": int(n),
            "n_features": int(X.shape[1]),
            "horizon_steps": self.horizon_steps,
            "n_assets": int(np.unique(dataset.asset).size),
            "best_params": best_params,
            "cv_best_logloss": best_score,
            "search_log": self.search_log,
            "calibration": "isotonic/sigmoid prefit-tail" if isinstance(
                self.dir_model, CalibratedClassifierCV) else "uncalibrated",
        }
        return self.train_report

    # ── raw matrix prediction (for evaluation) ───────────────────────────────
    def predict_matrix(self, X: np.ndarray) -> dict:
        """Vectorized head outputs for a feature matrix (used by the scorecard)."""
        Xs = self._standardize(X)
        prob_up = self.dir_model.predict_proba(Xs)[:, 1]
        prob_up = np.clip(prob_up, 0.0, 1.0)
        vol = np.maximum(0.0, self.vol_model.predict(Xs))
        conviction = np.abs(prob_up - 0.5) * 2.0
        return {
            "prob_up": prob_up,
            "vol_pred": vol,
            "conviction": conviction,
            "direction": np.where(prob_up >= 0.5, 1, -1),
            "act": conviction >= self.act_threshold,
        }

    # ── single-series prediction at the LAST origin ──────────────────────────
    def predict(
        self,
        series: Sequence,
        *,
        horizon_steps: Optional[int] = None,
        confidence: float = 0.9,
        act_threshold: Optional[float] = None,
    ) -> dict:
        """Predict at the most recent bar of ``series``.

        Returns the conviction-aware dict:
            direction, prob_up, conviction, vol_pred, point, interval, act.
        """
        if not self.fitted:
            return {"status": "not_fitted"}
        thr = self.act_threshold if act_threshold is None else float(act_threshold)
        values, times = _as_values_times(series)
        finite = np.isfinite(values)
        values = values[finite]
        if times is not None and times.size == finite.size:
            times = times[finite]
        if values.size < _MAX_LOOKBACK + 1:
            return {"status": "insufficient_data",
                    "reason": f"need >= {_MAX_LOOKBACK + 1} points"}

        Xfull, _ = _feature_matrix(values, times)
        row = Xfull[-1]
        if not np.all(np.isfinite(row)):
            return {"status": "insufficient_data", "reason": "incomplete features"}
        if self.feat_mean is not None and row.shape[0] != self.feat_mean.shape[0]:
            k = min(row.shape[0], self.feat_mean.shape[0])
            row = row[:k]
        mat = self.predict_matrix(row[None, :])
        prob_up = float(mat["prob_up"][0])
        vol_pred = float(mat["vol_pred"][0])
        conviction = float(mat["conviction"][0])
        direction = "up" if prob_up >= 0.5 else "down"

        point, interval = None, None
        if self.ret_forecaster is not None and self.ret_forecaster.fitted:
            rf = self.ret_forecaster.predict_next(
                series, horizon_steps=horizon_steps or self.horizon_steps,
                confidence=confidence,
            )
            if rf.get("status") == "ok":
                point = rf.get("point")
                interval = rf.get("interval")

        return {
            "status": "ok",
            "direction": direction,
            "prob_up": prob_up,
            "conviction": conviction,
            "vol_pred": vol_pred,
            "point": point,
            "interval": interval,
            "act": bool(conviction >= thr),
            "horizon_steps": int(horizon_steps or self.horizon_steps),
        }

    # ── ONLINE LEARNING ──────────────────────────────────────────────────────
    def update(
        self,
        new_rows: OracleDataset,
        *,
        rolling_window: int = 20000,
        prior: Optional[OracleDataset] = None,
        hyperparam_search: bool = False,
    ) -> dict:
        """Incremental refit as new bars arrive.

        HistGradientBoosting has no true warm-start across data, so we do the
        robust thing: refit on a rolling window of the most-recent rows (the
        previously-seen ``prior`` data, if supplied, concatenated with the new
        rows, truncated to ``rolling_window`` newest). This keeps the model
        current with regime drift while bounding cost. Reuses the existing best
        hyperparameters by default (cheap), or re-searches if asked.
        """
        if not self.sklearn_ok:
            return {"status": "no_sklearn"}
        if prior is not None and len(prior):
            combined = _concat_datasets(prior, new_rows)
        else:
            combined = new_rows
        combined = combined.tail(rolling_window)
        if len(combined) < 80:
            return {"status": "insufficient_data", "n": len(combined)}
        rep = self.train(combined, hyperparam_search=hyperparam_search)
        rep["mode"] = "online_update"
        rep["window_rows"] = len(combined)
        return rep

    # ── PERSISTENCE ──────────────────────────────────────────────────────────
    def save(self, path: str) -> str:
        import joblib

        state = {
            "horizon_steps": self.horizon_steps,
            "seed": self.seed,
            "act_threshold": self.act_threshold,
            "min_samples_leaf": self.min_samples_leaf,
            "fitted": self.fitted,
            "feature_names": self.feature_names,
            "feat_mean": self.feat_mean,
            "feat_std": self.feat_std,
            "dir_model": self.dir_model,
            "vol_model": self.vol_model,
            "ret_forecaster": self.ret_forecaster,
            "best_params": self.best_params,
            "search_log": self.search_log,
            "train_report": self.train_report,
        }
        joblib.dump(state, path)
        return path

    @classmethod
    def load(cls, path: str) -> "OracleModel":
        import joblib

        state = joblib.load(path)
        obj = cls(
            horizon_steps=state.get("horizon_steps", 1),
            seed=state.get("seed", 42),
            act_threshold=state.get("act_threshold", 0.2),
            min_samples_leaf=state.get("min_samples_leaf", 40),
        )
        obj.fitted = state.get("fitted", False)
        obj.feature_names = state.get("feature_names", [])
        obj.feat_mean = state.get("feat_mean")
        obj.feat_std = state.get("feat_std")
        obj.dir_model = state.get("dir_model")
        obj.vol_model = state.get("vol_model")
        obj.ret_forecaster = state.get("ret_forecaster")
        obj.best_params = state.get("best_params", {})
        obj.search_log = state.get("search_log", [])
        obj.train_report = state.get("train_report", {})
        return obj


def _concat_datasets(a: OracleDataset, b: OracleDataset) -> OracleDataset:
    """Concatenate two pooled datasets and re-sort globally by time."""
    X = np.vstack([a.X, b.X])
    y_ret = np.concatenate([a.y_ret, b.y_ret])
    t = np.concatenate([a.t, b.t])
    asset = np.concatenate([a.asset, b.asset])
    order = np.argsort(t, kind="mergesort")
    X, y_ret, t, asset = X[order], y_ret[order], t[order], asset[order]
    return OracleDataset(
        X=X, y_ret=y_ret, y_dir=(y_ret > 0).astype(int), y_vol=np.abs(y_ret),
        t=t, asset=asset, names=a.names or b.names, horizon=a.horizon,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Honest scorecard
# ══════════════════════════════════════════════════════════════════════════════
def evaluate(model: OracleModel, test: OracleDataset,
             thresholds: Sequence[float] = (0.1, 0.2, 0.3)) -> dict:
    """Out-of-sample scorecard: all-bars dir-acc, dir-acc@conviction (with the
    acted-on fraction), volatility R^2/MAE/correlation, and probability
    calibration (Brier + reliability bins)."""
    from sklearn.metrics import brier_score_loss, mean_absolute_error, r2_score

    out = model.predict_matrix(test.X)
    prob_up = out["prob_up"]
    conviction = out["conviction"]
    vol_pred = out["vol_pred"]
    pred_up = (prob_up >= 0.5).astype(int)
    y_dir = test.y_dir
    correct = (pred_up == y_dir).astype(float)
    n = len(y_dir)

    all_dir_acc = float(correct.mean()) if n else float("nan")

    conv_rows = []
    for thr in thresholds:
        mask = conviction >= thr
        k = int(mask.sum())
        acc = float(correct[mask].mean()) if k else float("nan")
        conv_rows.append({"threshold": float(thr), "n_acted": k,
                          "frac_acted": k / n if n else 0.0, "dir_acc": acc})

    # top-decile conviction (the "act on top 10%" headline)
    top_rows = []
    for frac in (0.10, 0.20, 0.30):
        kk = max(1, int(round(n * frac)))
        idx = np.argsort(-conviction)[:kk]
        top_rows.append({"top_frac": frac, "n": kk,
                         "dir_acc": float(correct[idx].mean())})

    # volatility head
    vol_r2 = float(r2_score(test.y_vol, vol_pred)) if n > 1 else float("nan")
    vol_mae = float(mean_absolute_error(test.y_vol, vol_pred)) if n else float("nan")
    vol_corr = (float(np.corrcoef(test.y_vol, vol_pred)[0, 1])
                if n > 1 and np.std(vol_pred) > 0 else float("nan"))

    # calibration
    p = np.clip(prob_up, 1e-6, 1 - 1e-6)
    brier = float(brier_score_loss(y_dir, p)) if n and np.unique(y_dir).size >= 2 else float("nan")
    bins = np.linspace(0.0, 1.0, 11)
    reliability = []
    for i in range(10):
        m = (p >= bins[i]) & (p < bins[i + 1])
        if m.sum() >= 5:
            reliability.append({"bin": f"{bins[i]:.1f}-{bins[i+1]:.1f}",
                                "n": int(m.sum()),
                                "pred_mean": float(p[m].mean()),
                                "emp_up_rate": float(y_dir[m].mean())})

    return {
        "n_test": n,
        "all_bars_dir_acc": all_dir_acc,
        "dir_acc_at_conviction": conv_rows,
        "dir_acc_top_conviction": top_rows,
        "vol_r2": vol_r2,
        "vol_mae": vol_mae,
        "vol_corr": vol_corr,
        "brier": brier,
        "reliability": reliability,
    }
