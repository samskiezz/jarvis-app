"""Optics & photonics simulation methods.

Eight named, real optics methods, each computed from its canonical published
formula and each verified in the test suite against a KNOWN published value:

  1. thin_lens_image          — lensmaker / thin-lens eqn 1/f = 1/u + 1/v
                                (u=30 cm, f=10 cm -> image v = 15 cm)
  2. diffraction_grating      — grating eqn m*lambda = d*sin(theta)
                                (500 nm, 1000 lines/mm, m=1 -> theta = 30 deg)
  3. fresnel_reflection       — Fresnel coefficients at an interface
                                (air->glass n=1.5 normal-incidence R ~= 0.04)
  4. diffraction_limit        — Rayleigh / Abbe diffraction-limited resolution
                                (510 nm, NA=1.4 -> Rayleigh r ~= 222 nm)
  5. fiber_numerical_aperture — fiber NA & V-number normalized frequency
                                (single-mode iff V < 2.405)
  6. gaussian_beam            — Gaussian-beam waist / Rayleigh range
                                (z_R = pi*w0^2/lambda)
  7. bragg_wavelength         — Bragg-grating / thin-film interference wavelength
                                (lambda_B = 2*n_eff*Lambda; ~1550 nm telecom FBG)
  8. snell_refraction         — Snell's law + total-internal-reflection angle
                                (glass->air n=1.5 critical angle ~= 41.8 deg)

Sources (researched & verified):
  - Fresnel equations / 4% glass reflectance: en.wikipedia.org/wiki/Fresnel_equations,
    rp-photonics.com/fresnel_equations.html
  - Fiber V-number, 2.405 single-mode cutoff (first zero of J0):
    rp-photonics.com/v_number.html
  - Diffraction grating equation: en.wikipedia.org/wiki/Diffraction_grating
  - Rayleigh/Abbe limit (0.61 lambda/NA, lambda/2NA):
    edinst.com Rayleigh criterion; svi.nl/DiffractionLimit
  - Gaussian beam / Rayleigh length z_R = pi w0^2/lambda:
    en.wikipedia.org/wiki/Rayleigh_length
  - Fiber Bragg grating lambda_B = 2 n_eff Lambda: rp-photonics.com/fiber_bragg_gratings.html
  - Snell's law / TIR: standard optics.
"""
from __future__ import annotations

import numpy as np


# 1. LENSMAKER / THIN-LENS EQUATION ------------------------------------------
def thin_lens_image(*, object_distance_m: float, focal_length_m: float) -> dict:
    """Thin-lens imaging from the Gaussian lens equation 1/f = 1/u + 1/v.

    Solve for the image distance v = 1 / (1/f - 1/u) and the lateral
    magnification m = -v/u.  (Sign convention: real object at +u, real image
    at +v, converging lens f > 0.)

    Known check: u = 0.30 m, f = 0.10 m -> v = 0.15 m, magnification = -0.5.
    """
    u = object_distance_m
    f = focal_length_m
    inv_v = 1.0 / f - 1.0 / u
    if inv_v == 0.0:
        raise ValueError("object at focal point -> image at infinity")
    v = 1.0 / inv_v
    magnification = -v / u
    return {
        "image_distance_m": float(v),
        "image_distance_cm": float(v * 100.0),
        "magnification": float(magnification),
        "is_real_image": bool(v > 0.0),
        "is_inverted": bool(magnification < 0.0),
    }


# 2. DIFFRACTION GRATING ------------------------------------------------------
def diffraction_grating(*, wavelength_m: float, lines_per_m: float,
                        order: int = 1) -> dict:
    """Diffraction-grating equation m*lambda = d*sin(theta).

    Grating spacing d = 1/lines_per_m; diffraction angle theta = arcsin(m*lambda/d).

    Known check: lambda = 500 nm, 1000 lines/mm (= 1e6 lines/m, d = 1 um),
    m = 1 -> sin(theta) = 0.5 -> theta = 30 deg.
    """
    d = 1.0 / lines_per_m
    sin_theta = order * wavelength_m / d
    if abs(sin_theta) > 1.0:
        raise ValueError(f"order {order} is evanescent (|sin theta| > 1)")
    theta_rad = np.arcsin(sin_theta)
    return {
        "grating_spacing_m": float(d),
        "sin_theta": float(sin_theta),
        "angle_rad": float(theta_rad),
        "angle_deg": float(np.degrees(theta_rad)),
    }


