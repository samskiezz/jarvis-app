"""Offline tests for the SCENARIO / MODELING service.

Fully offline + deterministic: a temp ``SCENARIO_DB`` is set before importing the
service, and the underworld engine is NOT required to be running — the bridge
calls degrade gracefully to the honest local fallbacks. Run:
    python3 -m pytest server/tests/test_scenario.py -q
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Point the scenario store at a fresh temp DB BEFORE importing the service so the
# import-time init_db() and every call use the isolated path.
_TMP = tempfile.mkdtemp(prefix="scenario_test_")
os.environ["SCENARIO_DB"] = os.path.join(_TMP, "scenario.db")
os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.routes import scenario as scenario_routes  # noqa: E402
from server.services import scenario as S  # noqa: E402
from server.services import science_bridge as SB  # noqa: E402

# The scenario router is delivered ready-to-mount (main.py is not edited), so
# the route tests mount it here to exercise the HTTP surface offline.
if not any(getattr(r, "path", "").startswith("/v1/scenario") for r in app.router.routes):
    app.include_router(scenario_routes.router)

client = TestClient(app)
HEADERS = {"Authorization": "Bearer test-key"}


# ── run_scenario: persists + returns baseline/scenario, honest engine ──────────
def test_run_scenario_persists_and_returns_series():
    out = S.run_scenario(
        "demand-shock",
        {"baseline": 100.0, "horizon": 6, "growth_pct": 1.0, "shock_pct": -5.0},
    )
    assert isinstance(out, dict)
    assert out["name"] == "demand-shock"
    assert out["engine"] in ("counterfactual", "local-shock")
    res = out["result"]
    # baseline vs scenario series present and correctly sized.
    assert isinstance(res["baseline"], list) and len(res["baseline"]) == 6
    assert isinstance(res["scenario"], list) and len(res["scenario"]) == 6
    # a -5% per-step shock makes the scenario end below the baseline.
    assert res["scenario"][-1]["v"] < res["baseline"][-1]["v"]

    # persisted + retrievable by id.
    got = S.get_scenario(out["id"])
    assert got is not None
    assert got["id"] == out["id"]
    assert got["name"] == "demand-shock"


def test_run_scenario_never_raises_on_garbage_params():
    out = S.run_scenario("junk", {"baseline": "nonsense", "horizon": "x", "shocks": ["a"]})
    assert isinstance(out, dict)
    assert out["engine"] in ("counterfactual", "local-shock")
    assert len(out["result"]["baseline"]) >= 1


def test_list_scenarios():
    S.run_scenario("listed-a", {"horizon": 3})
    S.run_scenario("listed-b", {"horizon": 3})
    runs = S.list_scenarios(limit=10)
    assert isinstance(runs, list)
    assert len(runs) >= 2
    names = {r["name"] for r in runs}
    assert "listed-a" in names and "listed-b" in names


def test_get_scenario_missing_returns_none():
    assert S.get_scenario("does-not-exist") is None


# ── model registry ─────────────────────────────────────────────────────────────
def test_model_registry_returns_list():
    reg = S.model_registry()
    assert isinstance(reg, dict)
    assert isinstance(reg["models"], list)
    assert reg["count"] == len(reg["models"])
    for m in reg["models"]:
        assert "name" in m and "kind" in m and "trained" in m
    # drift is either an honest block or null-with-note.
    if reg["drift"] is None:
        assert reg["drift_note"]
    else:
        assert reg["drift_engine"] == "ai_models"


# ── optimize: best point within bounds, honest engine ──────────────────────────
def test_optimize_default_objective_within_bounds():
    bounds = {"x": [-10.0, 10.0], "y": [-5.0, 5.0]}
    out = S.optimize(objective=None, bounds=bounds, n_iter=40)
    assert out["engine"] in ("random-search", "real_optimizer")
    if out["engine"] == "random-search":
        best = out["best"]
        assert set(best.keys()) == {"x", "y"}
        assert -10.0 <= best["x"] <= 10.0
        assert -5.0 <= best["y"] <= 5.0
        # default objective is maximised near the origin (midpoint of the box).
        assert abs(best["x"]) < 5.0 and abs(best["y"]) < 2.5
        assert out["best_value"] is not None


def test_optimize_custom_objective():
    # Maximise -(x-3)^2 -> best x near 3, well inside [0, 6].
    out = S.optimize(objective=lambda p: -((p["x"] - 3.0) ** 2), bounds={"x": [0.0, 6.0]}, n_iter=60)
    assert out["engine"] == "random-search"  # local python objective never hits the bridge
    assert 0.0 <= out["best"]["x"] <= 6.0
    assert abs(out["best"]["x"] - 3.0) < 1.5


def test_optimize_no_bounds_is_graceful():
    out = S.optimize(objective=None, bounds=None, n_iter=10)
    assert out["best"] is None
    assert out["history"] == []


# ── route layer (offline) ──────────────────────────────────────────────────────
def test_routes_run_list_get_models_optimize():
    r = client.post(
        "/v1/scenario/run",
        json={"name": "route-run", "params": {"horizon": 4, "shock_pct": 2.0}},
        headers=HEADERS,
    )
    assert r.status_code == 200
    rid = r.json()["id"]

    r = client.get("/v1/scenario/list", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["count"] >= 1

    r = client.get(f"/v1/scenario/{rid}", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["id"] == rid

    r = client.get("/v1/scenario/missing-id-xyz", headers=HEADERS)
    assert r.status_code == 404

    r = client.get("/v1/scenario/models", headers=HEADERS)
    assert r.status_code == 200
    assert isinstance(r.json()["models"], list)

    r = client.post(
        "/v1/scenario/optimize",
        json={"bounds": {"x": [-2.0, 2.0]}, "n_iter": 20},
        headers=HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] in ("random-search", "real_optimizer")


def test_run_requires_bearer():
    # require_bearer: without a token (and with a configured key) -> 401.
    r = client.post("/v1/scenario/run", json={"name": "x", "params": {}})
    assert r.status_code == 401


# ── REAL-ENGINE wiring (Part A): in-process science_bridge path ────────────────
# scenario.py imports ``science_bridge as _bridge``; monkeypatching the module's
# ``available`` + ``run_method`` exercises the in-process bridge tier without any
# network and without the underworld package actually being importable.
def test_run_scenario_uses_bridge_counterfactual(monkeypatch):
    fake = {
        "status": "ok",
        "field": "world_model.counterfactual",
        "engine": "world_model_counterfactual",
        "data": {"effect": 0.42, "series": [1, 2, 3]},
    }
    monkeypatch.setattr(SB, "available", lambda: True)
    monkeypatch.setattr(SB, "run_method", lambda field, params=None: fake)

    out = S.run_scenario("bridge-cf", {"horizon": 5, "shock_pct": 1.0})
    assert out["engine"] == "counterfactual"
    res = out["result"]
    assert res["engine"] == "counterfactual"
    # The real bridge result is carried through verbatim.
    assert res["counterfactual"] == fake
    assert "in-process bridge" in res["note"]


def test_optimize_uses_real_optimizer_via_bridge(monkeypatch):
    fake = {
        "status": "ok",
        "best": {"x": 0.0, "y": 0.0},
        "best_value": 0.0,
        "history": [{"point": {"x": 0.1, "y": -0.1}, "value": -0.02}],
    }
    monkeypatch.setattr(SB, "available", lambda: True)
    monkeypatch.setattr(SB, "run_method", lambda field, params=None: fake)

    out = S.optimize(objective=None, bounds={"x": [-10.0, 10.0], "y": [-5.0, 5.0]}, n_iter=10)
    assert out["engine"] == "real_optimizer"
    # The real optimizer's result is carried through verbatim.
    assert out["result"] == fake
    assert "in-process bridge" in out["note"]


def test_model_registry_drift_via_bridge(monkeypatch):
    fake = {"status": "ok", "psi": 0.03, "ece": 0.01}
    monkeypatch.setattr(SB, "available", lambda: True)
    monkeypatch.setattr(SB, "run_method", lambda field, params=None: fake)

    reg = S.model_registry()
    assert reg["drift_engine"] == "ai_models"
    assert reg["drift"]["engine"] == "ai_models"
    assert reg["drift"]["data"] == fake
    assert reg["drift_note"] is None


# ── HONEST fallback when the bridge is unavailable (and HTTP unreachable) ───────
def test_run_scenario_falls_back_when_bridge_unavailable(monkeypatch):
    # Bridge reports unavailable; the HTTP gateway is forced to an unreachable
    # target so the local what-if must answer honestly.
    monkeypatch.setattr(SB, "available", lambda: False)
    monkeypatch.setenv("UNDERWORLD_URL", "http://127.0.0.1:9")  # discard port
    monkeypatch.setenv("SCENARIO_HTTP_TIMEOUT", "0.2")

    out = S.run_scenario("fallback", {"horizon": 4, "shock_pct": -3.0})
    assert out["engine"] == "local-shock"
    assert out["result"]["engine"] == "local-shock"
    assert len(out["result"]["baseline"]) == 4


def test_optimize_falls_back_when_bridge_unavailable(monkeypatch):
    monkeypatch.setattr(SB, "available", lambda: False)
    monkeypatch.setenv("UNDERWORLD_URL", "http://127.0.0.1:9")
    monkeypatch.setenv("SCENARIO_HTTP_TIMEOUT", "0.2")

    out = S.optimize(objective=None, bounds={"x": [-2.0, 2.0]}, n_iter=15)
    assert out["engine"] == "random-search"
    assert out["best"] is not None
