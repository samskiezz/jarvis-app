"""DATA-INTEGRATION (pipelines) tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used (env HISTORY_LAKE_DB + CATALOG_DB)
so the real on-disk stores are never touched. Observations are injected directly
via the History Lake write helpers — run_connector's network paths are NOT
exercised here. Run:

    python3 -m pytest server/tests/test_pipelines.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def pipes(tmp_path, monkeypatch):
    """Reload history_lake + pipelines against fresh temp DBs for each test."""
    monkeypatch.setenv("HISTORY_LAKE_DB", str(tmp_path / "lake.db"))
    monkeypatch.setenv("CATALOG_DB", str(tmp_path / "catalog.db"))
    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()
    from server.services import pipelines as pl

    importlib.reload(pl)
    pl.init_db()
    return pl, hl


def _inject(hl, source, entity, metric, points, *, unit=None, freq="1d"):
    sid = hl.upsert_series(source, entity, metric, unit=unit, freq=freq)
    hl.write_observations(sid, points)
    return sid


# ── connectors menu ──────────────────────────────────────────────────────────────
def test_connectors_menu(pipes):
    pl, _ = pipes
    names = {c["connector"] for c in pl.connectors()}
    for expected in ("coingecko", "usgs", "fx", "cryptocompare", "yahoo", "csv", "http-json"):
        assert expected in names
    # Every connector advertises a params schema dict.
    for c in pl.connectors():
        assert isinstance(c["params"], dict)


# ── register + list dataset ──────────────────────────────────────────────────────
def test_register_and_list_dataset(pipes):
    pl, hl = pipes
    sid = _inject(hl, "coingecko", "bitcoin", "close_price",
                  [{"t": 1_700_000_000_000, "v": 100.0}], unit="USD")
    res = pl.register_dataset("btc", source="coingecko",
                              schema={"unit": "USD"}, owner="sam", series_id=sid)
    assert res["ok"]
    items = pl.list_datasets()
    assert len(items) == 1
    ds = items[0]
    assert ds["name"] == "btc"
    assert ds["source"] == "coingecko"
    assert ds["owner"] == "sam"
    assert ds["series_id"] == sid
    assert ds["schema"]["unit"] == "USD"


def test_register_is_idempotent_upsert(pipes):
    pl, _ = pipes
    pl.register_dataset("d", source="x")
    pl.register_dataset("d", source="y", owner="o")
    items = pl.list_datasets()
    assert len(items) == 1
    assert items[0]["source"] == "y"
    assert items[0]["owner"] == "o"


# ── dataset_health computes counts/freshness from injected observations ──────────
def test_dataset_health_counts_and_freshness(pipes):
    pl, hl = pipes
    base = 1_700_000_000_000
    pts = [{"t": base + i * 86_400_000, "v": float(i)} for i in range(5)]
    sid = _inject(hl, "fx", "AUDUSD", "rate", pts, unit="USD")
    pl.register_dataset("audusd", source="fx", series_id=sid)

    health = pl.dataset_health("audusd")
    assert health["found"] is True
    assert health["rows"] == 5
    assert health["first_ts"] == base
    assert health["last_ts"] == base + 4 * 86_400_000
    assert health["null_rate"] == 0.0
    # freshness is "now - last_ts" and non-negative.
    assert health["freshness_ms"] is not None and health["freshness_ms"] >= 0


def test_dataset_health_unknown(pipes):
    pl, _ = pipes
    health = pl.dataset_health("nope")
    assert health["found"] is False
    assert health["rows"] == 0


# ── transform produces derived series + records lineage ──────────────────────────
def test_transform_rolling_mean_and_lineage(pipes):
    pl, hl = pipes
    base = 1_700_000_000_000
    vals = [10.0, 20.0, 30.0, 40.0]
    pts = [{"t": base + i * 1000, "v": v} for i, v in enumerate(vals)]
    sid = _inject(hl, "coingecko", "ethereum", "close_price", pts, unit="USD")
    pl.register_dataset("eth", source="coingecko", series_id=sid)

    res = pl.transform("eth", {"op": "rolling_mean", "window": 2})
    assert res["ok"]
    assert res["dataset"] == "eth::rolling_mean"
    assert res["n_rows"] == 4

    # Verify the derived series values: trailing window of 2.
    derived = hl.read_series(res["series_id"])
    got = [round(p["v"], 4) for p in derived]
    assert got == [10.0, 15.0, 25.0, 35.0]

    # The derived dataset is now in the catalog.
    names = {d["name"] for d in pl.list_datasets()}
    assert "eth::rolling_mean" in names

    # Lineage: input "eth" -> output "eth::rolling_mean" via rolling_mean.
    graph = pl.lineage("eth::rolling_mean")
    assert any(
        e["input"] == "eth" and e["output"] == "eth::rolling_mean"
        and e["op"] == "rolling_mean"
        for e in graph["edges"]
    )
    assert "eth" in graph["nodes"] and "eth::rolling_mean" in graph["nodes"]


def test_transform_pct_change(pipes):
    pl, hl = pipes
    base = 1_700_000_000_000
    vals = [100.0, 110.0, 99.0]
    pts = [{"t": base + i * 1000, "v": v} for i, v in enumerate(vals)]
    sid = _inject(hl, "yahoo", "AAPL", "close_price", pts, unit="USD")
    pl.register_dataset("aapl", source="yahoo", series_id=sid)

    res = pl.transform("aapl", {"op": "pct_change"})
    assert res["ok"]
    derived = hl.read_series(res["series_id"])
    got = [round(p["v"], 6) for p in derived]
    # (110-100)/100 = 0.1 ; (99-110)/110 = -0.1
    assert got == [0.1, -0.1]

    # Lineage edge recorded input "aapl" -> output.
    graph = pl.lineage("aapl")
    assert any(e["input"] == "aapl" and e["op"] == "pct_change" for e in graph["edges"])


def test_transform_resample_mean(pipes):
    pl, hl = pipes
    # Two points per 1000ms bucket -> averaged.
    pts = [
        {"t": 0, "v": 2.0}, {"t": 400, "v": 4.0},
        {"t": 1000, "v": 10.0}, {"t": 1500, "v": 20.0},
    ]
    sid = _inject(hl, "csv", "custom", "value", pts, freq="irregular")
    pl.register_dataset("raw", source="csv", series_id=sid)

    res = pl.transform("raw", {"op": "resample", "period_ms": 1000})
    assert res["ok"]
    derived = hl.read_series(res["series_id"])
    assert [(p["t"], p["v"]) for p in derived] == [(0, 3.0), (1000, 15.0)]


def test_transform_unknown_dataset_graceful(pipes):
    pl, _ = pipes
    res = pl.transform("ghost", {"op": "pct_change"})
    assert res["ok"] is False
    assert "unknown dataset" in res["error"]


def test_transform_unknown_op_graceful(pipes):
    pl, hl = pipes
    sid = _inject(hl, "fx", "x", "v", [{"t": 0, "v": 1.0}], freq="irregular")
    pl.register_dataset("d", source="fx", series_id=sid)
    res = pl.transform("d", {"op": "nope"})
    assert res["ok"] is False


def test_lineage_empty_for_leaf(pipes):
    pl, hl = pipes
    sid = _inject(hl, "fx", "y", "v", [{"t": 0, "v": 1.0}], freq="irregular")
    pl.register_dataset("leaf", source="fx", series_id=sid)
    graph = pl.lineage("leaf")
    assert graph["edges"] == []
    assert graph["nodes"] == ["leaf"]


def test_run_connector_unknown_is_graceful(pipes):
    pl, _ = pipes
    res = pl.run_connector("does-not-exist", {})
    assert res["status"] == "error"
    assert res["n_rows"] == 0
