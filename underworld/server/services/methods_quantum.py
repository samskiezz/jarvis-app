"""Real quantum & particle physics simulation methods.

Eight named, real quantum-mechanics methods, each computed from its canonical
published formula and each verified in the test suite against a KNOWN published
value:

  1. tunnelling_transmission   — quantum tunnelling through a rectangular barrier
                                 (verify exponential decay T ~ exp(-2*kappa*L))
  2. particle_in_a_box         — infinite-well energy levels E_n = n^2 h^2/8mL^2
                                 (electron in 1 nm box: E_1 ~ 0.376 eV; spacing
                                  E_2/E_1 = 4)
  3. larmor_precession         — spin-1/2 in a magnetic field, omega = gamma*B
                                 (free electron: ~28.025 GHz/T)
  4. bohr_energy_levels        — hydrogen atom E_n = -13.6/n^2 eV
                                 (ground state -13.606 eV)
  5. harmonic_oscillator       — quantum HO levels, zero-point energy = 1/2 hbar*omega
  6. rabi_oscillation          — two-level Rabi flopping, generalized Rabi freq
                                 Omega_R = sqrt(Omega_0^2 + delta^2)
  7. de_broglie_wavelength     — lambda = h / p (electron at 100 eV: ~122.6 pm)
  8. compton_shift             — Compton scattering wavelength shift
                                 d_lambda = lambda_C (1 - cos theta);
                                 lambda_C = 2.426 pm

All constants are CODATA published values via scipy.constants.

Sources:
  - Quantum tunnelling / transmission coefficient:
    https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/University_Physics_III_-_Optics_and_Modern_Physics_(OpenStax)/07:_Quantum_Mechanics/7.07:_Quantum_Tunneling_of_Particles_through_Potential_Barriers
  - Particle in a box: https://en.wikipedia.org/wiki/Particle_in_a_box
  - Larmor precession / gyromagnetic ratio:
    https://en.wikipedia.org/wiki/Larmor_precession ,
    https://en.wikipedia.org/wiki/Gyromagnetic_ratio
  - Bohr model: https://en.wikipedia.org/wiki/Bohr_model
  - Quantum harmonic oscillator:
    https://en.wikipedia.org/wiki/Quantum_harmonic_oscillator
  - Rabi frequency: https://en.wikipedia.org/wiki/Rabi_frequency
  - de Broglie wavelength: https://en.wikipedia.org/wiki/Matter_wave
  - Compton scattering: https://en.wikipedia.org/wiki/Compton_scattering
"""
from __future__ import annotations

import numpy as np
from scipy import constants as sc

# --- Published physical constants (CODATA via scipy.constants) --------------
H = sc.h                # Planck constant, 6.62607015e-34 J*s
HBAR = sc.hbar          # reduced Planck constant, 1.054571817e-34 J*s
M_ELECTRON = sc.m_e     # electron mass, 9.1093837139e-31 kg
E_CHARGE = sc.e         # elementary charge, 1.602176634e-19 C
C_LIGHT = sc.c          # speed of light, 299792458 m/s

# Known reference values (CODATA)
RYDBERG_EV = sc.value("Rydberg constant times hc in eV")     # 13.605693... eV
COMPTON_WAVELENGTH = sc.value("Compton wavelength")          # 2.42631e-12 m
ELECTRON_GYROMAG_RATIO = sc.value("electron gyromag. ratio")  # rad/s/T


def _ev_from_joule(joule: float) -> float:
    return joule / E_CHARGE


