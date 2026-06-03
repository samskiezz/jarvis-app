"""Forestry & dendrology — real mensuration / growth / carbon models from the
canonical equations. Researched and verified against KNOWN published values.

Sources & known values
-----------------------
1. Tree volume / taper — Smalian's log rule  V = (A1+A2)/2 · L  (BC Timber
   Scaling Manual ch.4). A right cone of base area A and length L has true
   volume A·L/3; Smalian (apex A2=0) gives A·L/2 — a known +50% overestimate
   for full taper, the textbook caveat.
2. Biomass allometry  AGB = exp(b0 + b1·ln D)  (Jenkins et al. 2003,
   *Forest Sci.* 49:12-35). Softwood-pine group: b0=-2.5356, b1=2.4349 →
   power-law exponent ≈ 2.43 (the verified "~2.4").
3. Tree growth — von Bertalanffy / Chapman-Richards  Y(t)=A·(1-e^{-k t})^p.
   As t→∞, Y→A (the asymptote). Verified: at large t the height equals A.
4. Carbon sequestration — C = biomass·0.47 (IPCC carbon fraction),
   CO2 = C·44/12 = C·3.667 (molar mass ratio). Verified both factors.
5. Stand density index / self-thinning — Reineke (1933):
   log10 N = -1.605·log10 D ; SDI = N·(D/25)^1.605 (metric 25-cm reference).
   Yoda -3/2 power law of self-thinning: mean biomass ∝ N^(-3/2).
6. Site index — Chapman-Richards height-age curve referenced to a base age;
   site index = stand dominant height at the reference age (e.g. 50 yr).
7. Basal area  BA = π·D²/4  (cross-sectional area of the stem at DBH).
8. Light interception — Beer's law in a canopy  I/I0 = exp(-k·LAI),
   extinction coefficient k≈0.5 for spherical leaf-angle distribution.
"""
from __future__ import annotations

import math

# ---- physical / standard constants -----------------------------------------
CARBON_FRACTION = 0.47          # IPCC dry-biomass carbon fraction
CO2_PER_C = 44.0 / 12.0         # ≈ 3.6667  (molar mass CO2 / C)
REINEKE_SLOPE = -1.605          # Reineke self-thinning exponent
REINEKE_REF_D_CM = 25.0         # metric SDI reference quadratic mean diameter
YODA_SLOPE = -1.5               # -3/2 self-thinning law

# Jenkins et al. (2003) pine-group softwood AGB coefficients (kg, dbh in cm)
JENKINS_PINE = {"b0": -2.5356, "b1": 2.4349}


# 1 -------------------------------------------------------------------------
def tree_volume(*, d1_cm: float, d2_cm: float, length_m: float) -> dict:
    """Smalian's log-volume rule from two end diameters (cm) and length (m).

    A_i = π·d_i²/4 (converted to m²); V = (A1+A2)/2 · L.  Also reports the
    cone-frustum comparison used to flag excessive taper.
    """
    a1 = math.pi * (d1_cm / 100.0) ** 2 / 4.0      # m²
    a2 = math.pi * (d2_cm / 100.0) ** 2 / 4.0      # m²
    v_smalian = (a1 + a2) / 2.0 * length_m
    # true frustum (paraboloid-free cone section) for reference
    r1, r2 = d1_cm / 200.0, d2_cm / 200.0          # radii in m
    v_cone_frustum = math.pi * length_m / 3.0 * (r1 * r1 + r1 * r2 + r2 * r2)
    return {
        "area_large_m2": round(a1, 6),
        "area_small_m2": round(a2, 6),
        "volume_m3": round(v_smalian, 6),
        "cone_frustum_m3": round(v_cone_frustum, 6),
        "smalian_overestimate_pct": round(
            (v_smalian - v_cone_frustum) / v_cone_frustum * 100.0, 3)
        if v_cone_frustum else 0.0,
    }


# 2 -------------------------------------------------------------------------
def biomass_allometry(*, dbh_cm: float, b0: float = JENKINS_PINE["b0"],
                      b1: float = JENKINS_PINE["b1"]) -> dict:
    """Above-ground biomass via power-law allometry AGB = exp(b0 + b1·ln D).

    Equivalent to AGB = a·D^b with a=exp(b0), b=b1.  Default = Jenkins (2003)
    softwood-pine group (exponent ≈ 2.43 ≈ 2.4).
    """
    ln_agb = b0 + b1 * math.log(dbh_cm)
    agb = math.exp(ln_agb)
    return {
        "agb_kg": round(agb, 4),
        "exponent_b": round(b1, 4),
        "coefficient_a": round(math.exp(b0), 8),
    }


