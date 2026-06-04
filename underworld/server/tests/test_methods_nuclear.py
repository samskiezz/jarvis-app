"""Verification tests for methods_nuclear — each asserts a computed result
matches a KNOWN published value.
"""
import numpy as np

from underworld.server.services.methods_nuclear import (
    k_effective_criticality,
    bare_sphere_critical_radius,
    fission_energy_release,
    reactor_period,
    radioactive_decay,
    gamma_shielding,
    radiation_dose_inverse_square,
    binding_energy_per_nucleon,
)


# 1. CRITICALITY — four/six-factor formula -----------------------------------
def test_k_effective_critical_at_unity():
    # KNOWN: a balanced lattice whose four factors multiply to exactly 1.0 is
    # critical (k_eff = 1, reactivity = 0).
    out = k_effective_criticality(eta=2.0, epsilon=1.0, p=0.5, f=1.0)
    assert abs(out["k_effective"] - 1.0) < 1e-12   # k = 1 -> critical
    assert out["state"] == "critical"
    assert abs(out["reactivity"]) < 1e-12


def test_k_effective_four_factor_product():
    # KNOWN: k_inf = eta*epsilon*p*f. Textbook example -> ~1.108, supercritical.
    out = k_effective_criticality(eta=2.02, epsilon=1.03, p=0.75, f=0.71)
    expected = 2.02 * 1.03 * 0.75 * 0.71
    assert abs(out["k_infinite"] - expected) < 1e-12
    assert abs(out["k_infinite"] - 1.108) < 0.002
    assert out["state"] == "supercritical"


# 2. NEUTRON DIFFUSION — bare-sphere critical radius -------------------------
def test_bare_sphere_buckling_self_consistent():
    # KNOWN: a critical bare sphere matches geometric to material buckling,
    # B_geom^2 == B_material^2 with B_geom^2 = (pi/R)^2.
    out = bare_sphere_critical_radius(diffusion_coefficient_cm=1.0,
                                      absorption_xs_cm=0.01,
                                      nu_fission_xs_cm=0.015)
    assert abs(out["geometric_buckling_cm2"]
               - out["material_buckling_cm2"]) < 1e-9


def test_bare_sphere_more_reactive_smaller_radius():
    # KNOWN TREND: a more reactive material (larger nu*Sigma_f) has larger
    # buckling and therefore a SMALLER critical radius.
    less = bare_sphere_critical_radius(diffusion_coefficient_cm=1.0,
                                       absorption_xs_cm=0.01,
                                       nu_fission_xs_cm=0.015)
    more = bare_sphere_critical_radius(diffusion_coefficient_cm=1.0,
                                       absorption_xs_cm=0.01,
                                       nu_fission_xs_cm=0.030)
    assert more["critical_radius_cm"] < less["critical_radius_cm"]


# 3. FISSION ENERGY RELEASE — ~200 MeV per U-235 -----------------------------
def test_fission_energy_200_mev_in_joules():
    # KNOWN: 200 MeV per fission = 3.204e-11 J.
    out = fission_energy_release(energy_per_fission_mev=200.0, mass_g=0.0)
    assert abs(out["energy_per_fission_j"] - 3.204e-11) < 1e-13  # ~3.2e-11 J


def test_fission_one_gram_u235_energy():
    # KNOWN: complete fission of 1 g of U-235 releases ~8.2e10 J (~22.8 MWh).
    out = fission_energy_release(energy_per_fission_mev=200.0, mass_g=1.0)
    assert abs(out["total_energy_j"] - 8.2e10) / 8.2e10 < 0.02   # within 2%
    assert abs(out["total_energy_mwh"] - 22.8) < 0.6


# 4. POINT-KINETICS — stable reactor period ----------------------------------
def test_reactor_period_positive_for_positive_reactivity():
    # KNOWN: rho=0.0025, beta=0.0065, lambda=0.0767 /s -> stable period ~20.9 s
    # (delayed term dominates; slow, controllable power rise).
    out = reactor_period(reactivity=0.0025, beta=0.0065,
                         decay_constant_per_s=0.0767)
    expected = (0.0065 - 0.0025) / (0.0767 * 0.0025)  # = 20.86 s
    assert abs(out["period_delayed_term_s"] - expected) < 1e-6
    assert abs(out["period_delayed_term_s"] - 20.86) < 0.1
    assert out["period_s"] > 0     # positive period -> power rises


def test_reactor_period_negative_for_negative_reactivity():
    # KNOWN: negative reactivity gives a negative period (power decays).
    out = reactor_period(reactivity=-0.0025, beta=0.0065,
                         decay_constant_per_s=0.0767)
    assert out["period_s"] < 0


