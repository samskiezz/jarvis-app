"""Test in-memory metrics + snapshot shape."""
from assurance.telemetry.metrics import registry
from assurance.telemetry.snapshot import get_snapshot, health_snapshot


def test_counter_increments():
    c = registry.counter("test_calls_total")
    before = c.value
    c.inc(3)
    assert c.value == before + 3


def test_gauge_set_and_inc():
    g = registry.gauge("queue_depth")
    g.set(0)
    g.inc()
    g.inc()
    g.dec()
    assert g.value == 1


def test_histogram_observe_bucket_assignment():
    h = registry.histogram("test_dur_seconds")
    h.observe(0.001); h.observe(0.5); h.observe(60.0)
    snap = h.snapshot()
    assert snap["count"] == 3
    assert snap["sum"] > 0


def test_health_snapshot_shape():
    snap = health_snapshot()
    assert "commands" in snap and "events" in snap and "audit" in snap


def test_get_snapshot_returns_health_and_metrics():
    s = get_snapshot()
    assert "health" in s and "metrics" in s
