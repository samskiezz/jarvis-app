"""Foundry route reads YAML pipelines from world_os."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server.routes import foundry as fr


def _client():
    app = FastAPI(); app.include_router(fr.router); return TestClient(app)


def test_list_pipelines_returns_yaml():
    r = _client().get("/v1/foundry/pipelines")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert isinstance(body["items"], list)


def test_lineage_stub_returns_run_id():
    r = _client().get("/v1/foundry/lineage/run-xyz")
    assert r.status_code == 200
    assert r.json()["run_id"] == "run-xyz"
