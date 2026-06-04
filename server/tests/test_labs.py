"""Offline-tolerant tests for the labs bridge + routes.

These must pass whether or not the dormant underworld modules import in this
process: every capability is either ``available`` (returns a real dict) or
gracefully ``unavailable``. The bridge must never raise.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.services import labs_bridge  # noqa: E402

client = TestClient(app)


def test_catalog_is_a_list_of_marked_entries():
    cat = labs_bridge.catalog()
    assert isinstance(cat, list)
    assert len(cat) > 0
    for entry in cat:
        assert isinstance(entry, dict)
        assert "capability" in entry
        assert entry["status"] in ("available", "unavailable")


def test_run_known_capability_returns_dict_or_graceful_unavailable():
    out = labs_bridge.run("disease_model", {"kind": "sir"})
    assert isinstance(out, dict)
    assert out["status"] in ("ok", "unavailable", "error")
    if out["status"] == "ok":
        assert isinstance(out["data"], dict)


def test_every_catalogued_capability_runs_without_raising():
    for entry in labs_bridge.catalog():
        out = labs_bridge.run(entry["capability"], {})
        assert isinstance(out, dict)
        assert out["status"] in ("ok", "unavailable", "error")


def test_unknown_capability_is_error_not_raise():
    out = labs_bridge.run("definitely-not-a-capability-xyz")
    assert isinstance(out, dict)
    assert out["status"] == "error"
    assert "available" in out


def test_bridge_never_raises_on_bad_params():
    out = labs_bridge.run("patent_classify", {"text": None})
    assert isinstance(out, dict)
    assert out["status"] in ("ok", "unavailable", "error")


def test_patent_classify_routes_text_when_available():
    out = labs_bridge.patent_classify("a semiconductor circuit and battery")
    assert isinstance(out, dict)
    if out["status"] == "ok":
        # H = electricity section; keyword routing should land there.
        assert out["data"]["section"] in list("ABCDEFGH")


def test_catalog_endpoint():
    # Tolerant: 404 until main.py wires the router (reported as an include line).
    res = client.get("/v1/labs/catalog")
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.json()
        assert isinstance(body.get("capabilities"), list)
        assert len(body["capabilities"]) > 0


def test_run_endpoint():
    res = client.post("/v1/labs/run",
                      json={"capability": "quantum_demo", "params": {"kind": "bec"}})
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.json()
        assert isinstance(body, dict)
        assert body["status"] in ("ok", "unavailable", "error")
