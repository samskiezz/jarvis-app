"""Scraping must grow all three planes: Gotham topics/edges, Foundry, Apollo."""

from __future__ import annotations

import sqlite3

import pytest

from server.services import jarvis_grow as g


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
        """
    )
    c.execute("INSERT INTO ont_object VALUES ('scraped:1','Document','{}','fetched',0,0)")
    c.commit(); c.close()
    monkeypatch.setattr(g, "_db_path", lambda: str(p))
    return str(p)


def test_ensure_topics_creates_31_gotham_nodes(db):
    assert g.ensure_topics() == 31


def test_document_links_to_topics_it_mentions(db):
    g.ensure_topics()
    n = g.enrich_document("scraped:1", "Climate report",
                          "This document covers climate hazards, flood and drought risk, "
                          "and aviation transport disruption.")
    assert n >= 2  # climate + transport at least
    c = sqlite3.connect(db)
    edges = c.execute("SELECT to_id FROM ont_link WHERE type='MENTIONS' AND from_id='scraped:1'").fetchall()
    tos = {e[0] for e in edges}
    assert "topic:climate-hazards" in tos
    c.close()


def test_enrich_is_idempotent(db):
    g.ensure_topics()
    g.enrich_document("scraped:1", "t", "climate flood")
    first = _count_links(db)
    g.enrich_document("scraped:1", "t", "climate flood")
    assert _count_links(db) == first


def test_foundry_growth_counts(db):
    g.ensure_topics()
    g.enrich_document("scraped:1", "t", "climate hazards")
    fg = g.foundry_growth()
    assert fg["documents_fetched"] == 1 and fg["topics"] == 31 and fg["topic_edges"] >= 1


def _count_links(db):
    c = sqlite3.connect(db)
    try:
        return c.execute("SELECT COUNT(*) FROM ont_link").fetchone()[0]
    finally:
        c.close()
