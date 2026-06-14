"""k-LLM Architecture — model-agnostic routing between providers with fallback chain.

Preserves the same interface as ``kimi.py`` so existing routes can optionally switch.
Providers (in fallback order):
  * gpu     — SGLang on remote GPU (uses GPU_BASE_URL / GPU_AUTH_TOKEN)
  * ollama  — Ollama on remote GPU (uses OLLAMA_BASE_URL) — PRIMARY when remote
  * kimi    — Moonshot Kimi K2 (default; uses KIMI_API_KEY / KIMI_BASE_URL)
  * openai  — OpenAI GPT-4o (uses OPENAI_API_KEY)
  * anthropic — Anthropic Claude (uses ANTHROPIC_API_KEY)

When OLLAMA_BASE_URL points to a non-localhost address, Ollama is promoted to
PRIMARY so the GPU box serves inference first. Local Ollama remains last.

Env overrides:
  * LLM_PROVIDER      — force a provider (kimi|openai|anthropic|ollama|gpu)
  * OPENAI_API_KEY    — OpenAI key
  * ANTHROPIC_API_KEY — Anthropic key
  * OLLAMA_BASE_URL   — Ollama host (default http://127.0.0.1:11434)
  * GPU_BASE_URL      — SGLang GPU server base URL
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from typing import AsyncIterator

import httpx

from ..config import KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL

# Telemetry for fallback non-streaming completions (same DB as tiered_llm)
try:
    from . import tiered_llm as _tl
except Exception:  # noqa: BLE001
    _tl = None  # type: ignore[assignment]

_OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
_OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
_ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# GPU SGLang server (Vast.ai 2x RTX 4090) — PRIMARY when configured.
_GPU_URL = os.environ.get("GPU_BASE_URL", "").strip().rstrip("/")
_GPU_TOKEN = os.environ.get("GPU_AUTH_TOKEN", "").strip()

def _is_remote_ollama() -> bool:
    """True when OLLAMA_BASE_URL points to a remote GPU box (not localhost)."""
    return bool(_OLLAMA_BASE) and "localhost" not in _OLLAMA_BASE and "127.0.0.1" not in _OLLAMA_BASE


# Ordered fallback chain when no specific provider is requested.
# Priority: SGLang GPU > Remote Ollama GPU > Cloud APIs > Local Ollama
if _GPU_URL:
    _DEFAULT_CHAIN = ["gpu", "kimi", "openai", "anthropic", "ollama"]
elif _is_remote_ollama():
    _DEFAULT_CHAIN = ["ollama", "kimi", "openai", "anthropic"]
else:
    _DEFAULT_CHAIN = ["kimi", "openai", "anthropic", "ollama"]


def _provider_from_env() -> str | None:
    p = os.environ.get("LLM_PROVIDER", "").strip().lower()
    return p if p else None


def _available_providers() -> list[str]:
    """Return which providers have credentials configured."""
    avail: list[str] = []
    if KIMI_API_KEY:
        avail.append("kimi")
    if _OPENAI_KEY:
        avail.append("openai")
    if _ANTHROPIC_KEY:
        avail.append("anthropic")
    # Ollama is always listed; health-checked at call time.
    avail.append("ollama")
    return avail


async def _stream_kimi(message: str, system_prompt: str, fmt: str | None = None, max_tokens: int | None = None) -> AsyncIterator[str]:
    url = f"{KIMI_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": KIMI_MODEL,
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if fmt == "json":
        payload["response_format"] = {"type": "json_object"}
    headers = {
        "Authorization": f"Bearer {KIMI_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", errors="replace")
                yield f"// {resp.status_code}: {body[:300]}"
                return
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


async def _stream_openai(message: str, system_prompt: str, fmt: str | None = None, max_tokens: int | None = None) -> AsyncIterator[str]:
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": "gpt-4o",
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if fmt == "json":
        payload["response_format"] = {"type": "json_object"}
    headers = {
        "Authorization": f"Bearer {_OPENAI_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", errors="replace")
                yield f"// openai {resp.status_code}: {body[:300]}"
                return
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


async def _stream_anthropic(message: str, system_prompt: str, fmt: str | None = None, max_tokens: int | None = None) -> AsyncIterator[str]:
    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": max_tokens or 4096,
        "system": system_prompt,
        "messages": [{"role": "user", "content": message}],
        "stream": True,
    }
    headers = {
        "x-api-key": _ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", errors="replace")
                yield f"// anthropic {resp.status_code}: {body[:300]}"
                return
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
                # Anthropic streaming uses delta.text
                delta = chunk.get("delta", {})
                if isinstance(delta, dict):
                    text = delta.get("text")
                    if text:
                        yield text


async def _stream_ollama(message: str, system_prompt: str, fmt: str | None = None, max_tokens: int | None = None) -> AsyncIterator[str]:
    model = os.environ.get("OLLAMA_MODEL", "llama3.2:1b")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "stream": True,
    }
    if max_tokens:
        payload["options"] = {"num_predict": max_tokens}
    if fmt == "json":
        payload["format"] = "json"   # constrain Ollama to valid JSON so structured callers (compress/spec/…) parse
    url = f"{_OLLAMA_BASE}/api/chat"
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        async with client.stream("POST", url, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", errors="replace")
                yield f"// ollama {resp.status_code}: {body[:300]}"
                return
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = chunk.get("message", {})
                if isinstance(msg, dict):
                    content = msg.get("content")
                    if content:
                        yield content
                if chunk.get("done"):
                    return


async def _stream_gpu(message: str, system_prompt: str, fmt: str | None = None, max_tokens: int | None = None) -> AsyncIterator[str]:
    """Stream from the Vast.ai GPU SGLang server (2x RTX 4090).

    If the GPU is unreachable or returns an error diagnostic (starts with '//'),
    we suppress the diagnostic and return immediately so the fallback chain
    tries the next provider (kimi → openai → anthropic → ollama)."""
    from . import gpu_compute as gc
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]
    gen = gc.llm_infer(messages=messages)
    try:
        first = await gen.__anext__()
    except StopAsyncIteration:
        return
    # If the GPU yielded an error diagnostic, bail out so fallback kicks in.
    if isinstance(first, str) and first.startswith("//"):
        return
    yield first
    async for chunk in gen:
        yield chunk


_PROVIDER_STREAMERS = {
    "kimi": _stream_kimi,
    "openai": _stream_openai,
    "anthropic": _stream_anthropic,
    "ollama": _stream_ollama,
    "gpu": _stream_gpu,
}


async def stream_chat(
    message: str,
    provider: str | None = None,
    system_prompt: str = "",
    fmt: str | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """Yield token chunks from the chosen LLM provider, with auto-fallback.

    If the requested provider fails, we immediately yield a diagnostic and stop
    (caller can retry with a different provider). The fallback chain is applied
    only when *no* provider is explicitly requested.
    """
    message = str(message or "").strip()
    system = str(system_prompt or "")

    forced = provider or _provider_from_env()
    chain = [forced] if forced else [p for p in _DEFAULT_CHAIN if p in _available_providers()]

    last_error = ""
    for p in chain:
        streamer = _PROVIDER_STREAMERS.get(p)
        if streamer is None:
            last_error = f"// Unknown provider: {p}"
            continue
        try:
            yielded = False
            async for chunk in streamer(message, system, fmt, max_tokens):
                yielded = True
                yield chunk
            if yielded:
                return
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            last_error = f"// {p} network error: {exc!r}"
        except Exception as exc:  # noqa: BLE001
            last_error = f"// {p} error: {exc!r}"

    yield last_error or "// No LLM provider available. Set KIMI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or start Ollama."


def list_providers() -> list[dict]:
    """Return provider metadata + reachability hint."""
    out: list[dict] = []
    for p in _DEFAULT_CHAIN:
        meta: dict = {"id": p, "configured": False}
        if p == "kimi":
            meta["model"] = KIMI_MODEL
            meta["configured"] = bool(KIMI_API_KEY)
        elif p == "openai":
            meta["model"] = "gpt-4o"
            meta["configured"] = bool(_OPENAI_KEY)
        elif p == "anthropic":
            meta["model"] = "claude-3-5-sonnet-20241022"
            meta["configured"] = bool(_ANTHROPIC_KEY)
        elif p == "ollama":
            meta["model"] = os.environ.get("OLLAMA_MODEL", "llama3.2:1b")
            meta["configured"] = True
        elif p == "gpu":
            meta["model"] = "Qwen/Qwen3-8B"
            meta["configured"] = bool(_GPU_URL)
            meta["url"] = _GPU_URL
        out.append(meta)
    return out


async def health_check(provider: str) -> dict:
    """Lightweight health probe for a single provider."""
    streamer = _PROVIDER_STREAMERS.get(provider)
    if streamer is None:
        return {"provider": provider, "healthy": False, "error": "unknown provider"}
    try:
        # Send a trivial prompt; consume first chunk as proof of life.
        async for _ in streamer("hi", ""):
            return {"provider": provider, "healthy": True}
        return {"provider": provider, "healthy": True}
    except Exception as exc:  # noqa: BLE001
        return {"provider": provider, "healthy": False, "error": str(exc)}


# ══════════════════════════════════════════════════════════════════════════════
# Non-streaming fallback completion + provider health (sync-friendly)
# ══════════════════════════════════════════════════════════════════════════════

def _run_sync(coro):
    """Run an async coroutine from sync code safely, even if a loop is running."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Already inside a running event loop: run in a fresh thread and wait.
    result = [None]
    exception = [None]

    def _runner():
        try:
            result[0] = asyncio.run(coro)
        except Exception as exc:  # noqa: BLE001
            exception[0] = exc

    t = threading.Thread(target=_runner)
    t.start()
    t.join(timeout=120)
    if exception[0]:
        raise exception[0]
    return result[0]


