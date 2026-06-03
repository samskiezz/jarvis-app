"""Plasma physics & fusion simulations.

Real, textbook plasma-physics relations implemented against known constants and
verified versus published reference values. Each function returns a plain dict so
results are easy to route/serialize. Constants come from scipy.constants (CODATA)
where available; otherwise SI literals are used and noted.

Eight methods:
  1. plasma_frequency        — omega_p = sqrt(n e^2 / (eps0 m))     (rad/s, Hz)
  2. debye_length            — lambda_D = sqrt(eps0 kB Te / (n e^2))
  3. lawson_triple_product   — fusion triple product n*T*tau vs ignition threshold
  4. gyromotion              — cyclotron freq + Larmor (gyro) radius in a B field
  5. coulomb_log_collision   — Coulomb logarithm ln(Lambda) + e-collision rate (NRL)
  6. saha_ionization         — Saha equation ionization fraction (hydrogen-like)
  7. bremsstrahlung_power    — thermal bremsstrahlung power density (Wesson)
  8. plasma_beta             — magnetic pressure + plasma beta = 2 mu0 p / B^2

References:
  - Chen, "Introduction to Plasma Physics and Controlled Fusion".
  - NRL Plasma Formulary (2019/2023), A. S. Richardson.
  - Wesson, "Tokamaks" (bremsstrahlung coefficient).
  - Lawson criterion: Wikipedia / Wurzel & Hsu (arXiv:2105.10954),
    D-T fusion triple product ~3e21 keV*s/m^3.
  - Saha equation: standard astrophysics texts (Saha 1920).
"""

from __future__ import annotations

import math
from typing import Dict

from scipy import constants as sc

# --- physical constants (CODATA via scipy.constants) ------------------------
E_CHARGE = sc.e                  # elementary charge, C   (1.602176634e-19)
EPS0 = sc.epsilon_0              # vacuum permittivity, F/m
MU0 = sc.mu_0                    # vacuum permeability, H/m
M_E = sc.m_e                     # electron mass, kg
M_P = sc.m_p                     # proton mass, kg
K_B = sc.k                       # Boltzmann constant, J/K
H_PLANCK = sc.h                  # Planck constant, J*s
C_LIGHT = sc.c                   # speed of light, m/s
EV_TO_J = sc.e                   # 1 eV in joules
EV_TO_K = sc.e / sc.k            # 1 eV in kelvin (~11604.5 K)

# Lawson D-T ignition triple product (n*T*tau), keV*s/m^3
LAWSON_DT_TRIPLE = 3.0e21        # ~3e21 keV*s/m^3 (Wikipedia/Wurzel&Hsu)


def plasma_frequency(n_e: float, mass: float = M_E) -> Dict[str, float]:
    """Electron (or species) plasma frequency.

    omega_p = sqrt(n e^2 / (eps0 m));  f_p = omega_p / (2 pi).

    Known: for n_e = 1e18 m^-3, f_p ~ 8.98 GHz, omega_p ~ 5.64e10 rad/s.
    The engineering rule f_p[Hz] ~ 8980 * sqrt(n[cm^-3]).
    """
    omega_p = math.sqrt(n_e * E_CHARGE**2 / (EPS0 * mass))
    f_p = omega_p / (2.0 * math.pi)
    return {
        "n_e": n_e,
        "omega_p_rad_s": omega_p,
        "f_p_hz": f_p,
        "f_p_ghz": f_p / 1e9,
    }


def debye_length(n_e: float, T_e_eV: float) -> Dict[str, float]:
    """Plasma Debye (shielding) length.

    lambda_D = sqrt(eps0 kB Te / (n e^2)); with Te in eV,
    lambda_D = sqrt(eps0 * Te[eV] * e / (n e^2)) = sqrt(eps0 Te[eV] / (n e)).

    Known: lambda_D[m] ~ 7430 * sqrt(Te[eV] / n[m^-3]).  For Te=1 eV,
    n=1e18 m^-3 -> lambda_D ~ 7.43e-6 m (~7.4 microns).
    """
    T_e_J = T_e_eV * EV_TO_J
    lam = math.sqrt(EPS0 * T_e_J / (n_e * E_CHARGE**2))
    # number of particles in a Debye sphere (plasma must have N_D >> 1)
    N_D = (4.0 / 3.0) * math.pi * n_e * lam**3
    return {
        "n_e": n_e,
        "T_e_eV": T_e_eV,
        "debye_length_m": lam,
        "N_debye_sphere": N_D,
    }


