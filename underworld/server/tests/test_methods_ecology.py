"""Verify the real ecology / environmental-science methods against KNOWN values.

Each test asserts a computed result against an independently published / textbook
known value, not against the implementation's own output.
"""
from __future__ import annotations

import math

import pytest

from underworld.server.services.methods_ecology import (
    biodiversity_indices,
    species_area_relationship,
    island_biogeography_equilibrium,
    carbon_box_decay,
    may_food_web_stability,
    maximum_sustainable_yield,
    michaelis_menten_uptake,
    ecological_footprint,
)


# ── 1. Biodiversity indices ───────────────────────────────────────────────────
def test_shannon_of_even_community_equals_ln_S():
    # KNOWN: even community of S species -> H' = ln(S), evenness J = 1.
    for S in (2, 5, 10, 50):
        r = biodiversity_indices([10] * S)
        assert math.isclose(r["shannon_H"], math.log(S), rel_tol=1e-12)
        assert math.isclose(r["shannon_evenness_J"], 1.0, rel_tol=1e-12)


def test_simpson_of_even_community():
    # KNOWN: even community -> Simpson D = 1/S, inverse-Simpson = S.
    r = biodiversity_indices([4, 4, 4, 4])
    assert math.isclose(r["simpson_D"], 0.25, rel_tol=1e-12)
    assert math.isclose(r["inverse_simpson_1_over_D"], 4.0, rel_tol=1e-12)
    assert math.isclose(r["gini_simpson_1_minus_D"], 0.75, rel_tol=1e-12)


def test_single_species_has_zero_diversity():
    r = biodiversity_indices([100])
    assert math.isclose(r["shannon_H"], 0.0, abs_tol=1e-12)
    assert math.isclose(r["simpson_D"], 1.0, rel_tol=1e-12)


# ── 2. Species-area relationship ──────────────────────────────────────────────
def test_species_area_recovers_z_quarter():
    # KNOWN: data built from S = 5 * A^0.25 must recover z ~ 0.25, c ~ 5.
    areas = [1.0, 10.0, 100.0, 1000.0, 10000.0]
    z_true, c_true = 0.25, 5.0
    species = [c_true * a ** z_true for a in areas]
    r = species_area_relationship(areas, species)
    assert math.isclose(r["z_exponent"], 0.25, abs_tol=1e-6)
    assert math.isclose(r["c_coefficient"], 5.0, rel_tol=1e-6)
    assert r["r_squared"] > 0.999


def test_species_area_typical_z_range():
    # KNOWN: empirical z lies in ~0.20-0.35; noisy quarter-power data stays in band.
    areas = [1, 4, 16, 64, 256, 1024]
    species = [3 * a ** 0.27 for a in areas]
    r = species_area_relationship(areas, species)
    assert 0.20 <= r["z_exponent"] <= 0.35


# ── 3. Island biogeography equilibrium ────────────────────────────────────────
def test_biogeography_equal_rates_gives_half_pool():
    # KNOWN: I_max == E_max -> lines cross at midpoint, S* = P/2.
    r = island_biogeography_equilibrium(P=200, I_max=1.0, E_max=1.0)
    assert math.isclose(r["equilibrium_species_S_star"], 100.0, rel_tol=1e-12)
    # at equilibrium immigration rate == extinction rate
    assert math.isclose(r["immigration_at_eq"], r["extinction_at_eq"], rel_tol=1e-12)


def test_biogeography_lower_extinction_raises_equilibrium():
    # Larger island (lower E_max) -> higher S*; here E_max=0.5 -> S* = 2/3 * P.
    r = island_biogeography_equilibrium(P=300, I_max=1.0, E_max=0.5)
    assert math.isclose(r["equilibrium_species_S_star"], 200.0, rel_tol=1e-12)


# ── 4. Carbon-cycle box decay ─────────────────────────────────────────────────
def test_co2_decays_to_one_over_e_after_one_tau():
    # KNOWN: after t = tau, fraction remaining = 1/e ~= 0.3679.
    r = carbon_box_decay(excess_ppm=100.0, tau_years=50.0, t_years=50.0)
    assert math.isclose(r["fraction_remaining"], math.exp(-1.0), rel_tol=1e-12)
    assert math.isclose(r["remaining_ppm"], 100.0 * math.exp(-1.0), rel_tol=1e-12)


