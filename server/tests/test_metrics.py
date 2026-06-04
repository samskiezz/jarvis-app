"""METRICS / OBSERVABILITY tests — fully OFFLINE.

No network and no API key. Temp DBs are pointed at via env vars so the real
on-disk stores are never touched. Run:

    python3 -m pytest server/tests/test_metrics.py -q
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def metrics(monkeypatch, tmp_path):
    """Fresh metrics registry per test, with all platform stores pointed at temp
    DBs so platform_summary touches nothing real."""
    monkeypatch.setenv("HISTORY_LAKE_DB", str(tmp_path / "history.db"))
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ontology.db"))
    monkeypatch.setenv("OPS_DB", str(tmp_path / "ops.db"))
    monkeypatch.setenv("CATALOG_DB", str(tmp_path / "catalog.db"))
    monkeypatch.setenv("REPORTS_DB", str(tmp_path / "reports.db"))
    monkeypatch.delenv("PREDICT_GPU_URL", raising=False)

    from server.services import metrics as metrics_svc

    metrics_svc.reset()
    return metrics_svc


# ── incr / observe / snapshot ─────────────────────────────────────────────────────
def test_incr_and_snapshot(metrics):
    metrics.incr("widgets")
    metrics.incr("widgets", 4)
    metrics.incr("widgets", 2, {"color": "red"})

    snap = metrics.snapshot()
    counters = {(c["name"], tuple(sorted(c["labels"].items()))): c["value"] for c in snap["counters"]}

    assert counters[("widgets", ())] == 5
    assert counters[("widgets", (("color", "red"),))] == 2


def test_observe_aggregates(metrics):
    for v in (10.0, 20.0, 30.0):
        metrics.observe("latency", v)

    snap = metrics.snapshot()
    timers = {t["name"]: t for t in snap["timers"]}
    t = timers["latency"]

    assert t["count"] == 3
    assert t["sum"] == 60.0
    assert t["min"] == 10.0
    assert t["max"] == 30.0
    assert t["mean"] == 20.0
    assert t["last"] == 30.0


def test_observe_ignores_garbage(metrics):
    metrics.observe("g", float("nan"))
    metrics.observe("g", float("inf"))
    metrics.observe("g", "not-a-number")
    snap = metrics.snapshot()
    assert all(t["name"] != "g" for t in snap["timers"])


def test_record_request_increments(metrics):
    metrics.record_request("/v1/metrics", 200, 12.5)
    metrics.record_request("/v1/metrics", 200, 7.5)

    snap = metrics.snapshot()

    req = [c for c in snap["counters"] if c["name"] == "request_total"]
    assert len(req) == 1
    assert req[0]["value"] == 2
    assert req[0]["labels"]["path"] == "/v1/metrics"
    assert req[0]["labels"]["status"] == 200

    lat = [t for t in snap["timers"] if t["name"] == "request_latency_ms"]
    assert len(lat) == 1
    assert lat[0]["count"] == 2
    assert lat[0]["mean"] == 10.0


def test_reset_clears(metrics):
    metrics.incr("x")
    metrics.observe("y", 1.0)
    metrics.reset()
    snap = metrics.snapshot()
    assert snap == {"counters": [], "timers": []}


# ── system metrics ────────────────────────────────────────────────────────────────
def test_system_metrics_fields(metrics):
    sm = metrics.system_metrics()
    assert isinstance(sm, dict)
    assert isinstance(sm["pid"], int) and sm["pid"] > 0
    assert sm["uptime_s"] >= 0.0
    assert isinstance(sm["python_version"], str) and sm["python_version"]
    # rss may be None on exotic platforms but should be int/None
    assert sm["rss_bytes"] is None or isinstance(sm["rss_bytes"], int)


# ── platform summary ──────────────────────────────────────────────────────────────
def test_platform_summary_integer_counts(metrics):
    summary = metrics.platform_summary()
    assert isinstance(summary, dict)
    expected_keys = {
        "ontology_objects",
        "datasets",
        "alerts",
        "cases",
        "reports",
        "audit_length",
    }
    assert expected_keys.issubset(summary.keys())
    for key in expected_keys:
        assert isinstance(summary[key], int)
        assert summary[key] >= 0


# ── deep health ───────────────────────────────────────────────────────────────────
def test_health_deep_per_component_booleans(metrics):
    from server.routes import admin as admin_routes

    health = admin_routes.health_deep()
    assert isinstance(health, dict)
    assert isinstance(health["ok"], bool)

    components = health["components"]
    for name in ("history_lake", "ontology", "science_bridge", "gpu_configured"):
        assert name in components
        assert isinstance(components[name], bool)

    # GPU not configured in this offline env.
    assert components["gpu_configured"] is False
