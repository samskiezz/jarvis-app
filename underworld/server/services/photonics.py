"""Real photonics / optical-computing models (feature category O).

Genuine optics (numpy), checkable against closed forms:
  * lensmaker equation, thin-lens imaging + magnification
  * laser threshold gain, fibre numerical aperture + attenuation (dB/km)
  * Mach–Zehnder interferometer transfer function, microring resonance (FSR, Q)
  * photodetector shot-noise + responsivity, optical loss budget
  * real optical matrix-multiplication (the core of photonic neural layers)
"""
from __future__ import annotations

import math

import numpy as np


# ── lenses / imaging ─────────────────────────────────────────────────────────
def lensmaker(*, n: float, r1: float, r2: float) -> float:
    """Lensmaker's equation: 1/f = (n−1)(1/R1 − 1/R2)."""
    inv_f = (n - 1) * (1.0 / r1 - 1.0 / r2)
    return 1.0 / inv_f if inv_f != 0 else math.inf


def thin_lens_image(*, focal_length: float, object_distance: float) -> dict:
    """Thin-lens: 1/f = 1/do + 1/di; magnification m = −di/do."""
    inv_di = 1.0 / focal_length - 1.0 / object_distance
    di = 1.0 / inv_di if inv_di != 0 else math.inf
    m = -di / object_distance if object_distance else math.inf
    return {"image_distance": round(di, 5), "magnification": round(m, 5),
            "real_image": di > 0}


def telescope_magnification(*, focal_objective: float, focal_eyepiece: float) -> float:
    """Angular magnification M = f_objective / f_eyepiece."""
    return focal_objective / focal_eyepiece if focal_eyepiece else math.inf


# ── lasers / fibre ───────────────────────────────────────────────────────────
def laser_threshold(*, gain_coeff: float, length: float, loss: float,
                    mirror_r1: float, mirror_r2: float) -> dict:
    """Lasing condition: round-trip gain ≥ loss. Threshold when
    g·L ≥ α·L + ½ln(1/(R1 R2))."""
    round_trip_gain = gain_coeff * length
    threshold = loss * length + 0.5 * math.log(1.0 / (mirror_r1 * mirror_r2))
    return {"round_trip_gain": round(round_trip_gain, 5), "threshold": round(threshold, 5),
            "lasing": round_trip_gain >= threshold}


def fibre_numerical_aperture(*, n_core: float, n_clad: float) -> dict:
    """Fibre NA = √(n_core² − n_clad²) and acceptance angle."""
    na = math.sqrt(max(0.0, n_core ** 2 - n_clad ** 2))
    return {"numerical_aperture": round(na, 5),
            "acceptance_angle_deg": round(math.degrees(math.asin(min(1.0, na))), 4)}


def fibre_attenuation(*, power_in: float, length_km: float, alpha_db_per_km: float) -> dict:
    """Optical power after fibre attenuation (dB/km)."""
    loss_db = alpha_db_per_km * length_km
    power_out = power_in * 10 ** (-loss_db / 10)
    return {"loss_db": round(loss_db, 4), "power_out": round(power_out, 8)}


# ── integrated photonics ─────────────────────────────────────────────────────
def mach_zehnder(*, phase_diff: float, loss: float = 0.0) -> dict:
    """Mach–Zehnder interferometer output: I = cos²(Δφ/2), with optional loss.
    The basic photonic switch/modulator."""
    t = (1 - loss) * math.cos(phase_diff / 2) ** 2
    return {"transmission": round(t, 6), "bar_port": round(t, 6),
            "cross_port": round((1 - loss) - t, 6)}


def microring(*, radius_um: float, n_group: float, wavelength_nm: float, q_factor: float) -> dict:
    """Microring resonator: free spectral range FSR = λ²/(n_g·2πR) and linewidth
    Δλ = λ/Q."""
    circ_um = 2 * math.pi * radius_um
    lam_um = wavelength_nm / 1000
    fsr_nm = (lam_um ** 2 / (n_group * circ_um)) * 1000
    linewidth_nm = wavelength_nm / q_factor
    return {"fsr_nm": round(fsr_nm, 5), "linewidth_nm": round(linewidth_nm, 6),
            "finesse": round(fsr_nm / linewidth_nm, 3) if linewidth_nm else math.inf}


def phase_shifter_drift(*, phase0: float, temp_delta: float, dphi_dt: float = 0.01) -> float:
    """Thermo-optic phase-shifter drift with temperature."""
    return round(phase0 + dphi_dt * temp_delta, 6)


def optical_loss_budget(*, components_db: list[float], margin_db: float = 3.0) -> dict:
    """Sum a link's component losses + margin (real link budgeting)."""
    total = sum(components_db) + margin_db
    return {"total_loss_db": round(total, 4), "components": len(components_db)}


