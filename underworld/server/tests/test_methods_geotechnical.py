"""Each geotechnical / soil-mechanics method must reproduce its KNOWN published
or analytically exact value.

Citations are inline in methods_geotechnical.py. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_geotechnical import (
    consolidation_settlement,
    consolidation_time_factor,
    darcy_seepage,
    effective_stress,
    infinite_slope_fos,
    mohr_coulomb_strength,
    rankine_earth_pressure,
    soil_phase_relations,
    terzaghi_bearing_capacity,
)


# 1. Terzaghi/Prandtl bearing factors — KNOWN: phi=30 -> Nq=18.40, Nc=30.14, Ngamma=15.67.
def test_terzaghi_bearing_factors_phi30():
    r = terzaghi_bearing_capacity(10000, 18000, 2.0, 2.0, 30.0)
    assert abs(r["Nq"] - 18.40) < 0.05
    assert abs(r["Nc"] - 30.14) < 0.05
    assert abs(r["Ngamma"] - 15.67) < 0.1
    assert r["q_ult_pa"] > 0


# 2. Rankine earth pressure — KNOWN: phi=30 -> Ka = 1/3, Kp = 3.0 (Ka*Kp = 1).
def test_rankine_coefficients_phi30():
    r = rankine_earth_pressure(30, 18000, 5)
    assert abs(r["Ka"] - 1.0 / 3.0) < 1e-4
    assert abs(r["Kp"] - 3.0) < 1e-4
    assert abs(r["Ka"] * r["Kp"] - 1.0) < 1e-9


# 3. Effective stress — KNOWN: gamma=18 kN/m^3, WT at surface, z=5 m ->
#    sigma=90 kPa, u=49.05 kPa, sigma'=40.95 kPa.
def test_effective_stress_uniform_column():
    r = effective_stress([(5, 18000)], 0.0, 5.0)
    assert abs(r["total_stress_kpa"] - 90.0) < 1e-6
    assert abs(r["pore_pressure_kpa"] - 49.05) < 0.01
    assert abs(r["effective_stress_kpa"] - 40.95) < 0.01


# 4. Darcy seepage — KNOWN: k=1e-4, head loss 2 m over L=4 m, A=1 m^2 ->
#    i=0.5, v=k*i=5e-5 m/s, q=v*A=5e-5 m^3/s.
def test_darcy_seepage_known_gradient():
    r = darcy_seepage(1e-4, 2.0, 4.0, 1.0)
    assert abs(r["hydraulic_gradient"] - 0.5) < 1e-9
    assert abs(r["flow_rate_m3_s"] - 5e-5) < 1e-12


# 5. Consolidation settlement — KNOWN: Cc=0.30, e0=0.80, H=3 m, sigma0=ds=100 kPa
#    -> Sc = (0.30/1.80)*3*log10(2) = 0.1505 m.
def test_consolidation_settlement_nc():
    r = consolidation_settlement(0.3, 0.8, 3.0, 100000, 100000)
    expected = (0.3 / 1.8) * 3.0 * math.log10(2.0)
    assert abs(r["settlement_m"] - expected) < 1e-4
    assert abs(r["settlement_m"] - 0.1505) < 1e-3


# 6. Consolidation time factor — KNOWN: U=50% -> Tv=0.197; U=90% -> Tv=0.848.
def test_consolidation_time_factor():
    assert abs(consolidation_time_factor(U_percent=50)["Tv_from_U"] - 0.197) < 0.002
    assert abs(consolidation_time_factor(U_percent=90)["Tv_from_U"] - 0.848) < 0.002


# 7. Mohr-Coulomb strength — KNOWN: c=10 kPa, phi=30, sigma'=100 kPa ->
#    tau = 10 + 100*tan(30) = 67.74 kPa.
def test_mohr_coulomb_strength():
    r = mohr_coulomb_strength(10000, 30, 100000)
    assert abs(r["shear_strength_kpa"] - 67.74) < 0.01


# 8. Infinite-slope FoS — KNOWN: dry cohesionless phi=30, beta=15 -> FS = tan30/tan15 = 2.1547.
def test_infinite_slope_dry_cohesionless():
    r = infinite_slope_fos(30, 0, 18000, 15, 5)
    assert abs(r["factor_of_safety"] - 2.1547) < 1e-3
    assert r["stable"] is True


# 9. Soil phase relations — KNOWN: e=0.5 -> n = 0.5/1.5 = 0.3333.
def test_soil_phase_porosity():
    r = soil_phase_relations(void_ratio=0.5)
    assert abs(r["porosity"] - 1.0 / 3.0) < 1e-4
