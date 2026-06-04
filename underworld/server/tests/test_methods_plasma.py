"""Plasma physics & fusion — verification vs known textbook/reference values.

Each test asserts against a KNOWN value with an explicit tolerance and a citation.
Sources:
  - NRL Plasma Formulary (2019/2023), A. S. Richardson.
  - Chen, "Introduction to Plasma Physics and Controlled Fusion".
  - Wesson, "Tokamaks" (bremsstrahlung).
  - Lawson criterion: Wurzel & Hsu, arXiv:2105.10954 (D-T triple product ~3e21).
"""

from __future__ import annotations

import math

from underworld.server.services.methods_plasma import (
    ROUTE_TABLE,
    bremsstrahlung_power,
    coulomb_log_collision,
    debye_length,
    gyromotion,
    lawson_triple_product,
    plasma_beta,
    plasma_frequency,
    route,
    saha_ionization,
)


def _close(a, b, rel=0.02):
    return abs(a - b) <= rel * abs(b)


# 1. Plasma frequency ---------------------------------------------------------
def test_plasma_frequency_known_value():
    # KNOWN: n_e = 1e18 m^-3 -> f_p ~ 8.98 GHz, omega_p ~ 5.64e10 rad/s.
    # Cite: Chen, plasma frequency; engineering rule f_p~8980*sqrt(n[cm^-3]).
    r = plasma_frequency(1e18)
    assert _close(r["f_p_ghz"], 8.98, rel=0.01)
    assert _close(r["omega_p_rad_s"], 5.64e10, rel=0.01)


def test_plasma_frequency_scales_as_sqrt_n():
    # Quadrupling density doubles the plasma frequency.
    base = plasma_frequency(1e18)["omega_p_rad_s"]
    quad = plasma_frequency(4e18)["omega_p_rad_s"]
    assert _close(quad / base, 2.0, rel=1e-6)


# 2. Debye length -------------------------------------------------------------
def test_debye_length_known_value():
    # KNOWN: lambda_D[m] ~ 7430 * sqrt(Te[eV]/n[m^-3]) (NRL/Chen).
    # Te=1 eV, n=1e18 -> 7430*sqrt(1/1e18) = 7.43e-6 m.
    r = debye_length(1e18, 1.0)
    assert _close(r["debye_length_m"], 7.43e-6, rel=0.01)
    # Plasma criterion: many particles per Debye sphere.
    assert r["N_debye_sphere"] > 1.0


def test_debye_length_grows_with_temperature():
    cold = debye_length(1e18, 1.0)["debye_length_m"]
    hot = debye_length(1e18, 100.0)["debye_length_m"]
    assert hot > cold
    assert _close(hot / cold, 10.0, rel=1e-6)  # sqrt(100)=10


# 3. Lawson criterion / triple product ---------------------------------------
def test_lawson_threshold_value():
    # KNOWN: D-T ignition triple product ~3e21 keV*s/m^3 (Wurzel&Hsu 2105.10954).
    r = lawson_triple_product(1e20, 10.0, 3.0)  # 1e20 * 10 * 3 = 3e21
    assert _close(r["triple_product"], 3e21, rel=1e-9)
    assert _close(r["threshold"], 3e21, rel=0.0)
    assert r["ignited"] is True
    assert _close(r["ignition_ratio"], 1.0, rel=1e-9)


def test_lawson_below_threshold_not_ignited():
    r = lawson_triple_product(1e20, 1.0, 1.0)  # 1e20 << 3e21
    assert r["ignited"] is False
    assert r["ignition_ratio"] < 1.0


# 4. Cyclotron / gyroradius ---------------------------------------------------
def test_electron_cyclotron_frequency_28ghz_per_tesla():
    # KNOWN: electron gyrofrequency = 28 GHz/T (NRL Formulary).
    r = gyromotion(1.0, 1e6)
    assert _close(r["f_c_ghz"], 28.0, rel=0.01)


def test_proton_cyclotron_frequency_15mhz_per_tesla():
    # KNOWN: proton gyrofrequency ~ 15.2 MHz/T (NRL Formulary).
    from underworld.server.services.methods_plasma import M_P, E_CHARGE
    r = gyromotion(1.0, 1e6, mass=M_P, charge=E_CHARGE)
    assert _close(r["f_c_hz"] / 1e6, 15.2, rel=0.02)


def test_gyroradius_scales_with_velocity_and_inverse_B():
    a = gyromotion(1.0, 1e6)["gyroradius_m"]
    b = gyromotion(2.0, 1e6)["gyroradius_m"]
    assert _close(a / b, 2.0, rel=1e-9)  # r_L ~ 1/B


