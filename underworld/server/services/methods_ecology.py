"""Real ecology & environmental-science simulations.

Each function is a distinct, named scientific method (not a shared engine reused),
implemented with numpy/scipy and verified against a KNOWN published value in the
companion tests. Domains: community ecology / biodiversity, biogeography,
biogeochemical cycling, food-web stability, population harvesting, nutrient
uptake kinetics, and sustainability / ecological footprint accounting.

References (verified against in tests):
  - Shannon (1948) / Simpson (1949) diversity indices.
  - Arrhenius (1921) species-area power law S = c * A^z; z ~ 0.20-0.35.
  - MacArthur & Wilson (1967) equilibrium theory of island biogeography.
  - Single-box first-order atmospheric CO2 perturbation decay.
  - May (1972) "Will a large complex system be stable?": sigma*sqrt(S*C) < 1.
  - Schaefer (1954) logistic surplus-production MSY = r*K/4 at B = K/2.
  - Michaelis & Menten (1913) saturating nutrient-uptake kinetics.
  - Wackernagel & Rees ecological-footprint / biocapacity accounting.
"""
from __future__ import annotations

import math

import numpy as np


# ── 1. Biodiversity: Shannon (H') and Simpson (D) indices ─────────────────────
def biodiversity_indices(counts) -> dict:
    """Shannon entropy H' = -sum(p_i ln p_i) and Simpson index from species
    abundance counts. Also returns Shannon evenness J = H'/ln(S) and the
    Gini-Simpson (1-D) and inverse-Simpson (1/D) forms.

    KNOWN: for a perfectly even community of S species, H' = ln(S) and
    evenness J = 1; Simpson D = 1/S so inverse-Simpson = S.

    Ref: Shannon (1948); Simpson (1949).
    """
    arr = np.asarray(counts, dtype=float)
    arr = arr[arr > 0]
    total = arr.sum()
    if total <= 0:
        raise ValueError("counts must contain positive abundances")
    p = arr / total
    S = int(arr.size)
    shannon = float(-np.sum(p * np.log(p)))
    evenness = shannon / math.log(S) if S > 1 else 0.0
    simpson_d = float(np.sum(p * p))            # Simpson's D = sum p_i^2
    return {
        "richness_S": S,
        "shannon_H": shannon,
        "shannon_evenness_J": evenness,
        "simpson_D": simpson_d,
        "gini_simpson_1_minus_D": 1.0 - simpson_d,
        "inverse_simpson_1_over_D": 1.0 / simpson_d,
    }


