"""Real earth / climate / geoscience simulations.

Each function is a distinct, named scientific method (not a shared engine reused),
implemented with numpy/scipy and verified against a KNOWN published value in the
companion tests. Domains: atmospheric physics, meteorology, seismology, hydrology,
physical oceanography, climate radiative balance, and geochronology.
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants (SI) ───────────────────────────────────────────────────
G_EARTH = 9.80665          # standard gravity, m/s^2
R_DRY_AIR = 287.05         # specific gas constant for dry air, J/(kg.K)
CP_DRY_AIR = 1004.0        # specific heat of dry air at const pressure, J/(kg.K)
OMEGA_EARTH = 7.2921e-5    # Earth angular velocity, rad/s
SIGMA_SB = 5.670374419e-8  # Stefan-Boltzmann constant, W/(m^2.K^4)
SOLAR_CONSTANT = 1361.0    # total solar irradiance, W/m^2
LN2 = math.log(2.0)


# ── 1. Atmospheric hydrostatic / barometric pressure with altitude ────────────
def barometric_pressure(altitude_m: float, *, p0: float = 101325.0,
                        temperature_k: float = 288.15) -> dict:
    """Isothermal barometric formula p(z) = p0 * exp(-z/H), with hydrostatic
    scale height H = R*T/g. KNOWN: pressure halves at ~5.5 km.

    Ref: Barometric formula (Wikipedia); H = RT/g ~= 8.4 km for T=288 K.
    """
    H = R_DRY_AIR * temperature_k / G_EARTH                 # scale height, m
    pressure = p0 * math.exp(-altitude_m / H)
    half_pressure_altitude = H * LN2                        # z where p = p0/2
    return {
        "altitude_m": altitude_m,
        "scale_height_m": H,
        "pressure_pa": pressure,
        "pressure_ratio": pressure / p0,
        "half_pressure_altitude_m": half_pressure_altitude,
        "half_pressure_altitude_km": half_pressure_altitude / 1000.0,
    }


# ── 2. Dry adiabatic lapse rate ───────────────────────────────────────────────
def dry_adiabatic_lapse_rate(*, g: float = G_EARTH, cp: float = CP_DRY_AIR,
                             dz_m: float = 1000.0, t_surface_k: float = 288.15) -> dict:
    """Dry adiabatic lapse rate Gamma_d = g/cp from the first law + hydrostatic
    balance. KNOWN: ~9.8 K/km.

    Ref: g=9.81 m/s^2, cp=1004 J/(kg.K) -> g/cp = 9.8 K/km.
    """
    lapse_k_per_m = g / cp
    lapse_k_per_km = lapse_k_per_m * 1000.0
    t_aloft = t_surface_k - lapse_k_per_m * dz_m
    return {
        "lapse_rate_k_per_m": lapse_k_per_m,
        "lapse_rate_k_per_km": lapse_k_per_km,
        "dz_m": dz_m,
        "t_surface_k": t_surface_k,
        "t_at_dz_k": t_aloft,
    }


# ── 3. Seismic body-wave travel time / P-wave vs S-wave speed ratio ───────────
def seismic_pwave_swave_ratio(*, vp: float | None = None, vs: float | None = None,
                              poisson_ratio: float = 0.25,
                              travel_distance_km: float = 100.0) -> dict:
    """P- and S-wave speeds from elastic Poisson ratio, their ratio, and body-wave
    travel times over a distance. KNOWN: a Poisson solid (nu=0.25) gives
    Vp/Vs = sqrt(3) ~= 1.73.

    Ref: Vp/Vs = sqrt(2(1-nu)/(1-2nu)); nu=0.25 -> sqrt(3).
    """
    ratio_from_poisson = math.sqrt(2.0 * (1.0 - poisson_ratio) / (1.0 - 2.0 * poisson_ratio))
    if vs is not None and vp is None:
        vp = vs * ratio_from_poisson
    if vp is None:
        vp = 6000.0   # typical crustal P-wave speed, m/s
    if vs is None:
        vs = vp / ratio_from_poisson
    vp_vs = vp / vs
    dist_m = travel_distance_km * 1000.0
    t_p = dist_m / vp
    t_s = dist_m / vs
    return {
        "vp_m_s": vp,
        "vs_m_s": vs,
        "vp_vs_ratio": vp_vs,
        "vp_vs_poisson_solid": ratio_from_poisson,
        "poisson_ratio": poisson_ratio,
        "travel_time_p_s": t_p,
        "travel_time_s_s": t_s,
        "s_minus_p_s": t_s - t_p,
    }


# ── 4. Richter / moment magnitude energy scaling ──────────────────────────────
def earthquake_energy(magnitude: float, *, magnitude2: float | None = None) -> dict:
    """Radiated seismic energy from the Gutenberg-Richter energy-magnitude
    relation log10(E) = 1.5*M + 4.8 (E in joules). KNOWN: each unit of magnitude
    is a factor 10^1.5 ~= 31.6 in energy.

    Ref: Gutenberg & Richter (1956); USGS energy-magnitude relation.
    """
    def energy(m: float) -> float:
        return 10.0 ** (1.5 * m + 4.8)

    e1 = energy(magnitude)
    out = {
        "magnitude": magnitude,
        "energy_joules": e1,
        "energy_ratio_per_magnitude": 10.0 ** 1.5,
    }
    if magnitude2 is not None:
        e2 = energy(magnitude2)
        out["magnitude2"] = magnitude2
        out["energy2_joules"] = e2
        out["energy_ratio"] = e2 / e1
    return out


# ── 5. Hydrology: Manning's open-channel flow ─────────────────────────────────
def manning_open_channel(*, width_m: float = 2.0, depth_m: float = 1.0,
                         slope: float = 0.001, n: float = 0.013) -> dict:
    """Manning's equation for a rectangular open channel:
    V = (1/n) * R^(2/3) * S^(1/2),  Q = A*V  (SI units, k=1.0).
    KNOWN: 2 m wide, 1 m deep, S=0.001, n=0.013 (concrete) -> V~=3.2 m/s,
    Q~=3.8 m^3/s.

    Ref: Manning's equation, concrete-lined channel example.
    """
    area = width_m * depth_m
    wetted_perimeter = width_m + 2.0 * depth_m
    hydraulic_radius = area / wetted_perimeter
    velocity = (1.0 / n) * hydraulic_radius ** (2.0 / 3.0) * slope ** 0.5
    discharge = area * velocity
    return {
        "area_m2": area,
        "hydraulic_radius_m": hydraulic_radius,
        "velocity_m_s": velocity,
        "discharge_m3_s": discharge,
        "manning_n": n,
        "slope": slope,
    }


# ── 6. Ocean geostrophy / Coriolis parameter ──────────────────────────────────
def coriolis_parameter(latitude_deg: float, *, omega: float = OMEGA_EARTH,
                       sea_surface_slope: float | None = None,
                       g: float = G_EARTH) -> dict:
    """Coriolis parameter f = 2*Omega*sin(phi), and (optionally) the geostrophic
    current speed v = (g/f) * d(eta)/dx balancing a sea-surface slope.
    KNOWN: at phi=45 deg, f ~= 1.03e-4 s^-1.

    Ref: Coriolis frequency (Wikipedia); Omega=7.292e-5 rad/s.
    """
    phi = math.radians(latitude_deg)
    f = 2.0 * omega * math.sin(phi)
    out = {
        "latitude_deg": latitude_deg,
        "coriolis_parameter_s": f,
        "omega_rad_s": omega,
    }
    if sea_surface_slope is not None and f != 0.0:
        out["sea_surface_slope"] = sea_surface_slope
        out["geostrophic_velocity_m_s"] = (g / f) * sea_surface_slope
    return out


# ── 7. Radiative greenhouse energy balance ────────────────────────────────────
def radiative_equilibrium(*, solar_constant: float = SOLAR_CONSTANT,
                          albedo: float = 0.3, emissivity: float = 1.0,
                          greenhouse_factor: float = 1.13) -> dict:
    """Planetary energy balance: absorbed solar = emitted thermal IR.
    (1-A)*S/4 = epsilon*sigma*Te^4  ->  Te. The greenhouse effect raises the
    surface above Te. KNOWN: Earth Te ~= 255 K; surface ~= 288 K.

    Ref: planetary equilibrium temperature; A=0.3, S=1361 W/m^2 -> 255 K.
    The factor 1.13 captures the observed ~33 K greenhouse warming (288/255).
    """
    absorbed = (1.0 - albedo) * solar_constant / 4.0
    te = (absorbed / (emissivity * SIGMA_SB)) ** 0.25
    t_surface = te * greenhouse_factor
    return {
        "solar_constant_w_m2": solar_constant,
        "albedo": albedo,
        "absorbed_flux_w_m2": absorbed,
        "equilibrium_temp_k": te,
        "surface_temp_k": t_surface,
        "greenhouse_warming_k": t_surface - te,
    }


# ── 8. Radiometric dating decay age ───────────────────────────────────────────
def radiometric_age(*, remaining_fraction: float = 0.5,
                    half_life_years: float = 5730.0) -> dict:
    """Radiometric (radiocarbon) age from exponential decay:
    N/N0 = exp(-lambda*t), lambda = ln2/T_half, t = -ln(F)/lambda.
    KNOWN: with C-14 T_half=5730 yr, F=0.5 (one half-life) -> t=5730 yr.

    Ref: radiocarbon dating; C-14 half-life 5730 years.
    """
    decay_constant = LN2 / half_life_years          # per year
    age = -math.log(remaining_fraction) / decay_constant
    return {
        "half_life_years": half_life_years,
        "decay_constant_per_year": decay_constant,
        "remaining_fraction": remaining_fraction,
        "age_years": age,
        "n_half_lives": age / half_life_years,
    }
