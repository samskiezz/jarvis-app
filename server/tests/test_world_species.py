"""Species occurrence vertical slice: parser/gate offline (always), live fetch (skip if no net)."""
import pytest
from server.services import world_species as sp

SAMPLE = {"results": [
  {"key": 123456789, "scientificName": "Panthera leo (Linnaeus, 1758)",
   "country": "Kenya", "decimalLatitude": -1.29, "decimalLongitude": 36.82,
   "eventDate": "2024-03-15", "basisOfRecord": "HUMAN_OBSERVATION", "kingdom": "Animalia"},
  {"key": 987654321, "scientificName": "",
   "country": "Nowhere", "decimalLatitude": 999, "decimalLongitude": 999,
   "eventDate": "2024-01-01", "basisOfRecord": "HUMAN_OBSERVATION", "kingdom": "Animalia"},
  # invalid coords + empty name -> rejected
]}

def test_parser_produces_standard_envelope():
    env = sp.parse_record(SAMPLE["results"][0])
    for k in ("source_id", "record_id", "record_type", "observed_at", "valid_time",
              "location", "measurements", "documents", "provenance", "raw_hash"):
        assert k in env
    assert env["record_type"] == "SpeciesOccurrence"
    assert env["record_id"] == "123456789"
    assert env["location"]["lat"] == -1.29 and env["location"]["lon"] == 36.82
    assert env["_name"] == "Panthera leo (Linnaeus, 1758)"
    assert env["_kingdom"] == "Animalia" and env["_country"] == "Kenya"

def test_quality_gate_rejects_bad_record():
    good = sp.quality_gate(sp.parse_record(SAMPLE["results"][0]))
    bad = sp.quality_gate(sp.parse_record(SAMPLE["results"][1]))
    assert good["pass"] is True
    assert bad["pass"] is False and bad["checks"]["valid_coords"] is False
    assert bad["checks"]["has_scientific_name"] is False

def test_pipeline_writes_ontology_objects(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "sp.db"))
    out = sp.run_pipeline(raw=SAMPLE, live=False)       # injected data, no network
    assert out["status"] == "ok"
    assert out["ingested"] == 1 and out["rejected"] == 1  # good one in, bad one gated out
    from server.services import jarvis_ontology as ont
    objs = ont.list_objects("SpeciesOccurrence")
    assert len(objs) >= 1

@pytest.mark.skipif(sp.fetch() is None, reason="GBIF feed unreachable")
def test_live_gbif_fetch():
    data = sp.fetch()
    assert data and isinstance(data.get("results"), list)
