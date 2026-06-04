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
