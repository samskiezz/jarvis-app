"""Tests for real polymer & soft-matter methods.

Each test verifies a method against a KNOWN published value or scaling law
with an explicit tolerance and a citation.
"""
import math

import pytest

from underworld.server.services.methods_polymer import (
    radius_gyration,
    flory_radius,
    mark_houwink,
    flory_huggins,
    rubber_elastic,
    wlf_shift,
    reptation_diffusion,
    glass_transition,
)


# 1. IDEAL-CHAIN RADIUS OF GYRATION ------------------------------------------
def test_radius_gyration_known_value():
    # Rg = sqrt(N/6) * b. For N=600, b=1: Rg = sqrt(100) = 10.
    res = radius_gyration(segments=600, bond_length=1.0)
    assert res["radius_of_gyration"] == pytest.approx(10.0, rel=1e-12)
    # rms end-to-end = sqrt(N) b = sqrt(600); and Rg^2 = R^2 / 6.
    assert res["rms_end_to_end"] == pytest.approx(math.sqrt(600.0), rel=1e-12)


def test_radius_gyration_sqrt_scaling():
    # Rg ~ N^0.5: doubling N multiplies Rg by sqrt(2).
    r1 = radius_gyration(segments=1000)["radius_of_gyration"]
    r2 = radius_gyration(segments=2000)["radius_of_gyration"]
    assert r2 / r1 == pytest.approx(math.sqrt(2.0), rel=1e-12)
    # recovered exponent from a sweep equals 0.5
    ns = [100, 400, 1600, 6400]
    rgs = [radius_gyration(segments=n)["radius_of_gyration"] for n in ns]
    slope = (math.log(rgs[-1]) - math.log(rgs[0])) / (
        math.log(ns[-1]) - math.log(ns[0])
    )
    assert slope == pytest.approx(0.5, abs=1e-9)


# 2. FLORY RADIUS (GOOD SOLVENT) ---------------------------------------------
def test_flory_exponent_is_three_fifths():
    res = flory_radius(segments=1000, bond_length=1.0)
    # Flory good-solvent exponent nu = 3/5 = 0.6.
    assert res["flory_exponent"] == pytest.approx(0.6, rel=1e-12)
    assert res["recovered_exponent"] == pytest.approx(0.6, rel=1e-9)


def test_flory_swells_more_than_ideal():
    # Good-solvent coil (nu=0.6) is larger than ideal (nu=0.5) for large N.
    n = 10000
    flory = flory_radius(segments=n)["flory_radius"]
    ideal = math.sqrt(n)  # ideal end-to-end ~ N^0.5
    assert flory > ideal
    # exponent recovered over a sweep is ~0.6, strictly above 0.5
    ns = [100, 1000, 10000]
    rs = [flory_radius(segments=k)["flory_radius"] for k in ns]
    slope = (math.log(rs[-1]) - math.log(rs[0])) / (
        math.log(ns[-1]) - math.log(ns[0])
    )
    assert slope == pytest.approx(0.6, abs=1e-9)
    assert slope > 0.5


# 3. MARK-HOUWINK INTRINSIC VISCOSITY ----------------------------------------
def test_mark_houwink_polystyrene_thf():
    # Atactic polystyrene in THF at 25 C: K = 1.14e-2 mL/g, a = 0.716.
    # M = 1.0e5 g/mol -> [eta] = 0.0114 * 1e5^0.716.
    res = mark_houwink(molar_mass=1.0e5, k=1.14e-2, a=0.716)
    expected = 1.14e-2 * (1.0e5 ** 0.716)
    assert res["intrinsic_viscosity"] == pytest.approx(expected, rel=1e-12)
    # sanity: ~43.3 mL/g for these constants at M=1e5
    assert res["intrinsic_viscosity"] == pytest.approx(43.3, rel=2e-2)


def test_mark_houwink_recovers_exponent():
    res = mark_houwink(molar_mass=5.0e4, k=1.14e-2, a=0.716)
    assert res["recovered_exponent"] == pytest.approx(0.716, rel=1e-9)


# 4. FLORY-HUGGINS FREE ENERGY OF MIXING -------------------------------------
def test_flory_huggins_critical_chi_symmetric():
    # Symmetric small-molecule blend (N1=N2=1): chi_c = 2.
    res = flory_huggins(volume_fraction=0.5, chi=2.0, n1=1, n2=1)
    assert res["critical_chi"] == pytest.approx(2.0, rel=1e-12)


def test_flory_huggins_phase_separation_above_chi2():
    # chi > 2: dG/kT becomes concave (d2 < 0) at phi=1/2 -> phase separation.
    res_hi = flory_huggins(volume_fraction=0.5, chi=2.5, n1=1, n2=1)
    assert res_hi["phase_separates"] is True
    assert res_hi["d2_free_energy"] < 0.0
    # chi < 2: stable single phase (d2 > 0).
    res_lo = flory_huggins(volume_fraction=0.5, chi=1.5, n1=1, n2=1)
    assert res_lo["phase_separates"] is False
    assert res_lo["d2_free_energy"] > 0.0


