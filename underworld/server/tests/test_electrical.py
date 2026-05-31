"""Expansion #41-50 — electricity & power systems (engine laws + circuit helpers)."""

from __future__ import annotations

import math

from underworld.server.physics import electrical, engine


# ── engine laws minions can discover + calculate ─────────────────────────────
def test_new_electrical_laws_registered_and_correct():
    ids = {"joule_heating", "faraday_emf", "transformer", "lorentz_wire", "nernst",
           "three_phase_power", "skin_depth", "friis", "shannon"}
    for lid in ids:
        assert engine.get_law(lid) is not None, lid
    assert engine.get_law("joule_heating").fn(3, 4) == 36          # I²R = 9·4
    assert engine.get_law("transformer").fn(120, 10, 100) == 1200  # step-up ×10
    # Nernst at Q=1 returns the standard potential (ln 1 = 0)
    assert abs(engine.get_law("nernst").fn(1.1, 2, 1.0, 298) - 1.1) < 1e-9
    # Lorentz force is maximal at 90°, zero when parallel
    assert engine.get_law("lorentz_wire").fn(10, 1, 0.5, math.pi / 2) > \
        engine.get_law("lorentz_wire").fn(10, 1, 0.5, 0.0)


# ── circuit helpers ──────────────────────────────────────────────────────────
def test_ohm_solver_fills_missing_quantity():
    assert electrical.ohm_solve(V=12, R=4)["I"] == 3
    assert electrical.ohm_solve(I=2, R=5)["V"] == 10
    assert electrical.ohm_solve(V=10, I=2)["R"] == 5


def test_kirchhoff_laws():
    assert electrical.kirchhoff_voltage_ok([5, -2, -3])            # sums to 0
    assert not electrical.kirchhoff_voltage_ok([5, -1])
    assert electrical.kirchhoff_current_ok([3, 2], [5])            # in = out
    assert not electrical.kirchhoff_current_ok([3], [5])


def test_undersized_wire_overheats():
    # thin wire (high R/m) at high current sheds too little → fire risk
    assert electrical.wire_overheats(30, 0.5, 10, dissipation_w=100) is True
    assert electrical.wire_overheats(1, 0.01, 10, dissipation_w=100) is False


def test_power_factor_and_capacity():
    assert electrical.power_factor(800, 1000) == 0.8
    assert electrical.shannon_capacity(1e6, 1000) > electrical.shannon_capacity(1e6, 1)


def test_ohm_route(client, headers):
    body = client.post("/physics/electrical/ohm", headers=headers, json={"V": 12, "R": 4}).json()
    assert body["I"] == 3 and body["power_W"] == 36
    # the same law minions calculate is solvable through the engine route
    solved = client.post("/physics/solve", headers=headers,
                         json={"law_id": "joule_heating", "inputs": {"I": 2, "R": 10}}).json()
    assert abs(solved["value"] - 40) < 1e-6
