"""PATTERN ORACLE GPU inference server — PyTorch + CUDA, runs ON the rented box.

This is the remote tier the JARVIS backend dispatches to via
``server/services/gpu_client.py`` when ``PREDICT_GPU_URL`` is set. It runs on a
GPU host (e.g. vast.ai) inside the container in ``deploy/gpu/Dockerfile``.

It MAY import torch — it only ever runs here, never on the JARVIS side.

Endpoints
---------
GET  /health  -> {ok, device, torch_version, gpu_name, cuda}
POST /infer   -> dispatch by ``task``:
    task="forecast": train a small GRU-over-lagged-returns model on the SUPPLIED
        series (on-GPU when available), then forecast ``horizon_steps`` ahead and
        return point + interval + prob_up in the SAME schema the local
        ``MLForecaster.predict_next`` returns, so it is a genuine drop-in.

Auth: if ``PREDICT_GPU_KEY`` is set in the environment, every request must carry
``Authorization: Bearer <key>``.

Design: the dispatch table makes it trivial to add heavier foundation models
(TimesFM / Chronos) later as new tasks (e.g. ``task="forecast_chronos"``) without
touching the wire protocol.
"""

from __future__ import annotations

import math
import os
from typing import Any, Optional

import numpy as np
import torch
import torch.nn as nn
from fastapi import Body, FastAPI, Header, HTTPException

app = FastAPI(title="PATTERN ORACLE GPU tier", version="1.0")

_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_EPS = 1e-9

# longest lagged-return lookback the feature window needs.
_MAX_LAG = 20
# how many lagged one-step returns feed the model at each step.
_N_LAGS = 8


# ── auth ──────────────────────────────────────────────────────────────────────
def _check_auth(authorization: Optional[str]) -> None:
    key = os.environ.get("PREDICT_GPU_KEY", "").strip()
    if not key:
        return  # auth disabled
    expected = f"Bearer {key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")


# ── series parsing (mirror the JARVIS-side normalisation) ─────────────────────
def _values_from_series(series: Any) -> np.ndarray:
    """Extract a float price vector from ``[{t,v}, …]`` or ``[number, …]``."""
    vals: list[float] = []
    for item in series or []:
        if isinstance(item, dict):
            v = item.get("v", item.get("value"))
            if v is None:
                continue
            vals.append(float(v))
        else:
            try:
                vals.append(float(item))
            except (TypeError, ValueError):
                continue
    arr = np.asarray(vals, dtype=float)
    return arr[np.isfinite(arr)]


