"""Real atmospheric-chemistry & climate-forcing simulations.

Each function is a distinct, named scientific method (not a shared engine reused),
implemented with numpy/scipy and verified against a KNOWN published value in the
companion tests. Domains: stratospheric ozone photochemistry, radiative forcing of
greenhouse gases, global-warming potential / atmospheric lifetimes, tropospheric
NOx-O3 smog photostationary state, aerosol optics, gas-liquid equilibrium, moist
thermodynamics, and biogeochemical residence times.

References are inline on each function.
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants ────────────────────────────────────────────────────────
LN2 = math.log(2.0)
AVOGADRO = 6.02214076e23          # 1/mol
R_GAS = 8.314462618              # J/(mol.K)
DOBSON_UNIT_MOLEC_CM2 = 2.687e16  # molecules/cm^2 per Dobson Unit
ESPY_M_PER_K = 125.0             # Espy LCL coefficient, m per K of dewpoint spread


# ── 1. Chapman ozone-oxygen cycle steady state ────────────────────────────────
def chapman_ozone_steady_state(*, altitude_km: float = 25.0,
                               j_o2: float = 1.0e-11,
                               j_o3: float = 1.0e-3,
                               k2: float = 6.0e-34,
                               k3: float = 8.0e-15,
                               m_density_cm3: float | None = None,
                               o2_fraction: float = 0.21) -> dict:
    """Chapman (1930) pure-oxygen photochemical cycle for stratospheric ozone.

    Reactions:
      (1) O2 + hv -> 2 O          rate j_o2          (production of O)
      (2) O + O2 + M -> O3 + M    rate k2            (ozone formation)
      (3) O3 + hv -> O2 + O       rate j_o3          (ozone photolysis)
      (4) O + O3 -> 2 O2          rate k3            (ozone destruction)

    At steady state the odd-oxygen family gives the classic Chapman result:
        [O3] = [O2] * sqrt( j_o2 * k2 * [M] / (j_o3 * k3) )
    The number density M and O2 follow the barometric profile. KNOWN: the
    resulting ozone number density peaks in the lower-mid stratosphere
    (~20-30 km), reproducing the observed "ozone layer" altitude trend, and the
    integrated column is of order a few hundred Dobson Units.

    Ref: Chapman (1930); Seinfeld & Pandis, Atmospheric Chemistry & Physics;
    Jacob, Intro to Atmospheric Chemistry, ch.10. Peak ozone ~25 km.
    """
    # Air number density via barometric profile (scale height ~7 km, n0~2.5e19 /cm^3)
    n0 = 2.5e19            # sea-level air number density, molecules/cm^3
    scale_height_km = 7.0
    if m_density_cm3 is None:
        m_density_cm3 = n0 * math.exp(-altitude_km / scale_height_km)
    o2_density = o2_fraction * m_density_cm3

    # Steady-state odd-oxygen: production of O3 balances loss.
    # [O3] = [O2]*sqrt(j_o2*k2*[M]/(j_o3*k3))
    o3_density = o2_density * math.sqrt(j_o2 * k2 * m_density_cm3 / (j_o3 * k3))
    # atomic-O steady state: [O] = j_o3*[O3] / (k2*[O2]*[M])
    o_density = j_o3 * o3_density / (k2 * o2_density * m_density_cm3)
    return {
        "altitude_km": altitude_km,
        "m_density_cm3": m_density_cm3,
        "o2_density_cm3": o2_density,
        "o3_density_cm3": o3_density,
        "o_atom_density_cm3": o_density,
        "o3_mixing_ratio": o3_density / m_density_cm3,
    }


def chapman_ozone_profile(*, z_min_km: float = 10.0, z_max_km: float = 50.0,
                          n_levels: int = 41) -> dict:
    """Compute the Chapman ozone number-density profile over altitude and locate
    the peak. KNOWN: the ozone layer peaks in the lower-mid stratosphere
    (~20-30 km), not at the surface or top of atmosphere.

    The altitude trend: density rises from the troposphere, peaks where the
    product of (UV available to photolyse O2) and (air density for the
    3-body O+O2+M reaction) is maximal, then falls aloft.
    """
    altitudes = np.linspace(z_min_km, z_max_km, n_levels)
    # The classic Chapman layer: UV that photolyses O2 is itself absorbed by O2
    # on the way down, so the photolysis rate is
    #     j_o2(z) = j_inf * exp( -tau(z) ),   tau(z) = tau0 * exp(-z/H)
    # i.e. abundant UV aloft but little O2, abundant O2 below but UV is
    # extinguished. The product peaks at an interior (stratospheric) altitude.
    H = 7.0           # scale height, km
    tau0 = 80.0       # O2 UV optical depth referenced to the surface
    j_inf = 5.0e-11   # unattenuated O2 photolysis rate aloft, s^-1
    densities = np.empty_like(altitudes)
    for i, z in enumerate(altitudes):
        tau = tau0 * math.exp(-z / H)
        j_o2 = j_inf * math.exp(-tau)
        r = chapman_ozone_steady_state(altitude_km=float(z), j_o2=j_o2)
        densities[i] = r["o3_density_cm3"]
    peak_idx = int(np.argmax(densities))
    return {
        "altitudes_km": altitudes.tolist(),
        "o3_density_cm3": densities.tolist(),
        "peak_altitude_km": float(altitudes[peak_idx]),
        "peak_density_cm3": float(densities[peak_idx]),
    }


# ── 2. Radiative forcing of CO2 ───────────────────────────────────────────────
def co2_radiative_forcing(concentration_ppm: float = 800.0, *,
                          c0_ppm: float = 400.0, alpha: float = 5.35) -> dict:
    """Simplified IPCC/Myhre CO2 radiative forcing:
        dF = alpha * ln(C / C0),  alpha = 5.35 W/m^2.
    KNOWN: doubling CO2 (C/C0 = 2) -> dF = 5.35*ln(2) ~= 3.71 W/m^2.

    Ref: Myhre et al. (1998), GRL; IPCC TAR Table 6.2. alpha = 5.35.
    """
    forcing = alpha * math.log(concentration_ppm / c0_ppm)
    doubling_forcing = alpha * LN2
    return {
        "concentration_ppm": concentration_ppm,
        "c0_ppm": c0_ppm,
        "alpha": alpha,
        "radiative_forcing_w_m2": forcing,
        "ratio": concentration_ppm / c0_ppm,
        "doubling_forcing_w_m2": doubling_forcing,
    }


# ── 3. Global warming potential / atmospheric lifetime decay ───────────────────
def global_warming_potential(*, radiative_efficiency: float = 2.11e-13,
                             lifetime_years: float = 12.4,
                             time_horizon_years: float = 100.0,
                             agwp_co2: float = 9.17e-14) -> dict:
    """Absolute and relative Global Warming Potential from the pulse-decay model.

    A pulse of gas decays as C(t) = C0 * exp(-t/tau). The Absolute GWP is the
    time-integrated radiative forcing over the horizon H:
        AGWP_gas = a * tau * (1 - exp(-H/tau))
    where a is the effective radiative efficiency per kg (including the
    well-mixed indirect effects of CH4 on tropospheric O3 and stratospheric
    H2O). GWP = AGWP_gas / AGWP_CO2.

    KNOWN: methane (tau~12.4 yr) has GWP100 ~= 28 (IPCC AR5, Myhre et al. 2013).
    With the IPCC AGWP_CO2(100) = 9.17e-14 W m^-2 yr (kg CO2)^-1 and the
    effective CH4 efficiency 2.11e-13 W m^-2 (kg CH4)^-1 the integral gives
    GWP100 ~= 28.

    Ref: IPCC AR5 WG1 ch.8, Table 8.A.1; CH4 GWP100 = 28;
    AGWP_CO2(100 yr) = 9.17e-14 W m^-2 yr (kg CO2)^-1.
    Lifetime integral: integral_0^H exp(-t/tau) dt = tau*(1-exp(-H/tau)).
    """
    agwp_gas = radiative_efficiency * lifetime_years * (
        1.0 - math.exp(-time_horizon_years / lifetime_years))
    gwp = agwp_gas / agwp_co2
    # fraction of pulse remaining at the horizon
    fraction_remaining = math.exp(-time_horizon_years / lifetime_years)
    return {
        "lifetime_years": lifetime_years,
        "time_horizon_years": time_horizon_years,
        "agwp_gas": agwp_gas,
        "agwp_co2": agwp_co2,
        "gwp": gwp,
        "fraction_remaining_at_horizon": fraction_remaining,
        "e_folding_time_years": lifetime_years,
    }


def lifetime_decay(*, lifetime_years: float = 12.4, t_years: float = 12.4,
                   initial: float = 1.0) -> dict:
    """First-order atmospheric removal: C(t) = C0 * exp(-t/tau).
    KNOWN: after one e-folding (t = tau) the burden falls to 1/e ~= 0.368 of C0.

    Ref: first-order loss kinetics; methane tropospheric lifetime ~12 yr.
    """
    remaining = initial * math.exp(-t_years / lifetime_years)
    half_life = lifetime_years * LN2
    return {
        "lifetime_years": lifetime_years,
        "t_years": t_years,
        "remaining": remaining,
        "fraction_remaining": remaining / initial,
        "half_life_years": half_life,
    }


# ── 4. Photochemical NOx-O3 smog photostationary state (Leighton) ─────────────
def nox_o3_photostationary(*, no2_ppb: float = 10.0, no_ppb: float = 10.0,
                           j_no2: float = 1.0e-2,
                           k_no_o3: float = 1.8e-14,
                           m_density_cm3: float = 2.5e19) -> dict:
    """Tropospheric NO-NO2-O3 photostationary (Leighton) state.

    Cycle:
      NO2 + hv -> NO + O          rate j_no2  (s^-1)
      O + O2 + M -> O3            (fast)
      NO + O3 -> NO2 + O2         rate constant k_no_o3 (cm^3 molecule^-1 s^-1)

    At steady state (Leighton relationship):
        [O3] = j_no2 * [NO2] / (k_no_o3 * [NO])
    KNOWN: the Leighton ratio phi = j_no2*[NO2]/(k*[NO]*[O3]) ~= 1 for a
    NOx-O3-only system, and with j_no2~1e-2 s^-1, k~1.8e-14 cm^3/molec/s and
    equal NO=NO2 the predicted O3 is tens of ppb (urban-relevant).

    Ref: Leighton (1961); Seinfeld & Pandis ACP; k(NO+O3, 298K)=1.8e-14
    cm^3 molecule^-1 s^-1; j_NO2 ~ 0.5-1.0 x 10^-2 s^-1 at midday.
    """
    # convert ppb mixing ratio to number density (molecules/cm^3)
    def ppb_to_density(ppb: float) -> float:
        return ppb * 1e-9 * m_density_cm3

    no2_n = ppb_to_density(no2_ppb)
    no_n = ppb_to_density(no_ppb)
    # [O3] number density from Leighton: j_no2*[NO2] = k*[NO]*[O3]
    o3_n = j_no2 * no2_n / (k_no_o3 * no_n)
    o3_ppb = o3_n / m_density_cm3 / 1e-9
    # Leighton ratio with this self-consistent O3 == 1
    phi = (j_no2 * no2_n) / (k_no_o3 * no_n * o3_n)
    return {
        "no2_ppb": no2_ppb,
        "no_ppb": no_ppb,
        "j_no2_s": j_no2,
        "k_no_o3_cm3": k_no_o3,
        "o3_density_cm3": o3_n,
        "o3_ppb": o3_ppb,
        "leighton_ratio": phi,
    }


# ── 5. Aerosol optical depth / Beer-Lambert extinction ────────────────────────
def aerosol_optical_depth(*, optical_depth: float = 1.0,
                          solar_zenith_deg: float = 0.0,
                          extinction_coeff_per_km: float | None = None,
                          path_km: float | None = None) -> dict:
    """Beer-Bouguer-Lambert attenuation through an aerosol layer:
        T = exp(-tau / cos(theta))     (slant path via air mass 1/cos theta)
    where tau is the (vertical) aerosol optical depth. Optionally compute tau
    from a column-extinction coefficient over a path, and the Koschmieder
    visibility V = 3.912 / sigma_ext.

    KNOWN: at AOD = 1 and overhead sun (theta=0), transmittance = 1/e ~= 0.368.
    Koschmieder: an extinction of 3.912 km^-1 gives 1 km visual range.

    Ref: Beer-Lambert law; Koschmieder (1924) V = 3.912/sigma_ext (2% contrast).
    """
    if extinction_coeff_per_km is not None and path_km is not None:
        optical_depth = extinction_coeff_per_km * path_km
    air_mass = 1.0 / math.cos(math.radians(solar_zenith_deg))
    transmittance = math.exp(-optical_depth * air_mass)
    out = {
        "optical_depth": optical_depth,
        "solar_zenith_deg": solar_zenith_deg,
        "air_mass": air_mass,
        "transmittance": transmittance,
        "attenuation": 1.0 - transmittance,
    }
    if extinction_coeff_per_km is not None:
        out["extinction_coeff_per_km"] = extinction_coeff_per_km
        out["koschmieder_visibility_km"] = 3.912 / extinction_coeff_per_km
    return out


# ── 6. Henry's law gas solubility ─────────────────────────────────────────────
def henry_law_solubility(*, partial_pressure_atm: float = 1.0,
                         k_h_mol_l_atm: float = 0.034) -> dict:
    """Henry's law dissolved-gas equilibrium: C = k_H * P.
    KNOWN: for CO2 in water at 25 C, k_H ~= 0.034 mol L^-1 atm^-1, so at
    P(CO2) = 1 atm the equilibrium dissolved CO2 is ~0.034 mol/L; at the
    atmospheric partial pressure of CO2 (~4e-4 atm) it is ~1.4e-5 mol/L.

    Ref: Henry's law; k_H(CO2, 25 C) = 3.4e-2 M/atm (Sander 2015 compilation).
    """
    concentration = k_h_mol_l_atm * partial_pressure_atm
    return {
        "partial_pressure_atm": partial_pressure_atm,
        "k_h_mol_l_atm": k_h_mol_l_atm,
        "concentration_mol_l": concentration,
        "concentration_mmol_l": concentration * 1000.0,
    }


# ── 7. Adiabatic cloud condensation level (LCL) ───────────────────────────────
def lifting_condensation_level(*, temperature_c: float = 30.0,
                               dewpoint_c: float = 20.0,
                               surface_height_m: float = 0.0) -> dict:
    """Espy lifting-condensation-level (cloud base) approximation:
        LCL height = 125 * (T - Td)   [metres, T,Td in deg C]
    The dry adiabat (~9.8 K/km) and the dewpoint lapse (~1.8 K/km) converge at
    ~8 K/km, giving 1/8 km per K = 125 m/K.
    KNOWN: a 10 C temperature-dewpoint spread -> cloud base ~1250 m AGL.

    Ref: Espy's equation; Lawrence (2005), BAMS, recommends 125 m/K.
    """
    spread = temperature_c - dewpoint_c
    lcl_agl = ESPY_M_PER_K * spread
    return {
        "temperature_c": temperature_c,
        "dewpoint_c": dewpoint_c,
        "spread_c": spread,
        "lcl_height_agl_m": lcl_agl,
        "lcl_height_msl_m": lcl_agl + surface_height_m,
        "espy_coefficient_m_per_k": ESPY_M_PER_K,
    }


# ── 8. Atmospheric residence time = burden / flux ─────────────────────────────
def atmospheric_residence_time(*, burden: float = 1.3e16,
                               flux: float = 5.05e17) -> dict:
    """Steady-state residence (turnover) time tau = burden / flux.

    KNOWN: the global atmospheric water-vapour burden is ~1.3e16 kg and the
    global precipitation (= evaporation) flux is ~5.05e17 kg/yr, giving
    tau = 1.3e16 / 5.05e17 ~= 0.0257 yr ~= 9.4 days, matching the textbook
    ~9-10 day residence time of water vapour.

    Ref: Trenberth et al.; water-vapour residence time ~9 days
    (mean 8-10 days, Nature Rev. Earth Environ. 2021).
    """
    tau_units = burden / flux
    tau_days = tau_units * 365.25  # if flux is per year, tau in years -> days
    return {
        "burden": burden,
        "flux": flux,
        "residence_time": tau_units,
        "residence_time_days": tau_days,
    }
