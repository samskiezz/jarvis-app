"""Verification tests for methods_physics — each asserts a computed result
matches a KNOWN published value.
"""
import numpy as np

from underworld.server.services.methods_physics import (
    lorentz_factor,
    schwarzschild_radius,
    double_slit_fringe,
    planck_spectral_radiance,
    maxwell_boltzmann_speed,
    cyclotron_frequency,
    carnot_efficiency,
    relativistic_energy,
)


def test_lorentz_factor_gamma_2_at_0866c():
    # KNOWN: at v = 0.866 c, the Lorentz factor gamma = 2 (textbook value).
    c = 299792458.0
    out = lorentz_factor(velocity_ms=0.866 * c)
    assert abs(out["gamma"] - 2.0) < 1e-3            # gamma == 2
    assert abs(out["time_dilation_factor"] - 2.0) < 1e-3


def test_schwarzschild_radius_sun_2_95_km():
    # KNOWN: Schwarzschild radius of the Sun ~= 2.95 km.
    out = schwarzschild_radius(mass_kg=1.98892e30)
    assert abs(out["radius_km"] - 2.95) < 0.02       # 2.95 km


def test_double_slit_fringe_spacing():
    # KNOWN: delta_y = lambda*L/d; 500 nm, d=0.1 mm, L=1 m -> 5.0 mm.
    out = double_slit_fringe(wavelength_m=500e-9,
                             slit_distance_m=0.1e-3,
                             screen_distance_m=1.0)
    assert abs(out["fringe_spacing_mm"] - 5.0) < 1e-6  # 5.0 mm
    # zeroth-order bright fringe sits at the centre (y = 0)
    assert abs(out["bright_fringe_positions_m"][0]) < 1e-12


def test_planck_peak_matches_wien_for_sun():
    # KNOWN: Wien's law gives the Sun's (5778 K) blackbody peak at ~502 nm.
    out = planck_spectral_radiance(temperature_k=5778.0)
    assert abs(out["wien_peak_wavelength_nm"] - 501.6) < 1.0    # ~502 nm
    # numerically-located Planck peak agrees with Wien's law to <1%
    rel_err = abs(out["peak_wavelength_nm"] - out["wien_peak_wavelength_nm"]) \
        / out["wien_peak_wavelength_nm"]
    assert rel_err < 0.01


def test_maxwell_boltzmann_most_probable_speed():
    # KNOWN: for N2 (m=4.65e-26 kg) at 300 K, v_p ~= 421 m/s.
    out = maxwell_boltzmann_speed(temperature_k=300.0,
                                  particle_mass_kg=4.65e-26)
    assert abs(out["most_probable_speed_ms"] - 421.0) < 3.0     # ~421 m/s
    # KNOWN ordering/ratios of the distribution: v_p < <v> < v_rms,
    # with <v> = v_p*sqrt(4/pi) and v_rms = v_p*sqrt(3/2).
    vp = out["most_probable_speed_ms"]
    assert abs(out["mean_speed_ms"] - vp * np.sqrt(4.0 / np.pi)) < 1e-6
    assert abs(out["rms_speed_ms"] - vp * np.sqrt(1.5)) < 1e-6


def test_cyclotron_frequency_electron_1T_28GHz():
    # KNOWN: an electron in B = 1 T has cyclotron frequency ~= 28 GHz.
    out = cyclotron_frequency(magnetic_field_t=1.0)
    assert abs(out["frequency_ghz"] - 28.0) < 0.5      # ~28 GHz


def test_carnot_efficiency_half():
    # KNOWN: eta = 1 - Tc/Th; Tc=300 K, Th=600 K -> 0.5.
    out = carnot_efficiency(cold_temperature_k=300.0, hot_temperature_k=600.0)
    assert abs(out["efficiency"] - 0.5) < 1e-12        # exactly 0.5
    assert abs(out["efficiency_percent"] - 50.0) < 1e-9


def test_relativistic_rest_energy_electron_0_511_MeV():
    # KNOWN: electron rest energy E0 = m_e c^2 = 0.511 MeV.
    out = relativistic_energy(velocity_ms=0.0)
    assert abs(out["rest_energy_mev"] - 0.511) < 1e-3   # 0.511 MeV
    assert abs(out["gamma"] - 1.0) < 1e-12              # at rest, gamma=1
    assert abs(out["kinetic_energy_mev"]) < 1e-9        # at rest, KE=0