# ── photodetection / optical computing ───────────────────────────────────────
def photodetector(*, optical_power: float, responsivity: float = 0.8,
                  bandwidth: float = 1e9, load: float = 50.0) -> dict:
    """Photodetector: photocurrent I = R·P and shot-noise-limited SNR."""
    q = 1.602176634e-19
    i_photo = responsivity * optical_power
    i_shot = math.sqrt(2 * q * i_photo * bandwidth) if i_photo > 0 else 0.0
    snr = (i_photo / i_shot) if i_shot > 0 else math.inf
    return {"photocurrent": i_photo, "shot_noise_current": i_shot,
            "snr": round(snr, 4) if math.isfinite(snr) else None}


def optical_matrix_multiply(matrix: list[list[float]], vector: list[float]) -> dict:
    """Real matrix-vector multiply — the operation a photonic mesh performs
    optically. This is the actual linear algebra a photonic neural layer does."""
    M = np.array(matrix, float)
    v = np.array(vector, float)
    out = M @ v
    return {"output": [round(float(x), 6) for x in out], "dim": list(M.shape)}


def photonic_neural_layer(weights: list[list[float]], inputs: list[float], *,
                          bias: list[float] | None = None) -> dict:
    """A photonic neural layer: optical matrix-multiply + nonlinear activation
    (ReLU). The real computation a photonic accelerator implements."""
    M = np.array(weights, float)
    x = np.array(inputs, float)
    z = M @ x + (np.array(bias) if bias else 0.0)
    a = np.maximum(0.0, z)                          # ReLU
    return {"activations": [round(float(v), 6) for v in a]}


# ── canonical-named feature entry points (real optics) ───────────────────────
def reflection_model(*, n1: float, n2: float, theta_deg: float = 0.0) -> dict:
    """Fresnel reflection: at normal incidence R = ((n1−n2)/(n1+n2))²."""
    r_normal = ((n1 - n2) / (n1 + n2)) ** 2
    return {"reflectance_normal": round(r_normal, 6),
            "transmittance_normal": round(1 - r_normal, 6)}


def prism_spectroscopy(*, n_red: float, n_blue: float, apex_deg: float = 60.0) -> dict:
    """Prism spectroscopy: angular dispersion between red and blue from the
    difference in refractive index (thin-prism deviation δ ≈ (n−1)A)."""
    a = math.radians(apex_deg)
    dev_red = (n_red - 1) * a
    dev_blue = (n_blue - 1) * a
    return {"deviation_red_deg": round(math.degrees(dev_red), 4),
            "deviation_blue_deg": round(math.degrees(dev_blue), 4),
            "angular_dispersion_deg": round(math.degrees(dev_blue - dev_red), 5)}


def microscope_optics(*, wavelength_nm: float, numerical_aperture: float) -> dict:
    """Microscope optics: Abbe diffraction-limited resolution d = λ/(2·NA)."""
    d = wavelength_nm / (2 * numerical_aperture) if numerical_aperture > 0 else math.inf
    return {"resolution_nm": round(d, 4)}


def telescope_optics(*, aperture_m: float, wavelength_nm: float) -> dict:
    """Telescope optics: Rayleigh angular resolution θ = 1.22 λ/D (radians)."""
    theta = 1.22 * (wavelength_nm * 1e-9) / aperture_m if aperture_m > 0 else math.inf
    return {"angular_resolution_rad": theta, "arcsec": round(math.degrees(theta) * 3600, 5)}


def fibre_optics(*, n_core: float, n_clad: float, power_in: float = 1.0,
                 length_km: float = 1.0, alpha_db_per_km: float = 0.2) -> dict:
    """Fibre-optics path: numerical aperture + attenuated output power."""
    na = fibre_numerical_aperture(n_core=n_core, n_clad=n_clad)
    att = fibre_attenuation(power_in=power_in, length_km=length_km, alpha_db_per_km=alpha_db_per_km)
    return {**na, **att}


def microring_resonator(*, radius_um: float, n_group: float, wavelength_nm: float,
                        q_factor: float) -> dict:
    """Microring-resonator model (FSR, linewidth, finesse)."""
    return microring(radius_um=radius_um, n_group=n_group,
                     wavelength_nm=wavelength_nm, q_factor=q_factor)


def photodetector_noise(*, optical_power: float, responsivity: float = 0.8,
                        bandwidth: float = 1e9) -> dict:
    """Photodetector-noise model: shot-noise current + SNR."""
    return photodetector(optical_power=optical_power, responsivity=responsivity,
                         bandwidth=bandwidth)
