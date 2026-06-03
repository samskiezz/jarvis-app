"""Real, named materials-science methods — each verifiable against a KNOWN value.

Every function implements a textbook law from materials science and returns a
plain ``dict``. The accompanying test module asserts each result against an
independently published reference value (with citation in the test).

Methods implemented:
  1. bragg_diffraction        — Bragg's law  nλ = 2 d sinθ
  2. lever_rule               — phase-diagram lever rule (phase fractions)
  3. griffith_fracture        — Griffith brittle-fracture stress
  4. fick_diffusion           — Fick's 2nd law error-function profile + length
  5. hooke_elasticity         — Hooke's law / Young's modulus (stress-strain)
  6. arrhenius_vacancy        — Arrhenius vacancy concentration / creep rate
  7. hall_petch               — Hall-Petch grain-size strengthening
  8. wiedemann_franz          — Wiedemann-Franz law / Lorenz number

All numerics use numpy / scipy. No hashing, no fake data.
"""
from __future__ import annotations

import math
from typing import Optional

import numpy as np
from scipy.special import erf, erfc

# ── physical constants (SI, CODATA) ──────────────────────────────────────────
K_B = 1.380649e-23      # Boltzmann constant  [J/K]
E_CHARGE = 1.602176634e-19  # elementary charge   [C]
R_GAS = 8.314462618     # molar gas constant  [J/(mol K)]
# Theoretical Sommerfeld Lorenz number  L = (pi^2/3)(k_B/e)^2  [W ohm / K^2]
LORENZ_THEORETICAL = (math.pi**2 / 3.0) * (K_B / E_CHARGE) ** 2  # ~2.44e-8


# ── 1. Bragg diffraction ─────────────────────────────────────────────────────
def bragg_diffraction(
    d_spacing_m: float,
    wavelength_m: float,
    order: int = 1,
    theta_deg: Optional[float] = None,
) -> dict:
    """Bragg's law:  n*lambda = 2 d sin(theta).

    If ``theta_deg`` is None, solve for the diffraction (Bragg) angle theta given
    d-spacing and wavelength. If ``theta_deg`` is provided, solve for the
    wavelength that satisfies the condition (forward check).

    Returns angle in degrees and radians.
    """
    if theta_deg is None:
        sin_theta = order * wavelength_m / (2.0 * d_spacing_m)
        if not (-1.0 <= sin_theta <= 1.0):
            raise ValueError("No Bragg reflection: |n*lambda / (2d)| > 1")
        theta = math.asin(sin_theta)
        solved_wavelength = wavelength_m
    else:
        theta = math.radians(theta_deg)
        solved_wavelength = 2.0 * d_spacing_m * math.sin(theta) / order
        sin_theta = math.sin(theta)

    return {
        "order": int(order),
        "d_spacing_m": float(d_spacing_m),
        "wavelength_m": float(solved_wavelength),
        "sin_theta": float(sin_theta),
        "theta_rad": float(theta),
        "theta_deg": float(math.degrees(theta)),
        "two_theta_deg": float(2.0 * math.degrees(theta)),
    }


# ── 2. Lever rule (phase fractions) ──────────────────────────────────────────
def lever_rule(c0: float, c_alpha: float, c_liquid: float) -> dict:
    """Lever rule on a binary tie line.

    Given the overall alloy composition ``c0`` and the two phase-boundary
    compositions (``c_alpha`` solid, ``c_liquid`` liquid) at a temperature, the
    mass fraction of liquid is (c0 - c_alpha)/(c_liquid - c_alpha) and the
    solid (alpha) fraction is the complement.
    """
    span = c_liquid - c_alpha
    if span == 0:
        raise ValueError("Degenerate tie line: c_alpha == c_liquid")
    frac_liquid = (c0 - c_alpha) / span
    frac_alpha = (c_liquid - c0) / span
    return {
        "c0": float(c0),
        "c_alpha": float(c_alpha),
        "c_liquid": float(c_liquid),
        "fraction_liquid": float(frac_liquid),
        "fraction_alpha": float(frac_alpha),
        "fraction_solid": float(frac_alpha),
        "sum_check": float(frac_liquid + frac_alpha),
    }


