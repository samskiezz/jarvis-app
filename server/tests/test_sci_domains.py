"""Offline-tolerant tests for the Science Domains catalog (P14 #91-104).

These must pass whether or not the underworld science registry is importable in
the current process. The catalog composes ``science_bridge`` and must never
raise: when the engine is unavailable, counts are 0 / methods empty (honest);
when it IS available, at least one console matches > 0 methods.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.routes import sci_domains as sci_domains_routes  # noqa: E402
from server.services import sci_domains, science_bridge  # noqa: E402

# Mount the router on a standalone app so these tests are self-contained and do
# NOT depend on main.py wiring (main.py is intentionally not edited).
app = FastAPI()
app.include_router(sci_domains_routes.router)
client = TestClient(app)

# The 14 curated consoles the catalog must expose.
_EXPECTED_IDS = {
    "sonar", "meteor", "ocean_buoys", "air_quality", "aerospace", "rf_spectrum",
    "neuro", "seismic", "satellites", "clusters", "epidemic", "quantum",
    "materials", "trajectory",
}


def test_domains_catalog_shape():
    out = sci_domains.domains()
    assert isinstance(out, dict)
    assert "domains" in out and isinstance(out["domains"], list)
    assert out["total"] == len(out["domains"])
    # ~14 named consoles, each with a count field.
    assert len(out["domains"]) == 14
    ids = set()
    for d in out["domains"]:
        assert {"id", "label", "icon", "blurb", "keywords", "count"} <= set(d.keys())
        assert isinstance(d["count"], int)
        assert d["count"] >= 0
        ids.add(d["id"])
    assert ids == _EXPECTED_IDS


def test_domains_available_implies_some_matches():
    out = sci_domains.domains()
    if science_bridge.available():
        # At least one console matches real methods when the engine is live.
        assert any(d["count"] > 0 for d in out["domains"])
    else:
        # Honest when unavailable: every count 0 and a note is present.
        assert all(d["count"] == 0 for d in out["domains"])
        assert out["available"] is False
        assert "note" in out


def test_domain_methods_always_list_never_raises():
    for did in _EXPECTED_IDS:
        out = sci_domains.domain_methods(did)
        assert isinstance(out, dict)
        assert isinstance(out["methods"], list)
        assert out["count"] == len(out["methods"])
        if not science_bridge.available():
            assert out["methods"] == []
            assert "note" in out


def test_domain_methods_unknown_console_is_honest():
    out = sci_domains.domain_methods("not-a-real-console")
    assert isinstance(out, dict)
    assert out["methods"] == []
    assert out["count"] == 0
    assert "note" in out


def test_suggested_inputs_nonempty_per_domain():
    for did in _EXPECTED_IDS:
        examples = sci_domains.suggested_inputs(did)
        assert isinstance(examples, list)
        assert len(examples) > 0
        for ex in examples:
            assert "field" in ex and "value" in ex


def test_suggested_inputs_unknown_console_empty():
    assert sci_domains.suggested_inputs("nope") == []


def test_run_returns_status_dict_never_raises():
    out = sci_domains.run("sonar", "transmission_loss")
    assert isinstance(out, dict)
    assert out["status"] in ("ok", "error", "unavailable")


def test_run_unknown_console_is_error():
    out = sci_domains.run("nope", "anything")
    assert isinstance(out, dict)
    assert out["status"] == "error"


def test_run_bad_params_degrade():
    out = sci_domains.run("sonar", "transmission_loss", {"totally_bogus": 1})
    assert isinstance(out, dict)
    assert out["status"] in ("ok", "error", "unavailable")


# --- Route smoke tests (optional_bearer => public reads) -------------------

def test_route_list_domains():
    res = client.get("/v1/sci/domains")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["domains"], list)
    assert body["total"] == 14


def test_route_domain_methods():
    res = client.get("/v1/sci/domains/quantum/methods")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["methods"], list)


def test_route_domain_examples():
    res = client.get("/v1/sci/domains/seismic/examples")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "seismic"
    assert isinstance(body["examples"], list)
    assert len(body["examples"]) > 0


def test_route_run():
    res = client.post("/v1/sci/domains/sonar/run", json={"field": "transmission_loss"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("ok", "error", "unavailable")
