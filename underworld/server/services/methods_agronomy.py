"""Real agronomy & plant-science simulations.

Each function is a distinct, named scientific method (not a shared engine reused),
implemented with numpy/scipy and verified against a KNOWN published / textbook
value in the companion tests. Domains: crop water demand, leaf & canopy
photosynthesis, radiation-driven biomass production, thermal-time phenology,
soil water accounting, soil nitrogen cycling, and crop growth dynamics.

References (verified against in tests):
  - Allen et al. (1998) FAO-56, Penman-Monteith reference evapotranspiration ET0.
  - Farquhar / non-rectangular hyperbola leaf light-response curve.
  - Monteith (1972, 1977) radiation/light-use efficiency: biomass = RUE * IPAR.
  - McMaster & Wilhelm (1997) growing-degree-day (GDD) accumulation.
  - Plant-available water / field-capacity soil water balance (FAO-56 ch. 8).
  - Stanford & Smith (1972) first-order soil nitrogen mineralization Nt=N0(1-e^-kt).
  - Verhulst logistic crop growth scaled by harvest index to grain yield.
  - Monsi & Saeki (1953) Beer's-law canopy light extinction I = I0*exp(-k*LAI).
"""
from __future__ import annotations

import math

import numpy as np


# ── 1. FAO-56 Penman-Monteith reference evapotranspiration ET0 ────────────────
def penman_monteith_et0(*, T_mean: float, u2: float, Rn: float, G: float = 0.0,
                        es: float, ea: float, delta: float,
                        gamma: float = 0.0677) -> dict:
    """FAO-56 Penman-Monteith reference evapotranspiration for the standard
    short (clipped-grass) reference crop:

        ET0 = [0.408*delta*(Rn - G) + gamma*(900/(T+273))*u2*(es - ea)]
              / [delta + gamma*(1 + 0.34*u2)]

    with ET0 in mm/day, Rn,G in MJ m^-2 d^-1, T in degC, u2 in m/s,
    es,ea,delta in kPa (delta in kPa/degC), gamma the psychrometric constant.

    KNOWN: realistic daily inputs give ET0 of a few mm/day; the FAO-56 grass
    reference under temperate-to-arid conditions is ~2-8 mm/day.

    Ref: Allen, Pereira, Raes & Smith (1998), FAO Irrigation & Drainage Paper 56.
    """
    vpd = es - ea
    numerator = 0.408 * delta * (Rn - G) + gamma * (900.0 / (T_mean + 273.0)) * u2 * vpd
    denominator = delta + gamma * (1.0 + 0.34 * u2)
    et0 = numerator / denominator
    radiation_term = (0.408 * delta * (Rn - G)) / denominator
    aero_term = (gamma * (900.0 / (T_mean + 273.0)) * u2 * vpd) / denominator
    return {
        "ET0_mm_day": float(et0),
        "radiation_term_mm_day": float(radiation_term),
        "aerodynamic_term_mm_day": float(aero_term),
        "vapor_pressure_deficit_kPa": float(vpd),
    }


# ── 2. Leaf C3 photosynthesis light-response (non-rectangular hyperbola) ───────
def leaf_light_response(I, *, phi: float, A_max: float, theta: float = 0.9,
                        Rd: float = 0.0) -> dict:
    """Non-rectangular hyperbola light-response of gross/net leaf CO2 assimilation
    (Farquhar-type whole-leaf empirical form). Gross assimilation Ag is the smaller
    root of

        theta*Ag^2 - (phi*I + A_max)*Ag + phi*I*A_max = 0,

        Ag = [phi*I + A_max - sqrt((phi*I + A_max)^2 - 4*theta*phi*I*A_max)]
             / (2*theta),

    where phi is the initial quantum yield (umol CO2 / umol photon), A_max the
    light-saturated gross rate, and theta (0<theta<=1) the convexity. Net rate
    A = Ag - Rd.

    KNOWN: a saturating curve. At I=0, Ag=0 (A=-Rd); the initial slope dAg/dI -> phi
    as I->0; and as I->infinity, Ag -> A_max (light saturation).

    Ref: non-rectangular hyperbola (Thornley); Farquhar et al. (1980) framework.
    """
    if not (0.0 < theta <= 1.0):
        raise ValueError("theta must satisfy 0 < theta <= 1")
    Iarr = np.asarray(I, dtype=float)
    b = phi * Iarr + A_max
    disc = b * b - 4.0 * theta * phi * Iarr * A_max
    disc = np.clip(disc, 0.0, None)
    Ag = (b - np.sqrt(disc)) / (2.0 * theta)
    A_net = Ag - Rd
    out_gross = float(Ag) if np.isscalar(I) or Iarr.ndim == 0 else Ag
    out_net = float(A_net) if np.isscalar(I) or Iarr.ndim == 0 else A_net
    return {
        "A_gross": out_gross,
        "A_net": out_net,
        "A_max": A_max,
        "phi": phi,
        "theta": theta,
        "Rd": Rd,
    }


