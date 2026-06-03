"""Astrodynamics verified against known NASA-grade values."""
from underworld.server.services import aerospace as A


def test_earth_escape_velocity():
    assert abs(A.escape_velocity()["escape_velocity_kms"] - 11.19) < 0.05   # 11.19 km/s


def test_leo_circular_velocity():
    v = A.circular_velocity(r_km=6678.0)["speed_kms"]      # ~400 km altitude LEO
    assert abs(v - 7.73) < 0.1                             # ~7.7 km/s


def test_iss_orbital_period():
    p = A.orbital_period(a_km=6778.0)["period_min"]
    assert 90 < p < 95                                     # ISS ~92.7 min


def test_hohmann_leo_to_geo_total_dv():
    r = A.hohmann_transfer(r1_km=6678.0, r2_km=42164.0)
    assert abs(r["total_dv_kms"] - 3.9) < 0.15             # known ≈ 3.9 km/s
    assert 5.0 < r["transfer_time_hr"] < 5.5               # ~5.25 h


def test_tsiolkovsky_known_mass_ratio():
    # Isp 300 s, mass ratio e → Δv = 300·9.80665·ln(e) = 2942 m/s
    r = A.tsiolkovsky(isp_s=300.0, mass_initial=2.718281828, mass_final=1.0)
    assert abs(r["delta_v_ms"] - 2942.0) < 5


def test_vis_viva_matches_circular():
    # on a circular orbit (a=r) vis-viva reduces to circular velocity
    r = 7000.0
    assert abs(A.vis_viva(r_km=r, a_km=r)["speed_kms"]
               - A.circular_velocity(r_km=r)["speed_kms"]) < 1e-6


def test_launch_budget_reaches_leo():
    assert A.launch_budget(payload_kg=1000, dry_kg=2000, propellant_kg=60000, isp_s=350)["reaches_leo"]
