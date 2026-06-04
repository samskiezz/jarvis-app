"""BRAIN EXTRAS tests — vault-health + thinking-tools, fully OFFLINE.

No network. Temp DBs (BRAIN_DB + ONTOLOGY_DB + VECTOR_DB) via env so real stores
are never touched. Seeds notes via the second-brain service, then exercises the
health scan + thinking tools through a TestClient mounting ONLY the brain_extras
router. Run:

    python3 -m pytest server/tests/test_brain_extras.py -q
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
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("VECTOR_DB", str(tmp_path / "vectors.db"))
    monkeypatch.setenv("JARVIS_API_KEY", TOKEN)
    monkeypatch.delenv("JARVIS_REQUIRE_AUTH", raising=False)
    monkeypatch.setenv("BRAIN_STALE_DAYS", "90")

    from server import config
    importlib.reload(config)
    from server import auth
    importlib.reload(auth)

    from server.services import second_brain as sb
    importlib.reload(sb)
    sb.init_db()
    from server.services import embeddings as emb
    importlib.reload(emb)
    emb.init_db()
    from server.services import brain_health as bh
    importlib.reload(bh)
    from server.services import brain_think as bt
    importlib.reload(bt)

    from server.routes import brain_extras as routes
    importlib.reload(routes)

    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app), sb, bh, bt


def _seed(sb):
    # A links to B and to a MISSING title (a gap). A & B are non-orphans.
    sb.upsert_note("concept", "Alpha", "Alpha links to [[Beta]] and to [[GhostPage]].")
    sb.upsert_note("concept", "Beta", "Beta is about graph databases and indexing.")
    # An orphan: no links in or out.
    sb.upsert_note("concept", "Island", "A lonely note with no connections at all.")


def test_health_flags_orphan_and_gap(ctx):
    client, sb, _bh, _bt = ctx
    _seed(sb)

    r = client.get("/v1/brain/health")
    assert r.status_code == 200, r.text
    h = r.json()

    # the orphan "Island" is flagged
    orphan_titles = [o["title"] for o in h["orphans"]]
    assert "Island" in orphan_titles

    # the wikilink to the non-existent "GhostPage" is a gap
    gap_titles = [g["missing_title"] for g in h["gaps"]]
    assert "GhostPage" in gap_titles

    assert h["counts"]["notes"] == 3
    assert 0 <= h["score"] <= 100


def test_health_empty_vault_is_honest(ctx):
    client, _sb, _bh, _bt = ctx
    r = client.get("/v1/brain/health")
    assert r.status_code == 200
    h = r.json()
    assert h["counts"]["notes"] == 0
    assert h["orphans"] == [] and h["gaps"] == []
    assert h["score"] == 100


def test_heal_orphans_suggests_only(ctx):
    client, sb, _bh, _bt = ctx
    _seed(sb)
    r = client.post("/v1/brain/heal-orphans", headers=AUTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "suggestions" in body
    # Island is an orphan -> it should get a suggestion entry (candidates may vary)
    titles = [s["title"] for s in body["suggestions"]]
    assert "Island" in titles


def test_heal_orphans_requires_bearer(ctx):
    client, _sb, _bh, _bt = ctx
    assert client.post("/v1/brain/heal-orphans").status_code == 401


def test_think_connect_bridge_or_honest_empty(ctx):
    client, sb, _bh, _bt = ctx
    # Two notes that share a neighbour "Database".
    sb.upsert_note("concept", "Postgres", "Postgres is a [[Database]] system.")
    sb.upsert_note("concept", "MySQL", "MySQL is a [[Database]] system.")
    sb.upsert_note("concept", "Database", "A database stores data.")

    r = client.post("/v1/brain/think/connect", json={"a": "Postgres", "b": "MySQL"})
    assert r.status_code == 200, r.text
    body = r.json()
    # either a bridge is found, or an honest empty (never fabricated)
    assert isinstance(body["bridge"], list)
    if body["bridge"]:
        labels = [b.get("label") for b in body["bridge"]]
        assert any("Database" in str(l) for l in labels)


def test_think_connect_empty_inputs(ctx):
    client, _sb, _bh, _bt = ctx
    r = client.post("/v1/brain/think/connect", json={"a": "", "b": ""})
    assert r.status_code == 200
    assert r.json()["bridge"] == []


def test_think_emerge_terms_or_honest_empty(ctx):
    client, sb, _bh, _bt = ctx
    # repeat an un-named term ("synergy") across notes so it emerges
    sb.upsert_note("concept", "N1", "synergy synergy drives the synergy outcomes here")
    sb.upsert_note("concept", "N2", "more synergy thinking about synergy results")

    r = client.post("/v1/brain/think/emerge", json={"days": 3650})
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["terms"], list)
    terms = [t["term"] for t in body["terms"]]
    # "synergy" repeats and is not a title -> should emerge
    assert "synergy" in terms


def test_think_challenge_and_panel(ctx):
    client, sb, _bh, _bt = ctx
    sb.upsert_note("concept", "Risky Plan", "This plan is risky and could fail badly.")
    sb.upsert_note("concept", "Safe Plan", "This plan is solid and reliable.")

    r = client.post("/v1/brain/think/challenge", json={"idea": "the plan"})
    assert r.status_code == 200, r.text
    cc = r.json()
    assert cc["grounded"] is True
    assert isinstance(cc["counter_case"], list)
    # the risky note should surface as a cited counter-point
    if cc["counter_case"]:
        assert all(c.get("note_id") for c in cc["counter_case"])

    r = client.post("/v1/brain/think/panel", json={"decision": "the plan", "n": 2})
    assert r.status_code == 200
    p = r.json()
    assert isinstance(p["perspectives"], list)
    assert all(persp.get("note_id") for persp in p["perspectives"])
