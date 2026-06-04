"""Each combustion method must reproduce its KNOWN published / analytic value.

Citations are inline in methods_combustion.py. Tolerances are explicit.
"""
from underworld.server.services.methods_combustion import (
    adiabatic_flame_temperature,
    equivalence_ratio,
    flammability_le_chatelier,
    flue_gas_composition,
    laminar_flame_speed,
    lower_heating_value,
    stoichiometric_afr,
    wobbe_index,
)


# 1. Stoichiometric AFR — KNOWN: methane CH4 (x=1,y=4) -> a=2, AFR_mass ~= 17.2.
def test_methane_stoichiometric_afr():
    r = stoichiometric_afr(1, 4)
    assert abs(r["o2_per_fuel_mol"] - 2.0) < 1e-9
    assert abs(r["afr_mass"] - 17.2) < 0.1          # textbook 17.2
    assert abs(r["air_per_fuel_mol"] - 9.52) < 0.05


# 2. Equivalence ratio — KNOWN: AFR_actual = 2*AFR_stoich -> phi=0.5, 100% excess.
def test_equivalence_ratio_lean():
    r = equivalence_ratio(34.38, 17.19)
    assert abs(r["phi"] - 0.5) < 1e-3
    assert abs(r["excess_air_percent"] - 100.0) < 0.5
    assert r["regime"] == "lean"


# 3. Adiabatic flame temperature — KNOWN: stoichiometric methane-air ~ 2200-2400 K.
def test_adiabatic_flame_temperature_methane():
    r = adiabatic_flame_temperature(
        802300, {"CO2": 1, "H2O": 2, "N2": 7.52},
        {"CO2": 56.21, "H2O": 43.87, "N2": 33.6})
    assert 2000.0 < r["t_ad_k"] < 2500.0            # methane AFT ~2300 K


# 4. Lower heating value — KNOWN: methane dH_comb ~= -802.3 kJ/mol; LHV ~= 50 MJ/kg.
def test_methane_lhv():
    r = lower_heating_value(1, 4)
    assert abs(r["lhv_kj_per_mol"] - 802.3) < 1.0
    assert abs(r["lhv_mj_per_kg"] - 50.0) < 0.5


# 5. Flue-gas composition — KNOWN: stoichiometric methane -> 1 CO2 + 2 H2O + 7.52 N2.
def test_flue_gas_stoichiometric_methane():
    r = flue_gas_composition(1, 4)
    assert abs(r["moles"]["CO2"] - 1.0) < 1e-9
    assert abs(r["moles"]["H2O"] - 2.0) < 1e-9
    assert abs(r["moles"]["N2"] - 7.52) < 0.01
    assert abs(r["moles"]["O2"]) < 1e-9             # no excess O2 at stoichiometry


# 6. Laminar flame speed — KNOWN: stoichiometric methane-air at 298 K, 1 atm ~ 0.37-0.40 m/s.
def test_laminar_flame_speed_methane():
    r = laminar_flame_speed(1.0)
    assert 0.35 <= r["s_l_m_per_s"] <= 0.42


# 7. Wobbe index — KNOWN: methane (HHV ~= 39.8 MJ/m^3, SG ~= 0.554) -> Wobbe ~= 53.5.
def test_wobbe_index_methane():
    r = wobbe_index(39.8, 16.043)
    assert abs(r["wobbe_index_mj_per_m3"] - 53.5) < 1.0
    assert abs(r["specific_gravity"] - 0.554) < 0.005


# 8. Le Chatelier flammability — KNOWN: pure methane LFL ~= 5.0, UFL ~= 15.0 vol %.
def test_flammability_le_chatelier_methane():
    r = flammability_le_chatelier([1.0], [5.0], [15.0])
    assert abs(r["lfl_mix_vol_percent"] - 5.0) < 1e-6
    assert abs(r["ufl_mix_vol_percent"] - 15.0) < 1e-6
    assert abs(r["flammable_range_vol_percent"] - 10.0) < 1e-6
