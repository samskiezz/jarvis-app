"""Real combustion & flame simulations.

Each function is a distinct, named combustion method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: stoichiometry
(theoretical air, air-fuel ratio), mixture strength (equivalence ratio, excess
air), thermochemistry (adiabatic flame temperature, lower heating value from
enthalpy of formation), product/flue-gas composition, flame propagation
(laminar flame speed correlation), gas interchangeability (Wobbe index), and
mixture flammability (Le Chatelier's rule).

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_combustion.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Reference constants ───────────────────────────────────────────────────────
# Air composition by volume (mole): O2 + 3.76 N2 per mole of O2 (21% O2 / 79% N2).
MOLES_N2_PER_O2 = 3.76                 # standard combustion air model
MOLES_AIR_PER_O2 = 1.0 + MOLES_N2_PER_O2  # = 4.76 mol air per mol O2

# Molar masses, g/mol (kg/kmol)
M_C = 12.011
M_H = 1.008
M_O = 15.999
M_N = 14.007
M_O2 = 2.0 * M_O                       # 31.998
M_N2 = 2.0 * M_N                       # 28.014
M_AIR = 28.97                          # dry air, g/mol (NIST/ISO)
M_CO2 = M_C + 2.0 * M_O               # 44.009
M_H2O = 2.0 * M_H + M_O               # 18.015

# Standard enthalpies of formation at 298.15 K, kJ/mol (NIST-JANAF).
HF_CO2 = -393.51
HF_H2O_GAS = -241.83                   # gaseous water (LHV basis)
HF_H2O_LIQ = -285.83                   # liquid water (HHV basis)
HF_CH4 = -74.87
HF_O2 = 0.0
HF_N2 = 0.0

R_UNIVERSAL = 8.314462618              # J/(mol*K)


# ── 1. Stoichiometric air-fuel ratio for a hydrocarbon CxHy ───────────────────
def stoichiometric_afr(x: float, y: float,
                       *, m_air: float = M_AIR) -> dict:
    """Stoichiometric (theoretical) air requirement and air-fuel ratio for the
    complete combustion of a hydrocarbon C_xH_y:
        C_xH_y + a(O2 + 3.76 N2) -> x CO2 + (y/2) H2O + 3.76 a N2,
        a = x + y/4   (moles O2 per mole fuel).
    Molar AFR = a*4.76; mass AFR = (a*4.76*M_air)/M_fuel.
    KNOWN: methane CH4 (x=1, y=4) -> a=2, AFR_mass ~= 17.2 (air/fuel by mass).

    Ref: stoichiometric combustion, CH4 + 2(O2+3.76 N2) -> CO2 + 2 H2O + 7.52 N2
    (Engineering ToolBox, "Stoichiometric Combustion").
    """
    a = x + y / 4.0                        # moles O2 per mole fuel
    moles_air = a * MOLES_AIR_PER_O2       # moles air per mole fuel
    m_fuel = x * M_C + y * M_H             # g/mol fuel
    afr_mass = moles_air * m_air / m_fuel
    return {
        "o2_per_fuel_mol": a,
        "air_per_fuel_mol": moles_air,
        "n2_per_fuel_mol": MOLES_N2_PER_O2 * a,
        "afr_molar": moles_air,
        "afr_mass": afr_mass,
        "fuel_molar_mass_g_mol": m_fuel,
        "ofr_mass": a * M_O2 / m_fuel,     # oxygen-fuel mass ratio
    }


# ── 2. Equivalence ratio phi and excess air ───────────────────────────────────
def equivalence_ratio(afr_actual: float, afr_stoich: float) -> dict:
    """Mixture-strength descriptors from the actual and stoichiometric AFR:
        phi = AFR_stoich / AFR_actual        (equivalence ratio)
        lambda = 1/phi = AFR_actual/AFR_stoich  (air ratio / relative air-fuel)
        excess air = (lambda - 1) * 100 %.
    phi>1 rich, phi<1 lean, phi=1 stoichiometric.
    KNOWN: AFR_actual = 2*AFR_stoich -> phi=0.5 (lean), 100% excess air.

    Ref: equivalence ratio & excess air (Turns, "An Introduction to Combustion").
    """
    phi = afr_stoich / afr_actual
    lam = afr_actual / afr_stoich          # air-excess ratio lambda
    excess_air_frac = lam - 1.0
    if phi > 1.0:
        regime = "rich"
    elif phi < 1.0:
        regime = "lean"
    else:
        regime = "stoichiometric"
    return {
        "phi": phi,
        "lambda": lam,
        "excess_air_fraction": excess_air_frac,
        "excess_air_percent": excess_air_frac * 100.0,
        "regime": regime,
    }


# ── 3. Adiabatic flame temperature (constant-cp energy balance) ───────────────
def adiabatic_flame_temperature(lhv_j_per_mol_fuel: float,
                                product_moles: dict,
                                cp_j_per_mol_k: dict,
                                *, t_reactant_k: float = 298.15) -> dict:
    """Constant-pressure adiabatic flame temperature by an energy balance with
    constant (mean) molar heat capacities. With no heat loss the chemical
    energy released (LHV) heats the products from T_reactant to T_ad:
        LHV = sum_i n_i * cp_i * (T_ad - T_reactant)
        T_ad = T_reactant + LHV / sum_i (n_i * cp_i).
    KNOWN: stoichiometric methane-air (1 CO2 + 2 H2O + 7.52 N2, mean cp ~ products
    over 298->2300 K) gives T_ad ~= 2200-2330 K.

    Ref: adiabatic flame temperature energy balance (Turns, ch.2;
    Wikipedia "Adiabatic flame temperature").
    """
    heat_capacity_total = sum(product_moles[s] * cp_j_per_mol_k[s]
                              for s in product_moles)  # J/K
    delta_t = lhv_j_per_mol_fuel / heat_capacity_total
    t_ad = t_reactant_k + delta_t
    return {
        "t_ad_k": t_ad,
        "t_ad_c": t_ad - 273.15,
        "delta_t_k": delta_t,
        "product_heat_capacity_j_per_k": heat_capacity_total,
        "t_reactant_k": t_reactant_k,
    }


# ── 4. Lower heating value from enthalpy of combustion ────────────────────────
def lower_heating_value(x: float, y: float,
                        *, hf_fuel: float = HF_CH4,
                        hf_co2: float = HF_CO2,
                        hf_h2o_gas: float = HF_H2O_GAS) -> dict:
    """Lower heating value (LHV) from standard enthalpies of formation via
    Hess's law, with product water as VAPOUR (lower heating value basis):
        C_xH_y + (x+y/4) O2 -> x CO2 + (y/2) H2O(g)
        dH_comb = [x*Hf(CO2) + (y/2)*Hf(H2O,g)] - Hf(fuel)
        LHV = -dH_comb  (released energy, positive).
    HHV uses liquid water (Hf=-285.83) and adds the latent heat of the water.
    KNOWN: methane CH4 -> dH_comb ~= -802.3 kJ/mol; LHV ~= 50.0 MJ/kg.

    Ref: heat of combustion / Hess's law; Hf(CO2)=-393.5, Hf(H2O,g)=-241.8,
    Hf(CH4)=-74.87 kJ/mol (NIST-JANAF; Wikipedia "Heat of combustion").
    """
    n_co2 = x
    n_h2o = y / 2.0
    dh_comb_kj_mol = (n_co2 * hf_co2 + n_h2o * hf_h2o_gas) - hf_fuel
    lhv_kj_mol = -dh_comb_kj_mol           # positive released energy
    m_fuel = x * M_C + y * M_H             # g/mol
    lhv_mj_per_kg = lhv_kj_mol / m_fuel    # kJ/mol / (g/mol) = kJ/g = MJ/kg
    return {
        "dh_comb_kj_per_mol": dh_comb_kj_mol,
        "lhv_kj_per_mol": lhv_kj_mol,
        "lhv_j_per_mol": lhv_kj_mol * 1000.0,
        "lhv_mj_per_kg": lhv_mj_per_kg,
        "fuel_molar_mass_g_mol": m_fuel,
    }


# ── 5. Flue-gas (combustion-product) composition ──────────────────────────────
def flue_gas_composition(x: float, y: float,
                         *, excess_air_fraction: float = 0.0) -> dict:
    """Wet flue-gas product composition for complete combustion of C_xH_y with
    (1+e) times the stoichiometric air:
        products = x CO2 + (y/2) H2O + (e*a) O2 + 3.76*(1+e)*a N2,
        a = x + y/4 = stoich O2.  Mole fractions sum to 1.
    KNOWN: stoichiometric methane (e=0) -> 1 CO2 + 2 H2O + 7.52 N2; CO2 mole
    fraction (wet) ~= 0.095, (dry) ~= 0.117.

    Ref: complete combustion product balance (Turns, ch.2).
    """
    a = x + y / 4.0
    n_co2 = x
    n_h2o = y / 2.0
    n_o2 = excess_air_fraction * a
    n_n2 = MOLES_N2_PER_O2 * (1.0 + excess_air_fraction) * a
    n_wet = n_co2 + n_h2o + n_o2 + n_n2
    n_dry = n_co2 + n_o2 + n_n2
    return {
        "moles": {"CO2": n_co2, "H2O": n_h2o, "O2": n_o2, "N2": n_n2},
        "total_moles_wet": n_wet,
        "total_moles_dry": n_dry,
        "x_co2_wet": n_co2 / n_wet,
        "x_h2o_wet": n_h2o / n_wet,
        "x_co2_dry": n_co2 / n_dry,
        "x_o2_dry": n_o2 / n_dry,
        "x_n2_dry": n_n2 / n_dry,
    }


# ── 6. Laminar flame speed correlation (power-law, Metghalchi-Keck form) ───────
def laminar_flame_speed(phi: float,
                        *, t_u_k: float = 298.0, p_atm: float = 1.0,
                        s_l_ref: float = 0.380, phi_m: float = 1.06,
                        eta: float = 2.27,
                        alpha: float = 1.612, beta: float = -0.374) -> dict:
    """Laminar burning velocity from the empirical power-law correlation
    (Metghalchi & Keck form, as fitted for methane-air):
        S_L0(phi) = s_ref * (1 - eta*(phi - phi_m)^2)      [reference value, m/s]
        S_L(phi,T,p) = S_L0 * (T_u/T0)^alpha * (p/p0)^beta
    with reference T0=298 K, p0=1 atm. The parabola peaks slightly rich
    (phi_m ~= 1.06) and S_L increases with unburned-gas temperature.
    KNOWN: stoichiometric methane-air at 298 K, 1 atm -> S_L ~= 0.37-0.40 m/s.

    Ref: Metghalchi & Keck (1980/82) power-law S_L; methane peak ~0.38 m/s near
    phi~1.06 (Andrews & Bradley; Gottgens et al.).
    """
    s_l0 = s_l_ref * (1.0 - eta * (phi - phi_m) ** 2)
    s_l0 = max(0.0, s_l0)
    s_l = s_l0 * (t_u_k / 298.0) ** alpha * (p_atm / 1.0) ** beta
    return {
        "s_l_m_per_s": s_l,
        "s_l_cm_per_s": s_l * 100.0,
        "s_l_ref_m_per_s": s_l0,
        "phi": phi,
        "t_u_k": t_u_k,
        "p_atm": p_atm,
    }


# ── 7. Wobbe index (gas interchangeability) ───────────────────────────────────
def wobbe_index(heating_value_mj_per_m3: float, fuel_molar_mass_g_mol: float,
                *, m_air: float = M_AIR) -> dict:
    """Wobbe index, the gas-interchangeability number used to compare burner
    energy throughput at fixed supply pressure:
        I_W = HV / sqrt(SG),   SG = M_fuel / M_air  (relative density to air).
    Two gases with the same Wobbe index deliver the same heat through a given
    orifice, since flow ~ 1/sqrt(density) and energy ~ HV*flow.
    KNOWN: methane (HHV ~= 39.8 MJ/m^3, SG ~= 0.554) -> Wobbe ~= 53.5 MJ/m^3.

    Ref: Wobbe index, I_W = HV/sqrt(d_rel) (Wikipedia "Wobbe index"; ISO 6976).
    """
    sg = fuel_molar_mass_g_mol / m_air     # specific gravity relative to air
    iw = heating_value_mj_per_m3 / math.sqrt(sg)
    return {
        "wobbe_index_mj_per_m3": iw,
        "specific_gravity": sg,
        "heating_value_mj_per_m3": heating_value_mj_per_m3,
    }


# ── 8. Flammability limits of a mixture (Le Chatelier's rule) ─────────────────
def flammability_le_chatelier(mole_fractions: list, lfl_list: list,
                              ufl_list: list) -> dict:
    """Lower/upper flammability limits of a multi-component fuel mixture from the
    pure-component limits via Le Chatelier's mixing rule (limits in vol %):
        LFL_mix = 100 / sum_i (y_i / LFL_i),
        UFL_mix = 100 / sum_i (y_i / UFL_i),
    where y_i is the fuel-only mole fraction in PERCENT (sum y_i = 100, on a
    combustible basis). For a single component it returns that component's own
    limits.
    KNOWN: pure methane -> LFL ~= 5.0 vol %, UFL ~= 15.0 vol %; an equimolar
    methane(5/15)/propane(2.1/9.5) mix gives LFL ~= 2.96 vol %.

    Ref: Le Chatelier's rule, LFL_mix = 100 / sum(y_i/LFL_i)
    (Wikipedia "Flammability limit"; Le Chatelier 1891).
    """
    y = np.asarray(mole_fractions, dtype=float)
    lfl = np.asarray(lfl_list, dtype=float)
    ufl = np.asarray(ufl_list, dtype=float)
    y = 100.0 * y / y.sum()                 # normalize to percent on fuel basis
    lfl_mix = 100.0 / np.sum(y / lfl)
    ufl_mix = 100.0 / np.sum(y / ufl)
    return {
        "lfl_mix_vol_percent": float(lfl_mix),
        "ufl_mix_vol_percent": float(ufl_mix),
        "flammable_range_vol_percent": float(ufl_mix - lfl_mix),
        "normalized_fractions": y.tolist(),
    }
