"""Each semiconductor method must reproduce its KNOWN published or analytically
exact value.

Citations are inline. Tolerances are explicit. All concentrations in cm^-3,
energies in eV, voltages in V, lengths in cm unless noted.
"""
import math

from underworld.server.services.methods_semiconductor import (
    Q,
    K_B,
    built_in_potential,
    carrier_density_fermi,
    depletion_width,
    drift_conductivity,
    hall_effect,
    intrinsic_carrier_concentration,
    shockley_diode,
    varshni_bandgap,
)


# 1. Intrinsic carrier concentration — KNOWN: silicon ni(300 K) ~= 1.0e10 cm^-3.
#    Ref: Sze; eesemi.com Si properties. ni = sqrt(Nc Nv) exp(-Eg/2kT).
def test_intrinsic_ni_silicon_300K():
    r = intrinsic_carrier_concentration(300.0)
    # consensus Si value ~1.0e10 cm^-3 (published range 8e9..1.5e10)
    assert 5.0e9 < r["ni_cm3"] < 2.0e10
    # within a factor ~1.5 of the canonical 1.0e10
    assert abs(math.log10(r["ni_cm3"] / 1.0e10)) < 0.2
    # kT = 0.02585 eV at 300 K
    assert abs(r["kT_eV"] - 0.02585) < 1e-4
    # ni rises steeply with temperature
    assert intrinsic_carrier_concentration(400.0)["ni_cm3"] > 100.0 * r["ni_cm3"]


# 2. Carrier density & Fermi level — KNOWN: Boltzmann statistics satisfy the
#    mass-action law n*p = ni^2 exactly; at midgap-ish Ef, n ~ ni.
#    Ref: Sze ch.1.
def test_carrier_density_mass_action_law():
    # Put Ef near midgap: Ec-Ef = Eg/2 -> n should be ~ ni.
    Eg = 1.12
    r = carrier_density_fermi(Eg / 2.0, 300.0, Eg_eV=Eg)
    # mass-action law holds to numerical precision in the Boltzmann regime
    assert abs(r["np_product_cm6"] / r["ni2_cm6"] - 1.0) < 1e-9
    # at Ef = midgap, n and p are within an order of magnitude of ni
    assert 0.1 < r["n_cm3"] / r["ni_cm3"] < 10.0
    # moving Ef toward the conduction band raises n
    r2 = carrier_density_fermi(0.2, 300.0, Eg_eV=Eg)
    assert r2["n_cm3"] > r["n_cm3"]
    # Fermi-Dirac branch runs and is finite/positive
    rfd = carrier_density_fermi(0.2, 300.0, Eg_eV=Eg, use_fermi_dirac=True)
    assert rfd["n_cm3"] > 0.0


# 3. Shockley diode — KNOWN: V_T = kT/q ~= 0.02585 V at 300 K; I(0)=0;
#    I = I_s[exp(V/V_T)-1]. For I_s=1e-12 A, V=0.6 V:
#    I = 1e-12*(exp(0.6/0.02585)-1) ~= 1e-12*1.27e10 ~= 0.0127 A.
#    Ref: Shockley (1949); Sze.
def test_shockley_diode_known_current():
    r = shockley_diode(0.6, 1.0e-12, 300.0)
    assert abs(r["thermal_voltage_V"] - 0.02585) < 1e-4
    # analytic reference current
    VT = K_B * 300.0 / Q
    I_ref = 1.0e-12 * (math.exp(0.6 / VT) - 1.0)
    assert abs(r["I_A"] - I_ref) / I_ref < 1e-9
    assert 0.005 < r["I_A"] < 0.05            # ~12.7 mA
    # zero bias -> zero current
    assert abs(shockley_diode(0.0, 1.0e-12)["I_A"]) < 1e-18
    # strong reverse bias -> -I_s saturation
    assert abs(shockley_diode(-1.0, 1.0e-12)["I_A"] + 1.0e-12) < 1e-15


# 4. Built-in potential — KNOWN: Si Na=Nd=1e17, ni=1e10 at 300 K ->
#    V_bi = 0.02585*ln(1e34/1e20) = 0.02585*ln(1e14) ~= 0.834 V.
#    Ref: Sze ch.2.
def test_built_in_potential_silicon():
    r = built_in_potential(1.0e17, 1.0e17, 300.0, ni=1.0e10)
    VT = K_B * 300.0 / Q
    Vbi_ref = VT * math.log(1.0e17 * 1.0e17 / (1.0e10 ** 2))
    assert abs(r["Vbi_V"] - Vbi_ref) < 1e-12
    assert abs(r["Vbi_V"] - 0.834) < 0.02      # ~0.83 V
    # higher doping -> larger Vbi
    assert built_in_potential(1.0e18, 1.0e18, ni=1.0e10)["Vbi_V"] > r["Vbi_V"]


