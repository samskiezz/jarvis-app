"""Scientific publications vertical slice: parser/gate offline (always), live fetch (skip if no net)."""
import pytest
from server.services import world_publications as pub

SAMPLE = {"message": {"items": [
  {"DOI": "10.1234/abc.123",
   "title": ["A Real Study of Things"],
   "author": [{"given": "Ada", "family": "Lovelace"}, {"given": "Alan", "family": "Turing"}],
   "published": {"date-parts": [[2021, 3, 14]]},
   "type": "journal-article",
   "container-title": ["Journal of Real Things"]},
  {"DOI": "10.5678/notitle",
   "title": [],                       # no title -> rejected
   "author": [{"given": "No", "family": "Title"}],
   "published": {"date-parts": [[2020]]},
   "type": "journal-article"},
]}}


def test_parser_produces_standard_envelope():
    env = pub.parse_item(SAMPLE["message"]["items"][0])
    for k in ("source_id", "record_id", "record_type", "observed_at", "valid_time",
              "location", "measurements", "documents", "provenance", "raw_hash"):
        assert k in env
    assert env["record_type"] == "ScientificPublication"
    assert env["record_id"] == "10.1234/abc.123"
    assert env["_title"] == "A Real Study of Things"
    assert env["_authors"] == "Ada Lovelace; Alan Turing"
    assert env["_year"] == "2021"
    assert env["documents"][0]["url"] == "https://doi.org/10.1234/abc.123"


def test_quality_gate_rejects_bad_record():
    good = pub.quality_gate(pub.parse_item(SAMPLE["message"]["items"][0]))
    bad = pub.quality_gate(pub.parse_item(SAMPLE["message"]["items"][1]))
    assert good["pass"] is True
    assert bad["pass"] is False and bad["checks"]["has_title"] is False


def test_pipeline_writes_ontology_objects(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "pub.db"))
    out = pub.run_pipeline(raw=SAMPLE, live=False)        # injected data, no network
    assert out["status"] == "ok"
    assert out["ingested"] == 1 and out["rejected"] == 1  # good one in, bad one gated out
    from server.services import jarvis_ontology as ont
    objs = ont.list_objects("ScientificPublication")
    assert len(objs) >= 1


@pytest.mark.skipif(pub.fetch() is None, reason="Crossref feed unreachable")
def test_live_crossref_fetch():
    data = pub.fetch()
    assert data and isinstance(data.get("message", {}).get("items"), list)
