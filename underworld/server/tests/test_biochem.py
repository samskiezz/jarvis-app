"""Expansion #61-70 — chemistry, biology & medicine laws + epidemic dynamics."""

from __future__ import annotations

import math

from underworld.server.physics import engine, epidemiology
from underworld.server.physics.epidemiology import SIR


def test_new_biochem_laws_registered_and_correct():
    for lid in ("arrhenius", "gibbs_reaction", "henderson_hasselbalch", "fick_flux",
                "michaelis_menten", "logistic_growth", "hardy_weinberg",
                "basic_reproduction", "drug_clearance"):
        assert engine.get_law(lid) is not None, lid
    # Arrhenius: rate rises with temperature
    k_cold = engine.get_law("arrhenius").fn(1e9, 5e4, 300)
    k_hot = engine.get_law("arrhenius").fn(1e9, 5e4, 600)
    assert k_hot > k_cold
    # Henderson-Hasselbalch: equal acid/base → pH == pKa
    assert abs(engine.get_law("henderson_hasselbalch").fn(4.7, 0.1, 0.1) - 4.7) < 1e-9
    # Michaelis-Menten saturates: v(S>>KM) → Vmax
    v = engine.get_law("michaelis_menten").fn(1e-3, 1.0, 1e-6)
    assert abs(v - 1e-3) < 1e-5
    # Hardy-Weinberg heterozygosity is maximal at p = 0.5
    assert engine.get_law("hardy_weinberg").fn(0.5) == 0.5
    # drug clearance halves about every half-life
    assert engine.get_law("drug_clearance").fn(100, math.log(2), 1.0) < 51


def test_logistic_rate_zero_at_capacity():
    rate = engine.get_law("logistic_growth").fn(1.0, 1000, 1000)   # N == K
    assert abs(rate) < 1e-6


def test_r0_and_epidemic_threshold():
    assert abs(epidemiology.r0(0.6, 0.2) - 3.0) < 1e-9
    assert epidemiology.epidemic_peaks(0.6, 0.2) is True       # R0 = 3 > 1
    assert epidemiology.epidemic_peaks(0.1, 0.5) is False      # R0 = 0.2 < 1


def test_sir_step_conserves_population_and_spreads():
    s0 = SIR(S=990, I=10, R=0)
    s1 = epidemiology.sir_step(s0, beta=0.5, gamma=0.1)
    assert abs(s1.N - s0.N) < 1e-6                              # nobody vanishes
    assert s1.I > s0.I and s1.S < s0.S                          # the disease spread


def test_biochem_law_route(client, headers):
    solved = client.post("/physics/solve", headers=headers,
                         json={"law_id": "hardy_weinberg", "inputs": {"p": 0.5}}).json()
    assert abs(solved["value"] - 0.5) < 1e-9
