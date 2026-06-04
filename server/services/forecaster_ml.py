"""High-capacity ML forecaster (scikit-learn ensemble + quantile intervals).

This upgrades the pure-numpy :class:`~server.services.forecaster.ShortHorizonForecaster`
to a richer, gradient-boosted model with **calibrated prediction intervals**.

Design
------
* **Feature engineering** (all CAUSAL — every feature at origin ``i`` uses only
  ``values[: i + 1]``): lagged one-step log-returns over windows
  ``{1,2,3,5,10,20}``; SMA & EMA ratios ``ln(P/MA)`` for windows ``{5,10,20,50}``;
  realized volatility over ``{10,20}``; momentum ``ln(P_i/P_{i-k})`` for
  ``{5,10,20}``; RSI(14); MACD (12/26) + signal(9) + histogram; rolling z-score
  (window 20); and circular day-of-week / month seasonality if timestamps exist.
* **Target**: the forward log-return over ``horizon_steps``,
  ``y_i = ln(P_{i+h} / P_i)`` (return targets keep the problem scale-stable and
  make persistence ``return=0`` the natural baseline).
* **Ensemble**: a :class:`HistGradientBoostingRegressor` trained on the median
  target (the point member) PLUS three :class:`GradientBoostingRegressor` with
  ``loss="quantile"`` at ``alpha in {0.05, 0.5, 0.95}`` for the prediction
  interval (quantile regression). Features are standardized; the train/calib
  split is strictly time-ordered (no shuffling -> no leakage). A persistence
  (return = 0) reference is always kept.
* **Intervals**: taken directly from the 0.05 / 0.95 quantile regressors,
  rescaled to the requested ``confidence`` and widened by conformal residuals of
  the median member on a held-out calibration tail so realized coverage tracks
  the nominal level (distribution-free fallback if the quantile models degenerate).

Graceful by contract: if scikit-learn cannot be imported the class transparently
delegates to ``ShortHorizonForecaster``. ``predict_next`` never raises — it
returns a structured ``insufficient_data`` dict when the series is too short.
"""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence

import numpy as np

# ── optional sklearn import (graceful fallback) ───────────────────────────────
try:  # pragma: no cover - exercised by import environment
    from sklearn.ensemble import (
        GradientBoostingRegressor,
        HistGradientBoostingRegressor,
    )

    _SKLEARN_OK = True
    _SKLEARN_ERR: Optional[str] = None
except Exception as _e:  # noqa: BLE001
    _SKLEARN_OK = False
    _SKLEARN_ERR = repr(_e)

from .forecaster import ShortHorizonForecaster, _as_values_times

_EPS = 1e-9

# ── feature knobs ─────────────────────────────────────────────────────────────
_RET_LAGS = (1, 2, 3, 5, 10, 20)
_MA_WINDOWS = (5, 10, 20, 50)
_VOL_WINDOWS = (10, 20)
_MOM_WINDOWS = (5, 10, 20)
_RSI_WINDOW = 14
_MACD_FAST, _MACD_SLOW, _MACD_SIGNAL = 12, 26, 9
_Z_WINDOW = 20
# longest lookback any feature needs (so the first valid origin has full context)
_MAX_LOOKBACK = max(max(_RET_LAGS), max(_MA_WINDOWS), _MACD_SLOW + _MACD_SIGNAL, _Z_WINDOW)

# interval-calibration tail fraction (time-ordered held-out)
_CAL_FRACTION = 0.2


# ── causal feature helpers (vectorized, no look-ahead) ────────────────────────
def _ema(x: np.ndarray, span: int) -> np.ndarray:
    """Adjusted EWMA (pandas adjust=True semantics); EMA[i] uses only x[:i+1]."""
    if x.size == 0:
        return x.copy()
    lam = 2.0 / (span + 1.0)
    one_minus = 1.0 - lam
    out = np.empty_like(x, dtype=float)
    num = float(x[0])
    den = 1.0
    out[0] = x[0]
    for t in range(1, x.size):
        num = float(x[t]) + one_minus * num
        den = 1.0 + one_minus * den
        out[t] = num / den
    return out


def _rolling_mean(x: np.ndarray, w: int) -> np.ndarray:
    """Causal rolling mean; index i uses x[i-w+1 : i+1] (NaN until enough data)."""
    out = np.full(x.size, np.nan, dtype=float)
    if x.size < w:
        return out
    csum = np.cumsum(np.insert(x, 0, 0.0))
    out[w - 1:] = (csum[w:] - csum[:-w]) / w
    return out


