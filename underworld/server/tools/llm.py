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


def _provider(tier: str = "standard") -> tuple[str, str, str]:
    """Resolve (base_url, api_key, model) for a task tier.

    - "high"  (guild reviews, oracle, hard reasoning) → prefer Kimi for quality,
      falling back to a free Llama if that's all that's configured.
    - "standard" (routine per-tick minion decisions) → prefer the cheap free
      Llama, falling back to Kimi.
    Returns an empty key when nothing is configured (→ heuristic+neural path).
    """
    s = get_settings()
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
) -> ChatResponse:
    settings = get_settings()
    base_url, api_key, model = _provider(tier)
    if not api_key:
        _warn_stub_once()
        return ChatResponse(content=_stub_response(messages), finish_reason="stub")

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

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        return ChatResponse(content=f"// LLM error: {exc!r}", finish_reason="error")

    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    return ChatResponse(
        content=msg.get("content") or "",
        tool_calls=msg.get("tool_calls") or [],
        finish_reason=choice.get("finish_reason"),
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