# ── 2. Species-area relationship S = c * A^z ──────────────────────────────────
def species_area_relationship(areas, species) -> dict:
    """Fit the Arrhenius power law S = c * A^z by linear regression in log-log
    space: ln S = ln c + z * ln A. Returns the slope z, intercept c, and the
    coefficient of determination r^2.

    KNOWN: the canonical species-area exponent z is ~0.25 (typically 0.20-0.35);
    a dataset generated from S = c*A^0.25 must recover z ~ 0.25 and r^2 ~ 1.

    Ref: Arrhenius (1921); Preston (1962); MacArthur & Wilson (1967).
    """
    A = np.asarray(areas, dtype=float)
    S = np.asarray(species, dtype=float)
    if A.size != S.size or A.size < 2:
        raise ValueError("need matching areas and species, n>=2")
    x = np.log(A)
    y = np.log(S)
    z, lnc = np.polyfit(x, y, 1)
    yhat = z * x + lnc
    ss_res = float(np.sum((y - yhat) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return {
        "z_exponent": float(z),
        "c_coefficient": float(math.exp(lnc)),
        "r_squared": r2,
        "predict_at_unit_area": float(math.exp(lnc)),
    }


# ── 3. Island biogeography equilibrium species number ─────────────────────────
def island_biogeography_equilibrium(*, P: int = 100, I_max: float = 1.0,
                                     E_max: float = 1.0) -> dict:
    """MacArthur-Wilson equilibrium: with linear rates immigration
    I(S) = I_max*(1 - S/P) and extinction E(S) = E_max*(S/P), the equilibrium
    species number S* solves I(S*) = E(S*):

        S* = P * I_max / (I_max + E_max),    turnover T* = I_max*E_max/(I_max+E_max).

    KNOWN: when I_max == E_max the immigration and extinction lines cross at the
    midpoint, so S* = P/2.

    Ref: MacArthur & Wilson (1967), The Theory of Island Biogeography.
    """
    s_star = P * I_max / (I_max + E_max)
    turnover = I_max * E_max / (I_max + E_max)
    return {
        "species_pool_P": P,
        "equilibrium_species_S_star": float(s_star),
        "turnover_rate_at_equilibrium": float(turnover),
        "immigration_at_eq": float(I_max * (1.0 - s_star / P)),
        "extinction_at_eq": float(E_max * (s_star / P)),
    }


# ── 4. Carbon-cycle box model / atmospheric CO2 perturbation decay ────────────
def carbon_box_decay(*, excess_ppm: float = 100.0, tau_years: float = 50.0,
                     t_years: float = 50.0) -> dict:
    """Single-box first-order relaxation of an atmospheric CO2 perturbation:
    dC/dt = -C/tau, so C(t) = C0 * exp(-t/tau). The e-folding time is tau and
    the half-life is t_half = tau * ln 2.

    KNOWN: after one e-folding time t = tau, the excess decays to C0/e
    (~36.8% remains); after one half-life t = tau*ln2, exactly half remains.

    Ref: first-order box-model relaxation; CO2 perturbation decay (IPCC AR5 8SM).
    """
    remaining = excess_ppm * math.exp(-t_years / tau_years)
    half_life = tau_years * math.log(2.0)
    return {
        "tau_years": tau_years,
        "half_life_years": half_life,
        "remaining_ppm": remaining,
        "fraction_remaining": remaining / excess_ppm,
        "fraction_at_one_tau": math.exp(-1.0),
    }


# ── 5. Food-web stability: May's criterion ────────────────────────────────────
def may_food_web_stability(*, S: int, C: float, sigma: float) -> dict:
    """May's (1972) local-stability criterion for a large random community.
    A randomly assembled web is almost surely stable iff the complexity

        sigma * sqrt(S * C) < 1

    where S is species richness, C is connectance, and sigma the s.d. of
    interaction strengths. The stability boundary is sigma_crit = 1/sqrt(S*C).

    KNOWN: at sigma*sqrt(S*C) = 1 the system is marginally stable; below 1 stable,
    above 1 unstable. E.g. S=25, C=0.4 -> sigma_crit = 1/sqrt(10) ~= 0.3162.

    Ref: May, R.M. (1972), "Will a large complex system be stable?", Nature.
    """
    if S < 1 or not (0.0 < C <= 1.0):
        raise ValueError("S>=1 and 0<C<=1 required")
    complexity = sigma * math.sqrt(S * C)
    sigma_crit = 1.0 / math.sqrt(S * C)
    return {
        "complexity_index": complexity,
        "sigma_critical": sigma_crit,
        "stable": bool(complexity < 1.0),
        "marginal": math.isclose(complexity, 1.0, abs_tol=1e-9),
    }


# ── 6. Logistic harvesting: maximum sustainable yield MSY = r*K/4 ─────────────
def maximum_sustainable_yield(*, r: float, K: float) -> dict:
    """Schaefer surplus-production model with logistic growth
    dN/dt = r*N*(1 - N/K) - h. Surplus production g(N) = r*N*(1-N/K) is maximised
    at the inflection point N = K/2, giving the maximum sustainable yield

        MSY = r*K/4,   at biomass B_MSY = K/2,   effort F_MSY = r/2.

    KNOWN: MSY = r*K/4 exactly. E.g. r=0.5, K=1000 -> MSY = 125 at B=500.

    Ref: Schaefer (1954); Gordon-Schaefer fisheries model.
    """
    msy = r * K / 4.0
    return {
        "r": r,
        "K": K,
        "MSY": msy,
        "B_MSY": K / 2.0,
        "F_MSY": r / 2.0,
    }


# ── 7. Nutrient cycling: Michaelis-Menten uptake kinetics ─────────────────────
def michaelis_menten_uptake(*, S: float, Vmax: float, Km: float) -> dict:
    """Saturating nutrient-uptake (Monod/Michaelis-Menten) kinetics:

        V(S) = Vmax * S / (Km + S).

    KNOWN: at substrate concentration S = Km the rate is exactly Vmax/2 (the
    half-saturation definition of Km); as S -> infinity, V -> Vmax.

    Ref: Michaelis & Menten (1913); Monod (1949) for microbial nutrient uptake.
    """
    if Km < 0 or Vmax < 0 or S < 0:
        raise ValueError("S, Vmax, Km must be non-negative")
    v = Vmax * S / (Km + S)
    return {
        "uptake_rate_V": v,
        "fraction_of_Vmax": v / Vmax if Vmax else 0.0,
        "rate_at_half_saturation": Vmax / 2.0,
        "Km": Km,
        "Vmax": Vmax,
    }


# ── 8. Ecological footprint / carrying capacity ───────────────────────────────
def ecological_footprint(*, footprint_per_capita_gha: float, population: float,
                         biocapacity_gha: float) -> dict:
    """Ecological-footprint accounting (Wackernagel & Rees). Total demand is
    footprint_per_capita * population (in global hectares, gha). The number of
    Earths required is total demand / available biocapacity, and the carrying
    capacity is the population the biocapacity can sustain at that footprint.

        earths_required = total_footprint / biocapacity
        carrying_capacity = biocapacity / footprint_per_capita

    KNOWN: when total demand exceeds supply by 75% (footprint = 1.75 * biocapacity)
    the planet is in overshoot at 1.75 Earths.

    Ref: Wackernagel & Rees (1996); Global Footprint Network.
    """
    if footprint_per_capita_gha <= 0 or biocapacity_gha <= 0:
        raise ValueError("footprint and biocapacity must be positive")
    total_footprint = footprint_per_capita_gha * population
    earths = total_footprint / biocapacity_gha
    carrying_capacity = biocapacity_gha / footprint_per_capita_gha
    return {
        "total_footprint_gha": total_footprint,
        "earths_required": earths,
        "carrying_capacity_people": carrying_capacity,
        "overshoot": bool(earths > 1.0),
        "biocapacity_per_capita_gha": biocapacity_gha / population if population else float("inf"),
    }
