"""Real seismology simulations.

Each function is a distinct, named seismological method (not a shared engine
reused), implemented with numpy/scipy/math and verified against a KNOWN published
or analytically exact value in the companion tests. Domains: earthquake
magnitude scales (Richter ML, moment Mw, energy), frequency-magnitude statistics
(Gutenberg-Richter b-value), wave physics (body-wave velocities from elastic
moduli, P/S travel-time distance), aftershock decay (modified Omori law), and
epicenter location by time-difference trilateration.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_seismology.py.

Unit conventions: seismic moment M0 in N*m (SI); velocities in km/s unless an
SI helper is noted; energy in joules; distances in km.
"""
from __future__ import annotations

import math

import numpy as np


# ── 1. Richter local magnitude ML ─────────────────────────────────────────────
def richter_local_magnitude(amplitude_mm: float, epicentral_distance_km: float) -> dict:
    """Richter (1935) local magnitude from a Wood-Anderson trace amplitude:
        ML = log10(A) - log10(A0(delta)) = log10(A) + 2.76*log10(delta) - 2.48
    using the Hutton & Boore (1987) Southern California calibration of the
    -log10(A0) attenuation function, with A in millimetres and delta the
    epicentral distance in km.
    KNOWN: Richter's original definition anchors ML=3 to A=1 mm (1000 nm on a
    Wood-Anderson) at delta=100 km; the Hutton-Boore -log10(A0)=3.0 at 100 km
    reproduces ML=3.0 for a 1 mm trace at 100 km.

    Ref: Richter (1935) BSSA 25:1; Hutton & Boore (1987) BSSA 77:6,
         -log10(A0) = 1.110*log10(delta/100) + 0.00189*(delta-100) + 3.0.
    """
    A = float(amplitude_mm)
    delta = float(epicentral_distance_km)
    # Hutton-Boore (1987) Southern California attenuation function:
    minus_log_A0 = 1.110 * math.log10(delta / 100.0) + 0.00189 * (delta - 100.0) + 3.0
    ml = math.log10(A) + minus_log_A0
    return {
        "ML": ml,
        "minus_log10_A0": minus_log_A0,
        "amplitude_mm": A,
        "epicentral_distance_km": delta,
    }


# ── 2. Moment magnitude Mw (Hanks-Kanamori) ────────────────────────────────────
def moment_magnitude(seismic_moment_nm: float) -> dict:
    """Moment magnitude from scalar seismic moment M0 (in N*m, SI):
        Mw = (2/3) * (log10(M0) - 9.1)
    equivalently Mw = (2/3)*log10(M0_dyne_cm) - 10.7 (since 1 N*m = 1e7 dyn*cm).
    KNOWN: M0 = 1.0e22 N*m  ->  Mw = (2/3)*(22 - 9.1) = 8.6 (a great earthquake,
    e.g. the size class of the 1906 San Francisco event ~ Mw 7.9, while
    M0 = 6.3e16 N*m gives Mw ~ 5.1).

    Ref: Hanks & Kanamori (1979) JGR 84:B5, 2348-2350; USGS/IASPEI SI form.
    """
    m0 = float(seismic_moment_nm)
    if m0 <= 0.0:
        raise ValueError("seismic moment must be positive")
    mw = (2.0 / 3.0) * (math.log10(m0) - 9.1)
    m0_dyne_cm = m0 * 1.0e7
    return {
        "Mw": mw,
        "seismic_moment_nm": m0,
        "seismic_moment_dyne_cm": m0_dyne_cm,
        "log10_M0_nm": math.log10(m0),
    }