# 5. Coulomb logarithm / collision frequency ---------------------------------
def test_coulomb_log_known_range():
    # KNOWN: NRL e-i formula 24 - ln(sqrt(n[cm^-3])/T[eV]). For n_e=1e20 m^-3
    # (1e14 cm^-3), Te=1000 eV -> 24 - ln(1e7/1e3) = 24 - ln(1e4) ~ 14.79.
    r = coulomb_log_collision(1e20, 1000.0)
    assert _close(r["coulomb_log"], 14.79, rel=0.01)
    assert 10.0 < r["coulomb_log"] < 25.0  # typical fusion-plasma range


def test_collision_freq_falls_with_temperature():
    # nu_e ~ Te^-3/2: hotter plasma collides less often.
    cold = coulomb_log_collision(1e20, 100.0)["collision_freq_hz"]
    hot = coulomb_log_collision(1e20, 1000.0)["collision_freq_hz"]
    assert hot < cold


# 6. Saha ionization ----------------------------------------------------------
def test_saha_ionization_rises_with_temperature():
    # KNOWN: ionization fraction increases monotonically with T (Saha 1920).
    n = 1e20
    x_cool = saha_ionization(6000.0, n)["ionization_fraction"]
    x_warm = saha_ionization(10000.0, n)["ionization_fraction"]
    x_hot = saha_ionization(20000.0, n)["ionization_fraction"]
    assert x_cool < x_warm < x_hot
    assert 0.0 <= x_cool and x_hot <= 1.0


def test_saha_half_ionized_around_1e4K():
    # KNOWN: hydrogen ~50% ionized near ~1e4 K at stellar-photosphere density.
    # n_total ~ 1e22 m^-3 places the 50% crossover in the ~1.0e4-1.2e4 K band.
    n = 1e22
    low = saha_ionization(1.0e4, n)["ionization_fraction"]
    high = saha_ionization(1.2e4, n)["ionization_fraction"]
    assert low < 0.5 < high


# 7. Bremsstrahlung -----------------------------------------------------------
def test_bremsstrahlung_known_value():
    # KNOWN: n_e=1e20, Te=10 keV, Z=1 -> P_br ~ 1.69e4 W/m^3 (Wesson coefficient
    # 5.35e-37 * n_e^2 * sqrt(Te[keV])).
    r = bremsstrahlung_power(1e20, 10.0, 1.0)
    expected = 5.35e-37 * (1e20**2) * math.sqrt(10.0)
    assert _close(r["power_density_W_m3"], expected, rel=1e-9)
    assert _close(r["power_density_W_m3"], 1.69e4, rel=0.02)


def test_bremsstrahlung_scales_as_density_squared():
    p1 = bremsstrahlung_power(1e20, 10.0)["power_density_W_m3"]
    p2 = bremsstrahlung_power(2e20, 10.0)["power_density_W_m3"]
    assert _close(p2 / p1, 4.0, rel=1e-9)  # ~n_e^2


# 8. Magnetic pressure / plasma beta -----------------------------------------
def test_magnetic_pressure_of_one_tesla():
    # KNOWN: B=1 T magnetic pressure B^2/(2 mu0) ~ 3.98e5 Pa (~3.93 atm).
    r = plasma_beta(1e20, 1000.0, 1.0)
    assert _close(r["p_magnetic_Pa"], 3.98e5, rel=0.01)


def test_plasma_beta_formula():
    # beta = 2 mu0 p / B^2; consistency check + tokamak-like low value.
    r = plasma_beta(1e20, 1000.0, 5.0)  # n=1e20, T=1 keV, B=5 T
    assert _close(r["plasma_beta"], 2.0 * r["p_thermal_Pa"] * (math.pi * 4e-7) / 25.0, rel=0.01)
    assert r["plasma_beta"] < 0.1  # tokamaks run at low beta


# Routing ---------------------------------------------------------------------
def test_route_table_resolves_keywords():
    assert route("compute plasma_freq") is plasma_frequency
    assert route("debye length please") is debye_length
    assert route("lawson criterion") is lawson_triple_product
    assert route("fusion triple product") is lawson_triple_product
    assert route("gyroradius in B") is gyromotion
    assert route("cyclotron frequency") is gyromotion
    assert route("coulomb_log") is coulomb_log_collision
    assert route("saha ionization") is saha_ionization
    assert route("bremsstrahlung loss") is bremsstrahlung_power
    assert route("plasma_beta") is plasma_beta
    # generic 'plasma' defaults to plasma_frequency
    assert route("plasma") is plasma_frequency
    assert route("totally unrelated") is None


def test_route_table_has_all_eight_methods():
    fns = set(ROUTE_TABLE.values())
    assert {
        plasma_frequency,
        debye_length,
        lawson_triple_product,
        gyromotion,
        coulomb_log_collision,
        saha_ionization,
        bremsstrahlung_power,
        plasma_beta,
    } <= fns
