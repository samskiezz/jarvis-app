"""Short-horizon, genuinely-TRAINED time-series forecaster (pure numpy).

This implements the FORECAST CORE of PATTERN ORACLE for the short horizon
("predict the value N steps ahead"). Design references:
  - ``docs/PATTERN_ORACLE/06_ALGORITHMS.md``  — A1 GBM (reused from
    ``services.prediction.gbm_montecarlo_forecast``), F18 Error-Weighted
    Ensemble, F19 EnbPI conformal intervals, F18b EWMA.
  - ``docs/PATTERN_ORACLE/08_SELF_IMPROVEMENT_AND_MLOPS.md`` — skill metrics,
    calibrated honest intervals, leakage guards.

The single learned member is a **ridge regression** fit in closed form on
supervised samples built from lagged features. It is *trained* on data
(``train``) and then *generalizes* to predicting the value ``horizon_steps``
ahead for ANY numeric series (the "anything once trained" goal): prices,
crypto, sensor readings, growth curves — anything with a numeric value column.

Members combined by an error-weighted ensemble (F18):
  - ``ridge`` — the learned linear model on engineered features.
  - ``gbm``   — the incumbent GBM/Holt forecaster (A1), reused verbatim.

Intervals are calibrated by **conformal residuals** (EnbPI-style, F19): a
held-out tail of one-step training residuals is stored; the interval
half-width is the empirical ``confidence`` quantile of absolute residuals, so
realized coverage tracks the nominal confidence regardless of the noise law
(distribution-free; no fake Gaussian precision).

Pure numpy / math only. Never raises on normal input — returns a structured
``insufficient_data`` dict when the series is too short.
"""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence

import numpy as np

from .prediction import gbm_montecarlo_forecast

# ── feature-engineering knobs ─────────────────────────────────────────────────
# Number of lagged log-returns used as features. Kept modest so the supervised
# design matrix is well-conditioned even for short live series (~280 pts/day).
DEFAULT_N_LAGS = 6
# EWMA spans (level smoothing) used as slow/fast trend features.
_EWMA_SPANS = (5, 20)
# Ridge L2 penalty (on standardized features; intercept un-penalized).
DEFAULT_RIDGE_LAMBDA = 1.0
# Ensemble sharpness (F18): weight ∝ (1/recent_error)^gamma. gamma>1 concentrates
# weight on the better member; the member that is clearly more accurate on the
# calibration tail should dominate.
DEFAULT_ENSEMBLE_GAMMA = 2.0
# Fraction of the (chronologically last) samples held out for conformal
# residual calibration. The model is FIT on the earlier part only.
DEFAULT_CAL_FRACTION = 0.25
# Floor for any std / error denominator.
_EPS = 1e-9


def _as_values_times(series: Sequence) -> tuple[np.ndarray, Optional[np.ndarray]]:
    """Accept [{t,v}|{time,value}|number] -> (values[float], times[float]|None)."""
    vals: list[float] = []
    times: list[float] = []
    for item in series:
        if isinstance(item, dict):
            v = item.get("v", item.get("value"))
            if v is None:
                continue
            vals.append(float(v))
            t = item.get("t", item.get("time"))
            if t is not None:
                times.append(float(t))
        else:
            vals.append(float(item))
    values = np.asarray(vals, dtype=float)
    if times and len(times) == len(vals):
        return values, np.asarray(times, dtype=float)
    return values, None


def _ewma(x: np.ndarray, span: int) -> np.ndarray:
    """Adjusted EWMA level (pandas ``adjust=True`` semantics), pure numpy."""
    if x.size == 0:
        return x.copy()
    lam = 2.0 / (span + 1.0)
    out = np.empty_like(x)
    num = x[0]
    den = 1.0
    out[0] = x[0]
    one_minus = 1.0 - lam
    for t in range(1, x.size):
        num = x[t] + one_minus * num
        den = 1.0 + one_minus * den
        out[t] = num / den
    return out


def _time_of_day_frac(times: Optional[np.ndarray], n: int) -> Optional[np.ndarray]:
    """Fraction-of-day in [0,1) from ms timestamps (intraday seasonality), or None."""
    if times is None or times.size != n:
        return None
    secs = (times / 1000.0) % 86400.0
    return secs / 86400.0


