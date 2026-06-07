"""GPU integration test — hits the REAL Vast.ai GPU box (2× RTX 4090).

These tests require network access to 211.72.13.201:41137 and are skipped
automatically if the GPU box is unreachable. Run:

    python3 -m pytest server/tests/test_gpu_integration.py -v
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


GPU_URL = "http://211.72.13.201:41137"


def _gpu_reachable() -> bool:
    try:
        import urllib.request

        req = urllib.request.Request(GPU_URL + "/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5.0) as r:
            return r.status == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _gpu_reachable(), reason="GPU box unreachable")


# ── raw Ollama connectivity ──────────────────────────────────────────────────────
def test_gpu_ollama_tags():
    import json
    import urllib.request

    req = urllib.request.Request(GPU_URL + "/api/tags")
    with urllib.request.urlopen(req, timeout=10.0) as r:
        data = json.loads(r.read().decode("utf-8"))
    models = [m["name"] for m in data.get("models", [])]
    assert "llama3.1:8b" in models
    assert "nomic-embed-text:latest" in models


def test_gpu_ollama_generate():
    import json
    import urllib.request

    body = json.dumps({"model": "llama3.1:8b", "prompt": "Say OK", "stream": False}).encode()
    req = urllib.request.Request(GPU_URL + "/api/generate", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30.0) as r:
        data = json.loads(r.read().decode("utf-8"))
    assert "OK" in data.get("response", "")


def test_gpu_ollama_embed():
    import json
    import urllib.request

    body = json.dumps({"model": "nomic-embed-text:latest", "input": "hello world"}).encode()
    req = urllib.request.Request(GPU_URL + "/api/embed", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30.0) as r:
        data = json.loads(r.read().decode("utf-8"))
    embs = data.get("embeddings", [])
    assert len(embs) == 1
    assert len(embs[0]) == 768


# ── JARVIS embeddings via remote Ollama ──────────────────────────────────────────
def test_jarvis_embed_remote_ollama(monkeypatch):
    import importlib

    monkeypatch.setenv("OLLAMA_HOST", GPU_URL)
    monkeypatch.setenv("OLLAMA_EMBED_MODEL", "nomic-embed-text:latest")

    from server.services import embeddings as emb

    importlib.reload(emb)
    v = emb.embed("the quick brown fox")
    assert v.shape == (768,)
    assert abs(float(__import__("numpy").linalg.norm(v)) - 1.0) < 1e-5


# ── JARVIS llm_router remote Ollama primary ─────────────────────────────────────
def test_llm_router_remote_ollama_primary(monkeypatch):
    import importlib

    monkeypatch.setenv("OLLAMA_HOST", GPU_URL)
    monkeypatch.setenv("OLLAMA_BASE_URL", GPU_URL)
    monkeypatch.setenv("KIMI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("GPU_BASE_URL", "")

    from server.services import llm_router as lr

    importlib.reload(lr)
    assert lr._DEFAULT_CHAIN[0] == "ollama"
    providers = lr.list_providers()
    ollama = next((p for p in providers if p["id"] == "ollama"), None)
    assert ollama is not None
    assert ollama["configured"] is True
