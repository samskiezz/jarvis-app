"""Semantic search + RAG tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used (env VECTOR_DB + ONTOLOGY_DB) so
the real on-disk stores are never touched. Fast (<10s). Run:

    python3 -m pytest server/tests/test_embeddings.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np  # noqa: E402
import pytest  # noqa: E402


@pytest.fixture()
def sem(tmp_path, monkeypatch):
    """Reload embeddings + rag + ontology_store against fresh temp DBs."""
    monkeypatch.setenv("VECTOR_DB", str(tmp_path / "vectors.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ontology.db"))

    from server.services import ontology_store as os_store
    from server.services import embeddings as emb
    from server.services import rag as rag_mod

    importlib.reload(os_store)
    importlib.reload(emb)
    importlib.reload(rag_mod)

    os_store.init_db()
    emb.init_db()
    return emb, rag_mod, os_store


# ── vectorizer ──────────────────────────────────────────────────────────────────────
def test_embed_shape_and_normalized(sem):
    emb, _, _ = sem
    v = emb.embed("the quick brown fox")
    assert isinstance(v, np.ndarray)
    assert v.shape == (emb.DIM,)
    assert v.dtype == np.float32
    # L2-normalized
    assert abs(float(np.linalg.norm(v)) - 1.0) < 1e-5


def test_embed_deterministic(sem):
    emb, _, _ = sem
    a = emb.embed("hello world foo bar")
    b = emb.embed("hello world foo bar")
    assert np.array_equal(a, b)


def test_embed_empty_is_zero(sem):
    emb, _, _ = sem
    v = emb.embed("")
    assert float(np.linalg.norm(v)) == 0.0


def test_cosine_self_is_one(sem):
    emb, _, _ = sem
    v = emb.embed("solar energy investment portfolio")
    assert abs(emb.cosine(v, v) - 1.0) < 1e-5


def test_cosine_unrelated_lower_than_self(sem):
    emb, _, _ = sem
    a = emb.embed("solar energy investment")
    b = emb.embed("zebra mountain glacier")
    assert emb.cosine(a, b) < emb.cosine(a, a)


# ── index + search ────────────────────────────────────────────────────────────────
def test_search_ranks_relevant_doc_first(sem):
    emb, _, _ = sem
    assert emb.index_doc("d1", "note", "solar panel energy investment in Dubai")
    assert emb.index_doc("d2", "note", "the cat sat on a warm mat by the window")
    assert emb.index_doc("d3", "note", "quarterly revenue and profit margins report")

    hits = emb.search("solar energy investment", k=3)
    assert hits, "expected at least one hit"
    assert hits[0]["id"] == "d1"
    # scores monotonically non-increasing
    scores = [h["score"] for h in hits]
    assert scores == sorted(scores, reverse=True)
    # result shape
    for key in ("id", "kind", "score", "text", "meta"):
        assert key in hits[0]


def test_search_empty_store_returns_empty(sem):
    emb, _, _ = sem
    assert emb.search("anything", k=5) == []


def test_search_blank_query_returns_empty(sem):
    emb, _, _ = sem
    emb.index_doc("d1", "note", "some content here")
    assert emb.search("", k=5) == []


def test_search_kind_filter(sem):
    emb, _, _ = sem
    emb.index_doc("a1", "alpha", "solar energy panel")
    emb.index_doc("b1", "beta", "solar energy panel")
    hits = emb.search("solar energy", k=5, kind="alpha")
    assert hits
    assert all(h["kind"] == "alpha" for h in hits)


# ── ontology indexing + idempotency ──────────────────────────────────────────────────
def test_reindex_ontology_idempotent(sem):
    emb, _, os_store = sem
    # seed a couple of objects into the temp ontology store
    os_store.upsert_object(
        {"id": "p1", "type": "person", "label": "Ada Lovelace",
         "props": {"role": "mathematician", "field": "computing"}}
    )
    os_store.upsert_object(
        {"id": "o1", "type": "org", "label": "Analytical Engine Co",
         "props": {"sector": "engineering"}}
    )

    n1 = emb.reindex_ontology()
    assert n1 >= 2
    c1 = emb.count()
    # re-run: must not duplicate rows
    n2 = emb.reindex_ontology()
    c2 = emb.count()
    assert n2 == n1
    assert c1 == c2

    hits = emb.search("mathematician computing", k=5)
    assert hits
    assert hits[0]["id"] == "p1"


def test_index_object_meta(sem):
    emb, _, _ = sem
    assert emb.index_object(
        {"id": "x", "type": "client", "label": "Acme", "mark": "CONF",
         "props": {"tier": "gold"}}
    )
    hits = emb.search("Acme gold", k=3)
    assert hits and hits[0]["id"] == "x"
    assert hits[0]["meta"]["label"] == "Acme"
    assert hits[0]["meta"]["type"] == "client"


# ── RAG ──────────────────────────────────────────────────────────────────────────────
def test_rag_retrieve_returns_sources(sem):
    emb, rag, _ = sem
    emb.index_doc("r1", "doc", "renewable solar power generation in the desert")
    emb.index_doc("r2", "doc", "history of medieval european castles")

    hits = rag.retrieve("solar power", k=3)
    assert hits
    assert hits[0]["id"] == "r1"


def test_rag_build_context_has_citations(sem):
    emb, rag, _ = sem
    emb.index_doc("r1", "doc", "renewable solar power generation in the desert")
    ctx = rag.build_context("solar power", k=3)
    assert ctx["count"] >= 1
    assert ctx["sources"]
    assert ctx["sources"][0]["ref"] == 1
    assert "[1]" in ctx["context"]


def test_rag_build_context_empty(sem):
    _, rag, _ = sem
    ctx = rag.build_context("nothing indexed", k=3)
    assert ctx["count"] == 0
    assert ctx["sources"] == []
    assert "No relevant context" in ctx["context"]


# ── NL → structured filter heuristic ──────────────────────────────────────────────────
def test_nl_query_interprets_type(sem):
    _, rag, os_store = sem
    os_store.upsert_object({"id": "p1", "type": "person", "label": "Grace Hopper"})
    os_store.upsert_object({"id": "p2", "type": "person", "label": "Alan Turing"})
    os_store.upsert_object({"id": "o1", "type": "org", "label": "Bletchley Park"})

    res = rag.nl_query("show me all people")
    assert res["heuristic"] is True
    assert res["interpreted"]["type"] == "person"
    ids = {r["id"] for r in res["results"]}
    assert "p1" in ids and "p2" in ids
    assert "o1" not in ids


def test_nl_query_of_type_phrasing(sem):
    _, rag, os_store = sem
    os_store.upsert_object({"id": "c1", "type": "client", "label": "Globex"})
    res = rag.nl_query("list objects of type client")
    assert res["interpreted"]["type"] == "client"
    assert any(r["id"] == "c1" for r in res["results"])


def test_nl_query_since_and_near_recorded(sem):
    _, rag, _ = sem
    res = rag.nl_query("show orgs near Dubai since 2021")
    assert res["interpreted"]["type"] == "org"
    assert res["interpreted"]["near"]
    assert "dubai" in res["interpreted"]["near"].lower()
    assert res["interpreted"]["since"] == "2021"
