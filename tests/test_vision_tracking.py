"""Smoke tests for the vision tracking viewer route."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from server.main import create_app

    app = create_app()
    return TestClient(app)


def test_tracking_matches_returns_list(client):
    r = client.get("/v1/vision/tracking/matches")
    assert r.status_code == 200
    data = r.json()
    assert "matches" in data
    assert isinstance(data["matches"], list)


def test_tracking_viewer_html(client):
    r = client.get("/v1/vision/tracking")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")
    assert "Vision Tracking Viewer" in r.text
