"""Each atmospheric-chemistry / climate-forcing method must reproduce its KNOWN
published value. Citations are inline; tolerances are explicit.
"""
import math

from underworld.server.services.methods_atmoschem import (
    aerosol_optical_depth,
    atmospheric_residence_time,
    chapman_ozone_profile,
    chapman_ozone_steady_state,
    co2_radiative_forcing,
    global_warming_potential,
    henry_law_solubility,
    lifetime_decay,
    lifting_condensation_level,
    nox_o3_photostationary,
)


# 1. Chapman ozone-oxygen cycle — KNOWN: the ozone layer peaks in the lower-mid
#    stratosphere (~20-30 km), not at the surface or top of atmosphere.
#    Ref: Chapman (1930); Jacob, Intro to Atmospheric Chemistry ch.10.
def test_chapman_ozone_peaks_in_stratosphere():
    prof = chapman_ozone_profile(z_min_km=10.0, z_max_km=50.0, n_levels=81)
    assert 20.0 <= prof["peak_altitude_km"] <= 30.0     # ozone layer altitude
    # the peak is an interior maximum: density is lower at both ends
    densities = prof["o3_density_cm3"]
    assert densities[0] < prof["peak_density_cm3"]
    assert densities[-1] < prof["peak_density_cm3"]
    # steady-state O3 at 25 km is a positive number density of order 1e12/cm^3
    r = chapman_ozone_steady_state(altitude_km=25.0)
    assert r["o3_density_cm3"] > 0
    assert 1e11 < r["o3_density_cm3"] < 1e14


# 2. CO2 radiative forcing — KNOWN: doubling CO2 -> dF = 5.35*ln(2) ~= 3.7 W/m^2.
#    Ref: Myhre et al. (1998); IPCC TAR. alpha = 5.35.
def test_co2_forcing_doubling_is_3_7():
    r = co2_radiative_forcing(800.0, c0_ppm=400.0)
    assert abs(r["radiative_forcing_w_m2"] - 3.71) < 0.05    # ~3.7 W/m^2
    assert abs(r["doubling_forcing_w_m2"] - 3.71) < 0.05
    # no change -> zero forcing
    assert abs(co2_radiative_forcing(400.0, c0_ppm=400.0)["radiative_forcing_w_m2"]) < 1e-9


# 3. Global warming potential / lifetime decay — KNOWN: CH4 (tau~12.4 yr) has
#    GWP100 ~= 28 (IPCC AR5); one e-folding leaves 1/e ~= 0.368 of a pulse.
#    Ref: IPCC AR5 WG1 Table 8.A.1; first-order loss kinetics.
def test_methane_gwp100_about_28():
    r = global_warming_potential(lifetime_years=12.4, time_horizon_years=100.0)
    assert abs(r["gwp"] - 28.0) < 2.0                       # ~28
    # pulse decay: after one e-fold (t=tau) fraction remaining = 1/e
    d = lifetime_decay(lifetime_years=12.4, t_years=12.4)
    assert abs(d["fraction_remaining"] - 1.0 / math.e) < 1e-6
    # half-life = tau*ln2
    assert abs(d["half_life_years"] - 12.4 * math.log(2.0)) < 1e-6


# 4. NOx-O3 photostationary (Leighton) state — KNOWN: the Leighton ratio
#    phi = j*[NO2]/(k*[NO]*[O3]) == 1 for a NOx-O3-only system, and the
#    self-consistent O3 is tens of ppb at urban midday values.
#    Ref: Leighton (1961); Seinfeld & Pandis; k(NO+O3,298K)=1.8e-14 cm^3/molec/s.
def test_nox_o3_leighton_ratio_unity():
    r = nox_o3_photostationary(no2_ppb=10.0, no_ppb=10.0, j_no2=1.0e-2)
    assert abs(r["leighton_ratio"] - 1.0) < 1e-6           # photostationary
    # with NO2=NO, [O3] = j_no2/k_no_o3 in number density -> tens of ppb
    assert 5.0 < r["o3_ppb"] < 100.0
    # raising NO (titration) lowers steady-state O3
    r2 = nox_o3_photostationary(no2_ppb=10.0, no_ppb=40.0, j_no2=1.0e-2)
    assert r2["o3_ppb"] < r["o3_ppb"]


