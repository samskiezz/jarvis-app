"""SOURCE CONNECTOR FRAMEWORK tests — fully OFFLINE / deterministic.

No real network and no API key. Temp DBs are used (env CONNECTORS_DB +
DATASETS_DB + HISTORY_LAKE_DB) so the real on-disk stores are never touched. The
``inline`` connector kind carries its rows in the config, so registry/run/land/
backfill paths are exercised with zero network. The one ``rest_json`` test
monkeypatches ``connectors._http_get`` so it never touches egress. Run:

    python3 -m pytest server/tests/test_connectors.py -q
"""

import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def cx(tmp_path, monkeypatch):
    """Reload datasets + connectors against fresh temp DBs for each test."""
    monkeypatch.setenv("HISTORY_LAKE_DB", str(tmp_path / "lake.db"))
    monkeypatch.setenv("DATASETS_DB", str(tmp_path / "datasets.db"))
    monkeypatch.setenv("CONNECTORS_DB", str(tmp_path / "connectors.db"))
    from server.services import history_lake as hl

    importlib.reload(hl)
    hl.init_db()
    from server.services import datasets as d

    importlib.reload(d)
    d.init_db()
    from server.services import connectors as c

    importlib.reload(c)
    c.init_db()
    return c, d


_ROWS = [
    {"sym": "BTC", "price": 65000, "ts": 1},
    {"sym": "ETH", "price": 3500, "ts": 2},
    {"sym": "SOL", "price": 150, "ts": 3},
]


# ── register → list → get (#1/#14) ────────────────────────────────────────────────
def test_register_list_get_delete(cx):
    c, _ = cx
    res = c.register_connector("prices", "inline", {"rows": _ROWS})
    assert res["ok"] is True
    cid = res["id"]

    listed = c.list_connectors()
    assert len(listed) == 1 and listed[0]["id"] == cid
    assert listed[0]["kind"] == "inline"

    got = c.get_connector(cid)
    assert got is not None and got["name"] == "prices"
    # fetch by name also works
    assert c.get_connector("prices")["id"] == cid

    # idempotent re-register updates, never duplicates
    c.register_connector("prices", "inline", {"rows": _ROWS[:1]})
    assert len(c.list_connectors()) == 1

    d = c.delete_connector(cid)
    assert d["ok"] is True and d["deleted"] == 1
    assert c.get_connector(cid) is None


def test_register_rejects_unknown_kind(cx):
    c, _ = cx
    res = c.register_connector("bad", "ftp", {})
    assert res["ok"] is False and "unknown kind" in res["error"]


# ── sample-preview WITHOUT landing (#12) ──────────────────────────────────────────
def test_preview_returns_columns_and_rows_without_landing(cx):
    c, d = cx
    c.register_connector("prices", "inline", {"rows": _ROWS})

    prev = c.preview("prices", n=2)
    assert prev["rows"] == _ROWS[:2]
    assert prev["columns"] == ["sym", "price", "ts"]

    # preview lands NOTHING: no dataset, no run recorded.
    assert d.list_datasets() == []
    assert c.list_runs("prices") == []


def test_preview_adhoc_config(cx):
    c, _ = cx
    # preview an unregistered ad-hoc config
    prev = c.preview({"kind": "inline", "config": {"rows": _ROWS}}, n=5)
    assert len(prev["rows"]) == 3
    assert prev["columns"] == ["sym", "price", "ts"]


# ── run lands rows + records a run + registers a dataset (#1) ──────────────────────
def test_run_lands_dataset_and_records_run(cx):
    c, d = cx
    c.register_connector("prices", "inline", {"rows": _ROWS})

    res = c.run_connector("prices", dataset_name="crypto_prices")
    assert res["ok"] is True
    assert res["n_rows"] == 3
    assert res["status"] == "ok"
    assert "dataset_id" in res

    # dataset was registered + row_count landed
    ds = d.get_dataset(res["dataset_id"])
    assert ds is not None
    assert ds["row_count"] == 3
    assert ds["schema"]["columns"] == ["sym", "price", "ts"]

    # a source->dataset lineage edge exists
    graph = d.lineage_graph()
    edges = [e for e in graph["edges"] if e["dst"] == res["dataset_id"]]
    assert any(e["kind"] == "source->dataset" for e in edges)

    # run-history is queryable
    runs = c.list_runs("prices")
    assert len(runs) == 1
    assert runs[0]["n_rows"] == 3
    assert runs[0]["status"] == "ok"
    assert runs[0]["dataset_id"] == res["dataset_id"]