def _rolling_std(x: np.ndarray, w: int) -> np.ndarray:
    out = np.full(x.size, np.nan, dtype=float)
    if x.size < w:
        return out
    for i in range(w - 1, x.size):
        out[i] = float(np.std(x[i - w + 1: i + 1]))
    return out


def _rsi(values: np.ndarray, window: int = _RSI_WINDOW) -> np.ndarray:
    """Wilder-smoothed RSI in [0,100]; causal. NaN until `window` deltas exist."""
    n = values.size
    out = np.full(n, np.nan, dtype=float)
    if n < window + 1:
        return out
    delta = np.diff(values)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_gain = float(np.mean(gain[:window]))
    avg_loss = float(np.mean(loss[:window]))
    for i in range(window, n):
        g = gain[i - 1]
        l = loss[i - 1]
        avg_gain = (avg_gain * (window - 1) + g) / window
        avg_loss = (avg_loss * (window - 1) + l) / window
        rs = avg_gain / (avg_loss + _EPS)
        out[i] = 100.0 - 100.0 / (1.0 + rs)
    return out


def _macd(values: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (macd_line, signal, histogram), all causal."""
    fast = _ema(values, _MACD_FAST)
    slow = _ema(values, _MACD_SLOW)
    macd_line = fast - slow
    signal = _ema(macd_line, _MACD_SIGNAL)
    hist = macd_line - signal
    return macd_line, signal, hist


def _calendar(times: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Circular day-of-week and month features from ms timestamps."""
    secs = times / 1000.0
    days = secs / 86400.0
    # 1970-01-01 was a Thursday (dow index 4 with Mon=0); we only need a stable
    # periodic encoding, not the absolute weekday name.
    dow = (np.floor(days).astype(np.int64) + 4) % 7
    # approximate month from day-of-year (good enough for seasonality features)
    doy = (np.floor(days).astype(np.int64) % 365)
    month = (doy / 30.4).astype(np.int64) % 12
    return dow.astype(float), month.astype(float)


def _feature_matrix(
    values: np.ndarray, times: Optional[np.ndarray]
) -> tuple[np.ndarray, list[str]]:
    """Build a causal feature matrix [n, p]; row i uses only values[:i+1].

    Rows before enough history is available contain NaN and are filtered by the
    caller. Returns (matrix, feature_names).
    """
    n = values.size
    positive = bool(np.all(values > 0))
    if positive:
        logv = np.log(values)
        rets = np.empty(n, dtype=float)
        rets[0] = 0.0
        rets[1:] = np.diff(logv)  # rets[i] = ln(P_i / P_{i-1})
    else:
        rets = np.empty(n, dtype=float)
        rets[0] = 0.0
        rets[1:] = np.diff(values)
        logv = values

    cols: list[np.ndarray] = []
    names: list[str] = []

    # lagged one-step returns: ret_lag{k}[i] = ln(P_{i-k+1} / P_{i-k})
    for lag in _RET_LAGS:
        c = np.full(n, np.nan, dtype=float)
        for i in range(lag, n):
            c[i] = rets[i - lag + 1]
        cols.append(c)
        names.append(f"ret_lag{lag}")

    # SMA & EMA ratios ln(P / MA)
    for w in _MA_WINDOWS:
        sma = _rolling_mean(values, w)
        ema = _ema(values, w)
        with np.errstate(divide="ignore", invalid="ignore"):
            if positive:
                sma_ratio = np.log(values / sma)
                ema_ratio = np.log(values / ema)
            else:
                sma_ratio = values - sma
                ema_ratio = values - ema
        cols.append(sma_ratio)
        names.append(f"sma_ratio{w}")
        cols.append(ema_ratio)
        names.append(f"ema_ratio{w}")

    # realized volatility of returns
    for w in _VOL_WINDOWS:
        cols.append(_rolling_std(rets, w))
        names.append(f"rvol{w}")

    # momentum ln(P_i / P_{i-k})
    for k in _MOM_WINDOWS:
        c = np.full(n, np.nan, dtype=float)
        for i in range(k, n):
            if positive and values[i - k] > 0:
                c[i] = math.log(values[i] / values[i - k])
            else:
                c[i] = values[i] - values[i - k]
        cols.append(c)
        names.append(f"mom{k}")

    # RSI
    cols.append(_rsi(values, _RSI_WINDOW))
    names.append("rsi14")

    # MACD
    macd_line, signal, hist = _macd(values)
    cols.append(macd_line)
    names.append("macd")
    cols.append(signal)
    names.append("macd_signal")
    cols.append(hist)
    names.append("macd_hist")

    # rolling z-score of the level
    rm = _rolling_mean(values, _Z_WINDOW)
    rs = _rolling_std(values, _Z_WINDOW)
    with np.errstate(divide="ignore", invalid="ignore"):
        z = (values - rm) / (rs + _EPS)
    cols.append(z)
    names.append("zscore20")

    # calendar seasonality
    if times is not None and times.size == n:
        dow, month = _calendar(times)
        cols.append(np.sin(2.0 * math.pi * dow / 7.0))
        names.append("dow_sin")
        cols.append(np.cos(2.0 * math.pi * dow / 7.0))
        names.append("dow_cos")
        cols.append(np.sin(2.0 * math.pi * month / 12.0))
        names.append("month_sin")
        cols.append(np.cos(2.0 * math.pi * month / 12.0))
        names.append("month_cos")

    X = np.column_stack(cols) if cols else np.empty((n, 0))
    return X, names


def _supervised(
    values: np.ndarray, times: Optional[np.ndarray], *, horizon_steps: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    """Causal design (X, y, origin_idx, names).

    Target y_i = ln(P_{i+h}/P_i) (or diff for non-positive series). Only origins
    with full feature context AND a realized target are kept.
    """
    h = int(max(1, horizon_steps))
    n = values.size
    Xfull, names = _feature_matrix(values, times)
    positive = bool(np.all(values > 0))
    logv = np.log(values) if positive else values

    first_i = _MAX_LOOKBACK
    last_i = n - 1 - h
    rows_idx: list[int] = []
    for i in range(first_i, last_i + 1):
        if np.all(np.isfinite(Xfull[i])):
            rows_idx.append(i)
    if not rows_idx:
        return (
            np.empty((0, Xfull.shape[1])),
            np.empty((0,)),
            np.empty((0,), dtype=int),
            names,
        )
    idx = np.asarray(rows_idx, dtype=int)
    X = Xfull[idx]
    if positive:
        y = logv[idx + h] - logv[idx]
    else:
        y = values[idx + h] - values[idx]
    return X, y, idx, names


class MLForecaster:
    """Gradient-boosted ensemble forecaster with calibrated quantile intervals.

    Lifecycle: ``train(series, horizon_steps=h)`` then
    ``predict_next(series, horizon_steps=h, confidence=c)``. If scikit-learn is
    unavailable the instance delegates every call to ``ShortHorizonForecaster``.
    """

    def __init__(self, *, seed: int = 42, cal_fraction: float = _CAL_FRACTION) -> None:
        self.seed = int(seed)
        self.cal_fraction = float(cal_fraction)
        self.sklearn_ok = _SKLEARN_OK
        self.fitted = False
        self.horizon_steps = 1
        self.positive = True
        self._has_time = False
        self.feature_names: list[str] = []

        # learned state
        self.feat_mean: Optional[np.ndarray] = None
        self.feat_std: Optional[np.ndarray] = None
        self.model_point = None  # HistGBR (median)
        self.q_models: dict[float, Any] = {}  # alpha -> GradientBoostingRegressor
        self.conformal_abs: Optional[np.ndarray] = None  # |resid| of median on cal tail
        self.train_report: dict = {}
        self.model_name = "ml_ensemble"

        # graceful fallback engine
        self._fallback = None
        if not self.sklearn_ok:
            self._fallback = ShortHorizonForecaster(seed=self.seed)
            self.model_name = "fallback_short_horizon"

    # ──────────────────────────────────────────────────────────────────────
    def _min_len(self, horizon_steps: int) -> int:
        return _MAX_LOOKBACK + int(horizon_steps) + 12

    # ── TRAIN ──────────────────────────────────────────────────────────────
    def train(self, series: Sequence, *, horizon_steps: int = 1) -> dict:
        h = int(max(1, horizon_steps))
        self.horizon_steps = h
        if self._fallback is not None:
            rep = self._fallback.train(series, horizon_steps=h)
            self.fitted = self._fallback.fitted
            rep = dict(rep)
            rep["model"] = self.model_name
            rep["sklearn"] = False
            self.train_report = rep
            return rep

        values, times = _as_values_times(series)
        finite = np.isfinite(values)
        values = values[finite]
        if times is not None and times.size == finite.size:
            times = times[finite]
        n = values.size
        if n < self._min_len(h):
            self.fitted = False
            return {
                "status": "insufficient_data",
                "reason": f"need >= {self._min_len(h)} finite points, got {n}",
                "n": int(n),
                "model": self.model_name,
            }
        self.positive = bool(np.all(values > 0))
        self._has_time = times is not None

        X, y, origins, names = _supervised(values, times, horizon_steps=h)
        self.feature_names = names
        m = X.shape[0]
        if m < 24 or X.shape[1] == 0:
            self.fitted = False
            return {
                "status": "insufficient_data",
                "reason": f"only {m} supervised samples built",
                "n": int(n),
                "model": self.model_name,
            }

        # time-ordered split: fit on the earlier part, calibrate on the tail
        n_cal = max(5, int(round(m * self.cal_fraction)))
        n_cal = min(n_cal, m - 12)
        n_fit = m - n_cal
        X_fit, y_fit = X[:n_fit], y[:n_fit]
        X_cal, y_cal = X[n_fit:], y[n_fit:]

        # standardize on TRAIN ONLY (leakage guard)
        mean = X_fit.mean(axis=0)
        std = X_fit.std(axis=0)
        std = np.where(std < _EPS, 1.0, std)
        self.feat_mean, self.feat_std = mean, std
        Xs_fit = (X_fit - mean) / std
        Xs_cal = (X_cal - mean) / std

        # point member: HistGradientBoostingRegressor (fast, robust to NaN/scale)
        self.model_point = HistGradientBoostingRegressor(
            loss="squared_error",
            max_iter=300,
            learning_rate=0.05,
            max_depth=3,
            l2_regularization=1.0,
            min_samples_leaf=15,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=self.seed,
        )
        self.model_point.fit(Xs_fit, y_fit)

        # quantile members for the interval (pinball loss)
        self.q_models = {}
        for alpha in (0.05, 0.5, 0.95):
            gbr = GradientBoostingRegressor(
                loss="quantile",
                alpha=alpha,
                n_estimators=200,
                learning_rate=0.05,
                max_depth=3,
                subsample=0.9,
                min_samples_leaf=15,
                random_state=self.seed,
            )
            gbr.fit(Xs_fit, y_fit)
            self.q_models[alpha] = gbr

        # conformal residuals of the median member on the calibration tail (level)
        med_ret_cal = self.model_point.predict(Xs_cal)
        cal_origins = origins[n_fit:]
        med_level = np.array(
            [self._ret_to_level(values[i], r) for i, r in zip(cal_origins, med_ret_cal)]
        )
        actual_level = (
            values[cal_origins + h]
        )
        self.conformal_abs = np.sort(np.abs(actual_level - med_level))

        self.fitted = True
        self.train_report = {
            "status": "trained",
            "n": int(n),
            "n_samples": int(m),
            "n_fit": int(n_fit),
            "n_cal": int(n_cal),
            "n_features": int(X.shape[1]),
            "horizon_steps": h,
            "positive_series": self.positive,
            "has_time": self._has_time,
            "model": self.model_name,
            "sklearn": True,
            "feature_names": names,
        }
        return self.train_report

    # ── PREDICT ────────────────────────────────────────────────────────────
    def predict_next(
        self,
        series: Sequence,
        *,
        horizon_steps: Optional[int] = None,
        confidence: float = 0.9,
    ) -> dict:
        if self._fallback is not None:
            out = self._fallback.predict_next(
                series, horizon_steps=horizon_steps, confidence=confidence
            )
            out = dict(out)
            out["model"] = self.model_name
            return out

        h = int(horizon_steps if horizon_steps is not None else self.horizon_steps)
        confidence = float(min(max(confidence, _EPS), 1.0 - _EPS))
        try:
            return self._predict_impl(series, h, confidence)
        except Exception as exc:  # noqa: BLE001 - robust by contract
            values, _ = _as_values_times(series)
            values = values[np.isfinite(values)]
            return {
                "status": "insufficient_data",
                "reason": f"prediction error: {exc!r}",
                "point": float(values[-1]) if values.size else None,
                "model": self.model_name,
            }

    def _predict_impl(self, series: Sequence, h: int, confidence: float) -> dict:
        values, times = _as_values_times(series)
        finite = np.isfinite(values)
        values = values[finite]
        if times is not None and times.size == finite.size:
            times = times[finite]
        n = values.size

        if not self.fitted or self.model_point is None:
            return {
                "status": "insufficient_data",
                "reason": "forecaster not trained (call train first)",
                "point": float(values[-1]) if n else None,
                "model": self.model_name,
            }
        if n < _MAX_LOOKBACK + 1:
            return {
                "status": "insufficient_data",
                "reason": f"need >= {_MAX_LOOKBACK + 1} points to featurize",
                "point": float(values[-1]) if n else None,
                "model": self.model_name,
            }

        p0 = float(values[-1])
        Xfull, _ = _feature_matrix(values, times)
        row = Xfull[-1]
        if not np.all(np.isfinite(row)):
            # not enough context for full features -> persistence reference
            return {
                "status": "insufficient_data",
                "reason": "incomplete features at the last origin",
                "point": p0,
                "model": self.model_name,
            }
        xs = (row - self.feat_mean) / self.feat_std
        xs = xs[None, :]

        med_ret = float(self.model_point.predict(xs)[0])
        point = self._ret_to_level(p0, med_ret)

        # interval from quantile regressors, scaled to requested confidence
        low, high = self._quantile_interval(xs, p0, confidence)

        # widen by conformal residuals so realized coverage tracks nominal
        half = self._conformal_halfwidth(confidence)
        low = min(low, point - half)
        high = max(high, point + half)
        if self.positive:
            low = max(0.0, low)
        if not (low < point < high):  # numerical safety
            pad = max(abs(point) * 1e-3, half, _EPS)
            low, high = point - pad, point + pad
            if self.positive:
                low = max(0.0, low)

        prob_up = self._prob_up(xs, med_ret)

        return {
            "status": "ok",
            "point": float(point),
            "interval": {
                "low": float(low),
                "high": float(high),
                "confidence": confidence,
            },
            "prob_up": float(min(max(prob_up, 0.0), 1.0)),
            "model": self.model_name,
            "horizon_steps": h,
            "last_value": p0,
            "method": "HistGBR median + quantile-GBR interval + conformal widening",
        }

    # ── helpers ──────────────────────────────────────────────────────────────
    def _ret_to_level(self, p0: float, pred_ret: float) -> float:
        if self.positive:
            return max(0.0, p0 * math.exp(pred_ret))
        return p0 + pred_ret

    def _quantile_interval(
        self, xs: np.ndarray, p0: float, confidence: float
    ) -> tuple[float, float]:
        """Interval from the 0.05/0.95 quantile models, scaled to `confidence`.

        The quantile models give a nominal 0.90 band around the median return.
        We scale the band half-widths (in return space) by the Gaussian z-ratio
        z(confidence)/z(0.90) so any requested confidence maps to a sensible
        width, then convert to price levels.
        """
        if not self.q_models:
            return p0, p0
        q_lo = float(self.q_models[0.05].predict(xs)[0])
        q_md = float(self.q_models[0.5].predict(xs)[0])
        q_hi = float(self.q_models[0.95].predict(xs)[0])
        # ensure monotone ordering of return quantiles
        q_lo, q_hi = min(q_lo, q_hi), max(q_lo, q_hi)

        from scipy.stats import norm

        z_base = norm.ppf(1.0 - (1.0 - 0.90) / 2.0)  # ~1.645
        z_req = norm.ppf(1.0 - (1.0 - confidence) / 2.0)
        scale = z_req / z_base if z_base > 0 else 1.0
        lo_ret = q_md - (q_md - q_lo) * scale
        hi_ret = q_md + (q_hi - q_md) * scale
        low = self._ret_to_level(p0, lo_ret)
        high = self._ret_to_level(p0, hi_ret)
        return min(low, high), max(low, high)

    def _conformal_halfwidth(self, confidence: float) -> float:
        if self.conformal_abs is None or self.conformal_abs.size == 0:
            return 0.0
        k = self.conformal_abs.size
        rank = min(int(math.ceil((k + 1) * confidence)), k)
        return float(self.conformal_abs[rank - 1])

    def _prob_up(self, xs: np.ndarray, med_ret: float) -> float:
        """P(value rises) from the quantile spread + median sign.

        Uses the implied return distribution: locate where return=0 falls between
        the lower/median/upper quantiles. A median return well above 0 with a
        tight band -> high prob_up; a median near 0 -> ~0.5.
        """
        if not self.q_models:
            return 0.5 if med_ret == 0 else (1.0 if med_ret > 0 else 0.0)
        q_lo = float(self.q_models[0.05].predict(xs)[0])
        q_hi = float(self.q_models[0.95].predict(xs)[0])
        q_lo, q_hi = min(q_lo, q_hi), max(q_lo, q_hi)
        spread = q_hi - q_lo
        if spread <= _EPS:
            return 1.0 if med_ret > 0 else (0.0 if med_ret < 0 else 0.5)
        # logistic of standardized median move (spread ~ 90% width ~ 3.29 sigma)
        sigma = spread / 3.2897
        z = med_ret / (sigma + _EPS)
        return 1.0 / (1.0 + math.exp(-z))
