"""Tests for the VoiceForge mini-app router."""
from __future__ import annotations

import importlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

TOKEN = "test-key"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
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
    from server.routes import voice_forge as routes

    importlib.reload(routes)

    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def test_voice_forge_profiles_empty(client):
    r = client.get("/v1/voiceforge/profiles")
    assert r.status_code == 200
    data = r.json()
    assert data["profiles"] == []
    assert "active_profile_id" in data


def test_voice_forge_create_requires_auth(client):
    r = client.post("/v1/voiceforge/profile", json={"name": "JARVIS"})
    assert r.status_code == 401


def test_voice_forge_crud(client):
    r = client.post("/v1/voiceforge/profile", json={"name": "Test Voice", "description": "desc"}, headers=AUTH)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    profile = data["profile"]
    pid = profile["id"]
    assert profile["name"] == "Test Voice"

    r2 = client.get(f"/v1/voiceforge/profiles/{pid}")
    assert r2.status_code == 200
    assert r2.json()["profile"]["id"] == pid

    r3 = client.post(
        f"/v1/voiceforge/profiles/{pid}",
        json={"name": "Updated Voice", "description": "desc2"},
        headers=AUTH,
    )
    assert r3.status_code == 200
    assert r3.json()["profile"]["name"] == "Updated Voice"

    r4 = client.delete(f"/v1/voiceforge/profiles/{pid}", headers=AUTH)
    assert r4.status_code == 200
    assert r4.json()["ok"] is True

    r5 = client.get(f"/v1/voiceforge/profiles/{pid}")
    assert r5.status_code == 404


def test_voice_forge_upload(client):
    r = client.post("/v1/voiceforge/profile", json={"name": "Upload"}, headers=AUTH)
    pid = r.json()["profile"]["id"]
    r2 = client.post(
        f"/v1/voiceforge/profiles/{pid}/upload",
        files={"file": ("hello.wav", b"RIFF\x26\x00\x00\x00WAVE", "audio/wav")},
        headers=AUTH,
    )
    assert r2.status_code == 200
    assert r2.json()["ok"] is True
    assert "filename" in r2.json()


def test_voice_forge_test(client):
    r = client.post("/v1/voiceforge/test", json={"text": "Hello world"}, headers=AUTH)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "audio_url" in data


def test_voice_forge_invalid_profile(client):
    r = client.get("/v1/voiceforge/profiles/bad id!")
    assert r.status_code == 404
