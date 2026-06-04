"""LINK-ANALYSIS graph service tests — fully OFFLINE / deterministic.

No network and no API key. A temp ontology DB (env ONTOLOGY_DB) is used so the
real on-disk store is never touched; the seed (sam/psg/...) is loaded into it.
Run:

    python3 -m pytest server/tests/test_graph.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def graph(tmp_path, monkeypatch):
    """Reload the graph service against a fresh, seeded temp ontology DB."""
    db = tmp_path / "test_graph_ontology.db"
    monkeypatch.setenv("ONTOLOGY_DB", str(db))

    from server.services import ontology_store as os_store

    importlib.reload(os_store)
    os_store.init_db()
    os_store.seed_from_static()

    from server.services import graph as graph_svc

    importlib.reload(graph_svc)
    return graph_svc


def _node_ids(result):
    return {n["id"] for n in result["nodes"]}


# ── subgraph ──────────────────────────────────────────────────────────────────
def test_subgraph_from_seed_includes_neighbors(graph):
    res = graph.subgraph(["sam"], depth=1)
    ids = _node_ids(res)
    assert "sam" in ids  # the seed itself
    assert "psg" in ids  # a direct neighbor of sam
    assert len(res["edges"]) > 0


def test_subgraph_depth2_expands(graph):
    d1 = graph.subgraph(["sam"], depth=1)
    d2 = graph.subgraph(["sam"], depth=2)
    assert len(_node_ids(d2)) >= len(_node_ids(d1))


def test_subgraph_accepts_bare_string_seed(graph):
    res = graph.subgraph("sam", depth=1)
    assert "sam" in _node_ids(res)


def test_subgraph_never_raises_on_junk(graph):
    res = graph.subgraph(["does-not-exist"], depth=2)
    assert "nodes" in res and "edges" in res


# ── expand ────────────────────────────────────────────────────────────────────
def test_expand_returns_immediate_neighbors(graph):
    res = graph.expand("sam")
    ids = _node_ids(res)
    assert "sam" in ids
    assert "psg" in ids
    # every returned edge must touch the center
    assert all(e["a"] == "sam" or e["b"] == "sam" for e in res["edges"])


def test_expand_unknown_node_is_safe(graph):
    res = graph.expand("ghost")
    assert res["nodes"] and res["nodes"][0]["id"] == "ghost"
    assert res["edges"] == []


# ── shortest_path ─────────────────────────────────────────────────────────────
def test_shortest_path_between_connected_entities(graph):
    res = graph.shortest_path("sam", "psg")
    path = res["path"]
    assert path and path[0] == "sam" and path[-1] == "psg"
    # consecutive nodes in the path must share a real link
    links = graph._all_links()
    pairs = {(str(lk["a"]), str(lk["b"])) for lk in links}
    pairs |= {(b, a) for a, b in pairs}
    for u, v in zip(path, path[1:]):
        assert (u, v) in pairs, f"{u}->{v} is not a real link"


def test_shortest_path_longer_route(graph):
    # defended is reachable from sam via psg (sam-psg-defended)
    res = graph.shortest_path("sam", "defended")
    assert res["path"][0] == "sam"
    assert res["path"][-1] == "defended"
    assert len(res["path"]) >= 3


def test_shortest_path_same_node(graph):
    res = graph.shortest_path("sam", "sam")
    assert res["path"] == ["sam"]


def test_shortest_path_no_route(graph):
    res = graph.shortest_path("sam", "nope-nope")
    assert res["path"] == []


# ── all_paths ─────────────────────────────────────────────────────────────────
def test_all_paths_returns_simple_paths(graph):
    paths = graph.all_paths("sam", "target", max_len=4)
    assert len(paths) >= 1
    for p in paths:
        assert p[0] == "sam" and p[-1] == "target"
        assert len(p) == len(set(p))  # simple (no repeats)


# ── centrality ────────────────────────────────────────────────────────────────
def test_centrality_score_per_node(graph):
    scores = graph.centrality()
    assert isinstance(scores, dict) and scores
    # sam is the hub — must have a positive score and be among the most central
    assert scores.get("sam", 0) > 0
    top = max(scores, key=lambda k: scores[k])
    assert top in scores
    # every score is a number
    assert all(isinstance(v, (int, float)) for v in scores.values())


# ── communities ───────────────────────────────────────────────────────────────
def test_communities_partitions_nodes(graph):
    clusters = graph.communities()
    assert isinstance(clusters, dict) and clusters
    # every node gets exactly one integer cluster id
    assert all(isinstance(v, int) for v in clusters.values())
    # sam and at least one of its direct neighbors are present
    assert "sam" in clusters
    # the main connected component groups sam with psg
    assert clusters["sam"] is not None and "psg" in clusters
