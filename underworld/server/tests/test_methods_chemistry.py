"""Verification tests for real chemistry methods.

Each test asserts a computed value against a KNOWN published value, with a
tolerance and an inline citation of the source of that known value.
"""
import math

import pytest

from underworld.server.services.methods_chemistry import (
    ROUTE_TABLE,
    arrhenius_rate_ratio,
    beer_lambert_absorbance,
    chemical_equilibrium,
    gibbs_free_energy,
    nernst_cell_potential,
    reaction_kinetics_first_order,
    van_der_waals_pressure,
    weak_acid_ph,
)


# ---------------------------------------------------------------------------
# 1. First-order kinetics: half-life = ln(2)/k
# ---------------------------------------------------------------------------
def test_first_order_half_life():
    k = 0.1  # 1/s
    res = reaction_kinetics_first_order(k=k, a0=1.0)
    # KNOWN: t_1/2 = ln(2)/k = 0.6931.../0.1 = 6.9315 s (any first-order kinetics text)
    assert res["half_life_analytic"] == pytest.approx(math.log(2) / k, rel=1e-12)
    # Numerically located half-life matches analytic to within grid resolution.
    assert res["half_life_numeric"] == pytest.approx(6.9315, abs=1e-2)
    # scipy ODE integration matches analytic exp(-kt) extremely closely.
    assert res["max_abs_error_vs_analytic"] < 1e-6


def test_first_order_half_life_independent_of_a0():
    # Half-life of a first-order reaction is independent of initial concentration.
    r1 = reaction_kinetics_first_order(k=0.05, a0=1.0)
    r2 = reaction_kinetics_first_order(k=0.05, a0=10.0)
    assert r1["half_life_analytic"] == pytest.approx(r2["half_life_analytic"], rel=1e-12)


# ---------------------------------------------------------------------------
# 2. Chemical equilibrium A <-> B and Le Chatelier
# ---------------------------------------------------------------------------
def test_equilibrium_concentrations():
    res = chemical_equilibrium(keq=4.0, a_initial=1.0, b_initial=0.0)
    # KNOWN: Keq = [B]/[A] = 4 with [A]+[B]=1 => [A]=0.2, [B]=0.8.
    assert res["a_eq"] == pytest.approx(0.2, abs=1e-9)
    assert res["b_eq"] == pytest.approx(0.8, abs=1e-9)
    # Reaction quotient at equilibrium equals Keq.
    assert res["reaction_quotient_at_eq"] == pytest.approx(4.0, rel=1e-9)
    # Mass is conserved.
    assert res["total_conserved"] == pytest.approx(1.0, abs=1e-12)


def test_le_chatelier_direction():
    # Increasing Keq must shift equilibrium toward products (more B, less A).
    low = chemical_equilibrium(keq=1.0)
    high = chemical_equilibrium(keq=10.0)
    assert high["b_eq"] > low["b_eq"]
    assert high["a_eq"] < low["a_eq"]


# ---------------------------------------------------------------------------
# 3. Nernst equation: Daniell cell
# ---------------------------------------------------------------------------
def test_nernst_standard_daniell_cell():
    # Daniell cell Zn + Cu2+ -> Zn2+ + Cu, E0 = 1.10 V, n = 2.
    # KNOWN: at standard conditions (Q=1) E = E0 = 1.10 V.
    res = nernst_cell_potential(e_standard=1.10, n=2, q=1.0, T=298.15)
    assert res["e_cell_V"] == pytest.approx(1.10, abs=1e-9)
    assert res["spontaneous"] is True


def test_nernst_slope_0_0592():
    # KNOWN: the Nernst factor 2.303 R T / F = 0.05916 V at 298.15 K
    # (standard analytical-chemistry value ~0.0592 V).
    res = nernst_cell_potential(e_standard=1.10, n=2, q=1.0, T=298.15)
    assert res["nernst_slope_V"] == pytest.approx(0.05916, abs=5e-5)


def test_nernst_nonstandard():
    # [Cu2+]=0.01, [Zn2+]=1.0 => Q = [Zn2+]/[Cu2+] = 100.
    # KNOWN: E = 1.10 - (0.0592/2)*log10(100) = 1.10 - 0.0592 = 1.0408 V.
    res = nernst_cell_potential(e_standard=1.10, n=2, q=100.0, T=298.15)
    assert res["e_cell_V"] == pytest.approx(1.0408, abs=2e-3)


