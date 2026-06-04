"""Each earth/climate/geoscience method must reproduce its KNOWN published value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_earth import (
    barometric_pressure,
    coriolis_parameter,
    dry_adiabatic_lapse_rate,
    earthquake_energy,
    manning_open_channel,
    radiative_equilibrium,
    radiometric_age,
    seismic_pwave_swave_ratio,
)


# 1. Atmospheric barometric formula — KNOWN: pressure ~halves at 5.5 km.
#    Ref: Barometric formula (Wikipedia); scale height H = RT/g.
def test_barometric_half_pressure_near_5_5_km():
    r = barometric_pressure(5500.0)
    assert abs(r["pressure_ratio"] - 0.5) < 0.05          # ~half at 5.5 km
    # half-pressure altitude is between 5 and 6 km
    assert 5.0 < r["half_pressure_altitude_km"] < 6.0
    # sea level returns full pressure
    assert abs(barometric_pressure(0.0)["pressure_ratio"] - 1.0) < 1e-9


# 2. Dry adiabatic lapse rate — KNOWN: g/cp ~= 9.8 K/km.
#    Ref: g=9.81 m/s^2, cp=1004 J/(kg.K).
def test_dry_adiabatic_lapse_rate_9_8():
    r = dry_adiabatic_lapse_rate()
    assert abs(r["lapse_rate_k_per_km"] - 9.8) < 0.05     # 9.8 K/km
    # 1 km of dry ascent cools by ~9.8 K
    assert abs((r["t_surface_k"] - r["t_at_dz_k"]) - 9.8) < 0.05


# 3. P-wave vs S-wave ratio — KNOWN: Poisson solid (nu=0.25) -> Vp/Vs = sqrt(3) ~= 1.73.
#    Ref: Vp/Vs = sqrt(2(1-nu)/(1-2nu)).
def test_pwave_swave_ratio_poisson_solid():
    r = seismic_pwave_swave_ratio(poisson_ratio=0.25)
    assert abs(r["vp_vs_ratio"] - math.sqrt(3.0)) < 0.01  # ~1.732
    assert abs(r["vp_vs_ratio"] - 1.73) < 0.01
    # S wave arrives after P wave
    assert r["s_minus_p_s"] > 0


# 4. Earthquake energy scaling — KNOWN: each magnitude unit = 10^1.5 ~= 31.6x energy.
#    Ref: Gutenberg-Richter log10(E)=1.5M+4.8 (USGS).
def test_earthquake_energy_ratio_per_magnitude():
    r = earthquake_energy(6.0, magnitude2=7.0)
    assert abs(r["energy_ratio"] - 10.0 ** 1.5) < 0.1     # ~31.6 per unit
    assert abs(r["energy_ratio_per_magnitude"] - 31.6) < 0.1
    # absolute energy of M6 from log10(E)=1.5*6+4.8=13.8
    assert abs(math.log10(r["energy_joules"]) - 13.8) < 1e-6


# 5. Manning's open-channel flow — KNOWN: rectangular 2 m x 1 m concrete channel
#    (n=0.013, S=0.001): hydraulic radius R=A/P=2/4=0.5 m, so
#    V=(1/0.013)*0.5^(2/3)*0.001^0.5 = 1.53 m/s and Q=A*V = 3.07 m^3/s.
#    Ref: Manning's equation V=(1/n)R^(2/3)S^(1/2), concrete n=0.013.
def test_manning_concrete_channel():
    r = manning_open_channel(width_m=2.0, depth_m=1.0, slope=0.001, n=0.013)
    assert abs(r["hydraulic_radius_m"] - 0.5) < 1e-9      # R = 2/4
    assert abs(r["velocity_m_s"] - 1.53) < 0.02           # ~1.53 m/s
    assert abs(r["discharge_m3_s"] - 3.07) < 0.05         # ~3.07 m^3/s


# 6. Coriolis parameter — KNOWN: f = 2*Omega*sin(phi); phi=45 deg -> ~1.03e-4 s^-1.
#    Ref: Coriolis frequency (Wikipedia); Omega=7.292e-5 rad/s.
def test_coriolis_parameter_at_45_deg():
    r = coriolis_parameter(45.0)
    assert abs(r["coriolis_parameter_s"] - 1.03e-4) < 0.02e-4
    # equator -> zero; pole -> 2*Omega
    assert abs(coriolis_parameter(0.0)["coriolis_parameter_s"]) < 1e-12
    assert abs(coriolis_parameter(90.0)["coriolis_parameter_s"] - 2 * 7.2921e-5) < 1e-9


# 7. Radiative energy balance — KNOWN: Earth Te ~= 255 K; surface ~= 288 K.
#    Ref: planetary equilibrium temperature; A=0.3, S=1361 W/m^2.
def test_radiative_equilibrium_earth():
    r = radiative_equilibrium(albedo=0.3)
    assert abs(r["equilibrium_temp_k"] - 255.0) < 2.0     # ~255 K (no greenhouse)
    assert abs(r["surface_temp_k"] - 288.0) < 2.0         # ~288 K (with greenhouse)
    assert r["greenhouse_warming_k"] > 0


# 8. Radiometric dating — KNOWN: C-14 T_half=5730 yr; one half-life (F=0.5) -> 5730 yr.
#    Ref: radiocarbon dating, half-life 5730 years.
def test_radiometric_one_half_life():
    r = radiometric_age(remaining_fraction=0.5, half_life_years=5730.0)
    assert abs(r["age_years"] - 5730.0) < 1.0             # one half-life
    assert abs(r["n_half_lives"] - 1.0) < 1e-6
    # two half-lives -> F=0.25
    assert abs(radiometric_age(remaining_fraction=0.25)["age_years"] - 11460.0) < 1.0