# ── 3. Gutenberg-Richter b-value (Aki-Utsu maximum likelihood) ─────────────────
def gutenberg_richter_b_value(magnitudes: list, mc: float | None = None,
                              delta_m: float = 0.1) -> dict:
    """Maximum-likelihood b-value of the Gutenberg-Richter law log10(N) = a - b*M
    via the Aki (1965) / Utsu (1965) estimator with Utsu's binning correction:
        b = log10(e) / (mean(M) - (Mc - dM/2))
    where the mean is taken over events above the completeness magnitude Mc and
    dM is the magnitude bin width. The a-value is recovered from the total count.
    KNOWN: a synthetic catalogue drawn from an exponential (truncated) magnitude
    distribution with true b=1.0 returns b ~ 1.0; for the textbook tectonic value
    b is near unity.

    Ref: Aki (1965) Bull. Earthq. Res. Inst. 43:237; Utsu (1965); Bender (1983)
         BSSA 73:831 for the dM/2 binning correction.
    """
    m = np.asarray(magnitudes, dtype=float)
    if mc is None:
        mc = float(np.min(m))
    sel = m[m >= mc - 1e-12]
    n = sel.size
    if n < 2:
        raise ValueError("need at least 2 events at or above Mc")
    mean_m = float(np.mean(sel))
    denom = mean_m - (mc - delta_m / 2.0)
    b = math.log10(math.e) / denom
    # a-value so that log10(N>=Mc) = a - b*Mc  ->  a = log10(N) + b*Mc
    a = math.log10(n) + b * mc
    # Shi & Bolt (1982) standard error of b
    var_m = float(np.sum((sel - mean_m) ** 2)) / (n * (n - 1))
    b_err = 2.30 * b ** 2 * math.sqrt(var_m)
    return {
        "b_value": b,
        "a_value": a,
        "mc": float(mc),
        "n_events": int(n),
        "mean_magnitude": mean_m,
        "b_std_error": b_err,
    }


# ── 4. P-S travel-time difference -> epicentral distance ───────────────────────
def ps_travel_time_distance(ts_minus_tp_s: float, vp_km_s: float = 6.0,
                            vs_km_s: float = 3.5) -> dict:
    """Epicentral distance from the S-minus-P arrival-time difference, assuming
    a single homogeneous layer with constant Vp and Vs (straight-ray):
        d = (ts - tp) * (Vp*Vs) / (Vp - Vs)
    because (ts - tp) = d/Vs - d/Vp = d*(Vp - Vs)/(Vp*Vs).
    KNOWN: the classic crustal rule of thumb d_km ~= 8 * (ts - tp) follows for
    Vp ~ 8 km/s, Vs ~ 4.62 km/s (Vp/Vs ~ 1.73); with Vp=6.0, Vs=3.5 the factor
    is 6*3.5/(6-3.5) = 8.4 km per second of S-P delay.

    Ref: standard travel-time location, e.g. Stein & Wysession (2003)
         "An Introduction to Seismology", Eq. for S-P interval.
    """
    dt = float(ts_minus_tp_s)
    vp, vs = float(vp_km_s), float(vs_km_s)
    if vp <= vs:
        raise ValueError("Vp must exceed Vs")
    factor = (vp * vs) / (vp - vs)
    d = dt * factor
    return {
        "epicentral_distance_km": d,
        "ts_minus_tp_s": dt,
        "vp_km_s": vp,
        "vs_km_s": vs,
        "km_per_second_factor": factor,
        "vp_vs_ratio": vp / vs,
    }


# ── 5. Body-wave velocities from elastic moduli ────────────────────────────────
def body_wave_velocities(bulk_modulus_pa: float, shear_modulus_pa: float,
                         density_kg_m3: float) -> dict:
    """P- and S-wave (body-wave) velocities of an isotropic elastic solid from
    its bulk modulus K, shear modulus mu and density rho:
        Vp = sqrt((K + 4/3 * mu) / rho)
        Vs = sqrt(mu / rho)
    KNOWN: granite (K ~ 55 GPa, mu ~ 35 GPa, rho ~ 2700 kg/m^3) gives
    Vp ~ 5.9 km/s and Vs ~ 3.6 km/s, in the published range for granite.

    Ref: elastic-wave theory, Aki & Richards "Quantitative Seismology"; the
         Poisson-solid limit (K = 5/3 mu) gives Vp/Vs = sqrt(3) ~ 1.732.
    """
    K = float(bulk_modulus_pa)
    mu = float(shear_modulus_pa)
    rho = float(density_kg_m3)
    if rho <= 0.0:
        raise ValueError("density must be positive")
    vp = math.sqrt((K + 4.0 / 3.0 * mu) / rho)
    vs = math.sqrt(mu / rho) if mu > 0.0 else 0.0
    return {
        "vp_m_s": vp,
        "vs_m_s": vs,
        "vp_km_s": vp / 1000.0,
        "vs_km_s": vs / 1000.0,
        "vp_vs_ratio": (vp / vs) if vs > 0.0 else math.inf,
    }


