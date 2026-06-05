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


def _ollama_model() -> str:
    """The Ollama model to use: env override, else the first installed model
    (zero-config), else a sensible default."""
    env = os.environ.get("OLLAMA_MODEL")
    if env:
        return env
    try:
        import json as _j
        with urllib.request.urlopen(_OLLAMA + "/api/tags", timeout=3) as r:
            tags = _j.loads(r.read().decode()).get("models", [])
        if tags:
            return tags[0].get("name") or tags[0].get("model") or "llama3.2:1b"
    except Exception:  # noqa: BLE001
        pass
    return "llama3.2:1b"


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


def llm_complete(prompt: str, *, system: str = "", max_tokens: int = 512,
                 fmt: str | None = None, temperature: float = 0.2) -> str | None:
    """Single completion via whichever LLM backend is reachable. ``fmt='json'``
    forces structured JSON output (Ollama ``format``/OpenAI ``response_format``).
    None if no backend."""
    b = backend()
    try:
        if b == "ollama":
            msgs = ([{"role": "system", "content": system}] if system else []) + \
                   [{"role": "user", "content": prompt}]
            payload = {"model": _ollama_model(), "messages": msgs, "stream": False,
                       "options": {"temperature": temperature}}
            if fmt == "json":
                payload["format"] = "json"
            out = _post(_OLLAMA + "/api/chat", payload)
            return (out.get("message", {}) or {}).get("content")
        if b == "openai-compatible":
            from ..config import KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL
            msgs = ([{"role": "system", "content": system}] if system else []) + \
                   [{"role": "user", "content": prompt}]
            payload = {"model": KIMI_MODEL, "messages": msgs, "max_tokens": max_tokens,
                       "temperature": temperature, "stream": False}
            if fmt == "json":
                payload["response_format"] = {"type": "json_object"}
            out = _post(KIMI_BASE_URL.rstrip("/") + "/chat/completions", payload,
                        headers={"Authorization": f"Bearer {KIMI_API_KEY}"})
            return out.get("choices", [{}])[0].get("message", {}).get("content")
    except Exception:  # noqa: BLE001
        return None
    return None


def _name_of(item) -> str:
    """Extract a concept name from a list item that may be a string or an object
    like {"canonical_name": ...} / {"name": ...} (small models emit both)."""
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        for k in ("canonical_name", "name", "concept", "title", "term"):
            if item.get(k):
                return str(item[k]).strip()
        for v in item.values():
            if isinstance(v, str) and v.strip():
                return v.strip()
    return ""


def _parse_list(text: str) -> list[str]:
    if not text:
        return []
    # structured JSON: {"subtopics":[...]} or a bare [...]; objects or strings
    for pat in (r"\{.*\}", r"\[.*\]"):
        m = re.search(pat, text, re.S)
        if not m:
            continue
        try:
            data = json.loads(m.group(0))
            arr = data.get("subtopics", data) if isinstance(data, dict) else data
            if isinstance(arr, list):
                names = [_name_of(x) for x in arr]
                names = [n for n in names if n]
                if names:
                    return names[:12]
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
        f"Return the {max_subtopics} most important, widely-recognised sub-concepts of "
        f"\"{topic}\" for an intelligence knowledge base as JSON of the form "
        f"{{\"subtopics\": [\"concept name\", ...]}}. Use canonical names a knowledge base "
        f"would have (avoid invented or hyper-specific phrases).",
        system="You are a precise research planner. Output only valid JSON.", fmt="json")
    subtopics = _parse_list(subs_raw or "")[:max_subtopics]
    injected = []
    for sub in subtopics:
        # disambiguate short/acronym terms in the topic's context BEFORE retrieval,
        # so "AIS" under "Maritime domain awareness" resolves to the right entity.
        query = sub
        if len(sub) <= 6 or sub.isupper():
            dis = llm_complete(
                f"In the context of \"{topic}\", what does \"{sub}\" stand for? "
                f"Reply with ONLY the full unambiguous term (no punctuation, no explanation).",
                system="You disambiguate acronyms. Output only the expanded term.")
            if dis and dis.strip():
                query = dis.strip().splitlines()[0].strip(" .\"")[:80] or sub
        evidence = None
        if bs is not None:
            try:
                primary, _ = bs.fetch_best(query)
                evidence = primary
            except Exception:  # noqa: BLE001
                evidence = None
        # relevance guard: reject wrong-sense hits (e.g. dbpedia returning "Illinois"
        # for "Port State Monitoring") so we never cite a bogus source.
        if evidence:
            qtok = set(re.findall(r"[a-z0-9]+", query.lower()))
            etok = set(re.findall(r"[a-z0-9]+",
                                  (str(evidence.get("title", "")) + " " +
                                   str(evidence.get("description", "")) + " " +
                                   str(evidence.get("url", ""))).lower()))
            if qtok and not (qtok & etok):
                evidence = None
        src_line = f"\nSource: {evidence['url']}" if evidence and evidence.get("url") else ""
        ev_text = (evidence or {}).get("extract", "")
        ev_title = (evidence or {}).get("title", "")
        summary = llm_complete(
            f"Write 2-3 factual sentences about \"{sub}\" (a sub-concept of {topic}), "
            f"grounded ONLY in the evidence below. If the evidence is irrelevant or empty, "
            f"reply exactly: NO RELIABLE EVIDENCE.\n\n"
            f"Evidence title: {ev_title or '(none)'}\nEvidence: {ev_text or '(none)'}",
            system="You are a grounded analyst. Use only the provided evidence; never invent facts.") \
            or ev_text
        if summary.strip().upper().startswith("NO RELIABLE EVIDENCE"):
            continue  # don't inject ungrounded noise
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