# 5. RADIOACTIVE DECAY & SECULAR EQUILIBRIUM ---------------------------------
def test_decay_half_after_one_half_life():
    # KNOWN: after one half-life exactly half the nuclei remain.
    out = radioactive_decay(half_life_s=100.0, initial_atoms=1.0e6,
                            time_s=100.0)
    assert abs(out["fraction_remaining"] - 0.5) < 1e-12   # N0/2
    assert abs(out["remaining_atoms"] - 5.0e5) < 1.0


def test_cs137_decay_constant():
    # KNOWN: Cs-137 half-life 30.1 yr -> lambda ~= 7.30e-10 /s.
    t_half = 30.1 * 365.25 * 24 * 3600.0
    out = radioactive_decay(half_life_s=t_half, initial_atoms=1.0, time_s=0.0)
    assert abs(out["decay_constant_per_s"] - 7.30e-10) < 1e-11


def test_secular_equilibrium_ratio_approaches_one():
    # KNOWN: when parent half-life >> daughter half-life, after several daughter
    # half-lives the daughter activity equals the parent activity (ratio -> 1).
    parent_t = 1.0e9        # very long-lived parent
    daughter_t = 100.0      # short-lived daughter
    out = radioactive_decay(half_life_s=parent_t, initial_atoms=1.0e12,
                            time_s=daughter_t * 10,  # 10 daughter half-lives
                            daughter_half_life_s=daughter_t)
    assert abs(out["activity_ratio_daughter_parent"] - 1.0) < 0.01  # ~1


# 6. GAMMA SHIELDING — attenuation & half-value layer ------------------------
def test_half_value_layer_definition():
    # KNOWN: HVL = ln(2)/mu, and at x = HVL exactly half the intensity passes.
    mu = 0.7757   # lead, ~1 MeV gamma (/cm)
    out = gamma_shielding(linear_attenuation_coeff_per_cm=mu, thickness_cm=0.0)
    assert abs(out["half_value_layer_cm"] - np.log(2.0) / mu) < 1e-12
    assert abs(out["half_value_layer_cm"] - 0.8936) < 0.001   # ~0.89 cm

    at_hvl = gamma_shielding(linear_attenuation_coeff_per_cm=mu,
                             thickness_cm=np.log(2.0) / mu)
    assert abs(at_hvl["transmission_fraction"] - 0.5) < 1e-9  # halved


def test_attenuation_two_hvl_quarter():
    # KNOWN: two half-value layers transmit 1/4 of the intensity.
    mu = 0.5
    hvl = np.log(2.0) / mu
    out = gamma_shielding(linear_attenuation_coeff_per_cm=mu,
                          thickness_cm=2 * hvl)
    assert abs(out["transmission_fraction"] - 0.25) < 1e-9


# 7. RADIATION DOSE — inverse-square law -------------------------------------
def test_inverse_square_double_distance_quarter_dose():
    # KNOWN: doubling the distance reduces the dose rate to 1/4.
    out = radiation_dose_inverse_square(dose_rate_ref=100.0,
                                        distance_ref_m=1.0, distance_m=2.0)
    assert abs(out["dose_rate"] - 25.0) < 1e-9     # 100 * (1/2)^2
    assert abs(out["scale_factor"] - 0.25) < 1e-12


def test_inverse_square_half_distance_quadruple_dose():
    # KNOWN: halving the distance increases the dose rate fourfold.
    out = radiation_dose_inverse_square(dose_rate_ref=100.0,
                                        distance_ref_m=2.0, distance_m=1.0)
    assert abs(out["dose_rate"] - 400.0) < 1e-9    # 100 * (2/1)^2


# 8. MASS-ENERGY — binding energy per nucleon --------------------------------
def test_binding_energy_fe56_peak():
    # KNOWN: Fe-56 sits at the peak of the BE/A curve, ~8.79-8.8 MeV/nucleon.
    out = binding_energy_per_nucleon(nuclide="Fe-56")
    assert abs(out["binding_energy_per_nucleon_mev"] - 8.79) < 0.05  # ~8.8 MeV


def test_binding_energy_fe56_is_maximum():
    # KNOWN: Fe-56 BE/A exceeds that of light (He-4) and heavy (U-235) nuclei.
    fe = binding_energy_per_nucleon(nuclide="Fe-56")
    he = binding_energy_per_nucleon(nuclide="He-4")
    u = binding_energy_per_nucleon(nuclide="U-235")
    assert fe["binding_energy_per_nucleon_mev"] > he["binding_energy_per_nucleon_mev"]
    assert fe["binding_energy_per_nucleon_mev"] > u["binding_energy_per_nucleon_mev"]
    # He-4 ~7.07 MeV, U-235 ~7.59 MeV (published)
    assert abs(he["binding_energy_per_nucleon_mev"] - 7.07) < 0.05
    assert abs(u["binding_energy_per_nucleon_mev"] - 7.59) < 0.05
