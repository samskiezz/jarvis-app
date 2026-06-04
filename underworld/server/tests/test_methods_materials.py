"""Tests for real materials-science methods.

Each test asserts the implemented law against an INDEPENDENT published/known
reference value. Citations are inline next to each assertion.
"""
import math

import pytest

from underworld.server.services.methods_materials import (
    LORENZ_THEORETICAL,
    arrhenius_vacancy,
    bragg_diffraction,
    fick_diffusion,
    griffith_fracture,
    hall_petch,
    hooke_elasticity,
    lever_rule,
    route,
    wiedemann_franz,
)


# ── 1. Bragg diffraction ─────────────────────────────────────────────────────
def test_bragg_nacl_first_order():
    """NaCl rock-salt (200) d = 2.82 A, Cu K-alpha lambda = 1.5406 A, n=1.
    Known first-order Bragg angle theta ~= 15.86 deg (2theta ~= 31.7 deg).
    Ref: Bragg X-ray diffraction of NaCl, Embry-Riddle PS315 lab;
    lattice spacing d(NaCl) = 2.82 A, Cu K-alpha1 = 1.5406 A."""
    r = bragg_diffraction(d_spacing_m=2.82e-10, wavelength_m=1.5406e-10, order=1)
    # sin(theta) = lambda/(2d) = 1.5406 / 5.64 = 0.27316
    assert r["sin_theta"] == pytest.approx(0.27316, abs=1e-4)
    assert r["theta_deg"] == pytest.approx(15.86, abs=0.05)
    assert r["two_theta_deg"] == pytest.approx(31.72, abs=0.1)


def test_bragg_forward_check():
    """Forward check: feed theta back, recover lambda (n*lambda = 2 d sin th)."""
    r = bragg_diffraction(
        d_spacing_m=2.82e-10, wavelength_m=0.0, order=1, theta_deg=15.86
    )
    assert r["wavelength_m"] == pytest.approx(1.5406e-10, rel=1e-3)


# ── 2. Lever rule ────────────────────────────────────────────────────────────
def test_lever_rule_cu_ni():
    """Cu-Ni alloy, C0 = 35 wt% Ni at 1250 C: C_alpha(solid) ~= 42.5,
    C_liquid ~= 31.5 wt% Ni. Known fractions W_L ~= 0.68, W_alpha ~= 0.32.
    Ref: Callister, Materials Science & Engineering, lever-rule worked example
    (Cu-Ni isomorphous diagram)."""
    r = lever_rule(c0=35.0, c_alpha=42.5, c_liquid=31.5)
    assert r["fraction_liquid"] == pytest.approx(0.682, abs=0.01)
    assert r["fraction_alpha"] == pytest.approx(0.318, abs=0.01)
    assert r["sum_check"] == pytest.approx(1.0, abs=1e-9)


# ── 3. Griffith fracture ─────────────────────────────────────────────────────
def test_griffith_glass():
    """Glass: E = 70 GPa, gamma_s = 1 J/m^2 (a surface energy of ~1 J/m^2 gives
    good agreement for glass), internal crack half-length a = 1 um.
    sigma_f = sqrt(2 E gamma / (pi a)) = sqrt(2*70e9*1/(pi*1e-6)) ~= 211 MPa.
    Ref: Griffith brittle-fracture theory; gamma_s ~= 1 J/m^2 for silica glass."""
    r = griffith_fracture(
        youngs_modulus_pa=70e9, surface_energy_j_m2=1.0, crack_half_length_m=1e-6
    )
    expected = math.sqrt(2 * 70e9 * 1.0 / (math.pi * 1e-6))  # 2.111e8 Pa
    assert r["fracture_stress_pa"] == pytest.approx(expected, rel=1e-9)
    assert r["fracture_stress_mpa"] == pytest.approx(211.0, abs=1.0)


# ── 4. Fick's-law diffusion ──────────────────────────────────────────────────
def test_fick_carburization():
    """Steel carburizing (Callister Ex.): C0=0.20, Cs=1.00 wt% C, x=0.5 mm,
    D = 1.6e-11 m^2/s, t = 10 h = 36000 s.
    z = x/(2 sqrt(Dt)) = 5e-4/(2*sqrt(1.6e-11*36000)) = 0.3294 -> erf=0.3593.
    C = C0 + (Cs-C0)(1-erf(z)) = 0.20 + 0.80*0.6407 ~= 0.713 wt% C.
    Ref: Callister, carburization worked example (erf solution to Fick 2nd law)."""
    r = fick_diffusion(cs=1.00, c0=0.20, x_m=5e-4, diffusivity_m2_s=1.6e-11,
                       time_s=36000.0)
    assert r["argument_z"] == pytest.approx(0.3294, abs=1e-3)
    assert r["erf_z"] == pytest.approx(0.3593, abs=2e-3)
    assert r["concentration"] == pytest.approx(0.7125, abs=2e-3)
    # diffusion length L = 2 sqrt(Dt)
    assert r["diffusion_length_m"] == pytest.approx(2 * math.sqrt(1.6e-11 * 36000),
                                                    rel=1e-9)