# ── 6. Modified Omori law aftershock decay ─────────────────────────────────────
def omori_aftershock_rate(t_days: float, K: float, c_days: float,
                          p: float = 1.0) -> dict:
    """Aftershock occurrence rate from the modified Omori-Utsu law:
        n(t) = K / (t + c)^p
    the rate of aftershocks at time t after the mainshock. The cumulative number
    up to time T is its integral:
        N(T) = K/(1-p) * [ (T+c)^(1-p) - c^(1-p) ]   (p != 1)
        N(T) = K * [ ln(T+c) - ln(c) ]               (p == 1)
    KNOWN: for p=1 the decay is hyperbolic (classic Omori 1894); doubling
    (t+c) halves the rate; Utsu's typical decay exponent p ~ 1.0-1.4.

    Ref: Omori (1894) J. Coll. Sci. Imp. Univ. Tokyo 7:111;
         Utsu (1961) Geophys. Mag. 30:521 (modified Omori law).
    """
    t = float(t_days)
    Kc = float(K)
    c = float(c_days)
    pp = float(p)
    rate = Kc / (t + c) ** pp
    if abs(pp - 1.0) < 1e-12:
        cumulative = Kc * (math.log(t + c) - math.log(c))
    else:
        cumulative = Kc / (1.0 - pp) * ((t + c) ** (1.0 - pp) - c ** (1.0 - pp))
    return {
        "rate_per_day": rate,
        "cumulative_count": cumulative,
        "t_days": t,
        "K": Kc,
        "c_days": c,
        "p": pp,
    }


# ── 7. Seismic energy release from magnitude ───────────────────────────────────
def energy_from_magnitude(magnitude: float) -> dict:
    """Radiated seismic energy from magnitude via the Gutenberg-Richter (1956)
    energy-magnitude relation:
        log10(E) = 1.5*Ms + 4.8     (E in joules)
    A one-unit magnitude increase raises energy by 10^1.5 ~= 31.6.
    KNOWN: Ms = 0 -> E = 10^4.8 ~= 6.31e4 J; Ms = 8 -> log10(E) = 16.8,
    E ~= 6.31e16 J; the energy ratio between consecutive magnitudes is
    10^1.5 = 31.6228.

    Ref: Gutenberg & Richter (1956) Ann. Geofis. 9:1; USGS energy form
         log10(E_joules) = 1.5*M + 4.8.
    """
    m = float(magnitude)
    log10_e = 1.5 * m + 4.8
    energy_j = 10.0 ** log10_e
    return {
        "energy_joules": energy_j,
        "log10_energy_joules": log10_e,
        "energy_tnt_tons": energy_j / 4.184e9,   # 1 ton TNT = 4.184e9 J
        "magnitude": m,
    }


# ── 8. Epicenter location by 3-station S-P trilateration ───────────────────────
def epicenter_trilateration(stations: list, sp_times_s: list,
                            vp_km_s: float = 6.0, vs_km_s: float = 3.5) -> dict:
    """Locate an epicenter from three (or more) stations using the S-minus-P
    interval at each as a range observation. Each S-P time converts to an
    epicentral distance d_i = (Vp*Vs)/(Vp-Vs) * (ts-tp)_i; the epicenter is then
    the point whose distances match, found by subtracting one circle equation
    from the others to linearise and solving the least-squares system with numpy:
        |X - S_i|^2 = d_i^2   ->   2*(S_i - S_0).X = d_i_sq_diff   (linearised)
    KNOWN: with exact S-P times generated from a known epicenter and station
    geometry, the true (x, y) location is recovered to numerical precision.

    Ref: classic 3-circle epicentre location (S-P method); linearised
         least-squares trilateration (cf. GNSS pseudorange inversion).
    """
    S = np.asarray(stations, dtype=float)
    dt = np.asarray(sp_times_s, dtype=float)
    n, dim = S.shape
    if n < 3:
        raise ValueError("need at least 3 stations for epicentre location")
    factor = (vp_km_s * vs_km_s) / (vp_km_s - vs_km_s)
    d = dt * factor  # epicentral distances (km)
    s0 = S[0]
    A = 2.0 * (S[1:] - s0)
    b = (d[0] ** 2 - d[1:] ** 2
         - np.sum(s0 ** 2) + np.sum(S[1:] ** 2, axis=1))
    sol, residuals, rank, _ = np.linalg.lstsq(A, b, rcond=None)
    range_err = np.sqrt(np.sum((S - sol) ** 2, axis=1)) - d
    return {
        "epicenter": sol.tolist(),
        "distances_km": d.tolist(),
        "km_per_second_factor": factor,
        "n_stations": int(n),
        "rank": int(rank),
        "max_range_residual_km": float(np.max(np.abs(range_err))),
        "rms_range_residual_km": float(np.sqrt(np.mean(range_err ** 2))),
    }
