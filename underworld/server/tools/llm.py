"""Kimi K2 chat client used by Minion agents and guild reviewers.

Two surfaces:
- `chat(messages, *, tools=None)` — single-shot, returns a `ChatResponse` with
  `content` and optional `tool_calls`. Used by reviewers.
- `chat_stream(messages)` — yields content chunks. Used by the public
  `/agents/.../stream` endpoint so the UI sees thinking live.

When `KIMI_API_KEY` is unset, both surfaces yield a deterministic stub
response so tests + offline dev still work. The stub is clearly labelled.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import get_settings
from ..logging_setup import get_logger

log = get_logger("llm")

# Throttled stub warning — without this a long sim run with no key set
# fills the log with the same "stub mode" line every tick.
_stub_warned = False


@dataclass
class ChatResponse:
    content: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    finish_reason: str | None = None
    raw: dict[str, Any] | None = None


def _warn_stub_once() -> None:
    global _stub_warned
    if not _stub_warned:
        log.warning(
            "llm.stub_mode",
            reason="UNDERWORLD_KIMI_API_KEY is not set; minion decisions fall back to heuristics",
        )
        _stub_warned = True


# Moonshot's k2.x reasoning models reject any temperature != 1.0 with
# `400 invalid temperature: only 1 is allowed for this model`. The agent
# layer asks for 0.7 to get creative variation; we coerce here so the
# operator can point UNDERWORLD_KIMI_MODEL at kimi-k2.6 without every
# tick 400ing into the stub fallback.
_FIXED_TEMPERATURE_MODELS = ("kimi-k2",)  # k2.5, k2.6, future k2.x
# Reasoning models spend hidden tokens on `reasoning_content` before
# emitting any visible `content`. Below this many max_tokens the agent's
# strict-JSON contract usually finishes with `finish_reason='length'`
# and an empty content — silently degrading every tick to the heuristic
# fallback. Warn at startup so the misconfig is loud.
_REASONING_MIN_MAX_TOKENS = 4096


def _coerce_temperature(model: str, requested: float) -> float:
    if any(model.startswith(prefix) for prefix in _FIXED_TEMPERATURE_MODELS):
        return 1.0
    return requested


def _kimi(s) -> tuple[str, str, str]:
    return s.kimi_base_url.rstrip("/"), s.kimi_api_key, s.kimi_model


def _llama(s) -> tuple[str, str, str]:
    base = (s.llm_base_url or "https://api.groq.com/openai/v1").rstrip("/")
    return base, s.llm_api_key, (s.llm_model or "llama-3.1-8b-instant")


# ── Underworld Minion MODEL STACK (5 layers) ────────────────────────────────────────
# Layer→model on the GPU box's Ollama. Env-overridable. 3B = whispers, 8B = individuals,
# 70B = the colony thinking. Heavy layers fall back to a present model until 70B is pulled.
import os as _os
LAYER_MODELS = {
    "overmind":      _os.environ.get("UW_MODEL_OVERMIND",  "llama3.3:70b"),   # L1 collective mind
    "god_brain":     _os.environ.get("UW_MODEL_GODBRAIN",  "llama3.3:70b"),   # L5 major story events
    "high_minion":   _os.environ.get("UW_MODEL_HIGH",      "llama3.1:8b"),    # L2 named characters
    "high_major":    _os.environ.get("UW_MODEL_HIGH_MAJOR","llama3.3:70b"),   # L2 escalated
    "normal_minion": _os.environ.get("UW_MODEL_NORMAL",    "llama3.1:8b"),    # L3 everyday minions
    "chatter":       _os.environ.get("UW_MODEL_CHATTER",   "llama3.2:latest"),# L4 background whispers
}
# fallbacks to models that ARE pulled, so a missing 70B never breaks the world
LAYER_FALLBACK = {
    "overmind":  _os.environ.get("UW_MODEL_OVERMIND_FB",  "qwen2.5:32b"),
    "god_brain": _os.environ.get("UW_MODEL_GODBRAIN_FB",  "qwen2.5:32b"),
    "high_major":_os.environ.get("UW_MODEL_HIGH_MAJOR_FB","qwen2.5:32b"),
}
_AVAIL_MODELS = None


def _available_models(base_url: str) -> set:
    """Models actually pulled on the Ollama box (cached). Empty set on failure."""
    global _AVAIL_MODELS
    if _AVAIL_MODELS is not None:
        return _AVAIL_MODELS
    _AVAIL_MODELS = set()
    try:
        import urllib.request
        tags_url = base_url.split("/v1", 1)[0].rstrip("/") + "/api/tags"
        with urllib.request.urlopen(tags_url, timeout=6) as r:
            import json as _j
            _AVAIL_MODELS = {m["name"] for m in _j.loads(r.read()).get("models", [])}
    except Exception:  # noqa: BLE001
        pass
    return _AVAIL_MODELS


def _layer_model(base_url: str, tier: str) -> str:
    """The model for a layer, downgraded to a present fallback if not pulled."""
    want = LAYER_MODELS[tier]
    avail = _available_models(base_url)
    if avail and want not in avail:
        fb = LAYER_FALLBACK.get(tier)
        if fb and fb in avail:
            return fb
        # last resort: largest present llama/qwen
        for cand in ("qwen2.5:32b", "llama3.1:8b", "llama3.2:latest"):
            if cand in avail:
                return cand
    return want


def _provider(tier: str = "standard") -> tuple[str, str, str]:
    """Resolve (base_url, api_key, model) for a task tier.

    Layer tiers (overmind/god_brain/high_minion/high_major/normal_minion/chatter) route to a
    specific Llama model on the GPU box. "high" prefers Kimi; "standard" the cheap Llama.
    Returns an empty key when nothing is configured (→ heuristic path).
    """
    s = get_settings()
    if tier in LAYER_MODELS:
        base, key, _m = _llama(s)
        if base or key:
            return base, key, _layer_model(base, tier)
        return _kimi(s) if s.kimi_api_key else ("", "", "")
    if tier == "high":
        if s.kimi_api_key:
            return _kimi(s)
        return _llama(s) if s.llm_api_key else ("", "", "")
    if s.llm_api_key:           # standard tier prefers the cheap free model
        return _llama(s)
    return _kimi(s) if s.kimi_api_key else ("", "", "")


def has_llm(tier: str = "standard") -> bool:
    """True when a real LLM is configured for this tier."""
    return bool(_provider(tier)[1])


def _is_reasoning_model(model: str) -> bool:
    return any(model.startswith(prefix) for prefix in _FIXED_TEMPERATURE_MODELS)


def warn_on_misconfig() -> None:
    """Call once at boot. Logs a WARN if UNDERWORLD_KIMI_MODEL is set to a
    reasoning model but UNDERWORLD_KIMI_MAX_TOKENS is too low for it to
    emit anything visible.
    """
    settings = get_settings()
    if not settings.kimi_api_key:
        return
    if _is_reasoning_model(settings.kimi_model) and settings.kimi_max_tokens < _REASONING_MIN_MAX_TOKENS:
        log.warning(
            "llm.reasoning_model_starved",
            model=settings.kimi_model,
            max_tokens=settings.kimi_max_tokens,
            advice=(
                f"reasoning models exhaust max_tokens on hidden reasoning_content; "
                f"raise UNDERWORLD_KIMI_MAX_TOKENS to >= {_REASONING_MIN_MAX_TOKENS} or "
                f"switch UNDERWORLD_KIMI_MODEL to moonshot-v1-32k"
            ),
        )


def _stub_response(messages: list[dict[str, Any]]) -> str:
    last_user = next(
        (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"),
        "",
    )
    return (
        "[STUB — set UNDERWORLD_KIMI_API_KEY for real LLM output]\n"
        f"I received: {str(last_user)[:280]}"
    )


async def chat(
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    tier: str = "standard",
    world_id: str | None = None,
) -> ChatResponse:
    settings = get_settings()
    base_url, api_key, model = _provider(tier)
    if not api_key:
        _warn_stub_once()
        return ChatResponse(content=_stub_response(messages), finish_reason="stub")

    # UNIFIED PIPELINE — inject the tier's validated operator lessons into the system prompt (the
    # make-Llama-smarter write-back). Best-effort: a pipeline hiccup must never break inference.
    provider = "other"
    try:
        from . import llm_pipeline as _pipe
        provider = _pipe.provider_name(base_url)
        _lessons = await _pipe.lessons_for(tier)
        if _lessons:
            messages = _pipe.inject_lessons(messages, _lessons)
    except Exception:  # noqa: BLE001
        _pipe = None

    url = f"{base_url}/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": _coerce_temperature(
            model,
            temperature if temperature is not None else settings.kimi_temperature,
        ),
        "max_tokens": max_tokens if max_tokens is not None else settings.kimi_max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    _t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        err = f"// LLM error: {exc!r}"
        if _pipe is not None:
            try:
                await _pipe.record_call(tier=tier, model=model, provider=provider, world_id=world_id,
                                        content=err, finish_reason="error", ok=False,
                                        latency_ms=int((time.monotonic() - _t0) * 1000))
            except Exception:  # noqa: BLE001
                pass
        return ChatResponse(content=err, finish_reason="error")

    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content = msg.get("content") or ""
    finish = choice.get("finish_reason")
    # OBSERVE/RECORD — telemetry + auto-file a finding on degradation (empty/length/error).
    if _pipe is not None:
        try:
            await _pipe.record_call(tier=tier, model=model, provider=provider, world_id=world_id,
                                    content=content, finish_reason=finish, ok=True,
                                    latency_ms=int((time.monotonic() - _t0) * 1000),
                                    usage=data.get("usage"))
        except Exception:  # noqa: BLE001
            pass
    return ChatResponse(
        content=content,
        tool_calls=msg.get("tool_calls") or [],
        finish_reason=finish,
        raw=data,
    )


async def chat_stream(messages: list[dict[str, Any]]) -> AsyncIterator[str]:
    settings = get_settings()
    base_url, api_key, model = _provider()
    if not api_key:
        # Emit the stub in three chunks so the UI's streaming code is exercised.
        stub = _stub_response(messages)
        for chunk in (stub[:60], stub[60:120], stub[120:]):
            if chunk:
                yield chunk
        return

    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": _coerce_temperature(model, settings.kimi_temperature),
        "max_tokens": settings.kimi_max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode("utf-8", errors="replace")
                    yield f"// LLM {resp.status_code}: {body[:200]}"
                    return
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        return
                    try:
                        evt = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = (evt.get("choices") or [{}])[0].get("delta", {}).get("content")
                    if delta:
                        yield delta
    except httpx.HTTPError as exc:
        yield f"// LLM stream error: {exc!r}"


__all__ = ["ChatResponse", "chat", "chat_stream"]
