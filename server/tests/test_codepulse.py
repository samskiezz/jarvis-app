"""Tests for the CodePulse mini-app router."""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

TOKEN = "test-key"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "server" / "data"


def _clean_state():
    try:
        (DATA_DIR / "codepulse_state.json").unlink(missing_ok=True)
    except Exception:
        pass


@pytest.fixture()
def client(tmp_path, monkeypatch):
    _clean_state()
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("VECTOR_DB", str(tmp_path / "vectors.db"))
    monkeypatch.setenv("JARVIS_API_KEY", TOKEN)
    monkeypatch.delenv("JARVIS_REQUIRE_AUTH", raising=False)

    from server import config

    importlib.reload(config)
    from server import auth

    importlib.reload(auth)
    from server.services import second_brain as sb

    importlib.reload(sb)
    sb.init_db()
    from server.routes import codepulse as routes

    importlib.reload(routes)

    app = FastAPI()
    app.include_router(routes.router)
    yield TestClient(app)
    _clean_state()


def test_codepulse_status_open(client):
    r = client.get("/v1/codepulse/status")
    assert r.status_code == 200
    data = r.json()
    assert data["connected"] is False
    assert data["pending_count"] == 0


def test_codepulse_connect_requires_auth(client):
    r = client.post("/v1/codepulse/connect", json={"workspace": "/repo"})
    assert r.status_code == 401


def test_codepulse_connect_and_command(client):
    r = client.post("/v1/codepulse/connect", json={"workspace": "/repo"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["connected"] is True

    r2 = client.post(
        "/v1/codepulse/command",
        json={"type": "action_request", "payload": {"type": "edit", "description": "Add log line", "file": "app.py", "diff": "+print('ok')"}},
        headers=AUTH,
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["ok"] is True
    item = data["item"]
    assert item["status"] == "pending"

    r3 = client.get("/v1/codepulse/pending")
    assert r3.status_code == 200
    assert len(r3.json()["items"]) == 1

    r4 = client.post(f"/v1/codepulse/pending/{item['id']}/approve", headers=AUTH)
    assert r4.status_code == 200
    assert r4.json()["item"]["status"] == "approved"


def test_codepulse_reject_and_explain(client):
    r = client.post("/v1/codepulse/command", json={"type": "action_request", "payload": {"type": "delete", "description": "Remove file"}}, headers=AUTH)
    item = r.json()["item"]
    r2 = client.post(f"/v1/codepulse/pending/{item['id']}/reject", json={"reason": "too risky"}, headers=AUTH)
    assert r2.status_code == 200
    assert r2.json()["item"]["status"] == "rejected"


def test_codepulse_stop(client):
    r = client.post("/v1/codepulse/stop", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["mode"] == "safe"


def test_codepulse_item_not_found(client):
    r = client.get("/v1/codepulse/pending/nope")
    assert r.status_code == 404
