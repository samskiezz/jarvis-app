"""Offline-tolerant tests for the underworld platform bridge.

These must pass whether or not the underworld platform is importable in the
current process: if it imports, assert real dict results (an optimize best value,
a graph pagerank, a counterfactual divergence, a temporal slice); if it doesn't,
assert the graceful ``unavailable`` shape. The bridge must never raise.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.routes import bridge as bridge_routes  # noqa: E402
from server.services import underworld_bridge as ub  # noqa: E402

# The bridge router is a ready-to-mount APIRouter; main.py wires it in production.
# Mount it here if it isn't already so the route tests exercise the real paths
# regardless of whether the include line has been added to main.py yet.
if not any(getattr(r, "path", "").startswith("/v1/bridge") for r in app.routes):
    app.include_router(bridge_routes.router)

client = TestClient(app)


# ── direct wrapper tests ─────────────────────────────────────────────────────
def test_graph_analytics_shape():
    objects = [
        {"id": "principle:lever", "kind": "principle", "confidence": "A"},
        {"id": "material:bronze", "kind": "material", "confidence": "B"},
        {"id": "invention:crane", "kind": "invention", "confidence": "C"},
    ]
    links = [
        {"src": "invention:crane", "dst": "principle:lever", "kind": "requires"},
        {"src": "invention:crane", "dst": "material:bronze", "kind": "requires"},
    ]
    out = ub.graph_analytics(objects, links)
    assert isinstance(out, dict)
    if ub.available():
        assert out["status"] == "ok"
        assert isinstance(out["pagerank"], dict)
        assert len(out["pagerank"]) > 0
        # crane requires lever + bronze transitively.
        assert set(out["prerequisites"]["invention:crane"]) == {
            "principle:lever", "material:bronze"
        }
        assert "novelty" in out and isinstance(out["novelty"], dict)
        assert 0.0 <= out["real_fraction"] <= 1.0
    else:
        assert out["status"] == "unavailable"


def test_optimize_returns_best_value():
    out = ub.optimize("branin", n_iter=8, seed=1)
    assert isinstance(out, dict)
    if ub.available():
        assert out["status"] == "ok"
        assert out["objective"] == "branin"
        assert isinstance(out["best_value"], float)
        # Branin published optimum is 0.397887; BO with a small budget should at
        # least land in a sane finite range and report a non-negative regret.
        assert out["regret"] >= 0.0
        assert out["n_eval"] > 0
        assert len(out["best_x"]) == out["dim"] == 2
    else:
        assert out["status"] == "unavailable"


def test_optimize_unknown_objective_is_error_not_raise():
    out = ub.optimize("not-a-real-benchmark")
    assert isinstance(out, dict)
    if ub.available():
        assert out["status"] == "error"
        assert "available" in out
    else:
        assert out["status"] == "unavailable"


def test_counterfactual_divergence():
    baseline = {"population": 100, "knowledge": 0.4, "war_risk": 0.2}
    intervention = {"population": 80, "knowledge": 0.6, "war_risk": 0.5}
    out = ub.counterfactual(baseline, intervention, label="library burns")
    assert isinstance(out, dict)
    if ub.available():
        assert out["status"] == "ok"
        assert out["divergence"]["population"] == -20.0
        assert out["divergence"]["knowledge"] == 0.2
        assert "library burns" in out["summary"]
    else:
        assert out["status"] == "unavailable"


def test_temporal_query_slice():
    nodes = [
        {"id": "n1", "label": "phlogiston", "valid_from": 0, "valid_to": 50},
        {"id": "n2", "label": "oxygen", "valid_from": 40},
    ]
    out = ub.temporal_query(nodes, tick=60)
    assert isinstance(out, dict)
    if ub.available():
        assert out["status"] == "ok"
        assert out["active"] == ["n2"]          # n1 lapsed at 50
        assert "n1" in out["forgotten"]
    else:
        assert out["status"] == "unavailable"


def test_causal_chain_walk():
    edges = [
        {"cause": "drought", "effect": "famine"},
        {"cause": "famine", "effect": "migration"},
    ]
    out = ub.causal_chain(edges, "drought")
    assert isinstance(out, dict)
    if ub.available():
        assert out["status"] == "ok"
        assert out["chain"][0] == "drought"
        assert "migration" in out["chain"]
        assert out["length"] == 3
    else:
        assert out["status"] == "unavailable"


def test_world_summary_shape():
    out = ub.world_summary()
    assert isinstance(out, dict)
    assert out["status"] in ("ok", "unavailable", "error")


def test_wrappers_never_raise_on_garbage():
    # Malformed inputs must degrade to a dict, never raise.
    for out in (
        ub.graph_analytics([{"no_id": 1}], [{"src": "x"}]),
        ub.counterfactual("not-a-dict", None),  # type: ignore[arg-type]
        ub.temporal_query([{"id": "z", "valid_from": "bad"}], tick=1),
        ub.causal_chain([{"cause": "a"}], "a"),
    ):
        assert isinstance(out, dict)
        assert out["status"] in ("ok", "error", "unavailable")


# ── route tests (always 200, always graceful) ────────────────────────────────
def test_route_graph():
    res = client.post("/v1/bridge/graph", json={
        "objects": [{"id": "a", "kind": "principle"}, {"id": "b", "kind": "invention"}],
        "links": [{"src": "b", "dst": "a", "kind": "requires"}],
    })
    assert res.status_code == 200
    assert res.json()["status"] in ("ok", "unavailable", "error")


def test_route_optimize():
    res = client.post("/v1/bridge/optimize", json={"objective_name": "branin", "n_iter": 5})
    assert res.status_code == 200
    assert res.json()["status"] in ("ok", "unavailable", "error")


def test_route_counterfactual():
    res = client.post("/v1/bridge/counterfactual", json={
        "baseline": {"population": 10}, "intervention": {"population": 5},
    })
    assert res.status_code == 200
    assert res.json()["status"] in ("ok", "unavailable", "error")


def test_route_temporal_slice_and_chain():
    res = client.post("/v1/bridge/temporal", json={
        "nodes": [{"id": "n1", "valid_from": 0}], "tick": 1,
    })
    assert res.status_code == 200
    assert res.json()["status"] in ("ok", "unavailable", "error")

    res = client.post("/v1/bridge/temporal", json={
        "edges": [{"cause": "a", "effect": "b"}], "start": "a",
    })
    assert res.status_code == 200
    assert res.json()["status"] in ("ok", "unavailable", "error")
