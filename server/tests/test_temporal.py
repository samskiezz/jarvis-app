"""TEMPORAL ANALYSIS tests — fully OFFLINE / deterministic (temporal pillar).

No network and no API key. A temp DB is used (env HISTORY_LAKE_DB) so the real
on-disk lake is never touched. Exercises the service functions directly (range /
events / patterns / replay / timeline / object_versions) plus one route smoke
test through a minimal FastAPI app that mounts only the temporal router. Run:

    python3 -m pytest server/tests/test_temporal.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


# ── fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture()
def temporal(tmp_path, monkeypatch):
    """Reload history_lake + temporal against a fresh temp DB, seed one series."""
    db = tmp_path / "test_temporal.db"
    monkeypatch.setenv("HISTORY_LAKE_DB", str(db))

    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()

    from server.services import temporal as svc

    importlib.reload(svc)

    # Seed a deterministic series: mostly a flat baseline with one big spike so
    # threshold crossings and z-score anomalies are guaranteed to fire.
    sid = hl.upsert_series("test", "unit", "metric")
    base_ts = 1_700_000_000_000
    points = []
    for i in range(50):
        v = 10.0
        if i == 25:
            v = 200.0  # a single sharp spike
        elif i == 26:
            v = 10.0
        points.append({"t": base_ts + i * 1000, "v": v})
    n = hl.write_observations(sid, points)
    assert n == 50

    return svc, hl, sid, base_ts


# ── range_query ───────────────────────────────────────────────────────────────
def test_range_query_full_window(temporal):
    svc, _hl, sid, base_ts = temporal
    out = svc.range_query(sid, base_ts, base_ts + 49 * 1000)
    assert out["series_id"] == sid
    assert len(out["points"]) == 50
    st = out["stats"]
    assert st["n"] == 50
    assert st["min"] == 10.0
    assert st["max"] == 200.0
    assert st["first"] == 10.0
    assert st["last"] == 10.0
    assert "slope" in st


def test_range_query_subwindow_filters(temporal):
    svc, _hl, sid, base_ts = temporal
    out = svc.range_query(sid, base_ts, base_ts + 9 * 1000)
    assert len(out["points"]) == 10
    assert out["stats"]["max"] == 10.0  # spike (index 25) is outside the window


def test_range_query_bad_series_is_empty(temporal):
    svc, _hl, _sid, _base = temporal
    out = svc.range_query("does-not-exist", None, None)
    assert out["points"] == []
    assert out["stats"]["n"] == 0


# ── event_sequence ────────────────────────────────────────────────────────────
def test_event_sequence_auto_threshold_detects_spike(temporal):
    svc, _hl, sid, _base = temporal
    events = svc.event_sequence(sid)  # auto threshold = mean + 1σ
    assert events, "expected at least one threshold crossing"
    kinds = {e["kind"] for e in events}
    assert "cross_up" in kinds
    for e in events:
        assert {"t", "value", "kind"} <= set(e)


def test_event_sequence_explicit_threshold_both(temporal):
    svc, _hl, sid, _base = temporal
    events = svc.event_sequence(sid, threshold=100.0, direction="both")
    # one up-crossing into the spike, one down-crossing out of it
    assert len(events) == 2
    assert events[0]["kind"] == "cross_up"
    assert events[1]["kind"] == "cross_down"


def test_event_sequence_empty_on_missing(temporal):
    svc, _hl, _sid, _base = temporal
    assert svc.event_sequence("nope") == []


# ── pattern_scan ──────────────────────────────────────────────────────────────
def test_pattern_scan_flags_spike(temporal):
    svc, _hl, sid, _base = temporal
    out = svc.pattern_scan(sid)
    assert out["series_id"] == sid
    assert out["n_anomalies"] >= 1
    assert out["anomalies"]
    assert out["anomalies"][0]["kind"] == "spike_up"
    assert out["volatility"] >= 0.0
    assert isinstance(out["windows"], list)


def test_pattern_scan_empty_on_missing(temporal):
    svc, _hl, _sid, _base = temporal
    out = svc.pattern_scan("nope")
    assert out["n_anomalies"] == 0
    assert out["anomalies"] == []


# ── replay_frames ─────────────────────────────────────────────────────────────
def test_replay_frames_downsamples(temporal):
    svc, _hl, sid, _base = temporal
    frames = svc.replay_frames(sid, n_frames=10)
    assert 1 <= len(frames) <= 10
    for i, f in enumerate(frames):
        assert f["frame"] == i
        assert {"frame", "t", "value", "cum_mean"} <= set(f)
    # frames are ascending in time
    ts = [f["t"] for f in frames]
    assert ts == sorted(ts)


def test_replay_frames_shorter_than_request(temporal):
    svc, _hl, sid, _base = temporal
    frames = svc.replay_frames(sid, n_frames=500)
    assert len(frames) == 50  # capped at series length


def test_replay_frames_empty_on_missing(temporal):
    svc, _hl, _sid, _base = temporal
    assert svc.replay_frames("nope") == []


# ── timeline ──────────────────────────────────────────────────────────────────
def test_timeline_merges_events(temporal):
    svc, _hl, sid, _base = temporal
    feed = svc.timeline([sid], limit=50)
    assert feed, "expected events in the merged timeline"
    for e in feed:
        assert e["series_id"] == sid
        assert {"t", "value", "kind", "series_id"} <= set(e)
    ts = [e["t"] for e in feed]
    assert ts == sorted(ts)


def test_timeline_all_series_when_none(temporal):
    svc, _hl, _sid, _base = temporal
    feed = svc.timeline(None, limit=200)
    assert isinstance(feed, list)
    assert feed  # the seeded series is auto-discovered


# ── object_versions (degrades gracefully) ─────────────────────────────────────
def test_object_versions_missing_object_is_empty(temporal):
    svc, _hl, _sid, _base = temporal
    assert svc.object_versions("no-such-object") == []
    assert svc.object_versions("") == []


# ── route smoke test ──────────────────────────────────────────────────────────
def test_route_smoke(temporal):
    svc, _hl, sid, base_ts = temporal
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from server.routes import temporal as temporal_routes

    importlib.reload(temporal_routes)

    app = FastAPI()
    app.include_router(temporal_routes.router)
    client = TestClient(app)

    r = client.get("/v1/temporal/range", params={"series_id": sid, "t0": base_ts, "t1": base_ts + 49000})
    assert r.status_code == 200
    assert r.json()["stats"]["n"] == 50

    r = client.get("/v1/temporal/events", params={"series_id": sid, "threshold": 100.0, "direction": "both"})
    assert r.status_code == 200
    assert r.json()["count"] == 2

    r = client.get("/v1/temporal/patterns", params={"series_id": sid})
    assert r.status_code == 200
    assert r.json()["n_anomalies"] >= 1

    r = client.get("/v1/temporal/replay", params={"series_id": sid, "n_frames": 10})
    assert r.status_code == 200
    assert r.json()["n_frames"] >= 1

    r = client.post("/v1/temporal/timeline", json={"series_ids": [sid], "limit": 50})
    assert r.status_code == 200
    assert r.json()["count"] >= 1

    r = client.get(f"/v1/temporal/object/{sid}/versions")
    assert r.status_code == 200
    assert r.json()["object_id"] == sid
