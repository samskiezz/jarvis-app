"""Real electrochemistry simulations.

Each function is a distinct, named electrochemical method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: thermodynamics of
galvanic cells (Nernst equation, standard EMF from half-reactions), electrolysis
(Faraday's laws), electrode kinetics (Butler-Volmer, Tafel), ionic transport
(Kohlrausch / Nernst-Einstein), solution non-ideality (Debye-Huckel limiting
law), and battery engineering (Peukert capacity & Coulomb-counting SoC).

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_electrochem.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants ────────────────────────────────────────────────────────
F_FARADAY = 96485.0          # Faraday constant, C/mol e-
R_GAS = 8.314                 # molar gas constant, J/mol/K
T_STANDARD = 298.15          # standard temperature, K (25 deg C)
N_AVOGADRO = 6.02214076e23   # Avogadro constant, 1/mol
K_BOLTZMANN = 1.380649e-23   # Boltzmann constant, J/K
E_CHARGE = 1.602176634e-19   # elementary charge, C


# ── 1. Nernst equation cell potential ─────────────────────────────────────────
def nernst_potential(E0_V: float, n: int, Q: float,
                     *, T: float = T_STANDARD) -> dict:
    """Equilibrium cell potential under non-standard conditions (Nernst eqn):
        E = E0 - (R T / n F) ln Q
    where Q is the reaction quotient, n the number of electrons transferred.
    KNOWN: at standard conditions (Q = 1) the ln term vanishes and E = E0;
    the thermal prefactor RT/F at 298.15 K is ~0.025693 V, so 2.303 RT/F is the
    classic 0.05916 V "Nernst slope" per decade.

    Ref: Nernst equation (Wikipedia; Bard & Faulkner, Electrochemical Methods).
    """
    if Q <= 0.0:
        raise ValueError("reaction quotient Q must be positive")
    thermal_V = R_GAS * T / (n * F_FARADAY)   # RT/nF, volts
    E = E0_V - thermal_V * math.log(Q)
    return {
        "E_V": E,
        "E0_V": E0_V,
        "n": n,
        "Q": Q,
        "thermal_RT_over_nF_V": thermal_V,
        "slope_per_decade_V": 2.302585092994046 * R_GAS * T / (n * F_FARADAY),
        "T_K": T,
    }


# ── 2. Standard cell EMF from two half-reaction potentials ────────────────────
def standard_cell_emf(E_cathode_V: float, E_anode_V: float,
                      *, n: int = 2) -> dict:
    """Standard EMF of a galvanic cell from the two standard reduction potentials:
        E0_cell = E0_cathode - E0_anode   (both as reduction potentials)
    and the reaction free energy  dG0 = -n F E0_cell.
    KNOWN: the Daniell cell  Cu2+/Cu (+0.34 V) cathode, Zn2+/Zn (-0.76 V) anode
    gives E0_cell = 0.34 - (-0.76) = +1.10 V.

    Ref: standard electrode potentials / galvanic cell EMF (Atkins, Physical
    Chemistry; CRC Handbook electrode potential tables).
    """
    E0_cell = E_cathode_V - E_anode_V
    dG0 = -n * F_FARADAY * E0_cell          # J/mol
    return {
        "E0_cell_V": E0_cell,
        "E_cathode_V": E_cathode_V,
        "E_anode_V": E_anode_V,
        "n": n,
        "delta_G0_J_per_mol": dG0,
        "delta_G0_kJ_per_mol": dG0 / 1000.0,
        "spontaneous": E0_cell > 0.0,
    }


# ── 3. Faraday's law of electrolysis ──────────────────────────────────────────
def faraday_electrolysis(Q_coulomb: float, molar_mass_g: float, n: int) -> dict:
    """Mass deposited/consumed at an electrode by passing charge Q (Faraday's
    first & second laws combined):
        moles e- = Q / F ;  moles species = Q / (n F) ;  m = Q M / (n F)
    KNOWN: passing exactly 1 mol of electrons (Q = F = 96485 C) through a Cu2+
    bath (n = 2, M = 63.546 g/mol) deposits 63.546/2 = 31.773 g of copper; for
    silver (n = 1, M = 107.868) one Faraday deposits 107.868 g (the classic
    electrochemical equivalent of silver, 1.118 mg/C).

    Ref: Faraday's laws of electrolysis (Wikipedia; Bard & Faulkner).
    """
    moles_electrons = Q_coulomb / F_FARADAY
    moles_species = Q_coulomb / (n * F_FARADAY)
    mass_g = Q_coulomb * molar_mass_g / (n * F_FARADAY)
    return {
        "mass_g": mass_g,
        "moles_species": moles_species,
        "moles_electrons": moles_electrons,
        "Q_coulomb": Q_coulomb,
        "n": n,
        "molar_mass_g": molar_mass_g,
        "electrochemical_equiv_g_per_C": molar_mass_g / (n * F_FARADAY),
    }


# ── 4. Butler-Volmer current from overpotential ───────────────────────────────
def butler_volmer_current(j0: float, eta_V: float, *, alpha_a: float = 0.5,
                          alpha_c: float = 0.5, n: int = 1,
                          T: float = T_STANDARD) -> dict:
    """Net electrode current density from the Butler-Volmer kinetics equation:
        j = j0 [ exp(alpha_a n F eta / R T) - exp(-alpha_c n F eta / R T) ]
    j0 is the exchange current density, eta the activation overpotential,
    alpha_a/alpha_c the anodic/cathodic transfer coefficients.
    KNOWN: at equilibrium (eta = 0) the forward and reverse terms cancel so the
    NET current is exactly 0; for large positive eta it reduces to the anodic
    Tafel exponential j ~ j0 exp(alpha_a n F eta / R T).

    Ref: Butler-Volmer equation (Bard & Faulkner, Electrochemical Methods, ch.3).
    """
    f = n * F_FARADAY / (R_GAS * T)            # 1/V
    j_anodic = j0 * math.exp(alpha_a * f * eta_V)
    j_cathodic = j0 * math.exp(-alpha_c * f * eta_V)
    j = j_anodic - j_cathodic
    return {
        "j": j,
        "j_anodic": j_anodic,
        "j_cathodic": j_cathodic,
        "j0": j0,
        "eta_V": eta_V,
        "alpha_a": alpha_a,
        "alpha_c": alpha_c,
        "n": n,
        "T_K": T,
    }


# ── 5. Tafel slope / overpotential ────────────────────────────────────────────
def tafel_overpotential(j: float, j0: float, *, alpha: float = 0.5, n: int = 1,
                        T: float = T_STANDARD) -> dict:
    """High-field (Tafel) approximation of Butler-Volmer for a single branch:
        eta = (2.303 R T / alpha n F) log10(j / j0) = b * log10(j / j0)
    where b = 2.303 R T / (alpha n F) is the Tafel slope (V/decade).
    KNOWN: for alpha = 0.5, n = 1, T = 298.15 K the Tafel slope is
    2.303*R*T/(0.5*F) ~= 0.1183 V/decade (~118 mV/decade); when j = j0 the
    overpotential is exactly 0.

    Ref: Tafel equation (Wikipedia; Bockris & Reddy, Modern Electrochemistry).
    """
    if j <= 0.0 or j0 <= 0.0:
        raise ValueError("current densities must be positive")
    b = 2.302585092994046 * R_GAS * T / (alpha * n * F_FARADAY)   # V/decade
    eta = b * math.log10(j / j0)
    return {
        "eta_V": eta,
        "tafel_slope_V_per_decade": b,
        "tafel_slope_mV_per_decade": b * 1000.0,
        "j": j,
        "j0": j0,
        "alpha": alpha,
        "n": n,
        "T_K": T,
    }


# ── 6. Kohlrausch / Nernst-Einstein ionic conductivity ────────────────────────
def molar_conductivity_kohlrausch(cation_lambda0: float, anion_lambda0: float,
                                  *, nu_cation: int = 1, nu_anion: int = 1) -> dict:
    """Limiting molar conductivity of an electrolyte from the independent ionic
    conductivities (Kohlrausch's law of independent migration of ions):
        Lambda0_m = nu+ * lambda0+ + nu- * lambda0-
    The companion Nernst-Einstein relation links an ionic molar conductivity to
    its diffusion coefficient:  lambda = z^2 F^2 D / (R T).
    KNOWN (aqueous, 25 deg C, S cm^2/mol): H+ 349.8, OH- 198.0, Cl- 76.3,
    Na+ 50.1, K+ 73.5. Hence HCl ~= 426.1, KCl ~= 149.8, NaCl ~= 126.4,
    NaOH ~= 248.1 S cm^2/mol -- matching tabulated Lambda0 values.

    Ref: Kohlrausch's law & Nernst-Einstein relation (Atkins, Physical
    Chemistry; CRC Handbook ionic conductivity tables).
    """
    Lambda0 = nu_cation * cation_lambda0 + nu_anion * anion_lambda0
    return {
        "Lambda0_S_cm2_per_mol": Lambda0,
        "cation_lambda0": cation_lambda0,
        "anion_lambda0": anion_lambda0,
        "nu_cation": nu_cation,
        "nu_anion": nu_anion,
    }


def nernst_einstein_conductivity(D_m2_per_s: float, z: int,
                                 *, T: float = T_STANDARD) -> dict:
    """Ionic molar conductivity from a diffusion coefficient via Nernst-Einstein:
        lambda = z^2 F^2 D / (R T)
    KNOWN: for H+ in water D ~= 9.31e-9 m^2/s, z = 1, giving lambda ~= 0.0350
    S m^2/mol = 350 S cm^2/mol, the tabulated proton ionic conductivity.

    Ref: Nernst-Einstein relation (Atkins, Physical Chemistry).
    """
    lam_SI = (z ** 2) * (F_FARADAY ** 2) * D_m2_per_s / (R_GAS * T)  # S m^2/mol
    return {
        "lambda_S_m2_per_mol": lam_SI,
        "lambda_S_cm2_per_mol": lam_SI * 1.0e4,   # 1 m^2 = 1e4 cm^2
        "D_m2_per_s": D_m2_per_s,
        "z": z,
        "T_K": T,
    }


# ── 7. Debye-Huckel limiting law activity coefficient ─────────────────────────
def debye_huckel_activity(molality: dict, *, A: float = 0.509,
                          z_plus: int = 1, z_minus: int = -1) -> dict:
    """Mean ionic activity coefficient from the Debye-Huckel LIMITING law:
        I = 1/2 * sum_i m_i z_i^2          (ionic strength, molal)
        log10(gamma_+-) = -A |z+ z-| sqrt(I)
    with A = 0.509 (kg/mol)^(1/2) for water at 25 deg C.
    KNOWN: for 0.001 mol/kg of a 1:1 salt (e.g. NaCl) I = 0.001 and
    gamma_+- = 10^(-0.509*sqrt(0.001)) ~= 0.964, the textbook limiting-law value.

    Ref: Debye-Huckel limiting law (Atkins, Physical Chemistry; LibreTexts 25.6).
    `molality` maps ion label -> (molality mol/kg, charge z).
    """
    I = 0.5 * sum(m * (z ** 2) for (m, z) in molality.values())
    log10_gamma = -A * abs(z_plus * z_minus) * math.sqrt(I)
    gamma = 10.0 ** log10_gamma
    return {
        "ionic_strength_molal": I,
        "log10_gamma_mean": log10_gamma,
        "gamma_mean": gamma,
        "A": A,
        "z_plus": z_plus,
        "z_minus": z_minus,
    }


# ── 8. Peukert battery capacity & Coulomb-counting state of charge ─────────────
def battery_capacity_soc(rated_capacity_Ah: float, peukert_k: float,
                         discharge_current_A: float,
                         *, rated_current_A: float = 1.0,
                         charge_passed_Ah: float = 0.0,
                         nominal_voltage_V: float = 3.7) -> dict:
    """Effective battery capacity under load (Peukert's law) plus a Coulomb-
    counting state of charge (SoC):
        Peukert (referenced to a rated discharge current I_rated):
            C_eff = C_rated * (I_rated / I)^(k - 1)
        runtime  t = C_eff / I  (hours)
        SoC = 1 - charge_passed / C_eff      (Coulomb counting / book-keeping)
        usable energy  E = C_eff * V_nominal  (Wh)
    KNOWN: with k = 1 (ideal battery, no capacity fade) C_eff = C_rated for ANY
    current; energy of a 100 Ah, 12 V battery is 1200 Wh.

    Ref: Peukert's law (Wikipedia); Coulomb counting SoC (battery management).
    """
    if discharge_current_A <= 0.0:
        raise ValueError("discharge current must be positive")
    C_eff = rated_capacity_Ah * (rated_current_A / discharge_current_A) ** (peukert_k - 1.0)
    runtime_h = C_eff / discharge_current_A
    soc = 1.0 - charge_passed_Ah / C_eff
    energy_Wh = C_eff * nominal_voltage_V
    return {
        "effective_capacity_Ah": C_eff,
        "runtime_h": runtime_h,
        "state_of_charge": soc,
        "state_of_charge_pct": soc * 100.0,
        "energy_Wh": energy_Wh,
        "rated_capacity_Ah": rated_capacity_Ah,
        "peukert_k": peukert_k,
        "discharge_current_A": discharge_current_A,
    }
