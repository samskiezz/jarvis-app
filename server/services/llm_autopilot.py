"""LLM AUTOPILOT — the continuous, LLM-driven research loop that keeps the GPU busy.

The platform already had the LLM-in-the-loop seam (:func:`llm_research.research`):
it decomposes a topic, fetches grounded evidence, and writes cited brain notes using
a real language model (Ollama / Llama on the GPU, or an OpenAI-compatible endpoint).
What was MISSING is anything that DROVE it continuously — so a connected GPU sat idle
except for interactive chat, and the brain only grew when someone clicked a button.

This module is that engine. It cycles forever through the 31 master topics, then the
vault's OWN knowledge gaps and existing concepts, running ``llm_research.research`` on
each. With a GPU connected, the model is *always reasoning* and the brain is *always
growing* — the GPU is genuinely hammered. Several concurrent workers saturate the
device instead of issuing one lonely request at a time.

Doctrine (mirrors :mod:`forward_test` / :mod:`scheduler_svc`):
  * NOTHING here touches the network or a model on import.
  * The loop is OPT-IN: :func:`start_loop_if_enabled` is a no-op unless
    ``LLM_AUTOPILOT_ENABLE`` is truthy. The production serve scripts set it, so a
    deploy auto-hammers; tests / bare imports never do.
  * When no LLM backend is reachable the loop IDLES (short sleep, re-check) instead of
    spinning — so connecting a GPU later makes it start hammering automatically.
  * Every iteration is defensive; one failed topic never kills the loop; cancellation
    is honoured cleanly.

It can also be driven at runtime from the UI via :func:`start` / :func:`request_stop`
(wired to ``POST /v1/jarvis/research/autopilot/{start,stop}``), so the Setup page has a
literal "hammer the GPU" switch.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import time
from typing import Iterator, Optional

try:
    from . import llm_research as lr
except Exception:  # noqa: BLE001
    lr = None  # type: ignore


# ── env knobs ───────────────────────────────────────────────────────────────────
def _truthy(val: Optional[str]) -> bool:
    return str(val or "").strip().lower() in ("1", "true", "yes", "on")


def enabled() -> bool:
    """True iff the autopilot is opted in via ``LLM_AUTOPILOT_ENABLE``."""
    return _truthy(os.environ.get("LLM_AUTOPILOT_ENABLE"))


def _int_env(name: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(os.environ.get(name, str(default)))))
    except (TypeError, ValueError):
        return default


def _float_env(name: str, default: float, lo: float, hi: float) -> float:
    try:
        return max(lo, min(hi, float(os.environ.get(name, str(default)))))
    except (TypeError, ValueError):
        return default


# ── live state (surfaced by the status route + the Setup page) ────────────────────
_STATE: dict = {
    "running": False,
    "backend": None,
    "concurrency": 0,
    "interval_s": 0.0,
    "started_ts": None,
    "iterations": 0,         # research() calls completed (available or not)
    "topics_researched": 0,  # research() calls that actually hit a model
    "notes_injected": 0,     # cumulative grounded notes written to the brain
    "last_topic": None,
    "last_injected": 0,
    "last_ts": None,
    "last_error": None,
    "idle_no_llm": False,    # True while waiting for a GPU/LLM to appear
}

_TASK: Optional["asyncio.Task"] = None


# ── what to research (grows with the brain) ──────────────────────────────────────
_FALLBACK_TOPICS = [
    "Artificial intelligence", "Climate change", "Renewable energy", "Cybersecurity",
    "Global economy", "Public health", "Space exploration", "Quantum computing",
    "Biotechnology", "Maritime domain awareness", "Critical infrastructure",
    "Supply chain logistics",
]


def _seed_topics() -> list[str]:
    """The 31 master topics — always available, zero-config."""
    try:
        from .jarvis_grow import _TOPIC_KEYWORDS
        topics = [t for t in _TOPIC_KEYWORDS.keys() if t]
        if topics:
            return topics
    except Exception:  # noqa: BLE001
        pass
    return list(_FALLBACK_TOPICS)


def _dynamic_topics() -> list[str]:
    """The vault's OWN gaps + existing concepts. Researching these deepens the brain
    and closes its dangling references, so the loop self-feeds as it runs."""
    out: list[str] = []
    try:
        from . import brain_health as bh
        for g in (bh.health().get("gaps", []) or [])[:40]:
            t = (g.get("missing_title") or g.get("title") or "").strip()
            if t:
                out.append(t)
    except Exception:  # noqa: BLE001
        pass
    try:
        from . import second_brain as sb
        for n in sb.list_notes(kind="concept", limit=80):
            t = (n.get("title") or "").strip()
            if t:
                out.append(t)
    except Exception:  # noqa: BLE001
        pass
    return out


def _topic_cycle() -> Iterator[str]:
    """Endless, de-duplicated stream of topics. Every full pass re-reads the dynamic
    topics, so new gaps / concepts created by earlier research get picked up next time
    around — the loop closes on itself and keeps finding fresh work for the GPU."""
    while True:
        seen: set[str] = set()
        any_yielded = False
        for t in _seed_topics() + _dynamic_topics():
            key = t.lower()
            if key in seen:
                continue
            seen.add(key)
            any_yielded = True
            yield t
        if not any_yielded:  # pathological: nothing to research — keep the GPU fed
            for t in _FALLBACK_TOPICS:
                yield t


# ── the loop ──────────────────────────────────────────────────────────────────
async def _research_once(topic: str, max_subtopics: int) -> None:
    """Run ONE grounded research pass (the unit of GPU work). Never raises.

    ``llm_research.research`` is synchronous (stdlib urllib), so it runs in a thread to
    avoid blocking the event loop while the model generates."""
    if lr is None:
        return
    try:
        res = await asyncio.to_thread(lr.research, topic, max_subtopics=max_subtopics, inject=True)
    except Exception as e:  # noqa: BLE001 - robust by contract
        _STATE["last_error"] = f"{type(e).__name__}: {e}"
        return
    _STATE["iterations"] += 1
    _STATE["last_topic"] = topic
    _STATE["last_ts"] = int(time.time())
    if isinstance(res, dict) and res.get("available"):
        inj = len(res.get("injected", []) or [])
        _STATE["topics_researched"] += 1
        _STATE["notes_injected"] += inj
        _STATE["last_injected"] = inj
        _STATE["backend"] = res.get("backend")
        _STATE["last_error"] = None


async def _worker(topics: Iterator[str], interval_s: float, max_subtopics: int) -> None:
    """One research worker. Idles politely until an LLM/GPU is reachable, then hammers
    it topic after topic. Sharing one generator across workers is safe: every ``next``
    runs to completion on the single event-loop thread (no await mid-iteration)."""
    while True:
        if lr is None or not lr.available():
            _STATE["idle_no_llm"] = True
            _STATE["backend"] = None
            await asyncio.sleep(min(15.0, max(2.0, interval_s)))
            continue
        _STATE["idle_no_llm"] = False
        topic = next(topics)
        await _research_once(topic, max_subtopics)
        if interval_s > 0:
            await asyncio.sleep(interval_s)


async def autopilot_loop(*, concurrency: int = 3, interval_s: float = 0.5,
                         max_subtopics: int = 5) -> None:
    """Drive ``concurrency`` research workers forever. Cancellation-safe — cancelling
    the task tears the workers down cleanly."""
    concurrency = max(1, concurrency)
    topics = _topic_cycle()
    _STATE.update({"running": True, "concurrency": concurrency, "interval_s": interval_s,
                   "started_ts": int(time.time()), "last_error": None})
    workers = [asyncio.create_task(_worker(topics, interval_s, max_subtopics))
               for _ in range(concurrency)]
    try:
        await asyncio.gather(*workers)
    except asyncio.CancelledError:
        for w in workers:
            w.cancel()
        with contextlib.suppress(Exception):
            await asyncio.gather(*workers, return_exceptions=True)
        raise
    finally:
        _STATE["running"] = False


# ── control surface (lifespan + UI) ──────────────────────────────────────────────
def running() -> bool:
    return _TASK is not None and not _TASK.done()


def status() -> dict:
    """Live snapshot for ``GET /v1/jarvis/research/autopilot`` and the Setup page."""
    s = dict(_STATE)
    s["running"] = running()
    s["enabled_env"] = enabled()
    if lr is not None and not s.get("backend"):
        try:
            s["backend"] = lr.backend()
        except Exception:  # noqa: BLE001
            pass
    return s


def start(*, concurrency: Optional[int] = None, interval_s: Optional[float] = None,
          max_subtopics: Optional[int] = None) -> dict:
    """Start the loop on the running event loop. Idempotent (a no-op if already
    running). Returns the current :func:`status`. Never raises."""
    global _TASK
    if running():
        return status()
    c = concurrency if concurrency is not None else _int_env("LLM_AUTOPILOT_CONCURRENCY", 3, 1, 32)
    iv = interval_s if interval_s is not None else _float_env("LLM_AUTOPILOT_INTERVAL_S", 0.5, 0.0, 3600.0)
    ms = max_subtopics if max_subtopics is not None else _int_env("LLM_AUTOPILOT_SUBTOPICS", 5, 1, 12)
    try:
        loop = asyncio.get_event_loop()
        _TASK = loop.create_task(autopilot_loop(concurrency=c, interval_s=iv, max_subtopics=ms))
    except Exception as e:  # noqa: BLE001
        _STATE["last_error"] = f"start failed: {e}"
    return status()


async def request_stop() -> dict:
    """Cancel the loop and wait for it to unwind. Idempotent. Returns status."""
    global _TASK
    t, _TASK = _TASK, None
    if t is not None:
        t.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await t
    _STATE["running"] = False
    return status()


def start_loop_if_enabled() -> Optional["asyncio.Task"]:
    """Start the loop as a background task IFF ``LLM_AUTOPILOT_ENABLE`` is truthy.
    Returns the task (or ``None``). Called from the app lifespan; never raises."""
    if not enabled():
        return None
    start()
    return _TASK
