"""COP (Common Operating Picture) tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used via env so real on-disk stores
are never touched. Exercises the cop_fusion service and the cop routes via a
minimal FastAPI app. Run:

    python3 -m pytest server/tests/test_cop.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def cop_svc(tmp_path, monkeypatch):
    """Reload cop_fusion against fresh temp DBs with seeded ontology + history."""
    ont_db = tmp_path / "test_cop_ontology.db"
    geo_db = tmp_path / "test_cop_geo.db"
    hist_db = tmp_path / "test_cop_history.db"
    monkeypatch.setenv("ONTOLOGY_DB", str(ont_db))
    monkeypatch.setenv("GEO_DB", str(geo_db))
    monkeypatch.setenv("HISTORY_LAKE_DB", str(hist_db))

    from server.services import ontology_store as os_store

    importlib.reload(os_store)
    os_store.init_db()
    os_store.seed_from_static()

    from server.services import geo as geo_svc

    importlib.reload(geo_svc)
    geo_svc.init_db()

    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()
    sid = hl.upsert_series("cop-test", "unit", "metric")
    base_ts = 1_700_000_000_000
    hl.write_observations(sid, [{"t": base_ts + i * 1000, "v": float(i)} for i in range(20)])

    from server.services import temporal as temporal_svc

    importlib.reload(temporal_svc)

    from server.services import graph as graph_svc

    importlib.reload(graph_svc)

    from server.services import cop_fusion as fusion

    importlib.reload(fusion)
    return fusion


@pytest.fixture()
def cop_client(tmp_path, monkeypatch):
    """FastAPI TestClient with the cop router mounted."""
    ont_db = tmp_path / "test_cop_client_ontology.db"
    geo_db = tmp_path / "test_cop_client_geo.db"
    hist_db = tmp_path / "test_cop_client_history.db"
    monkeypatch.setenv("ONTOLOGY_DB", str(ont_db))
    monkeypatch.setenv("GEO_DB", str(geo_db))
    monkeypatch.setenv("HISTORY_LAKE_DB", str(hist_db))

    from server.services import ontology_store as os_store

    importlib.reload(os_store)
    os_store.init_db()
    os_store.seed_from_static()

    from server.services import geo as geo_svc

    importlib.reload(geo_svc)
    geo_svc.init_db()

    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()

    from server.services import graph as graph_svc

    importlib.reload(graph_svc)

    from server.services import cop_fusion as fusion

    importlib.reload(fusion)

    from fastapi import FastAPI
    from server.routes import cop as cop_routes
    from server.routes import graph as graph_routes

    app = FastAPI()
    app.include_router(cop_routes.router)
    app.include_router(graph_routes.router)
    from fastapi.testclient import TestClient

    return TestClient(app)


# ── snapshot ──────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_fuse_snapshot_returns_structure(cop_svc):
    snap = await cop_svc.fuse_snapshot()
    assert "sync_token" in snap
    assert "geo" in snap
    assert "graph" in snap
    assert "temporal" in snap
    assert "metrics" in snap


@pytest.mark.asyncio
async def test_fuse_snapshot_geo_has_layers(cop_svc):
    snap = await cop_svc.fuse_snapshot()
    layers = snap["geo"].get("layers", [])
    assert isinstance(layers, list)
    assert any(l.get("id") == "entities" for l in layers)


@pytest.mark.asyncio
async def test_fuse_snapshot_graph_has_nodes(cop_svc):
    snap = await cop_svc.fuse_snapshot()
    nodes = snap["graph"].get("nodes", [])
    assert isinstance(nodes, list)
    # Seeded ontology contains 'sam', 'psg', etc.
    ids = {n["id"] for n in nodes}
    assert "sam" in ids or len(nodes) == 0  # seeded data may be present


@pytest.mark.asyncio
async def test_fuse_snapshot_temporal_has_events(cop_svc):
    snap = await cop_svc.fuse_snapshot()
    events = snap["temporal"].get("events", [])
    assert isinstance(events, list)


@pytest.mark.asyncio
async def test_fuse_snapshot_metrics_are_cards(cop_svc):
    snap = await cop_svc.fuse_snapshot()
    cards = snap["metrics"].get("cards", [])
    assert isinstance(cards, list)


# ── layers ────────────────────────────────────────────────────────────────────
def test_list_layers_returns_catalog(cop_svc):
    layers = cop_svc.list_layers("test-session")
    ids = [l["id"] for l in layers]
    assert "entities" in ids


def test_toggle_layer_flips_visibility(cop_svc):
    s = "t1"
    before = {l["id"]: l["visible"] for l in cop_svc.list_layers(s)}
    cop_svc.toggle_layer(s, "entities")
    after = {l["id"]: l["visible"] for l in cop_svc.list_layers(s)}
    assert after["entities"] is not before["entities"]


def test_toggle_layer_idempotent(cop_svc):
    s = "t2"
    r1 = cop_svc.toggle_layer(s, "entities")
    r2 = cop_svc.toggle_layer(s, "entities")
    assert r1["visible"] is not r2["visible"]


# ── selection ─────────────────────────────────────────────────────────────────
def test_get_selection_empty_by_default(cop_svc):
    sel = cop_svc.get_selection("new-session")
    assert sel["selection"] == {}


def test_set_selection_persists(cop_svc):
    s = "s1"
    cop_svc.set_selection(s, {"object_id": "sam", "type": "person"})
    sel = cop_svc.get_selection(s)
    assert sel["selection"]["object_id"] == "sam"


@pytest.mark.asyncio
async def test_cross_highlight_returns_structure(cop_svc):
    hl = await cop_svc.cross_highlight({"id": "sam"})
    assert "geo" in hl
    assert "graph" in hl
    assert "temporal" in hl
    assert "metrics" in hl


@pytest.mark.asyncio
async def test_cross_highlight_empty_for_unknown(cop_svc):
    hl = await cop_svc.cross_highlight({"id": "ghost-999"})
    assert hl["geo"] == []
    # graph.expand creates a placeholder for unknown nodes
    assert hl["graph"]["edges"] == []
    assert hl["temporal"] == []


# ── incremental sync ──────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_incremental_sync_fresh_token(cop_svc):
    from server.services.cop_fusion import _now_ms

    token = f"{_now_ms():x}"
    res = await cop_svc.incremental_sync(token)
    assert "sync_token" in res
    assert res["full_refresh"] is False


@pytest.mark.asyncio
async def test_incremental_sync_stale_token(cop_svc):
    old_token = "0"
    res = await cop_svc.incremental_sync(old_token)
    assert res["full_refresh"] is True
    assert "changes" in res


# ── route smoke tests ─────────────────────────────────────────────────────────
def test_route_snapshot_get(cop_client):
    r = cop_client.get("/v1/cop/snapshot")
    assert r.status_code == 200
    assert "geo" in r.json()


def test_route_layers_get(cop_client):
    r = cop_client.get("/v1/cop/layers")
    assert r.status_code == 200
    assert r.json()["count"] > 0


def test_route_layers_toggle(cop_client):
    r = cop_client.post("/v1/cop/layers/toggle", json={"layer_id": "entities"})
    assert r.status_code == 200
    assert "visible" in r.json()


def test_route_selection_roundtrip(cop_client):
    r1 = cop_client.post("/v1/cop/selection", json={"object_id": "sam", "type": "person"})
    assert r1.status_code == 200
    sess = r1.json()["session_id"]
    r2 = cop_client.get(f"/v1/cop/selection?session_id={sess}")
    assert r2.status_code == 200
    assert r2.json()["selection"]["object_id"] == "sam"


def test_route_sync(cop_client):
    r = cop_client.get("/v1/cop/sync?since_token=0")
    assert r.status_code == 200
    assert r.json()["full_refresh"] is True


def test_route_snapshot_post_with_filters(cop_client):
    r = cop_client.post("/v1/cop/snapshot", json={"layer_ids": ["entities"]})
    assert r.status_code == 200
    assert "geo" in r.json()


def test_route_layers_toggle_unknown_layer(cop_client):
    r = cop_client.post("/v1/cop/layers/toggle", json={"layer_id": "nonexistent"})
    assert r.status_code == 200
    assert "visible" in r.json()


def test_cross_highlight_geo_match_for_seeded_object(cop_svc):
    import asyncio
    # Seed an object with coordinates
    from server.services import ontology_store as os_store
    os_store.upsert_object({"id": "cop-geo-1", "type": "asset", "label": "Test Asset", "props": {"lat": -33.87, "lon": 151.21}})
    hl = asyncio.run(cop_svc.cross_highlight({"id": "cop-geo-1"}))
    assert len(hl["geo"]) > 0
    assert hl["geo"][0]["id"] == "cop-geo-1"


def test_incremental_sync_bad_token_returns_refresh(cop_svc):
    import asyncio
    res = asyncio.run(cop_svc.incremental_sync("not-a-hex-token"))
    assert res["full_refresh"] is True


def test_list_layers_persists_session_state(cop_svc):
    s = "session-persist"
    cop_svc.toggle_layer(s, "entities")
    layers = cop_svc.list_layers(s)
    ent = next((l for l in layers if l["id"] == "entities"), None)
    assert ent is not None
    assert ent["visible"] is False


def test_set_selection_overwrites_previous(cop_svc):
    s = "overwrite"
    cop_svc.set_selection(s, {"object_id": "a", "type": "person"})
    cop_svc.set_selection(s, {"object_id": "b", "type": "org"})
    sel = cop_svc.get_selection(s)
    assert sel["selection"]["object_id"] == "b"


def test_fuse_snapshot_session_isolation(cop_svc):
    import asyncio
    s1 = "sess-a"
    s2 = "sess-b"
    cop_svc.toggle_layer(s1, "entities")
    snap1 = asyncio.run(cop_svc.fuse_snapshot(session_id=s1))
    snap2 = asyncio.run(cop_svc.fuse_snapshot(session_id=s2))
    # s2 should still have entities visible (default)
    ent2 = next((l for l in snap2["geo"]["layers"] if l["id"] == "entities"), None)
    assert ent2 is not None and ent2["visible"] is True


def test_route_selection_with_explicit_session(cop_client):
    r = cop_client.post("/v1/cop/selection?session_id=explicit", json={"object_id": "sam"})
    assert r.status_code == 200
    assert r.json()["session_id"] == "explicit"


def test_route_get_annotations_empty(cop_client):
    # Verify graph annotations endpoint works via graph routes
    r = cop_client.get("/v1/graph/annotations")
    assert r.status_code == 200
    assert r.json()["count"] == 0