# 5. Depletion width & junction capacitance — KNOWN: abrupt Si junction
#    Na=Nd=1e16, ni=1e10 at 300 K, zero bias -> W sub-micron (~1e-5..1e-4 cm),
#    and Cj = eps*A/W holds exactly. Cross-check W against analytic formula.
#    Ref: Sze ch.2.
def test_depletion_width_and_capacitance():
    Na = Nd = 1.0e16
    r = depletion_width(Na, Nd, 0.0, 300.0, area_cm2=1.0)
    # analytic cross-check
    eps = r["eps_F_per_cm"]
    Vbi = r["Vbi_V"]
    W_ref = math.sqrt(2.0 * eps * Vbi / Q * (1.0 / Na + 1.0 / Nd))
    assert abs(r["W_cm"] - W_ref) < 1e-12
    # physically sub-micron depletion region
    assert 1e-6 < r["W_cm"] < 1e-3
    # Cj = eps*A/W definition holds
    assert abs(r["Cj_F"] - eps * 1.0 / r["W_cm"]) < 1e-18
    # forward bias narrows the depletion region
    rf = depletion_width(Na, Nd, 0.3, 300.0)
    assert rf["W_cm"] < r["W_cm"]
    # xn + xp = W
    assert abs((r["xn_cm"] + r["xp_cm"]) - r["W_cm"]) < 1e-12


# 6. Drift conductivity — KNOWN: n-type Si n=1e16, mu_n=1350 ->
#    sigma = q*n*mu_n = 1.602e-19*1e16*1350 ~= 2.16 (ohm*cm)^-1,
#    rho ~= 0.46 ohm*cm.
#    Ref: Sze ch.1.
def test_drift_conductivity_ntype_silicon():
    r = drift_conductivity(1.0e16, 0.0, mu_n=1350.0, mu_p=480.0)
    sigma_ref = Q * 1.0e16 * 1350.0
    assert abs(r["sigma_S_per_cm"] - sigma_ref) < 1e-12
    assert abs(r["sigma_S_per_cm"] - 2.16) < 0.05
    assert abs(r["resistivity_ohm_cm"] - 0.46) < 0.02
    # both carriers contribute additively
    r2 = drift_conductivity(1.0e16, 1.0e16, mu_n=1350.0, mu_p=480.0)
    assert abs(r2["sigma_S_per_cm"]
               - Q * (1.0e16 * 1350.0 + 1.0e16 * 480.0)) < 1e-12


# 7. Hall effect — KNOWN: V_H = I B / (n q t); feeding the predicted V_H back
#    recovers the input n (self-consistency). For n=1e16 cm^-3, I=1e-3 A,
#    B=0.5 T, t=0.1 cm: V_H = 1e-3*0.5/(1e22 m^-3*1.602e-19*1e-3 m) ~= 3.12e-4 V.
#    Ref: Hall (1879); OpenStax Univ. Physics II.
def test_hall_effect_roundtrip():
    n_in = 1.0e16
    pred = hall_effect(1.0e-3, 0.5, 0.1, n=n_in, carrier_sign=-1)
    # analytic |V_H|
    n_si = n_in * 1.0e6
    t_m = 0.1 / 100.0
    VH_ref = 1.0e-3 * 0.5 / (n_si * Q * t_m)
    assert abs(abs(pred["V_H_V"]) - VH_ref) < 1e-9
    assert abs(abs(pred["V_H_V"]) - 3.12e-4) < 0.2e-4
    # recover n from the predicted V_H
    rec = hall_effect(1.0e-3, 0.5, 0.1, V_H=pred["V_H_V"])
    assert abs(rec["n_cm3"] - n_in) / n_in < 1e-9
    # electron vs hole sign convention flips V_H sign
    holes = hall_effect(1.0e-3, 0.5, 0.1, n=n_in, carrier_sign=+1)
    assert pred["V_H_V"] * holes["V_H_V"] < 0.0


# 8. Varshni bandgap — KNOWN: Si (Eg0=1.166, alpha=4.73e-4, beta=636):
#    Eg(0)=1.166 eV; Eg(300 K) ~= 1.166 - 4.73e-4*9e4/936 ~= 1.1205 eV.
#    Ref: Varshni, Physica 34, 149 (1967); Sze.
def test_varshni_silicon_bandgap():
    assert abs(varshni_bandgap(0.0)["Eg_eV"] - 1.166) < 1e-9    # Eg(0)=Eg0
    r300 = varshni_bandgap(300.0)
    Eg_ref = 1.166 - 4.73e-4 * 300.0 ** 2 / (300.0 + 636.0)
    assert abs(r300["Eg_eV"] - Eg_ref) < 1e-12
    assert abs(r300["Eg_eV"] - 1.1205) < 0.005     # ~1.12 eV at 300 K
    # monotonic decrease with temperature
    assert varshni_bandgap(400.0)["Eg_eV"] < r300["Eg_eV"]
