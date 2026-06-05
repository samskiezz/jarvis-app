"""JARVIS DB route tests — pass with OR without a live PostgreSQL.

A TestClient mounts ONLY the jarvis_db router on a fresh FastAPI() app (we never
import server.main). Reads use optional_bearer (open here since JARVIS_REQUIRE_AUTH
is unset), so no token is needed. Run:

    python3 -m pytest server/tests/test_jarvis_db_routes.py -q
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.delenv("JARVIS_REQUIRE_AUTH", raising=False)

    from server.routes import jarvis_db as routes

    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def test_health_returns_200_with_keys(client):
    r = client.get("/v1/jarvis/db/health")
    assert r.status_code == 200
    body = r.json()
    assert "backend" in body
    assert "active" in body
    assert body["active"] in ("sqlite", "postgres")
    assert "postgres" in body
    assert "sqlite_brain_path" in body


def test_stats_returns_200(client):
    r = client.get("/v1/jarvis/db/stats")
    assert r.status_code == 200
    body = r.json()
    assert "sqlite" in body
    assert "postgres" in body
    assert isinstance(body["sqlite"]["total"], int)
    assert isinstance(body["postgres"]["total"], int)


def test_active_is_sqlite_by_default(client, monkeypatch):
    # With BRAIN_BACKEND unset, default is 'sqlite' and active must be 'sqlite'.
    monkeypatch.delenv("BRAIN_BACKEND", raising=False)
    r = client.get("/v1/jarvis/db/health")
    assert r.status_code == 200
    assert r.json()["active"] == "sqlite"
