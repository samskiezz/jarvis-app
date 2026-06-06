"""The corpus must project into the ontology graph so Gotham reflects real data."""

from __future__ import annotations

import sqlite3

import pytest

from server.services import jarvis_corpus_projection as proj


@pytest.fixture()
def db(tmp_path, monkeypatch):
    p = tmp_path / "brain.db"
    c = sqlite3.connect(p)
    c.executescript(
        """
        CREATE TABLE ont_object (id TEXT PRIMARY KEY, type TEXT, props TEXT, state TEXT,
            created_ts INTEGER, updated_ts INTEGER);
        CREATE TABLE ont_object_type (name TEXT PRIMARY KEY, schema TEXT, states TEXT,
            initial TEXT, ts INTEGER);
        CREATE TABLE ont_link (id TEXT PRIMARY KEY, type TEXT, from_id TEXT, to_id TEXT, ts INTEGER);
        CREATE TABLE world_subject (subject_id TEXT, domain_subject TEXT, master_topic TEXT,
            neuron_type TEXT, primary_source_families TEXT, ontology_targets TEXT, lawful_boundary TEXT);
        CREATE TABLE world_endpoint (endpoint_candidate_id TEXT, subject_id TEXT, source_name TEXT,
            official_url TEXT, master_topic TEXT, access_method TEXT, recommended_ingestion_connector TEXT);
        CREATE TABLE world_ocr (ocr_candidate_id TEXT, subject_id TEXT, source_name TEXT,
            master_topic TEXT, document_types TEXT, source_url TEXT);
        CREATE TABLE world_edge (edge_id TEXT, subject_id TEXT, source_class TEXT,
            target_class TEXT, edge_type TEXT, edge_weight TEXT);
        """
    )
    for i in range(20):
        c.execute("INSERT INTO world_subject VALUES (?,?,?,?,?,?,?)",
                  (f"SUBJ-{i}", f"Subject {i}", "Topic", "neuron", "SRC", "obj", "open"))
    for i in range(50):
        c.execute("INSERT INTO world_endpoint VALUES (?,?,?,?,?,?,?)",
                  (f"EP-{i}", f"SUBJ-{i % 20}", f"Source {i}", "http://x", "Topic", "REST", "rest"))
    for i in range(15):
        c.execute("INSERT INTO world_ocr VALUES (?,?,?,?,?,?)",
                  (f"OCR-{i}", f"SUBJ-{i % 20}", f"Doc {i}", "Topic", "pdf", "http://d"))
    for i in range(30):
        c.execute("INSERT INTO world_edge VALUES (?,?,?,?,?,?)",
                  (f"E-{i}", f"SUBJ-{i % 20}", "DataSource", "RawAsset", "INGESTS_TO", "0.8"))
    c.commit()
    c.close()
    monkeypatch.setattr(proj, "_db_path", lambda: str(p))
    return str(p)


def test_projection_creates_real_graph(db):
    r = proj.project()
    assert r["ok"] is True
    assert r["subjects"] == 20 and r["sources"] == 50 and r["documents"] == 15
    assert r["neurons_total"] == 20
    assert r["ont_objects_total"] == 20 + 50 + 15  # subjects + sources + docs
    assert r["ont_links_total"] >= 50 + 15  # serves + describes (+ flow)


def test_projection_is_idempotent(db):
    proj.project()
    first = proj.counts()
    proj.project()
    second = proj.counts()
    assert first == second  # INSERT OR IGNORE — no duplicates on re-run


def test_counts_shape(db):
    proj.project()
    c = proj.counts()
    assert c["neurons"] == 20 and c["sources"] == 50 and c["documents"] == 15
