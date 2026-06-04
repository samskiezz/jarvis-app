"""SECOND BRAIN route tests — fully OFFLINE / deterministic.

No network. Reads use optional_bearer (open here since JARVIS_REQUIRE_AUTH is
unset); writes use require_bearer, so they carry a bearer token equal to the
pinned JARVIS_API_KEY.

Temp DBs (BRAIN_DB + ONTOLOGY_DB + VECTOR_DB) are set via env so the real
on-disk stores are never touched. A TestClient mounts ONLY the second_brain
router. Run:

    python3 -m pytest server/tests/test_second_brain_routes.py -q
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
def client(tmp_path, monkeypatch):
    """Fresh temp DBs each test; reload config/auth/service/router so the pinned
    API key + temp DBs take effect; mount ONLY our router behind a TestClient."""
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("VECTOR_DB", str(tmp_path / "vectors.db"))
    monkeypatch.setenv("JARVIS_API_KEY", TOKEN)
    monkeypatch.delenv("JARVIS_REQUIRE_AUTH", raising=False)

    # Reload config + auth so the pinned API key is picked up.
    from server import config

    importlib.reload(config)
    from server import auth

    importlib.reload(auth)

    # Reload the service against the temp BRAIN_DB, then the route module so it
    # binds to the reloaded service + auth.
    from server.services import second_brain as sb

    importlib.reload(sb)
    sb.init_db()

    from server.routes import second_brain as routes

    importlib.reload(routes)

    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def test_upsert_get_and_wikilink_backlinks(client):
    # Create a note that wikilinks to a not-yet-existing target.
    r = client.post(
        "/v1/brain/notes",
        json={"kind": "concept", "title": "Alpha", "body_md": "links to [[Beta]] here"},
        headers=AUTH,
    )
    assert r.status_code == 200, r.text
    note = r.json()
    assert note["title"] == "Alpha"
    assert note["kind"] == "concept"

    # GET it back by title.
    r = client.get("/v1/brain/notes/Alpha")
    assert r.status_code == 200
    assert r.json()["id"] == note["id"]

    # GET it back by id too.
    r = client.get(f"/v1/brain/notes/{note['id']}")
    assert r.status_code == 200

    # Backlinks of Beta are empty until Beta resolves the link (link exists,
    # backlinks() joins src notes by dst_title so Alpha shows up immediately).
    r = client.get("/v1/brain/notes/Beta/backlinks")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["items"][0]["title"] == "Alpha"

    # Now create the linked note; backlinks still resolves Alpha -> Beta.
    r = client.post(
        "/v1/brain/notes",
        json={"kind": "concept", "title": "Beta", "body_md": "the beta note"},
        headers=AUTH,
    )
    assert r.status_code == 200

    r = client.get("/v1/brain/notes/Beta/backlinks")
    assert r.status_code == 200
    titles = [n["title"] for n in r.json()["items"]]
    assert "Alpha" in titles


def test_list_and_search_notes(client):
    client.post("/v1/brain/notes", json={"kind": "project", "title": "Roadmap", "body_md": "Q3 plans"}, headers=AUTH)
    client.post("/v1/brain/notes", json={"kind": "concept", "title": "Idea", "body_md": "random thought"}, headers=AUTH)

    r = client.get("/v1/brain/notes")
    assert r.status_code == 200
    assert r.json()["count"] == 2

    r = client.get("/v1/brain/notes", params={"kind": "project"})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1 and items[0]["title"] == "Roadmap"

    r = client.get("/v1/brain/notes", params={"q": "thought"})
    assert r.status_code == 200
    assert [n["title"] for n in r.json()["items"]] == ["Idea"]


def test_delete_note(client):
    client.post("/v1/brain/notes", json={"kind": "concept", "title": "Temp", "body_md": "x"}, headers=AUTH)
    r = client.delete("/v1/brain/notes/Temp", headers=AUTH)
    assert r.status_code == 200 and r.json()["ok"] is True

    assert client.get("/v1/brain/notes/Temp").status_code == 404
    assert client.delete("/v1/brain/notes/Temp", headers=AUTH).status_code == 404


def test_capture(client):
    r = client.post("/v1/brain/capture", json={"text": "Buy milk and think about graph DBs"}, headers=AUTH)
    assert r.status_code == 200, r.text
    note = r.json()
    assert note["kind"] == "concept"
    assert note["title"].startswith("Buy milk")
    assert note["frontmatter"].get("captured") is True


def test_daily_get_and_append(client):
    # Create/get the daily note for a fixed date.
    r = client.get("/v1/brain/daily", params={"date": "2026-06-04"})
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "daily"
    assert r.json()["title"] == "2026-06-04"

    # Append to it.
    r = client.post("/v1/brain/daily", json={"text": "shipped the router", "date": "2026-06-04"}, headers=AUTH)
    assert r.status_code == 200
    assert "shipped the router" in r.json()["body_md"]

    # Still a single daily note for that date (idempotent on title).
    r = client.get("/v1/brain/notes", params={"kind": "daily"})
    assert r.json()["count"] == 1


def test_log_and_timeline(client):
    r = client.post("/v1/brain/log", json={"summary": "did a thing", "links": ["Alpha"]}, headers=AUTH)
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "log"

    r = client.get("/v1/brain/timeline", params={"limit": 10})
    assert r.status_code == 200
    titles = [n["body_md"] for n in r.json()["items"]]
    assert any("did a thing" in t for t in titles)


def test_catalog_counts(client):
    client.post("/v1/brain/notes", json={"kind": "concept", "title": "A", "body_md": "[[B]]"}, headers=AUTH)
    client.post("/v1/brain/notes", json={"kind": "project", "title": "B", "body_md": "b"}, headers=AUTH)

    r = client.get("/v1/brain/catalog")
    assert r.status_code == 200
    cat = r.json()
    assert cat["total"] == 2
    assert cat["counts"].get("concept") == 1
    assert cat["counts"].get("project") == 1
    assert isinstance(cat["recent"], list)
    assert isinstance(cat["orphans"], list)


def test_upsert_empty_title_returns_400(client):
    r = client.post("/v1/brain/notes", json={"kind": "concept", "title": "   ", "body_md": "x"}, headers=AUTH)
    assert r.status_code == 400