# 3. FRESNEL REFLECTION -------------------------------------------------------
def fresnel_reflection(*, n1: float, n2: float, incidence_angle_deg: float = 0.0) -> dict:
    """Fresnel reflection coefficients / reflectance at a dielectric interface.

    Amplitude coefficients (s and p polarization):
        r_s = (n1 cos i - n2 cos t) / (n1 cos i + n2 cos t)
        r_p = (n2 cos i - n1 cos t) / (n2 cos i + n1 cos t)
    Power reflectance R = |r|^2; unpolarized R = (R_s + R_p)/2.
    At normal incidence both reduce to R = ((n1 - n2)/(n1 + n2))^2.

    Known check: air (n1=1) -> glass (n2=1.5) at normal incidence,
    R ~= ((1-1.5)/(1+1.5))^2 = 0.04 (the famous ~4% per-surface glass loss).
    """
    i = np.radians(incidence_angle_deg)
    cos_i = np.cos(i)
    sin_t = n1 / n2 * np.sin(i)
    if abs(sin_t) >= 1.0:
        # total internal reflection: full reflectance
        return {
            "reflectance_s": 1.0,
            "reflectance_p": 1.0,
            "reflectance_unpolarized": 1.0,
            "transmittance_unpolarized": 0.0,
            "total_internal_reflection": True,
        }
    cos_t = np.sqrt(1.0 - sin_t * sin_t)
    r_s = (n1 * cos_i - n2 * cos_t) / (n1 * cos_i + n2 * cos_t)
    r_p = (n2 * cos_i - n1 * cos_t) / (n2 * cos_i + n1 * cos_t)
    R_s = r_s * r_s
    R_p = r_p * r_p
    R = 0.5 * (R_s + R_p)
    return {
        "reflectance_s": float(R_s),
        "reflectance_p": float(R_p),
        "reflectance_unpolarized": float(R),
        "transmittance_unpolarized": float(1.0 - R),
        "total_internal_reflection": False,
    }


# 4. DIFFRACTION-LIMITED RESOLUTION ------------------------------------------
def diffraction_limit(*, wavelength_m: float, numerical_aperture: float) -> dict:
    """Diffraction-limited lateral resolution (Rayleigh & Abbe criteria).

    Rayleigh criterion:  r = 0.61 * lambda / NA
    Abbe limit:          d = lambda / (2 * NA) = 0.5 * lambda / NA

    Known check: lambda = 510 nm, NA = 1.4 -> Rayleigh r ~= 222 nm.
    """
    if numerical_aperture <= 0.0:
        raise ValueError("numerical aperture must be positive")
    rayleigh = 0.61 * wavelength_m / numerical_aperture
    abbe = wavelength_m / (2.0 * numerical_aperture)
    return {
        "rayleigh_resolution_m": float(rayleigh),
        "rayleigh_resolution_nm": float(rayleigh * 1e9),
        "abbe_resolution_m": float(abbe),
        "abbe_resolution_nm": float(abbe * 1e9),
    }


# 5. OPTICAL-FIBER NUMERICAL APERTURE & V-NUMBER -----------------------------
def fiber_numerical_aperture(*, core_index: float, cladding_index: float,
                             core_radius_m: float, wavelength_m: float) -> dict:
    """Step-index fiber numerical aperture and V-number (normalized frequency).

    NA = sqrt(n_core^2 - n_clad^2)
    V  = 2*pi*a*NA / lambda
    The fiber is single-mode iff V < 2.405 (the first zero of the Bessel
    function J0, the LP11 cutoff). The cutoff wavelength is lambda_c where V=2.405.

    Known check: V < 2.405 -> single-mode; V >= 2.405 -> multimode.
    """
    if core_index <= cladding_index:
        raise ValueError("core index must exceed cladding index for guidance")
    na = np.sqrt(core_index ** 2 - cladding_index ** 2)
    v_number = 2.0 * np.pi * core_radius_m * na / wavelength_m
    cutoff_wavelength = 2.0 * np.pi * core_radius_m * na / 2.405
    # Approximate number of guided modes for a step-index fiber: ~ V^2/2
    num_modes = max(1.0, v_number ** 2 / 2.0)
    return {
        "numerical_aperture": float(na),
        "acceptance_angle_deg": float(np.degrees(np.arcsin(min(1.0, na)))),
        "v_number": float(v_number),
        "single_mode_cutoff_v": 2.405,
        "is_single_mode": bool(v_number < 2.405),
        "cutoff_wavelength_m": float(cutoff_wavelength),
        "approx_num_modes": float(num_modes),
    }


