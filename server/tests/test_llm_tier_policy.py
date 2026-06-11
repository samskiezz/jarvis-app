import importlib


def test_runtime_blocks_70b_without_flag(monkeypatch):
    monkeypatch.delenv("LLM_ENABLE_70B", raising=False)
    monkeypatch.delenv("ENABLE_70B_TIER", raising=False)
    monkeypatch.delenv("UNDERWORLD_ENABLE_70B", raising=False)

    from server.services import llm_runtime as rt

    assert rt.is_70b_blocked("llama3.3:70b")
    assert not rt.is_70b_blocked("qwen2.5:32b")


def test_runtime_local_provider_detection():
    from server.services import llm_runtime as rt

    assert rt.is_local_model_provider(provider="ollama", model="llama3.1:8b")
    assert rt.is_local_model_provider(base_url="http://127.0.0.1:11434/v1", model="qwen2.5:32b")
    assert not rt.is_local_model_provider(provider="openai", base_url="https://api.openai.com/v1", model="gpt-5.5")


def test_llm_research_blocks_accidental_70b(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.3:70b")
    monkeypatch.delenv("LLM_ENABLE_70B", raising=False)

    from server.services import llm_research as lr

    lr._CFG.clear()
    assert lr._ollama_model() == "llama3.1:8b"


def test_llm_research_allows_70b_when_explicit(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.3:70b")
    monkeypatch.setenv("LLM_ENABLE_70B", "1")

    from server.services import llm_research as lr

    lr._CFG.clear()
    assert lr._ollama_model() == "llama3.3:70b"


def test_tiered_llm_heavy_disabled_falls_back_to_strong(monkeypatch):
    monkeypatch.delenv("LLM_ENABLE_70B", raising=False)
    monkeypatch.delenv("ENABLE_70B_TIER", raising=False)

    from server.services import tiered_llm as t

    result = t.complete("ping", tier="heavy", max_tokens=4)
    assert result["tier"] == "heavy(disabled)\u2192strong"
    assert result["model"] == "qwen2.5:32b"


def test_llm_gate_parses_extreme_and_refuses_heavy_without_flag(monkeypatch):
    monkeypatch.delenv("LLM_ENABLE_70B", raising=False)

    from server.services import llm_gate as g

    assert g._tier_name("5_extreme") == "extreme"
    assert g._next_allowed_tier("strong", "extreme") is None


def test_underworld_layers_block_70b_by_default(monkeypatch):
    monkeypatch.setenv("UW_MODEL_OVERMIND", "llama3.3:70b")
    monkeypatch.setenv("UW_MODEL_GODBRAIN", "llama3.3:70b")
    monkeypatch.setenv("UW_MODEL_HIGH_MAJOR", "llama3.3:70b")
    monkeypatch.delenv("UNDERWORLD_ENABLE_70B", raising=False)
    monkeypatch.delenv("LLM_ENABLE_70B", raising=False)
    monkeypatch.delenv("ENABLE_70B_TIER", raising=False)

    from underworld.server.tools import llm

    importlib.reload(llm)
    assert llm.LAYER_MODELS["overmind"] == "qwen2.5:32b"
    assert llm.LAYER_MODELS["god_brain"] == "qwen2.5:32b"
    assert llm.LAYER_MODELS["high_major"] == "qwen2.5:32b"
