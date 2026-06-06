"""Scraper: governance allow-policy, real-doc storage, idempotency (no network)."""

from __future__ import annotations

import json
import sqlite3

import pytest

from server.services import jarvis_scrape as scr


@pytest.fixture()
def db(tmp_path, monkeypatch):
    p = tmp_path / "brain.db"
    c = sqlite3.connect(p)
    c.executescript(
        """
        CREATE TABLE ont_object (id TEXT PRIMARY KEY, type TEXT, props TEXT, state TEXT,
            created_ts INTEGER, updated_ts INTEGER);
        CREATE TABLE ont_link (id TEXT PRIMARY KEY, type TEXT, from_id TEXT, to_id TEXT, ts INTEGER);
        CREATE TABLE world_endpoint (endpoint_candidate_id TEXT, subject_id TEXT, source_name TEXT,
            official_url TEXT, master_topic TEXT, access_method TEXT, recommended_ingestion_connector TEXT);
        """
    )
    rows = [
        ("E1", "SUBJ-1", "W3C", "https://www.w3.org/TR/prov-o/"),         # allowed (standard)
        ("E2", "SUBJ-1", "World Bank", "https://data.worldbank.org/x"),    # allowed (data. + worldbank)
        ("E3", "SUBJ-2", "Shodan", "https://developer.shodan.io/api"),     # blocked (shodan/developer.)
        ("E4", "SUBJ-2", "Random", "https://example.com/private"),         # not public-interest
    ]
    for r in rows:
        c.execute("INSERT INTO world_endpoint (endpoint_candidate_id,subject_id,source_name,official_url) "
                  "VALUES (?,?,?,?)", r)
    c.commit(); c.close()
    monkeypatch.setattr(scr, "_db_path", lambda: str(p))
    return str(p)


def test_allow_policy_governs_targets(db):
    urls = {t[0] for t in scr.all_targets()}
    assert "https://www.w3.org/TR/prov-o/" in urls
    assert "https://data.worldbank.org/x" in urls
    assert "https://developer.shodan.io/api" not in urls  # blocked pattern
    assert "https://example.com/private" not in urls       # not public-interest


def test_store_document_writes_real_object_and_link(db):
    oid = scr.store_document("https://www.w3.org/TR/prov-o/", "W3C", "SUBJ-1",
                             status=200, body="<title>PROV-O</title><p>hello world</p>")
    assert oid and oid.startswith("scraped:")
    c = sqlite3.connect(db)
    row = c.execute("SELECT type, props, state FROM ont_object WHERE id=?", (oid,)).fetchone()
    assert row[0] == "Document" and row[2] == "fetched"
    props = json.loads(row[1])
    assert props["http_status"] == 200 and props["fetched_chars"] > 0
    assert len(props["content_sha256"]) == 64
    link = c.execute("SELECT to_id FROM ont_link WHERE from_id=?", (oid,)).fetchone()
    assert link[0] == "subject:SUBJ-1"
    c.close()


def test_scraped_skipped_on_second_pass(db):
    scr.store_document("https://www.w3.org/TR/prov-o/", "W3C", "SUBJ-1", status=200, body="<p>x</p>")
    # that URL is now fetched -> excluded from pending targets
    assert all(t[0] != "https://www.w3.org/TR/prov-o/" for t in scr.all_targets(skip_fetched=True))
    assert scr.scraped_count() == 1


def test_scrapling_batch_degrades_without_network(db, monkeypatch):
    # Force the Scrapling import to fail -> structured error, never raises.
    import builtins
    real = builtins.__import__
    def fake(name, *a, **k):
        if name.startswith("scrapling"):
            raise ImportError("blocked for test")
        return real(name, *a, **k)
    monkeypatch.setattr(builtins, "__import__", fake)
    out = scr.scrapling_batch(limit=2)
    assert out["ok"] is False and "scrapling" in out["error"]