def test_co2_half_life_equals_tau_ln2():
    # KNOWN: half-life = tau * ln2; evaluating at t = half-life gives 0.5.
    r = carbon_box_decay(excess_ppm=80.0, tau_years=100.0, t_years=100.0 * math.log(2.0))
    assert math.isclose(r["half_life_years"], 100.0 * math.log(2.0), rel_tol=1e-12)
    assert math.isclose(r["fraction_remaining"], 0.5, rel_tol=1e-9)


# ── 5. May food-web stability criterion ───────────────────────────────────────
def test_may_stability_threshold():
    # KNOWN: stable iff sigma*sqrt(S*C) < 1; sigma_crit = 1/sqrt(S*C).
    S, C = 25, 0.4          # S*C = 10
    r = may_food_web_stability(S=S, C=C, sigma=0.1)
    assert math.isclose(r["sigma_critical"], 1.0 / math.sqrt(10.0), rel_tol=1e-12)
    assert r["stable"] is True


def test_may_unstable_above_threshold():
    # Just above the critical sigma -> unstable.
    S, C = 25, 0.4
    sigma_crit = 1.0 / math.sqrt(S * C)
    assert may_food_web_stability(S=S, C=C, sigma=sigma_crit * 1.01)["stable"] is False
    # exactly at threshold -> marginal, complexity == 1
    r = may_food_web_stability(S=S, C=C, sigma=sigma_crit)
    assert math.isclose(r["complexity_index"], 1.0, rel_tol=1e-12)
    assert r["marginal"] is True


# ── 6. Maximum sustainable yield ──────────────────────────────────────────────
def test_msy_equals_rK_over_4():
    # KNOWN: MSY = r*K/4 at B = K/2.
    r = maximum_sustainable_yield(r=0.5, K=1000.0)
    assert math.isclose(r["MSY"], 0.5 * 1000.0 / 4.0, rel_tol=1e-12)   # = 125
    assert math.isclose(r["B_MSY"], 500.0, rel_tol=1e-12)
    assert math.isclose(r["F_MSY"], 0.25, rel_tol=1e-12)


def test_msy_inflection_is_max_of_surplus():
    # Verify K/2 truly maximises logistic surplus g(N)=rN(1-N/K) vs neighbours.
    r_, K = 0.8, 200.0
    g = lambda N: r_ * N * (1.0 - N / K)
    res = maximum_sustainable_yield(r=r_, K=K)
    bmsy = res["B_MSY"]
    assert g(bmsy) >= g(bmsy * 0.8) and g(bmsy) >= g(bmsy * 1.2)
    assert math.isclose(g(bmsy), res["MSY"], rel_tol=1e-12)


# ── 7. Michaelis-Menten nutrient uptake ───────────────────────────────────────
def test_uptake_is_half_vmax_at_km():
    # KNOWN: V(Km) = Vmax/2.
    r = michaelis_menten_uptake(S=5.0, Vmax=10.0, Km=5.0)
    assert math.isclose(r["uptake_rate_V"], 5.0, rel_tol=1e-12)
    assert math.isclose(r["fraction_of_Vmax"], 0.5, rel_tol=1e-12)


def test_uptake_saturates_toward_vmax():
    # KNOWN: as S >> Km, V -> Vmax.
    r = michaelis_menten_uptake(S=1.0e6, Vmax=10.0, Km=5.0)
    assert r["fraction_of_Vmax"] > 0.999
    assert r["uptake_rate_V"] < 10.0


# ── 8. Ecological footprint / carrying capacity ───────────────────────────────
def test_earths_required_overshoot_1_75():
    # KNOWN: footprint = 1.75 * biocapacity -> 1.75 Earths, overshoot.
    r = ecological_footprint(footprint_per_capita_gha=1.75, population=1.0,
                             biocapacity_gha=1.0)
    assert math.isclose(r["earths_required"], 1.75, rel_tol=1e-12)
    assert r["overshoot"] is True


def test_carrying_capacity_and_balance():
    # KNOWN: earths = footprint/biocapacity; carrying cap = biocapacity/per-capita.
    r = ecological_footprint(footprint_per_capita_gha=2.0, population=100.0,
                             biocapacity_gha=400.0)
    assert math.isclose(r["total_footprint_gha"], 200.0, rel_tol=1e-12)
    assert math.isclose(r["earths_required"], 0.5, rel_tol=1e-12)   # within capacity
    assert math.isclose(r["carrying_capacity_people"], 200.0, rel_tol=1e-12)
    assert r["overshoot"] is False
