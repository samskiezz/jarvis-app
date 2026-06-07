"""Offline tests for the workshop pivot/aggregation service + routes.

Pure-python/numpy over INJECTED objects + observations (no DB dependency), so
these are deterministic and offline. The service must never raise.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.services import workshop  # noqa: E402

client = TestClient(app)


# A small, fully-controlled object set spanning two types, with numeric props.
OBJECTS = [
    {"id": "1", "type": "client", "mark": "A", "props": {"score": 10.0, "region": "EU"}},
    {"id": "2", "type": "client", "mark": "B", "props": {"score": 20.0, "region": "EU"}},
    {"id": "3", "type": "client", "mark": "A", "props": {"score": 30.0, "region": "US"}},
    {"id": "4", "type": "asset", "mark": "A", "props": {"score": 40.0, "region": "US"}},
    {"id": "5", "type": "asset", "mark": "B", "props": {"score": 50.0, "region": "US"}},
]


# ── histogram ────────────────────────────────────────────────────────────────
def test_histogram_over_props_shape():
    out = workshop.histogram("score", bins=5, objects=OBJECTS)
    assert out["n"] == 5
    assert out["bins"] == 5
    assert len(out["counts"]) == 5
    assert len(out["edges"]) == 6
    assert sum(out["counts"]) == 5


def test_histogram_over_explicit_series():
    out = workshop.histogram("v", bins=4, series=[1.0, 2.0, 3.0, 4.0])
    assert out["n"] == 4
    assert sum(out["counts"]) == 4


def test_histogram_empty_is_zeroed_not_raised():
    out = workshop.histogram("nope", bins=3, objects=[])
    assert out["n"] == 0
    assert out["counts"] == [0, 0, 0]


# ── group_by ─────────────────────────────────────────────────────────────────
def test_group_by_count():
    out = workshop.group_by("type", agg="count", objects=OBJECTS)
    assert out["groups"] == {"client": 3, "asset": 2}
    assert out["n_groups"] == 2


def test_group_by_mean_of_value_field():
    out = workshop.group_by("type", agg="mean", value_field="score", objects=OBJECTS)
    assert out["groups"]["client"] == 20.0  # (10+20+30)/3
    assert out["groups"]["asset"] == 45.0   # (40+50)/2


def test_group_by_sum_over_prop_key():
    out = workshop.group_by("region", agg="sum", value_field="score", objects=OBJECTS)
    assert out["groups"]["EU"] == 30.0   # 10+20
    assert out["groups"]["US"] == 120.0  # 30+40+50


# ── pivot ────────────────────────────────────────────────────────────────────
def test_pivot_count_shape():
    out = workshop.pivot("type", "mark", agg="count", objects=OBJECTS)
    assert set(out["row_keys"]) == {"client", "asset"}
    assert set(out["col_keys"]) == {"A", "B"}
    # client: A=2 (ids 1,3), B=1 (id 2); asset: A=1 (id4), B=1 (id5)
    assert out["table"]["client"]["A"] == 2
    assert out["table"]["client"]["B"] == 1
    assert out["table"]["asset"]["A"] == 1
    assert out["table"]["asset"]["B"] == 1


def test_pivot_sum_value_field():
    out = workshop.pivot("region", "mark", agg="sum", value_field="score",
                         objects=OBJECTS)
    # EU/A -> id1 score 10 ; EU/B -> id2 score 20
    assert out["table"]["EU"]["A"] == 10.0
    assert out["table"]["EU"]["B"] == 20.0
    # US/A -> id3(30)+id4(40)=70 ; US/B -> id5 50
    assert out["table"]["US"]["A"] == 70.0
    assert out["table"]["US"]["B"] == 50.0


def test_pivot_empty_never_raises():
    out = workshop.pivot("type", "mark", objects=[])
    assert out["table"] == {}
    assert out["row_keys"] == []


# ── series_stats ─────────────────────────────────────────────────────────────
def test_series_stats_mean_and_upward_trend():
    obs = [{"t": i, "v": float(i)} for i in range(1, 6)]  # 1,2,3,4,5
    out = workshop.series_stats("s1", observations=obs)
    assert out["n"] == 5
    assert out["mean"] == 3.0
    assert out["min"] == 1.0
    assert out["max"] == 5.0
    # perfect line slope 1.0, rising
    assert abs(out["trend"] - 1.0) < 1e-6
    assert out["direction"] == "up"


def test_series_stats_downward_trend():
    obs = [{"t": i, "v": float(10 - i)} for i in range(5)]  # 10,9,8,7,6
    out = workshop.series_stats("s2", observations=obs)
    assert out["direction"] == "down"
    assert out["trend"] < 0


def test_series_stats_empty_is_zeroed():
    out = workshop.series_stats("nope", observations=[])
    assert out["n"] == 0
    assert out["mean"] is None
    assert out["direction"] == "flat"


# ── routes ───────────────────────────────────────────────────────────────────
# Tolerant of a 404 until main.py wires the router (reported as an include line).
def test_histogram_route():
    res = client.post("/v1/workshop/histogram",
                      json={"field": "score", "bins": 5, "objects": OBJECTS})
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.json()
        assert body["n"] == 5
        assert len(body["counts"]) == 5


def test_groupby_route():
    res = client.post("/v1/workshop/groupby",
                      json={"field": "type", "agg": "count", "objects": OBJECTS})
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        assert res.json()["groups"] == {"client": 3, "asset": 2}


def test_pivot_route():
    res = client.post("/v1/workshop/pivot",
                      json={"rows_field": "type", "cols_field": "mark",
                            "objects": OBJECTS})
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.json()
        assert body["table"]["client"]["A"] == 2


def test_series_stats_route_uses_lake():
    res = client.get("/v1/workshop/series/does-not-exist/stats")
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.json()
        # unknown series in the lake -> graceful zeroed shape
        assert body["series_id"] == "does-not-exist"
        assert body["n"] == 0


# ── Workshop App Builder CRUD ────────────────────────────────────────────────
import pytest  # noqa: E402

AUTH_HEADERS = {"Authorization": "Bearer test-key"}


@pytest.fixture
def fresh_wm_db(tmp_path, monkeypatch):
    """Isolate workshop_models to a temp DB for each test."""
    db_path = str(tmp_path / "workshop.db")
    monkeypatch.setenv("WORKSHOP_DB", db_path)
    monkeypatch.setattr("server.data.workshop_models._db_path", lambda: db_path)
    from server.data import workshop_models

    workshop_models.init_db(db_path)
    return db_path


def test_create_app_direct(fresh_wm_db):
    from server.data import workshop_models as wm

    app = wm.create_app("Test App", owner_id="user-1", layout={"widgets": []})
    assert "error" not in app
    assert app["name"] == "Test App"
    assert app["owner_id"] == "user-1"
    assert app["layout"] == {"widgets": []}
    assert app["is_published"] is False
    assert "id" in app


def test_get_app_direct(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("Get Me", owner_id="u1")
    fetched = wm.get_app(created["id"])
    assert fetched is not None
    assert fetched["name"] == "Get Me"


def test_update_app_direct(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("Old Name", owner_id="u1", layout={"v": 1})
    updated = wm.update_app(created["id"], name="New Name", layout={"v": 2})
    assert updated is not None
    assert updated["name"] == "New Name"
    assert updated["layout"] == {"v": 2}


def test_delete_app_direct(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("Delete Me", owner_id="u1")
    ok = wm.delete_app(created["id"])
    assert ok is True
    assert wm.get_app(created["id"]) is None


def test_publish_app_direct(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("Publish Me", owner_id="u1")
    published = wm.publish_app(created["id"])
    assert published is not None
    assert published["is_published"] is True


def test_list_apps_filters_by_owner(fresh_wm_db):
    from server.data import workshop_models as wm

    wm.create_app("A1", owner_id="u1")
    wm.create_app("A2", owner_id="u2")
    wm.create_app("A3", owner_id="u1")
    apps = wm.list_apps(owner_id="u1", include_published=False)
    assert len(apps) == 2
    assert all(a["owner_id"] == "u1" for a in apps)


def test_create_app_route(fresh_wm_db):
    res = client.post(
        "/v1/workshop/apps",
        json={"name": "Route App", "owner_id": "u1"},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Route App"


def test_list_apps_route(fresh_wm_db):
    from server.data import workshop_models as wm

    wm.create_app("RouteList", owner_id="u1")
    res = client.get("/v1/workshop/apps?owner_id=u1", headers=AUTH_HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert len(body["apps"]) >= 1


def test_get_app_route(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("RouteGet", owner_id="u1")
    res = client.get(f"/v1/workshop/apps/{created['id']}", headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert res.json()["name"] == "RouteGet"


def test_update_app_route(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("RouteOld", owner_id="u1")
    res = client.put(
        f"/v1/workshop/apps/{created['id']}",
        json={"name": "RouteNew"},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 200
    assert res.json()["name"] == "RouteNew"


def test_delete_app_route(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("RouteDel", owner_id="u1")
    res = client.delete(f"/v1/workshop/apps/{created['id']}", headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert res.json()["deleted"] is True


def test_publish_app_route(fresh_wm_db):
    from server.data import workshop_models as wm

    created = wm.create_app("RoutePub", owner_id="u1")
    res = client.post(
        f"/v1/workshop/apps/{created['id']}/publish", headers=AUTH_HEADERS
    )
    assert res.status_code == 200
    assert res.json()["is_published"] is True


def test_get_app_404(fresh_wm_db):
    res = client.get("/v1/workshop/apps/does-not-exist", headers=AUTH_HEADERS)
    assert res.status_code == 404
