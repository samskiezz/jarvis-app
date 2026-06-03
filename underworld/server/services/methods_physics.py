"""NASA-grade physics simulation methods.

Eight named, real physics methods, each computed from its canonical published
formula and each verified in the test suite against a KNOWN published value:

  1. lorentz_factor          — special relativity (gamma at v=0.866c -> 2)
  2. schwarzschild_radius    — general relativity (Sun -> 2.95 km)
  3. double_slit_fringe      — optics (fringe spacing = lambda*L/d)
  4. planck_spectral_radiance- blackbody / Wien peak (Sun ~502 nm)
  5. maxwell_boltzmann_speed - kinetic theory (most-probable speed)
  6. cyclotron_frequency     — electromagnetism (electron in 1 T -> ~28 GHz)
  7. carnot_efficiency       — thermodynamics (1 - Tc/Th)
  8. relativistic_energy     — E=gamma*m*c^2 (electron rest energy 0.511 MeV)

All constants are CODATA / IAU published values.
Sources: Wikipedia (Schwarzschild radius, Wien's displacement law,
Lorentz factor, Maxwell-Boltzmann distribution, Carnot cycle), CODATA 2018.
"""
from __future__ import annotations

import numpy as np
from scipy import constants as sc

# --- Published physical constants (CODATA 2018 / SI) ------------------------
C = sc.c                      # speed of light, 299792458 m/s
G = sc.G                      # gravitational constant, 6.67430e-11 m^3/kg/s^2
H = sc.h                      # Planck constant, 6.62607015e-34 J*s
KB = sc.k                     # Boltzmann constant, 1.380649e-23 J/K
E_CHARGE = sc.e               # elementary charge, 1.602176634e-19 C
M_ELECTRON = sc.m_e           # electron mass, 9.1093837015e-31 kg
WIEN_B = sc.Wien              # Wien displacement constant, 2.897771955e-3 m*K
MEV_PER_JOULE = 1.0 / (1e6 * E_CHARGE)

# Astronomical published values (IAU)
M_SUN = 1.98892e30            # kg
T_SUN_EFFECTIVE = 5778.0      # K (solar effective temperature)


# 1. SPECIAL RELATIVITY -------------------------------------------------------
def lorentz_factor(*, velocity_ms: float) -> dict:
    """Lorentz factor gamma = 1/sqrt(1 - (v/c)^2) and the time-dilation factor.

    Known value: at v = 0.866 c, gamma = 2 (a proper second appears as ~2 s).
    """
    beta = velocity_ms / C
    if beta >= 1.0:
        raise ValueError("velocity must be sub-luminal (v < c)")
    gamma = 1.0 / np.sqrt(1.0 - beta * beta)
    return {
        "beta": float(beta),
        "gamma": float(gamma),
        "time_dilation_factor": float(gamma),  # dt_observer = gamma * dt_proper
        "length_contraction_factor": float(1.0 / gamma),
    }


# 2. GENERAL RELATIVITY -------------------------------------------------------
def schwarzschild_radius(*, mass_kg: float) -> dict:
    """Schwarzschild radius r_s = 2GM/c^2 (event horizon of a non-rotating mass).

    Known value: for the Sun (M = 1.98892e30 kg), r_s ~= 2.95 km.
    """
    r_s = 2.0 * G * mass_kg / (C * C)
    return {
        "radius_m": float(r_s),
        "radius_km": float(r_s / 1000.0),
    }


# 3. OPTICS — DOUBLE-SLIT DIFFRACTION ----------------------------------------
def double_slit_fringe(*, wavelength_m: float, slit_distance_m: float,
                       screen_distance_m: float, num_fringes: int = 5) -> dict:
    """Young's double-slit bright-fringe spacing on a distant screen.

    Fringe spacing  delta_y = lambda * L / d   (small-angle approximation).
    Bright fringes at y_m = m * lambda * L / d.

    Known check: lambda=500 nm, d=0.1 mm, L=1 m -> spacing = 5.0 mm.
    """
    spacing = wavelength_m * screen_distance_m / slit_distance_m
    orders = np.arange(0, num_fringes + 1)
    fringe_positions = orders * spacing
    return {
        "fringe_spacing_m": float(spacing),
        "fringe_spacing_mm": float(spacing * 1000.0),
        "bright_fringe_positions_m": [float(y) for y in fringe_positions],
    }


