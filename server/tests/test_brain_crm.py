"""BRAIN CRM tests — fully OFFLINE / deterministic.

No network. Temp DBs (BRAIN_DB + BRAIN_CRM_DB + ONTOLOGY_DB + VECTOR_DB) are set
via env so the real on-disk stores are never touched. We reload config/auth and
the service/router so the temp DBs + pinned API key take effect, then mount ONLY
the brain_crm router behind a TestClient.

Verifies: mention -> profile tiers up at 1/3/8 with citations; people() lists
the tier; profiles cite their sources. Run:

    python3 -m pytest server/tests/test_brain_crm.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


TOKEN = "test-key"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    """Fresh temp DBs; reload config/auth/services/router; mount our router."""
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain.db"))
    monkeypatch.setenv("BRAIN_CRM_DB", str(tmp_path / "crm.db"))
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
    from server.services import brain_crm as crm
    importlib.reload(crm)
    crm.init_db()

    from server.routes import brain_crm as routes
    importlib.reload(routes)

    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app), crm


def test_mention_requires_bearer(ctx):
    client, _crm = ctx
    r = client.post("/v1/brain/mention", json={"person": "Ada", "context": "is a developer"})
    assert r.status_code == 401


def test_tiers_up_at_thresholds_with_citations(ctx):
    client, _crm = ctx

    # 1 mention -> stub
    r = client.post(
        "/v1/brain/mention",
        json={"person": "Ada Lovelace", "context": "is the lead engineer on Analytical", "source": "note A"},
        headers=AUTH,
    )
    assert r.status_code == 200, r.text
    assert r.json()["mention_count"] == 1

    r = client.get("/v1/brain/people/Ada Lovelace")
    assert r.status_code == 200, r.text
    prof = r.json()
    assert prof["tier"] == "stub"
    assert prof["role"]  # role inferred from "is the lead engineer"
    assert len(prof["citations"]) == 1
    assert prof["citations"][0]["source"] == "note A"

    # up to 3 distinct mentions -> moderate
    client.post("/v1/brain/mention", json={"person": "Ada Lovelace", "context": "strong at math"}, headers=AUTH)
    client.post("/v1/brain/mention", json={"person": "Ada Lovelace", "context": "wrote the first algorithm"}, headers=AUTH)
    r = client.get("/v1/brain/people/Ada Lovelace")
    assert r.json()["tier"] == "moderate"
    assert r.json()["mention_count"] == 3
    assert len(r.json()["citations"]) == 3

    # reach 8 distinct mentions -> full
    for i in range(5):
        client.post(
            "/v1/brain/mention",
            json={"person": "Ada Lovelace", "context": f"observation number {i}"},
            headers=AUTH,
        )
    r = client.get("/v1/brain/people/Ada Lovelace")
    prof = r.json()
    assert prof["mention_count"] == 8
    assert prof["tier"] == "full"
    assert len(prof["citations"]) == 8
    # full dossier body cites sources explicitly
    assert "note A" in prof["body_md"]


def test_meeting_source_forces_full_tier(ctx):
    client, _crm = ctx
    r = client.post(
        "/v1/brain/mention",
        json={"person": "Grace", "context": "discussed the compiler", "source": "meeting 2026-06-04"},
        headers=AUTH,
    )
    assert r.status_code == 200
    # a single meeting-sourced observation forces the full tier
    r = client.get("/v1/brain/people/Grace")
    assert r.json()["tier"] == "full"


def test_people_lists_tier_and_count(ctx):
    client, _crm = ctx
    client.post("/v1/brain/mention", json={"person": "Bob", "context": "is a designer"}, headers=AUTH)
    client.post("/v1/brain/mention", json={"person": "Carol", "context": "x"}, headers=AUTH)
    client.post("/v1/brain/mention", json={"person": "Carol", "context": "y"}, headers=AUTH)
    client.post("/v1/brain/mention", json={"person": "Carol", "context": "z"}, headers=AUTH)

    r = client.get("/v1/brain/people")
    assert r.status_code == 200
    items = {p["person"]: p for p in r.json()["items"]}
    assert items["Carol"]["mention_count"] == 3
    assert items["Carol"]["tier"] == "moderate"
    assert items["Bob"]["tier"] == "stub"
    # ordered most-mentioned first
    assert r.json()["items"][0]["person"] == "Carol"


def test_mention_is_idempotent_on_identical_observation(ctx):
    client, crm = ctx
    a = crm.mention("Dave", "same thing", source="src")
    b = crm.mention("Dave", "same thing", source="src")
    assert a["mention_count"] == 1
    assert b["mention_count"] == 1  # identical re-record does not bump
    assert b["new"] is False


def test_unknown_person_404(ctx):
    client, _crm = ctx
    assert client.get("/v1/brain/people/Nobody").status_code == 404


def test_service_never_raises_on_bad_input(ctx):
    _client, crm = ctx
    assert crm.mention("", "x")["ok"] is False
    assert crm.profile("")["ok"] is False
    assert crm.people() == [] or isinstance(crm.people(), list)
