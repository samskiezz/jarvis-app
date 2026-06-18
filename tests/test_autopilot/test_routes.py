"""Live route integration via FastAPI TestClient."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routes import assurance as ar


def _client():
    app = FastAPI()
    app.include_router(ar.router)
    return TestClient(app)


def test_autopilot_status_endpoint():
    r = _client().get("/assurance/autopilot/status")
    assert r.status_code == 200


def test_autopilot_roadmap_endpoint():
    r = _client().get("/assurance/autopilot/roadmap")
    assert r.status_code == 200
    body = r.json()
    assert "next" in body or "backlog" in body


def test_autopilot_proposals_endpoint():
    r = _client().get("/assurance/autopilot/proposals")
    assert r.status_code == 200
    assert "proposals" in r.json()


def test_autopilot_resources_endpoint():
    r = _client().get("/assurance/autopilot/resources")
    assert r.status_code == 200


def test_autopilot_approve_requires_bearer():
    r = _client().post("/assurance/autopilot/approve",
                       json={"proposal_id": "x", "decision": "approve"})
    assert r.status_code == 401


def test_autopilot_unknown_report_404():
    r = _client().get("/assurance/autopilot/reports/does_not_exist")
    assert r.status_code == 404
