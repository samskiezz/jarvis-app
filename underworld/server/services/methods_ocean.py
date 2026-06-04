"""Real physical-oceanography simulation methods.

Eight named, real ocean methods, each computed from its canonical published
formula and each verified in the test suite against a KNOWN published value:

  1. deep_water_wave            — deep-water (gravity wave) dispersion / phase
                                  speed  c = sqrt(g*lambda/(2*pi)) = g*T/(2*pi).
                                  KNOWN: lambda=156 m -> c ~ 15.6 m/s; the
                                  group speed is exactly half the phase speed.
  2. shallow_water_wave         — shallow-water / tsunami speed  c = sqrt(g*h).
                                  KNOWN: h=4000 m deep ocean -> c ~ 198 m/s
                                  (~713 km/h).
  3. seawater_density           — linear (UNESCO-anchored) equation of state
                                  rho = rho0 * (1 - alpha*(T-T0) + beta*(S-S0)).
                                  KNOWN: T=10 C, S=35 psu surface -> ~1025 kg/m^3.
  4. tidal_m2                   — principal lunar semidiurnal (M2) tidal
                                  constituent. KNOWN: period = 12.4206 h.
  5. ekman_transport            — wind-driven Ekman transport + classical
                                  surface-current deflection. KNOWN: in the
                                  constant-viscosity model the surface current
                                  is 45 deg to the right of the wind (N. Hemi).
  6. buoyancy_frequency         — Brunt-Vaisala (buoyancy) frequency
                                  N = sqrt(-(g/rho) dRho/dz). KNOWN: a stable
                                  thermocline gradient yields N of order
                                  ~10 cycles/hour.
  7. wave_energy_stokes         — surface gravity wave energy density
                                  E = (1/8) rho g H^2 and deep-water Stokes
                                  drift  u_s = a^2 * omega * k. KNOWN identity:
                                  E = (1/8) rho g H^2.
  8. geostrophic_current        — geostrophic balance  v = (g/f) dEta/dx with
                                  Coriolis parameter f = 2*Omega*sin(phi).
                                  KNOWN: f at 40 N ~ 9.37e-5 s^-1; a 1e-5 slope
                                  gives v ~ 1 m/s.

Sources: Wikipedia (Dispersion (water waves); Tsunami / shallow water waves;
UNESCO equation of state of seawater; Tide / M2 constituent; Ekman transport;
Brunt-Vaisala frequency; Wave power; Stokes drift; Geostrophic current);
Stewart, "Introduction to Physical Oceanography"; Webb, "Introduction to
Oceanography" (geo.libretexts.org); NOAA tidal-constituent tables.
"""
from __future__ import annotations

import math

import numpy as np

# --- Published reference constants (SI) -------------------------------------
G0 = 9.80665                  # standard gravity, m/s^2
G_OCEAN = 9.8                 # gravity value used in textbook ocean examples
OMEGA_EARTH = 7.2921e-5       # Earth's rotation rate, rad/s
RHO_SEAWATER = 1025.0         # mean surface seawater density, kg/m^3
RHO_SEAWATER_REF = 1025.0     # linear EOS reference density anchor, kg/m^3
ALPHA_THERMAL = 1.7e-4        # thermal expansion coeff, 1/K (typ. seawater)
BETA_HALINE = 7.6e-4          # haline contraction coeff, 1/psu (typ. seawater)
T_REF_C = 10.0                # reference temperature, deg C
S_REF_PSU = 35.0              # reference practical salinity, psu
M2_PERIOD_HOURS = 12.4206012  # M2 principal lunar semidiurnal period, hours


# 1. DEEP-WATER WAVE DISPERSION / PHASE SPEED --------------------------------
def deep_water_wave(*, wavelength_m: float | None = None,
                    period_s: float | None = None,
                    g: float = G_OCEAN) -> dict:
    """Deep-water (deep ocean gravity wave) dispersion relation.

    Linear theory for water depth > lambda/2 gives omega^2 = g*k, hence the
    phase speed  c = sqrt(g*lambda/(2*pi)) = g*T/(2*pi)  and the group speed
    is exactly half the phase speed.

    Supply either the wavelength or the period; the other is derived.

    Known check: lambda = 156 m  ->  c = sqrt(9.8*156/(2*pi)) ~ 15.6 m/s,
    and the group speed = c/2.
    """
    if (wavelength_m is None) == (period_s is None):
        raise ValueError("supply exactly one of wavelength_m or period_s")

    two_pi = 2.0 * math.pi
    if wavelength_m is not None:
        wavelength = float(wavelength_m)
        phase_speed = math.sqrt(g * wavelength / two_pi)
        period = wavelength / phase_speed
    else:
        period = float(period_s)
        phase_speed = g * period / two_pi
        wavelength = phase_speed * period

    k = two_pi / wavelength       # angular wavenumber, rad/m
    omega = two_pi / period       # angular frequency, rad/s
    group_speed = 0.5 * phase_speed
    return {
        "wavelength_m": float(wavelength),
        "period_s": float(period),
        "phase_speed_ms": float(phase_speed),
        "group_speed_ms": float(group_speed),
        "wavenumber_rad_m": float(k),
        "angular_frequency_rad_s": float(omega),
    }


