"""Offline tests for the GPU dispatch client (PATTERN ORACLE GPU tier).

Fully OFFLINE: NO torch, NO real network. We monkeypatch ``httpx`` inside the
client so we can assert (a) the tier is dormant and never raises when
``PREDICT_GPU_URL`` is unset, and (b) when it IS set, a mocked success is parsed
and the right URL / headers / body are built. Run:

    python3 -m pytest server/tests/test_gpu_client.py -q
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402

from server.services import gpu_client  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Ensure a clean GPU env + reset the circuit breaker before each test."""
    monkeypatch.delenv("PREDICT_GPU_URL", raising=False)
    monkeypatch.delenv("PREDICT_GPU_KEY", raising=False)
    monkeypatch.delenv("PREDICT_GPU_MODEL", raising=False)
    gpu_client._reset_breaker()
    yield
    gpu_client._reset_breaker()


# ── a fake httpx that records calls and never touches the network ─────────────
class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


class _FakeHttpx:
    """Drop-in for the ``httpx`` module the client imports lazily."""

    def __init__(self, response=None, raises=None):
        self._response = response
        self._raises = raises
        self.calls = []

    class Timeout:  # mirror httpx.Timeout(...) signature loosely
        def __init__(self, *a, **k):
            self.args = a
            self.kwargs = k

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"method": "POST", "url": url, "json": json, "headers": headers})
        if self._raises is not None:
            raise self._raises
        return self._response

    def get(self, url, headers=None, timeout=None):
        self.calls.append({"method": "GET", "url": url, "headers": headers})
        if self._raises is not None:
            raise self._raises
        return self._response


def _install_httpx(monkeypatch, fake):
    """Make ``import httpx`` inside the client resolve to our fake."""
    monkeypatch.setitem(sys.modules, "httpx", fake)


# ══════════════════════════════════════════════════════════════════════════════
# UNCONFIGURED: tier dormant, nothing raises, callers get the fallback signal
# ══════════════════════════════════════════════════════════════════════════════
def test_not_configured_flags(monkeypatch):
    assert gpu_client.gpu_configured() is False
    assert gpu_client.health() == {"ok": False, "reason": "not_configured"}


def test_remote_forecast_none_when_unset(monkeypatch):
    # Even if httpx were called it must never raise; install a raising fake to
    # prove the client short-circuits BEFORE any network attempt.
    fake = _FakeHttpx(raises=RuntimeError("network must not be touched"))
    _install_httpx(monkeypatch, fake)
    out = gpu_client.remote_forecast([{"t": 1, "v": 10.0}], 1)
    assert out is None
    assert fake.calls == []  # never hit the wire


def test_infer_unavailable_when_unset(monkeypatch):
    fake = _FakeHttpx(raises=RuntimeError("network must not be touched"))
    _install_httpx(monkeypatch, fake)
    out = gpu_client.infer("forecast", {"series": [1, 2, 3]})
    assert out["status"] == "gpu_unavailable"
    assert out["reason"] == "not_configured"
    assert fake.calls == []


# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURED: a network error never raises -> gpu_unavailable
# ══════════════════════════════════════════════════════════════════════════════
def test_infer_network_error_is_caught(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400")
    fake = _FakeHttpx(raises=ConnectionError("boom"))
    _install_httpx(monkeypatch, fake)
    out = gpu_client.infer("forecast", {"series": [1, 2, 3]}, retries=0)
    assert out["status"] == "gpu_unavailable"
    assert "boom" in out["reason"]
    # it DID attempt the call (proving we got past the config gate)
    assert fake.calls and fake.calls[0]["method"] == "POST"


def test_remote_forecast_none_on_failure(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400")
    fake = _FakeHttpx(raises=TimeoutError("slow"))
    _install_httpx(monkeypatch, fake)
    assert gpu_client.remote_forecast([{"t": 1, "v": 10.0}], 1) is None


# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURED + mocked success: parsed dict, right URL / headers / body
# ══════════════════════════════════════════════════════════════════════════════
def test_infer_success_builds_url_and_headers(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400/")  # trailing slash
    monkeypatch.setenv("PREDICT_GPU_KEY", "sekret")
    monkeypatch.setenv("PREDICT_GPU_MODEL", "gpu_gru")
    payload = {"status": "ok", "point": 123.4, "interval": {"low": 1.0, "high": 2.0}}
    fake = _FakeHttpx(response=_FakeResponse(200, payload))
    _install_httpx(monkeypatch, fake)

    out = gpu_client.infer("forecast", {"series": [1, 2, 3], "horizon_steps": 2})
    assert out == payload

    call = fake.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "http://gpu.example:8400/infer"  # single, normalized slash
    assert call["headers"]["Authorization"] == "Bearer sekret"
    assert call["headers"]["Content-Type"] == "application/json"
    # body carries the task, the payload, and the model hint.
    assert call["json"]["task"] == "forecast"
    assert call["json"]["series"] == [1, 2, 3]
    assert call["json"]["horizon_steps"] == 2
    assert call["json"]["model"] == "gpu_gru"


def test_infer_no_auth_header_without_key(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400")
    fake = _FakeHttpx(response=_FakeResponse(200, {"status": "ok"}))
    _install_httpx(monkeypatch, fake)
    gpu_client.infer("forecast", {"series": [1, 2, 3]})
    assert "Authorization" not in fake.calls[0]["headers"]


def test_health_success(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400")
    payload = {"ok": True, "device": "cuda", "torch_version": "2.3.1"}
    fake = _FakeHttpx(response=_FakeResponse(200, payload))
    _install_httpx(monkeypatch, fake)
    out = gpu_client.health()
    assert out["ok"] is True
    assert out["device"] == "cuda"
    assert fake.calls[0]["url"] == "http://gpu.example:8400/health"


def test_remote_forecast_success_returns_dict(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400")
    payload = {
        "status": "ok",
        "point": 101.4,
        "interval": {"low": 98.0, "high": 105.0, "confidence": 0.9},
        "prob_up": 0.57,
        "model": "gpu_gru",
    }
    fake = _FakeHttpx(response=_FakeResponse(200, payload))
    _install_httpx(monkeypatch, fake)
    out = gpu_client.remote_forecast([{"t": 1, "v": 10.0}, {"t": 2, "v": 11.0}], 1)
    assert out == payload
    # forecast convenience built the forecast task + normalized series
    body = fake.calls[0]["json"]
    assert body["task"] == "forecast"
    assert body["series"] == [{"v": 10.0, "t": 1.0}, {"v": 11.0, "t": 2.0}]


def test_http_500_is_unavailable(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400")
    fake = _FakeHttpx(response=_FakeResponse(500, {"detail": "kaboom"}))
    _install_httpx(monkeypatch, fake)
    out = gpu_client.infer("forecast", {"series": [1, 2, 3]}, retries=0)
    assert out["status"] == "gpu_unavailable"
    assert out["reason"] == "http_500"


def test_circuit_breaker_opens_after_failures(monkeypatch):
    monkeypatch.setenv("PREDICT_GPU_URL", "http://gpu.example:8400")
    fake = _FakeHttpx(raises=ConnectionError("down"))
    _install_httpx(monkeypatch, fake)
    # drive enough failures to trip the breaker (threshold consecutive failures)
    for _ in range(gpu_client._BREAKER_THRESHOLD):
        gpu_client.infer("forecast", {"series": [1]}, retries=0)
    n_before = len(fake.calls)
    out = gpu_client.infer("forecast", {"series": [1]}, retries=0)
    assert out == {"status": "gpu_unavailable", "reason": "circuit_open"}
    # breaker short-circuited: no new wire attempt was made.
    assert len(fake.calls) == n_before