# 4. BLACKBODY / PLANCK SPECTRAL RADIANCE ------------------------------------
def planck_spectral_radiance(*, temperature_k: float,
                             wavelength_grid_m: np.ndarray | None = None) -> dict:
    """Planck spectral radiance B_lambda(T) and its peak wavelength.

    B_lambda = (2 h c^2 / lambda^5) / (exp(h c / (lambda k T)) - 1)

    The numerically located peak must match Wien's displacement law,
    lambda_max = b / T.  Known check: at T=5778 K, lambda_max ~= 502 nm.
    """
    if wavelength_grid_m is None:
        # 50 nm .. 3000 nm, dense enough to resolve the peak finely
        wavelength_grid_m = np.linspace(50e-9, 3000e-9, 600000)
    lam = np.asarray(wavelength_grid_m, dtype=float)
    exponent = H * C / (lam * KB * temperature_k)
    radiance = (2.0 * H * C * C / lam ** 5) / (np.expm1(exponent))
    peak_idx = int(np.argmax(radiance))
    peak_wavelength = float(lam[peak_idx])
    wien_wavelength = float(WIEN_B / temperature_k)
    return {
        "peak_wavelength_m": peak_wavelength,
        "peak_wavelength_nm": peak_wavelength * 1e9,
        "wien_peak_wavelength_m": wien_wavelength,
        "wien_peak_wavelength_nm": wien_wavelength * 1e9,
        "peak_radiance": float(radiance[peak_idx]),
    }


# 5. KINETIC THEORY — MAXWELL-BOLTZMANN SPEED DISTRIBUTION --------------------
def maxwell_boltzmann_speed(*, temperature_k: float, particle_mass_kg: float) -> dict:
    """Characteristic speeds of the Maxwell-Boltzmann speed distribution.

    Most-probable  v_p    = sqrt(2 k T / m)
    Mean           <v>     = sqrt(8 k T / (pi m))
    RMS            v_rms   = sqrt(3 k T / m)

    Known check: relations  <v> = v_p*sqrt(4/pi),  v_rms = v_p*sqrt(3/2).
    For N2 (m=4.65e-26 kg) at 300 K, v_p ~= 421 m/s.
    """
    v_p = np.sqrt(2.0 * KB * temperature_k / particle_mass_kg)
    v_mean = np.sqrt(8.0 * KB * temperature_k / (np.pi * particle_mass_kg))
    v_rms = np.sqrt(3.0 * KB * temperature_k / particle_mass_kg)
    return {
        "most_probable_speed_ms": float(v_p),
        "mean_speed_ms": float(v_mean),
        "rms_speed_ms": float(v_rms),
    }


# 6. ELECTROMAGNETISM — CYCLOTRON MOTION -------------------------------------
def cyclotron_frequency(*, charge_c: float = E_CHARGE,
                        mass_kg: float = M_ELECTRON,
                        magnetic_field_t: float = 1.0) -> dict:
    """Cyclotron motion of a charged particle in a uniform magnetic field.

    Angular frequency   omega_c = q B / m
    Frequency           f_c     = q B / (2 pi m)

    Known check: an electron in B = 1 T cycles at f_c ~= 28 GHz.
    """
    omega_c = abs(charge_c) * magnetic_field_t / mass_kg
    f_c = omega_c / (2.0 * np.pi)
    return {
        "angular_frequency_rad_s": float(omega_c),
        "frequency_hz": float(f_c),
        "frequency_ghz": float(f_c / 1e9),
    }


# 7. THERMODYNAMICS — CARNOT EFFICIENCY --------------------------------------
def carnot_efficiency(*, cold_temperature_k: float, hot_temperature_k: float) -> dict:
    """Maximum efficiency of a heat engine between two reservoirs.

    eta = 1 - Tc / Th   (Carnot limit, temperatures in kelvin).

    Known check: Tc=300 K, Th=600 K -> eta = 0.5 (50%).
    """
    if hot_temperature_k <= 0 or cold_temperature_k < 0:
        raise ValueError("temperatures must be positive (kelvin)")
    if hot_temperature_k <= cold_temperature_k:
        raise ValueError("hot reservoir must exceed cold reservoir")
    eta = 1.0 - cold_temperature_k / hot_temperature_k
    return {
        "efficiency": float(eta),
        "efficiency_percent": float(eta * 100.0),
    }


# 8. RELATIVISTIC ENERGY ------------------------------------------------------
def relativistic_energy(*, mass_kg: float = M_ELECTRON,
                        velocity_ms: float = 0.0) -> dict:
    """Total relativistic energy E = gamma m c^2, with rest and kinetic parts.

    Rest energy        E0 = m c^2
    Total energy       E  = gamma m c^2
    Kinetic energy     KE = (gamma - 1) m c^2

    Known check: electron rest energy E0 = 0.511 MeV.
    """
    beta = velocity_ms / C
    if beta >= 1.0:
        raise ValueError("velocity must be sub-luminal (v < c)")
    gamma = 1.0 / np.sqrt(1.0 - beta * beta)
    rest_energy_j = mass_kg * C * C
    total_energy_j = gamma * rest_energy_j
    kinetic_energy_j = (gamma - 1.0) * rest_energy_j
    return {
        "rest_energy_j": float(rest_energy_j),
        "rest_energy_mev": float(rest_energy_j * MEV_PER_JOULE),
        "total_energy_j": float(total_energy_j),
        "total_energy_mev": float(total_energy_j * MEV_PER_JOULE),
        "kinetic_energy_mev": float(kinetic_energy_j * MEV_PER_JOULE),
        "gamma": float(gamma),
    }
