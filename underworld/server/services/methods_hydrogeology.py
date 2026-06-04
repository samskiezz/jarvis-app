"""Real hydrogeology / groundwater simulations.

Each function is a distinct, named scientific method (not a shared engine reused),
implemented with numpy/scipy and verified against a KNOWN published value in the
companion tests. Domains: Darcy flux, Theis transient well drawdown, hydraulic
conductivity / intrinsic permeability conversion, Dupuit-Forchheimer steady well
discharge, contaminant advection-dispersion (retardation), aquifer storativity
volume, Hazen empirical K from grain size, and seepage (linear pore) velocity.

References are cited inline per method. Values are SI unless stated.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.special import exp1  # exponential integral E1 == Theis well function W(u)

# ── Physical constants (SI) ───────────────────────────────────────────────────
G_EARTH = 9.80665           # standard gravity, m/s^2
RHO_WATER = 1000.0          # fresh water density (~4 C), kg/m^3
MU_WATER_20C = 1.002e-3     # dynamic viscosity of water at 20 C, Pa.s
DARCY_M2 = 9.869233e-13     # 1 darcy in m^2 (CGP definition)
EULER_GAMMA = 0.5772156649015329


# ── 1. Darcy's law: groundwater specific discharge (flux) ─────────────────────
def darcy_flux(*, hydraulic_conductivity: float = 1.0e-4,
               head_drop_m: float = 1.0,
               length_m: float = 100.0,
               area_m2: float | None = None) -> dict:
    """Darcy's law for saturated porous flow: the specific discharge (Darcy flux)

        q = -K * dh/dl     [m/s]

    where K is hydraulic conductivity and dh/dl the hydraulic gradient. The
    volumetric flow is Q = q * A. Sign: flow is down-gradient (from high to low
    head), so a positive head DROP over the path gives positive flux.

    KNOWN: K=1e-4 m/s over a gradient of 1 m per 100 m (i=0.01) gives a Darcy
    flux q = 1e-6 m/s (= K*i). Through A=1 m^2 that is Q = 1e-6 m^3/s.

    Ref: Darcy's law (Wikipedia); q = -K dh/dl.
    """
    gradient = head_drop_m / length_m
    flux = hydraulic_conductivity * gradient          # m/s (magnitude, down-gradient)
    out = {
        "hydraulic_conductivity_m_s": hydraulic_conductivity,
        "head_drop_m": head_drop_m,
        "length_m": length_m,
        "hydraulic_gradient": gradient,
        "darcy_flux_m_s": flux,
        "darcy_flux_m_day": flux * 86400.0,
    }
    if area_m2 is not None:
        out["area_m2"] = area_m2
        out["volumetric_flow_m3_s"] = flux * area_m2
        out["volumetric_flow_m3_day"] = flux * area_m2 * 86400.0
    return out


# ── 2. Theis transient drawdown to a well in a confined aquifer ───────────────
def theis_drawdown(*, pumping_rate_m3_s: float = 0.01,
                   transmissivity_m2_s: float = 0.0023,
                   storativity: float = 1.0e-4,
                   radius_m: float = 100.0,
                   time_s: float = 86400.0) -> dict:
    """Theis (1935) transient drawdown s for radial flow to a fully penetrating
    well in a confined aquifer:

        s = Q / (4 pi T) * W(u),      u = r^2 S / (4 T t),

    where W(u) is the Theis well function (the exponential integral E1(u)), T the
    transmissivity, S the storativity, r the radial distance and t the time since
    pumping started.

    KNOWN: the well function is the exponential integral; the standard table gives
    W(u=0.01) = 4.0379 and W(1.0) = 0.2194 (Fetter, Applied Hydrogeology;
    Abramowitz & Stegun). For small u the Cooper-Jacob approximation
    W(u) -> -gamma - ln(u) holds.

    Ref: Theis equation (Wikipedia / KGS); W(u) = E1(u).
    """
    u = radius_m ** 2 * storativity / (4.0 * transmissivity_m2_s * time_s)
    well_function = float(exp1(u))                    # W(u) = E1(u)
    drawdown = pumping_rate_m3_s / (4.0 * math.pi * transmissivity_m2_s) * well_function
    cooper_jacob_w = -EULER_GAMMA - math.log(u)       # small-u approximation
    return {
        "pumping_rate_m3_s": pumping_rate_m3_s,
        "transmissivity_m2_s": transmissivity_m2_s,
        "storativity": storativity,
        "radius_m": radius_m,
        "time_s": time_s,
        "u": u,
        "well_function_W": well_function,
        "cooper_jacob_W_approx": cooper_jacob_w,
        "drawdown_m": drawdown,
    }


def theis_well_function(u: float) -> float:
    """Theis well function W(u) = exponential integral E1(u). Exposed standalone
    so the KNOWN tabulated values can be checked directly.

    KNOWN: W(0.01) = 4.0379, W(0.1) = 1.8229, W(1.0) = 0.2194.
    """
    return float(exp1(u))


# ── 3. Hydraulic conductivity <-> intrinsic permeability conversion ───────────
def conductivity_permeability(*, hydraulic_conductivity_m_s: float | None = 1.0e-4,
                              permeability_m2: float | None = None,
                              rho: float = RHO_WATER,
                              mu: float = MU_WATER_20C,
                              g: float = G_EARTH) -> dict:
    """Convert between hydraulic conductivity K (m/s) and intrinsic permeability
    k (m^2), which depend on the fluid only through rho, g, mu:

        K = k * rho * g / mu          k = K * mu / (rho * g)

    KNOWN: for water at ~20 C, rho*g/mu ~= 9.8e6 ~ 1e7 (m.s)^-1, so K=1e-4 m/s
    corresponds to k ~= 1e-11 m^2 ~= 10 darcy (1 darcy = 9.87e-13 m^2).

    Ref: Hydraulic conductivity (Wikipedia); K = k rho g / mu.
    """
    factor = rho * g / mu                              # (m.s)^-1
    if permeability_m2 is None:
        permeability_m2 = hydraulic_conductivity_m_s / factor
    else:
        hydraulic_conductivity_m_s = permeability_m2 * factor
    return {
        "hydraulic_conductivity_m_s": hydraulic_conductivity_m_s,
        "permeability_m2": permeability_m2,
        "permeability_darcy": permeability_m2 / DARCY_M2,
        "conversion_factor_per_m_s": factor,
        "rho": rho,
        "mu": mu,
        "g": g,
    }


# ── 4. Dupuit-Forchheimer steady discharge to a well (unconfined aquifer) ─────
def dupuit_well_discharge(*, hydraulic_conductivity: float = 1.0e-4,
                          head_at_r2_m: float = 20.0,
                          head_at_r1_m: float = 15.0,
                          r2_m: float = 200.0,
                          r1_m: float = 10.0) -> dict:
    """Dupuit-Forchheimer steady-state discharge to a fully penetrating well in an
    unconfined aquifer (Dupuit assumptions: horizontal flow, gradient = slope of
    the water table):

        Q = pi * K * (h2^2 - h1^2) / ln(r2 / r1)

    where h1, h2 are saturated thicknesses (heads above the aquifer base) at radii
    r1 (well) and r2 (outer observation point).

    KNOWN: Q rises with K, with the difference of squared heads, and falls with
    the log of the radius ratio; doubling K exactly doubles Q.

    Ref: Dupuit-Forchheimer / Thiem equation for unconfined aquifers.
    """
    discharge = (math.pi * hydraulic_conductivity
                 * (head_at_r2_m ** 2 - head_at_r1_m ** 2)
                 / math.log(r2_m / r1_m))
    return {
        "hydraulic_conductivity_m_s": hydraulic_conductivity,
        "head_at_r2_m": head_at_r2_m,
        "head_at_r1_m": head_at_r1_m,
        "r2_m": r2_m,
        "r1_m": r1_m,
        "discharge_m3_s": discharge,
        "discharge_m3_day": discharge * 86400.0,
    }


# ── 5. Contaminant advection-dispersion transport & retardation factor ────────
def contaminant_transport(*, seepage_velocity_m_s: float = 1.0e-6,
                          dispersivity_m: float = 10.0,
                          bulk_density_kg_m3: float = 1800.0,
                          porosity: float = 0.3,
                          distribution_coeff_m3_kg: float = 1.0e-4,
                          distance_m: float = 100.0) -> dict:
    """One-dimensional advection-dispersion transport of a sorbing solute. Linear
    equilibrium sorption gives the retardation factor

        R = 1 + (rho_b / n) * Kd,

    which slows the contaminant front: its velocity is v_c = v_seepage / R. The
    longitudinal dispersion coefficient is D_L = alpha_L * v_seepage.

    KNOWN: rho_b=1800 kg/m^3, n=0.3, Kd=1e-4 m^3/kg (0.1 mL/g) -> R = 1.6, so the
    plume moves at 1/1.6 = 0.625x the water velocity.

    Ref: Advection-dispersion equation; R = 1 + (rho_b/n) Kd (Fetter).
    """
    retardation = 1.0 + (bulk_density_kg_m3 / porosity) * distribution_coeff_m3_kg
    contaminant_velocity = seepage_velocity_m_s / retardation
    dispersion_coeff = dispersivity_m * seepage_velocity_m_s
    arrival_water_s = distance_m / seepage_velocity_m_s
    arrival_contaminant_s = distance_m / contaminant_velocity
    return {
        "seepage_velocity_m_s": seepage_velocity_m_s,
        "dispersivity_m": dispersivity_m,
        "bulk_density_kg_m3": bulk_density_kg_m3,
        "porosity": porosity,
        "distribution_coeff_m3_kg": distribution_coeff_m3_kg,
        "retardation_factor": retardation,
        "contaminant_velocity_m_s": contaminant_velocity,
        "dispersion_coefficient_m2_s": dispersion_coeff,
        "arrival_time_water_s": arrival_water_s,
        "arrival_time_contaminant_s": arrival_contaminant_s,
    }


# ── 6. Aquifer storativity: volume of water released from storage ─────────────
def aquifer_storage_volume(*, storativity: float = 1.0e-4,
                           area_m2: float = 1.0e6,
                           head_change_m: float = 1.0,
                           specific_yield: float | None = 0.2,
                           confined: bool = True) -> dict:
    """Volume of water released from (or taken into) aquifer storage per unit
    decline in head:

        V = S * A * dh        (confined: S = storativity / storage coefficient)
        V = Sy * A * dh       (unconfined / water-table: Sy = specific yield)

    The storage coefficient S relates the water volume released to the head change
    over a horizontal area A.

    KNOWN: a confined aquifer with S=1e-4 over A=1 km^2 (1e6 m^2) releases only
    V = 100 m^3 per 1 m of head drop, whereas an unconfined aquifer draining its
    pores at Sy=0.2 releases V = 2e5 m^3 — ~2000x more.

    Ref: Specific storage / storativity / specific yield (Wikipedia).
    """
    coeff = storativity if confined else (specific_yield if specific_yield is not None else storativity)
    volume = coeff * area_m2 * head_change_m
    return {
        "storativity": storativity,
        "specific_yield": specific_yield,
        "confined": confined,
        "storage_coefficient_used": coeff,
        "area_m2": area_m2,
        "head_change_m": head_change_m,
        "volume_released_m3": volume,
    }


# ── 7. Hazen empirical hydraulic conductivity from grain size ─────────────────
def hazen_conductivity(*, d10_mm: float = 0.5, hazen_coefficient: float = 100.0,
                       temperature_c: float | None = None) -> dict:
    """Hazen (1892) empirical estimate of hydraulic conductivity for loose,
    uniform sand from the effective grain size d10:

        K = C * d10^2        (K in cm/s, d10 in cm, C ~ 100 default)

    Hazen is applicable for d10 ~0.1-3.0 mm and uniformity coefficient < 5. With
    d10 expressed in mm and C~1 (mm form), K (cm/s) = C_mm * d10_mm^2 — here we use
    the classic C~100 with d10 in cm.

    KNOWN: medium sand d10=0.5 mm = 0.05 cm with C=100 gives K = 100*0.05^2 =
    0.25 cm/s = 2.5e-3 m/s — a typical clean-sand value.

    Ref: Hazen formula (Hydraulic conductivity, Wikipedia); K = C d10^2.
    """
    d10_cm = d10_mm / 10.0
    k_cm_s = hazen_coefficient * d10_cm ** 2
    return {
        "d10_mm": d10_mm,
        "d10_cm": d10_cm,
        "hazen_coefficient": hazen_coefficient,
        "conductivity_cm_s": k_cm_s,
        "conductivity_m_s": k_cm_s / 100.0,
        "conductivity_m_day": k_cm_s / 100.0 * 86400.0,
    }


# ── 8. Seepage (linear pore) velocity = Darcy flux / porosity ─────────────────
def seepage_velocity(*, darcy_flux_m_s: float = 1.0e-6,
                     porosity: float = 0.25) -> dict:
    """Average linear (seepage) velocity of water through the pores:

        v = q / n_e

    The Darcy flux q is the discharge per unit total cross-sectional area; the
    actual water moves faster because it flows only through the connected pore
    space (effective porosity n_e), so v > q always.

    KNOWN: q=1e-6 m/s through n=0.25 gives a seepage velocity v = 4e-6 m/s
    (4x the Darcy flux) — the speed at which a tracer actually travels.

    Ref: Seepage velocity / Darcy velocity (Wikipedia); v = q / n.
    """
    velocity = darcy_flux_m_s / porosity
    return {
        "darcy_flux_m_s": darcy_flux_m_s,
        "porosity": porosity,
        "seepage_velocity_m_s": velocity,
        "seepage_velocity_m_day": velocity * 86400.0,
        "velocity_ratio": velocity / darcy_flux_m_s,
    }
