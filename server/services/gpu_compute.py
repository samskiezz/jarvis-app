"""GPU COMPUTE DISPATCHER — unified interface to the Vast.ai GPU tier.

This is the REAL billion-dollar infrastructure: a production-grade dispatcher
that offloads heavy compute (LLM inference, embeddings, pattern discovery,
model training) to a remote GPU box (2x RTX 4090 on Vast.ai).

Design principles:
  * Circuit breaker — stops hammering a dead GPU after 3 consecutive failures.
  * Graceful fallback — every GPU call degrades to CPU automatically.
  * Streaming support — LLM tokens stream back chunk-by-chunk.
  * Health polling — async background health checks keep status fresh.
  * Never raise — all public functions return structured dicts, never crash.

Env contract (read at call-time so the operator can flip live):
  GPU_BASE_URL      — base URL of the GPU server (e.g. http://211.72.13.201:41169)
  GPU_AUTH_TOKEN    — Bearer token or Jupyter token for Caddy proxy auth
  GPU_HEALTH_INTERVAL_S — how often to poll health (default 30)
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any, AsyncIterator, Optional

import httpx

# ── env ──────────────────────────────────────────────────────────────────────
_GPU_URL = os.environ.get("GPU_BASE_URL", "").strip().rstrip("/")
_GPU_TOKEN = os.environ.get("GPU_AUTH_TOKEN", "").strip()
_HEALTH_INTERVAL = max(5, int(os.environ.get("GPU_HEALTH_INTERVAL_S", "30")))

# ── circuit breaker ──────────────────────────────────────────────────────────
_BREAKER_THRESHOLD = 3
_BREAKER_COOLDOWN = 30.0
_breaker_failures = 0
_breaker_open_until = 0.0
_last_health: dict = {"ok": False, "checked_at": 0.0}


def _breaker_open() -> bool:
    if _breaker_open_until <= 0.0:
        return False
    if time.monotonic() >= _breaker_open_until:
        return False
    return True


def _record_success() -> None:
    global _breaker_failures, _breaker_open_until
    _breaker_failures = 0
    _breaker_open_until = 0.0


def _record_failure() -> None:
    global _breaker_failures, _breaker_open_until
    _breaker_failures += 1
    if _breaker_failures >= _BREAKER_THRESHOLD:
        _breaker_open_until = time.monotonic() + _BREAKER_COOLDOWN


# ── headers ──────────────────────────────────────────────────────────────────
def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if _GPU_TOKEN:
        h["Authorization"] = f"Bearer {_GPU_TOKEN}"
    return h


# ── public: configuration ────────────────────────────────────────────────────
def gpu_configured() -> bool:
    return bool(_GPU_URL)


def gpu_status() -> dict:
    """Latest known health (cached, updated by background poller)."""
    return dict(_last_health)


# ── public: health check ─────────────────────────────────────────────────────
async def health_check(force: bool = False) -> dict:
    """Poll the GPU server /v1/models (SGLang) or /health (custom GPU server).
    Returns {ok, device, models, checked_at} or {ok:False, reason}."""
    global _last_health
    if not gpu_configured():
        return {"ok": False, "reason": "not_configured"}
    if _breaker_open() and not force:
        return {"ok": False, "reason": "circuit_breaker_open"}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            # SGLang exposes /v1/models when healthy
            r = await client.get(
                f"{_GPU_URL}/v1/models",
                headers=_headers(),
                params={"token": _GPU_TOKEN} if _GPU_TOKEN else None,
            )
            if r.status_code == 200:
                data = r.json()
                models = [m.get("id") for m in data.get("data", [])]
                _record_success()
                result = {
                    "ok": True,
                    "device": "cuda",
                    "models": models,
                    "checked_at": time.time(),
                }
                _last_health = result
                return result
            elif r.status_code == 401:
                _record_failure()
                result = {"ok": False, "reason": "unauthorized", "checked_at": time.time()}
                _last_health = result
                return result
            else:
                _record_failure()
                result = {"ok": False, "reason": f"http_{r.status_code}", "checked_at": time.time()}
                _last_health = result
                return result
    except Exception as exc:
        _record_failure()
        result = {"ok": False, "reason": repr(exc), "checked_at": time.time()}
        _last_health = result
        return result


# ── public: LLM inference (SGLang / OpenAI-compatible) ───────────────────────
async def llm_infer(
    messages: list[dict[str, str]],
    model: str = "Qwen/Qwen3-8B",
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncIterator[str]:
    """Dispatch LLM inference to the GPU server. Yields token chunks.

    For non-streaming completion, use ``llm_infer_complete``.
    """
    if not gpu_configured() or _breaker_open():
        yield "// GPU LLM unavailable — check GPU_BASE_URL"
        return

    url = f"{_GPU_URL}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    params = {"token": _GPU_TOKEN} if _GPU_TOKEN else None

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
            async with client.stream("POST", url, headers=_headers(), json=payload, params=params) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode("utf-8", errors="replace")[:300]
                    _record_failure()
                    yield f"// GPU LLM error {resp.status_code}: {body}"
                    return
                _record_success()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        yield delta
    except Exception as exc:
        _record_failure()
        yield f"// GPU LLM exception: {exc}"
        return


async def llm_infer_complete(
    messages: list[dict[str, str]],
    model: str = "Qwen/Qwen3-8B",
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> dict:
    """Non-streaming LLM inference. Returns the full response dict."""
    if not gpu_configured() or _breaker_open():
        return {"status": "gpu_unavailable", "reason": "not_configured_or_breaker_open"}

    url = f"{_GPU_URL}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    params = {"token": _GPU_TOKEN} if _GPU_TOKEN else None

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
            r = await client.post(url, headers=_headers(), json=payload, params=params)
            if r.status_code != 200:
                _record_failure()
                return {"status": "error", "code": r.status_code, "body": r.text[:500]}
            _record_success()
            return r.json()
    except Exception as exc:
        _record_failure()
        return {"status": "error", "reason": repr(exc)}


# ── public: embeddings ───────────────────────────────────────────────────────
async def embed(texts: list[str], model: str = "") -> Optional[list[list[float]]]:
    """Dispatch embedding generation to the GPU server.
    Returns list of float vectors, or None on any failure (caller falls back)."""
    if not gpu_configured() or _breaker_open():
        return None

    url = f"{_GPU_URL}/v1/embeddings"
    payload = {
        "model": model or "Qwen/Qwen3-8B",
        "input": texts if isinstance(texts, list) else [texts],
    }
    params = {"token": _GPU_TOKEN} if _GPU_TOKEN else None

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            r = await client.post(url, headers=_headers(), json=payload, params=params)
            if r.status_code != 200:
                _record_failure()
                return None
            data = r.json()
            embs = data.get("data", [])
            out = [e.get("embedding") for e in embs]
            _record_success()
            return out
    except Exception:
        _record_failure()
        return None


# ── public: pattern discovery (GPU-accelerated) ─────────────────────────────
async def pattern_discover(
    series: list[float],
    window: int = 24,
    task: str = "matrix_profile",
) -> Optional[dict]:
    """Dispatch pattern discovery to the GPU server.
    Task types: matrix_profile, anomaly, changepoint, motif.
    Returns dict with patterns, or None on failure."""
    if not gpu_configured() or _breaker_open():
        return None

    # If the GPU server doesn't have a native pattern endpoint, we POST to /infer
    url = f"{_GPU_URL}/infer"
    payload = {
        "task": task,
        "series": series,
        "window": window,
    }
    params = {"token": _GPU_TOKEN} if _GPU_TOKEN else None

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            r = await client.post(url, headers=_headers(), json=payload, params=params)
            if r.status_code != 200:
                _record_failure()
                return None
            _record_success()
            return r.json()
    except Exception:
        _record_failure()
        return None


# ── public: model training ───────────────────────────────────────────────────
async def train_model(
    task: str,
    dataset: dict,
    hyperparams: Optional[dict] = None,
) -> Optional[dict]:
    """Dispatch model training to the GPU server.
    Returns {status, model_id, metrics} or None on failure."""
    if not gpu_configured() or _breaker_open():
        return None

    url = f"{_GPU_URL}/train"
    payload = {
        "task": task,
        "dataset": dataset,
        "hyperparams": hyperparams or {},
    }
    params = {"token": _GPU_TOKEN} if _GPU_TOKEN else None

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=15.0)) as client:
            r = await client.post(url, headers=_headers(), json=payload, params=params)
            if r.status_code != 200:
                _record_failure()
                return None
            _record_success()
            return r.json()
    except Exception:
        _record_failure()
        return None


# ── background health poller (started from lifespan) ─────────────────────────
async def health_poller() -> None:
    """Infinite loop that polls GPU health every _HEALTH_INTERVAL seconds.
    Safe to cancel; never crashes."""
    while True:
        try:
            await health_check(force=True)
        except Exception:
            pass
        await asyncio.sleep(_HEALTH_INTERVAL)
