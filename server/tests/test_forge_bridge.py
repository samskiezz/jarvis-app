"""Offline tests for the read-only Forge bridge — never raises, sane shapes
whether or not the Forge package is importable in this environment."""

from __future__ import annotations

from server.services import forge_bridge


def test_available_is_bool():
    assert isinstance(forge_bridge.available(), bool)


def test_status_shape_never_raises():
    s = forge_bridge.status()
    assert isinstance(s, dict)
    assert s["read_only"] is True
    assert "available" in s and "pending_approvals" in s
    assert isinstance(s["pending_approvals"], int)


def test_approvals_returns_list():
    rows = forge_bridge.approvals()
    assert isinstance(rows, list)
    rows2 = forge_bridge.approvals(status="pending")
    assert isinstance(rows2, list)


def test_get_missing_change_is_none():
    assert forge_bridge.get_change("does-not-exist-xyz") is None


def test_route_smoke():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from server.routes import forge as forge_routes

    app = FastAPI()
    app.include_router(forge_routes.router)
    client = TestClient(app)

    r = client.get("/v1/forge/status")
    assert r.status_code == 200
    assert r.json()["read_only"] is True

    r2 = client.get("/v1/forge/approvals")
    assert r2.status_code == 200
    assert isinstance(r2.json()["items"], list)

    r3 = client.get("/v1/forge/approvals/nope")
    assert r3.status_code == 404
