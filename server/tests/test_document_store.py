"""Durable, searchable document store — full text is kept, found, and persists."""

from __future__ import annotations

import os

import pytest

from server.services import document_store as ds


@pytest.fixture()
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("DOCUMENTS_DB", str(tmp_path / "documents.db"))
    ds.init_db()
    return tmp_path


def test_store_keeps_full_text_not_just_excerpt(store):
    big = "lineage " * 5000  # ~40k chars — full content, not a 600-char excerpt
    ds.store("scraped:a", url="https://w3.org/prov", full_text=big, title="PROV-O",
             host="w3.org", http_status=200, subject_id="S1")
    g = ds.get("scraped:a")
    assert g is not None and g["chars"] > 30000 and g["full_text"].startswith("lineage")
    assert g["subject_id"] == "S1" and g["http_status"] == 200


def test_fts_search_finds_documents(store):
    ds.store("scraped:1", url="u1", full_text="The provenance ontology tracks data lineage.", title="prov")
    ds.store("scraped:2", url="u2", full_text="JSON Schema validates JSON documents.", title="json")
    hits = ds.search("provenance lineage", 5)
    assert any(h["id"] == "scraped:1" for h in hits)
    assert all("snippet" in h for h in hits)
    # punctuation / OOV must not crash
    assert ds.search("!!!", 5) == [] or isinstance(ds.search("!!!", 5), list)


def test_idempotent_replace(store):
    ds.store("scraped:x", url="u", full_text="v1", title="t")
    ds.store("scraped:x", url="u", full_text="v2 updated content", title="t")
    g = ds.get("scraped:x")
    assert g["full_text"] == "v2 updated content"
    assert ds.stats()["documents"] == 1  # no duplicate


def test_snapshot_and_restore_round_trip(store, monkeypatch):
    ds.store("scraped:keep", url="u", full_text="survive the container reset", title="t")
    snap = ds.snapshot()
    assert snap["ok"] and os.path.isfile(snap["snapshot"])
    # wipe the live db, restore from the gz snapshot
    os.remove(ds._db_path())
    r = ds.restore()
    assert r["ok"] and ds.get("scraped:keep")["full_text"] == "survive the container reset"
