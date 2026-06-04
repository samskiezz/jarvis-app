"""DATA-INTEGRATION DEPTH tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used (env DATASETS_DB + HISTORY_LAKE_DB)
so the real on-disk stores are never touched. Observations are injected directly
via the History Lake write helpers. Run:

    python3 -m pytest server/tests/test_datasets.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def cat(tmp_path, monkeypatch):
    """Reload history_lake + datasets against fresh temp DBs for each test."""
    monkeypatch.setenv("HISTORY_LAKE_DB", str(tmp_path / "lake.db"))
    monkeypatch.setenv("DATASETS_DB", str(tmp_path / "datasets.db"))
    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()
    from server.services import datasets as d

    importlib.reload(d)
    d.init_db()
    return d, hl


def _inject(hl, source, entity, metric, points, *, unit=None, freq="1d"):
    sid = hl.upsert_series(source, entity, metric, unit=unit, freq=freq)
    hl.write_observations(sid, points)
    return sid


# ── register -> list -> get (#3) ──────────────────────────────────────────────────
def test_register_list_get(cat):
    d, _ = cat
    res = d.register_dataset("sales", owner="sam", kind="table",
                             schema={"columns": ["amount"], "unit": "USD"})
    assert res["ok"]
    did = res["id"]

    items = d.list_datasets()
    assert len(items) == 1
    assert items[0]["name"] == "sales"
    assert items[0]["owner"] == "sam"
    assert items[0]["kind"] == "table"

    ds = d.get_dataset(did)
    assert ds is not None
    assert ds["id"] == did
    assert ds["schema"]["unit"] == "USD"
    # initial version 1 present in the schema registry.
    assert ds["current_version"] == 1
    assert len(ds["versions"]) == 1


def test_register_idempotent_no_duplicate(cat):
    d, _ = cat
    a = d.register_dataset("x", owner="o1")
    b = d.register_dataset("x", owner="o2", schema={"k": 1})
    assert a["id"] == b["id"]  # stable id keyed on name
    items = d.list_datasets()
    assert len(items) == 1
    assert items[0]["owner"] == "o2"  # upsert refreshed owner
    # still only one version (re-register does not bump).
    assert d.get_dataset(a["id"])["current_version"] == 1


def test_get_unknown_returns_none(cat):
    d, _ = cat
    assert d.get_dataset("nope") is None


# ── schema registry / versioning (#8) ────────────────────────────────────────────
def test_bump_version_increments_and_keeps_history(cat):
    d, _ = cat
    did = d.register_dataset("s", schema={"v": "a"})["id"]

    r2 = d.bump_version(did, {"v": "b"}, note="add col b")
    assert r2["ok"] and r2["version"] == 2
    r3 = d.bump_version(did, {"v": "c"}, note="add col c")
    assert r3["ok"] and r3["version"] == 3

    ds = d.get_dataset(did)
    assert ds["current_version"] == 3
    # live schema reflects the newest version.
    assert ds["schema"]["v"] == "c"
    # full history retained (3 versions), newest first.
    versions = {v["version"]: v["schema"]["v"] for v in ds["versions"]}
    assert versions == {1: "a", 2: "b", 3: "c"}


def test_bump_version_unknown_graceful(cat):
    d, _ = cat
    res = d.bump_version("ghost", {"x": 1})
    assert res["ok"] is False


# ── transforms + lineage as a queryable graph (#4, #5) ───────────────────────────
def test_transform_and_lineage_graph(cat):
    d, _ = cat
    raw = d.register_dataset("raw", kind="table")["id"]
    clean = d.register_dataset("clean", kind="derived")["id"]

    res = d.record_transform(
        "clean_sales", inputs=[raw], output_dataset=clean,
        language="sql", code="SELECT * FROM raw WHERE amount > 0",
    )
    assert res["ok"]
    tid = res["id"]

    # The transform is recorded.
    tfs = d.list_transforms()
    assert any(t["id"] == tid and t["output_dataset"] == clean for t in tfs)

    # Lineage graph is queryable: transform->dataset and raw->clean edges exist.
    g = d.lineage_graph()
    edges = {(e["src"], e["dst"], e["kind"]) for e in g["edges"]}
    assert (f"transform:{tid}", clean, "transform->dataset") in edges
    assert (raw, clean, "dataset->dataset") in edges

    # Nodes are typed and include both datasets + the transform node.
    types = {n["id"]: n["type"] for n in g["nodes"]}
    assert types[raw] == "dataset"
    assert types[clean] == "dataset"
    assert types[f"transform:{tid}"] == "transform"


def test_add_lineage_idempotent(cat):
    d, _ = cat
    a = d.register_dataset("a")["id"]
    b = d.register_dataset("b")["id"]
    d.add_lineage(a, b, "dataset->dataset")
    d.add_lineage(a, b, "dataset->dataset")  # duplicate
    g = d.lineage_graph()
    matches = [e for e in g["edges"] if e["src"] == a and e["dst"] == b]
    assert len(matches) == 1


# ── data-health monitors (#7) ─────────────────────────────────────────────────────
def test_health_backed_by_series_returns_checks(cat):
    d, hl = cat
    import time

    now = int(time.time() * 1000)
    # 20 fresh daily points with a stable mean (no drift).
    pts = [{"t": now - (19 - i) * 86_400_000, "v": 100.0 + (i % 2)} for i in range(20)]
    sid = _inject(hl, "coingecko", "bitcoin", "close_price", pts, unit="USD")
    did = d.register_dataset("btc", kind="series", series_id=sid)["id"]

    h = d.health(did)
    assert h["found"] is True
    assert h["backed_by_series"] is True
    names = {c["name"] for c in h["checks"]}
    assert {"row_count", "null_rate", "staleness", "drift"} <= names
    assert h["status"] in ("ok", "warn", "fail")
    rc = next(c for c in h["checks"] if c["name"] == "row_count")
    assert rc["value"] == 20


def test_health_no_series_is_honest(cat):
    d, _ = cat
    did = d.register_dataset("manual", kind="table")["id"]
    h = d.health(did)
    assert h["found"] is True
    assert h["backed_by_series"] is False
    names = {c["name"] for c in h["checks"]}
    # Honest fallback: only freshness + row_count, with an explanatory note.
    assert names == {"row_count", "freshness"}
    assert "note" in h


def test_health_unknown_dataset(cat):
    d, _ = cat
    h = d.health("ghost")
    assert h["found"] is False
    assert h["status"] == "unknown"


def test_health_drift_warns_on_mean_shift(cat):
    d, hl = cat
    import time

    now = int(time.time() * 1000)
    # First window ~10, last window ~100 -> large drift (>50%).
    pts = []
    for i in range(20):
        v = 10.0 if i < 10 else 100.0
        pts.append({"t": now - (19 - i) * 86_400_000, "v": v})
    sid = _inject(hl, "fx", "x", "v", pts, freq="1d")
    did = d.register_dataset("drifty", kind="series", series_id=sid)["id"]

    h = d.health(did)
    drift = next(c for c in h["checks"] if c["name"] == "drift")
    assert drift["status"] == "warn"


# ── seed_from_history_lake idempotent ────────────────────────────────────────────
def test_seed_from_history_lake_idempotent(cat):
    d, hl = cat
    _inject(hl, "coingecko", "bitcoin", "close_price",
            [{"t": 1_700_000_000_000, "v": 1.0}], unit="USD")
    _inject(hl, "fx", "AUDUSD", "rate",
            [{"t": 1_700_000_000_000, "v": 0.66}], unit="USD")

    r1 = d.seed_from_history_lake()
    assert r1["ok"]
    assert r1["registered"] == 2
    assert len(d.list_datasets()) == 2

    # Re-running does not duplicate datasets.
    r2 = d.seed_from_history_lake()
    assert r2["ok"]
    assert len(d.list_datasets()) == 2

    # Seeded datasets are bound to a series and yield a real health report.
    ds0 = d.list_datasets()[0]
    h = d.health(ds0["id"])
    assert h["backed_by_series"] is True

    # source->dataset lineage edges recorded by the seed.
    g = d.lineage_graph()
    assert any(e["kind"] == "source->dataset" for e in g["edges"])
