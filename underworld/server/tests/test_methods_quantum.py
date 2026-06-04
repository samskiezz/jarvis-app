"""Tests for real quantum & particle physics methods.

Each test verifies a method against a KNOWN published value with an explicit
tolerance and a citation. Constants are CODATA via scipy.constants.
"""
import math

import numpy as np
import pytest
from scipy import constants as sc

from underworld.server.services.methods_quantum import (
    tunnelling_transmission,
    particle_in_a_box,
    larmor_precession,
    bohr_energy_levels,
    harmonic_oscillator,
    rabi_oscillation,
    de_broglie_wavelength,
    compton_shift,
)


# 1. QUANTUM TUNNELLING -------------------------------------------------------
def test_tunnelling_exponential_decay():
    """KNOWN: rectangular-barrier transmission decays exponentially with width,
    T(L2)/T(L1) = exp(-2 kappa (L2 - L1)) in the strong-barrier regime.
    Source: LibreTexts University Physics III, sec. 7.7 (Quantum Tunneling).
    """
    params = dict(energy_ev=1.0, barrier_height_ev=5.0)
    L1, L2 = 0.5e-9, 1.0e-9
    r1 = tunnelling_transmission(barrier_width_m=L1, **params)
    r2 = tunnelling_transmission(barrier_width_m=L2, **params)
    kappa = r1["kappa_per_m"]
    expected_ratio = math.exp(-2.0 * kappa * (L2 - L1))
    actual_ratio = r2["transmission_approx"] / r1["transmission_approx"]
    assert actual_ratio == pytest.approx(expected_ratio, rel=1e-9)
    # Wider barrier -> lower transmission (monotone exponential decay).
    assert r2["transmission_exact"] < r1["transmission_exact"]
    # Exact and strong-barrier approx agree to ~1% for kappa*L >> 1.
    assert r2["transmission_exact"] == pytest.approx(
        r2["transmission_approx"], rel=0.02
    )


# 2. PARTICLE IN A BOX --------------------------------------------------------
def test_particle_in_a_box_ground_state_and_spacing():
    """KNOWN: electron in a 1 nm 1-D box has E_1 ~ 0.376 eV; E_n ~ n^2 so
    E_2/E_1 = 4. Source: Wikipedia, Particle in a box.
    """
    g = particle_in_a_box(n=1, length_m=1e-9)
    assert g["energy_ev"] == pytest.approx(0.376, abs=0.005)
    e2 = particle_in_a_box(n=2, length_m=1e-9)
    assert e2["level_ratio_to_ground"] == pytest.approx(4.0, rel=1e-9)
    assert e2["energy_ev"] / g["energy_ev"] == pytest.approx(4.0, rel=1e-9)


# 3. SPIN-1/2 LARMOR PRECESSION ----------------------------------------------
def test_larmor_electron_28_ghz_per_tesla():
    """KNOWN: free-electron Larmor/precession frequency ~28.025 GHz/T.
    Source: Wikipedia, Gyromagnetic ratio; CODATA electron gyromag. ratio.
    """
    r = larmor_precession(magnetic_field_t=1.0)
    assert r["frequency_ghz"] == pytest.approx(28.025, abs=0.01)
    assert r["frequency_per_tesla_ghz"] == pytest.approx(28.025, abs=0.01)


# 4. HYDROGEN BOHR LEVELS -----------------------------------------------------
def test_bohr_ground_state_minus_13_6_ev():
    """KNOWN: hydrogen ground state E_1 = -13.606 eV; E_2 = -3.4 eV.
    Source: Wikipedia, Bohr model; CODATA Rydberg energy in eV.
    """
    g = bohr_energy_levels(n=1)
    assert g["energy_ev"] == pytest.approx(-13.6, abs=0.01)
    assert g["energy_ev"] == pytest.approx(-13.605693, abs=1e-4)
    e2 = bohr_energy_levels(n=2)
    assert e2["energy_ev"] == pytest.approx(-3.4, abs=0.01)


