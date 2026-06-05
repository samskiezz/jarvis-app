"""LLM_RESEARCH — autonomous, LLM-driven research that injects grounded notes.

This is the LLM-in-the-loop the platform was missing: it uses a real language model
to DRIVE research (decompose a topic, then write grounded summaries), with the
multi-source connectors providing the evidence and the brain receiving cited,
audited notes. Model-agnostic by design:

  * OLLAMA (your Llama)         — env OLLAMA_HOST (default http://127.0.0.1:11434),
                                  OLLAMA_MODEL (default 'llama3.1'); POST /api/chat
  * OpenAI-compatible endpoint  — KIMI_BASE_URL + KIMI_API_KEY (/chat/completions)

``available()``/``backend()`` report what is reachable. With no model reachable it
returns an honest {available: False, reason} — it never fabricates. stdlib HTTP.

The single seam ``llm_complete`` is what tests mock, so the research+inject logic is
verified without a live model — and it runs for real the moment a Llama is reachable.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request

try:
    from . import brain_sources as bs
except Exception:  # noqa: BLE001
    bs = None  # type: ignore
try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore

_OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
_OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")


def _post(url: str, payload: dict, headers: dict | None = None, timeout: float = 60.0):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", errors="ignore"))


def backend() -> str | None:
    """Which LLM backend is reachable right now (ollama | openai-compatible | None)."""
    # 1. Ollama (the user's Llama)
    try:
        urllib.request.urlopen(_OLLAMA + "/api/tags", timeout=2)
        return "ollama"
    except Exception:  # noqa: BLE001
        pass
    # 2. OpenAI-compatible (Kimi/Anthropic-style) if a key is configured
    try:
        from ..config import KIMI_API_KEY, KIMI_BASE_URL
        if KIMI_API_KEY and KIMI_BASE_URL:
            return "openai-compatible"
    except Exception:  # noqa: BLE001
        pass
    return None


def available() -> bool:
    return backend() is not None


def llm_complete(prompt: str, *, system: str = "", max_tokens: int = 512) -> str | None:
    """Single completion via whichever LLM backend is reachable. None if none."""
    b = backend()
    try:
        if b == "ollama":
            msgs = ([{"role": "system", "content": system}] if system else []) + \
                   [{"role": "user", "content": prompt}]
            out = _post(_OLLAMA + "/api/chat",
                        {"model": _OLLAMA_MODEL, "messages": msgs, "stream": False})
            return (out.get("message", {}) or {}).get("content")
        if b == "openai-compatible":
            from ..config import KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL
            msgs = ([{"role": "system", "content": system}] if system else []) + \
                   [{"role": "user", "content": prompt}]
            out = _post(KIMI_BASE_URL.rstrip("/") + "/chat/completions",
                        {"model": KIMI_MODEL, "messages": msgs, "max_tokens": max_tokens, "stream": False},
                        headers={"Authorization": f"Bearer {KIMI_API_KEY}"})
            return out.get("choices", [{}])[0].get("message", {}).get("content")
    except Exception:  # noqa: BLE001
        return None
    return None


def _parse_list(text: str) -> list[str]:
    if not text:
        return []
    m = re.search(r"\[.*\]", text, re.S)
    if m:
        try:
            arr = json.loads(m.group(0))
            return [str(x).strip() for x in arr if str(x).strip()][:12]
        except Exception:  # noqa: BLE001
            pass
    # fallback: split lines / bullets
    out = []
    for line in text.splitlines():
        s = re.sub(r"^[\s\-\*\d\.\)]+", "", line).strip()
        if s:
            out.append(s)
    return out[:12]


def research(topic: str, *, max_subtopics: int = 5, inject: bool = True) -> dict:
    """LLM decomposes the topic, connectors fetch evidence, the LLM writes a grounded
    summary per subtopic, and each is injected as a cited, audited brain note."""
    if not available():
        return {"available": False, "backend": None, "topic": topic,
                "reason": "no LLM reachable (set OLLAMA_HOST to your Llama, or KIMI_API_KEY)"}
    bk = backend()
    subs_raw = llm_complete(
        f"List the {max_subtopics} most important sub-concepts of \"{topic}\" for an "
        f"intelligence knowledge base. Reply ONLY as a JSON array of short concept names.",
        system="You are a precise research planner. Output only JSON.")
    subtopics = _parse_list(subs_raw or "")[:max_subtopics]
    injected = []
    for sub in subtopics:
        evidence = None
        if bs is not None:
            try:
                primary, _ = bs.fetch_best(sub)
                evidence = primary
            except Exception:  # noqa: BLE001
                evidence = None
        src_line = f"\nSource: {evidence['url']}" if evidence and evidence.get("url") else ""
        ev_text = (evidence or {}).get("extract", "")
        summary = llm_complete(
            f"Write 2-3 factual sentences about \"{sub}\" (a sub-concept of {topic}). "
            f"Ground it in this evidence and do not invent facts:\n\n{ev_text}",
            system="You are a grounded analyst. Cite only the given evidence.") or ev_text
        if inject and sb is not None and summary:
            try:
                sb.upsert_note("concept", sub,
                               f"{summary}{src_line}\n\nResearched under [[{topic}]] by LLM ({bk}).",
                               {"llm_research": True, "backend": bk,
                                "source": (evidence or {}).get("source"),
                                "url": (evidence or {}).get("url")}, 0.7)
                injected.append(sub)
            except Exception:  # noqa: BLE001
                pass
    if jos is not None:
        jos.audit("llm_research", actor="llm-researcher", target=topic,
                  meta={"backend": bk, "subtopics": len(subtopics), "injected": len(injected)})
    return {"available": True, "backend": bk, "topic": topic,
            "subtopics": subtopics, "injected": injected}
