"""Tests for the JARVIS agent planner/executor loop.

These run WITHOUT a real LLM by monkeypatching ``llm_research`` — so they are
deterministic and prove the governed loop, the tool dispatch, the step memory,
and the honest degradation paths all work regardless of model availability.
"""

from __future__ import annotations

import json

from server.services import jarvis_agent as agent


def test_no_backend_falls_back_to_grounded_search(monkeypatch):
    monkeypatch.setattr(agent._llm, "backend", lambda: None)
    out = agent.run_agent("anything at all")
    assert out["backend"] is None
    # Grounds over the real corpus AND the ontology.
    assert out["used_tools"] == ["corpus.search", "search"]
    assert out["trace"] and out["trace"][0]["tool"] == "corpus.search"
    assert isinstance(out["answer"], str) and out["answer"]


def test_backend_advertised_but_inference_fails_degrades_honestly(monkeypatch):
    # backend() says ollama is up, but every completion returns None (crash/timeout).
    monkeypatch.setattr(agent._llm, "backend", lambda: "ollama")
    monkeypatch.setattr(agent._llm, "llm_complete", lambda *a, **k: None)
    out = agent.run_agent("what is PSG?")
    assert out["backend"] == "ollama"
    # No fabricated narrative — it grounds via search instead.
    assert "corpus.search" in out["used_tools"]
    assert "crash/timeout" in out["answer"] or "grounded" in out["answer"].lower()


def test_llm_calls_tool_then_answers(monkeypatch):
    """One tool step (search), then a final answer — the real loop shape."""
    calls = {"n": 0}

    def fake_complete(prompt, system="", fmt=None, max_tokens=512, temperature=0.2):
        calls["n"] += 1
        if calls["n"] == 1:
            return json.dumps({"action": "tool", "tool": "search",
                               "params": {"query": "PSG"}, "thought": "ground it"})
        return json.dumps({"action": "final", "answer": "PSG is a solar group."})

    monkeypatch.setattr(agent._llm, "backend", lambda: "ollama")
    monkeypatch.setattr(agent._llm, "llm_complete", fake_complete)
    out = agent.run_agent("what is PSG?", max_steps=4)
    assert out["backend"] == "ollama"
    assert out["used_tools"] == ["search"]
    assert out["steps"] == 1
    assert out["answer"] == "PSG is a solar group."
    assert out["trace"][0]["thought"] == "ground it"


def test_write_tool_is_proposed_not_executed(monkeypatch):
    """A write tool in the plan must become a governed proposal, never a silent write."""
    seen = {}

    def fake_propose(object_id, action, payload=None, rationale="", actor=None, **kw):
        seen["proposed"] = (object_id, action)
        return {"ok": True, "proposal": {"id": "p1", "status": "PENDING"}}

    def fake_complete(prompt, system="", fmt=None, max_tokens=512, temperature=0.2):
        if "TOOL ontology.set_label" in prompt:
            return json.dumps({"action": "final", "answer": "Proposed the label change for approval."})
        return json.dumps({"action": "tool", "tool": "ontology.set_label",
                           "params": {"object_id": "psg", "label": "PSG Pty"},
                           "thought": "rename"})

    monkeypatch.setattr(agent._llm, "backend", lambda: "ollama")
    monkeypatch.setattr(agent._llm, "llm_complete", fake_complete)
    monkeypatch.setattr(agent._tools, "propose_action", fake_propose)
    out = agent.run_agent("rename PSG to PSG Pty", max_steps=4)
    assert seen.get("proposed") == ("psg", "set_label")
    assert out["trace"][0]["observation"]["mode"] == "proposed"


def test_empty_message_is_noop():
    out = agent.run_agent("   ")
    assert out["answer"] == "" and out["steps"] == 0
