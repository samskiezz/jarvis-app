"""Loads the Stage-7 world ontology pack into the platform and queries it."""
import pytest
from server.services import jarvis_world_pack as wp

pytestmark = pytest.mark.skipif(not wp.available(), reason="world_pack not present")

def test_world_pack_loads(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "wp.db"))
    out = wp.load(endpoint_limit=5000)   # cap endpoints for test speed
    assert out["topics"] == 30 and out["niches"] == 10 and out["cells"] == 300
    assert out["families"] == 20 and out["subjects"] == 5000
    assert out["endpoints"] == 5000
    s = wp.summary(); assert s["subjects"] == 5000
    # real endpoints have http urls
    eps = wp.endpoints(limit=10)
    assert eps and all(e["official_url"].startswith("http") for e in eps)
    # research targets are clean concept names
    rt = wp.research_targets(limit=10)
    assert len(rt) == 10 and all("/" not in t for t in rt)
