import pytest
from server.services import world_runtime_engine as eng
pytestmark = pytest.mark.skipif(not eng.available(), reason="runtime_core not present")
def test_gate_blocks_uncleared_source():
    r = eng.run("rest_json","privatecorp","https://api.privatecorp.example/x", live_fetch=True)
    assert r["ok"] is False and r.get("blocked") is True
def test_cleared_source_planned_mode_no_network():
    r = eng.run("rest_json","usgs","https://earthquake.usgs.gov/feed.geojson", live_fetch=False)
    assert r["ok"] is True and r["payload"].get("mode") == "planned_no_live_fetch"
def test_connector_types_present():
    assert len(eng.connector_types()) > 0
