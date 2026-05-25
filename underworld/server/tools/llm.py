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


@dataclass
class ChatResponse:
    content: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    finish_reason: str | None = None
    raw: dict[str, Any] | None = None


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
) -> ChatResponse:
    settings = get_settings()
    if not settings.kimi_api_key:
        return ChatResponse(content=_stub_response(messages), finish_reason="stub")

    url = f"{settings.kimi_base_url.rstrip('/')}/chat/completions"
    payload: dict[str, Any] = {
        "model": settings.kimi_model,
        "messages": messages,
        "temperature": temperature if temperature is not None else settings.kimi_temperature,
        "max_tokens": max_tokens if max_tokens is not None else settings.kimi_max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers = {
        "Authorization": f"Bearer {settings.kimi_api_key}",
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
    if not settings.kimi_api_key:
        # Emit the stub in three chunks so the UI's streaming code is exercised.
        stub = _stub_response(messages)
        for chunk in (stub[:60], stub[60:120], stub[120:]):
            if chunk:
                yield chunk
        return

    url = f"{settings.kimi_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": settings.kimi_model,
        "messages": messages,
        "stream": True,
        "temperature": settings.kimi_temperature,
        "max_tokens": settings.kimi_max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {settings.kimi_api_key}",
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