# 1. QUANTUM TUNNELLING -------------------------------------------------------
def tunnelling_transmission(
    *,
    energy_ev: float,
    barrier_height_ev: float,
    barrier_width_m: float,
    mass_kg: float = M_ELECTRON,
) -> dict:
    """Transmission coefficient for a particle tunnelling through a rectangular
    barrier of height ``U0`` and width ``L`` (E < U0).

    Decay constant kappa = sqrt(2 m (U0 - E)) / hbar.
    Exact rectangular-barrier transmission:

        T = 1 / (1 + (U0^2 sinh^2(kappa L)) / (4 E (U0 - E)))

    and the strong-barrier (kappa L >> 1) approximation

        T ~ 16 (E/U0)(1 - E/U0) exp(-2 kappa L),

    which exhibits the characteristic exponential decay with barrier width.

    Known behaviour (verified): T decays exponentially in L, i.e. for two widths
    L1 < L2, T(L2)/T(L1) -> exp(-2 kappa (L2 - L1)).
    """
    if barrier_height_ev <= energy_ev:
        raise ValueError("requires E < U0 (sub-barrier tunnelling)")
    E = energy_ev * E_CHARGE
    U0 = barrier_height_ev * E_CHARGE
    kappa = np.sqrt(2.0 * mass_kg * (U0 - E)) / HBAR
    kL = kappa * barrier_width_m
    T_exact = 1.0 / (
        1.0 + (U0 ** 2 * np.sinh(kL) ** 2) / (4.0 * E * (U0 - E))
    )
    T_approx = 16.0 * (E / U0) * (1.0 - E / U0) * np.exp(-2.0 * kL)
    return {
        "kappa_per_m": float(kappa),
        "kappa_L": float(kL),
        "transmission_exact": float(T_exact),
        "transmission_approx": float(T_approx),
        "decay_exponent": float(-2.0 * kL),
    }


# 2. PARTICLE IN A BOX --------------------------------------------------------
def particle_in_a_box(
    *,
    n: int,
    length_m: float,
    mass_kg: float = M_ELECTRON,
) -> dict:
    """Energy levels of a particle in a 1-D infinite square well:

        E_n = n^2 h^2 / (8 m L^2).

    Known value (verified): an electron (m_e) in a 1 nm box has
    E_1 ~ 0.376 eV and level spacing E_2/E_1 = 4 (i.e. E_n ~ n^2).
    """
    if n < 1:
        raise ValueError("quantum number n must be >= 1")
    energy_j = (n ** 2) * (H ** 2) / (8.0 * mass_kg * length_m ** 2)
    e1_j = (H ** 2) / (8.0 * mass_kg * length_m ** 2)
    return {
        "n": int(n),
        "energy_joule": float(energy_j),
        "energy_ev": float(_ev_from_joule(energy_j)),
        "ground_state_ev": float(_ev_from_joule(e1_j)),
        "level_ratio_to_ground": float(energy_j / e1_j),  # = n^2
    }


# 3. SPIN-1/2 LARMOR PRECESSION ----------------------------------------------
def larmor_precession(
    *,
    magnetic_field_t: float,
    gyromagnetic_ratio: float = ELECTRON_GYROMAG_RATIO,
) -> dict:
    """Larmor precession of a spin in a magnetic field.

    Angular precession frequency omega = gamma * B; ordinary frequency
    f = gamma * B / (2 pi).

    Known value (verified): for a free electron the precession frequency is
    ~28.025 GHz per tesla (gamma/2pi).
    """
    omega = gyromagnetic_ratio * magnetic_field_t
    freq = omega / (2.0 * np.pi)
    return {
        "angular_frequency_rad_s": float(omega),
        "frequency_hz": float(freq),
        "frequency_ghz": float(freq / 1e9),
        "frequency_per_tesla_ghz": float(
            gyromagnetic_ratio / (2.0 * np.pi) / 1e9
        ),
    }


# 4. HYDROGEN BOHR ENERGY LEVELS ---------------------------------------------
def bohr_energy_levels(*, n: int) -> dict:
    """Bohr-model hydrogen energy levels:

        E_n = -13.6 eV / n^2   (= -Rydberg_energy / n^2).

    Known value (verified): ground state E_1 = -13.606 eV.
    """
    if n < 1:
        raise ValueError("principal quantum number n must be >= 1")
    energy_ev = -RYDBERG_EV / (n ** 2)
    return {
        "n": int(n),
        "energy_ev": float(energy_ev),
        "energy_joule": float(energy_ev * E_CHARGE),
        "rydberg_energy_ev": float(RYDBERG_EV),
    }


