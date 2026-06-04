"""History Lake tests — fully OFFLINE / deterministic (PATTERN ORACLE P0).

No network and no API key. A temp DB is used (env HISTORY_LAKE_DB) so the real
on-disk lake is never touched. Run:

    python3 -m pytest server/tests/test_history_lake.py -q
"""

import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def lake(tmp_path, monkeypatch):
    """Reload history_lake against a fresh temp DB for each test."""
    db = tmp_path / "test_lake.db"
    monkeypatch.setenv("HISTORY_LAKE_DB", str(db))
    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()
    return hl


def _table_names(hl):
    conn = hl._connect()
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        return {r["name"] for r in rows}
    finally:
        conn.close()


# ── init_db creates all tables ──────────────────────────────────────────────────
def test_init_db_creates_tables(lake):
    names = _table_names(lake)
    for t in ("series", "observation", "feed_run", "forecast",
              "realized_outcome", "skill_score"):
        assert t in names, f"missing table {t}"


def test_init_db_idempotent(lake):
    # Second init must not raise or duplicate.
    lake.init_db()
    lake.init_db()
    assert "series" in _table_names(lake)


# ── write/read observations round-trip + idempotency ────────────────────────────
def test_observation_roundtrip(lake):
    sid = lake.upsert_series("coingecko", "bitcoin", "close_price", unit="USD", freq="1d")
    assert sid
    points = [{"t": 1_700_000_000_000 + i * 86_400_000, "v": 100.0 + i} for i in range(5)]
    n = lake.write_observations(sid, points)
    assert n == 5
    got = lake.read_series(sid)
    assert [p["v"] for p in got] == [100.0, 101.0, 102.0, 103.0, 104.0]
    assert [p["t"] for p in got] == [p["t"] for p in points]


def test_observation_upsert_idempotent(lake):
    sid = lake.upsert_series("fx", "AUDUSD", "rate", unit="USD", freq="1d")
    pts = [{"t": 1_700_000_000_000, "v": 0.65}]
    lake.write_observations(sid, pts)
    lake.write_observations(sid, pts)  # re-ingest overlapping window
    got = lake.read_series(sid)
    assert len(got) == 1  # no duplicate (series_id, ts)
    # value update on re-ingest
    lake.write_observations(sid, [{"t": 1_700_000_000_000, "v": 0.66}])
    got = lake.read_series(sid)
    assert len(got) == 1
    assert got[0]["v"] == 0.66


def test_upsert_series_idempotent(lake):
    a = lake.upsert_series("usgs", "global", "event_count", unit="count", freq="1d")
    b = lake.upsert_series("usgs", "global", "event_count", unit="count", freq="1d")
    assert a == b
    assert len(lake.list_series()) == 1


def test_read_series_since_and_limit(lake):
    sid = lake.upsert_series("coingecko", "ethereum", "close_price", unit="USD", freq="1d")
    base = 1_700_000_000_000
    lake.write_observations(sid, [{"t": base + i * 1000, "v": float(i)} for i in range(10)])
    since = lake.read_series(sid, since=base + 5000)
    assert [p["v"] for p in since] == [5, 6, 7, 8, 9]
    last3 = lake.read_series(sid, limit=3)
    assert [p["v"] for p in last3] == [7, 8, 9]  # newest 3, ascending


# ── forecast -> outcome -> score_due_forecasts ──────────────────────────────────
def test_score_due_forecast_abs_err_and_in_interval(lake):
    issued = 1_700_000_000_000
    # horizon 24h; point 110, interval [100,120], baseline 105.
    fid = lake.record_forecast(
        question="price?", domain="crypto", target="bitcoin",
        horizon=24.0, issued_ts=issued, point=110.0, low=100.0, high=120.0,
        confidence=0.9, method="gbm", drivers={"baseline": 105.0},
    )
    assert fid

    # Not yet due -> nothing scored.
    not_due = issued + 23 * 3600_000
    assert lake.score_due_forecasts(not_due, lambda fr: 112.0) == 0

    # Due now (>= issued + 24h). Resolver returns actual=112.
    now = issued + 25 * 3600_000
    scored = lake.score_due_forecasts(now, lambda fr: 112.0)
    assert scored == 1

    summary = lake.skill_summary("crypto")
    assert summary["n_scored"] == 1
    # abs_err = |110 - 112| = 2 ; rmse = 2 ; coverage 1.0 (112 in [100,120])
    assert summary["mae"] == pytest.approx(2.0)
    assert summary["rmse"] == pytest.approx(2.0)
    assert summary["coverage"] == pytest.approx(1.0)
    # skill vs baseline: base_err=|105-112|=7 ; 1 - 2/7
    assert summary["mean_skill_vs_baseline"] == pytest.approx(1.0 - 2.0 / 7.0)