# 5. QUANTUM HARMONIC OSCILLATOR ---------------------------------------------
def test_harmonic_oscillator_zero_point_energy():
    """KNOWN: zero-point energy E_0 = 1/2 hbar omega; spacing = hbar omega.
    Source: Wikipedia, Quantum harmonic oscillator.
    """
    omega = 1.0e15
    r = harmonic_oscillator(angular_frequency_rad_s=omega, n=0)
    assert r["zero_point_energy_joule"] == pytest.approx(0.5 * sc.hbar * omega, rel=1e-12)
    assert r["level_spacing_joule"] == pytest.approx(sc.hbar * omega, rel=1e-12)
    r1 = harmonic_oscillator(angular_frequency_rad_s=omega, n=1)
    assert (r1["energy_joule"] - r["energy_joule"]) == pytest.approx(
        sc.hbar * omega, rel=1e-12
    )


# 6. RABI OSCILLATION ---------------------------------------------------------
def test_rabi_resonant_and_generalized_frequency():
    """KNOWN: on resonance Omega_eff = Omega_0 and a pi-pulse fully inverts the
    population (P_e = 1); generalized Rabi freq = sqrt(Omega_0^2 + delta^2).
    Source: Wikipedia, Rabi frequency.
    """
    f0 = 1.0e6  # 1 MHz Rabi frequency
    # On resonance: generalized == bare; population reaches 1.
    res = rabi_oscillation(rabi_frequency_hz=f0, detuning_hz=0.0)
    assert res["generalized_rabi_freq_hz"] == pytest.approx(f0, rel=1e-12)
    assert res["max_excited_population"] == pytest.approx(1.0, rel=1e-12)
    # pi-pulse: t = pi/Omega_0 = 1/(2 f0) gives full inversion.
    pi_pulse = rabi_oscillation(rabi_frequency_hz=f0, detuning_hz=0.0, time_s=1.0 / (2.0 * f0))
    assert pi_pulse["excited_population"] == pytest.approx(1.0, abs=1e-9)
    # Off resonance with delta = sqrt(3) Omega_0 -> Omega_eff = 2 Omega_0.
    det = rabi_oscillation(rabi_frequency_hz=f0, detuning_hz=math.sqrt(3.0) * f0)
    assert det["generalized_rabi_freq_hz"] == pytest.approx(2.0 * f0, rel=1e-12)
    assert det["max_excited_population"] == pytest.approx(0.25, rel=1e-9)


# 7. DE BROGLIE WAVELENGTH ----------------------------------------------------
def test_de_broglie_electron_100ev():
    """KNOWN: electron at 100 eV has de Broglie wavelength ~122.6 pm (~0.123 nm).
    Source: Wikipedia, Matter wave; standard textbook value.
    """
    r = de_broglie_wavelength(kinetic_energy_ev=100.0)
    assert r["wavelength_pm"] == pytest.approx(122.6, abs=0.5)
    assert r["wavelength_nm"] == pytest.approx(0.123, abs=0.001)


# 8. COMPTON SCATTERING -------------------------------------------------------
def test_compton_wavelength_2_43_pm():
    """KNOWN: electron Compton wavelength = 2.426 pm; shift at 90 deg equals
    exactly one Compton wavelength. Source: Wikipedia, Compton scattering;
    CODATA Compton wavelength = 2.42631e-12 m.
    """
    r = compton_shift(scattering_angle_deg=90.0)
    assert r["compton_wavelength_pm"] == pytest.approx(2.426, abs=0.005)
    assert r["wavelength_shift_pm"] == pytest.approx(2.426, abs=0.005)
    # 180 deg backscatter -> shift = 2 * lambda_C.
    back = compton_shift(scattering_angle_deg=180.0)
    assert back["wavelength_shift_pm"] == pytest.approx(2.0 * 2.426, abs=0.01)
    # 0 deg -> no shift.
    fwd = compton_shift(scattering_angle_deg=0.0)
    assert fwd["wavelength_shift_pm"] == pytest.approx(0.0, abs=1e-9)
