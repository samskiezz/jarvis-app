"""NASA/IAU-grade astronomy & cosmology simulation methods.

Eight named, real astrophysics methods, each computed from its canonical
published formula and each verified in the test suite against a KNOWN
published value:

  1. hubble_recession_velocity  — Hubble's law v = H0*d (1 Mpc -> 67.4 km/s)
  2. stellar_luminosity         — Stefan-Boltzmann L=4*pi*R^2*sigma*T^4
                                   (Sun -> ~3.828e26 W)
  3. cosmological_redshift       — redshift z & scale factor a=1/(1+z)
                                   (z=1 -> a=0.5; lambda doubles)
  4. chandrasekhar_mass          — white-dwarf upper mass limit (mu_e=2 -> ~1.4 Msun)
  5. orbital_period              — Kepler/Newton P=2*pi*sqrt(a^3/(G*M))
                                   (Earth at 1 AU -> 1 yr)
  6. escape_velocity            — v_esc=sqrt(2GM/R) & surface gravity g=GM/R^2
                                   (Earth -> 11.2 km/s)
  7. wien_peak_colour           — Wien's displacement lambda_max=b/T -> colour
                                   (Sun 5772 K -> ~502 nm, green-peak)
  8. schwarzschild_radius        — r_s=2GM/c^2 (Sun -> 2.95 km); also Roche limit

All constants are CODATA 2018 / IAU 2015 nominal published values.
Sources: Wikipedia (Hubble's law, Stefan-Boltzmann law, Chandrasekhar limit,
Schwarzschild radius, Wien's displacement law, Roche limit), Planck 2018
(H0=67.4), IAU 2015 nominal solar/terrestrial constants.
"""
from __future__ import annotations

import numpy as np
from scipy import constants as sc

# --- Published physical constants (CODATA 2018 / SI) ------------------------
C = sc.c                       # speed of light, 299792458 m/s
G = sc.G                       # gravitational constant, 6.67430e-11 m^3/kg/s^2
HBAR = sc.hbar                 # reduced Planck constant, 1.054571817e-34 J*s
SIGMA_SB = sc.Stefan_Boltzmann # Stefan-Boltzmann constant, 5.670374419e-8 W/m^2/K^4
WIEN_B = sc.Wien               # Wien displacement constant, 2.897771955e-3 m*K
M_PROTON = sc.m_p              # proton mass, 1.67262192369e-27 kg (~ hydrogen atom)

# --- Astronomical / cosmological published values ---------------------------
M_SUN = 1.98892e30             # solar mass, kg (IAU)
R_SUN = 6.957e8                # nominal solar radius, m (IAU 2015)
T_SUN_EFFECTIVE = 5772.0       # nominal solar effective temperature, K (IAU 2015)
L_SUN = 3.828e26               # nominal solar luminosity, W (IAU 2015)

M_EARTH = 5.972e24             # Earth mass, kg
R_EARTH = 6.371e6              # Earth mean radius, m
AU = sc.au                     # astronomical unit, 1.495978707e11 m

MPC = 3.0856775814913673e22    # megaparsec, m
KM = 1.0e3
YEAR_SECONDS = 365.25 * 24.0 * 3600.0   # Julian year, s

H0_PLANCK = 67.4               # Planck 2018 Hubble constant, km/s/Mpc


# 1. COSMOLOGY — HUBBLE'S LAW -------------------------------------------------
def hubble_recession_velocity(*, distance_mpc: float,
                              h0_km_s_mpc: float = H0_PLANCK) -> dict:
    """Hubble's law: recession velocity v = H0 * d.

    H0 in km/s/Mpc, distance in Mpc -> velocity in km/s.
    Also reports the Hubble time 1/H0 (~ age-of-universe scale).

    Known check: at d = 1 Mpc with the Planck 2018 H0 = 67.4 km/s/Mpc,
    v = 67.4 km/s.
    """
    velocity_km_s = h0_km_s_mpc * distance_mpc
    # Hubble time = 1/H0 with H0 converted to SI (1/s)
    h0_si = h0_km_s_mpc * KM / MPC
    hubble_time_s = 1.0 / h0_si
    return {
        "velocity_km_s": float(velocity_km_s),
        "velocity_m_s": float(velocity_km_s * KM),
        "hubble_time_s": float(hubble_time_s),
        "hubble_time_gyr": float(hubble_time_s / (YEAR_SECONDS * 1e9)),
    }


# 2. STELLAR ASTROPHYSICS — STEFAN-BOLTZMANN LUMINOSITY ----------------------
def stellar_luminosity(*, radius_m: float, temperature_k: float) -> dict:
    """Stefan-Boltzmann stellar luminosity  L = 4*pi*R^2 * sigma * T^4.

    Reports luminosity in watts and in solar luminosities.

    Known check: for the Sun (R = 6.957e8 m, T_eff = 5772 K),
    L ~= 3.828e26 W (the nominal solar luminosity).
    """
    surface_area = 4.0 * np.pi * radius_m * radius_m
    luminosity_w = surface_area * SIGMA_SB * temperature_k ** 4
    return {
        "luminosity_w": float(luminosity_w),
        "luminosity_solar": float(luminosity_w / L_SUN),
        "surface_area_m2": float(surface_area),
    }


