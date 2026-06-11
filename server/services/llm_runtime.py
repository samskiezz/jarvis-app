"""Shared runtime guards for local/Ollama-family LLM calls.

The server-side model engines already do their own batching. This guard keeps
the app from stampeding a Hostinger/Vast Ollama box from many Python call sites
at once, which is what causes accidental model loads, KV-cache bloat, and VRAM
pressure before the engine can batch intelligently.
"""

from __future__ import annotations

import asyncio
import os
import threading
from contextlib import asynccontextmanager, contextmanager, nullcontext
from typing import Iterator


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(os.environ.get(name, str(default)))))
    except Exception:  # noqa: BLE001
        return default


def is_70b_blocked(model: str | None) -> bool:
    """True when a 70B model is requested without an explicit operator flag."""
    if "70b" not in (model or "").lower():
        return False
    return not (
        _truthy(os.environ.get("LLM_ENABLE_70B"))
        or _truthy(os.environ.get("ENABLE_70B_TIER"))
        or _truthy(os.environ.get("UNDERWORLD_ENABLE_70B"))
    )


def is_local_model_provider(provider: str = "", base_url: str = "", model: str = "") -> bool:
    """Detect providers that consume the shared Ollama/Vast GPU budget."""
    p = provider.lower()
    base = base_url.lower()
    m = model.lower()
    return (
        "ollama" in p
        or "11434" in base
        or base.endswith("/v1") and ("llama" in m or "qwen" in m or "mistral" in m)
        or any(name in m for name in ("llama", "qwen", "mistral"))
    )


_SYNC_LIMIT = _int_env("LLM_LOCAL_PARALLEL", _int_env("OLLAMA_NUM_PARALLEL", 1, 1, 8), 1, 16)
_ASYNC_LIMIT = _SYNC_LIMIT
_SYNC_SEM = threading.BoundedSemaphore(_SYNC_LIMIT)
_ASYNC_SEM: asyncio.BoundedSemaphore | None = None


def local_parallel_limit() -> int:
    return _SYNC_LIMIT


@contextmanager
def sync_llm_slot(*, provider: str = "", base_url: str = "", model: str = "") -> Iterator[None]:
    """Bound concurrent local model calls; remote cloud providers pass through."""
    if not is_local_model_provider(provider, base_url, model):
        with nullcontext():
            yield
        return

    timeout = float(os.environ.get("LLM_LOCAL_QUEUE_TIMEOUT_S", "20"))
    acquired = _SYNC_SEM.acquire(timeout=timeout)
    if not acquired:
        raise RuntimeError(
            f"local LLM queue timeout after {timeout:g}s "
            f"(limit={_SYNC_LIMIT}, model={model or 'unknown'})"
        )
    try:
        yield
    finally:
        _SYNC_SEM.release()


@asynccontextmanager
async def async_llm_slot(*, provider: str = "", base_url: str = "", model: str = ""):
    """Async variant for Underworld/httpx model calls."""
    if not is_local_model_provider(provider, base_url, model):
        yield
        return

    global _ASYNC_SEM
    if _ASYNC_SEM is None:
        _ASYNC_SEM = asyncio.BoundedSemaphore(_ASYNC_LIMIT)
    timeout = float(os.environ.get("LLM_LOCAL_QUEUE_TIMEOUT_S", "20"))
    try:
        await asyncio.wait_for(_ASYNC_SEM.acquire(), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise RuntimeError(
            f"local LLM queue timeout after {timeout:g}s "
            f"(limit={_ASYNC_LIMIT}, model={model or 'unknown'})"
        ) from exc
    try:
        yield
    finally:
        _ASYNC_SEM.release()
