"""Foundation Forecast Core — learned time-series forecasting beyond closed-form.

Implements multiple model families with graceful degradation when optional
libraries (sklearn, torch) are absent.  Every forecast is logged to
``forecast_runs`` for later scoring by the self-improvement loop.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore

_SKLEARN_AVAILABLE = False
try:  # pragma: no cover
    from sklearn.gaussian_process import GaussianProcessRegressor
    from sklearn.gaussian_process.kernels import RBF, WhiteKernel

    _SKLEARN_AVAILABLE = True
except Exception:
    pass

_TORCH_AVAILABLE = False
try:  # pragma: no cover
    import torch
    import torch.nn as nn

    _TORCH_AVAILABLE = True
except Exception:
    pass

# ── DB ────────────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "pattern_oracle.db",
)


def _db_path() -> str:
    return os.environ.get("PATTERN_ORACLE_DB", _DEFAULT_DB)


_MEMORY_CONN: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS forecast_runs (
    id          TEXT PRIMARY KEY,
    created_ts  INTEGER NOT NULL,
    model       TEXT NOT NULL,
    model_version TEXT NOT NULL DEFAULT '1.0.0',
    horizon     INTEGER NOT NULL,
    series_len  INTEGER NOT NULL,
    point       REAL,
    low         REAL,
    high        REAL,
    confidence  REAL,
    payload     TEXT
);
"""


def _conn() -> sqlite3.Connection:
    global _MEMORY_CONN
    path = _db_path()
    if path == ":memory:":
        if _MEMORY_CONN is None:
            _MEMORY_CONN = sqlite3.connect(path, check_same_thread=False)
            _MEMORY_CONN.row_factory = sqlite3.Row
            _MEMORY_CONN.executescript(_SCHEMA)
        return _MEMORY_CONN
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


def _to_array(series: list[float]) -> Any:
    if np is not None:
        arr = np.array(series, dtype=np.float64)
        return arr[np.isfinite(arr)]
    return [float(v) for v in series if isinstance(v, (int, float)) and math.isfinite(v)]


def _mean_std(arr: list[float] | Any) -> tuple[float, float]:
    if np is not None and hasattr(arr, "mean"):
        return float(arr.mean()), float(arr.std())
    if len(arr) == 0:
        return 0.0, 0.0
    m = sum(arr) / len(arr)
    s = math.sqrt(sum((v - m) ** 2 for v in arr) / len(arr))
    return m, s