def lawson_triple_product(
    n: float, T_keV: float, tau_s: float, threshold: float = LAWSON_DT_TRIPLE
) -> Dict[str, float]:
    """Fusion triple product n*T*tau and comparison to the D-T ignition threshold.

    Triple product (keV*s/m^3) = n[m^-3] * T[keV] * tau_E[s].
    Ignition (D-T) requires n*T*tau >~ 3e21 keV*s/m^3.

    Known: ITER-class plasma n=1e20, T=10 keV, tau=3 s -> 3e21 -> ignited (ratio 1.0).
    """
    triple = n * T_keV * tau_s
    return {
        "n": n,
        "T_keV": T_keV,
        "tau_s": tau_s,
        "triple_product": triple,
        "threshold": threshold,
        "ignition_ratio": triple / threshold,
        "ignited": triple >= threshold,
    }


def gyromotion(B: float, v_perp: float, mass: float = M_E, charge: float = E_CHARGE) -> Dict[str, float]:
    """Cyclotron frequency and Larmor (gyro) radius of a charged particle in B.

    omega_c = |q| B / m;  f_c = omega_c / (2 pi);  r_L = m v_perp / (|q| B) = v_perp / omega_c.

    Known: electron in B=1 T -> f_c ~ 28 GHz/T.  Proton in B=1 T -> f_c ~ 15.2 MHz.
    """
    omega_c = abs(charge) * B / mass
    f_c = omega_c / (2.0 * math.pi)
    r_L = v_perp / omega_c if omega_c != 0 else float("inf")
    return {
        "B": B,
        "v_perp": v_perp,
        "omega_c_rad_s": omega_c,
        "f_c_hz": f_c,
        "f_c_ghz": f_c / 1e9,
        "gyroradius_m": r_L,
    }


def coulomb_log_collision(n_e: float, T_e_eV: float, Z: int = 1) -> Dict[str, float]:
    """Coulomb logarithm and electron collision rate (NRL Plasma Formulary).

    For thermal electron-ion collisions (Te > ~10 eV), NRL gives
        ln(Lambda) = 24 - ln( sqrt(n_e[cm^-3]) / T_e[eV] ).
    Electron collision rate (NRL):
        nu_e = 2.91e-6 * Z * n_e[cm^-3] * lnLambda * T_e[eV]^(-3/2)  s^-1.

    Known: ln(Lambda) is typically ~10-20 in fusion plasmas; for
    n_e=1e20 m^-3 (1e14 cm^-3), Te=1000 eV -> ln(Lambda) ~ 17.5.
    """
    n_e_cm3 = n_e / 1e6  # m^-3 -> cm^-3
    ln_lambda = 24.0 - math.log(math.sqrt(n_e_cm3) / T_e_eV)
    nu_e = 2.91e-6 * Z * n_e_cm3 * ln_lambda * T_e_eV ** (-1.5)
    return {
        "n_e": n_e,
        "T_e_eV": T_e_eV,
        "Z": Z,
        "coulomb_log": ln_lambda,
        "collision_freq_hz": nu_e,
        "collision_time_s": 1.0 / nu_e if nu_e > 0 else float("inf"),
    }


def saha_ionization(T_K: float, n_total: float, chi_eV: float = 13.6,
                    g_ratio: float = 1.0) -> Dict[str, float]:
    """Saha ionization equation — ionization fraction of a hydrogen-like gas.

    Solving n_i n_e / n_n = (2 g+/g0) (2 pi m_e kB T / h^2)^(3/2) exp(-chi/kBT),
    and with n_e = n_i, x = n_i/n_total gives
        x^2 / (1 - x) = S / n_total,
    where S is the RHS Saha factor. Returns x in [0, 1].

    Known: pure hydrogen reaches x ~ 0.5 around T ~ 1e4 K (for stellar-atmosphere
    densities); ionization fraction rises monotonically with T.
    """
    kT = K_B * T_K
    saha_factor = g_ratio * 2.0 * (2.0 * math.pi * M_E * kT / H_PLANCK**2) ** 1.5
    saha_factor *= math.exp(-chi_eV * EV_TO_J / kT)
    # K = S / n_total ; solve x^2/(1-x) = K  ->  x^2 + K x - K = 0
    K = saha_factor / n_total
    x = (-K + math.sqrt(K * K + 4.0 * K)) / 2.0
    x = max(0.0, min(1.0, x))
    return {
        "T_K": T_K,
        "n_total": n_total,
        "chi_eV": chi_eV,
        "saha_factor": saha_factor,
        "ionization_fraction": x,
    }


