"""LLM-driven research+inject loop, verified with a MOCK model (no live LLM needed).
Proves the logic works the moment a real Llama (Ollama) is connected."""

from server.services import llm_research as lr
from server.services import brain_sources as bs, second_brain as sb


def test_no_model_is_honest():
    # in this sandbox no LLM is reachable -> must say so, not fabricate
    if not lr.available():
        out = lr.research("Energy grids")
        assert out["available"] is False and out["backend"] is None and "reason" in out


def test_research_injects_grounded_notes_with_mock_llm(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "research.db"))

    # 1. pretend a model is reachable
    monkeypatch.setattr(lr, "backend", lambda: "ollama")

    # 2. mock the single LLM seam: planner returns a JSON list, summaries echo grounded text
    def fake_complete(prompt, *, system="", max_tokens=512):
        if "JSON array" in prompt or "sub-concepts" in prompt:
            return '["Smart grid", "Demand response", "Grid storage"]'
        return "Grounded factual summary sentence derived strictly from the evidence."
    monkeypatch.setattr(lr, "llm_complete", fake_complete)

    # 3. avoid network: mock the connector to return fixed grounded evidence
    monkeypatch.setattr(bs, "fetch_best",
                        lambda term, only=None: ({"source": "wikipedia",
                                                  "url": f"https://en.wikipedia.org/wiki/{term}",
                                                  "extract": f"{term} is a real concept."}, []))

    out = lr.research("Energy grids", max_subtopics=3)
    assert out["available"] is True and out["backend"] == "ollama"
    assert out["subtopics"] == ["Smart grid", "Demand response", "Grid storage"]
    assert set(out["injected"]) == {"Smart grid", "Demand response", "Grid storage"}

    # the LLM-written notes are really in the brain, cited
    note = sb.get_note("Smart grid")
    assert note is not None
    assert "Source:" in note["body_md"] and "[[Energy grids]]" in note["body_md"]
    assert note["frontmatter"].get("llm_research") is True