# ── 3. Griffith fracture ─────────────────────────────────────────────────────
def griffith_fracture(
    youngs_modulus_pa: float,
    surface_energy_j_m2: float,
    crack_half_length_m: float,
) -> dict:
    """Griffith brittle-fracture criterion (plane stress):

        sigma_f = sqrt( 2 E gamma_s / (pi a) )

    where ``a`` is the half-length of an internal (or full length of an edge)
    crack. Returns the critical fracture stress in Pa and MPa.
    """
    if crack_half_length_m <= 0:
        raise ValueError("crack half-length must be positive")
    sigma_f = math.sqrt(
        2.0 * youngs_modulus_pa * surface_energy_j_m2
        / (math.pi * crack_half_length_m)
    )
    # Critical stress-intensity factor K_Ic = sigma_f * sqrt(pi a)
    k_ic = sigma_f * math.sqrt(math.pi * crack_half_length_m)
    return {
        "youngs_modulus_pa": float(youngs_modulus_pa),
        "surface_energy_j_m2": float(surface_energy_j_m2),
        "crack_half_length_m": float(crack_half_length_m),
        "fracture_stress_pa": float(sigma_f),
        "fracture_stress_mpa": float(sigma_f / 1e6),
        "k_ic_pa_sqrt_m": float(k_ic),
    }


# ── 4. Fick's-law diffusion (error-function solution) ────────────────────────
def fick_diffusion(
    cs: float,
    c0: float,
    x_m: float,
    diffusivity_m2_s: float,
    time_s: float,
) -> dict:
    """Fick's second law, semi-infinite solid with constant surface conc.:

        (C(x,t) - C0) / (Cs - C0) = 1 - erf( x / (2 sqrt(D t)) )

    Returns the concentration at (x, t), the dimensionless argument, and the
    characteristic diffusion length L = 2 sqrt(D t).
    """
    if diffusivity_m2_s <= 0 or time_s <= 0:
        raise ValueError("D and t must be positive")
    diffusion_length = 2.0 * math.sqrt(diffusivity_m2_s * time_s)
    z = x_m / diffusion_length
    fraction = erfc(z)  # = 1 - erf(z)
    concentration = c0 + (cs - c0) * fraction
    return {
        "cs": float(cs),
        "c0": float(c0),
        "x_m": float(x_m),
        "diffusivity_m2_s": float(diffusivity_m2_s),
        "time_s": float(time_s),
        "diffusion_length_m": float(diffusion_length),
        "argument_z": float(z),
        "erf_z": float(erf(z)),
        "concentration": float(concentration),
        "normalized_fraction": float(fraction),
    }


# ── 5. Hooke elasticity (stress-strain, Young's modulus) ─────────────────────
def hooke_elasticity(
    force_n: float,
    area_m2: float,
    length0_m: float,
    delta_length_m: float,
) -> dict:
    """Hooke's law for a uniaxial tensile bar:

        stress  sigma = F / A
        strain  epsilon = dL / L0
        Young's modulus  E = sigma / epsilon

    Returns stress (Pa), strain (-), and Young's modulus (Pa, GPa).
    """
    if area_m2 <= 0 or length0_m <= 0:
        raise ValueError("area and gauge length must be positive")
    stress = force_n / area_m2
    strain = delta_length_m / length0_m
    if strain == 0:
        raise ValueError("strain is zero; modulus undefined")
    modulus = stress / strain
    return {
        "force_n": float(force_n),
        "area_m2": float(area_m2),
        "stress_pa": float(stress),
        "stress_mpa": float(stress / 1e6),
        "strain": float(strain),
        "youngs_modulus_pa": float(modulus),
        "youngs_modulus_gpa": float(modulus / 1e9),
    }


