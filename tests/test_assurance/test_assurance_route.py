"""Test /assurance/* via FastAPI TestClient (light, no full app boot)."""
import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routes import assurance as assurance_route


def _client() -> TestClient:
    importlib.reload(assurance_route)
    app = FastAPI()
    app.include_router(assurance_route.router)
    return TestClient(app)


def test_health_endpoint_responds():
    c = _client()
    r = c.get("/assurance/health")
    assert r.status_code == 200
    assert "ok" in r.json()


def test_commands_endpoint_lists_registered():
    c = _client()
    r = c.get("/assurance/commands")
    assert r.status_code == 200
    body = r.json()
    assert "registered" in body and "noop.echo" in body["registered"]


def test_workflows_endpoint_returns_three():
    c = _client()
    r = c.get("/assurance/workflows")
    assert r.status_code == 200
    body = r.json()["workflows"]
    assert {"claude_run", "gpu_lifecycle", "chat_request"} <= set(body.keys())


def test_invariants_endpoint_lists_registered():
    c = _client()
    r = c.get("/assurance/invariants")
    assert r.status_code == 200
    assert "registered" in r.json()


def test_dispatch_requires_bearer():
    c = _client()
    r = c.post("/assurance/dispatch", json={"name": "ping"})
    assert r.status_code == 401