# 5. RUBBER ELASTICITY --------------------------------------------------------
def test_rubber_elastic_zero_at_rest():
    # sigma = nkT(lambda - 1/lambda^2) = 0 at lambda = 1.
    res = rubber_elastic(stretch=1.0, chain_density=1.0e26, temperature_k=300.0)
    assert res["nominal_stress_pa"] == pytest.approx(0.0, abs=1e-6)


def test_rubber_elastic_sign_and_value():
    # Extension (lambda>1) -> tensile (positive) stress; compression negative.
    n, T = 1.0e26, 300.0
    nkt = n * 1.380649e-23 * T
    ext = rubber_elastic(stretch=2.0, chain_density=n, temperature_k=T)
    expected = nkt * (2.0 - 1.0 / 4.0)
    assert ext["nominal_stress_pa"] == pytest.approx(expected, rel=1e-9)
    assert ext["nominal_stress_pa"] > 0.0
    comp = rubber_elastic(stretch=0.5, chain_density=n, temperature_k=T)
    assert comp["nominal_stress_pa"] < 0.0
    # small-strain modulus E = 3nkT
    assert ext["youngs_modulus_pa"] == pytest.approx(3.0 * nkt, rel=1e-9)


# 6. WLF TIME-TEMPERATURE SUPERPOSITION --------------------------------------
def test_wlf_unity_at_reference():
    # log10(aT) = 0, aT = 1 at T = Tref.
    res = wlf_shift(temperature_k=373.0, reference_temperature_k=373.0)
    assert res["log10_shift_factor"] == pytest.approx(0.0, abs=1e-12)
    assert res["shift_factor"] == pytest.approx(1.0, rel=1e-12)


def test_wlf_universal_constants_value():
    # Universal constants C1=17.44, C2=51.6. At T = Tref + C2:
    # log10(aT) = -C1*C2/(C2+C2) = -C1/2 = -8.72.
    tref = 350.0
    res = wlf_shift(temperature_k=tref + 51.6, reference_temperature_k=tref)
    assert res["c1"] == pytest.approx(17.44, rel=1e-12)
    assert res["c2"] == pytest.approx(51.6, rel=1e-12)
    assert res["log10_shift_factor"] == pytest.approx(-17.44 / 2.0, rel=1e-9)
    # Above Tref -> faster dynamics -> aT < 1.
    assert res["shift_factor"] < 1.0


# 7. REPTATION DIFFUSION ------------------------------------------------------
def test_reptation_n_minus_two_scaling():
    # D ~ N^-2: multiplying N by 10 reduces D by 100.
    d1 = reptation_diffusion(segments=100, d0=1.0)["diffusion_coefficient"]
    d2 = reptation_diffusion(segments=1000, d0=1.0)["diffusion_coefficient"]
    assert d1 / d2 == pytest.approx(100.0, rel=1e-9)
    res = reptation_diffusion(segments=200)
    assert res["recovered_exponent"] == pytest.approx(-2.0, rel=1e-9)


def test_reptation_steeper_than_rouse():
    # Reptation N^-2 falls off faster than Rouse N^-1.
    ns = [100, 1000, 10000]
    ds = [reptation_diffusion(segments=n)["diffusion_coefficient"] for n in ns]
    slope = (math.log(ds[-1]) - math.log(ds[0])) / (
        math.log(ns[-1]) - math.log(ns[0])
    )
    assert slope == pytest.approx(-2.0, abs=1e-9)
    assert slope < -1.0


# 8. GLASS TRANSITION (FOX EQUATION) -----------------------------------------
def test_fox_equation_pmma_pvac_blend():
    # 50/50 PMMA (Tg1=378 K) + PVAc (Tg2=305 K): 1/Tg = 0.5/378 + 0.5/305.
    res = glass_transition(weight_fraction_1=0.5, tg1_k=378.0, tg2_k=305.0)
    expected = 1.0 / (0.5 / 378.0 + 0.5 / 305.0)
    assert res["tg_blend_k"] == pytest.approx(expected, rel=1e-12)
    assert res["tg_blend_k"] == pytest.approx(337.5, rel=1e-2)


def test_fox_tg_between_components():
    res = glass_transition(weight_fraction_1=0.3, tg1_k=378.0, tg2_k=305.0)
    assert 305.0 < res["tg_blend_k"] < 378.0
    # Fox prediction lies below the linear rule-of-mixtures average.
    assert res["tg_blend_k"] < res["linear_average_k"]
    # Endpoints recover pure components.
    pure1 = glass_transition(weight_fraction_1=1.0, tg1_k=378.0, tg2_k=305.0)
    pure2 = glass_transition(weight_fraction_1=0.0, tg1_k=378.0, tg2_k=305.0)
    assert pure1["tg_blend_k"] == pytest.approx(378.0, rel=1e-12)
    assert pure2["tg_blend_k"] == pytest.approx(305.0, rel=1e-12)
