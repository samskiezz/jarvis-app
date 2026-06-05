import os, pytest
from server.services import jarvis_world_os as wos
pytestmark = pytest.mark.skipif(not wos.available(), reason="world_os not present")
def test_world_os_loads_all_points(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path/"wos.db"))
    out = wos.load_all()
    assert out["available"] is True
    assert out["endpoints_in_db"] >= 90000   # 92k unique endpoints
    assert out["subjects_in_db"] >= 10000     # 10k unique subjects
    assert out["endpoint_rows_read"] > out["endpoints_in_db"]  # dedup of overlapping files