# 5. QUANTUM HARMONIC OSCILLATOR ---------------------------------------------
def harmonic_oscillator(*, angular_frequency_rad_s: float, n: int = 0) -> dict:
    """Quantum harmonic oscillator energy levels:

        E_n = (n + 1/2) hbar omega.

    The zero-point energy (n = 0) is E_0 = 1/2 hbar omega.

    Known value (verified): E_0 = 0.5 * hbar * omega and the level spacing
    E_{n+1} - E_n = hbar omega.
    """
    if n < 0:
        raise ValueError("quantum number n must be >= 0")
    zpe_j = 0.5 * HBAR * angular_frequency_rad_s
    energy_j = (n + 0.5) * HBAR * angular_frequency_rad_s
    quantum_j = HBAR * angular_frequency_rad_s
    return {
        "n": int(n),
        "zero_point_energy_joule": float(zpe_j),
        "zero_point_energy_ev": float(_ev_from_joule(zpe_j)),
        "energy_joule": float(energy_j),
        "energy_ev": float(_ev_from_joule(energy_j)),
        "level_spacing_joule": float(quantum_j),
    }


# 6. TWO-LEVEL RABI OSCILLATION ----------------------------------------------
def rabi_oscillation(
    *,
    rabi_frequency_hz: float,
    detuning_hz: float = 0.0,
    time_s: float | None = None,
) -> dict:
    """Two-level Rabi oscillations.

    The generalized (effective) Rabi angular frequency for detuning ``delta`` is

        Omega_eff = sqrt(Omega_0^2 + delta^2),

    and the excited-state population is

        P_e(t) = (Omega_0^2 / Omega_eff^2) sin^2(Omega_eff t / 2).

    Known value (verified): on resonance (delta = 0) Omega_eff = Omega_0, the
    population reaches 1 (complete inversion), and a pi-pulse (t = pi/Omega_0)
    gives P_e = 1.
    """
    omega0 = 2.0 * np.pi * rabi_frequency_hz
    delta = 2.0 * np.pi * detuning_hz
    omega_eff = np.sqrt(omega0 ** 2 + delta ** 2)
    result = {
        "rabi_angular_freq_rad_s": float(omega0),
        "generalized_rabi_angular_freq_rad_s": float(omega_eff),
        "generalized_rabi_freq_hz": float(omega_eff / (2.0 * np.pi)),
        "max_excited_population": float(omega0 ** 2 / omega_eff ** 2),
    }
    if time_s is not None:
        p_e = (omega0 ** 2 / omega_eff ** 2) * np.sin(
            0.5 * omega_eff * time_s
        ) ** 2
        result["excited_population"] = float(p_e)
    return result


# 7. DE BROGLIE WAVELENGTH ----------------------------------------------------
def de_broglie_wavelength(
    *,
    kinetic_energy_ev: float,
    mass_kg: float = M_ELECTRON,
) -> dict:
    """Non-relativistic de Broglie wavelength of a massive particle:

        p = sqrt(2 m K),   lambda = h / p.

    Known value (verified): an electron with K = 100 eV has
    lambda ~ 122.6 pm (~0.123 nm).
    """
    if kinetic_energy_ev <= 0:
        raise ValueError("kinetic energy must be positive")
    K = kinetic_energy_ev * E_CHARGE
    p = np.sqrt(2.0 * mass_kg * K)
    wavelength = H / p
    return {
        "momentum_kg_m_s": float(p),
        "wavelength_m": float(wavelength),
        "wavelength_pm": float(wavelength * 1e12),
        "wavelength_nm": float(wavelength * 1e9),
    }


# 8. COMPTON SCATTERING -------------------------------------------------------
def compton_shift(*, scattering_angle_deg: float, mass_kg: float = M_ELECTRON) -> dict:
    """Compton scattering wavelength shift:

        d_lambda = (h / m c) (1 - cos theta) = lambda_C (1 - cos theta).

    Known value (verified): the electron Compton wavelength
    lambda_C = h/(m_e c) = 2.426 pm, and the shift at theta = 90 deg equals
    exactly one Compton wavelength.
    """
    theta = np.deg2rad(scattering_angle_deg)
    lambda_c = H / (mass_kg * C_LIGHT)
    shift = lambda_c * (1.0 - np.cos(theta))
    return {
        "compton_wavelength_m": float(lambda_c),
        "compton_wavelength_pm": float(lambda_c * 1e12),
        "wavelength_shift_m": float(shift),
        "wavelength_shift_pm": float(shift * 1e12),
    }