# 3 -------------------------------------------------------------------------
def tree_growth(*, t_years: float, asymptote: float, k: float,
                p: float = 1.0, t0: float = 0.0) -> dict:
    """Chapman-Richards / von Bertalanffy growth Y = A·(1-e^{-k(t-t0)})^p.

    p=1 is the classic von Bertalanffy (monomolecular) form.  Y→A as t→∞.
    Returns the current size and the rel. fraction of the asymptote reached.
    """
    base = 1.0 - math.exp(-k * (t_years - t0))
    base = max(base, 0.0)
    y = asymptote * (base ** p)
    return {
        "size": round(y, 6),
        "asymptote": round(asymptote, 6),
        "fraction_of_asymptote": round(y / asymptote, 6) if asymptote else 0.0,
    }


# 4 -------------------------------------------------------------------------
def carbon_sequest(*, biomass_kg: float,
                   carbon_fraction: float = CARBON_FRACTION) -> dict:
    """Carbon stock and CO2-equivalent from dry biomass.

    C = biomass·CF ;  CO2 = C·(44/12).
    """
    carbon = biomass_kg * carbon_fraction
    co2 = carbon * CO2_PER_C
    return {
        "carbon_kg": round(carbon, 6),
        "co2_kg": round(co2, 6),
        "co2_per_carbon": round(CO2_PER_C, 6),
        "carbon_fraction": carbon_fraction,
    }


# 5 -------------------------------------------------------------------------
def self_thinning(*, trees_per_ha: float, qmd_cm: float,
                  ref_d_cm: float = REINEKE_REF_D_CM) -> dict:
    """Reineke's Stand Density Index and the self-thinning slopes.

    SDI = N·(D/D_ref)^1.605 .  Reineke's max-density line slope = -1.605
    (N vs D, log-log); Yoda's -3/2 law slope = -1.5 (biomass vs density).
    """
    sdi = trees_per_ha * (qmd_cm / ref_d_cm) ** (-REINEKE_SLOPE)
    return {
        "sdi": round(sdi, 3),
        "reineke_slope": REINEKE_SLOPE,
        "yoda_slope": YODA_SLOPE,
        "ref_diameter_cm": ref_d_cm,
    }


# 6 -------------------------------------------------------------------------
def site_index(*, height_m: float, age_years: float, base_age_years: float,
               k: float, p: float = 1.0) -> dict:
    """Site index = predicted dominant height at the reference (base) age,
    using a Chapman-Richards anamorphic projection.

    Fit asymptote A from the observed (height, age) given shape (k,p), then
    evaluate the curve at base_age:  SI = A·(1-e^{-k·base_age})^p.
    """
    cur = (1.0 - math.exp(-k * age_years)) ** p
    asymptote = height_m / cur
    ref = (1.0 - math.exp(-k * base_age_years)) ** p
    si = asymptote * ref
    return {
        "site_index_m": round(si, 4),
        "asymptote_m": round(asymptote, 4),
        "base_age_years": base_age_years,
    }


# 7 -------------------------------------------------------------------------
def basal_area(*, dbh_cm: float, trees_per_ha: float = 0.0) -> dict:
    """Stem cross-sectional (basal) area at DBH: BA = π·D²/4.

    Reports per-tree area in cm² and m², and optional stand BA (m²/ha).
    """
    ba_cm2 = math.pi * dbh_cm ** 2 / 4.0
    ba_m2 = ba_cm2 / 10000.0
    return {
        "basal_area_cm2": round(ba_cm2, 4),
        "basal_area_m2": round(ba_m2, 8),
        "stand_basal_area_m2_ha": round(ba_m2 * trees_per_ha, 6),
    }


# 8 -------------------------------------------------------------------------
def canopy_light(*, lai: float, incident: float = 1.0, k: float = 0.5) -> dict:
    """Beer's-law light interception through a canopy: I = I0·exp(-k·LAI).

    Returns transmitted fraction, transmitted light, and fraction intercepted.
    """
    transmittance = math.exp(-k * lai)
    transmitted = incident * transmittance
    return {
        "transmittance": round(transmittance, 8),
        "transmitted_light": round(transmitted, 8),
        "fraction_intercepted": round(1.0 - transmittance, 8),
        "extinction_k": k,
    }


# --- routing table: keyword tuples -> function ------------------------------
ROUTES = {
    ("tree_volume", "taper", "smalian", "log_volume"): tree_volume,
    ("biomass_allometry", "agb", "allometry"): biomass_allometry,
    ("tree_growth", "von_bertalanffy", "chapman_richards"): tree_growth,
    ("carbon_sequest", "carbon", "co2", "sequestration"): carbon_sequest,
    ("self_thinning", "stand_density", "sdi", "reineke"): self_thinning,
    ("site_index", "height_age"): site_index,
    ("basal_area", "dbh"): basal_area,
    ("canopy_light", "beer", "light_interception", "lai"): canopy_light,
    # domain-level fallbacks
    ("forestry",): biomass_allometry,
    ("dendrolog",): tree_growth,
    ("silvicultur",): self_thinning,
}


def route(keyword: str):
    """Resolve a keyword to a forestry method (substring/prefix match)."""
    kw = keyword.lower().strip()
    for keys, fn in ROUTES.items():
        for k in keys:
            if kw == k or kw.startswith(k) or k in kw:
                return fn
    return None
