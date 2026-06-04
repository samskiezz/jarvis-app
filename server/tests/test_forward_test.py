"""Forward-test loop tests — fully OFFLINE / deterministic (PATTERN ORACLE P0).

No network and no API key. A temp DB (env ``HISTORY_LAKE_DB``) is used so the real
on-disk lake is never touched, and every series is synthetic / supplied inline so
``issue_forecast`` / ``resolve_value`` never hit a live feed. Run:

    python3 -m pytest server/tests/test_forward_test.py -q
"""

import importlib
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


# ── fixtures ───────────────────────────────────────────────────────────────────
@pytest.fixture()
def lake(tmp_path, monkeypatch):
    """Reload history_lake + forward_test against a fresh temp DB per test."""
    db = tmp_path / "ft_lake.db"
    monkeypatch.setenv("HISTORY_LAKE_DB", str(db))
    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()
    from server.services import forward_test as ft

    importlib.reload(ft)
    return hl, ft, str(db)


def _synth(n=320, seed=0, base=100.0, mu=0.0006, sigma=0.012):
    """Deterministic GBM-like positive daily series [{t,v}, ...]."""
    rng = random.Random(seed)
    t0, day = 1_600_000_000_000, 86_400_000
    v = base
    out = []
    for i in range(n):
        v *= math.exp(rng.gauss(mu, sigma))
        out.append({"t": t0 + i * day, "v": v})
    return out


# ── issue_forecast persists a forecast row ──────────────────────────────────────
def test_issue_forecast_persists_row(lake):
    hl, ft, db = lake
    series = _synth()
    res = ft.issue_forecast(
        "btc", horizon_steps=1, source="crypto", model="short",
        now_ts=series[-1]["t"], series=series, db_path=db,
    )
    assert res["status"] == "ok"
    assert res["id"]
    assert res["point"] is not None
    # the resolve timestamp must equal issued_ts + horizon (one daily step here)
    assert res["resolve_ts"] > res["issued_ts"]

    conn = hl._connect(db)
    try:
        row = dict(conn.execute("SELECT * FROM forecast WHERE id=?", (res["id"],)).fetchone())
    finally:
        conn.close()
    assert row["domain"] == "crypto"
    assert row["target"] == "btc"
    assert row["point"] is not None
    drivers = json.loads(row["drivers_json"])
    assert drivers["asset"] == "btc"
    assert drivers["baseline"] == pytest.approx(series[-1]["v"])
    assert "resolve_ts" in drivers


# ── score_due with a stub resolver writes outcome + skill correctly ─────────────
def test_score_due_writes_outcome_and_skill(lake):
    hl, ft, db = lake
    series = _synth(seed=1)
    res = ft.issue_forecast(
        "eth", horizon_steps=1, source="crypto", model="short",
        now_ts=series[-1]["t"], series=series, db_path=db,
    )
    assert res["status"] == "ok"

    # stub resolver: realized value = point + a known offset (inside the interval)
    offset = 0.5
    actual = res["point"] + offset

    out = ft.score_due(
        now_ts=res["resolve_ts"] + 1, db_path=db,
        resolver=lambda fr: actual,
    )
    assert out["scored"] == 1

    conn = hl._connect(db)
    try:
        oc = dict(conn.execute(
            "SELECT * FROM realized_outcome WHERE forecast_id=?", (res["id"],)
        ).fetchone())
        sk = dict(conn.execute(
            "SELECT * FROM skill_score WHERE forecast_id=?", (res["id"],)
        ).fetchone())
    finally:
        conn.close()

    assert oc["actual_value"] == pytest.approx(actual)
    # abs_err must match |point - actual|
    assert sk["abs_err"] == pytest.approx(abs(res["point"] - actual))
    # in_interval: actual is point+0.5; assert it agrees with the stored bounds
    expected_in = 1 if (res["low"] <= actual <= res["high"]) else 0
    assert sk["in_interval"] == expected_in

    # a second score_due with nothing newly matured is idempotent (scores 0)
    again = ft.score_due(now_ts=res["resolve_ts"] + 1, db_path=db, resolver=lambda fr: actual)
    assert again["scored"] == 0


def test_score_due_in_interval_false_when_outside(lake):
    hl, ft, db = lake
    series = _synth(seed=2)
    res = ft.issue_forecast(
        "xrp", horizon_steps=1, source="crypto", model="short",
        now_ts=series[-1]["t"], series=series, db_path=db,
    )
    # force a realized value far outside the band
    actual = res["high"] + 10.0 * max(1.0, res["high"] - res["low"])
    out = ft.score_due(now_ts=res["resolve_ts"] + 1, db_path=db, resolver=lambda fr: actual)
    assert out["scored"] == 1
    conn = hl._connect(db)
    try:
        sk = dict(conn.execute("SELECT * FROM skill_score WHERE forecast_id=?", (res["id"],)).fetchone())
    finally:
        conn.close()
    assert sk["in_interval"] == 0
    assert sk["abs_err"] == pytest.approx(abs(res["point"] - actual))


# ── resolve_value returns None until the data reaches the target ───────────────
def test_resolve_value_offline(lake):
    _hl, ft, _db = lake
    series = _synth(seed=3, n=50)
    target = series[10]["t"]
    val = ft.resolve_value("btc", target, "crypto", series=series)
    assert val == pytest.approx(series[10]["v"])
    # a target beyond the series end -> None (never fabricated)
    beyond = series[-1]["t"] + 10 * 86_400_000
    assert ft.resolve_value("btc", beyond, "crypto", series=series) is None


# ── the simulate path produces a non-empty scorecard, aggregated by skill_summary
def test_simulate_produces_scorecard(lake):
    hl, ft, db = lake
    series = {"btc": _synth(seed=4, n=300), "eth": _synth(seed=5, n=300)}
    out = ft.simulate_forward_test(
        ["btc", "eth"], horizon_steps=1, n_origins=5, train_window=250,
        model="short", db_path=db, series_by_asset=series, fast=True,
    )
    assert out["issued"] >= 5
    card = out["scorecard"]
    assert card["n_scored"] >= 5
    assert card["mae"] is not None
    assert card["rmse"] is not None
    assert card["coverage"] is not None
    assert card["n_directional"] == card["n_scored"]
    assert 0.0 <= card["directional_accuracy"] <= 1.0

    # skill_summary aggregates the same scored forecasts
    summ = hl.skill_summary("crypto", db_path=db)
    assert summ["n_scored"] == card["n_scored"]
    assert summ["mae"] == pytest.approx(card["mae"])