# 6. GAUSSIAN BEAM ------------------------------------------------------------
def gaussian_beam(*, waist_radius_m: float, wavelength_m: float,
                  distance_m: float = 0.0) -> dict:
    """Gaussian-beam propagation: Rayleigh range, divergence, spot at distance z.

    Rayleigh range   z_R = pi * w0^2 / lambda
    Far-field half-angle divergence  theta = lambda / (pi * w0)
    Beam radius at z   w(z) = w0 * sqrt(1 + (z/z_R)^2)

    Known check: at z = z_R the beam radius grows by sqrt(2) and the
    cross-sectional area doubles (defining property of the Rayleigh range).
    """
    if waist_radius_m <= 0.0:
        raise ValueError("beam waist must be positive")
    z_r = np.pi * waist_radius_m ** 2 / wavelength_m
    divergence = wavelength_m / (np.pi * waist_radius_m)
    w_z = waist_radius_m * np.sqrt(1.0 + (distance_m / z_r) ** 2)
    return {
        "rayleigh_range_m": float(z_r),
        "divergence_half_angle_rad": float(divergence),
        "divergence_half_angle_deg": float(np.degrees(divergence)),
        "beam_radius_at_distance_m": float(w_z),
        "confocal_parameter_m": float(2.0 * z_r),
    }


# 7. BRAGG-GRATING / THIN-FILM INTERFERENCE WAVELENGTH -----------------------
def bragg_wavelength(*, effective_index: float, grating_period_m: float,
                     order: int = 1) -> dict:
    """Bragg / thin-film interference reflection wavelength.

    Bragg condition (1st order):  lambda_B = 2 * n_eff * Lambda
    General order m:              lambda = 2 * n_eff * Lambda / m

    Known check: a telecom fiber Bragg grating with n_eff = 1.45 and
    Lambda ~= 534.48 nm reflects at lambda_B ~= 1550 nm.
    """
    if order < 1:
        raise ValueError("diffraction order must be >= 1")
    lam = 2.0 * effective_index * grating_period_m / order
    return {
        "bragg_wavelength_m": float(lam),
        "bragg_wavelength_nm": float(lam * 1e9),
        "order": int(order),
    }


# 8. SNELL'S LAW + TOTAL INTERNAL REFLECTION ---------------------------------
def snell_refraction(*, n1: float, n2: float, incidence_angle_deg: float) -> dict:
    """Snell's law refraction n1 sin(i) = n2 sin(t) and the TIR critical angle.

    Refraction angle  t = arcsin(n1/n2 * sin(i)) when n1 sin(i) <= n2.
    When n1 > n2 there is a critical angle theta_c = arcsin(n2/n1) beyond
    which the ray is totally internally reflected.

    Known check: glass (n1=1.5) -> air (n2=1.0), critical angle
    theta_c = arcsin(1/1.5) ~= 41.81 deg.
    """
    i = np.radians(incidence_angle_deg)
    sin_t = n1 / n2 * np.sin(i)
    critical_angle_deg = None
    if n1 > n2:
        critical_angle_deg = float(np.degrees(np.arcsin(n2 / n1)))
    tir = abs(sin_t) > 1.0
    result = {
        "critical_angle_deg": critical_angle_deg,
        "total_internal_reflection": bool(tir),
    }
    if tir:
        result["refraction_angle_deg"] = None
    else:
        t = np.arcsin(sin_t)
        result["refraction_angle_rad"] = float(t)
        result["refraction_angle_deg"] = float(np.degrees(t))
    return result
