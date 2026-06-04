"""Offline tests for the underworld HTTP gateway.

The underworld server is NOT running in CI, so every assertion here is about the
gateway's *graceful* behaviour: it must report config without raising, return the
honest 502 shape (never an exception) when the target is unreachable, expose a
non-empty catalog, and serve its routes without 500-ing.

Speed/no-hang: we point ``UNDERWORLD_URL`` at a guaranteed-unreachable loopback
port and use tiny timeouts so nothing waits on the network.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")
# Guaranteed-unreachable: TEST-NET-1 (RFC 5737) is non-routable, so connects
# fail fast / time out predictably without hitting any real host.
_UNREACHABLE = "http://192.0.2.1:9"
os.environ["UNDERWORLD_URL"] = _UNREACHABLE

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.routes import gateway as gateway_routes  # noqa: E402
from server.services import gateway  # noqa: E402

# Mount the router onto a throwaway app — we do NOT touch server/main.py.
_app = FastAPI()
_app.include_router(gateway_routes.router)
client = TestClient(_app)


def test_underworld_configured_returns_bool_without_raising():
    val = gateway.underworld_configured()
    assert isinstance(val, bool)
    # An explicit env URL is set above, so it must be configured.
    assert val is True


def test_underworld_url_reads_env():
    assert gateway.underworld_url() == _UNREACHABLE


def test_proxy_unreachable_returns_honest_502_shape():
    out = gateway.proxy("GET", "/worlds", timeout=0.5)
    assert isinstance(out, dict)
    assert out["ok"] is False
    assert out["status"] == 502
    assert out["error"] == "underworld unreachable"
    assert _UNREACHABLE in out["url"]


def test_proxy_post_unreachable_does_not_raise():
    out = gateway.proxy("POST", "/physics/solve", json_body={"q": "x"}, timeout=0.5)
    assert out["ok"] is False
    assert out["status"] == 502


def test_catalog_non_empty_and_shaped():
    cat = gateway.catalog()
    assert isinstance(cat, list)
    assert len(cat) > 0
    for entry in cat:
        assert set(("path", "method", "desc")) <= set(entry.keys())
    # Headline capabilities are present.
    paths = {e["path"] for e in cat}
    assert "/worlds" in paths
    assert "/physics/solve" in paths


def test_health_probe_unreachable():
    health = gateway.underworld_health(timeout=0.5)
    assert isinstance(health, dict)
    assert health["reachable"] is False
    assert "latency_ms" in health


def test_route_health_no_500():
    resp = client.get("/v1/underworld/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["reachable"] is False


def test_route_catalog_no_500():
    resp = client.get("/v1/underworld/catalog")
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is True
    assert isinstance(body["endpoints"], list)
    assert len(body["endpoints"]) > 0


def test_route_proxy_get_unreachable_no_500():
    resp = client.get("/v1/underworld/proxy/worlds")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["status"] == 502


def test_route_proxy_post_unreachable_no_500():
    resp = client.post("/v1/underworld/proxy/physics/solve", json={"q": "x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["status"] == 502
