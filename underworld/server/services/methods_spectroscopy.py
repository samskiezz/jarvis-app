"""Real spectroscopy simulations.

Each function is a distinct, named spectroscopy method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: atomic emission
(Rydberg/Balmer), absorption photometry (Beer-Lambert), thermal radiation
(Planck/Wien), crystallography (Bragg), photon energetics, molecular rotation
(rigid rotor), molecular vibration (harmonic oscillator / IR), and spectral
line shift/broadening (Doppler).

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_spectroscopy.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Fundamental physical constants (CODATA, rounded as specified) ─────────────
H_PLANCK = 6.626e-34        # Planck constant, J*s
HBAR = H_PLANCK / (2.0 * math.pi)  # reduced Planck constant, J*s
C_LIGHT = 2.998e8           # speed of light in vacuum, m/s
K_BOLTZMANN = 1.381e-23     # Boltzmann constant, J/K
E_CHARGE = 1.602e-19        # elementary charge, C (also 1 eV in joules)
RYDBERG_INF = 1.0973731568e7  # Rydberg constant (infinite mass), 1/m
M_ELECTRON = 9.10938e-31    # electron mass, kg
M_PROTON = 1.67262e-27      # proton mass, kg
N_AVOGADRO = 6.02214076e23  # Avogadro number, 1/mol
WIEN_B = 2.897771955e-3     # Wien displacement constant, m*K
STEFAN_BOLTZMANN = 5.670374e-8  # Stefan-Boltzmann constant, W/(m^2 K^4)


# ── 1. Rydberg formula for hydrogen spectral lines ────────────────────────────
def rydberg_hydrogen(n_lower: int, n_upper: int,
                     *, reduced_mass: bool = True) -> dict:
    """Wavelength of a hydrogen spectral line from the Rydberg formula:
        1/lambda = R_H * (1/n_lower^2 - 1/n_upper^2),  n_upper > n_lower
    The Rydberg constant for hydrogen R_H = R_inf / (1 + m_e/m_p) applies the
    finite-nuclear-mass (reduced mass) correction.
    KNOWN: Balmer H-alpha (n=3->2) = 656.3 nm; the Lyman limit (n=inf->1) at
    91.2 nm; Balmer series limit ~364.6 nm.

    Ref: Rydberg formula (Wikipedia); NIST Atomic Spectra Database.
    """
    if n_upper <= n_lower:
        raise ValueError("n_upper must exceed n_lower")
    R = RYDBERG_INF / (1.0 + M_ELECTRON / M_PROTON) if reduced_mass else RYDBERG_INF
    inv_lambda = R * (1.0 / n_lower ** 2 - 1.0 / n_upper ** 2)
    lam_m = 1.0 / inv_lambda
    freq_hz = C_LIGHT / lam_m
    energy_j = H_PLANCK * freq_hz
    series = {1: "Lyman", 2: "Balmer", 3: "Paschen", 4: "Brackett"}.get(
        n_lower, f"n={n_lower}")
    return {
        "wavelength_nm": lam_m * 1e9,
        "wavelength_m": lam_m,
        "wavenumber_per_m": inv_lambda,
        "frequency_hz": freq_hz,
        "energy_ev": energy_j / E_CHARGE,
        "rydberg_used_per_m": R,
        "series": series,
    }


# ── 2. Beer-Lambert absorbance & transmittance ────────────────────────────────
def beer_lambert(epsilon: float, path_length_cm: float, concentration_M: float) -> dict:
    """Beer-Lambert law for attenuation through an absorbing medium:
        A = epsilon * l * c   (decadic absorbance, dimensionless)
        T = 10^(-A)           (transmittance, 0..1)
    with molar absorptivity epsilon [L/(mol*cm)], path length l [cm], and molar
    concentration c [mol/L].
    KNOWN: epsilon=1000, l=1 cm, c=1e-3 M -> A=1.0, T=10% (0.1); A and T obey
    A = -log10(T) exactly.

    Ref: Beer-Lambert law (IUPAC Gold Book; Wikipedia).
    """
    A = epsilon * path_length_cm * concentration_M
    T = 10.0 ** (-A)
    return {
        "absorbance": A,
        "transmittance": T,
        "transmittance_percent": 100.0 * T,
        "epsilon": epsilon,
        "path_length_cm": path_length_cm,
        "concentration_M": concentration_M,
    }


# ── 3. Planck blackbody spectral radiance + Wien displacement ─────────────────
def planck_blackbody(temperature_K: float, wavelength_m: float | None = None) -> dict:
    """Planck's law for the spectral radiance of a blackbody (per wavelength):
        B_lambda = (2 h c^2 / lambda^5) / (exp(h c / (lambda k T)) - 1)   [W/m^2/m/sr]
    with the Wien displacement law for the peak wavelength:
        lambda_peak = b / T,  b = 2.897771955e-3 m*K
    KNOWN: the Sun (T=5778 K) peaks near 500 nm (green-visible); the spectral
    radiance is evaluated at lambda if supplied.

    Ref: Planck's law & Wien's displacement law (Wikipedia); CODATA constant b.
    """
    lambda_peak_m = WIEN_B / temperature_K
    out = {
        "peak_wavelength_nm": lambda_peak_m * 1e9,
        "peak_wavelength_m": lambda_peak_m,
        "temperature_K": temperature_K,
    }
    if wavelength_m is not None:
        x = H_PLANCK * C_LIGHT / (wavelength_m * K_BOLTZMANN * temperature_K)
        radiance = (2.0 * H_PLANCK * C_LIGHT ** 2 / wavelength_m ** 5) / (math.expm1(x))
        out["wavelength_m"] = wavelength_m
        out["spectral_radiance_W_per_m2_per_m_per_sr"] = radiance
    return out


# ── 4. Bragg's law diffraction ────────────────────────────────────────────────
def bragg_diffraction(wavelength_m: float, d_spacing_m: float, order: int = 1) -> dict:
    """Bragg's law for constructive interference from crystal lattice planes:
        n * lambda = 2 d sin(theta)
    Solving for the diffraction (glancing) angle theta given order n, wavelength
    lambda, and interplanar spacing d.
    KNOWN: Cu K-alpha (lambda=0.15406 nm) off d=0.2 nm planes at n=1 diffracts
    at theta ~= 22.65 deg; no solution exists when n*lambda > 2d.

    Ref: Bragg's law (W.L. & W.H. Bragg, 1913; Wikipedia).
    """
    sin_theta = order * wavelength_m / (2.0 * d_spacing_m)
    if abs(sin_theta) > 1.0:
        return {
            "diffraction_possible": False,
            "sin_theta": sin_theta,
            "order": order,
            "d_spacing_m": d_spacing_m,
            "wavelength_m": wavelength_m,
        }
    theta = math.asin(sin_theta)
    return {
        "diffraction_possible": True,
        "theta_rad": theta,
        "theta_deg": math.degrees(theta),
        "two_theta_deg": 2.0 * math.degrees(theta),
        "sin_theta": sin_theta,
        "order": order,
        "d_spacing_m": d_spacing_m,
        "wavelength_m": wavelength_m,
    }


# ── 5. Photon energy / wavelength / frequency conversions ─────────────────────
def photon_energy(wavelength_nm: float) -> dict:
    """Photon energetics from the Planck-Einstein relation:
        E = h f = h c / lambda
    Reported in joules and electron-volts. The compact spectroscopy rule
    E[eV] = 1239.84 / lambda[nm] follows from hc/e.
    KNOWN: a 1240 nm photon carries ~1.0 eV; a 500 nm (green) photon ~2.48 eV;
    the hc product is ~1240 eV*nm.

    Ref: Planck-Einstein relation (Wikipedia); hc = 1239.84 eV*nm.
    """
    lam_m = wavelength_nm * 1e-9
    freq_hz = C_LIGHT / lam_m
    energy_j = H_PLANCK * freq_hz
    energy_ev = energy_j / E_CHARGE
    return {
        "wavelength_nm": wavelength_nm,
        "frequency_hz": freq_hz,
        "energy_j": energy_j,
        "energy_ev": energy_ev,
        "hc_ev_nm": energy_ev * wavelength_nm,   # the ~1239.84 eV*nm invariant
    }


# ── 6. Rotational spectroscopy line spacing (rigid rotor) ─────────────────────
def rigid_rotor_rotation(reduced_mass_kg: float, bond_length_m: float) -> dict:
    """Rigid-rotor rotational constant and line spacing for a diatomic molecule:
        I = mu r^2                          (moment of inertia)
        B = h / (8 pi^2 c I)                (rotational constant, in 1/m)
    Rotational energy levels E_J = h c B J(J+1); allowed J->J+1 transitions are
    equally spaced by 2B in wavenumber.
    KNOWN: carbon monoxide (mu from C-12/O-16, r=112.8 pm) gives B ~= 1.93 cm^-1
    and an adjacent-line spacing of 2B ~= 3.86 cm^-1.

    Ref: Rigid rotor / rotational spectroscopy (Atkins' Physical Chemistry).
    """
    I = reduced_mass_kg * bond_length_m ** 2
    B_per_m = H_PLANCK / (8.0 * math.pi ** 2 * C_LIGHT * I)
    B_per_cm = B_per_m / 100.0
    return {
        "moment_of_inertia_kg_m2": I,
        "B_per_m": B_per_m,
        "B_per_cm": B_per_cm,
        "B_hz": H_PLANCK / (8.0 * math.pi ** 2 * I),  # B in frequency units
        "line_spacing_per_cm": 2.0 * B_per_cm,         # 2B spacing
        "reduced_mass_kg": reduced_mass_kg,
        "bond_length_m": bond_length_m,
    }


# ── 7. Harmonic-oscillator vibrational frequency (IR) ─────────────────────────
def harmonic_vibration(force_constant_N_per_m: float, reduced_mass_kg: float) -> dict:
    """Vibrational frequency of a diatomic in the harmonic-oscillator model:
        nu = (1 / 2 pi) sqrt(k / mu)        (fundamental frequency, Hz)
        nu_tilde = nu / c                   (wavenumber, 1/m)
    with force constant k and reduced mass mu. Zero-point energy = (1/2) h nu.
    KNOWN: HCl (k ~= 480 N/m, mu from H-1/Cl-35) vibrates near 2884 cm^-1
    (published fundamental ~2886 cm^-1).

    Ref: Quantum harmonic oscillator / IR spectroscopy (Atkins' Phys. Chem.).
    """
    nu_hz = (1.0 / (2.0 * math.pi)) * math.sqrt(force_constant_N_per_m / reduced_mass_kg)
    wavenumber_per_m = nu_hz / C_LIGHT
    zpe_j = 0.5 * H_PLANCK * nu_hz
    return {
        "frequency_hz": nu_hz,
        "wavenumber_per_m": wavenumber_per_m,
        "wavenumber_per_cm": wavenumber_per_m / 100.0,
        "wavelength_um": (1.0 / wavenumber_per_m) * 1e6,
        "zero_point_energy_j": zpe_j,
        "zero_point_energy_ev": zpe_j / E_CHARGE,
        "force_constant_N_per_m": force_constant_N_per_m,
        "reduced_mass_kg": reduced_mass_kg,
    }


# ── 8. Doppler spectral line shift & thermal broadening ───────────────────────
def doppler_shift(wavelength_m: float, velocity_m_per_s: float = 0.0,
                  *, temperature_K: float | None = None,
                  molar_mass_kg_per_mol: float | None = None) -> dict:
    """Doppler effect on a spectral line.
    Non-relativistic line-of-sight shift (positive velocity = receding/redshift):
        dlambda/lambda = v / c
    Thermal Doppler broadening of an ensemble (Maxwell-Boltzmann), full width at
    half maximum:
        dlambda_FWHM = (lambda / c) sqrt(8 k T ln2 / m)
    KNOWN: a source receding at 300 km/s shifts a 500 nm line by ~0.5 nm; the
    Na-D line (589 nm) in a 500 K vapor has a thermal FWHM ~2 pm.

    Ref: Doppler broadening (Wikipedia; Demtroder, Laser Spectroscopy).
    """
    delta_lambda = wavelength_m * velocity_m_per_s / C_LIGHT
    out = {
        "rest_wavelength_m": wavelength_m,
        "velocity_m_per_s": velocity_m_per_s,
        "delta_lambda_m": delta_lambda,
        "delta_lambda_nm": delta_lambda * 1e9,
        "shifted_wavelength_m": wavelength_m + delta_lambda,
        "shifted_wavelength_nm": (wavelength_m + delta_lambda) * 1e9,
        "redshift_z": velocity_m_per_s / C_LIGHT,
    }
    if temperature_K is not None and molar_mass_kg_per_mol is not None:
        m_particle = molar_mass_kg_per_mol / N_AVOGADRO
        fwhm = (wavelength_m / C_LIGHT) * math.sqrt(
            8.0 * K_BOLTZMANN * temperature_K * math.log(2.0) / m_particle)
        out["thermal_fwhm_m"] = fwhm
        out["thermal_fwhm_pm"] = fwhm * 1e12
        out["temperature_K"] = temperature_K
    return out