async def _collect_stream(provider: str, message: str, system: str, fmt: str | None, max_tokens: int | None) -> dict:
    """Collect a full non-streaming response from one provider."""
    streamer = _PROVIDER_STREAMERS.get(provider)
    if streamer is None:
        return {"ok": False, "text": "", "error": f"unknown provider: {provider}"}
    chunks: list[str] = []
    t0 = time.time()
    try:
        async for chunk in streamer(message, system, fmt, max_tokens):
            if isinstance(chunk, str):
                chunks.append(chunk)
        text = "".join(chunks).strip()
        dt = int((time.time() - t0) * 1000)
        if not text:
            return {"ok": False, "text": "", "error": "no content", "latency_ms": dt}
        if text.startswith("//"):
            # Diagnostic from streamer itself means this provider did not produce real output.
            return {"ok": False, "text": "", "error": text, "latency_ms": dt}
        return {"ok": True, "text": text, "latency_ms": dt}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "text": "", "error": f"{type(exc).__name__}: {exc}", "latency_ms": int((time.time() - t0) * 1000)}


def complete(
    message: str,
    system_prompt: str = "",
    provider: str | None = None,
    fmt: str | None = "json",
    max_tokens: int = 512,
) -> str | None:
    """Non-streaming completion with full provider fallback.

    Returns the concatenated text from the first provider that yields content,
    or None if every provider fails. This lets sync callers (jarvis_agent,
    enrich, autopilot) get the same fallback chain that stream_chat enjoys.
    """
    message = str(message or "").strip()
    system = str(system_prompt or "")
    forced = provider or _provider_from_env()
    chain = [forced] if forced else [p for p in _DEFAULT_CHAIN if p in _available_providers()]

    last_error = ""
    started = time.time()
    for p in chain:
        res = _run_sync(_collect_stream(p, message, system, fmt, max_tokens))
        model = ""
        for meta in list_providers():
            if meta.get("id") == p:
                model = meta.get("model", "")
                break
        if res.get("ok"):
            try:
                if _tl is not None:
                    _tl._record(p, model, p, True, res.get("latency_ms", 0), None, "")
            except Exception:  # noqa: BLE001
                pass
            return res["text"]
        err = res.get("error") or "failed"
        last_error = f"{p}: {err}"
        try:
            if _tl is not None:
                _tl._record(p, model, p, False, res.get("latency_ms", 0), None, last_error[:200])
        except Exception:  # noqa: BLE001
            pass

    total_ms = int((time.time() - started) * 1000)
    try:
        if _tl is not None:
            _tl._record("router", "", "router", False, total_ms, None, f"all providers failed: {last_error}"[:200])
    except Exception:  # noqa: BLE001
        pass
    return None


