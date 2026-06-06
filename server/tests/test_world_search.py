"""Tests for real-corpus search + its exposure as a governed agent tool."""

from __future__ import annotations

import os
import sqlite3

import pytest

from server.services import world_search as ws
from server.services import aip_tools


@pytest.fixture()
def corpus_db(tmp_path, monkeypatch):
    db = tmp_path / "brain.db"
    c = sqlite3.connect(db)
    c.executescript(
        """
        CREATE TABLE world_endpoint (endpoint_candidate_id TEXT PRIMARY KEY, subject_id TEXT,
            master_topic TEXT, source_name TEXT, official_url TEXT, access_method TEXT,
            auth_requirement TEXT, recommended_ingestion_connector TEXT,
            licence_review_required TEXT, robots_or_terms_review_required TEXT);
        CREATE TABLE world_subject (subject_id TEXT PRIMARY KEY, master_topic TEXT,
            domain_subject TEXT, neuron_type TEXT, primary_source_families TEXT,
            source_urls TEXT, acquisition_method TEXT, refresh_cadence TEXT,
            ontology_targets TEXT, lawful_boundary TEXT);
        CREATE TABLE world_ocr (ocr_candidate_id TEXT PRIMARY KEY, subject_id TEXT, master_topic TEXT,
            source_name TEXT, source_url TEXT, document_types TEXT, ocr_policy TEXT);
        CREATE TABLE world_benchmark (benchmark_candidate_id TEXT PRIMARY KEY, subject_id TEXT,
            master_topic TEXT, benchmark_name TEXT, benchmark_url TEXT, benchmark_purpose TEXT, metric TEXT);
        """
    )
    c.execute("INSERT INTO world_endpoint VALUES ('E1','S1','Climate & hazards','USGS Earthquake FDSN',"
              "'https://earthquake.usgs.gov','REST/GeoJSON','none','rest','no','no')")
    c.execute("INSERT INTO world_subject VALUES ('S1','Universe & cosmology',"
              "'Universe & cosmology / Space objects','status','SRC005:NASA APIs','https://nasa.gov',"
              "'rest','hourly','space','open')")
    c.commit()
    c.close()
    monkeypatch.setattr(ws, "_db_path", lambda: str(db))
    return str(db)


def test_corpus_search_finds_real_rows(corpus_db):
    hits = ws.search("earthquake usgs", k=5)
    assert any(h["kind"] == "endpoint" and "USGS" in h["label"] for h in hits)
    nasa = ws.search("nasa space", k=5)
    assert any(h["kind"] == "subject" for h in nasa)


def test_corpus_search_empty_query_safe(corpus_db):
    assert ws.search("", k=5) == []


def test_stats_reports_counts(corpus_db):
    s = ws.stats()
    assert s.get("endpoint") == 1 and s.get("subject") == 1


def test_corpus_search_registered_as_tool():
    names = [t["name"] for t in aip_tools.list_tools()]
    assert "corpus.search" in names


def test_corpus_search_tool_dispatch(corpus_db, monkeypatch):
    # the agent dispatches corpus.search through the governed tool layer
    monkeypatch.setattr(aip_tools._world_search, "_db_path", lambda: corpus_db)
    out = aip_tools.call_tool("corpus.search", {"query": "usgs earthquake", "k": 3})
    assert out["ok"] is True
    assert isinstance(out["result"], list)