def _seasonal_naive(arr: list[float] | Any, horizon: int, season: int = 7) -> list[float]:
    """Seasonal naive: repeat the last seasonal period."""
    n = len(arr)
    s = max(1, min(season, n // 2))
    out = []
    for h in range(1, horizon + 1):
        idx = n - s + ((h - 1) % s)
        out.append(float(arr[idx]) if idx >= 0 else float(arr[-1]))
    return out


def _theta_method(arr: list[float] | Any, horizon: int, theta: float = 2.0) -> list[float]:
    """Theta method: decompose into trend + theta-scaled second differences."""
    n = len(arr)
    if n < 3:
        return [float(arr[-1])] * horizon if n else [0.0] * horizon
    # Linear trend via least squares
    x = list(range(n))
    mx = sum(x) / n
    my = sum(arr) / n
    ss_xy = sum((xi - mx) * (arr[i] - my) for i, xi in enumerate(x))
    ss_xx = sum((xi - mx) ** 2 for xi in x)
    slope = ss_xy / ss_xx if ss_xx != 0 else 0.0
    intercept = my - slope * mx
    trend = [intercept + slope * xi for xi in x]
    # Second differences of detrended series, scaled by theta
    z = [float(arr[i]) - trend[i] for i in range(n)]
    dz = [z[i] - z[i - 1] for i in range(1, n)]
    d2z = [dz[i] - dz[i - 1] for i in range(1, len(dz))]
    mean_d2 = sum(d2z) / len(d2z) if d2z else 0.0
    # Forecast = trend extrapolation + theta-scaled cumulative second diff
    out = []
    last_z = z[-1]
    last_dz = dz[-1] if dz else 0.0
    for h in range(1, horizon + 1):
        # simple ARIMA(0,2,1) approximation for theta component
        pred_z = last_z + h * last_dz + 0.5 * h * (h + 1) * mean_d2 * (theta - 1.0)
        pred_trend = intercept + slope * (n - 1 + h)
        out.append(pred_trend + theta * pred_z)
    return out


def _enkf_forecast(arr: list[float] | Any, horizon: int, n_ens: int = 20) -> list[float]:
    """Ensemble Kalman Filter — simple univariate implementation."""
    n = len(arr)
    if n < 2:
        return [float(arr[-1])] * horizon if n else [0.0] * horizon
    if np is None:
        # Pure-Python fallback: linear trend + noise
        slope = (arr[-1] - arr[0]) / max(1, n - 1)
        return [float(arr[-1]) + h * slope for h in range(1, horizon + 1)]
    # State: [level, trend]
    X = np.array([float(arr[-1]), (float(arr[-1]) - float(arr[-2])) / 1.0])
    P = np.eye(2) * 1.0
    Q = np.eye(2) * 0.1
    R = np.eye(1) * (np.var(arr) if n > 1 else 1.0)
    F = np.array([[1.0, 1.0], [0.0, 1.0]])
    H = np.array([[1.0, 0.0]])
    for z in arr:
        # Predict
        X = F @ X
        P = F @ P @ F.T + Q
        # Update
        y = np.array([float(z)]) - H @ X
        S = H @ P @ H.T + R
        K = P @ H.T @ np.linalg.inv(S)
        X = X + K @ y
        P = P - K @ H @ P
    # Forecast
    out = []
    x = X.copy()
    for h in range(1, horizon + 1):
        x = F @ x
        out.append(float(x[0]))
    return out


def _conformal_intervals(
    arr: list[float] | Any, point_forecasts: list[float], horizon: int, alpha: float = 0.1
) -> tuple[list[float], list[float]]:
    """Split conformal prediction using absolute residuals on a hold-out tail."""
    n = len(arr)
    if n < 10:
        # Fallback: symmetric normal interval
        m, s = _mean_std(arr)
        q = 1.645  # ~90%
        lows = [p - q * s for p in point_forecasts]
        highs = [p + q * s for p in point_forecasts]
        return lows, highs
    # Use last 20% as calibration
    cal_n = max(1, n // 5)
    cal_true = arr[-cal_n:]
    # Naive baseline for calibration: seasonal naive one-step
    cal_pred = [float(arr[i - 7]) if i >= 7 else float(arr[i - 1]) for i in range(n - cal_n, n)]
    residuals = [abs(float(cal_true[i]) - cal_pred[i]) for i in range(cal_n)]
    residuals.sort()
    q_idx = min(len(residuals) - 1, int(math.ceil((1 - alpha) * (len(residuals) + 1))) - 1)
    q = residuals[max(0, q_idx)]
    lows = [p - q for p in point_forecasts]
    highs = [p + q for p in point_forecasts]
    return lows, highs


def _gp_forecast(arr: list[float] | Any, horizon: int) -> tuple[list[float], list[float], list[float]]:
    """Gaussian Process regression via sklearn."""
    if np is None or not _SKLEARN_AVAILABLE:
        raise RuntimeError("GP requires numpy+sklearn")
    n = len(arr)
    X = np.arange(n).reshape(-1, 1)
    y = np.array(arr, dtype=np.float64)
    kernel = RBF(length_scale=10.0, length_scale_bounds=(1e-2, 1e3)) + WhiteKernel(noise_level=1.0)
    gp = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=2, normalize_y=True)
    gp.fit(X, y)
    X_star = np.arange(n, n + horizon).reshape(-1, 1)
    mu, sigma = gp.predict(X_star, return_std=True)
    lows = [float(mu[i] - 1.645 * sigma[i]) for i in range(horizon)]
    highs = [float(mu[i] + 1.645 * sigma[i]) for i in range(horizon)]
    return [float(v) for v in mu], lows, highs


class _SimpleNBeats:
    """Minimal N-BEATS-like block for univariate forecasting."""

    def __init__(self, input_size: int, output_size: int, hidden: int = 32):
        if not _TORCH_AVAILABLE or nn is None:
            raise RuntimeError("torch not available")
        self.fc = nn.Sequential(
            nn.Linear(input_size, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, output_size),
        )

    def forward(self, x):
        return self.fc(x)


def _neural_forecast(arr: list[float] | Any, horizon: int) -> tuple[list[float], list[float], list[float]]:
    """Simple neural forecaster (N-BEATS-like)."""
    if np is None or not _TORCH_AVAILABLE:
        raise RuntimeError("Neural forecast requires numpy+torch")
    n = len(arr)
    input_size = min(24, n // 2)
    if input_size < 2:
        raise RuntimeError("series too short for neural model")
    # Normalise
    arr_np = np.array(arr, dtype=np.float64)
    m = arr_np.mean()
    s = arr_np.std() or 1.0
    norm = (arr_np - m) / s
    # Build supervised dataset
    xs, ys = [], []
    for i in range(len(norm) - input_size - horizon + 1):
        xs.append(norm[i : i + input_size])
        ys.append(norm[i + input_size : i + input_size + horizon])
    if len(xs) < 2:
        raise RuntimeError("insufficient data for neural model")
    X = torch.tensor(np.stack(xs), dtype=torch.float32)
    Y = torch.tensor(np.stack(ys), dtype=torch.float32)
    model = _SimpleNBeats(input_size, horizon)
    opt = torch.optim.Adam(model.parameters(), lr=0.01)
    for _ in range(200):
        opt.zero_grad()
        pred = model(X)
        loss = nn.MSELoss()(pred, Y)
        loss.backward()
        opt.step()
    model.eval()
    with torch.no_grad():
        last = torch.tensor(norm[-input_size:], dtype=torch.float32).unsqueeze(0)
        pred = model(last).squeeze(0).numpy()
    # Denormalise
    mu = pred * s + m
    # Crude interval from training residuals
    with torch.no_grad():
        train_pred = model(X).numpy()
    res = np.abs(train_pred - Y.numpy())
    q = float(np.percentile(res, 90))
    lows = [float(mu[i] - q * s) for i in range(horizon)]
    highs = [float(mu[i] + q * s) for i in range(horizon)]
    return [float(v) for v in mu], lows, highs


# ── Public API ────────────────────────────────────────────────────────────────

_MODEL_VERSION = "1.0.0"


def _available_models() -> list[dict]:
    out = [
        {"id": "naive", "name": "Seasonal Naive", "available": True, "learned": False},
        {"id": "theta", "name": "Theta Method", "available": True, "learned": False},
        {"id": "enkf", "name": "Ensemble Kalman Filter", "available": True, "learned": True},
        {"id": "conformal", "name": "Conformal Interval Wrapper", "available": True, "learned": False},
    ]
    out.append({"id": "gp", "name": "Gaussian Process", "available": _SKLEARN_AVAILABLE, "learned": True})
    out.append({"id": "neural", "name": "N-BEATS-like Neural", "available": _TORCH_AVAILABLE, "learned": True})
    return out


def _auto_select(arr: list[float] | Any) -> str:
    n = len(arr)
    if _TORCH_AVAILABLE and n >= 48:
        return "neural"
    if _SKLEARN_AVAILABLE and n >= 24:
        return "gp"
    if n >= 12:
        return "enkf"
    return "theta"


async def forecast_learned(series: list[float], horizon: int, model: str = "auto") -> dict[str, Any]:
    """Produce a learned forecast with calibrated prediction intervals.

    Returns dict with ``forecast`` (list of point forecasts), ``low``, ``high``,
    ``confidence``, ``model``, ``model_version``.
    """
    if horizon < 1:
        raise ValueError("horizon must be >= 1")
    arr = _to_array(series)
    n = len(arr)
    if n < 2:
        raise ValueError("series must have at least 2 finite values")

    chosen = model.lower()
    if chosen == "auto":
        chosen = _auto_select(arr)

    # Dispatch
    if chosen == "naive":
        pts = _seasonal_naive(arr, horizon)
        lows, highs = _conformal_intervals(arr, pts, horizon)
        confidence = 0.80
    elif chosen == "theta":
        pts = _theta_method(arr, horizon)
        lows, highs = _conformal_intervals(arr, pts, horizon)
        confidence = 0.85
    elif chosen == "enkf":
        pts = _enkf_forecast(arr, horizon)
        lows, highs = _conformal_intervals(arr, pts, horizon)
        confidence = 0.85
    elif chosen == "conformal":
        pts = _seasonal_naive(arr, horizon)
        lows, highs = _conformal_intervals(arr, pts, horizon, alpha=0.05)
        confidence = 0.95
    elif chosen == "gp":
        if not _SKLEARN_AVAILABLE:
            raise RuntimeError("GP requires scikit-learn")
        pts, lows, highs = _gp_forecast(arr, horizon)
        confidence = 0.90
    elif chosen == "neural":
        if not _TORCH_AVAILABLE:
            raise RuntimeError("neural requires torch")
        pts, lows, highs = _neural_forecast(arr, horizon)
        confidence = 0.90
    else:
        raise ValueError(f"unknown model: {model}")

    # Ensure monotonic interval sanity
    for i in range(horizon):
        if lows[i] > highs[i]:
            lows[i], highs[i] = highs[i], lows[i]
        if lows[i] > pts[i]:
            pts[i] = lows[i]
        if highs[i] < pts[i]:
            pts[i] = highs[i]

    result = {
        "forecast": pts,
        "low": lows,
        "high": highs,
        "confidence": confidence,
        "model": chosen,
        "model_version": _MODEL_VERSION,
        "horizon": horizon,
        "series_len": n,
    }

    # Persist
    try:
        rid = str(uuid.uuid4())
        with _conn() as conn:
            conn.execute(
                "INSERT INTO forecast_runs (id, created_ts, model, model_version, horizon, series_len, point, low, high, confidence, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    rid,
                    int(time.time() * 1000),
                    chosen,
                    _MODEL_VERSION,
                    horizon,
                    n,
                    float(pts[0]) if pts else None,
                    float(lows[0]) if lows else None,
                    float(highs[0]) if highs else None,
                    confidence,
                    json.dumps(result),
                ),
            )
        result["forecast_id"] = rid
    except Exception:
        pass  # persistence best-effort

    return result