def backend() -> str | None:
    """Return the first configured provider in the current fallback chain."""
    for meta in list_providers():
        if meta.get("configured"):
            return meta.get("id")
    return None


# In-process health cache
_HEALTH_CACHE: dict | None = None
_HEALTH_AT = 0.0
_HEALTH_TTL = 30.0


async def health_summary_async(force: bool = False) -> dict:
    """Live provider health: configured + reachable + latency."""
    global _HEALTH_CACHE, _HEALTH_AT
    if not force and _HEALTH_CACHE and (time.time() - _HEALTH_AT) < _HEALTH_TTL:
        return _HEALTH_CACHE

    providers = list_providers()
    results = []
    for meta in providers:
        pid = meta.get("id", "")
        t0 = time.time()
        check = await health_check(pid)
        dt = int((time.time() - t0) * 1000)
        results.append({
            "id": pid,
            "model": meta.get("model"),
            "configured": bool(meta.get("configured")),
            "reachable": bool(check.get("healthy")),
            "latency_ms": dt,
            "error": check.get("error"),
        })

    _HEALTH_CACHE = {"providers": results, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    _HEALTH_AT = time.time()
    return _HEALTH_CACHE


def health_summary(force: bool = False) -> dict:
    """Sync entrypoint for provider health."""
    return _run_sync(health_summary_async(force=force))