# ── 5. Hooke elasticity ──────────────────────────────────────────────────────
def test_hooke_steel_modulus():
    """Steel bar: A=1e-4 m^2 (1 cm^2), L0=2.0 m, F=2.0e5 N gives stress 2 GPa
    (hypothetical), elongation dL=2.0e-2 m -> strain 0.01 -> E=200 GPa.
    Known Young's modulus of steel ~= 200 GPa.
    Ref: standard mechanics of materials; E_steel ~= 200 GPa."""
    r = hooke_elasticity(force_n=2.0e5, area_m2=1e-4, length0_m=2.0,
                         delta_length_m=2.0e-2)
    assert r["stress_pa"] == pytest.approx(2.0e9, rel=1e-9)
    assert r["strain"] == pytest.approx(0.01, rel=1e-9)
    assert r["youngs_modulus_gpa"] == pytest.approx(200.0, abs=1e-6)


# ── 6. Arrhenius vacancy concentration ───────────────────────────────────────
def test_arrhenius_vacancy_copper():
    """Copper equilibrium vacancy fraction at 1000 C (1273 K).
    Q_v ~= 0.90 eV = 86840 J/mol, A=1. N_v/N = exp(-Q/(RT)).
    exp(-86840/(8.314*1273)) ~= exp(-8.206) ~= 2.73e-4.
    Ref: Callister vacancy-concentration example (Cu, Q_v ~ 0.9 eV) gives
    N_v/N on the order of 1e-4 near the melting range."""
    Q = 0.90 * 96485.0  # eV/atom -> J/mol via Faraday (eV*N_A*e)
    r = arrhenius_vacancy(activation_energy_j_per_mol=Q, temperature_k=1273.0)
    # exponent
    assert r["exponent"] == pytest.approx(-(Q) / (8.314462618 * 1273.0), rel=1e-9)
    assert r["vacancy_fraction"] == pytest.approx(2.7e-4, rel=0.1)
    # per-atom basis must agree with molar basis (consistency check)
    assert r["exponent_per_atom"] == pytest.approx(r["exponent"], rel=1e-6)


# ── 7. Hall-Petch ────────────────────────────────────────────────────────────
def test_hall_petch_value_and_trend():
    """Hall-Petch with sigma0=25 MPa, k_y=0.74 MPa*m^0.5 (Callister 70-30 brass
    constants). At d=0.01 mm=1e-5 m: sigma_y = 25e6 + 0.74e6/sqrt(1e-5)
    = 25e6 + 0.74e6*316.23 = 25e6 + 234e6 ~= 259 MPa.
    Ref: Callister grain-size strengthening example (brass)."""
    r = hall_petch(sigma0_pa=25e6, k_y_pa_sqrt_m=0.74e6, grain_diameter_m=1e-5)
    assert r["yield_strength_mpa"] == pytest.approx(259.0, abs=1.0)
    # Trend: finer grain -> stronger
    coarse = hall_petch(25e6, 0.74e6, 1e-4)["yield_strength_mpa"]
    fine = hall_petch(25e6, 0.74e6, 1e-6)["yield_strength_mpa"]
    assert fine > r["yield_strength_mpa"] > coarse


# ── 8. Wiedemann-Franz ───────────────────────────────────────────────────────
def test_wiedemann_franz_theoretical_lorenz():
    """The theoretical (Sommerfeld) Lorenz number L = (pi^2/3)(k_B/e)^2
    = 2.44e-8 W*ohm/K^2 (KNOWN reference value)."""
    assert LORENZ_THEORETICAL == pytest.approx(2.44e-8, abs=0.01e-8)


def test_wiedemann_franz_copper():
    """Copper at 293 K: sigma = 5.96e7 S/m, kappa = 401 W/(m K).
    L = kappa/(sigma*T) = 401/(5.96e7*293) ~= 2.30e-8, within ~6% of the
    theoretical 2.44e-8 (real metals lie close to it at room T).
    Ref: Wiedemann-Franz law; Cu room-temperature properties."""
    r = wiedemann_franz(thermal_conductivity_w_mk=401.0,
                        electrical_conductivity_s_m=5.96e7,
                        temperature_k=293.0)
    assert r["lorenz_number"] == pytest.approx(2.30e-8, abs=0.1e-8)
    assert 0.85 < r["ratio_to_theoretical"] < 1.05


# ── route table ──────────────────────────────────────────────────────────────
@pytest.mark.parametrize("kw,fname", [
    ("crystallography", "bragg_diffraction"),
    ("phase diagram", "lever_rule"),
    ("fracture toughness", "griffith_fracture"),
    ("diffusion profile", "fick_diffusion"),
    ("elastic modulus", "hooke_elasticity"),
    ("creep test", "arrhenius_vacancy"),
    ("grain boundary", "hall_petch"),
    ("thermal conductivity", "wiedemann_franz"),
])
def test_route_table(kw, fname):
    fn = route(kw)
    assert fn is not None
    assert fn.__name__ == fname