# 3. COSMOLOGY — REDSHIFT & SCALE FACTOR -------------------------------------
def cosmological_redshift(*, redshift_z: float) -> dict:
    """Cosmological redshift z and the FLRW scale factor a = 1/(1+z).

    1 + z = lambda_observed / lambda_emitted = a_now / a_then.
    The wavelength stretch factor is (1+z).

    Known check: z = 1 -> scale factor a = 0.5 (the universe was half its
    present size; observed wavelengths are doubled).
    """
    if redshift_z <= -1.0:
        raise ValueError("redshift z must be > -1")
    scale_factor = 1.0 / (1.0 + redshift_z)
    wavelength_stretch = 1.0 + redshift_z
    return {
        "scale_factor": float(scale_factor),
        "wavelength_stretch": float(wavelength_stretch),
        # low-z recession velocity from the relativistic-free approximation v ~ cz
        "approx_velocity_km_s": float(C * redshift_z / KM),
    }


# 4. STELLAR REMNANTS — CHANDRASEKHAR MASS LIMIT -----------------------------
def chandrasekhar_mass(*, mean_molecular_weight_per_electron: float = 2.0) -> dict:
    """Chandrasekhar limiting mass of a white dwarf.

    M_Ch = (omega3 * sqrt(3*pi) / 2) * (hbar*c/G)^(3/2) * 1/(mu_e * m_H)^2
    where omega3 ~= 2.018236 is the Lane-Emden (n=3) constant and m_H ~= proton
    mass.

    Known check: for carbon/oxygen white dwarfs (mu_e = 2),
    M_Ch ~= 1.4 solar masses.
    """
    omega3 = 2.018236
    m_h = M_PROTON
    mass_kg = (omega3 * np.sqrt(3.0 * np.pi) / 2.0) \
        * (HBAR * C / G) ** 1.5 \
        / (mean_molecular_weight_per_electron * m_h) ** 2
    return {
        "mass_kg": float(mass_kg),
        "mass_solar": float(mass_kg / M_SUN),
    }


# 5. CELESTIAL MECHANICS — KEPLER / NEWTON ORBITAL PERIOD --------------------
def orbital_period(*, semi_major_axis_m: float,
                   central_mass_kg: float = M_SUN) -> dict:
    """Newton's form of Kepler's third law:  P = 2*pi*sqrt(a^3 / (G*M)).

    Reports the orbital period in seconds and years.

    Known check: a planet at a = 1 AU around the Sun has P = 1 year.
    """
    period_s = 2.0 * np.pi * np.sqrt(semi_major_axis_m ** 3
                                     / (G * central_mass_kg))
    return {
        "period_s": float(period_s),
        "period_years": float(period_s / YEAR_SECONDS),
        "period_days": float(period_s / (24.0 * 3600.0)),
    }


# 6. PLANETARY PHYSICS — ESCAPE VELOCITY & SURFACE GRAVITY -------------------
def escape_velocity(*, mass_kg: float = M_EARTH,
                    radius_m: float = R_EARTH) -> dict:
    """Escape velocity v_esc = sqrt(2*G*M/R) and surface gravity g = G*M/R^2.

    Known check: for Earth (M = 5.972e24 kg, R = 6.371e6 m),
    v_esc ~= 11.2 km/s and g ~= 9.8 m/s^2.
    """
    v_esc = np.sqrt(2.0 * G * mass_kg / radius_m)
    surface_gravity = G * mass_kg / (radius_m * radius_m)
    return {
        "escape_velocity_m_s": float(v_esc),
        "escape_velocity_km_s": float(v_esc / KM),
        "surface_gravity_m_s2": float(surface_gravity),
    }


# 7. STELLAR COLOUR — WIEN'S DISPLACEMENT LAW --------------------------------
def wien_peak_colour(*, temperature_k: float) -> dict:
    """Wien's displacement law: blackbody peak wavelength lambda_max = b / T,
    mapped to an approximate visible colour band.

    Known check: at the Sun's T_eff = 5772 K, lambda_max ~= 502 nm
    (green-blue peak; the Sun is effectively white).
    """
    peak_wavelength_m = WIEN_B / temperature_k
    peak_nm = peak_wavelength_m * 1e9
    if peak_nm < 380:
        colour = "ultraviolet"
    elif peak_nm < 450:
        colour = "violet/blue"
    elif peak_nm < 495:
        colour = "blue"
    elif peak_nm < 570:
        colour = "green"
    elif peak_nm < 590:
        colour = "yellow"
    elif peak_nm < 620:
        colour = "orange"
    elif peak_nm < 750:
        colour = "red"
    else:
        colour = "infrared"
    return {
        "peak_wavelength_m": float(peak_wavelength_m),
        "peak_wavelength_nm": float(peak_nm),
        "colour": colour,
    }


# 8. RELATIVISTIC / TIDAL ASTROPHYSICS ---------------------------------------
def schwarzschild_radius(*, mass_kg: float = M_SUN) -> dict:
    """Schwarzschild radius r_s = 2*G*M/c^2 (event horizon of a non-rotating
    mass). Also reports the rigid-body Roche limit prefactor for reference.

    Known check: for the Sun (M = 1.98892e30 kg), r_s ~= 2.95 km.
    """
    r_s = 2.0 * G * mass_kg / (C * C)
    return {
        "radius_m": float(r_s),
        "radius_km": float(r_s / KM),
    }


def roche_limit(*, primary_radius_m: float, primary_density: float,
                satellite_density: float) -> dict:
    """Rigid-body Roche limit  d = 2.44 * R * (rho_primary / rho_satellite)^(1/3),
    the distance inside which tidal forces disrupt a rigid satellite.

    Known check: the 2.44 rigid-body coefficient is Roche's classic value;
    for equal densities d = 2.44 * R.
    """
    ratio = (primary_density / satellite_density) ** (1.0 / 3.0)
    d = 2.44 * primary_radius_m * ratio
    return {
        "roche_limit_m": float(d),
        "roche_limit_km": float(d / KM),
        "density_ratio_cuberoot": float(ratio),
    }
