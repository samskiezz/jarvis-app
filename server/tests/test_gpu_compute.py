"""GPU compute dispatcher tests — fully OFFLINE (mocked HTTP).

No network and no API key. Fast (<5s). Run:

    python3 -m pytest server/tests/test_gpu_compute.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def gc(monkeypatch):
    """Reload gpu_compute with a fake GPU_BASE_URL so it is 'configured'."""
    monkeypatch.setenv("GPU_BASE_URL", "http://fake-gpu:8000")
    monkeypatch.setenv("GPU_AUTH_TOKEN", "test-token")

    from server.services import gpu_compute as gc_mod

    importlib.reload(gc_mod)
    # Reset circuit breaker between tests
    gc_mod._breaker_failures = 0
    gc_mod._breaker_open_until = 0.0
    gc_mod._last_health = {"ok": False, "checked_at": 0.0}
    return gc_mod


# ── configuration ────────────────────────────────────────────────────────────────
def test_gpu_configured_when_url_set(gc):
    assert gc.gpu_configured() is True


def test_gpu_not_configured_when_url_empty(monkeypatch):
    monkeypatch.setenv("GPU_BASE_URL", "")
    from server.services import gpu_compute as gc_mod

    importlib.reload(gc_mod)
    assert gc_mod.gpu_configured() is False


# ── circuit breaker ──────────────────────────────────────────────────────────────
def test_breaker_starts_closed(gc):
    assert gc._breaker_open() is False


def test_breaker_opens_after_threshold(gc):
    gc._record_failure()
    gc._record_failure()
    assert gc._breaker_open() is False
    gc._record_failure()
    assert gc._breaker_open() is True


def test_breaker_resets_on_success(gc):
    gc._record_failure()
    gc._record_failure()
    gc._record_failure()
    assert gc._breaker_open() is True
    gc._record_success()
    assert gc._breaker_open() is False
    assert gc._breaker_failures == 0


# ── health check (mocked) ───────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_health_check_unauthorized(gc, monkeypatch):
    """Simulate 401 from Caddy basic auth."""
    calls = []

    class FakeResp:
        status_code = 401

    class FakeClient:
        async def get(self, *a, **kw):
            calls.append(("get", a, kw))
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: FakeClient(),
    )
    result = await gc.health_check(force=True)
    assert result["ok"] is False
    assert result["reason"] == "unauthorized"
    assert gc._breaker_failures >= 1


@pytest.mark.anyio
async def test_health_check_success(gc, monkeypatch):
    calls = []

    class FakeResp:
        status_code = 200

        def json(self):
            return {"data": [{"id": "Qwen/Qwen3-8B"}]}

    class FakeClient:
        async def get(self, *a, **kw):
            calls.append(("get", a, kw))
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: FakeClient(),
    )
    result = await gc.health_check(force=True)
    assert result["ok"] is True
    assert "Qwen/Qwen3-8B" in result["models"]
    assert gc._breaker_failures == 0


@pytest.mark.anyio
async def test_health_check_not_configured(monkeypatch):
    monkeypatch.setenv("GPU_BASE_URL", "")
    from server.services import gpu_compute as gc_mod

    importlib.reload(gc_mod)
    result = await gc_mod.health_check()
    assert result["ok"] is False
    assert result["reason"] == "not_configured"


# ── LLM inference (mocked stream) ────────────────────────────────────────────────
@pytest.mark.anyio
async def test_llm_infer_stream_success(gc, monkeypatch):
    chunks = []

    class FakeResp:
        status_code = 200

        async def aiter_lines(self):
            for line in [
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}",
                "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}",
                "data: [DONE]",
            ]:
                yield line

        async def aread(self):
            return b""

    class FakeStreamCtx:
        def __init__(self, resp):
            self._resp = resp

        async def __aenter__(self):
            return self._resp

        async def __aexit__(self, *a):
            pass

    class FakeClient:
        def stream(self, *a, **kw):
            return FakeStreamCtx(FakeResp())

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: FakeClient(),
    )
    async for chunk in gc.llm_infer([{"role": "user", "content": "hi"}]):
        chunks.append(chunk)
    assert "".join(chunks) == "Hello world"


@pytest.mark.anyio
async def test_llm_infer_not_configured(monkeypatch):
    monkeypatch.setenv("GPU_BASE_URL", "")
    from server.services import gpu_compute as gc_mod

    importlib.reload(gc_mod)
    chunks = []
    async for chunk in gc_mod.llm_infer([{"role": "user", "content": "hi"}]):
        chunks.append(chunk)
    assert "unavailable" in "".join(chunks).lower()


# ── embeddings (mocked) ──────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_embed_success(gc, monkeypatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"data": [{"embedding": [0.1, 0.2, 0.3]}]}

    class FakeClient:
        async def post(self, *a, **kw):
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: FakeClient(),
    )
    result = await gc.embed(["hello"])
    assert result is not None
    assert len(result) == 1
    assert result[0] == [0.1, 0.2, 0.3]


@pytest.mark.anyio
async def test_embed_failure_returns_none(gc, monkeypatch):
    class FakeResp:
        status_code = 500

    class FakeClient:
        async def post(self, *a, **kw):
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: FakeClient(),
    )
    result = await gc.embed(["hello"])
    assert result is None


# ── pattern discover (mocked) ────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_pattern_discover_success(gc, monkeypatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"patterns": [{"start": 0, "end": 10, "score": 0.99}]}

    class FakeClient:
        async def post(self, *a, **kw):
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: FakeClient(),
    )
    result = await gc.pattern_discover([1.0, 2.0, 3.0], task="matrix_profile")
    assert result is not None
    assert len(result["patterns"]) == 1


# ── train model (mocked) ─────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_train_model_success(gc, monkeypatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"status": "trained", "model_id": "abc123"}

    class FakeClient:
        async def post(self, *a, **kw):
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(
        "httpx.AsyncClient",
        lambda **kw: FakeClient(),
    )
    result = await gc.train_model("forecast", {"series": [1, 2, 3]})
    assert result is not None
    assert result["status"] == "trained"


# ── headers ──────────────────────────────────────────────────────────────────────
def test_headers_with_token(gc):
    h = gc._headers()
    assert h["Authorization"] == "Bearer test-token"
    assert h["Content-Type"] == "application/json"


def test_headers_without_token(monkeypatch):
    monkeypatch.setenv("GPU_BASE_URL", "http://fake-gpu:8000")
    monkeypatch.setenv("GPU_AUTH_TOKEN", "")
    from server.services import gpu_compute as gc_mod

    importlib.reload(gc_mod)
    h = gc_mod._headers()
    assert "Authorization" not in h