def bremsstrahlung_power(n_e: float, T_e_keV: float, Z_eff: float = 1.0,
                         n_i: float | None = None) -> Dict[str, float]:
    """Thermal bremsstrahlung radiated power density (Wesson / fusion form).

    P_br[W/m^3] = 5.35e-37 * Z_eff * n_e * n_i * sqrt(T_e[keV]),
    with n_i = n_e / Z_eff for quasineutrality if not given, so for a hydrogenic
    plasma (Z=1, n_i=n_e):  P_br ~ 5.35e-37 * n_e^2 * sqrt(T_e[keV]).

    Scaling: P_br ~ n_e^2 * Z * sqrt(T_e).  Doubling n_e quadruples P_br.

    Known: n_e=1e20 m^-3, Te=10 keV, Z=1 -> P_br ~ 1.69e4 W/m^3 (~17 kW/m^3).
    """
    if n_i is None:
        n_i = n_e / Z_eff
    P = 5.35e-37 * Z_eff * n_e * n_i * math.sqrt(T_e_keV)
    return {
        "n_e": n_e,
        "n_i": n_i,
        "T_e_keV": T_e_keV,
        "Z_eff": Z_eff,
        "power_density_W_m3": P,
    }


def plasma_beta(n: float, T_eV: float, B: float) -> Dict[str, float]:
    """Magnetic pressure and plasma beta.

    Thermal pressure  p = n kB T  (here n is total particle density, T in eV).
    Magnetic pressure p_mag = B^2 / (2 mu0).
    Plasma beta       beta = p / p_mag = 2 mu0 p / B^2.

    Known: magnetic pressure of B=1 T is B^2/(2 mu0) ~ 3.98e5 Pa (~3.93 atm).
    Tokamaks operate at beta ~ 0.01-0.05.
    """
    p_thermal = n * K_B * (T_eV * EV_TO_K)  # = n * (T_eV * eV_in_J)
    p_mag = B**2 / (2.0 * MU0)
    beta = 2.0 * MU0 * p_thermal / B**2 if B != 0 else float("inf")
    return {
        "n": n,
        "T_eV": T_eV,
        "B": B,
        "p_thermal_Pa": p_thermal,
        "p_magnetic_Pa": p_mag,
        "plasma_beta": beta,
    }


# --- routing ----------------------------------------------------------------
# keyword tuple -> handler. The dispatcher matches if any keyword is a substring
# of the (lowercased) query token set.
ROUTE_TABLE = {
    ("plasma_freq", "plasma frequency", "omega_p", "plasma_frequency"): plasma_frequency,
    ("debye", "debye_length", "shielding"): debye_length,
    ("lawson", "fusion", "triple_product", "ignition", "triple product"): lawson_triple_product,
    ("gyroradius", "cyclotron", "larmor", "gyromotion", "gyrofrequency"): gyromotion,
    ("coulomb_log", "coulomb", "collision", "lnlambda"): coulomb_log_collision,
    ("saha", "ionization", "ionisation"): saha_ionization,
    ("bremsstrahlung", "brems", "radiation_loss"): bremsstrahlung_power,
    ("plasma_beta", "beta", "magnetic_pressure", "magnetic pressure"): plasma_beta,
}


def route(query: str):
    """Return the handler whose keyword-tuple matches `query` (substring match).

    Generic term 'plasma' alone is ambiguous and defaults to plasma_frequency.
    """
    q = query.lower().strip()
    for keywords, fn in ROUTE_TABLE.items():
        for kw in keywords:
            if kw in q:
                return fn
    if "plasma" in q:
        return plasma_frequency
    return None
