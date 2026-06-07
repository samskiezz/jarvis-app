"""LLM router GPU provider tests — verifies GPU is PRIMARY when configured.

No network (mocked). Fast (<3s). Run:

    python3 -m pytest server/tests/test_llm_router_gpu.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def router_with_gpu(monkeypatch):
    """Reload llm_router with GPU_BASE_URL set so GPU is PRIMARY."""
    monkeypatch.setenv("GPU_BASE_URL", "http://fake-gpu:8000")
    monkeypatch.setenv("GPU_AUTH_TOKEN", "test-token")
    monkeypatch.setenv("KIMI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    from server.services import llm_router as lr

    importlib.reload(lr)
    return lr


def test_default_chain_has_gpu_first(router_with_gpu):
    assert router_with_gpu._DEFAULT_CHAIN[0] == "gpu"


def test_list_providers_includes_gpu(router_with_gpu):
    providers = router_with_gpu.list_providers()
    gpu_meta = next((p for p in providers if p["id"] == "gpu"), None)
    assert gpu_meta is not None
    assert gpu_meta["configured"] is True
    assert "Qwen" in gpu_meta["model"]


def test_gpu_streamer_exists(router_with_gpu):
    assert "gpu" in router_with_gpu._PROVIDER_STREAMERS


@pytest.fixture()
def router_without_gpu(monkeypatch):
    """Reload llm_router with GPU_BASE_URL empty so GPU is absent."""
    monkeypatch.setenv("GPU_BASE_URL", "")
    monkeypatch.setenv("KIMI_API_KEY", "fake-key")

    from server.services import llm_router as lr

    importlib.reload(lr)
    return lr


def test_default_chain_without_gpu(router_without_gpu):
    assert "gpu" not in router_without_gpu._DEFAULT_CHAIN
    assert router_without_gpu._DEFAULT_CHAIN[0] == "kimi"