def _build_features(
    values: np.ndarray,
    times: Optional[np.ndarray],
    *,
    n_lags: int,
    horizon_steps: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build a supervised design from a value series.

    Target is the *log-return over the horizon*:  y_i = ln(P_{i+h} / P_i).
    Predicting a return (not the level) keeps the regression scale-stable and
    makes persistence (return=0) the natural baseline the model must beat.

    Features at origin i (using only data up to and including i):
      - last ``n_lags`` one-step log-returns,
      - EWMA-level deviations ln(P_i / EWMA_span(P_i)) for each span (momentum),
      - realized volatility (std of the last ``n_lags`` returns),
      - momentum ln(P_i / P_{i-n_lags}),
      - time-of-day fraction (if timestamps available; else omitted).

    Returns (X[n_samples, n_features], y[n_samples], origin_idx[n_samples]).
    ``origin_idx[j]`` is the series index i used as the forecast origin for
    row j (so the realized target is values[i + horizon_steps]).
    """
    n = values.size
    h = int(max(1, horizon_steps))
    # log-returns; guard non-positive with a tiny floor (works for any sign via
    # diff-of-clipped only when positive; for general series we fall back to
    # plain first differences when any value is <= 0).
    positive = bool(np.all(values > 0))
    if positive:
        logv = np.log(values)
        rets = np.diff(logv)  # length n-1; rets[k] = ln(P_{k+1}/P_k)
    else:
        rets = np.diff(values)
        logv = values  # used only for momentum ratio below -> use diff form
    tod = _time_of_day_frac(times, n)

    # earliest origin i must have n_lags prior returns available -> i >= n_lags.
    # latest origin i must have a realized target -> i + h <= n-1.
    first_i = n_lags
    last_i = n - 1 - h
    rows_X: list[list[float]] = []
    rows_y: list[float] = []
    origins: list[int] = []
    ewmas = {span: _ewma(values, span) for span in _EWMA_SPANS}
    for i in range(first_i, last_i + 1):
        feat: list[float] = []
        # last n_lags one-step returns ending at i (rets index i-1 is ln(P_i/P_{i-1}))
        lag_block = rets[i - n_lags:i]
        feat.extend(lag_block.tolist())
        # EWMA-level momentum: ln(P_i / ewma_i) (or P_i - ewma_i if non-positive)
        for span in _EWMA_SPANS:
            e = ewmas[span][i]
            if positive and e > 0:
                feat.append(float(math.log(values[i] / e)))
            else:
                feat.append(float(values[i] - e))
        # realized vol over the lag block
        feat.append(float(np.std(lag_block)) if lag_block.size > 1 else 0.0)
        # momentum over the whole lag window
        if positive and values[i - n_lags] > 0:
            feat.append(float(math.log(values[i] / values[i - n_lags])))
        else:
            feat.append(float(values[i] - values[i - n_lags]))
        # time-of-day (sin/cos so it's circular) if available
        if tod is not None:
            ang = 2.0 * math.pi * float(tod[i])
            feat.append(math.sin(ang))
            feat.append(math.cos(ang))
        rows_X.append(feat)
        # target: horizon log-return (or horizon difference for non-positive)
        if positive:
            rows_y.append(float(logv[i + h] - logv[i]))
        else:
            rows_y.append(float(values[i + h] - values[i]))
        origins.append(i)
    if not rows_X:
        return (
            np.empty((0, 0), dtype=float),
            np.empty((0,), dtype=float),
            np.empty((0,), dtype=int),
        )
    return (
        np.asarray(rows_X, dtype=float),
        np.asarray(rows_y, dtype=float),
        np.asarray(origins, dtype=int),
    )


def _ridge_fit(X: np.ndarray, y: np.ndarray, lam: float) -> np.ndarray:
    """Closed-form ridge with un-penalized intercept: w=(XᵀX+λI)⁻¹Xᵀy.

    X is assumed already standardized; a column of ones is appended for the
    intercept whose corresponding diagonal penalty entry is set to 0.
    Returns the weight vector of length (n_features + 1) (last entry = bias).
    """
    n, p = X.shape
    Xb = np.hstack([X, np.ones((n, 1), dtype=float)])
    reg = lam * np.eye(p + 1, dtype=float)
    reg[p, p] = 0.0  # do not penalize the intercept
    gram = Xb.T @ Xb + reg
    # solve rather than invert for numerical stability
    try:
        w = np.linalg.solve(gram, Xb.T @ y)
    except np.linalg.LinAlgError:
        w = np.linalg.pinv(gram) @ (Xb.T @ y)
    return w


def _ridge_predict(X: np.ndarray, w: np.ndarray) -> np.ndarray:
    Xb = np.hstack([X, np.ones((X.shape[0], 1), dtype=float)])
    return Xb @ w


class ShortHorizonForecaster:
    """A trained ensemble forecaster for the value ``horizon_steps`` ahead.

    Lifecycle: ``train(series, horizon_steps=h)`` then
    ``predict_next(series, horizon_steps=h, confidence=c)``. The same instance
    stores the fitted ridge weights, the feature scaler, the conformal residual
    buffer, and the per-member recent errors used for ensemble weighting.
    """

    def __init__(
        self,
        *,
        n_lags: int = DEFAULT_N_LAGS,
        ridge_lambda: float = DEFAULT_RIDGE_LAMBDA,
        cal_fraction: float = DEFAULT_CAL_FRACTION,
        gbm_paths: int = 4000,
        ensemble_gamma: float = DEFAULT_ENSEMBLE_GAMMA,
        seed: int = 42,
    ) -> None:
        self.n_lags = int(n_lags)
        self.ridge_lambda = float(ridge_lambda)
        self.cal_fraction = float(cal_fraction)
        self.ensemble_gamma = float(ensemble_gamma)
        self.gbm_paths = int(gbm_paths)
        self.seed = int(seed)
        self.fitted = False
        self.horizon_steps = 1
        self.positive = True
        # learned state
        self.w: Optional[np.ndarray] = None
        self.feat_mean: Optional[np.ndarray] = None
        self.feat_std: Optional[np.ndarray] = None
        self.conformal_abs: Optional[np.ndarray] = None  # sorted abs residuals (ridge ens)
        # recent per-member errors (mean abs residual on calibration tail)
        self.member_error: dict[str, float] = {}
        self.member_weight: dict[str, float] = {}
        self._has_time = False

    # the smallest series length on which we can both fit and calibrate
    def _min_len(self, horizon_steps: int) -> int:
        # need n_lags prior returns + horizon target + at least a few train and
        # a few calibration samples.
        return self.n_lags + int(horizon_steps) + 8

    # ── TRAIN ────────────────────────────────────────────────────────────────
    def train(self, series: Sequence, *, horizon_steps: int = 1) -> dict:
        """Fit the ridge member, calibrate conformal residuals, set ensemble
        weights. Returns a small training report (never raises on short input)."""
        h = int(max(1, horizon_steps))
        self.horizon_steps = h
        values, times = _as_values_times(series)
        values = values[np.isfinite(values)]
        n = values.size
        if n < self._min_len(h):
            self.fitted = False
            return {
                "status": "insufficient_data",
                "reason": f"need >= {self._min_len(h)} finite points, got {n}",
                "n": int(n),
            }
        self.positive = bool(np.all(values > 0))
        self._has_time = times is not None

        X, y, origins = _build_features(
            values, times, n_lags=self.n_lags, horizon_steps=h
        )
        if X.shape[0] < 6 or X.shape[1] == 0:
            self.fitted = False
            return {
                "status": "insufficient_data",
                "reason": f"only {X.shape[0]} supervised samples built",
                "n": int(n),
            }

        m = X.shape[0]
        n_cal = max(3, int(round(m * self.cal_fraction)))
        n_cal = min(n_cal, m - 3)  # leave >=3 for the fit
        n_fit = m - n_cal
        X_fit, y_fit = X[:n_fit], y[:n_fit]
        X_cal, y_cal = X[n_fit:], y[n_fit:]
        origins_cal = origins[n_fit:]

        # standardize on TRAIN ONLY (leakage guard)
        mean = X_fit.mean(axis=0)
        std = X_fit.std(axis=0)
        std = np.where(std < _EPS, 1.0, std)
        self.feat_mean, self.feat_std = mean, std
        Xs_fit = (X_fit - mean) / std
        Xs_cal = (X_cal - mean) / std

        self.w = _ridge_fit(Xs_fit, y_fit, self.ridge_lambda)

        # ── conformal calibration on the held-out tail (EnbPI-style) ──
        # predict the horizon return for each calibration origin, convert to a
        # LEVEL prediction, and compare to the realized level.
        ridge_ret_cal = _ridge_predict(Xs_cal, self.w)
        ridge_level_pred = np.empty(n_cal, dtype=float)
        gbm_level_pred = np.empty(n_cal, dtype=float)
        actual_level = np.empty(n_cal, dtype=float)
        for j in range(n_cal):
            i = int(origins_cal[j])
            p0 = values[i]
            actual_level[j] = values[i + h]
            ridge_level_pred[j] = self._ret_to_level(p0, ridge_ret_cal[j])
            # GBM member: train on the causal prefix up to origin i only
            gbm_level_pred[j] = self._gbm_point(values[: i + 1], times, i, h)

        ridge_abs = np.abs(actual_level - ridge_level_pred)
        gbm_abs = np.abs(actual_level - gbm_level_pred)

        # error-weighted ensemble (F18): weight ∝ 1/recent_error
        self.member_error = {
            "ridge": float(np.mean(ridge_abs)),
            "gbm": float(np.mean(gbm_abs)),
        }
        self.member_weight = self._inverse_error_weights(
            self.member_error, gamma=self.ensemble_gamma
        )

        # conformal residuals of the ENSEMBLE point (what predict_next emits)
        wgr, wgg = self.member_weight["ridge"], self.member_weight["gbm"]
        ens_level = wgr * ridge_level_pred + wgg * gbm_level_pred
        ens_abs = np.abs(actual_level - ens_level)
        self.conformal_abs = np.sort(ens_abs)

        self.fitted = True
        return {
            "status": "trained",
            "n": int(n),
            "n_samples": int(m),
            "n_fit": int(n_fit),
            "n_cal": int(n_cal),
            "n_features": int(X.shape[1]),
            "horizon_steps": h,
            "positive_series": self.positive,
            "has_time": self._has_time,
            "member_error": dict(self.member_error),
            "member_weight": dict(self.member_weight),
            "ridge_lambda": self.ridge_lambda,
        }

    @staticmethod
    def _inverse_error_weights(
        errors: dict[str, float], *, gamma: float = DEFAULT_ENSEMBLE_GAMMA
    ) -> dict[str, float]:
        """Weights ∝ (1/recent_error)^gamma (F18), floored to keep diversity.

        gamma>1 sharpens toward the better member; the calibration-tail error is
        the recent-error signal that decides who leads the ensemble.
        """
        inv = {k: (1.0 / (e + _EPS)) ** gamma for k, e in errors.items()}
        tot = sum(inv.values()) or 1.0
        w = {k: v / tot for k, v in inv.items()}
        # floor to keep diversity, then renormalize
        w_floor = 0.05
        w = {k: max(v, w_floor) for k, v in w.items()}
        tot = sum(w.values())
        return {k: v / tot for k, v in w.items()}

    def _ret_to_level(self, p0: float, pred_ret: float) -> float:
        """Convert a predicted horizon return/diff back to a price LEVEL."""
        if self.positive:
            level = p0 * math.exp(pred_ret)
            return max(0.0, level)
        return p0 + pred_ret

    def _gbm_point(
        self,
        prefix_values: np.ndarray,
        times: Optional[np.ndarray],
        origin_i: int,
        h: int,
    ) -> float:
        """GBM/Holt point estimate (A1) for the prefix ending at origin_i.

        Robust: falls back to persistence (last value) if GBM cannot run.
        """
        try:
            ts = None
            if times is not None and times.size >= origin_i + 1:
                ts = times[: origin_i + 1].tolist()
            fc = gbm_montecarlo_forecast(
                prefix_values.tolist(),
                h,
                timestamps=ts,
                n_paths=self.gbm_paths,
                seed=self.seed,
            )
            return float(fc["point_estimate"])
        except Exception:  # noqa: BLE001 - robust by contract
            return float(prefix_values[-1])

    def _featurize_origin(
        self, values: np.ndarray, times: Optional[np.ndarray]
    ) -> Optional[np.ndarray]:
        """Build the single feature row for the LAST origin (i = n-1)."""
        n = values.size
        # reuse _build_features with horizon=0 trick is awkward; build inline.
        if n < self.n_lags + 1:
            return None
        positive = self.positive
        if positive and np.all(values > 0):
            rets = np.diff(np.log(values))
        else:
            rets = np.diff(values)
        i = n - 1
        feat: list[float] = []
        lag_block = rets[i - self.n_lags:i]
        if lag_block.size < self.n_lags:
            return None
        feat.extend(lag_block.tolist())
        for span in _EWMA_SPANS:
            e = _ewma(values, span)[i]
            if positive and e > 0 and values[i] > 0:
                feat.append(float(math.log(values[i] / e)))
            else:
                feat.append(float(values[i] - e))
        feat.append(float(np.std(lag_block)) if lag_block.size > 1 else 0.0)
        if positive and values[i] > 0 and values[i - self.n_lags] > 0:
            feat.append(float(math.log(values[i] / values[i - self.n_lags])))
        else:
            feat.append(float(values[i] - values[i - self.n_lags]))
        if self._has_time and times is not None and times.size == n:
            tod = ((times[i] / 1000.0) % 86400.0) / 86400.0
            ang = 2.0 * math.pi * float(tod)
            feat.append(math.sin(ang))
            feat.append(math.cos(ang))
        row = np.asarray(feat, dtype=float)
        if self.feat_mean is None or row.size != self.feat_mean.size:
            return None
        return row

    # ── PREDICT ──────────────────────────────────────────────────────────────
    def predict_next(
        self,
        series: Sequence,
        *,
        horizon_steps: Optional[int] = None,
        confidence: float = 0.9,
    ) -> dict:
        """Predict the value ``horizon_steps`` ahead of the last point.

        Returns ``{point, interval{low,high,confidence}, prob_up, members{ridge,
        gbm}, weight{...}}``. Falls back gracefully and reports
        ``insufficient_data`` when it cannot run.
        """
        h = int(horizon_steps if horizon_steps is not None else self.horizon_steps)
        confidence = float(min(max(confidence, _EPS), 1.0 - _EPS))
        values, times = _as_values_times(series)
        values = values[np.isfinite(values)]
        n = values.size

        if not self.fitted or self.w is None:
            return {
                "status": "insufficient_data",
                "reason": "forecaster not trained (call train first)",
                "point": float(values[-1]) if n else None,
            }
        if n < self.n_lags + 1:
            return {
                "status": "insufficient_data",
                "reason": f"need >= {self.n_lags + 1} points to featurize",
                "point": float(values[-1]) if n else None,
            }

        p0 = float(values[-1])

        # ridge member
        row = self._featurize_origin(values, times)
        if row is None:
            ridge_level = p0
        else:
            xs = (row - self.feat_mean) / self.feat_std
            ridge_ret = float(_ridge_predict(xs[None, :], self.w)[0])
            ridge_level = self._ret_to_level(p0, ridge_ret)

        # gbm member
        gbm_level = self._gbm_point(values, times, n - 1, h)

        # error-weighted ensemble point (F18)
        wgr = self.member_weight.get("ridge", 0.5)
        wgg = self.member_weight.get("gbm", 0.5)
        point = wgr * ridge_level + wgg * gbm_level

        # conformal interval (F19 / EnbPI): half-width = confidence-quantile of
        # stored absolute residuals. Distribution-free, calibrated.
        half = self._conformal_halfwidth(confidence)
        low = point - half
        high = point + half
        if self.positive:
            low = max(0.0, low)

        # prob_up: GBM gives a Monte-Carlo P(up); blend with ridge directional
        # sign confidence scaled by interval width.
        prob_up = self._prob_up(values, times, h, point, p0, half)

        return {
            "status": "ok",
            "point": float(point),
            "interval": {
                "low": float(low),
                "high": float(high),
                "confidence": confidence,
            },
            "prob_up": float(min(max(prob_up, 0.0), 1.0)),
            "members": {"ridge": float(ridge_level), "gbm": float(gbm_level)},
            "weight": dict(self.member_weight),
            "horizon_steps": h,
            "last_value": p0,
            "method": "error-weighted(ridge+GBM) + EnbPI conformal interval",
        }

    def _conformal_halfwidth(self, confidence: float) -> float:
        if self.conformal_abs is None or self.conformal_abs.size == 0:
            return 0.0
        # finite-sample conformal quantile rank: ceil((n+1)*conf)/n
        n = self.conformal_abs.size
        rank = math.ceil((n + 1) * confidence)
        rank = min(rank, n)  # cap; if conf demands beyond data, use the max
        return float(self.conformal_abs[rank - 1])

    def _prob_up(
        self,
        values: np.ndarray,
        times: Optional[np.ndarray],
        h: int,
        point: float,
        p0: float,
        half: float,
    ) -> float:
        """Probability the value rises over the horizon.

        Primary signal: GBM Monte-Carlo P(up). Blended with a logistic of the
        ensemble's predicted move scaled by the conformal half-width (so a move
        small relative to the band -> ~0.5, an unconfident call)."""
        gbm_pup = 0.5
        try:
            ts = times.tolist() if times is not None else None
            fc = gbm_montecarlo_forecast(
                values.tolist(), h, timestamps=ts, n_paths=self.gbm_paths, seed=self.seed
            )
            gbm_pup = float(fc["probability_up"])
        except Exception:  # noqa: BLE001
            gbm_pup = 0.5
        scale = half if half > _EPS else (abs(point) * 1e-3 + _EPS)
        z = (point - p0) / scale
        ens_pup = 1.0 / (1.0 + math.exp(-z))
        return 0.5 * gbm_pup + 0.5 * ens_pup