# ── 6. Arrhenius vacancy concentration / creep ───────────────────────────────
def arrhenius_vacancy(
    activation_energy_j_per_mol: float,
    temperature_k: float,
    prefactor: float = 1.0,
) -> dict:
    """Arrhenius / Boltzmann thermally-activated process:

        N_v / N = A * exp( -Q / (R T) )

    Used for equilibrium vacancy concentration (Q = vacancy formation energy)
    and for thermally-activated creep / diffusion rates. Returns both the
    molar-basis (R T) and per-atom basis (k_B T) exponents.
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive (K)")
    exponent_molar = -activation_energy_j_per_mol / (R_GAS * temperature_k)
    fraction = prefactor * math.exp(exponent_molar)
    # per-atom activation energy (J/atom) for k_B T basis
    q_per_atom = activation_energy_j_per_mol / 6.02214076e23
    exponent_atom = -q_per_atom / (K_B * temperature_k)
    return {
        "activation_energy_j_per_mol": float(activation_energy_j_per_mol),
        "temperature_k": float(temperature_k),
        "prefactor": float(prefactor),
        "exponent": float(exponent_molar),
        "exponent_per_atom": float(exponent_atom),
        "vacancy_fraction": float(fraction),
        "rate": float(fraction),
    }


# ── 7. Hall-Petch grain-size strengthening ───────────────────────────────────
def hall_petch(
    sigma0_pa: float,
    k_y_pa_sqrt_m: float,
    grain_diameter_m: float,
) -> dict:
    """Hall-Petch grain-boundary strengthening:

        sigma_y = sigma_0 + k_y * d^(-1/2)

    Smaller grains -> higher yield strength. Returns yield strength in Pa/MPa.
    """
    if grain_diameter_m <= 0:
        raise ValueError("grain diameter must be positive")
    sigma_y = sigma0_pa + k_y_pa_sqrt_m * grain_diameter_m ** -0.5
    return {
        "sigma0_pa": float(sigma0_pa),
        "k_y_pa_sqrt_m": float(k_y_pa_sqrt_m),
        "grain_diameter_m": float(grain_diameter_m),
        "d_inv_sqrt": float(grain_diameter_m ** -0.5),
        "yield_strength_pa": float(sigma_y),
        "yield_strength_mpa": float(sigma_y / 1e6),
    }


# ── 8. Wiedemann-Franz law / Lorenz number ───────────────────────────────────
def wiedemann_franz(
    thermal_conductivity_w_mk: float,
    electrical_conductivity_s_m: float,
    temperature_k: float,
) -> dict:
    """Wiedemann-Franz law:

        kappa / (sigma * T) = L  (Lorenz number)

    The Sommerfeld theoretical Lorenz number is
    L = (pi^2/3)(k_B/e)^2 ~= 2.44e-8 W ohm / K^2. Returns the measured Lorenz
    number and its ratio to the theoretical value.
    """
    if electrical_conductivity_s_m <= 0 or temperature_k <= 0:
        raise ValueError("conductivity and temperature must be positive")
    lorenz = thermal_conductivity_w_mk / (
        electrical_conductivity_s_m * temperature_k
    )
    return {
        "thermal_conductivity_w_mk": float(thermal_conductivity_w_mk),
        "electrical_conductivity_s_m": float(electrical_conductivity_s_m),
        "temperature_k": float(temperature_k),
        "lorenz_number": float(lorenz),
        "lorenz_theoretical": float(LORENZ_THEORETICAL),
        "ratio_to_theoretical": float(lorenz / LORENZ_THEORETICAL),
    }


# ── keyword route table ──────────────────────────────────────────────────────
ROUTE_TABLE = {
    ("crystallog", "bragg", "diffract", "xray", "x-ray"): "bragg_diffraction",
    ("phase", "lever", "tie-line", "tie line"): "lever_rule",
    ("fracture", "griffith", "crack", "brittle"): "griffith_fracture",
    ("diffus", "fick", "error function", "carburiz"): "fick_diffusion",
    ("elastic", "hooke", "stress-strain", "young"): "hooke_elasticity",
    ("creep", "arrhenius", "vacancy", "activation"): "arrhenius_vacancy",
    ("grain", "hall-petch", "hall petch", "grain-size"): "hall_petch",
    ("conductiv", "wiedemann", "franz", "lorenz", "thermal"): "wiedemann_franz",
}


def route(keyword: str):
    """Return the function matching a keyword (substring), else None."""
    kw = keyword.lower()
    g = globals()
    for keys, fname in ROUTE_TABLE.items():
        if any(k in kw for k in keys):
            return g[fname]
    return None