def test_run_without_dataset_still_audits(cx):
    c, d = cx
    c.register_connector("prices", "inline", {"rows": _ROWS})
    res = c.run_connector("prices")  # no dataset_name
    assert res["ok"] is True and res["n_rows"] == 3
    assert "dataset_id" not in res
    assert d.list_datasets() == []          # nothing landed
    assert len(c.list_runs("prices")) == 1   # but the run is audited


# ── backfill / replay honesty (#10) ────────────────────────────────────────────────
def test_backfill_without_window_is_honest(cx):
    c, _ = cx
    c.register_connector("prices", "inline", {"rows": _ROWS})
    res = c.backfill("prices", since="2024-01-01", until="2024-02-01")
    assert res["ok"] is False
    assert res["note"] == "connector has no time window"


def test_backfill_with_window_param_replays(cx, monkeypatch):
    c, _ = cx
    captured = {}

    def fake_http_get(url, timeout=12.0):
        captured["url"] = url
        return json.dumps({"data": _ROWS}).encode("utf-8")

    monkeypatch.setattr(c, "_http_get", fake_http_get)

    c.register_connector("api", "rest_json", {
        "url": "https://example.test/feed",
        "path": "data",
        "window_param": {"since": "start", "until": "end"},
    })
    res = c.backfill("api", since="2024-01-01", until="2024-02-01",
                     dataset_name="api_ds")
    assert res["ok"] is True
    assert res["n_rows"] == 3
    assert res.get("replay") is True
    # window params were injected into the request URL
    assert "start=2024-01-01" in captured["url"]
    assert "end=2024-02-01" in captured["url"]

    runs = c.list_runs("api")
    assert runs[0]["mode"] == "replay"


# ── rest_json with monkeypatched fetch (no network) ────────────────────────────────
def test_rest_json_sample_and_run_offline_honest(cx, monkeypatch):
    c, _ = cx
    c.register_connector("api", "rest_json", {
        "url": "https://example.test/feed", "path": "data.items",
    })

    # offline: _http_get returns None → honest empty, NO fabricated data
    monkeypatch.setattr(c, "_http_get", lambda url, timeout=12.0: None)
    prev = c.preview("api")
    assert prev["rows"] == []
    assert prev["note"] == "source unreachable"

    run = c.run_connector("api", dataset_name="api_ds")
    assert run["n_rows"] == 0
    assert run["status"] == "unreachable"

    # now "reachable": returns real parsed rows at the dotted path
    payload = {"data": {"items": [{"a": 1}, {"a": 2}]}}
    monkeypatch.setattr(
        c, "_http_get",
        lambda url, timeout=12.0: json.dumps(payload).encode("utf-8"),
    )
    prev2 = c.preview("api", n=5)
    assert prev2["rows"] == [{"a": 1}, {"a": 2}]
    assert prev2["columns"] == ["a"]


# ── csv + rss parsing (offline via monkeypatched fetch) ────────────────────────────
def test_csv_url_parses(cx, monkeypatch):
    c, _ = cx
    c.register_connector("sheet", "csv_url", {"url": "https://x.test/d.csv"})
    csv_bytes = b"sym,price\nBTC,65000\nETH,3500\n"
    monkeypatch.setattr(c, "_http_get", lambda url, timeout=12.0: csv_bytes)
    prev = c.preview("sheet")
    assert prev["columns"] == ["sym", "price"]
    assert prev["rows"][0]["sym"] == "BTC"
    assert prev["rows"][1]["price"] == "3500"


def test_rss_parses(cx, monkeypatch):
    c, _ = cx
    c.register_connector("news", "rss", {"url": "https://x.test/rss"})
    rss = (
        b"<?xml version='1.0'?><rss><channel>"
        b"<item><title>One</title><link>http://a</link></item>"
        b"<item><title>Two</title><link>http://b</link></item>"
        b"</channel></rss>"
    )
    monkeypatch.setattr(c, "_http_get", lambda url, timeout=12.0: rss)
    prev = c.preview("news")
    assert len(prev["rows"]) == 2
    assert prev["rows"][0]["title"] == "One"
    assert "title" in prev["columns"]


# ── unknown connector degrades honestly ────────────────────────────────────────────
def test_unknown_connector_paths(cx):
    c, _ = cx
    assert c.preview("nope")["note"] == "unknown connector"
    assert c.run_connector("nope")["ok"] is False
    assert c.backfill("nope")["ok"] is False