# ── tiny GRU forecaster over lagged returns ───────────────────────────────────
class _GRUForecaster(nn.Module):
    """A small GRU + MLP head mapping a window of lagged one-step returns to the
    forward log-return over the horizon. Deliberately lightweight so it trains in
    a fraction of a second on the supplied series, on GPU when present."""

    def __init__(self, hidden: int = 24) -> None:
        super().__init__()
        self.gru = nn.GRU(input_size=1, hidden_size=hidden, batch_first=True)
        self.head = nn.Sequential(
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # x: [B, L, 1]
        out, _ = self.gru(x)
        last = out[:, -1, :]          # [B, hidden]
        return self.head(last).squeeze(-1)  # [B]


def _build_supervised(values: np.ndarray, horizon: int) -> tuple[np.ndarray, np.ndarray]:
    """Causal (X, y): X[i] = last ``_N_LAGS`` one-step log-returns ending at i;
    y[i] = forward log-return over ``horizon``. Positive series => log space."""
    positive = bool(np.all(values > 0))
    logv = np.log(values) if positive else values
    rets = np.empty(values.size, dtype=float)
    rets[0] = 0.0
    rets[1:] = np.diff(logv)

    Xs, ys = [], []
    first = max(_N_LAGS, _MAX_LAG)
    last = values.size - 1 - horizon
    for i in range(first, last + 1):
        window = rets[i - _N_LAGS + 1: i + 1]
        if window.size != _N_LAGS or not np.all(np.isfinite(window)):
            continue
        Xs.append(window)
        ys.append(logv[i + horizon] - logv[i])
    if not Xs:
        return np.empty((0, _N_LAGS)), np.empty((0,))
    return np.asarray(Xs, dtype=float), np.asarray(ys, dtype=float)


def _forecast(payload: dict) -> dict:
    """Train the GRU on the supplied series and forecast ``horizon_steps`` ahead.

    Returns the SAME schema ``MLForecaster.predict_next`` emits:
        {status, point, interval{low,high,confidence}, prob_up, model,
         horizon_steps, last_value, method, device}.
    """
    series = payload.get("series", [])
    horizon = int(max(1, payload.get("horizon_steps", 1)))
    confidence = float(payload.get("confidence", 0.9))
    confidence = min(max(confidence, _EPS), 1.0 - _EPS)

    values = _values_from_series(series)
    n = values.size
    if n < (_MAX_LAG + horizon + 12):
        return {
            "status": "insufficient_data",
            "reason": f"need >= {_MAX_LAG + horizon + 12} points, got {n}",
            "point": float(values[-1]) if n else None,
            "model": "gpu_gru",
            "device": _DEVICE,
        }

    positive = bool(np.all(values > 0))
    X, y = _build_supervised(values, horizon)
    if X.shape[0] < 16:
        return {
            "status": "insufficient_data",
            "reason": f"only {X.shape[0]} supervised samples",
            "point": float(values[-1]),
            "model": "gpu_gru",
            "device": _DEVICE,
        }

    torch.manual_seed(42)
    dev = torch.device(_DEVICE)

    # standardize features (helps the GRU converge fast)
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd = np.where(sd < _EPS, 1.0, sd)
    Xs = (X - mu) / sd

    Xt = torch.tensor(Xs, dtype=torch.float32, device=dev).unsqueeze(-1)  # [B,L,1]
    yt = torch.tensor(y, dtype=torch.float32, device=dev)

    model = _GRUForecaster().to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=0.01)
    loss_fn = nn.MSELoss()

    model.train()
    epochs = 120
    for _ in range(epochs):
        opt.zero_grad()
        pred = model(Xt)
        loss = loss_fn(pred, yt)
        loss.backward()
        opt.step()

    # in-sample residual std -> Gaussian interval scaled to requested confidence.
    model.eval()
    with torch.no_grad():
        fitted = model(Xt)
        resid = (yt - fitted).detach().cpu().numpy()
    sigma = float(np.std(resid)) if resid.size else 0.0

    # build the feature row at the LAST origin and predict the forward return.
    logv = np.log(values) if positive else values
    rets = np.empty(values.size, dtype=float)
    rets[0] = 0.0
    rets[1:] = np.diff(logv)
    last_window = rets[-_N_LAGS:]
    last_std = (last_window - mu) / sd
    xt_last = torch.tensor(last_std, dtype=torch.float32, device=dev).reshape(1, _N_LAGS, 1)
    with torch.no_grad():
        pred_ret = float(model(xt_last).item())

    p0 = float(values[-1])
    if positive:
        point = max(0.0, p0 * math.exp(pred_ret))
    else:
        point = p0 + pred_ret

    # normal interval in return space, scaled to confidence, mapped to level.
    from math import erf, sqrt

    def _z(conf: float) -> float:
        # inverse-CDF via bisection (no scipy dependency on the GPU box).
        lo, hi = -10.0, 10.0
        target = 1.0 - (1.0 - conf) / 2.0
        for _ in range(80):
            mid = 0.5 * (lo + hi)
            cdf = 0.5 * (1.0 + erf(mid / sqrt(2.0)))
            if cdf < target:
                lo = mid
            else:
                hi = mid
        return 0.5 * (lo + hi)

    z = _z(confidence)
    lo_ret = pred_ret - z * sigma
    hi_ret = pred_ret + z * sigma
    if positive:
        low = max(0.0, p0 * math.exp(lo_ret))
        high = p0 * math.exp(hi_ret)
    else:
        low = p0 + lo_ret
        high = p0 + hi_ret
    low, high = min(low, high), max(low, high)
    if not (low < point < high):
        pad = max(abs(point) * 1e-3, _EPS)
        low, high = point - pad, point + pad
        if positive:
            low = max(0.0, low)

    # prob_up from the predicted-return distribution N(pred_ret, sigma).
    if sigma <= _EPS:
        prob_up = 1.0 if pred_ret > 0 else (0.0 if pred_ret < 0 else 0.5)
    else:
        prob_up = 0.5 * (1.0 + math.erf(pred_ret / (sigma * math.sqrt(2.0))))

    return {
        "status": "ok",
        "point": float(point),
        "interval": {
            "low": float(low),
            "high": float(high),
            "confidence": confidence,
        },
        "prob_up": float(min(max(prob_up, 0.0), 1.0)),
        "model": "gpu_gru",
        "horizon_steps": horizon,
        "last_value": p0,
        "method": "Torch GRU over lagged returns + Gaussian residual interval",
        "device": _DEVICE,
    }


# ── dispatch table (add TimesFM / Chronos here as new tasks later) ────────────
_TASKS = {
    "forecast": _forecast,
}


# ── routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health() -> dict:
    gpu_name = None
    if torch.cuda.is_available():
        try:
            gpu_name = torch.cuda.get_device_name(0)
        except Exception:  # noqa: BLE001
            gpu_name = "cuda"
    return {
        "ok": True,
        "device": _DEVICE,
        "cuda": bool(torch.cuda.is_available()),
        "torch_version": torch.__version__,
        "gpu_name": gpu_name,
        "tasks": sorted(_TASKS.keys()),
    }


@app.post("/infer")
def infer(
    payload: dict = Body(...),
    authorization: Optional[str] = Header(default=None),
) -> dict:
    _check_auth(authorization)
    task = payload.get("task")
    if not task or task not in _TASKS:
        raise HTTPException(
            status_code=400,
            detail=f"unknown task {task!r}; known: {sorted(_TASKS.keys())}",
        )
    try:
        return _TASKS[task](payload)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - report, don't crash the worker
        return {"status": "error", "reason": repr(exc), "task": task, "device": _DEVICE}


if __name__ == "__main__":  # pragma: no cover - manual launch
    import uvicorn

    port = int(os.environ.get("PORT", "8400"))
    uvicorn.run(app, host="0.0.0.0", port=port)
