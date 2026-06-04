"""Offline-tolerant tests for the science bridge.

These must pass whether or not the underworld science registry is importable in
the current process: if it imports, assert real listings/runs; if it doesn't,
assert the graceful ``unavailable`` shape. The bridge must never raise.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.services import science_bridge  # noqa: E402

client = TestClient(app)


def test_list_methods_shape():
    methods = science_bridge.list_methods()
    if science_bridge.available():
        assert isinstance(methods, list)
        assert len(methods) > 0
        m = methods[0]
        assert set(("key", "domain", "doc")) <= set(m.keys())
        # Grouping is meaningful — more than one domain is represented.
        assert len({x["domain"] for x in methods}) > 1
    else:
        assert isinstance(methods, dict)
        assert methods["status"] == "unavailable"


def test_run_method_known_key():
    if science_bridge.available():
        out = science_bridge.run_method("lorentz")
        assert isinstance(out, dict)
        assert out.get("status") == "ok"
        # The registry returns a normalised result with an engine + data.
        assert "engine" in out
    else:
        out = science_bridge.run_method("lorentz")
        assert isinstance(out, dict)
        assert out["status"] == "unavailable"


def test_run_method_unknown_field_is_error_not_raise():
    if not science_bridge.available():
        return
    out = science_bridge.run_method("definitely-not-a-real-method-xyz")
    assert isinstance(out, dict)
    assert out["status"] == "error"


def test_run_method_with_seed_param():
    if not science_bridge.available():
        return
    out = science_bridge.run_method("lorentz", {"seed": 3})
    assert isinstance(out, dict)
    assert out["status"] in ("ok", "error")


def test_bridge_never_raises_on_bad_params():
    # Garbage params must degrade to an error dict, never an exception.
    out = science_bridge.run_method("lorentz", {"totally_bogus_kwarg": 123})
    assert isinstance(out, dict)
    assert out["status"] in ("ok", "error", "unavailable")


def test_methods_endpoint():
    res = client.get("/functions/science/methods")
    assert res.status_code == 200
    body = res.json()
    if science_bridge.available():
        assert isinstance(body, list)
        assert len(body) > 0
    else:
        assert body["status"] == "unavailable"


def test_run_endpoint():
    res = client.post("/functions/science/run", json={"field": "lorentz"})
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    assert body["status"] in ("ok", "error", "unavailable")
