"""Tests for immunology & virology methods, each verified vs a KNOWN value."""
import math

import numpy as np
import pytest

from underworld.server.services.methods_immunology import (
    ROUTE_TABLE,
    antibody_binding_fraction,
    clonal_expansion,
    dose_response_hill,
    epidemic_final_size,
    herd_immunity_threshold,
    immune_response_logistic,
    neutralization_titer,
    route,
    within_host_viral_dynamics,
)


# ── 1. within-host viral dynamics ─────────────────────────────────────────────
def test_viral_dynamics_R0_and_peak():
    # parameters chosen so R0 = beta*T0*p/(delta*c) is comfortably > 1
    beta, delta, p, c, T0 = 1e-6, 1.0, 10.0, 5.0, 4e8
    res = within_host_viral_dynamics(beta, delta, p, c, T0=T0, t_end=25.0)
    # KNOWN: R0 = beta*T0*p/(delta*c)
    R0_known = beta * T0 * p / (delta * c)
    assert res["R0"] == pytest.approx(R0_known)
    assert R0_known > 1.0
    # KNOWN: acute profile -> viral load peaks then declines
    assert res["has_interior_peak"] is True
    assert res["peak_viral_load"] > res["V"][0]
    assert res["V"][-1] < res["peak_viral_load"]


# ── 2. antibody-antigen binding ───────────────────────────────────────────────
def test_antibody_half_bound_at_Kd():
    Kd = 5e-9
    res = antibody_binding_fraction(Kd, Kd)  # [Ag] = Kd
    # KNOWN: theta = 0.5 when [Ag] = Kd
    assert res["fraction_bound"] == pytest.approx(0.5, abs=1e-12)
    assert res["fraction_bound_at_Kd"] == pytest.approx(0.5)
    # saturation limit
    hi = antibody_binding_fraction(1e6 * Kd, Kd)
    assert hi["fraction_bound"] == pytest.approx(1.0, abs=1e-5)


# ── 3. immune response logistic ───────────────────────────────────────────────
def test_immune_logistic_inflection_and_asymptote():
    K = 1e6
    res = immune_response_logistic(r=1.0, K=K, N0=1e3, t_end=40.0)
    # KNOWN: inflection (max growth rate) at N = K/2
    assert res["N_at_inflection"] == pytest.approx(K / 2.0, rel=1e-9)
    # KNOWN: N -> K
    assert res["asymptote"] == pytest.approx(K, rel=1e-3)


# ── 4. herd-immunity threshold ────────────────────────────────────────────────
def test_herd_immunity_measles():
    # KNOWN: measles R0 = 15 -> pc = 1 - 1/15 ~ 0.9333
    res = herd_immunity_threshold(15.0)
    assert res["herd_immunity_threshold"] == pytest.approx(1 - 1 / 15, rel=1e-12)
    assert res["herd_immunity_threshold"] == pytest.approx(0.93333, abs=1e-4)
    # KNOWN: R0 = 2 -> 0.5
    assert herd_immunity_threshold(2.0)["herd_immunity_threshold"] == pytest.approx(0.5)


# ── 5. dose-response Hill / EC50 ──────────────────────────────────────────────
def test_hill_half_effect_at_EC50():
    for n in (0.5, 1.0, 2.0, 4.0):
        res = dose_response_hill(dose=10.0, EC50=10.0, hill_n=n, Emax=1.0)
        # KNOWN: E = Emax/2 at D = EC50 regardless of n
        assert res["effect"] == pytest.approx(0.5, abs=1e-12)
        assert res["effect_at_EC50"] == pytest.approx(0.5)


# ── 6. neutralization titer ───────────────────────────────────────────────────
def test_neutralization_titer():
    # ic50 = 1/64 => half-neutralization at dilution 1/d = 1/64 => d = 64
    ic50 = 1.0 / 64.0
    res = neutralization_titer(ic50, start_dilution=1.0, fold=2.0, n_dilutions=12)
    # KNOWN: half-neut dilution = 1/ic50 = 64
    assert res["half_neut_dilution"] == pytest.approx(64.0)
    # KNOWN: largest dilution with 1/d >= ic50 is exactly 64 (neut == 0.5 there)
    assert res["titer"] == pytest.approx(64.0)
    idx = np.argmin(np.abs(res["dilutions"] - 64.0))
    assert res["neutralization"][idx] == pytest.approx(0.5)


# ── 7. epidemic final-size relation ───────────────────────────────────────────
def test_final_size_R0_2():
    res = epidemic_final_size(2.0)
    Z = res["final_size"]
    # KNOWN: R0 = 2 -> Z ~ 0.7968
    assert Z == pytest.approx(0.79681213, abs=1e-6)
    # implicit equation must be satisfied: 1 - Z = exp(-R0 Z)
    assert (1 - Z) == pytest.approx(math.exp(-2.0 * Z), abs=1e-10)
    assert res["residual"] == pytest.approx(0.0, abs=1e-10)
    # below threshold -> no epidemic
    assert epidemic_final_size(0.8)["final_size"] == 0.0


# ── 8. clonal expansion ───────────────────────────────────────────────────────
def test_clonal_exponential_expansion():
    N0, td = 100.0, 2.0
    res = clonal_expansion(N0=N0, doubling_time=td, t_end=10.0, n_steps=1001)
    # KNOWN: after k doubling times N = N0 * 2^k -> at t=10, td=2 => 2^5 = 32x
    assert res["fold_expansion"] == pytest.approx(32.0, rel=1e-6)
    assert res["N_final"] == pytest.approx(N0 * 2 ** 5, rel=1e-6)
    # growth rate r = ln2/td
    assert res["growth_rate"] == pytest.approx(math.log(2) / td)


# ── route table ───────────────────────────────────────────────────────────────
def test_route_table():
    assert route("viral_dynamic") is within_host_viral_dynamics
    assert route("virolog") is within_host_viral_dynamics
    assert route("antibody") is antibody_binding_fraction
    assert route("immune") is immune_response_logistic
    assert route("immunolog") is immune_response_logistic
    assert route("herd_immunity") is herd_immunity_threshold
    assert route("vaccine") is herd_immunity_threshold
    assert route("ld50") is dose_response_hill
    assert route("toxicol") is dose_response_hill
    assert route("neutraliz") is neutralization_titer
    assert route("final_size") is epidemic_final_size
    assert route("tcell") is clonal_expansion
    assert route("nonexistent_keyword_xyz") is None
    # every route maps to a real callable
    for fn in ROUTE_TABLE.values():
        assert callable(fn)
