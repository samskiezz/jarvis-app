"""Tests for real photonics models — assert optics laws."""
import math

from underworld.server.services import photonics as ph


def test_lensmaker_symmetric_lens():
    # symmetric biconvex: R1=+r, R2=-r -> 1/f=(n-1)(2/r)
    f = ph.lensmaker(n=1.5, r1=0.1, r2=-0.1)
    assert abs(f - 1.0 / ((1.5 - 1) * (2 / 0.1))) < 1e-9


def test_thin_lens_image_formation():
    img = ph.thin_lens_image(focal_length=0.1, object_distance=0.3)
    # 1/di = 1/0.1 - 1/0.3 -> di = 0.15
    assert abs(img["image_distance"] - 0.15) < 1e-6
    assert img["real_image"] is True


def test_telescope_magnification():
    assert ph.telescope_magnification(focal_objective=1000, focal_eyepiece=20) == 50


def test_laser_threshold_condition():
    below = ph.laser_threshold(gain_coeff=1, length=0.1, loss=5, mirror_r1=0.9, mirror_r2=0.9)
    above = ph.laser_threshold(gain_coeff=100, length=0.1, loss=5, mirror_r1=0.99, mirror_r2=0.99)
    assert below["lasing"] is False
    assert above["lasing"] is True


def test_fibre_numerical_aperture():
    na = ph.fibre_numerical_aperture(n_core=1.5, n_clad=1.48)
    assert abs(na["numerical_aperture"] - math.sqrt(1.5**2 - 1.48**2)) < 1e-4


def test_fibre_attenuation_reduces_power():
    out = ph.fibre_attenuation(power_in=1.0, length_km=10, alpha_db_per_km=0.2)
    assert out["loss_db"] == 2.0
    assert out["power_out"] < 1.0


def test_mach_zehnder_switching():
    on = ph.mach_zehnder(phase_diff=0.0)          # constructive -> bar port high
    off = ph.mach_zehnder(phase_diff=math.pi)     # destructive -> bar port low
    assert on["transmission"] > 0.99
    assert off["transmission"] < 0.01


def test_microring_resonance():
    r = ph.microring(radius_um=10, n_group=4.0, wavelength_nm=1550, q_factor=10000)
    assert r["fsr_nm"] > 0 and r["linewidth_nm"] > 0
    assert r["finesse"] > 1


def test_photodetector_snr_rises_with_power():
    weak = ph.photodetector(optical_power=1e-6)["snr"]
    strong = ph.photodetector(optical_power=1e-3)["snr"]
    assert strong > weak


def test_optical_matrix_multiply_is_real_linear_algebra():
    out = ph.optical_matrix_multiply([[1, 0], [0, 2]], [3, 4])
    assert out["output"] == [3.0, 8.0]


def test_photonic_neural_layer_relu():
    out = ph.photonic_neural_layer([[1, -1], [-1, -1]], [1, 2])
    # z = [1-2, -1-2] = [-1, -3] -> ReLU -> [0, 0]
    assert out["activations"] == [0.0, 0.0]


def test_reflection_fresnel_normal():
    # air->glass normal reflectance ~4%
    r = ph.reflection_model(n1=1.0, n2=1.5)
    assert abs(r["reflectance_normal"] - 0.04) < 0.005


def test_microscope_abbe_resolution():
    d = ph.microscope_optics(wavelength_nm=500, numerical_aperture=1.0)["resolution_nm"]
    assert abs(d - 250) < 1e-6                          # 500/(2*1)


def test_telescope_rayleigh_resolution():
    bigger = ph.telescope_optics(aperture_m=1.0, wavelength_nm=550)["arcsec"]
    smaller = ph.telescope_optics(aperture_m=0.1, wavelength_nm=550)["arcsec"]
    assert smaller > bigger                             # smaller aperture -> worse


def test_prism_disperses_blue_more():
    p = ph.prism_spectroscopy(n_red=1.51, n_blue=1.53)
    assert p["angular_dispersion_deg"] > 0
