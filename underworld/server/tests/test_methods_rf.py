"""Each RF / antenna method must reproduce its KNOWN published / analytic value.

Citations are inline in methods_rf.py. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_rf import (
    antenna_aperture_gain,
    aperture_beamwidth_directivity,
    doppler_shift,
    free_space_path_loss,
    friis_transmission,
    link_budget,
    radar_range_equation,
    skin_depth,
)


# 1. Friis transmission — KNOWN: Pt=1 W, Gt=Gr=1, f=300 MHz (lambda=1 m), d=1000 m
#    -> Pr = (1/(4*pi*1000))^2 = 6.333e-9 W.
def test_friis_isotropic_link():
    r = friis_transmission(1.0, 1.0, 1.0, 3.0e8, 1000.0)
    # lambda = c/300MHz ~= 0.99931 m, so Pr ~= (lambda/(4*pi*1000))^2
    expected = (r["wavelength_m"] / (4.0 * math.pi * 1000.0)) ** 2
    assert abs(r["pr_w"] - expected) / expected < 1e-6
    assert abs(r["wavelength_m"] - 0.99931) < 0.01      # c/300MHz ~= 1 m


# 2. Free-space path loss — KNOWN: d=1000 m, f=300 MHz -> ~81.98 dB.
def test_fspl_known():
    r = free_space_path_loss(1000.0, 3.0e8)
    assert abs(r["fspl_db"] - 81.98) < 0.1


# 3. Radar range equation — KNOWN: 1/R^4 law; r_max from Pr_min is the 4th-root range.
def test_radar_range_law():
    near = radar_range_equation(1000.0, 100.0, 1.0, 1.0e9, dist_m=1000.0)
    far = radar_range_equation(1000.0, 100.0, 1.0, 1.0e9, dist_m=2000.0)
    # doubling range drops received power by 12.04 dB (factor 16)
    assert abs((near["pr_dbw"] - far["pr_dbw"]) - 12.04) < 0.05
    rmax = radar_range_equation(1000.0, 100.0, 1.0, 1.0e9, pr_min_w=1e-12)
    assert rmax["r_max_m"] > 0


# 4. Antenna aperture gain — KNOWN: Ae=1 m^2 at lambda=0.1 m -> G = 4*pi/0.01 = 1256.6.
def test_aperture_gain():
    r = antenna_aperture_gain(1.0, 2.997925e9)          # lambda = 0.1 m
    assert abs(r["gain"] - 4.0 * math.pi / 0.01) < 1.0
    assert abs(r["gain"] - 1256.64) < 1.0


# 5. Aperture beamwidth & directivity — KNOWN: D/lambda=10 -> HPBW~7 deg, dir = pi^2*100 = 986.96.
def test_beamwidth_directivity():
    r = aperture_beamwidth_directivity(1.0, 2.997925e9)  # D/lambda = 10
    assert abs(r["hpbw_deg"] - 7.0) < 0.5
    assert abs(r["directivity"] - math.pi ** 2 * 100.0) < 1.0


# 6. Link budget — KNOWN: received level = EIRP - FSPL + Gr (consistency check).
def test_link_budget_consistency():
    r = link_budget(10.0, 20.0, 20.0, 1.0e9, 1000.0, bandwidth_hz=1.0e6)
    # EIRP = Pt + Gt = 30 dBW; received carrier = EIRP - FSPL + Gr.
    assert abs(r["eirp_dbw"] - 30.0) < 1e-6
    assert abs(r["rx_carrier_dbw"] - (30.0 - r["fspl_db"] + 20.0)) < 1e-6


# 7. Doppler shift — KNOWN: f=1 GHz, v=300 m/s -> delta_f = 1e9*300/2.99792458e8 = 1000.69 Hz.
def test_doppler_shift():
    r = doppler_shift(1.0e9, 300.0)
    assert abs(r["delta_f_hz"] - 1000.69) < 0.5


# 8. Skin depth — KNOWN: copper sigma=5.96e7 S/m, mu_r=1, f=60 Hz -> delta ~= 8.43 mm.
def test_skin_depth_copper_60hz():
    r = skin_depth(60.0, 5.96e7)
    assert abs(r["skin_depth_m"] - 0.00843) < 0.0003
