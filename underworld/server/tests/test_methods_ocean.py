"""Verification tests for methods_ocean — each asserts a computed result
matches a KNOWN published physical-oceanography value, with the source cited.
"""
import math

import numpy as np

from underworld.server.services.methods_ocean import (
    deep_water_wave,
    shallow_water_wave,
    seawater_density,
    tidal_m2,
    ekman_transport,
    buoyancy_frequency,
    wave_energy_stokes,
    geostrophic_current,
)


def test_deep_water_wave_phase_speed():
    # KNOWN: deep-water phase speed c = sqrt(g*lambda/(2*pi)).
    # lambda = 156 m, g = 9.8 -> c = sqrt(9.8*156/(2*pi)) ~ 15.6 m/s.
    # Source: Wikipedia, "Dispersion (water waves)".
    out = deep_water_wave(wavelength_m=156.0)
    expected = math.sqrt(9.8 * 156.0 / (2.0 * math.pi))
    assert abs(out["phase_speed_ms"] - expected) < 1e-9
    assert abs(out["phase_speed_ms"] - 15.6) < 0.1
    # group speed is exactly half the phase speed in deep water.
    assert abs(out["group_speed_ms"] - 0.5 * out["phase_speed_ms"]) < 1e-12


def test_deep_water_period_form_consistency():
    # KNOWN: c = g*T/(2*pi); supplying period must reproduce the same physics.
    out = deep_water_wave(period_s=10.0)
    assert abs(out["phase_speed_ms"] - 9.8 * 10.0 / (2.0 * math.pi)) < 1e-9
    # round-trip: derived wavelength fed back gives the same period.
    back = deep_water_wave(wavelength_m=out["wavelength_m"])
    assert abs(back["period_s"] - 10.0) < 1e-9


def test_shallow_water_tsunami_speed():
    # KNOWN: tsunami in a 4000 m deep ocean -> c = sqrt(9.8*4000) ~ 198 m/s.
    # Source: NOAA JetStream / "Tsunami" shallow-water wave references.
    out = shallow_water_wave(depth_m=4000.0)
    assert abs(out["speed_ms"] - math.sqrt(9.8 * 4000.0)) < 1e-9
    assert abs(out["speed_ms"] - 198.0) < 1.0       # ~198 m/s
    assert abs(out["speed_kmh"] - 713.0) < 5.0      # ~713 km/h


def test_seawater_density_reference_state():
    # KNOWN: mean surface seawater density ~ 1025 kg/m^3 at T=10 C, S=35 psu.
    # Source: UNESCO equation of state of seawater (mean density 1025 kg/m^3).
    out = seawater_density(temperature_c=10.0, salinity_psu=35.0)
    assert abs(out["density_kg_m3"] - 1025.0) < 1e-6
    # qualitative checks: cooler water is denser; saltier water is denser.
    colder = seawater_density(temperature_c=5.0, salinity_psu=35.0)
    saltier = seawater_density(temperature_c=10.0, salinity_psu=36.0)
    assert colder["density_kg_m3"] > out["density_kg_m3"]
    assert saltier["density_kg_m3"] > out["density_kg_m3"]


def test_tidal_m2_period():
    # KNOWN: M2 principal lunar semidiurnal period = 12.4206 h (~12.42 h).
    # Source: NOAA tidal constituents; Wikipedia "Tide".
    out = tidal_m2()
    assert abs(out["period_h"] - 12.42) < 0.01
    # angular speed of the M2 constituent ~ 28.984 deg/hour.
    assert abs(out["speed_deg_per_hour"] - 28.984) < 0.01
    # at t=0, phase=0, elevation = amplitude.
    assert abs(out["elevation_m"] - 1.0) < 1e-9


def test_ekman_surface_deflection_45deg():
    # KNOWN: classical constant-viscosity Ekman surface current is deflected
    # 45 deg (to the right in the Northern Hemisphere) from the wind, and the
    # net transport is 90 deg from the wind.
    # Source: Webb/Stewart "Introduction to Oceanography" (Ekman spiral).
    out = ekman_transport(wind_stress_pa=0.1, latitude_deg=45.0)
    assert abs(out["surface_deflection_deg"] - 45.0) < 1e-9
    assert abs(out["net_transport_angle_deg"] - 90.0) < 1e-9
    # Coriolis parameter f = 2*Omega*sin(45) > 0 in N. Hemisphere.
    assert out["coriolis_parameter_s"] > 0


def test_buoyancy_frequency_thermocline():
    # KNOWN: N = sqrt(-(g/rho) dRho/dz). For dRho/dz = -0.01 kg/m^4 at
    # rho = 1025, N = sqrt(9.8/1025 * 0.01) = 9.778e-3 rad/s, ~5.6 cph,
    # within the observed ocean range (~4-10 cycles/hour).
    # Source: Wikipedia "Brunt-Vaisala frequency"; typical ocean N values.
    out = buoyancy_frequency(density_gradient_kg_m4=-0.01)
    expected_n = math.sqrt(9.8 / 1025.0 * 0.01)
    assert abs(out["buoyancy_frequency_rad_s"] - expected_n) < 1e-9
    assert out["stable"] is True
    assert 4.0 < out["cycles_per_hour"] < 10.0
    # an unstable (top-heavy) column has no real buoyancy frequency.
    unstable = buoyancy_frequency(density_gradient_kg_m4=+0.01)
    assert unstable["stable"] is False
    assert unstable["buoyancy_frequency_rad_s"] == 0.0


def test_wave_energy_density_identity():
    # KNOWN: mean wave energy density per unit area E = (1/8) rho g H^2.
    # Source: Wikipedia "Wave power".
    out = wave_energy_stokes(wave_height_m=2.0, period_s=8.0)
    expected = 0.125 * 1025.0 * 9.8 * 2.0 ** 2
    assert abs(out["energy_density_j_m2"] - expected) < 1e-6
    # deep-water dispersion link: k = omega^2 / g.
    omega = 2.0 * math.pi / 8.0
    assert abs(out["wavenumber_rad_m"] - omega ** 2 / 9.8) < 1e-9
    # Stokes drift is positive (down-wave) and small relative to phase speed.
    assert out["stokes_drift_surface_ms"] > 0


def test_geostrophic_current_speed():
    # KNOWN: v = (g/f) dEta/dx. At 40 N, f = 2*Omega*sin(40) ~ 9.37e-5 s^-1;
    # a slope of 1e-5 gives v = 9.8/9.37e-5 * 1e-5 ~ 1.0 m/s.
    # Source: Stewart "Introduction to Physical Oceanography" (geostrophy).
    out = geostrophic_current(sea_surface_slope=1e-5, latitude_deg=40.0)
    f_expected = 2.0 * 7.2921e-5 * math.sin(math.radians(40.0))
    assert abs(out["coriolis_parameter_s"] - f_expected) < 1e-12
    assert abs(out["coriolis_parameter_s"] - 9.37e-5) < 0.05e-5
    assert abs(out["velocity_ms"] - 9.8 / f_expected * 1e-5) < 1e-9
    assert abs(out["velocity_ms"] - 1.0) < 0.05
