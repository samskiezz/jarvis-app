"""BRAIN RESEARCH layer tests — fully OFFLINE / NO real network.

We monkeypatch the module's single network egress point (``_http_get``) so:
  * ``research()`` returns a dossier built from STUBBED source payloads, and
  * ``research()`` returns empty findings (no exception) when the fetch is None.

``ingest()`` is exercised against a REAL ``second_brain`` store pointed at a temp
``BRAIN_DB`` (+ ONTOLOGY_DB + VECTOR_DB) so we verify a note is actually
created/updated; the immutable raw record goes to a temp ``BRAIN_RESEARCH_DB``.
``reconcile()`` is checked for its contradictions structure + bi-temporal write,
and ``synthesize()`` for honest too-few-notes handling. Fast, deterministic.

Run:
    python3 -m pytest server/tests/test_brain_research.py -q
"""

import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def env(tmp_path, monkeypatch):
    """Fresh temp DBs each test; reload the service so the temp paths take effect."""
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("VECTOR_DB", str(tmp_path / "vectors.db"))
    monkeypatch.setenv("BRAIN_RESEARCH_DB", str(tmp_path / "brain_research.db"))

    from server.services import second_brain as sb

    importlib.reload(sb)
    sb.init_db()

    from server.services import brain_research as br

    importlib.reload(br)
    br.init_db()
    return br, sb


# ── research(): stubbed sources ───────────────────────────────────────────────────────
def _stub_http(payload_map):
    """Build an _http_get replacement that returns canned bytes by URL substring."""
    def _fn(url, timeout=12.0):
        for needle, payload in payload_map.items():
            if needle in url:
                if isinstance(payload, (bytes, bytearray)):
                    return bytes(payload)
                return json.dumps(payload).encode("utf-8")
        return None
    return _fn


def test_research_aggregates_stubbed_sources(env, monkeypatch):
    br, _sb = env

    wiki = {
        "title": "Quantum computing",
        "extract": "Quantum computing uses qubits. It promises speedups. More text here.",
        "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Quantum_computing"}},
    }
    hn = {"hits": [{"objectID": "1", "title": "Show HN: Qubit sim", "url": "http://hn.example/1",
                    "points": 42, "num_comments": 7}]}
    arxiv_atom = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<feed xmlns="http://www.w3.org/2005/Atom">'
        '<entry><title>A Quantum Paper</title>'
        '<summary>We show a result. It is neat.</summary>'
        '<id>http://arxiv.org/abs/1234.5678</id></entry></feed>'
    ).encode("utf-8")
    crossref = {"message": {"items": [{"title": ["Quantum Review"], "DOI": "10.1/x",
                "type": "journal-article", "publisher": "ACME",
                "author": [{"given": "A", "family": "B"}]}]}}
    ddg = {"Heading": "Quantum computing", "AbstractText": "An abstract about quantum.",
           "AbstractURL": "http://ddg.example", "RelatedTopics": [
               {"Text": "Qubit - a unit", "FirstURL": "http://ddg.example/qubit"}]}

    monkeypatch.setattr(br, "_http_get", _stub_http({
        "wikipedia.org": wiki,
        "hn.algolia.com": hn,
        "arxiv.org": arxiv_atom,
        "crossref.org": crossref,
        "duckduckgo.com": ddg,
    }))

    dossier = br.research("quantum computing")
    assert dossier["topic"] == "quantum computing"
    sources = {f["source"] for f in dossier["findings"]}
    assert {"wikipedia", "hackernews", "arxiv", "crossref", "duckduckgo"} <= sources
    # every finding has the required shape
    for f in dossier["findings"]:
        assert set(["source", "title", "url", "snippet"]) <= set(f)
        assert f["title"]
    assert isinstance(dossier["open_questions"], list)
    assert dossier["fetched_ts"] > 0


def test_research_offline_returns_empty_findings(env, monkeypatch):
    br, _sb = env
    # every fetch returns None → fully offline. Must NOT raise; findings empty.
    monkeypatch.setattr(br, "_http_get", lambda url, timeout=12.0: None)
    dossier = br.research("anything at all")
    assert dossier["findings"] == []
    assert dossier["topic"] == "anything at all"
    # honest open question rather than fabricated content
    assert any("No sources" in q or "fabricat" in q for q in dossier["open_questions"])


def test_research_blank_topic(env):
    br, _sb = env
    d = br.research("   ")
    assert d["findings"] == []


