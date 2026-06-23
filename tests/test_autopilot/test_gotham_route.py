"""Gotham route round-trip via TestClient."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server.routes import gotham as gr


def _client():
    app = FastAPI(); app.include_router(gr.router); return TestClient(app)


def test_list_cases_200():
    r = _client().get("/v1/gotham/cases")
    assert r.status_code == 200
    body = r.json(); assert "items" in body and "count" in body


def test_post_case_requires_bearer():
    r = _client().post("/v1/gotham/case", json={"title": "x"})
    assert r.status_code == 401


def test_events_endpoint():
    r = _client().get("/v1/gotham/events")
    assert r.status_code == 200
    assert "items" in r.json()