def test_score_out_of_interval(lake):
    issued = 1_700_000_000_000
    fid = lake.record_forecast(
        domain="fx", horizon=1.0, issued_ts=issued,
        point=50.0, low=48.0, high=52.0, method="m",
    )
    now = issued + 2 * 3600_000
    assert lake.score_due_forecasts(now, lambda fr: 60.0) == 1  # 60 outside [48,52]

    # verify the skill_score row directly
    conn = lake._connect()
    try:
        row = conn.execute(
            "SELECT * FROM skill_score WHERE forecast_id=?", (fid,)
        ).fetchone()
    finally:
        conn.close()
    assert row["in_interval"] == 0
    assert row["abs_err"] == pytest.approx(10.0)
    assert row["sq_err"] == pytest.approx(100.0)


def test_score_skips_when_resolver_returns_none(lake):
    issued = 1_700_000_000_000
    lake.record_forecast(domain="crypto", horizon=1.0, issued_ts=issued, point=1.0, method="m")
    now = issued + 2 * 3600_000
    assert lake.score_due_forecasts(now, lambda fr: None) == 0
    assert lake.skill_summary()["n_scored"] == 0
    # A later pass can still score it.
    assert lake.score_due_forecasts(now, lambda fr: 1.5) == 1


def test_score_due_is_idempotent(lake):
    issued = 1_700_000_000_000
    lake.record_forecast(domain="crypto", horizon=1.0, issued_ts=issued, point=10.0, method="m")
    now = issued + 2 * 3600_000
    assert lake.score_due_forecasts(now, lambda fr: 11.0) == 1
    # Already scored -> not re-scored.
    assert lake.score_due_forecasts(now, lambda fr: 11.0) == 0


def test_record_outcome_direct(lake):
    fid = lake.record_forecast(domain="crypto", horizon=1.0, point=5.0, method="m")
    assert lake.record_outcome(fid, 5.5, realized_ts=1_700_000_000_000) is True
    conn = lake._connect()
    try:
        row = conn.execute(
            "SELECT actual_value FROM realized_outcome WHERE forecast_id=?", (fid,)
        ).fetchone()
    finally:
        conn.close()
    assert row["actual_value"] == pytest.approx(5.5)


# ── skill_summary aggregation across multiple forecasts + domain filter ──────────
def test_skill_summary_aggregates(lake):
    issued = 1_700_000_000_000
    now = issued + 2 * 3600_000
    # crypto: errors 2 and 4 -> MAE 3, RMSE sqrt((4+16)/2)=sqrt(10)
    f1 = lake.record_forecast(domain="crypto", horizon=1.0, issued_ts=issued,
                              point=10.0, low=0.0, high=20.0, method="m")
    f2 = lake.record_forecast(domain="crypto", horizon=1.0, issued_ts=issued,
                              point=10.0, low=0.0, high=5.0, method="m")
    lake.record_forecast(domain="seismic", horizon=1.0, issued_ts=issued,
                         point=1.0, method="m")
    actuals = {f1: 12.0, f2: 14.0}  # f1 in interval, f2 out; seismic actual=2

    def resolver(fr):
        return actuals.get(fr["id"], 2.0)

    assert lake.score_due_forecasts(now, resolver) == 3

    crypto = lake.skill_summary("crypto")
    assert crypto["n_scored"] == 2
    assert crypto["mae"] == pytest.approx(3.0)
    assert crypto["rmse"] == pytest.approx((10.0) ** 0.5)
    assert crypto["coverage"] == pytest.approx(0.5)  # 1 of 2 in interval

    overall = lake.skill_summary()  # no domain filter -> all 3
    assert overall["n_scored"] == 3


def test_skill_summary_empty(lake):
    s = lake.skill_summary()
    assert s["n_scored"] == 0
    assert s["mae"] is None and s["rmse"] is None


def test_feed_run_audit(lake):
    rid = lake.start_feed_run("coingecko")
    assert rid is not None
    lake.finish_feed_run(rid, status="ok", n_rows=42, note="done")
    runs = lake.list_feed_runs()
    assert runs and runs[0]["status"] == "ok" and runs[0]["n_rows"] == 42