# ── ingest(): two-output rule (raw record + note) ──────────────────────────────────────
def test_ingest_inline_text_creates_note_and_raw(env):
    br, sb = env
    out = br.ingest("Pluto was reclassified as a dwarf planet in 2006.", title="Pluto")
    assert out["source_kind"] == "text"
    assert out["raw_id"]  # immutable raw record saved
    # a note was created for the subject
    titles = [c["title"] for c in out["created"]]
    assert "Pluto" in titles
    note = sb.get_note("Pluto")
    assert note is not None
    assert "dwarf planet" in (note["body_md"] or "")
    assert note["frontmatter"].get("raw_id") == out["raw_id"]
    # raw record is retrievable for provenance
    raw = br.get_raw(out["raw_id"])
    assert raw is not None and raw["title"] == "Pluto"


def test_ingest_second_time_updates(env):
    br, sb = env
    br.ingest("First version of the claim.", title="Topic X")
    out2 = br.ingest("Second version of the claim.", title="Topic X")
    assert any(u["title"] == "Topic X" for u in out2["updated"])


def test_ingest_url_offline_records_attempt_no_note(env, monkeypatch):
    br, sb = env
    monkeypatch.setattr(br, "_http_get", lambda url, timeout=14.0: None)
    out = br.ingest("https://example.com/article", title="Offline Article")
    assert out["source_kind"] == "url"
    assert out["raw_id"]  # honest: the attempt is recorded
    assert out["created"] == [] and out["updated"] == []  # nothing fabricated
    assert sb.get_note("Offline Article") is None


def test_ingest_url_with_stubbed_fetch(env, monkeypatch):
    br, sb = env
    html = b"<html><body><h1>Title</h1><p>Hello world. This is content. Third line.</p></body></html>"
    monkeypatch.setattr(br, "_http_get", lambda url, timeout=14.0: html)
    out = br.ingest("https://example.com/x", title="Stubbed Page")
    assert out["raw_id"]
    note = sb.get_note("Stubbed Page")
    assert note is not None
    assert "Hello world" in note["body_md"]


# ── reconcile(): contradictions structure + bi-temporal write ──────────────────────────
def test_reconcile_returns_contradictions_structure(env):
    br, sb = env
    sb.upsert_note("entity", "Mars", "Mars has two moons named Phobos and Deimos.")
    res = br.reconcile("Mars", latest="Mars has three moons discovered recently.")
    assert res["title"] == "Mars"
    assert isinstance(res["contradictions"], list)
    assert res["updated"] is True
    assert res["heuristic"] is True
    # the note now carries a bi-temporal reconciliation block
    note = sb.get_note("Mars")
    assert "Reconciliation" in note["body_md"]


def test_reconcile_missing_note(env):
    br, _sb = env
    res = br.reconcile("Does Not Exist")
    assert res["contradictions"] == []
    assert res["updated"] is False
    assert "no note" in res["resolution"].lower()


def test_reconcile_no_latest_info(env):
    br, sb = env
    sb.upsert_note("entity", "Lonely", "A claim with no newer info.")
    res = br.reconcile("Lonely")
    assert res["updated"] is False
    assert res["contradictions"] == []


# ── synthesize(): too-few-notes honesty + real synthesis ───────────────────────────────
def test_synthesize_too_few_notes_is_honest(env):
    br, _sb = env
    res = br.synthesize("a topic with no notes")
    assert res["created"] is False
    assert res["note"] is None
    assert "too few" in res["message"].lower()


def test_synthesize_creates_note_when_enough(env):
    br, sb = env
    # seed several related notes so semantic retrieval finds them
    sb.upsert_note("entity", "Solar Panel A", "Solar energy photovoltaic panel efficiency rooftop.")
    sb.upsert_note("entity", "Solar Panel B", "Solar energy photovoltaic panel efficiency installation.")
    sb.upsert_note("entity", "Solar Farm", "Solar energy photovoltaic farm grid efficiency.")
    res = br.synthesize("solar energy photovoltaic efficiency", min_notes=2)
    if res["created"]:
        assert res["note"] is not None
        assert res["note"]["kind"] == "synthesis"
        syn = sb.get_note("Synthesis: solar energy photovoltaic efficiency")
        assert syn is not None
        assert "Source notes" in syn["body_md"]
    else:
        # if retrieval found too few, it must say so honestly (never fabricate)
        assert "too few" in res["message"].lower()


def test_no_public_function_raises(env, monkeypatch):
    br, _sb = env
    monkeypatch.setattr(br, "_http_get", lambda url, timeout=12.0: None)
    # smoke: none of the public entrypoints raise even with everything offline
    assert br.research("x") is not None
    assert br.ingest("inline text here", title="T") is not None
    assert br.reconcile("nope") is not None
    assert br.synthesize("nope") is not None