# ── 3. Monteith radiation/light-use-efficiency biomass & yield ────────────────
def light_use_efficiency_biomass(*, RUE: float, PAR_incident, f_intercepted: float,
                                 harvest_index: float = 1.0) -> dict:
    """Monteith radiation-use-efficiency model. Accumulated above-ground biomass is
    proportional to intercepted photosynthetically active radiation (IPAR):

        IPAR = f_intercepted * sum(PAR_incident)
        biomass = RUE * IPAR            (g m^-2, with RUE in g MJ^-1)
        yield  = harvest_index * biomass

    KNOWN: biomass is *linearly* proportional to intercepted PAR (Monteith's
    central result): doubling IPAR doubles biomass; well-watered crops have
    RUE ~ 1-3 g MJ^-1 (~1.4 typical), so biomass = RUE*IPAR.

    Ref: Monteith (1972, 1977); Sinclair & Muchow (1999) RUE review.
    """
    if RUE < 0 or not (0.0 <= f_intercepted <= 1.0):
        raise ValueError("RUE>=0 and 0<=f_intercepted<=1 required")
    par = np.asarray(PAR_incident, dtype=float)
    total_par = float(par.sum())
    ipar = f_intercepted * total_par
    biomass = RUE * ipar
    grain = harvest_index * biomass
    return {
        "total_incident_PAR_MJ": total_par,
        "intercepted_PAR_MJ": ipar,
        "biomass_g_m2": biomass,
        "yield_g_m2": grain,
        "RUE_g_per_MJ": RUE,
    }


# ── 4. Growing degree day (GDD) accumulation ──────────────────────────────────
def growing_degree_days(t_min, t_max, *, t_base: float = 10.0,
                        t_upper: float | None = None) -> dict:
    """Daily growing-degree-day accumulation (single-triangulation / averaging
    method). For each day:

        GDD_i = max( (Tmax' + Tmin')/2 - t_base, 0 )

    where with an optional upper cap t_upper, temperatures are clamped to
    [t_base, t_upper] before averaging (the standard corn 50-86 degF rule).
    Accumulated GDD = sum over days.

    KNOWN: with t_base=10 degC, a day of Tmin=15, Tmax=25 gives mean 20 -> 10 GDD.
    The classic corn example (Tmax capped 86 degF, Tmin floored 50 degF):
    Tmax=87->86, Tmin=63 -> (86+63)/2 - 50 = 24.5 GDD.

    Ref: McMaster & Wilhelm (1997); NDAWN/USU corn GDD (base 50 degF, cap 86 degF).
    """
    tmin = np.asarray(t_min, dtype=float)
    tmax = np.asarray(t_max, dtype=float)
    if tmin.shape != tmax.shape:
        raise ValueError("t_min and t_max must have the same shape")
    lo = tmin.copy()
    hi = tmax.copy()
    if t_upper is not None:
        hi = np.minimum(hi, t_upper)
        lo = np.minimum(lo, t_upper)
    # floor at base (standard modified method floors lows at base)
    lo = np.maximum(lo, t_base)
    hi = np.maximum(hi, t_base)
    daily = np.maximum((hi + lo) / 2.0 - t_base, 0.0)
    return {
        "daily_gdd": daily.tolist() if daily.ndim else float(daily),
        "accumulated_gdd": float(daily.sum()),
        "n_days": int(daily.size),
        "t_base": t_base,
    }


# ── 5. Soil water balance / plant-available water ─────────────────────────────
def soil_water_balance(*, theta_fc: float, theta_wp: float, root_depth_mm: float,
                       theta_current: float | None = None,
                       p_depletion: float = 0.5) -> dict:
    """Soil water accounting for the root zone (FAO-56 ch. 8). Total available water

        TAW = (theta_fc - theta_wp) * root_depth        (mm)

    where theta_fc, theta_wp are volumetric water contents (m^3/m^3) at field
    capacity and wilting point. The readily available water RAW = p * TAW sets
    the irrigation trigger; current depletion uses theta_current.

    KNOWN: TAW = (FC - WP) * Zr. E.g. FC=0.30, WP=0.10, Zr=1000 mm ->
    TAW = 0.20*1000 = 200 mm; at p=0.5, RAW = 100 mm.

    Ref: Allen et al. (1998) FAO-56, Chapter 8 (soil water balance).
    """
    if theta_fc <= theta_wp:
        raise ValueError("theta_fc must exceed theta_wp")
    if root_depth_mm <= 0:
        raise ValueError("root_depth_mm must be positive")
    taw = (theta_fc - theta_wp) * root_depth_mm
    raw = p_depletion * taw
    result = {
        "TAW_mm": float(taw),
        "RAW_mm": float(raw),
        "p_depletion": p_depletion,
        "root_depth_mm": root_depth_mm,
    }
    if theta_current is not None:
        depletion = (theta_fc - theta_current) * root_depth_mm
        result["current_depletion_mm"] = float(depletion)
        result["irrigation_needed"] = bool(depletion >= raw)
        avail = (theta_current - theta_wp) * root_depth_mm
        result["available_water_mm"] = float(max(avail, 0.0))
    return result