# 2. SHALLOW-WATER / TSUNAMI WAVE SPEED --------------------------------------
def shallow_water_wave(*, depth_m: float, g: float = G_OCEAN) -> dict:
    """Shallow-water (non-dispersive long wave / tsunami) speed.

    When the wavelength greatly exceeds the depth, c = sqrt(g*h), independent
    of wavelength. Tsunamis behave as shallow-water waves even in the deep
    ocean because their wavelengths are hundreds of km.

    Known check: h = 4000 m  ->  c = sqrt(9.8*4000) ~ 198 m/s (~713 km/h).
    """
    h = float(depth_m)
    c = math.sqrt(g * h)
    return {
        "depth_m": h,
        "speed_ms": float(c),
        "speed_kmh": float(c * 3.6),
    }


# 3. SEAWATER DENSITY (LINEAR EQUATION OF STATE) -----------------------------
def seawater_density(*, temperature_c: float, salinity_psu: float,
                     rho0: float = RHO_SEAWATER_REF,
                     alpha: float = ALPHA_THERMAL,
                     beta: float = BETA_HALINE,
                     t_ref_c: float = T_REF_C,
                     s_ref_psu: float = S_REF_PSU) -> dict:
    """Linear equation of state for seawater density (UNESCO-anchored).

    rho = rho0 * (1 - alpha*(T - T0) + beta*(S - S0))

    Density rises as the water cools (negative thermal expansion term) and as
    it gets saltier (positive haline contraction term).

    Known check: at the reference state T0=10 C, S0=35 psu the density equals
    the anchor rho0 = 1025 kg/m^3, the accepted mean surface seawater density.
    """
    T = float(temperature_c)
    S = float(salinity_psu)
    rho = rho0 * (1.0 - alpha * (T - t_ref_c) + beta * (S - s_ref_psu))
    return {
        "temperature_c": T,
        "salinity_psu": S,
        "density_kg_m3": float(rho),
        "sigma_t": float(rho - 1000.0),   # density anomaly sigma-t
    }


# 4. TIDAL HARMONIC — M2 CONSTITUENT -----------------------------------------
def tidal_m2(*, amplitude_m: float = 1.0, time_h: float = 0.0,
             phase_deg: float = 0.0) -> dict:
    """Principal lunar semidiurnal (M2) tidal constituent.

    The M2 tide has a period of half a lunar day = 12.4206 h, the dominant
    contributor to most coastal tides. The surface elevation is
    eta(t) = A*cos(omega*t + phi) with omega = 2*pi / T_M2.

    Known check: M2 period = 12.4206 h; angular speed = 28.984 deg/hour.
    """
    period_h = M2_PERIOD_HOURS
    omega_rad_h = 2.0 * math.pi / period_h          # rad/hour
    speed_deg_h = 360.0 / period_h                  # degrees/hour
    phase_rad = math.radians(phase_deg)
    elevation = amplitude_m * math.cos(omega_rad_h * time_h + phase_rad)
    return {
        "period_h": float(period_h),
        "period_s": float(period_h * 3600.0),
        "speed_deg_per_hour": float(speed_deg_h),
        "angular_frequency_rad_s": float(omega_rad_h / 3600.0),
        "elevation_m": float(elevation),
    }


# 5. EKMAN TRANSPORT / SPIRAL ------------------------------------------------
def ekman_transport(*, wind_stress_pa: float, latitude_deg: float,
                    rho: float = RHO_SEAWATER) -> dict:
    """Wind-driven Ekman transport and classical surface deflection.

    Net (depth-integrated) Ekman mass transport is perpendicular (90 deg) to
    the wind: M = tau / f, where f = 2*Omega*sin(phi) is the Coriolis
    parameter. In the constant-eddy-viscosity model the *surface* current is
    deflected 45 deg from the wind (to the right in the N. Hemisphere).

    Known check: classical surface-current deflection = 45 deg.
    """
    phi = math.radians(latitude_deg)
    f = 2.0 * OMEGA_EARTH * math.sin(phi)
    transport = wind_stress_pa / (rho * f) if f != 0 else float("inf")
    surface_deflection_deg = 45.0 if latitude_deg >= 0 else -45.0
    return {
        "coriolis_parameter_s": float(f),
        "transport_m2_s": float(transport),           # volume transport / unit length
        "net_transport_angle_deg": 90.0 if latitude_deg >= 0 else -90.0,
        "surface_deflection_deg": float(surface_deflection_deg),
    }


