"""GPU dispatch client — the JARVIS side of the optional PATTERN ORACLE GPU tier.

This is a thin, dependency-light client (stdlib + ``httpx`` only — **NO torch**)
that lets the JARVIS backend offload heavy forecasts to a remote PyTorch+CUDA
inference server (``deploy/gpu/server.py``) running on a rented GPU box
(e.g. vast.ai). It is **env-gated and graceful by contract**:

  * If ``PREDICT_GPU_URL`` is unset the tier is dormant — every call reports
    "not configured" and callers transparently use the local CPU forecaster.
  * If it IS set, forecasts are POSTed to ``{PREDICT_GPU_URL}/infer``; on ANY
    failure (network, timeout, non-200, bad JSON, an open circuit breaker) the
    client returns a structured ``{"status": "gpu_unavailable", ...}`` and
    NEVER raises — so a flaky GPU box can never break a prediction route.

Env contract (all read at call-time so the operator can flip them live):
  PREDICT_GPU_URL    base URL of the remote inference server (e.g.
                     ``http://1.2.3.4:8400``). Empty => tier disabled.
  PREDICT_GPU_KEY    optional bearer token; sent as ``Authorization: Bearer …``.
  PREDICT_GPU_MODEL  optional model-variant name forwarded in the payload.

A tiny in-process circuit breaker trips after a few consecutive failures so we
stop hammering a dead box for ``_BREAKER_COOLDOWN`` seconds, then probe again.
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional, Sequence

# ── circuit-breaker state (module-level, in-process) ──────────────────────────
_BREAKER_THRESHOLD = 3        # consecutive failures before we open the breaker
_BREAKER_COOLDOWN = 30.0      # seconds to stay open before probing again
_breaker_failures = 0
_breaker_open_until = 0.0


def _reset_breaker() -> None:
    """Test/ops helper: clear the circuit-breaker state."""
    global _breaker_failures, _breaker_open_until
    _breaker_failures = 0
    _breaker_open_until = 0.0


def _record_success() -> None:
    global _breaker_failures, _breaker_open_until
    _breaker_failures = 0
    _breaker_open_until = 0.0


def _record_failure() -> None:
    global _breaker_failures, _breaker_open_until
    _breaker_failures += 1
    if _breaker_failures >= _BREAKER_THRESHOLD:
        _breaker_open_until = time.monotonic() + _BREAKER_COOLDOWN


def _breaker_open() -> bool:
    """True while the breaker is tripped (so we short-circuit to fallback)."""
    if _breaker_open_until <= 0.0:
        return False
    if time.monotonic() >= _breaker_open_until:
        # cooldown elapsed -> half-open: allow the next call to probe.
        return False
    return True


# ── env accessors (read live; never cached at import) ─────────────────────────
def _gpu_url() -> str:
    return os.environ.get("PREDICT_GPU_URL", "").strip()


def _gpu_key() -> str:
    return os.environ.get("PREDICT_GPU_KEY", "").strip()


def _gpu_model() -> str:
    return os.environ.get("PREDICT_GPU_MODEL", "").strip()


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    key = _gpu_key()
    if key:
        h["Authorization"] = f"Bearer {key}"
    return h


def gpu_configured() -> bool:
    """True iff the operator has set ``PREDICT_GPU_URL`` (tier is enabled)."""
    return bool(_gpu_url())


def health() -> dict:
    """GET ``{PREDICT_GPU_URL}/health`` with a short timeout.

    Returns the parsed health dict (e.g. ``{"ok": True, "device": "cuda", …}``)
    or ``{"ok": False, "reason": …}`` on any problem. Never raises.
    """
    base = _gpu_url()
    if not base:
        return {"ok": False, "reason": "not_configured"}
    try:
        import httpx

        resp = httpx.get(
            f"{base.rstrip('/')}/health",
            headers=_headers(),
            timeout=httpx.Timeout(5.0, connect=3.0),
        )
        if resp.status_code != 200:
            return {"ok": False, "reason": f"http_{resp.status_code}"}
        data = resp.json()
        if isinstance(data, dict):
            data.setdefault("ok", True)
            return data
        return {"ok": False, "reason": "bad_payload"}
    except Exception as exc:  # noqa: BLE001 - graceful by contract
        return {"ok": False, "reason": repr(exc)}


def infer(task: str, payload: dict, *, timeout: float = 30.0, retries: int = 1) -> dict:
    """POST ``{PREDICT_GPU_URL}/infer`` with ``{"task": task, **payload}``.

    Sends the optional bearer (``PREDICT_GPU_KEY``) and forwards
    ``PREDICT_GPU_MODEL`` as ``model`` when set. Retries transient failures up to
    ``retries`` extra times, honours an in-process circuit breaker, and on ANY
    failure returns ``{"status": "gpu_unavailable", "reason": …}`` — it NEVER
    raises, so callers can always fall back to the local model.
    """
    base = _gpu_url()
    if not base:
        return {"status": "gpu_unavailable", "reason": "not_configured"}
    if _breaker_open():
        return {"status": "gpu_unavailable", "reason": "circuit_open"}

    body: dict[str, Any] = {"task": task, **(payload or {})}
    model = _gpu_model()
    if model and "model" not in body:
        body["model"] = model

    url = f"{base.rstrip('/')}/infer"
    attempts = max(1, int(retries) + 1)
    last_reason = "unknown"
    try:
        import httpx
    except Exception as exc:  # noqa: BLE001 - httpx somehow missing
        return {"status": "gpu_unavailable", "reason": f"httpx_import:{exc!r}"}

    for attempt in range(attempts):
        try:
            resp = httpx.post(
                url,
                json=body,
                headers=_headers(),
                timeout=httpx.Timeout(float(timeout), connect=min(8.0, float(timeout))),
            )
            if resp.status_code != 200:
                last_reason = f"http_{resp.status_code}"
                _record_failure()
                continue
            data = resp.json()
            if not isinstance(data, dict):
                last_reason = "bad_payload"
                _record_failure()
                continue
            _record_success()
            return data
        except Exception as exc:  # noqa: BLE001 - timeout / network / decode
            last_reason = repr(exc)
            _record_failure()
            if attempt + 1 < attempts:
                continue
    return {"status": "gpu_unavailable", "reason": last_reason}


def remote_forecast(
    series: Sequence,
    horizon_steps: int,
    *,
    confidence: float = 0.9,
    timeout: float = 30.0,
    **kw: Any,
) -> Optional[dict]:
    """Convenience: request a remote ``"forecast"`` for ``series``.

    Returns the parsed forecast dict (same schema ``MLForecaster.predict_next``
    emits: ``status/point/interval/prob_up/…``) on success, or ``None`` when the
    GPU tier is not configured OR the remote call failed — ``None`` is the
    explicit signal to the caller to use the LOCAL model instead.
    """
    if not gpu_configured():
        return None
    payload = {
        "series": _normalize_series(series),
        "horizon_steps": int(max(1, horizon_steps)),
        "confidence": float(confidence),
    }
    payload.update(kw)
    out = infer("forecast", payload, timeout=timeout)
    if not isinstance(out, dict) or out.get("status") == "gpu_unavailable":
        return None
    return out


def _normalize_series(series: Sequence) -> list:
    """Coerce a series into a JSON-friendly list the remote server accepts.

    Accepts the canonical ``[{"t":…, "v":…}, …]`` (passed through) or a plain
    list of numbers (passed through). Anything else is best-effort floated.
    """
    out: list = []
    for item in series or []:
        if isinstance(item, dict):
            row: dict[str, Any] = {}
            v = item.get("v", item.get("value"))
            if v is not None:
                row["v"] = float(v)
            t = item.get("t", item.get("time"))
            if t is not None:
                row["t"] = float(t)
            if row:
                out.append(row)
        else:
            try:
                out.append(float(item))
            except (TypeError, ValueError):
                continue
    return out
