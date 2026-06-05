"""Legal gate + dispatch: only cleared sources ingest; candidates blocked."""
import json, sqlite3
from server.services import world_dispatch as wd, jarvis_world_pack as wp

def _seed_endpoints(db):
    wp.init_db()
    c=sqlite3.connect(db)
    c.execute("INSERT OR REPLACE INTO world_endpoint (endpoint_candidate_id,subject_id,master_topic,source_name,official_url,access_method,auth_requirement,recommended_ingestion_connector,licence_review_required,robots_or_terms_review_required) VALUES "
              "('EP-A','S1','Earth','USGS','https://earthquake.usgs.gov/x','REST','No key','rest_json','true','true'),"
              "('EP-B','S2','Biz','SomeCorp','https://api.privatecorp.example/x','REST','API key','rest_json','true','true')")
    c.commit(); c.close()

def test_gate_blocks_uncleared(monkeypatch, tmp_path):
    db=str(tmp_path/"g.db"); monkeypatch.setenv("BRAIN_DB", db)
    _seed_endpoints(db)
    rep=wd.gate_report()
    assert rep["total_endpoints"]==2 and rep["cleared"]==1 and rep["blocked_pending_review"]==1
    assert "earthquake.usgs.gov" in rep["cleared_by_host"]
    assert wd.is_cleared("earthquake.usgs.gov") and not wd.is_cleared("api.privatecorp.example")

def test_dispatch_only_cleared(monkeypatch, tmp_path):
    db=str(tmp_path/"d.db"); monkeypatch.setenv("BRAIN_DB", db)
    _seed_endpoints(db)
    SAMPLE={"type":"FeatureCollection","features":[
        {"id":"q1","properties":{"mag":6.0,"place":"Testland","time":int(__import__("time").time()*1000),"url":"https://earthquake.usgs.gov/q1","magType":"mww"},
         "geometry":{"coordinates":[10.0,20.0,5.0]}}]}
    monkeypatch.setattr(wd.nr,"polite_get", lambda url,**k: {"ok":True,"json":SAMPLE,"from_cache":False,"status":200,"error":None})
    out=wd.dispatch(per_source_limit=10)
    assert out["blocked_pending_review"]==1       # the private corp endpoint stays blocked
    assert out["ingested_total"]>=1               # USGS (cleared) ingested
    assert any(r["host"]=="earthquake.usgs.gov" and r.get("ingested",0)>=1 for r in out["results"])
