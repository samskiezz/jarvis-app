"""Saved investigations tests (P5 #43) — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used (env INVESTIGATIONS_DB for the case
store, ONTOLOGY_DB for the graph the subgraph resolves against). Run:

    python3 -m pytest server/tests/test_investigations.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def inv(tmp_path, monkeypatch):
    """Reload the ontology store (seeded) + graph + investigations against fresh
    temp DBs so get_investigation can resolve a real subgraph."""
    onto_db = tmp_path / "test_ontology_inv.db"
    cases_db = tmp_path / "test_investigations.db"
    monkeypatch.setenv("ONTOLOGY_DB", str(onto_db))
    monkeypatch.setenv("INVESTIGATIONS_DB", str(cases_db))

    from server.services import ontology_store as store
    importlib.reload(store)
    store.init_db()
    # seed objects + links so subgraph resolution has something to return.
    store.upsert_object({"id": "sam", "type": "person", "label": "Sam"})
    store.upsert_object({"id": "psg", "type": "org", "label": "PSG"})
    store.upsert_object({"id": "music", "type": "creative", "label": "Music"})
    store.upsert_link("sam", "psg", "OWNS", strength=2)
    store.upsert_link("sam", "music", "CREATES", strength=1)

    from server.services import graph as graph_mod
    importlib.reload(graph_mod)
    from server.services import investigations as inv_mod
    importlib.reload(inv_mod)
    inv_mod.init_db()
    return inv_mod


def test_create_then_get_returns_subgraph_and_seeds(inv):
    case = inv.create_investigation("Sam case", owner="sam", seeds=["sam"], notes="watch")
    assert case is not None and case["id"]
    assert case["seeds"] == ["sam"]
    assert case["notes"] == "watch"

    got = inv.get_investigation(case["id"])
    assert got is not None
    assert got["seeds"] == ["sam"]
    # resolved live subgraph via graph.subgraph over the seeds (depth 1).
    assert "subgraph" in got
    node_ids = {n["id"] for n in got["subgraph"]["nodes"]}
    assert "sam" in node_ids
    assert "psg" in node_ids  # 1-hop neighbor
    assert got["subgraph"]["n_nodes"] >= 2
    assert got["subgraph"]["n_edges"] >= 1


def test_create_accepts_csv_seeds(inv):
    case = inv.create_investigation("csv", seeds="sam, psg")
    assert case["seeds"] == ["sam", "psg"]


def test_list_investigations(inv):
    inv.create_investigation("one", seeds=["sam"])
    inv.create_investigation("two", seeds=["psg"])
    items = inv.list_investigations()
    assert len(items) == 2
    names = {i["name"] for i in items}
    assert names == {"one", "two"}


def test_add_annotation_persists_and_appears_in_get(inv):
    case = inv.create_investigation("annot", seeds=["sam"])
    ann = inv.add_annotation(case["id"], "node:sam", "person of interest", actor="analyst")
    assert ann is not None
    assert ann["target"] == "node:sam"
    assert ann["text"] == "person of interest"
    assert ann["actor"] == "analyst"

    got = inv.get_investigation(case["id"])
    assert len(got["annotations"]) == 1
    assert got["annotations"][0]["text"] == "person of interest"


def test_add_annotation_unknown_case_returns_none(inv):
    assert inv.add_annotation("nope", "case", "x") is None


def test_share_and_shares_roundtrip(inv):
    case = inv.create_investigation("shared", seeds=["sam"])
    sh = inv.share(case["id"], "alice", "editor")
    assert sh is not None
    assert sh["principal"] == "alice"
    assert sh["role"] == "editor"

    rows = inv.shares(case["id"])
    assert len(rows) == 1
    assert rows[0]["principal"] == "alice"

    # also surfaced via get_investigation.
    got = inv.get_investigation(case["id"])
    assert len(got["shares"]) == 1


def test_share_idempotent_updates_role(inv):
    case = inv.create_investigation("s", seeds=["sam"])
    inv.share(case["id"], "bob", "viewer")
    inv.share(case["id"], "bob", "owner")
    rows = inv.shares(case["id"])
    assert len(rows) == 1
    assert rows[0]["role"] == "owner"


def test_share_unknown_case_returns_none(inv):
    assert inv.share("nope", "alice", "viewer") is None


def test_delete_investigation_removes_children(inv):
    case = inv.create_investigation("del", seeds=["sam"])
    inv.add_annotation(case["id"], "case", "note")
    inv.share(case["id"], "alice", "viewer")
    assert inv.delete_investigation(case["id"]) is True
    assert inv.get_investigation(case["id"]) is None
    assert inv.annotations(case["id"]) == []
    assert inv.shares(case["id"]) == []


def test_delete_unknown_returns_false(inv):
    assert inv.delete_investigation("nope") is False


def test_get_unknown_returns_none(inv):
    assert inv.get_investigation("nope") is None
