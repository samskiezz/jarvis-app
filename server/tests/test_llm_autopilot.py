"""LLM AUTOPILOT — the continuous GPU-driving research loop.

Verified WITHOUT a live model: we mock the single ``llm_research`` seam, so the loop
logic (topic cycling, state accounting, idle-when-no-LLM, opt-in gating) is proven
deterministically and runs for real the moment a GPU/Ollama is reachable.
"""

import asyncio

from server.services import llm_autopilot as ap
from server.services import llm_research as lr


def test_opt_in_only(monkeypatch):
    # default off -> start_loop_if_enabled is a no-op (doctrine: never auto-run)
    monkeypatch.delenv("LLM_AUTOPILOT_ENABLE", raising=False)
    assert ap.enabled() is False
    assert ap.start_loop_if_enabled() is None
    assert ap.running() is False
    # the flag flips it on
    monkeypatch.setenv("LLM_AUTOPILOT_ENABLE", "1")
    assert ap.enabled() is True


def test_topic_cycle_is_deduped_and_endless():
    it = ap._topic_cycle()
    first = [next(it) for _ in range(8)]
    assert all(isinstance(t, str) and t.strip() for t in first)
    assert len(set(first)) == len(first)  # de-duplicated within a pass


def test_status_shape():
    s = ap.status()
    for k in ("running", "iterations", "topics_researched", "notes_injected",
              "concurrency", "enabled_env", "idle_no_llm"):
        assert k in s


def test_research_once_accounts_grounded_work(monkeypatch):
    # pretend a model is reachable and returns two injected notes — no network
    monkeypatch.setattr(lr, "available", lambda: True)
    monkeypatch.setattr(
        lr, "research",
        lambda topic, max_subtopics=5, inject=True: {
            "available": True, "backend": "ollama", "topic": topic,
            "subtopics": ["a", "b"], "injected": ["a", "b"]})
    base_topics = ap._STATE["topics_researched"]
    base_notes = ap._STATE["notes_injected"]
    asyncio.run(ap._research_once("Energy grids", 5))
    assert ap._STATE["topics_researched"] == base_topics + 1
    assert ap._STATE["notes_injected"] == base_notes + 2
    assert ap._STATE["last_topic"] == "Energy grids"
    assert ap._STATE["backend"] == "ollama"


def test_research_once_is_honest_when_no_model(monkeypatch):
    # model says "not available" -> we count the attempt but inject nothing
    monkeypatch.setattr(
        lr, "research",
        lambda topic, max_subtopics=5, inject=True: {
            "available": False, "backend": None, "topic": topic, "reason": "no LLM"})
    base = ap._STATE["notes_injected"]
    asyncio.run(ap._research_once("Anything", 5))
    assert ap._STATE["notes_injected"] == base  # never fabricates work


def test_loop_starts_idle_without_a_model(monkeypatch):
    # no LLM reachable -> the loop runs but stays in the idle (waiting) state and
    # never calls research(); it must cancel cleanly.
    monkeypatch.setattr(lr, "available", lambda: False)
    called = {"n": 0}
    monkeypatch.setattr(lr, "research",
                        lambda *a, **k: called.__setitem__("n", called["n"] + 1) or {})

    async def drive():
        ap._STATE["idle_no_llm"] = False
        task = asyncio.ensure_future(
            ap.autopilot_loop(concurrency=2, interval_s=0.01, max_subtopics=2))
        await asyncio.sleep(0.05)
        running = ap._STATE["running"] and ap._STATE["idle_no_llm"]
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return running

    idled = asyncio.run(drive())
    assert idled is True
    assert called["n"] == 0  # never hit the model while none was reachable
