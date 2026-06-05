"""US weather-alerts vertical slice: parser/gate offline (always), live fetch (skip if no net)."""
import time, pytest
from server.services import world_weather as wx


def _iso(offset_s):
    import datetime as dt
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=offset_s)) \
        .strftime("%Y-%m-%dT%H:%M:%S+00:00")


SAMPLE = {"type": "FeatureCollection", "features": [
    {"id": "urn:oid:2.49.0.1.840.0.good", "properties": {
        "@id": "https://api.weather.gov/alerts/good",
        "event": "Severe Thunderstorm Warning", "severity": "Severe",
        "certainty": "Observed", "urgency": "Immediate",
        "areaDesc": "Dallas, TX", "headline": "Severe T-Storm until 6 PM",
        "effective": _iso(-600), "expires": _iso(3600),
        "senderName": "NWS Fort Worth TX"}},
    {"id": "urn:oid:2.49.0.1.840.0.bad", "properties": {
        # missing event + severity -> rejected
        "certainty": "Possible", "urgency": "Future",
        "areaDesc": "nowhere", "headline": "",
        "effective": _iso(-600), "expires": _iso(3600),
        "senderName": "NWS Test"}},
]}


def test_parser_produces_standard_envelope():
    env = wx.parse_feature(SAMPLE["features"][0])
    for k in ("source_id", "record_id", "record_type", "observed_at", "valid_time",
              "location", "measurements", "documents", "entities", "relationships",
              "quality", "provenance", "raw_hash"):
        assert k in env
    assert env["record_type"] == "WeatherAlert"
    assert env["source_id"] == "nws.alerts"
    assert env["location"]["areaDesc"] == "Dallas, TX"
    assert env["_event"] == "Severe Thunderstorm Warning"
    assert env["documents"] and env["documents"][0]["url"]
    assert len(env["raw_hash"]) == 64


def test_quality_gate_rejects_bad_record():
    good = wx.quality_gate(wx.parse_feature(SAMPLE["features"][0]))
    bad = wx.quality_gate(wx.parse_feature(SAMPLE["features"][1]))
    assert good["pass"] is True
    assert bad["pass"] is False
    assert bad["checks"]["has_event"] is False
    assert bad["checks"]["has_severity"] is False


def test_pipeline_writes_ontology_objects(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "wx.db"))
    out = wx.run_pipeline(raw=SAMPLE, live=False)        # injected data, no network
    assert out["status"] == "ok"
    assert out["ingested"] == 1 and out["rejected"] == 1  # good one in, bad one gated out
    assert out["source"] == "nws.alerts"
    from server.services import jarvis_ontology as ont
    objs = ont.list_objects("WeatherAlert")
    assert len(objs) >= 1
    obj = ont.get_object(objs[0]["id"])
    assert obj["props"]["event"] == "Severe Thunderstorm Warning"


@pytest.mark.skipif(wx.fetch() is None, reason="NWS feed unreachable")
def test_live_nws_fetch():
    data = wx.fetch()
    assert data and data.get("type") == "FeatureCollection"
    assert isinstance(data.get("features"), list)
