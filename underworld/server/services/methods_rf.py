"""Real RF / antenna / microwave-link simulations.

Each function is a distinct, named RF-engineering method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: free-space
propagation (Friis transmission, free-space path loss), radar (range equation),
antennas (aperture gain / effective area, beamwidth & directivity), microwave
link budgets (EIRP, G/T, C/N), Doppler shift, and conductor skin depth.

UNITS CONVENTION (stated per function): distances in metres unless a function
says otherwise, frequencies in hertz unless a function says otherwise, power in
watts for linear functions and in dBW/dBm only where explicitly labelled, gains
as linear ratios for Friis/radar/aperture and in dBi only where labelled.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_rf.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants ────────────────────────────────────────────────────────
C_LIGHT = 299792458.0            # speed of light in vacuum, m/s (CODATA, exact)
MU0 = 4.0e-7 * math.pi           # vacuum permeability, H/m (classical value)
BOLTZMANN_DBW = -228.5991672     # 10*log10(k), k=1.380649e-23 J/K, in dBW/Hz/K
K_BOLTZMANN = 1.380649e-23       # Boltzmann constant, J/K (SI, exact)


def _to_db(x: float) -> float:
    """Power ratio -> decibels: 10*log10(x)."""
    return 10.0 * math.log10(x)


def _hz(freq_hz: float) -> float:
    return float(freq_hz)


# ── 1. Friis transmission equation ────────────────────────────────────────────
def friis_transmission(pt_w: float, gt: float, gr: float,
                       freq_hz: float, dist_m: float) -> dict:
    """Friis free-space transmission equation for received power.
        Pr = Pt * Gt * Gr * (lambda / (4*pi*d))^2,   lambda = c/f
    Gt, Gr are LINEAR gain ratios (not dBi); Pt, Pr in watts; d, lambda in m;
    f in Hz. The factor (lambda/(4*pi*d))^2 is the inverse free-space path loss.
    KNOWN: Pt=1 W, Gt=Gr=1 (isotropic), f=300 MHz (lambda=1 m), d=1000 m gives
        Pr = (1/(4*pi*1000))^2 = 6.333e-9 W (analytic).

    Ref: Friis, "A Note on a Simple Transmission Formula", Proc. IRE 34 (1946);
         Free-space path loss (Wikipedia).
    """
    lam = C_LIGHT / _hz(freq_hz)
    fs_factor = (lam / (4.0 * math.pi * dist_m)) ** 2   # free-space gain factor
    pr_w = pt_w * gt * gr * fs_factor
    return {
        "pr_w": pr_w,
        "pr_dbw": _to_db(pr_w),
        "pr_dbm": _to_db(pr_w) + 30.0,
        "wavelength_m": lam,
        "free_space_factor": fs_factor,          # = 1 / path-loss ratio
        "path_loss_ratio": 1.0 / fs_factor,
        "path_loss_db": -_to_db(fs_factor),
    }


# ── 2. Free-space path loss in dB ─────────────────────────────────────────────
def free_space_path_loss(dist_m: float, freq_hz: float) -> dict:
    """Free-space path loss (FSPL) in decibels.
        FSPL_dB = 20*log10(d) + 20*log10(f) + 20*log10(4*pi/c)
                = 20*log10(d_m) + 20*log10(f_Hz) - 147.55
    CONVENTION: d in METRES, f in HERTZ, constant = 20*log10(4*pi/c) = -147.55 dB.
    Equivalent popular forms: +32.45 dB (d in km, f in MHz) and +92.45 dB
    (d in km, f in GHz). FSPL is the inverse of the Friis free-space factor.
    KNOWN: d=1000 m, f=300 MHz -> 20log10(1e3)+20log10(3e8)-147.55 = 81.98 dB;
    d=1 km, f=1 GHz -> 92.45 dB (the standard +92.45 GHz/km reference value).

    Ref: Free-space path loss (Wikipedia); Friis (1946). Constant -147.55 dB
         derived from 20*log10(4*pi/299792458).
    """
    const = 20.0 * math.log10(4.0 * math.pi / C_LIGHT)   # = -147.552 dB
    fspl_db = 20.0 * math.log10(dist_m) + 20.0 * math.log10(_hz(freq_hz)) + const
    return {
        "fspl_db": fspl_db,
        "fspl_ratio": 10.0 ** (fspl_db / 10.0),
        "constant_db": const,
        "wavelength_m": C_LIGHT / _hz(freq_hz),
    }


# ── 3. Radar range equation ───────────────────────────────────────────────────
def radar_range_equation(pt_w: float, gain: float, rcs_m2: float,
                         freq_hz: float, *, dist_m: float | None = None,
                         pr_min_w: float | None = None) -> dict:
    """Monostatic radar range equation (Skolnik form, common Gt=Gr=G antenna).
        Pr = Pt * G^2 * lambda^2 * sigma / ((4*pi)^3 * R^4)
        R_max = [ Pt * G^2 * lambda^2 * sigma / ((4*pi)^3 * Pr_min) ]^(1/4)
    G is a LINEAR gain ratio; sigma is radar cross section in m^2; Pt, Pr in W;
    R, lambda in m; f in Hz. Provide dist_m to get received power, or pr_min_w to
    get maximum detection range (the 4th-root range law: 16x power -> 2x range).
    KNOWN: the received power scales as 1/R^4; doubling R drops Pr by 12.04 dB;
    a self-consistent (Pt,G,sigma,f) at R reproduces R_max when Pr_min=Pr(R).

    Ref: Skolnik, "Introduction to Radar Systems"; Radar range equation
         (radartutorial.eu). R_max = [PtG^2 lambda^2 sigma / ((4pi)^3 Pr_min)]^(1/4).
    """
    lam = C_LIGHT / _hz(freq_hz)
    num = pt_w * gain ** 2 * lam ** 2 * rcs_m2
    denom_const = (4.0 * math.pi) ** 3
    out: dict = {"wavelength_m": lam}
    if dist_m is not None:
        pr = num / (denom_const * dist_m ** 4)
        out["pr_w"] = pr
        out["pr_dbw"] = _to_db(pr)
        out["pr_dbm"] = _to_db(pr) + 30.0
    if pr_min_w is not None:
        r_max = (num / (denom_const * pr_min_w)) ** 0.25
        out["r_max_m"] = r_max
        out["r_max_km"] = r_max / 1000.0
    if dist_m is None and pr_min_w is None:
        raise ValueError("provide dist_m (for Pr) or pr_min_w (for R_max)")
    return out


# ── 4. Antenna gain from aperture & effective aperture ────────────────────────
def antenna_aperture_gain(area_m2: float, freq_hz: float,
                          *, efficiency: float = 1.0) -> dict:
    """Aperture-antenna gain from physical/effective area, and its inverse.
        G = 4*pi*Ae / lambda^2 ,   Ae = efficiency * A_phys
        Ae = G * lambda^2 / (4*pi)        (effective aperture from gain)
    G is a LINEAR ratio (also reported in dBi); area in m^2; f in Hz.
    KNOWN: Ae = 1 m^2 at lambda = 0.1 m (f = 2.997925 GHz) gives
        G = 4*pi*1/0.01 = 1256.64 (= 31.0 dBi), analytic.

    Ref: Balanis, "Antenna Theory"; effective aperture G = 4*pi*Ae/lambda^2
         (Wikipedia: Antenna aperture).
    """
    lam = C_LIGHT / _hz(freq_hz)
    ae = efficiency * area_m2
    gain = 4.0 * math.pi * ae / lam ** 2
    return {
        "gain": gain,
        "gain_dbi": _to_db(gain),
        "effective_aperture_m2": ae,
        "physical_area_m2": area_m2,
        "wavelength_m": lam,
        "efficiency": efficiency,
    }


# ── 5. Aperture beamwidth & directivity ───────────────────────────────────────
def aperture_beamwidth_directivity(diameter_m: float, freq_hz: float,
                                   *, k_beam: float = 70.0,
                                   efficiency: float = 1.0) -> dict:
    """Half-power beamwidth and directivity of a uniformly-illuminated circular
    aperture (e.g. a parabolic reflector).
        HPBW_deg ~= k_beam * lambda / D          (k ~ 58-70 deg, taper-dependent)
        D_lin    = efficiency * (pi * Diameter / lambda)^2   (aperture directivity)
    Diameter, lambda in m; f in Hz; HPBW in degrees; directivity a LINEAR ratio
    (also in dBi). For a circular aperture A = pi*(D/2)^2 the ideal directivity
    equals 4*pi*A/lambda^2 = (pi*D/lambda)^2, consistent with method 4.
    KNOWN: D/lambda = 10 -> HPBW ~= 7 deg (k=70); directivity = pi^2*100 = 986.96
        (= 29.94 dBi) at unit efficiency.

    Ref: Balanis, "Antenna Theory"; ITU/parabolic reflector HPBW ~ 70 lambda/D;
         aperture directivity D = 4*pi*A_eff/lambda^2.
    """
    lam = C_LIGHT / _hz(freq_hz)
    hpbw_deg = k_beam * lam / diameter_m
    directivity = efficiency * (math.pi * diameter_m / lam) ** 2
    # solid-angle estimate: Omega_A ~ HPBW_E * HPBW_H; D ~ 41253/HPBW^2 (deg^2)
    d_from_beam = 41253.0 / (hpbw_deg ** 2)
    return {
        "hpbw_deg": hpbw_deg,
        "hpbw_rad": math.radians(hpbw_deg),
        "directivity": directivity,
        "directivity_dbi": _to_db(directivity),
        "directivity_from_beamwidth": d_from_beam,
        "wavelength_m": lam,
    }


# ── 6. Microwave link budget (EIRP, path loss, G/T -> C/N) ────────────────────
def link_budget(pt_dbw: float, gt_dbi: float, gr_dbi: float,
                freq_hz: float, dist_m: float, bandwidth_hz: float,
                *, other_losses_db: float = 0.0,
                system_noise_temp_k: float = 290.0) -> dict:
    """End-to-end microwave link budget in decibels.
        EIRP   = Pt_dBW + Gt_dBi - losses
        C      = EIRP - FSPL + Gr_dBi               (received carrier, dBW)
        G/T    = Gr_dBi - 10log10(Tsys)             (figure of merit, dB/K)
        C/N0   = EIRP - FSPL + G/T - 10log10(k)     (carrier-to-noise-density, dBHz)
        C/N    = C/N0 - 10log10(B)                  (carrier-to-noise ratio, dB)
    Pt in dBW; gains/losses in dB; f in Hz; d in m; B in Hz; Tsys in kelvin.
    10log10(k) = -228.6 dBW/Hz/K (Boltzmann). Uses method 2 for the FSPL term.
    KNOWN: with Gr and Tsys fixed, C/N = EIRP - FSPL + G/T - 10log10(k) -
        10log10(B); halving B raises C/N by 3.01 dB; an isotropic 0 dBW link is
        self-consistent with the standalone Friis result.

    Ref: ITU-R; Sklar / Pratt-Bostian "Satellite Communications" link-budget
         eqns; G/T figure of merit; C/N0 = EIRP - L + G/T - k.
    """
    fspl_db = free_space_path_loss(dist_m, freq_hz)["fspl_db"]
    eirp_dbw = pt_dbw + gt_dbi - other_losses_db
    c_dbw = eirp_dbw - fspl_db + gr_dbi
    g_over_t = gr_dbi - 10.0 * math.log10(system_noise_temp_k)
    cn0_dbhz = eirp_dbw - fspl_db + g_over_t - BOLTZMANN_DBW
    cn_db = cn0_dbhz - 10.0 * math.log10(bandwidth_hz)
    noise_dbw = BOLTZMANN_DBW + 10.0 * math.log10(system_noise_temp_k) + \
        10.0 * math.log10(bandwidth_hz)
    return {
        "eirp_dbw": eirp_dbw,
        "fspl_db": fspl_db,
        "rx_carrier_dbw": c_dbw,
        "g_over_t_db_per_k": g_over_t,
        "cn0_dbhz": cn0_dbhz,
        "cn_db": cn_db,
        "noise_power_dbw": noise_dbw,
        "snr_db": c_dbw - noise_dbw,    # = cn_db, consistency cross-check
    }


# ── 7. Doppler shift of a moving RF source ────────────────────────────────────
def doppler_shift(freq_hz: float, radial_velocity_mps: float,
                  *, relativistic: bool = False) -> dict:
    """Doppler frequency shift for a radially moving RF source/observer.
    Classical (v << c), closing positive:
        f' = f * (1 + v/c),   delta_f = f * v/c
    Relativistic longitudinal (approaching, v>0):
        f' = f * sqrt((1 + beta)/(1 - beta)),   beta = v/c
    f in Hz; v in m/s (positive = approaching / closing). For RADAR (two-way,
    reflected) the shift is doubled: delta_f_radar = 2*f*v/c.
    KNOWN: f=1 GHz, v=300 m/s -> delta_f = 1e9*300/2.99792458e8 = 1000.69 Hz
        (classical, analytic); radar two-way shift = 2001.38 Hz.

    Ref: Doppler effect (Wikipedia); relativistic Doppler f'=f*sqrt((1+b)/(1-b));
         radar Doppler delta_f = 2 v f / c.
    """
    beta = radial_velocity_mps / C_LIGHT
    if relativistic:
        f_shifted = freq_hz * math.sqrt((1.0 + beta) / (1.0 - beta))
        delta_f = f_shifted - freq_hz
    else:
        delta_f = freq_hz * beta
        f_shifted = freq_hz + delta_f
    return {
        "delta_f_hz": delta_f,
        "shifted_freq_hz": f_shifted,
        "radar_two_way_delta_f_hz": 2.0 * freq_hz * beta,
        "beta": beta,
        "relativistic": relativistic,
    }


# ── 8. Skin depth in a conductor ──────────────────────────────────────────────
def skin_depth(freq_hz: float, conductivity_s_per_m: float,
               *, mu_r: float = 1.0) -> dict:
    """Electromagnetic skin depth in a good conductor.
        delta = sqrt( 2 / (omega * mu * sigma) ) = 1 / sqrt(pi * f * mu * sigma)
        omega = 2*pi*f,   mu = mu_r * mu0
    f in Hz; sigma in S/m; delta in m. Also returns the surface resistance
    Rs = 1/(sigma*delta) = sqrt(pi*f*mu/sigma) (ohms/square).
    KNOWN: copper sigma=5.96e7 S/m, mu_r=1 at f=60 Hz -> delta = 8.43 mm;
    at f=1 MHz -> delta = 65.2 um (standard textbook copper values).

    Ref: Skin effect / skin depth (Wikipedia); Jackson "Classical
         Electrodynamics"; delta = sqrt(2/(omega*mu*sigma)).
    """
    omega = 2.0 * math.pi * _hz(freq_hz)
    mu = mu_r * MU0
    delta = math.sqrt(2.0 / (omega * mu * conductivity_s_per_m))
    surface_resistance = 1.0 / (conductivity_s_per_m * delta)
    return {
        "skin_depth_m": delta,
        "skin_depth_um": delta * 1e6,
        "surface_resistance_ohm": surface_resistance,
        "angular_freq_rad_s": omega,
        "permeability_h_per_m": mu,
    }
