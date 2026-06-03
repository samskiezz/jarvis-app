"""Verification tests for methods_astronomy — each asserts a computed result
matches a KNOWN published astronomy/cosmology value.
"""
import numpy as np

from underworld.server.services.methods_astronomy import (
    hubble_recession_velocity,
    stellar_luminosity,
    cosmological_redshift,
    chandrasekhar_mass,
    orbital_period,
    escape_velocity,
    wien_peak_colour,
    schwarzschild_radius,
    roche_limit,
)


def test_hubble_recession_velocity_1mpc():
    # KNOWN: Hubble's law v = H0*d; Planck 2018 H0 = 67.4 km/s/Mpc,
    # so at d = 1 Mpc the recession velocity is 67.4 km/s.
    out = hubble_recession_velocity(distance_mpc=1.0)
    assert abs(out["velocity_km_s"] - 67.4) < 1e-6        # 67.4 km/s
    # Hubble time 1/H0 is of order the age of the universe (~14.5 Gyr).
    assert 13.0 < out["hubble_time_gyr"] < 15.5


def test_stellar_luminosity_sun_3_828e26_W():
    # KNOWN: Stefan-Boltzmann L=4*pi*R^2*sigma*T^4; for the Sun
    # (R=6.957e8 m, T=5772 K) -> nominal solar luminosity ~3.828e26 W.
    out = stellar_luminosity(radius_m=6.957e8, temperature_k=5772.0)
    rel_err = abs(out["luminosity_w"] - 3.828e26) / 3.828e26
    assert rel_err < 0.01                                 # within 1% of 3.828e26 W
    assert abs(out["luminosity_solar"] - 1.0) < 0.01      # ~1 Lsun


def test_cosmological_redshift_z1_scale_factor_half():
    # KNOWN: scale factor a = 1/(1+z); at z=1, a=0.5 and lambda doubles.
    out = cosmological_redshift(redshift_z=1.0)
    assert abs(out["scale_factor"] - 0.5) < 1e-12         # a = 0.5
    assert abs(out["wavelength_stretch"] - 2.0) < 1e-12   # wavelengths doubled


def test_chandrasekhar_mass_1_4_solar():
    # KNOWN: for mu_e=2 (C/O white dwarf), the Chandrasekhar limit ~1.4 Msun.
    out = chandrasekhar_mass(mean_molecular_weight_per_electron=2.0)
    assert abs(out["mass_solar"] - 1.4) < 0.1             # ~1.4 Msun


def test_orbital_period_earth_one_year():
    # KNOWN: Newton/Kepler P=2*pi*sqrt(a^3/(G*M)); Earth at 1 AU around the
    # Sun has a period of 1 year.
    au = 1.495978707e11
    out = orbital_period(semi_major_axis_m=au)
    assert abs(out["period_years"] - 1.0) < 0.01          # 1 year


def test_escape_velocity_earth_11_2_km_s():
    # KNOWN: v_esc=sqrt(2GM/R); Earth -> 11.2 km/s, surface gravity ~9.8 m/s^2.
    out = escape_velocity()
    assert abs(out["escape_velocity_km_s"] - 11.2) < 0.1  # 11.2 km/s
    assert abs(out["surface_gravity_m_s2"] - 9.81) < 0.1  # ~9.8 m/s^2


def test_wien_peak_colour_sun_502nm():
    # KNOWN: Wien's law lambda_max=b/T; Sun (5772 K) peaks at ~502 nm (green).
    out = wien_peak_colour(temperature_k=5772.0)
    assert abs(out["peak_wavelength_nm"] - 502.0) < 2.0   # ~502 nm
    assert out["colour"] == "green"


def test_schwarzschild_radius_sun_2_95_km():
    # KNOWN: r_s=2GM/c^2; Schwarzschild radius of the Sun ~2.95 km.
    out = schwarzschild_radius()
    assert abs(out["radius_km"] - 2.95) < 0.02            # 2.95 km


def test_roche_limit_rigid_coefficient():
    # KNOWN: rigid-body Roche limit d=2.44*R*(rho_p/rho_s)^(1/3); for equal
    # densities the prefactor is exactly 2.44*R.
    out = roche_limit(primary_radius_m=1.0, primary_density=1.0,
                      satellite_density=1.0)
    assert abs(out["roche_limit_m"] - 2.44) < 1e-9        # 2.44 * R
    assert abs(out["density_ratio_cuberoot"] - 1.0) < 1e-12