# 5. Aerosol optical depth / Beer-Lambert — KNOWN: at AOD=1 overhead,
#    transmittance = 1/e ~= 0.368; Koschmieder: sigma=3.912 km^-1 -> 1 km vis.
#    Ref: Beer-Lambert law; Koschmieder (1924) V = 3.912/sigma.
def test_aerosol_beer_lambert_and_koschmieder():
    r = aerosol_optical_depth(optical_depth=1.0, solar_zenith_deg=0.0)
    assert abs(r["transmittance"] - 1.0 / math.e) < 1e-9   # 0.368 at tau=1
    # zero optical depth -> full transmission
    assert abs(aerosol_optical_depth(optical_depth=0.0)["transmittance"] - 1.0) < 1e-9
    # Koschmieder visibility
    k = aerosol_optical_depth(extinction_coeff_per_km=3.912)
    assert abs(k["koschmieder_visibility_km"] - 1.0) < 1e-6


# 6. Henry's law solubility — KNOWN: CO2 in water at 25C, k_H~0.034 mol/L/atm,
#    so at P=1 atm dissolved CO2 ~= 0.034 mol/L (linear in partial pressure).
#    Ref: Henry's law; k_H(CO2,25C)=3.4e-2 M/atm (Sander 2015).
def test_henry_co2_solubility():
    r = henry_law_solubility(partial_pressure_atm=1.0, k_h_mol_l_atm=0.034)
    assert abs(r["concentration_mol_l"] - 0.034) < 1e-9    # ~0.034 M at 1 atm
    # linear: doubling partial pressure doubles dissolved concentration
    r2 = henry_law_solubility(partial_pressure_atm=2.0, k_h_mol_l_atm=0.034)
    assert abs(r2["concentration_mol_l"] - 2.0 * r["concentration_mol_l"]) < 1e-12
    # atmospheric CO2 (~4e-4 atm) -> ~1.4e-5 mol/L
    atm = henry_law_solubility(partial_pressure_atm=4.0e-4)
    assert abs(atm["concentration_mol_l"] - 1.36e-5) < 1e-6


# 7. Lifting condensation level (Espy) — KNOWN: cloud base ~125 m per K of
#    temperature-dewpoint spread; a 10 C spread -> ~1250 m AGL.
#    Ref: Espy's equation; Lawrence (2005), BAMS, 125 m/K.
def test_lcl_espy_125m_per_k():
    r = lifting_condensation_level(temperature_c=30.0, dewpoint_c=20.0)
    assert abs(r["lcl_height_agl_m"] - 1250.0) < 1.0       # 125*10
    # saturated air (no spread) -> cloud base at the surface
    assert abs(lifting_condensation_level(temperature_c=15.0,
                                          dewpoint_c=15.0)["lcl_height_agl_m"]) < 1e-9
    # coefficient is 125 m/K
    assert abs(r["espy_coefficient_m_per_k"] - 125.0) < 1e-9


# 8. Atmospheric residence time = burden/flux — KNOWN: water vapour burden
#    ~1.3e16 kg and precipitation flux ~5.05e17 kg/yr -> tau ~= 9-10 days.
#    Ref: Trenberth et al.; Nature Rev. Earth Environ. (2021): ~9 days.
def test_water_vapour_residence_time_about_9_days():
    r = atmospheric_residence_time(burden=1.3e16, flux=5.05e17)
    assert abs(r["residence_time_days"] - 9.0) < 1.5       # ~9-10 days
    # tau scales linearly with burden, inversely with flux
    r2 = atmospheric_residence_time(burden=2.6e16, flux=5.05e17)
    assert abs(r2["residence_time_days"] - 2.0 * r["residence_time_days"]) < 1e-6
