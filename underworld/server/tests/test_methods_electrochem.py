"""Each electrochemistry method must reproduce its KNOWN published or
analytically exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_electrochem import (
    F_FARADAY,
    R_GAS,
    T_STANDARD,
    battery_capacity_soc,
    butler_volmer_current,
    debye_huckel_activity,
    faraday_electrolysis,
    molar_conductivity_kohlrausch,
    nernst_einstein_conductivity,
    nernst_potential,
    standard_cell_emf,
    tafel_overpotential,
)


# 1. Nernst equation — KNOWN: at Q=1 (standard conditions) E = E0 exactly;
#    the thermal slope 2.303 RT/F at 298.15 K is the classic 0.05916 V/decade.
#    Ref: Nernst equation (Bard & Faulkner).
def test_nernst_standard_conditions_and_slope():
    r = nernst_potential(1.10, n=2, Q=1.0)
    assert abs(r["E_V"] - 1.10) < 1e-12              # Q=1 -> E = E0
    # one-electron Nernst slope per decade at 298.15 K ~= 0.05916 V
    one_e = nernst_potential(0.0, n=1, Q=10.0)
    assert abs(one_e["slope_per_decade_V"] - 0.059160) < 1e-4
    # raising Q by a decade (n=1) drops E by exactly one Nernst slope
    assert abs(one_e["E_V"] - (-one_e["slope_per_decade_V"])) < 1e-9
    # RT/F prefactor ~= 0.025693 V at 298.15 K
    assert abs(one_e["thermal_RT_over_nF_V"] - 0.025693) < 1e-5


# 2. Standard cell EMF — KNOWN: Daniell cell Cu2+/Cu (+0.34) vs Zn2+/Zn (-0.76)
#    -> E0_cell = +1.10 V; dG0 = -n F E0 < 0 (spontaneous).
#    Ref: standard electrode potentials (Atkins; CRC Handbook).
def test_daniell_cell_emf_1p10V():
    r = standard_cell_emf(E_cathode_V=0.34, E_anode_V=-0.76, n=2)
    assert abs(r["E0_cell_V"] - 1.10) < 1e-9         # Daniell cell 1.10 V
    assert r["spontaneous"]
    # dG0 = -2 * 96485 * 1.10 = -212.3 kJ/mol
    assert abs(r["delta_G0_kJ_per_mol"] - (-212.267)) < 0.5


# 3. Faraday electrolysis — KNOWN: one Faraday (96485 C) deposits 107.868 g Ag
#    (n=1) and 31.773 g Cu (n=2, M=63.546); Ag electrochem. equiv ~1.118 mg/C.
#    Ref: Faraday's laws of electrolysis.
def test_faraday_silver_and_copper_one_faraday():
    ag = faraday_electrolysis(F_FARADAY, molar_mass_g=107.868, n=1)
    assert abs(ag["mass_g"] - 107.868) < 1e-6        # 1 F deposits 1 mol Ag
    assert abs(ag["moles_electrons"] - 1.0) < 1e-12
    # silver electrochemical equivalent ~= 1.118 mg per coulomb
    assert abs(ag["electrochemical_equiv_g_per_C"] * 1000.0 - 1.118) < 2e-3
    cu = faraday_electrolysis(F_FARADAY, molar_mass_g=63.546, n=2)
    assert abs(cu["mass_g"] - 31.773) < 1e-6         # M/2 for divalent Cu


# 4. Butler-Volmer — KNOWN: at eta=0 the NET current is exactly 0; large
#    positive overpotential -> pure anodic (j > 0), large negative -> j < 0.
#    Ref: Butler-Volmer equation (Bard & Faulkner).
def test_butler_volmer_zero_overpotential_and_sign():
    eq = butler_volmer_current(j0=1e-3, eta_V=0.0)
    assert abs(eq["j"]) < 1e-15                       # equilibrium: net j = 0
    assert eq["j"] == eq["j_anodic"] - eq["j_cathodic"]
    pos = butler_volmer_current(j0=1e-3, eta_V=0.1)
    neg = butler_volmer_current(j0=1e-3, eta_V=-0.1)
    assert pos["j"] > 0.0 and neg["j"] < 0.0          # current follows eta sign
    assert abs(pos["j"] + neg["j"]) < 1e-12           # symmetric alphas -> odd


# 5. Tafel slope — KNOWN: alpha=0.5, n=1, 298.15 K -> b ~= 0.1183 V/decade
#    (~118 mV/decade); eta = 0 exactly when j = j0.
#    Ref: Tafel equation (Bockris & Reddy).
def test_tafel_slope_118mV_per_decade():
    r = tafel_overpotential(j=1e-2, j0=1e-3, alpha=0.5, n=1)
    assert abs(r["tafel_slope_mV_per_decade"] - 118.3) < 0.5
    # one decade of current above j0 -> eta = one Tafel slope
    assert abs(r["eta_V"] - r["tafel_slope_V_per_decade"]) < 1e-9
    # no overpotential at the exchange current density
    assert abs(tafel_overpotential(j=5e-3, j0=5e-3)["eta_V"]) < 1e-12


# 6a. Kohlrausch — KNOWN (aqueous, 25C, S cm2/mol): H+349.8, Cl-76.3, Na+50.1,
#     K+73.5, OH-198.0 -> HCl~426.1, KCl~149.8, NaCl~126.4.
#     Ref: Kohlrausch's law (Atkins; CRC Handbook).
def test_kohlrausch_known_electrolytes():
    hcl = molar_conductivity_kohlrausch(349.8, 76.3)
    assert abs(hcl["Lambda0_S_cm2_per_mol"] - 426.1) < 0.5
    kcl = molar_conductivity_kohlrausch(73.5, 76.3)
    assert abs(kcl["Lambda0_S_cm2_per_mol"] - 149.8) < 1.0
    nacl = molar_conductivity_kohlrausch(50.1, 76.3)
    assert abs(nacl["Lambda0_S_cm2_per_mol"] - 126.4) < 1.0


# 6b. Nernst-Einstein — KNOWN: H+ in water D~9.31e-9 m2/s, z=1 ->
#     lambda ~= 350 S cm2/mol (the tabulated proton ionic conductivity).
#     Ref: Nernst-Einstein relation (Atkins).
def test_nernst_einstein_proton_conductivity():
    r = nernst_einstein_conductivity(D_m2_per_s=9.31e-9, z=1)
    assert abs(r["lambda_S_cm2_per_mol"] - 349.8) < 6.0   # tabulated H+ ~349.8


# 7. Debye-Huckel limiting law — KNOWN: 0.001 m 1:1 salt -> I=0.001,
#    gamma_+- = 10^(-0.509*sqrt(0.001)) ~= 0.9636.
#    Ref: Debye-Huckel limiting law (Atkins; LibreTexts 25.6).
def test_debye_huckel_dilute_nacl():
    r = debye_huckel_activity(
        {"Na+": (0.001, 1), "Cl-": (0.001, -1)}, z_plus=1, z_minus=-1)
    assert abs(r["ionic_strength_molal"] - 0.001) < 1e-12
    expected = 10.0 ** (-0.509 * math.sqrt(0.001))
    assert abs(r["gamma_mean"] - expected) < 1e-9
    assert abs(r["gamma_mean"] - 0.9636) < 1e-3       # textbook value
    # gamma -> 1 as concentration -> 0 (ideal-dilute limit)
    dilute = debye_huckel_activity({"Na+": (1e-9, 1), "Cl-": (1e-9, -1)})
    assert abs(dilute["gamma_mean"] - 1.0) < 1e-4


# 8. Peukert / Coulomb counting — KNOWN: with k=1 (ideal) C_eff = C_rated for
#    any current; a fully-charged 100 Ah, 12 V battery stores 1200 Wh.
#    Ref: Peukert's law; Coulomb-counting SoC.
def test_peukert_ideal_and_energy():
    r = battery_capacity_soc(rated_capacity_Ah=100.0, peukert_k=1.0,
                             discharge_current_A=20.0, rated_current_A=1.0,
                             charge_passed_Ah=0.0, nominal_voltage_V=12.0)
    assert abs(r["effective_capacity_Ah"] - 100.0) < 1e-9   # k=1 -> no fade
    assert abs(r["energy_Wh"] - 1200.0) < 1e-6              # 100 Ah * 12 V
    assert abs(r["state_of_charge"] - 1.0) < 1e-12          # nothing drawn yet
    # real lead-acid k=1.3: doubling current below rated cuts effective capacity
    real = battery_capacity_soc(rated_capacity_Ah=100.0, peukert_k=1.3,
                                discharge_current_A=10.0, rated_current_A=1.0)
    assert real["effective_capacity_Ah"] < 100.0
    # half-drained pack reads SoC = 0.5
    half = battery_capacity_soc(rated_capacity_Ah=100.0, peukert_k=1.0,
                                discharge_current_A=10.0, charge_passed_Ah=50.0)
    assert abs(half["state_of_charge"] - 0.5) < 1e-9
