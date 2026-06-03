"""Verification tests for methods_optics — each asserts a computed result
matches a KNOWN published value.
"""
import numpy as np

from underworld.server.services.methods_optics import (
    thin_lens_image,
    diffraction_grating,
    fresnel_reflection,
    diffraction_limit,
    fiber_numerical_aperture,
    gaussian_beam,
    bragg_wavelength,
    snell_refraction,
)


def test_thin_lens_image_distance():
    # KNOWN: 1/f = 1/u + 1/v; u=30 cm, f=10 cm -> v=15 cm, m=-0.5.
    out = thin_lens_image(object_distance_m=0.30, focal_length_m=0.10)
    assert abs(out["image_distance_cm"] - 15.0) < 1e-6      # 15 cm
    assert abs(out["magnification"] - (-0.5)) < 1e-9        # m = -0.5
    assert out["is_real_image"] is True
    assert out["is_inverted"] is True


def test_diffraction_grating_first_order_30deg():
    # KNOWN: 500 nm, 1000 lines/mm (d=1 um), m=1 -> sin=0.5 -> theta=30 deg.
    out = diffraction_grating(wavelength_m=500e-9, lines_per_m=1.0e6, order=1)
    assert abs(out["grating_spacing_m"] - 1e-6) < 1e-12     # d = 1 um
    assert abs(out["sin_theta"] - 0.5) < 1e-12
    assert abs(out["angle_deg"] - 30.0) < 1e-6              # 30 degrees


def test_fresnel_normal_incidence_glass_4_percent():
    # KNOWN: air->glass (n=1.5) at normal incidence, R ~= 0.04 (~4%).
    out = fresnel_reflection(n1=1.0, n2=1.5, incidence_angle_deg=0.0)
    assert abs(out["reflectance_unpolarized"] - 0.04) < 1e-6   # 0.04
    assert abs(out["reflectance_s"] - 0.04) < 1e-6
    assert abs(out["reflectance_p"] - 0.04) < 1e-6
    assert abs(out["transmittance_unpolarized"] - 0.96) < 1e-6


def test_diffraction_limit_rayleigh_222nm():
    # KNOWN: 510 nm light, NA=1.4 -> Rayleigh resolution ~= 222 nm.
    out = diffraction_limit(wavelength_m=510e-9, numerical_aperture=1.4)
    assert abs(out["rayleigh_resolution_nm"] - 222.0) < 1.0     # ~222 nm
    # Abbe limit = lambda/(2 NA): for these numbers ~182 nm; and the
    # KNOWN ratio Rayleigh/Abbe = 0.61/0.5 = 1.22.
    ratio = out["rayleigh_resolution_nm"] / out["abbe_resolution_nm"]
    assert abs(ratio - 1.22) < 1e-9


def test_fiber_single_mode_cutoff_2405():
    # KNOWN: single-mode iff V < 2.405. Build a fiber with V just under 2.405.
    # NA = sqrt(1.45^2 - 1.446^2) ~= 0.1076; choose a, lambda to give V<2.405.
    sm = fiber_numerical_aperture(core_index=1.45, cladding_index=1.446,
                                  core_radius_m=4.0e-6, wavelength_m=1.55e-6)
    assert sm["is_single_mode"] is True
    assert sm["v_number"] < 2.405
    assert abs(sm["single_mode_cutoff_v"] - 2.405) < 1e-12
    # A larger core pushes V above 2.405 -> multimode.
    mm = fiber_numerical_aperture(core_index=1.45, cladding_index=1.446,
                                  core_radius_m=25.0e-6, wavelength_m=1.55e-6)
    assert mm["is_single_mode"] is False
    assert mm["v_number"] >= 2.405
    # NA sanity: sqrt(1.45^2 - 1.446^2)
    assert abs(sm["numerical_aperture"]
               - np.sqrt(1.45 ** 2 - 1.446 ** 2)) < 1e-12


def test_gaussian_beam_rayleigh_range_and_doubling():
    # KNOWN: z_R = pi w0^2 / lambda. w0=0.5 mm, lambda=500 nm -> ~1.571 m.
    out = gaussian_beam(waist_radius_m=0.5e-3, wavelength_m=500e-9)
    expected_zr = np.pi * (0.5e-3) ** 2 / 500e-9
    assert abs(out["rayleigh_range_m"] - expected_zr) < 1e-9
    assert abs(out["rayleigh_range_m"] - 1.5708) < 1e-3        # ~1.571 m
    # KNOWN defining property: at z = z_R the beam radius grows by sqrt(2)
    # (cross-sectional area doubles).
    at_zr = gaussian_beam(waist_radius_m=0.5e-3, wavelength_m=500e-9,
                          distance_m=out["rayleigh_range_m"])
    assert abs(at_zr["beam_radius_at_distance_m"]
               - 0.5e-3 * np.sqrt(2.0)) < 1e-12


def test_bragg_wavelength_telecom_1550nm():
    # KNOWN: lambda_B = 2 n_eff Lambda; n_eff=1.45, Lambda=534.4827 nm -> 1550 nm.
    out = bragg_wavelength(effective_index=1.45, grating_period_m=534.4827586e-9)
    assert abs(out["bragg_wavelength_nm"] - 1550.0) < 0.1      # ~1550 nm
    # exact relation check
    assert abs(out["bragg_wavelength_m"]
               - 2.0 * 1.45 * 534.4827586e-9) < 1e-15


def test_snell_critical_angle_glass_41_8deg():
    # KNOWN: glass (n=1.5) -> air (n=1.0), TIR critical angle ~= 41.81 deg.
    out = snell_refraction(n1=1.5, n2=1.0, incidence_angle_deg=30.0)
    assert abs(out["critical_angle_deg"] - 41.81) < 0.05       # ~41.8 deg
    # at 30 deg (< critical) light refracts, no TIR
    assert out["total_internal_reflection"] is False
    # beyond the critical angle -> total internal reflection
    tir = snell_refraction(n1=1.5, n2=1.0, incidence_angle_deg=50.0)
    assert tir["total_internal_reflection"] is True
    assert tir["refraction_angle_deg"] is None
    # Snell sanity: air->glass at 30 deg refracts toward normal (~19.47 deg).
    into = snell_refraction(n1=1.0, n2=1.5, incidence_angle_deg=30.0)
    assert abs(into["refraction_angle_deg"] - 19.471) < 0.01
