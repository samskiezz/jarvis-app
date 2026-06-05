"""Earthquake vertical slice: parser/gate offline (always), live fetch (skip if no net)."""
import time, pytest
from server.services import world_earthquake as eq

SAMPLE = {"type":"FeatureCollection","features":[
  {"id":"us1","properties":{"mag":6.4,"place":"100km S of Town","time":int(time.time()*1000),
    "url":"https://earthquake.usgs.gov/eq/us1","magType":"mww"},
   "geometry":{"coordinates":[120.5,-5.2,35.0]}},
  {"id":"bad","properties":{"mag":None,"place":"nowhere","time":int(time.time()*1000)},
   "geometry":{"coordinates":[999,999,0]}},   # invalid coords + no mag -> rejected
]}

def test_parser_produces_standard_envelope():
    env = eq.parse_feature(SAMPLE["features"][0])
    for k in ("source_id","record_id","record_type","observed_at","valid_time","location",
              "measurements","documents","provenance","raw_hash"):
        assert k in env
    assert env["record_type"]=="EarthquakeEvent" and env["location"]["lat"]==-5.2
    assert any(m["name"]=="magnitude" and m["value"]==6.4 for m in env["measurements"])

def test_quality_gate_rejects_bad_record():
    good = eq.quality_gate(eq.parse_feature(SAMPLE["features"][0]))
    bad  = eq.quality_gate(eq.parse_feature(SAMPLE["features"][1]))
    assert good["pass"] is True
    assert bad["pass"] is False and bad["checks"]["valid_coords"] is False

def test_pipeline_writes_ontology_objects(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path/"eq.db"))
    out = eq.run_pipeline(raw=SAMPLE, live=False)        # injected data, no network
    assert out["status"]=="ok"
    assert out["ingested"]==1 and out["rejected"]==1     # good one in, bad one gated out
    from server.services import jarvis_ontology as ont
    objs = ont.list_objects("EarthquakeEvent")
    assert len(objs)>=1

@pytest.mark.skipif(eq.fetch() is None, reason="USGS feed unreachable")
def test_live_usgs_fetch():
    data = eq.fetch()
    assert data and data.get("type")=="FeatureCollection"