# 6. BRUNT-VAISALA (BUOYANCY) FREQUENCY --------------------------------------
def buoyancy_frequency(*, density_gradient_kg_m4: float,
                       rho: float = RHO_SEAWATER, g: float = G_OCEAN) -> dict:
    """Brunt-Vaisala (buoyancy) frequency of a stratified water column.

    N = sqrt( -(g/rho) * dRho/dz )  with z positive upward, so a stable
    column (density increasing downward, dRho/dz < 0) gives a real N. N is the
    oscillation frequency of a vertically displaced parcel.

    Known check: a thermocline gradient dRho/dz = -0.01 kg/m^4 at rho=1025
    gives N = sqrt(9.8/1025 * 0.01) = 9.78e-3 rad/s ~ 5.6 cycles/hour, within
    the observed ocean range (~4-10 cph).
    """
    drho_dz = float(density_gradient_kg_m4)
    n_squared = -(g / rho) * drho_dz
    n = math.sqrt(n_squared) if n_squared > 0 else 0.0
    period_s = (2.0 * math.pi / n) if n > 0 else float("inf")
    cycles_per_hour = (n / (2.0 * math.pi)) * 3600.0
    return {
        "n_squared_s2": float(n_squared),
        "buoyancy_frequency_rad_s": float(n),
        "period_s": float(period_s),
        "cycles_per_hour": float(cycles_per_hour),
        "stable": bool(n_squared > 0),
    }


# 7. WAVE ENERGY DENSITY / STOKES DRIFT --------------------------------------
def wave_energy_stokes(*, wave_height_m: float, period_s: float,
                       rho: float = RHO_SEAWATER, g: float = G_OCEAN) -> dict:
    """Surface gravity wave mean energy density and deep-water Stokes drift.

    Mean total (kinetic + potential) energy per unit horizontal area:
        E = (1/8) * rho * g * H^2          (H = crest-to-trough wave height)
    Equivalently E = (1/2) rho g a^2 with amplitude a = H/2.

    Deep-water Stokes drift at the surface:
        u_s = a^2 * omega * k ,   omega = 2*pi/T,   k = omega^2 / g.

    Known check: the energy-density identity E = (1/8) rho g H^2 itself.
    """
    H = float(wave_height_m)
    a = H / 2.0
    omega = 2.0 * math.pi / float(period_s)
    k = omega ** 2 / g                       # deep-water dispersion
    energy_density = 0.125 * rho * g * H ** 2
    stokes_drift = a ** 2 * omega * k
    return {
        "wave_height_m": H,
        "amplitude_m": float(a),
        "energy_density_j_m2": float(energy_density),
        "stokes_drift_surface_ms": float(stokes_drift),
        "wavenumber_rad_m": float(k),
        "angular_frequency_rad_s": float(omega),
    }


# 8. CORIOLIS / GEOSTROPHIC CURRENT ------------------------------------------
def geostrophic_current(*, sea_surface_slope: float, latitude_deg: float,
                        g: float = G_OCEAN) -> dict:
    """Surface geostrophic current from the geostrophic balance.

    The pressure-gradient force balances the Coriolis force:
        v = (g / f) * dEta/dx ,   f = 2*Omega*sin(phi).

    Known check: at 40 N, f = 2*7.2921e-5*sin(40) = 9.37e-5 s^-1; a sea-surface
    slope of 1e-5 gives v = 9.8/9.37e-5 * 1e-5 ~ 1.0 m/s, a realistic
    western-boundary-current speed.
    """
    phi = math.radians(latitude_deg)
    f = 2.0 * OMEGA_EARTH * math.sin(phi)
    velocity = (g / f) * float(sea_surface_slope) if f != 0 else float("inf")
    return {
        "coriolis_parameter_s": float(f),
        "velocity_ms": float(velocity),
        "sea_surface_slope": float(sea_surface_slope),
    }


METHODS = {
    "deep_water_wave": deep_water_wave,
    "shallow_water_wave": shallow_water_wave,
    "seawater_density": seawater_density,
    "tidal_m2": tidal_m2,
    "ekman_transport": ekman_transport,
    "buoyancy_frequency": buoyancy_frequency,
    "wave_energy_stokes": wave_energy_stokes,
    "geostrophic_current": geostrophic_current,
}
