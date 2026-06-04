"""SEARCH-PLUS tests — fully OFFLINE / deterministic.

Exercises the saved-searches + faceted-filters + search-in-graph composition
layer (P4 #33/#35/#37) against fresh temp DBs (env ONTOLOGY_DB / SEARCH_DB) so
the real on-disk stores are never touched. No network, no API key. Run:

    python3 -m pytest server/tests/test_search_plus.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def env(tmp_path, monkeypatch):
    """Reload ontology_store + search + search_plus against fresh temp DBs and
    seed a tiny, fully-known graph so every assertion is deterministic."""
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("SEARCH_DB", str(tmp_path / "sp.db"))

    from server.services import ontology_store as store
    importlib.reload(store)
    store.init_db()

    # The module import auto-seeds the static ontology into the (empty) temp DB.
    # Wipe it so we work against a fully-known, minimal graph.
    for o in store.query_objects():
        store.delete_object(o["id"])

    # Seed a known set of objects: 2 people, 1 org, 1 client.
    store.upsert_object({"id": "alice", "type": "person", "label": "Alice Anderson",
                         "mark": "PUBLIC", "props": {"role": "ceo"}})
    store.upsert_object({"id": "bob", "type": "person", "label": "Bob Brown",
                         "mark": "INTERNAL", "props": {"role": "cto"}})
    store.upsert_object({"id": "acme", "type": "org", "label": "Acme Corp",
                         "mark": "PUBLIC", "props": {"sector": "tech"}})
    store.upsert_object({"id": "client1", "type": "client", "label": "First Client",
                         "mark": "PUBLIC", "props": {}})
    # Links: alice—acme, acme—bob (so alice and bob are 2 hops apart via acme).
    store.upsert_link("alice", "acme", "WORKS_AT", strength=1.0)
    store.upsert_link("acme", "bob", "EMPLOYS", strength=1.0)

    # graph + search read the live store; reload them so they bind to this DB.
    from server.services import graph as graph_svc
    importlib.reload(graph_svc)
    from server.services import search as search_svc
    importlib.reload(search_svc)
    search_svc.reindex()  # rebuild the keyword index over the seeded objects

    from server.services import search_plus as sp
    importlib.reload(sp)
    sp.init_db()
    return sp, store


# ── facets (#33) ──────────────────────────────────────────────────────────────
def test_facets_type_and_mark_counts(env):
    sp, _ = env
    f = sp.facets()
    assert f["total"] == 4
    assert f["type"]["person"] == 2
    assert f["type"]["org"] == 1
    assert f["type"]["client"] == 1
    assert f["mark"]["PUBLIC"] == 3
    assert f["mark"]["INTERNAL"] == 1
    # prop histogram for a common key
    assert f["props"]["role"]["ceo"] == 1
    assert f["props"]["role"]["cto"] == 1


def test_faceted_search_filters_by_type(env):
    sp, _ = env
    res = sp.faceted_search({"type": "person"})
    assert res["count"] == 2
    assert {r["id"] for r in res["results"]} == {"alice", "bob"}
    # facets are recomputed over the matched set
    assert res["facets"]["type"] == {"person": 2}


def test_faceted_search_mark_and_props(env):
    sp, _ = env
    res = sp.faceted_search({"type": "person", "props": {"role": "ceo"}})
    assert res["count"] == 1
    assert res["results"][0]["id"] == "alice"


# ── saved searches + alerting (#35) ──────────────────────────────────────────
def test_save_and_run_saved(env):
    sp, _ = env
    saved = sp.save_search("people", {"type": "person"})
    assert saved is not None and saved["id"]
    listed = sp.list_searches()
    assert any(s["id"] == saved["id"] for s in listed)

    run = sp.run_saved(saved["id"])
    assert run["count"] == 2
    assert {r["id"] for r in run["results"]} == {"alice", "bob"}


def test_delete_search(env):
    sp, _ = env
    saved = sp.save_search("tmp", {"type": "org"})
    assert sp.delete_search(saved["id"]) is True
    assert sp.delete_search(saved["id"]) is False  # already gone
    assert not any(s["id"] == saved["id"] for s in sp.list_searches())


def test_check_new_matches_alerting(env):
    sp, store = env
    saved = sp.save_search("people", {"type": "person"})
    sid = saved["id"]

    # First check: every current match is "new".
    first = sp.check_new_matches(sid)
    assert set(first["new"]) == {"alice", "bob"}

    # Second identical check: nothing new.
    second = sp.check_new_matches(sid)
    assert second["new"] == []

    # Add a new person; only the newcomer should be reported.
    store.upsert_object({"id": "carol", "type": "person", "label": "Carol Clark",
                         "mark": "PUBLIC", "props": {"role": "cfo"}})
    third = sp.check_new_matches(sid)
    assert third["new"] == ["carol"]
    assert third["total"] == 3


# ── search-in-graph (#37) ──────────────────────────────────────────────────────
def test_find_paths_between_linked_objects(env):
    sp, _ = env
    res = sp.find_paths("alice", "bob", max_depth=4)
    # shortest path goes alice -> acme -> bob
    assert res["shortest"] == ["alice", "acme", "bob"]
    assert res["edges"]  # path edges present
    assert ["alice", "acme", "bob"] in res["paths"]


def test_pattern_search_expands_from_seed(env):
    sp, _ = env
    res = sp.pattern_search("acme", depth=1)
    node_ids = {n["id"] for n in res["nodes"]}
    # 1-hop neighborhood of acme includes alice and bob (and acme itself)
    assert {"acme", "alice", "bob"} <= node_ids
    assert res["edges"]


def test_pattern_search_relation_filter(env):
    sp, _ = env
    res = sp.pattern_search("acme", relation="WORKS_AT", depth=1)
    rels = {str(e.get("relation")) for e in res["edges"]}
    assert rels == {"WORKS_AT"}
    node_ids = {n["id"] for n in res["nodes"]}
    assert {"acme", "alice"} <= node_ids
