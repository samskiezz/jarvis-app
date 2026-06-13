"""Tests for the ProofPack mini-app router."""
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
    from server.routes import proof_pack as routes

    importlib.reload(routes)

    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def test_proof_pack_list_empty(client):
    r = client.get("/v1/proofpack/list")
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_proof_pack_create_requires_auth(client):
    r = client.post("/v1/proofpack/create", json={"title": "test"})
    assert r.status_code == 401


def test_proof_pack_create_and_get(client):
    r = client.post("/v1/proofpack/create", json={"title": "Login flow fix"}, headers=AUTH)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    pack = data["pack"]
    assert pack["title"].startswith("Proof: Login flow fix")
    fm = pack.get("frontmatter", {})
    assert fm.get("tag") == "proof"
    assert "commit" in fm

    # GET by id
    rid = pack["id"]
    r2 = client.get(f"/v1/proofpack/{rid}")
    assert r2.status_code == 200
    assert r2.json()["pack"]["id"] == rid

    # List contains the pack
    r3 = client.get("/v1/proofpack/list")
    assert r3.status_code == 200
    assert len(r3.json()["items"]) == 1


def test_proof_pack_export(client):
    r = client.post("/v1/proofpack/create", json={"title": "Export test"}, headers=AUTH)
    rid = r.json()["pack"]["id"]
    r2 = client.post(f"/v1/proofpack/{rid}/export", json={"format": "markdown"}, headers=AUTH)
    assert r2.status_code == 200
    data = r2.json()
    assert data["ok"] is True
    assert "# Proof Pack: Export test" in data["markdown"]


def test_proof_pack_get_missing(client):
    r = client.get("/v1/proofpack/does-not-exist")
    assert r.status_code == 404
