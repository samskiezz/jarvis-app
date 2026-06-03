"""Each hydrogeology method must reproduce its KNOWN published value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_hydrogeology import (
    aquifer_storage_volume,
    conductivity_permeability,
    contaminant_transport,
    darcy_flux,
    dupuit_well_discharge,
    hazen_conductivity,
    seepage_velocity,
    theis_drawdown,
    theis_well_function,
)


# 1. Darcy's law — KNOWN: q = K*i; K=1e-4 m/s, i = 1 m / 100 m = 0.01
#    -> q = 1e-6 m/s, and Q = q*A = 1e-6 m^3/s through A=1 m^2.
#    Ref: Darcy's law (Wikipedia); q = -K dh/dl.
def test_darcy_flux_known():
    r = darcy_flux(hydraulic_conductivity=1.0e-4, head_drop_m=1.0,
                   length_m=100.0, area_m2=1.0)
    assert abs(r["hydraulic_gradient"] - 0.01) < 1e-12
    assert abs(r["darcy_flux_m_s"] - 1.0e-6) < 1e-15        # q = K*i
    assert abs(r["volumetric_flow_m3_s"] - 1.0e-6) < 1e-15
    # flux scales linearly with gradient: double the head drop -> double q
    r2 = darcy_flux(hydraulic_conductivity=1.0e-4, head_drop_m=2.0, length_m=100.0)
    assert abs(r2["darcy_flux_m_s"] - 2.0e-6) < 1e-15


# 2. Theis well function — KNOWN tabulated values W(u) = E1(u):
#    W(0.01)=4.0379, W(0.1)=1.8229, W(1.0)=0.2194 (Fetter; Abramowitz & Stegun).
#    Ref: Theis equation (Wikipedia / KGS).
def test_theis_well_function_table():
    assert abs(theis_well_function(0.01) - 4.0379) < 1e-3   # KNOWN table value
    assert abs(theis_well_function(0.1) - 1.8229) < 1e-3
    assert abs(theis_well_function(1.0) - 0.2194) < 1e-3
    # small-u Cooper-Jacob approx W ~ -gamma - ln(u) is close at u=0.01
    cj = -0.5772156649 - math.log(0.01)
    assert abs(theis_well_function(0.01) - cj) < 0.02


def test_theis_drawdown_consistency():
    r = theis_drawdown(pumping_rate_m3_s=0.01, transmissivity_m2_s=0.0023,
                       storativity=1.0e-4, radius_m=100.0, time_s=86400.0)
    # s = Q/(4 pi T) * W(u) — recompute independently
    expected = 0.01 / (4.0 * math.pi * 0.0023) * theis_well_function(r["u"])
    assert abs(r["drawdown_m"] - expected) < 1e-9
    assert r["drawdown_m"] > 0.0
    # later time -> smaller u -> larger W -> larger drawdown (cone deepens)
    later = theis_drawdown(time_s=10 * 86400.0)
    assert later["drawdown_m"] > r["drawdown_m"]


# 3. K <-> permeability — KNOWN: K = k*rho*g/mu; water ~20 C rho*g/mu ~ 1e7 (m.s)^-1,
#    so K=1e-4 m/s -> k ~ 1e-11 m^2 ~ 10 darcy (1 darcy = 9.87e-13 m^2).
#    Ref: Hydraulic conductivity (Wikipedia).
def test_conductivity_permeability_conversion():
    r = conductivity_permeability(hydraulic_conductivity_m_s=1.0e-4)
    assert 9.0e6 < r["conversion_factor_per_m_s"] < 1.1e7   # rho g / mu ~ 1e7
    assert abs(r["permeability_m2"] - 1.0e-11) < 0.2e-11    # ~1e-11 m^2
    assert 8.0 < r["permeability_darcy"] < 13.0             # ~10 darcy
    # round-trip: convert back from k recovers K
    back = conductivity_permeability(hydraulic_conductivity_m_s=None,
                                     permeability_m2=r["permeability_m2"])
    assert abs(back["hydraulic_conductivity_m_s"] - 1.0e-4) < 1e-9


# 4. Dupuit-Forchheimer — KNOWN: Q = pi K (h2^2-h1^2)/ln(r2/r1); Q rises with K
#    (linear) and falls with ln(radius ratio).
#    Ref: Dupuit-Forchheimer / Thiem unconfined well equation.
def test_dupuit_well_discharge():
    r = dupuit_well_discharge(hydraulic_conductivity=1.0e-4, head_at_r2_m=20.0,
                              head_at_r1_m=15.0, r2_m=200.0, r1_m=10.0)
    expected = math.pi * 1.0e-4 * (20.0 ** 2 - 15.0 ** 2) / math.log(200.0 / 10.0)
    assert abs(r["discharge_m3_s"] - expected) < 1e-12
    assert r["discharge_m3_s"] > 0.0
    # doubling K exactly doubles Q
    r2 = dupuit_well_discharge(hydraulic_conductivity=2.0e-4)
    assert abs(r2["discharge_m3_s"] - 2.0 * r["discharge_m3_s"]) < 1e-12


# 5. Contaminant transport — KNOWN: R = 1 + (rho_b/n) Kd; rho_b=1800, n=0.3,
#    Kd=1e-4 m^3/kg -> R = 1.6, plume velocity = v/1.6 = 0.625 v.
#    Ref: Advection-dispersion equation; retardation factor (Fetter).
def test_contaminant_retardation_factor():
    r = contaminant_transport(seepage_velocity_m_s=1.0e-6, bulk_density_kg_m3=1800.0,
                              porosity=0.3, distribution_coeff_m3_kg=1.0e-4,
                              dispersivity_m=10.0)
    assert abs(r["retardation_factor"] - 1.6) < 1e-9        # R = 1 + (1800/0.3)*1e-4
    assert abs(r["contaminant_velocity_m_s"] - 1.0e-6 / 1.6) < 1e-15
    # D_L = alpha_L * v
    assert abs(r["dispersion_coefficient_m2_s"] - 10.0 * 1.0e-6) < 1e-15
    # non-sorbing tracer (Kd=0) -> R = 1, moves with the water
    r0 = contaminant_transport(distribution_coeff_m3_kg=0.0)
    assert abs(r0["retardation_factor"] - 1.0) < 1e-12


# 6. Aquifer storativity volume — KNOWN: V = S*A*dh; confined S=1e-4 over 1e6 m^2
#    per 1 m -> V = 100 m^3; unconfined Sy=0.2 -> V = 2e5 m^3 (~2000x more).
#    Ref: Storativity / specific yield (Wikipedia).
def test_aquifer_storage_volume():
    rc = aquifer_storage_volume(storativity=1.0e-4, area_m2=1.0e6,
                                head_change_m=1.0, confined=True)
    assert abs(rc["volume_released_m3"] - 100.0) < 1e-6     # S*A*dh
    ru = aquifer_storage_volume(area_m2=1.0e6, head_change_m=1.0,
                                specific_yield=0.2, confined=False)
    assert abs(ru["volume_released_m3"] - 2.0e5) < 1e-3     # Sy*A*dh
    assert ru["volume_released_m3"] / rc["volume_released_m3"] == 2000.0


# 7. Hazen K from grain size — KNOWN: K = C d10^2; medium sand d10=0.5 mm=0.05 cm,
#    C=100 -> K = 100*0.05^2 = 0.25 cm/s = 2.5e-3 m/s.
#    Ref: Hazen formula (Hydraulic conductivity, Wikipedia).
def test_hazen_conductivity():
    r = hazen_conductivity(d10_mm=0.5, hazen_coefficient=100.0)
    assert abs(r["conductivity_cm_s"] - 0.25) < 1e-9        # C * d10_cm^2
    assert abs(r["conductivity_m_s"] - 2.5e-3) < 1e-11
    # K scales as d10^2: doubling d10 quadruples K
    r2 = hazen_conductivity(d10_mm=1.0, hazen_coefficient=100.0)
    assert abs(r2["conductivity_cm_s"] - 4.0 * r["conductivity_cm_s"]) < 1e-9


# 8. Seepage velocity — KNOWN: v = q / n; q=1e-6 m/s, n=0.25 -> v = 4e-6 m/s
#    (4x the Darcy flux); seepage velocity always exceeds Darcy flux.
#    Ref: Seepage velocity / Darcy velocity (Wikipedia).
def test_seepage_velocity():
    r = seepage_velocity(darcy_flux_m_s=1.0e-6, porosity=0.25)
    assert abs(r["seepage_velocity_m_s"] - 4.0e-6) < 1e-15  # q/n
    assert abs(r["velocity_ratio"] - 4.0) < 1e-12
    assert r["seepage_velocity_m_s"] > r["darcy_flux_m_s"]  # always faster