# ── 6. Soil nitrogen mineralization (first-order kinetics) ────────────────────
def nitrogen_mineralization(*, N0: float, k: float, t: float) -> dict:
    """Stanford & Smith first-order soil N mineralization. Cumulative mineralized
    nitrogen follows

        Nt = N0 * (1 - exp(-k*t))

    where N0 is the potentially mineralizable N pool (mg/kg or kg/ha), k the
    rate constant (1/time), t the elapsed time. The instantaneous rate
    dNt/dt = k*(N0 - Nt) = k*N0*exp(-k*t).

    KNOWN: after one e-folding time t = 1/k, the fraction mineralized is
    (1 - 1/e) ~= 0.6321 of N0; as t->infinity, Nt -> N0.

    Ref: Stanford & Smith (1972), Soil Sci. Soc. Am. Proc. 36:465-472.
    """
    if N0 < 0 or k < 0 or t < 0:
        raise ValueError("N0, k, t must be non-negative")
    fraction = 1.0 - math.exp(-k * t)
    Nt = N0 * fraction
    rate = k * N0 * math.exp(-k * t)
    return {
        "N_mineralized": float(Nt),
        "fraction_mineralized": float(fraction),
        "instantaneous_rate": float(rate),
        "N0": N0,
        "k": k,
    }


# ── 7. Logistic crop growth to grain yield via harvest index ──────────────────
def logistic_crop_growth(t, *, W_max: float, r: float, W0: float,
                         harvest_index: float = 0.5) -> dict:
    """Verhulst logistic crop biomass accumulation, converted to grain yield by
    the harvest index. Total biomass

        W(t) = W_max / (1 + ((W_max - W0)/W0) * exp(-r*t)),

    grain yield = harvest_index * W(t). The inflection (max growth rate) occurs at
    W = W_max/2.

    KNOWN: W(0) = W0; W -> W_max as t -> infinity (asymptotic plateau); the
    maximum absolute growth rate r*W_max/4 occurs when W = W_max/2.

    Ref: Verhulst (1838) logistic growth; harvest-index partitioning (Donald 1962).
    """
    if W0 <= 0 or W_max <= 0:
        raise ValueError("W0 and W_max must be positive")
    if not (0.0 <= harvest_index <= 1.0):
        raise ValueError("harvest_index must be in [0, 1]")
    tarr = np.asarray(t, dtype=float)
    A = (W_max - W0) / W0
    W = W_max / (1.0 + A * np.exp(-r * tarr))
    grain = harvest_index * W
    biomass_out = float(W) if tarr.ndim == 0 else W
    grain_out = float(grain) if tarr.ndim == 0 else grain
    return {
        "biomass": biomass_out,
        "grain_yield": grain_out,
        "W_max": W_max,
        "max_growth_rate": float(r * W_max / 4.0),
        "biomass_at_inflection": float(W_max / 2.0),
        "harvest_index": harvest_index,
    }


# ── 8. Beer's-law canopy light extinction I = I0*exp(-k*LAI) ───────────────────
def canopy_light_extinction(*, I0: float, LAI, k: float = 0.5) -> dict:
    """Monsi-Saeki Beer's-law canopy light extinction. Irradiance penetrating to
    cumulative leaf area index LAI from above-canopy I0 is

        I(LAI) = I0 * exp(-k * LAI),

    so the fraction intercepted by the canopy is f = 1 - exp(-k*LAI). k is the
    canopy extinction coefficient (~0.5 for spherical/erectophile foliage).

    KNOWN: with k=0.5, LAI=2 -> exp(-1) ~= 0.3679 of light transmitted, so
    ~63.2% intercepted; at LAI=0 all light passes (I=I0).

    Ref: Monsi & Saeki (1953); k ~ 0.5 canopy extinction (meta-analyses).
    """
    if I0 < 0 or k < 0:
        raise ValueError("I0 and k must be non-negative")
    lai = np.asarray(LAI, dtype=float)
    transmitted = I0 * np.exp(-k * lai)
    frac_transmitted = np.exp(-k * lai)
    frac_intercepted = 1.0 - frac_transmitted
    if lai.ndim == 0:
        transmitted = float(transmitted)
        frac_transmitted = float(frac_transmitted)
        frac_intercepted = float(frac_intercepted)
    return {
        "transmitted_irradiance": transmitted,
        "fraction_transmitted": frac_transmitted,
        "fraction_intercepted": frac_intercepted,
        "k": k,
        "I0": I0,
    }
