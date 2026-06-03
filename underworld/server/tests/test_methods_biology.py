"""Tests for real, named biology methods — each asserted vs a KNOWN value.

Citations are inline. Imports use the `underworld.*` path (conftest puts the
repo root on sys.path).
"""
import math

import pytest

from underworld.server.services.methods_biology import (
    hardy_weinberg,
    jukes_cantor_distance,
    logistic_growth,
    lotka_volterra,
    michaelis_menten,
    one_compartment_pk,
    seir_epidemic,
    wright_fisher_drift,
)


# 1. Wright-Fisher: neutral fixation probability == initial frequency p0.
#    KNOWN (Kimura; Wright-Fisher neutral theory): P(fixation) = p0.
def test_wright_fisher_fixation_equals_initial_frequency():
    res = wright_fisher_drift(p0=0.3, pop_size=25, n_replicates=4000, seed=7)
    assert res["expected_fixation_probability"] == 0.3
    # Monte-Carlo estimate within sampling error of 0.3.
    assert abs(res["fixation_probability"] - 0.3) < 0.04
    assert res["all_resolved"]


def test_wright_fisher_half_fixes_half():
    res = wright_fisher_drift(p0=0.5, pop_size=20, n_replicates=4000, seed=3)
    assert abs(res["fixation_probability"] - 0.5) < 0.04


# 2. Lotka-Volterra: coexistence equilibrium x*=gamma/delta, y*=alpha/beta,
#    closed orbits (conserved quantity), oscillation.
#    KNOWN: Lotka-Volterra equations (Wikipedia / standard ecology texts).
def test_lotka_volterra_equilibrium_and_cycles():
    r = lotka_volterra(alpha=1.0, beta=0.1, delta=0.075, gamma=1.5,
                       prey0=10.0, pred0=5.0)
    assert abs(r["prey_equilibrium"] - 1.5 / 0.075) < 1e-6   # = 20
    assert abs(r["pred_equilibrium"] - 1.0 / 0.1) < 1e-6     # = 10
    assert r["oscillates"]
    assert r["coexists"]
    # Conserved quantity stays (numerically) constant along the orbit.
    assert r["conserved_drift"] < 1e-2


# 3. Michaelis-Menten: v == Vmax/2 exactly when [S] == Km.
#    KNOWN: definition of Km (Michaelis & Menten, 1913).
def test_michaelis_menten_half_vmax_at_km():
    r = michaelis_menten(vmax=2.0, km=0.5, substrate=[0.5, 5.0, 50.0])
    assert r["v_at_km_equals_half_vmax"]
    assert abs(r["v_at_km"] - 1.0) < 1e-9          # Vmax/2 = 1.0
    # Saturation: at [S] >> Km velocity approaches Vmax.
    assert abs(r["velocity"][-1] - 2.0) < 0.05


# 4. Logistic growth: N(t) -> carrying capacity K.
#    KNOWN: Verhulst logistic equation, inflection at K/2.
def test_logistic_growth_reaches_carrying_capacity():
    r = logistic_growth(r=0.5, K=1000.0, N0=10.0, t_max=100.0)
    assert r["approaches_K"]
    assert abs(r["N_final"] - 1000.0) < 1.0
    assert abs(r["inflection_N"] - 500.0) < 1e-9
    assert r["monotonic"]


# 5. SEIR: R0 = beta/gamma; epidemic iff R0 > 1.
#    KNOWN: basic reproduction number threshold (Wikipedia / Brauer).
def test_seir_R0_and_threshold():
    above = seir_epidemic(beta=0.6, sigma=0.2, gamma=0.2)   # R0 = 3
    assert abs(above["R0"] - 3.0) < 1e-9
    assert above["above_threshold"]
    assert above["epidemic_occurs"]
    assert above["threshold_consistent"]

    below = seir_epidemic(beta=0.1, sigma=0.2, gamma=0.2)   # R0 = 0.5
    assert abs(below["R0"] - 0.5) < 1e-9
    assert not below["above_threshold"]
    assert not below["epidemic_occurs"]
    assert below["threshold_consistent"]


# 6. One-compartment PK: t_half = ln(2)/k; conc halves at one half-life.
#    KNOWN: first-order elimination kinetics.
def test_one_compartment_half_life():
    r = one_compartment_pk(dose=100.0, volume=10.0, k_elim=0.1)
    assert abs(r["C0"] - 10.0) < 1e-9
    assert abs(r["half_life"] - math.log(2) / 0.1) < 1e-7    # ~6.9315 h
    assert r["half_life_halves_conc"]
    assert abs(r["C_at_half_life"] - 5.0) < 1e-9             # C0/2
    # AUC_inf = C0/k = 10/0.1 = 100.
    assert abs(r["AUC_inf"] - 100.0) < 1e-6
    assert abs(r["clearance"] - 1.0) < 1e-9                  # k*V = 0.1*10


# 7. Hardy-Weinberg: p^2 + 2pq + q^2 == 1.
#    KNOWN: Hardy-Weinberg principle.
def test_hardy_weinberg_sums_to_one():
    r = hardy_weinberg(p=0.6)
    assert r["sums_to_one"]
    assert abs(r["total"] - 1.0) < 1e-12
    assert abs(r["AA"] - 0.36) < 1e-9
    assert abs(r["Aa"] - 0.48) < 1e-9
    assert abs(r["aa"] - 0.16) < 1e-9


@pytest.mark.parametrize("p", [0.0, 0.1, 0.25, 0.5, 0.75, 0.99, 1.0])
def test_hardy_weinberg_identity_all_p(p):
    r = hardy_weinberg(p=p)
    assert abs(r["total"] - 1.0) < 1e-12


# 8. Jukes-Cantor: d = -3/4 ln(1 - 4/3 p).
#    KNOWN: Jukes & Cantor (1969) correction.
def test_jukes_cantor_formula():
    p = 0.2
    expected = -0.75 * math.log(1.0 - (4.0 / 3.0) * p)
    r = jukes_cantor_distance(p_diff=p)
    assert abs(r["jc_distance"] - expected) < 1e-8
    assert r["correction_exceeds_pdistance"]
    # p = 0 gives distance 0.
    assert abs(jukes_cantor_distance(p_diff=0.0)["jc_distance"]) < 1e-12


def test_jukes_cantor_from_sequences():
    # 2 mismatches out of 8 sites -> p = 0.25.
    r = jukes_cantor_distance(seq1="AAAAAAAA", seq2="AACAAAAG")
    assert abs(r["p_diff"] - 0.25) < 1e-12
    expected = -0.75 * math.log(1.0 - (4.0 / 3.0) * 0.25)
    assert abs(r["jc_distance"] - expected) < 1e-8


def test_jukes_cantor_saturation_raises():
    with pytest.raises(ValueError):
        jukes_cantor_distance(p_diff=0.75)