# ---------------------------------------------------------------------------
# 4. Weak acid pH: 0.1 M acetic acid
# ---------------------------------------------------------------------------
def test_weak_acid_acetic_ph():
    res = weak_acid_ph(concentration=0.1, pka=4.76)
    # KNOWN: 0.1 M acetic acid (pKa 4.76) has pH ~= 2.87 (LibreTexts/standard texts).
    assert res["ph_exact"] == pytest.approx(2.87, abs=0.02)
    # The 1/2(pKa - log C) approximation lands at essentially the same value.
    assert res["ph_approx_half_pka_minus_logC"] == pytest.approx(2.88, abs=0.02)


# ---------------------------------------------------------------------------
# 5. Arrhenius temperature dependence
# ---------------------------------------------------------------------------
def test_arrhenius_rate_doubles_per_10C():
    # KNOWN: for Ea ~= 52.9 kJ/mol the rate roughly doubles for a 10 C rise
    # near room temperature (classic 'rate doubles per 10 degrees' rule).
    res = arrhenius_rate_ratio(ea=52900.0, T1=298.15, T2=308.15)
    assert res["rate_ratio_k2_over_k1"] == pytest.approx(2.0, abs=0.05)


def test_arrhenius_higher_T_faster():
    res = arrhenius_rate_ratio(ea=75000.0, T1=300.0, T2=310.0)
    assert res["rate_ratio_k2_over_k1"] > 1.0


# ---------------------------------------------------------------------------
# 6. Beer-Lambert law: NADH at 340 nm
# ---------------------------------------------------------------------------
def test_beer_lambert_nadh():
    # NADH at 340 nm: epsilon = 6220 L/(mol cm), l = 1 cm, c = 1.0e-4 M.
    # KNOWN: A = eps*l*c = 6220 * 1 * 1e-4 = 0.622.
    res = beer_lambert_absorbance(epsilon=6220.0, path_length=1.0, concentration=1.0e-4)
    assert res["absorbance"] == pytest.approx(0.622, abs=1e-6)
    # Transmittance T = 10^-A.
    assert res["transmittance"] == pytest.approx(10 ** -0.622, rel=1e-9)


# ---------------------------------------------------------------------------
# 7. van der Waals real-gas pressure: CO2
# ---------------------------------------------------------------------------
def test_van_der_waals_co2_correction_sign():
    # CO2: a = 3.640 L^2 atm/mol^2, b = 0.04267 L/mol; 1 mol, 22.4 L, 273.15 K.
    # KNOWN: ideal P = 1.00 atm; vdW attraction term lowers P below ideal.
    res = van_der_waals_pressure(n=1.0, V=22.4, T=273.15, a=3.640, b=0.04267)
    assert res["pressure_ideal_atm"] == pytest.approx(1.0003, abs=2e-3)
    # vdW pressure is BELOW ideal (attraction dominates at these conditions).
    assert res["attraction_dominates"] is True
    assert res["vdw_correction_atm"] < 0
    # Magnitude is small but real: vdW P ~ 0.995 atm.
    assert res["pressure_vdw_atm"] == pytest.approx(0.995, abs=5e-3)


# ---------------------------------------------------------------------------
# 8. Gibbs free energy: formation of liquid water
# ---------------------------------------------------------------------------
def test_gibbs_water_formation_spontaneous():
    # H2(g) + 1/2 O2(g) -> H2O(l): dH = -285800 J/mol, dS = -163.2 J/(mol K).
    # KNOWN: dG_f(H2O,l) = -237.1 kJ/mol at 298.15 K (Wikipedia/standard tables).
    res = gibbs_free_energy(delta_h=-285800.0, delta_s=-163.2, T=298.15)
    assert res["delta_g_kJ_per_mol"] == pytest.approx(-237.1, abs=0.5)
    assert res["spontaneous"] is True


def test_gibbs_endothermic_entropy_driven():
    # Endothermic but entropy-increasing reaction becomes spontaneous at high T.
    cold = gibbs_free_energy(delta_h=50000.0, delta_s=100.0, T=298.15)
    hot = gibbs_free_energy(delta_h=50000.0, delta_s=100.0, T=1000.0)
    assert cold["spontaneous"] is False
    assert hot["spontaneous"] is True


# ---------------------------------------------------------------------------
# Route table sanity
# ---------------------------------------------------------------------------
def test_route_table_maps_to_real_functions():
    import underworld.server.services.methods_chemistry as mod
    expected_keywords = {
        "kinetic", "equilibr", "electrochem", "titrat",
        "arrheniu", "spectro", "gas", "thermochem",
    }
    keywords = {kw for (_field, kw) in ROUTE_TABLE}
    assert expected_keywords <= keywords
    for fn_name in ROUTE_TABLE.values():
        assert callable(getattr(mod, fn_name))
