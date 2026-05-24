"""Thin async streaming wrapper around the Moonshot Kimi K2 chat completions endpoint.

Moonshot is OpenAI-compatible, so we use the /chat/completions endpoint with stream=True
and emit each delta back as a string. Caller is responsible for SSE framing.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import AsyncIterator

import httpx

from ..config import KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL
from ..data.ontology import ontology_summary

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "analyst.md"


def system_prompt() -> str:
    template = _PROMPT_PATH.read_text(encoding="utf-8")
    return template.replace("{ontology}", ontology_summary())


async def stream_chat(message: str) -> AsyncIterator[str]:
    """Yield token chunks from Kimi's streaming chat completion.

    If KIMI_API_KEY is missing or the upstream call fails, yields a single
    diagnostic string so the UI shows something useful instead of hanging.
    """
    if not KIMI_API_KEY:
        yield (
            "// Kimi API key not configured. Set KIMI_API_KEY in the backend "
            "environment, then re-ask. Ontology summary:\n\n" + ontology_summary()
        )
        return

    url = f"{KIMI_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": KIMI_MODEL,
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt()},
            {"role": "user", "content": message},
        ],
    }
    headers = {
        "Authorization": f"Bearer {KIMI_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode("utf-8", errors="replace")
                    yield f"// Kimi {resp.status_code}: {body[:300]}"
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
                    delta = (
                        chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                    )
                    if delta:
                        yield delta
    except (httpx.HTTPError, httpx.TimeoutException) as exc:  # noqa: BLE001
        yield f"// Kimi network error: {exc!r}"
