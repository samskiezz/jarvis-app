"""Expansion remainders — engineering/safety/meta helpers + the final laws."""

from __future__ import annotations

import random

import pytest

from underworld.server.physics import engine
from underworld.server.services import engineering


# ── remaining physics laws ───────────────────────────────────────────────────
def test_remainder_laws_registered_and_correct():
    for lid in ("von_mises", "avrami", "tolerance_stack", "fourier_conduction",
                "carnot_cop", "heat_exchanger", "clausius_clapeyron", "pascal_hydraulic",
                "clausius_forcing", "stream_power", "drag_force", "abbe_resolution",
                "sabine_reverb", "shot_noise", "microgrid_balance"):
        assert engine.get_law(lid) is not None, lid
    # drag rises with v^2
    assert engine.get_law("drag_force").fn(rho=1.2, Cd=0.5, A=1, v=20) == \
        4 * engine.get_law("drag_force").fn(rho=1.2, Cd=0.5, A=1, v=10)
    # hydraulic press multiplies force by the area ratio
    assert engine.get_law("pascal_hydraulic").fn(F1=100, A1=0.01, A2=1.0) == 10000
    # CO2 doubling ≈ 3.7 W/m^2 of forcing
    assert abs(engine.get_law("clausius_forcing").fn(C=560, C0=280) - 3.71) < 0.05
    assert engine.list_laws().__len__() >= 80


# ── #83 building code ─────────────────────────────────────────────────────────
def test_building_code_inspector():
    assert engineering.safety_factor(150, 100) == 1.5
    assert engineering.building_code_ok(200, 100) is True
    assert engineering.building_code_ok(120, 100) is False     # SF 1.2 < 1.5 required


# ── #88/#89 occupational + evacuation ────────────────────────────────────────
def test_occupational_and_evacuation():
    assert engineering.occupational_risk(0.1, 0.5, 0.8) == 0.04
    # bottleneck caps the achievable flow
    assert engineering.evacuation_flow(1.0, 2.0, 10.0, bottleneck=5.0) == 5.0
    assert engineering.evacuation_flow(1.0, 2.0, 10.0) == 20.0


# ── #90 ethics gate ──────────────────────────────────────────────────────────
def test_ethical_gate_contains_dangerous_tech():
    safe = engineering.ethical_review(0.2, 0.2, 0.2, 0.2)
    dangerous = engineering.ethical_review(0.9, 0.9, 0.9, 0.9)
    assert safe["approved"] is True and safe["verdict"] == "DEPLOY"
    assert dangerous["approved"] is False and dangerous["verdict"] == "CONTAIN"


# ── #100 meta debugger ───────────────────────────────────────────────────────
def test_anomaly_flags_discoveries():
    assert engineering.anomaly(10.0, 9.99, 0.05)["anomaly"] is False    # within error
    flagged = engineering.anomaly(10.0, 8.0, 0.1)
    assert flagged["anomaly"] is True and abs(flagged["residual"] - 2.0) < 1e-9


# ── #8 constant discovery ────────────────────────────────────────────────────
def test_better_instruments_measure_constants_more_accurately():
    rng = random.Random(0)
    crude = [engineering.measure_constant(9.81, 0.1, rng)["relative_error"] for _ in range(200)]
    fine = [engineering.measure_constant(9.81, 0.001, rng)["relative_error"] for _ in range(200)]
    assert sum(fine) / len(fine) < sum(crude) / len(crude)


# ── #6 boundary conditions ───────────────────────────────────────────────────
def test_boundary_validation():
    assert engineering.boundary_valid("dirichlet", 300.0) is True
    assert engineering.boundary_valid("neumann", 0.0) is True
    assert engineering.boundary_valid("nonsense", 1.0) is False


# ── routes ────────────────────────────────────────────────────────────────────
def test_engineering_routes(client, headers):
    bc = client.post("/science/building-code", headers=headers,
                    json={"capacity": 120, "demand": 100}).json()
    assert bc["passes"] is False
    eg = client.post("/science/ethics-gate", headers=headers,
                    json={"severity": 0.9, "likelihood": 0.9, "irreversibility": 0.9, "misuse": 0.9}).json()
    assert eg["verdict"] == "CONTAIN"


@pytest.mark.asyncio
async def test_causal_replay_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "Replay", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 3})
    body = client.get(f"/worlds/{wid}/replay?around_tick=2&window=3", headers=headers).json()
    assert "chain" in body and isinstance(body["chain"], list)
