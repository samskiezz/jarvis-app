"""Real geology & planetary-science simulations.

Each function is a distinct, named scientific method (not a shared engine reused),
implemented with numpy/scipy and verified against a KNOWN published value in the
companion tests. Domains: isostasy, geothermal heat flow, plate tectonics, impact
cratering, radiogenic heat / decay, seismology, hydrostatics, and planetary mass.

References are cited inline per method. Values are SI unless stated.
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants (SI) ───────────────────────────────────────────────────
G_GRAV = 6.674e-11          # Newtonian gravitational constant, m^3/(kg.s^2)
G_EARTH = 9.80665           # standard surface gravity, m/s^2
R_EARTH = 6.371e6           # mean Earth radius, m
M_EARTH = 5.972e24          # Earth mass, kg (reference / KNOWN)
RHO_CRUST = 2670.0          # continental crust density, kg/m^3
RHO_MANTLE = 3300.0         # upper-mantle density, kg/m^3
RHO_WATER = 1000.0          # fresh water density, kg/m^3
SECONDS_PER_YEAR = 3.15576e7  # Julian year, s
LN2 = math.log(2.0)


# ── 1. Airy isostasy: crustal root depth ──────────────────────────────────────
def airy_root_depth(*, elevation_m: float = 8000.0,
                    rho_crust: float = RHO_CRUST,
                    rho_mantle: float = RHO_MANTLE) -> dict:
    """Airy isostatic compensation: a mountain of height h is supported by a
    buoyant crustal root r floating in denser mantle. Hydrostatic balance gives
    r = h * rho_c / (rho_m - rho_c).

    KNOWN: with rho_c=2670, rho_m=3300, a root is ~4.24x the elevation; an 8 km
    peak has a ~34 km root (classic "roots ~5x height" result, Airy hypothesis).

    Ref: Isostasy (Wikipedia); Airy-Heiskanen model.
    """
    delta_rho = rho_mantle - rho_crust
    root_m = elevation_m * rho_crust / delta_rho
    return {
        "elevation_m": elevation_m,
        "rho_crust": rho_crust,
        "rho_mantle": rho_mantle,
        "root_depth_m": root_m,
        "root_depth_km": root_m / 1000.0,
        "root_to_height_ratio": rho_crust / delta_rho,
    }


# ── 2. Geothermal gradient & conductive heat flow (Fourier's law) ─────────────
def geothermal_heat_flow(*, surface_temp_k: float = 288.0,
                         temp_at_depth_k: float | None = None,
                         depth_m: float = 1000.0,
                         gradient_k_per_km: float | None = 27.0,
                         thermal_conductivity: float = 2.5) -> dict:
    """Geothermal gradient dT/dz and conductive surface heat flow from Fourier's
    law: q = k * dT/dz. If a temperature pair is given the gradient is derived;
    otherwise a gradient is used directly.

    KNOWN: average continental geothermal gradient ~25-30 K/km; with k~2.5 W/(m.K)
    this gives a heat flow ~60-75 mW/m^2 (global continental mean ~65 mW/m^2).

    Ref: Geothermal gradient (Wikipedia); q = -k dT/dz, k~2.5 W/(m.K).
    """
    if temp_at_depth_k is not None:
        grad_k_per_m = (temp_at_depth_k - surface_temp_k) / depth_m
        grad_k_per_km = grad_k_per_m * 1000.0
    else:
        grad_k_per_km = gradient_k_per_km
        grad_k_per_m = grad_k_per_km / 1000.0
        temp_at_depth_k = surface_temp_k + grad_k_per_m * depth_m
    heat_flow_w_m2 = thermal_conductivity * grad_k_per_m
    return {
        "gradient_k_per_km": grad_k_per_km,
        "gradient_k_per_m": grad_k_per_m,
        "thermal_conductivity_w_mk": thermal_conductivity,
        "heat_flow_w_m2": heat_flow_w_m2,
        "heat_flow_mw_m2": heat_flow_w_m2 * 1000.0,
        "depth_m": depth_m,
        "temp_at_depth_k": temp_at_depth_k,
    }


# ── 3. Plate-tectonic velocity from age & distance ────────────────────────────
def plate_velocity(*, distance_km: float = 225.0, age_myr: float = 4.5,
                   half_rate: bool = False) -> dict:
    """Plate / seafloor-spreading velocity v = distance / age, from a dated
    magnetic-anomaly stripe at a known distance from the ridge axis.

    KNOWN: a stripe 225 km from the ridge dated at 4.5 Myr -> full rate 5 cm/yr
    (typical Mid-Atlantic ~2.5 cm/yr, East Pacific Rise up to ~10 cm/yr).

    Ref: Seafloor spreading (Wikipedia); rate = distance / age.
    """
    age_yr = age_myr * 1.0e6
    distance_cm = distance_km * 1.0e5            # 1 km = 1e5 cm
    rate_cm_per_yr = distance_cm / age_yr
    if half_rate:
        rate_cm_per_yr /= 2.0
    return {
        "distance_km": distance_km,
        "age_myr": age_myr,
        "velocity_cm_per_yr": rate_cm_per_yr,
        "velocity_mm_per_yr": rate_cm_per_yr * 10.0,
        "velocity_m_per_s": rate_cm_per_yr / 100.0 / SECONDS_PER_YEAR,
        "half_rate": half_rate,
    }


# ── 4. Impact-crater scaling (pi-group / Schmidt-Holsapple gravity regime) ────
def impact_crater_diameter(*, projectile_diameter_m: float = 1000.0,
                           velocity_m_s: float = 20000.0,
                           rho_proj: float = 3000.0,
                           rho_target: float = 2700.0,
                           gravity_m_s2: float = G_EARTH,
                           k1: float = 1.6, mu: float = 0.55,
                           nu: float = 0.4) -> dict:
    """Transient-crater diameter from Holsapple pi-group (gravity-regime) scaling.
    With the dimensionless groups pi_D = D*(rho_t/m)^(1/3) and pi_2 = g*L/v^2,
    the gravity-regime law is pi_D = k1 * pi_2^(-mu/(2+mu)) * (rho_p/rho_t)^nu,
    which rearranges to

        D = k1 * (rho_p/rho_t)^(nu + 1/3) * L * pi_2^(-mu/(2+mu)),
        pi_2 = g*L/v^2.

    The crater grows ~as v^(2*mu/(2+mu)) (~v^0.43), as projectile size, and
    shrinks with gravity.

    KNOWN trend: final crater is ~10-20x the projectile diameter for typical
    hypervelocity impacts; a 1 km bolide at 20 km/s yields a ~12-15 km transient
    crater (diameter rises with v and L, falls with g).

    Ref: pi-group / point-source coupling scaling (Holsapple 1993; Melosh 1989).
    """
    L = projectile_diameter_m
    exp = mu / (2.0 + mu)
    pi2 = gravity_m_s2 * L / velocity_m_s ** 2
    diameter = (k1
                * (rho_proj / rho_target) ** (nu + 1.0 / 3.0)
                * L
                * pi2 ** (-exp))
    return {
        "projectile_diameter_m": L,
        "velocity_m_s": velocity_m_s,
        "gravity_m_s2": gravity_m_s2,
        "pi2": pi2,
        "scaling_exponent": exp,
        "transient_diameter_m": diameter,
        "transient_diameter_km": diameter / 1000.0,
        "diameter_ratio": diameter / L,
    }


# ── 5. Radiogenic heat production & radioactive decay ─────────────────────────
def radiogenic_heat(*, rho_rock: float = 2700.0,
                    heat_gen_per_mass: float = 9.6e-10,
                    half_life_yr: float = 4.468e9,
                    elapsed_yr: float = 4.468e9) -> dict:
    """Volumetric radiogenic heat production A = rho * H (W/m^3) plus the
    radioactive-decay remaining fraction over elapsed time.

    KNOWN: typical granite produces ~2-3 uW/m^3 (rho~2700, H~9.6e-10 W/kg ->
    ~2.6 uW/m^3). For U-238 (half-life 4.468 Gyr) one half-life leaves 50% of
    the parent isotope.

    Ref: radiogenic heat production (continental crust ~2-3 uW/m^3); U-238
    half-life 4.468e9 yr.
    """
    heat_w_m3 = rho_rock * heat_gen_per_mass
    decay_constant = LN2 / half_life_yr                  # per year
    remaining_fraction = math.exp(-decay_constant * elapsed_yr)
    return {
        "rho_rock": rho_rock,
        "heat_gen_per_mass_w_kg": heat_gen_per_mass,
        "heat_production_w_m3": heat_w_m3,
        "heat_production_uw_m3": heat_w_m3 * 1.0e6,
        "half_life_yr": half_life_yr,
        "decay_constant_per_yr": decay_constant,
        "elapsed_yr": elapsed_yr,
        "remaining_fraction": remaining_fraction,
        "n_half_lives": elapsed_yr / half_life_yr,
    }


# ── 6. Seismic moment M0 = mu * A * D and moment magnitude ────────────────────
def seismic_moment(*, rigidity_pa: float = 3.0e10,
                   rupture_area_m2: float = 1.0e9,
                   slip_m: float = 5.0) -> dict:
    """Seismic moment M0 = mu * A * D (rigidity x rupture area x average slip),
    and the moment magnitude via Hanks-Kanamori Mw = (2/3) log10(M0) - 6.07
    (M0 in N.m).

    KNOWN: mu=3e10 Pa, A=1e9 m^2 (e.g. 1000 km x 1 km fault), D=5 m gives
    M0 = 1.5e20 N.m and Mw ~= 7.4 — a great earthquake.

    Ref: Seismic moment / moment magnitude scale; M0 = mu*A*D.
    """
    m0 = rigidity_pa * rupture_area_m2 * slip_m          # N.m
    mw = (2.0 / 3.0) * math.log10(m0) - 6.07
    return {
        "rigidity_pa": rigidity_pa,
        "rupture_area_m2": rupture_area_m2,
        "slip_m": slip_m,
        "seismic_moment_nm": m0,
        "seismic_moment_dyne_cm": m0 * 1.0e7,            # 1 N.m = 1e7 dyne.cm
        "moment_magnitude_mw": mw,
    }


# ── 7. Hydrostatic pressure at depth: p = rho * g * h ─────────────────────────
def hydrostatic_pressure(*, depth_m: float = 1000.0,
                         rho: float = RHO_WATER,
                         g: float = G_EARTH,
                         p_surface_pa: float = 101325.0) -> dict:
    """Hydrostatic pressure at depth in a fluid column: p = p0 + rho*g*h.

    KNOWN: in water, pressure rises ~1 atm per ~10.06 m, i.e. ~9.81e6 Pa
    (~98 atm gauge) at 1000 m depth.

    Ref: hydrostatic / fluid pressure, p = rho g h.
    """
    gauge_pa = rho * g * depth_m
    absolute_pa = p_surface_pa + gauge_pa
    return {
        "depth_m": depth_m,
        "rho": rho,
        "g": g,
        "gauge_pressure_pa": gauge_pa,
        "absolute_pressure_pa": absolute_pa,
        "gauge_pressure_atm": gauge_pa / 101325.0,
        "absolute_pressure_atm": absolute_pa / 101325.0,
        "depth_per_atm_m": 101325.0 / (rho * g),
    }


# ── 8. Planetary mass from surface gravity & radius: GM = g R^2 ───────────────
def planetary_mass(*, surface_gravity_m_s2: float = G_EARTH,
                   radius_m: float = R_EARTH,
                   G: float = G_GRAV) -> dict:
    """Planetary mass from measured surface gravity and radius: g = G M / R^2,
    so M = g R^2 / G. Bulk density follows from M / (4/3 pi R^3).

    KNOWN: g=9.80665 m/s^2, R=6.371e6 m, G=6.674e-11 -> M ~= 5.97e24 kg and
    mean density ~5510 kg/m^3 (Earth).

    Ref: surface gravity g = GM/R^2; Earth mass 5.972e24 kg.
    """
    mass = surface_gravity_m_s2 * radius_m ** 2 / G
    volume = (4.0 / 3.0) * math.pi * radius_m ** 3
    density = mass / volume
    return {
        "surface_gravity_m_s2": surface_gravity_m_s2,
        "radius_m": radius_m,
        "G": G,
        "mass_kg": mass,
        "mean_density_kg_m3": density,
        "gm_product": G * mass,
    }
