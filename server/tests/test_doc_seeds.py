"""Offline, deterministic tests for the curated open-document seed catalogue.

Asserts the curated seeds are plentiful, all https, all pass the (expanded)
``jarvis_scrape._allowed`` policy (none self-blocked), and are duplicate-free; and
that previously-blocked reputable hosts now pass the policy.
"""

from __future__ import annotations

from server.services import doc_seeds as ds
from server.services import jarvis_scrape as js


def test_curated_targets_count():
    assert len(ds.curated_targets()) >= 60


def test_all_https():
    for url, _sn, _sid in ds.curated_targets():
        assert url.startswith("https://"), url


def test_all_pass_allowed_policy():
    for url, _sn, _sid in ds.curated_targets():
        assert js._allowed(url), f"self-blocked seed: {url}"


def test_no_duplicate_urls():
    urls = [u for u, _sn, _sid in ds.curated_targets()]
    assert len(urls) == len(set(urls))


def test_well_formed_triples():
    for t in ds.curated_targets():
        assert isinstance(t, tuple) and len(t) == 3
        url, sn, sid = t
        assert url and sn and sid


def test_previously_blocked_hosts_now_allowed():
    for url in (
        "https://arxiv.org/list/cs.AI/recent",
        "https://huggingface.co/datasets",
        "https://www.iso.org/standards-catalogue/browse-by-ics.html",
        "https://unece.org/trade/uncefact/",
        "https://ourworldindata.org/",
        "https://eur-lex.europa.eu/homepage.html",
        "https://www.europeana.eu/en/search",
        "https://ilostat.ilo.org/data/",
    ):
        assert js._allowed(url), f"expected allowed: {url}"


def test_curated_seeds_merge_into_all_targets(tmp_path, monkeypatch):
    # With an empty (but valid) catalogue DB, all_targets should still surface the
    # curated seeds (deduped, allowed, merged in).
    import sqlite3

    db = tmp_path / "brain.db"
    c = sqlite3.connect(db)
    c.executescript(
        "CREATE TABLE world_endpoint (official_url TEXT, source_name TEXT, subject_id TEXT);"
        "CREATE TABLE world_ocr (source_url TEXT, source_name TEXT, subject_id TEXT);"
        "CREATE TABLE ont_object (id TEXT, state TEXT);"
    )
    c.commit()
    c.close()
    monkeypatch.setattr(js, "_db_path", lambda: str(db))
    targets = js.all_targets(skip_fetched=False)
    urls = {u for u, _sn, _sid in targets}
    assert "https://arxiv.org/list/cs.AI/recent" in urls
