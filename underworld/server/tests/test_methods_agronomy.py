"""Verify the real agronomy / plant-science methods against KNOWN values.

Each test asserts a computed result against an independently published / textbook
known value or limiting behavior, not against the implementation's own output.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from underworld.server.services.methods_agronomy import (
    penman_monteith_et0,
    leaf_light_response,
    light_use_efficiency_biomass,
    growing_degree_days,
    soil_water_balance,
    nitrogen_mineralization,
    logistic_crop_growth,
    canopy_light_extinction,
)


# ── 1. Penman-Monteith reference evapotranspiration ───────────────────────────
def test_et0_is_a_few_mm_per_day():
    # KNOWN: FAO-56 grass reference ET0 under realistic daily inputs is a few mm/day
    # (temperate-to-arid range ~2-8 mm/day). Inputs: T=25C, u2=2 m/s, Rn=12 MJ/m2/d.
    r = penman_monteith_et0(T_mean=25.0, u2=2.0, Rn=12.0, G=0.0,
                            es=3.168, ea=2.376, delta=0.189, gamma=0.0677)
    assert 2.0 <= r["ET0_mm_day"] <= 8.0
    assert math.isclose(r["ET0_mm_day"], 4.126, abs_tol=0.01)
    # ET0 is the sum of the radiation + aerodynamic terms
    assert math.isclose(r["ET0_mm_day"],
                        r["radiation_term_mm_day"] + r["aerodynamic_term_mm_day"],
                        rel_tol=1e-9)


def test_et0_higher_with_more_radiation_and_wind():
    # KNOWN: ET0 rises with net radiation and with wind (drier, more energy).
    base = penman_monteith_et0(T_mean=20.0, u2=2.0, Rn=10.0, G=0.0,
                               es=2.34, ea=1.80, delta=0.145, gamma=0.0677)
    hotter = penman_monteith_et0(T_mean=20.0, u2=2.0, Rn=18.0, G=0.0,
                                 es=2.34, ea=1.80, delta=0.145, gamma=0.0677)
    windier = penman_monteith_et0(T_mean=20.0, u2=5.0, Rn=10.0, G=0.0,
                                  es=2.34, ea=1.80, delta=0.145, gamma=0.0677)
    assert hotter["ET0_mm_day"] > base["ET0_mm_day"]
    assert windier["ET0_mm_day"] > base["ET0_mm_day"]


# ── 2. Leaf light-response (non-rectangular hyperbola) ────────────────────────
def test_light_response_is_saturating():
    # KNOWN: gross assimilation rises monotonically and saturates toward A_max.
    I = np.array([0.0, 100.0, 300.0, 600.0, 1200.0, 2400.0])
    r = leaf_light_response(I, phi=0.05, A_max=25.0, theta=0.9, Rd=1.0)
    Ag = np.asarray(r["A_gross"])
    assert math.isclose(Ag[0], 0.0, abs_tol=1e-12)        # no light -> no gross C fixation
    assert np.all(np.diff(Ag) > 0)                        # monotonic increasing
    assert Ag[-1] < 25.0 and Ag[-1] > 0.95 * 25.0         # approaches but < A_max
    # net rate at I=0 equals -Rd
    assert math.isclose(np.asarray(r["A_net"])[0], -1.0, abs_tol=1e-12)


def test_light_response_initial_slope_is_quantum_yield():
    # KNOWN: as I->0 the initial slope dAg/dI approaches phi.
    phi = 0.06
    r = leaf_light_response(1e-4, phi=phi, A_max=30.0, theta=0.85)
    slope = r["A_gross"] / 1e-4
    assert math.isclose(slope, phi, rel_tol=1e-3)


# ── 3. Monteith light-use-efficiency biomass ──────────────────────────────────
def test_biomass_proportional_to_intercepted_par():
    # KNOWN (Monteith): biomass = RUE * IPAR, linear in intercepted PAR.
    par = [10.0] * 100                 # 100 days of 10 MJ/m2/day -> 1000 MJ total
    r = light_use_efficiency_biomass(RUE=1.4, PAR_incident=par, f_intercepted=0.8)
    assert math.isclose(r["intercepted_PAR_MJ"], 0.8 * 1000.0, rel_tol=1e-12)  # 800
    assert math.isclose(r["biomass_g_m2"], 1.4 * 800.0, rel_tol=1e-12)         # 1120
    # doubling intercepted PAR doubles biomass (strict proportionality)
    r2 = light_use_efficiency_biomass(RUE=1.4, PAR_incident=[20.0] * 100,
                                      f_intercepted=0.8)
    assert math.isclose(r2["biomass_g_m2"], 2.0 * r["biomass_g_m2"], rel_tol=1e-12)


def test_yield_is_harvest_index_times_biomass():
    r = light_use_efficiency_biomass(RUE=2.0, PAR_incident=[5.0] * 200,
                                     f_intercepted=1.0, harvest_index=0.45)
    # IPAR=1000, biomass=2000, yield=0.45*2000=900
    assert math.isclose(r["biomass_g_m2"], 2000.0, rel_tol=1e-12)
    assert math.isclose(r["yield_g_m2"], 900.0, rel_tol=1e-12)


# ── 4. Growing degree days ────────────────────────────────────────────────────
def test_gdd_simple_mean_method():
    # KNOWN: base 10C, Tmin=15 Tmax=25 -> mean 20 -> 10 GDD/day; 5 days -> 50.
    r = growing_degree_days([15.0] * 5, [25.0] * 5, t_base=10.0)
    assert math.isclose(r["accumulated_gdd"], 50.0, rel_tol=1e-12)
    assert r["n_days"] == 5


def test_gdd_corn_capped_example():
    # KNOWN corn rule (degF): cap Tmax at 86, floor Tmin at 50, base 50.
    # Tmax=87->86, Tmin=63 -> (86+63)/2 - 50 = 24.5 GDD.
    r = growing_degree_days([63.0], [87.0], t_base=50.0, t_upper=86.0)
    assert math.isclose(r["accumulated_gdd"], 24.5, rel_tol=1e-12)


def test_gdd_below_base_is_zero():
    # KNOWN: cold days below base accumulate no thermal time (clamped at 0).
    r = growing_degree_days([2.0, 4.0], [8.0, 9.0], t_base=10.0)
    assert math.isclose(r["accumulated_gdd"], 0.0, abs_tol=1e-12)


# ── 5. Soil water balance / available water ───────────────────────────────────
def test_total_available_water_formula():
    # KNOWN: TAW = (FC - WP) * Zr. FC=0.30, WP=0.10, Zr=1000mm -> 200 mm.
    r = soil_water_balance(theta_fc=0.30, theta_wp=0.10, root_depth_mm=1000.0,
                           p_depletion=0.5)
    assert math.isclose(r["TAW_mm"], 200.0, rel_tol=1e-12)
    assert math.isclose(r["RAW_mm"], 100.0, rel_tol=1e-12)   # p=0.5


def test_irrigation_trigger_at_depletion():
    # current theta near wilting -> depletion exceeds RAW -> irrigation needed.
    r = soil_water_balance(theta_fc=0.30, theta_wp=0.10, root_depth_mm=1000.0,
                           theta_current=0.15, p_depletion=0.5)
    # depletion = (0.30-0.15)*1000 = 150 mm > RAW=100 -> needs water
    assert math.isclose(r["current_depletion_mm"], 150.0, rel_tol=1e-12)
    assert r["irrigation_needed"] is True
    # available above wilting = (0.15-0.10)*1000 = 50 mm
    assert math.isclose(r["available_water_mm"], 50.0, rel_tol=1e-12)


# ── 6. Nitrogen mineralization (first-order) ──────────────────────────────────
def test_n_mineralization_e_folding():
    # KNOWN: at t = 1/k, fraction mineralized = 1 - 1/e ~= 0.6321.
    r = nitrogen_mineralization(N0=200.0, k=0.05, t=20.0)   # k*t = 1
    assert math.isclose(r["fraction_mineralized"], 1.0 - math.exp(-1.0), rel_tol=1e-12)
    assert math.isclose(r["N_mineralized"], 200.0 * (1.0 - math.exp(-1.0)), rel_tol=1e-12)


def test_n_mineralization_approaches_N0():
    # KNOWN: as t -> infinity, Nt -> N0; instantaneous rate -> 0.
    r = nitrogen_mineralization(N0=150.0, k=0.1, t=500.0)
    assert math.isclose(r["N_mineralized"], 150.0, rel_tol=1e-6)
    assert r["instantaneous_rate"] < 1e-6


# ── 7. Logistic crop growth + harvest index ───────────────────────────────────
def test_logistic_initial_and_asymptote():
    # KNOWN: W(0)=W0; W(t->inf) -> W_max.
    r0 = logistic_crop_growth(0.0, W_max=1000.0, r=0.1, W0=10.0, harvest_index=0.5)
    assert math.isclose(r0["biomass"], 10.0, rel_tol=1e-9)
    rinf = logistic_crop_growth(500.0, W_max=1000.0, r=0.1, W0=10.0, harvest_index=0.5)
    assert math.isclose(rinf["biomass"], 1000.0, rel_tol=1e-6)
    # grain yield = HI * biomass
    assert math.isclose(rinf["grain_yield"], 0.5 * rinf["biomass"], rel_tol=1e-12)


def test_logistic_max_growth_at_half_capacity():
    # KNOWN: max absolute growth rate = r*W_max/4 at W = W_max/2.
    r = logistic_crop_growth(0.0, W_max=800.0, r=0.2, W0=20.0)
    assert math.isclose(r["max_growth_rate"], 0.2 * 800.0 / 4.0, rel_tol=1e-12)  # 40
    assert math.isclose(r["biomass_at_inflection"], 400.0, rel_tol=1e-12)
    # numerically confirm growth rate peaks near W_max/2
    t = np.linspace(0, 100, 4001)
    W = np.asarray(logistic_crop_growth(t, W_max=800.0, r=0.2, W0=20.0)["biomass"])
    dWdt = np.gradient(W, t)
    assert math.isclose(W[np.argmax(dWdt)], 400.0, rel_tol=0.02)


# ── 8. Beer's-law canopy light extinction ─────────────────────────────────────
def test_beers_law_transmission_at_lai_two():
    # KNOWN: k=0.5, LAI=2 -> transmitted fraction = exp(-1) ~= 0.3679,
    # intercepted ~= 0.6321.
    r = canopy_light_extinction(I0=1000.0, LAI=2.0, k=0.5)
    assert math.isclose(r["fraction_transmitted"], math.exp(-1.0), rel_tol=1e-12)
    assert math.isclose(r["transmitted_irradiance"], 1000.0 * math.exp(-1.0), rel_tol=1e-12)
    assert math.isclose(r["fraction_intercepted"], 1.0 - math.exp(-1.0), rel_tol=1e-12)


def test_beers_law_no_canopy_passes_all_light():
    # KNOWN: LAI=0 -> all light transmitted (I = I0).
    r = canopy_light_extinction(I0=500.0, LAI=0.0, k=0.5)
    assert math.isclose(r["transmitted_irradiance"], 500.0, rel_tol=1e-12)
    assert math.isclose(r["fraction_intercepted"], 0.0, abs_tol=1e-12)


def test_beers_law_monotonic_decay_with_lai():
    # KNOWN: transmission decreases monotonically with LAI (exponential decay).
    lai = np.array([0.0, 1.0, 2.0, 3.0, 5.0])
    t = np.asarray(canopy_light_extinction(I0=1.0, LAI=lai, k=0.5)["transmitted_irradiance"])
    assert np.all(np.diff(t) < 0)
    assert math.isclose(t[2], math.exp(-1.0), rel_tol=1e-12)
