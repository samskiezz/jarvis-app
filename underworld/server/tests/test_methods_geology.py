"""Each geology / planetary-science method must reproduce its KNOWN published value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_geology import (
    airy_root_depth,
    geothermal_heat_flow,
    hydrostatic_pressure,
    impact_crater_diameter,
    planetary_mass,
    plate_velocity,
    radiogenic_heat,
    seismic_moment,
)


# 1. Airy isostasy — KNOWN: r = h*rho_c/(rho_m-rho_c); rho_c=2670, rho_m=3300
#    -> root ~4.24x height, an 8 km peak has a ~34 km root ("roots ~5x height").
#    Ref: Isostasy (Wikipedia); Airy-Heiskanen model.
def test_airy_root_depth_mountain():
    r = airy_root_depth(elevation_m=8000.0, rho_crust=2670.0, rho_mantle=3300.0)
    assert abs(r["root_to_height_ratio"] - 2670.0 / (3300.0 - 2670.0)) < 1e-9
    assert abs(r["root_depth_km"] - 33.9) < 0.2          # ~34 km root
    assert 4.0 < r["root_to_height_ratio"] < 4.5         # roots several x height
    # zero elevation -> zero root
    assert abs(airy_root_depth(elevation_m=0.0)["root_depth_m"]) < 1e-9


# 2. Geothermal gradient & heat flow — KNOWN: gradient ~25-30 K/km; with
#    k~2.5 W/(m.K) -> heat flow ~60-75 mW/m^2 (continental mean ~65 mW/m^2).
#    Ref: Geothermal gradient (Wikipedia); Fourier q = k dT/dz.
def test_geothermal_gradient_and_heat_flow():
    r = geothermal_heat_flow(gradient_k_per_km=27.0, thermal_conductivity=2.5)
    assert 25.0 <= r["gradient_k_per_km"] <= 30.0        # 25-30 K/km
    assert abs(r["heat_flow_mw_m2"] - 67.5) < 0.1        # 2.5 * 27
    assert 60.0 < r["heat_flow_mw_m2"] < 75.0            # continental range
    # gradient derived from a measured temperature pair
    r2 = geothermal_heat_flow(surface_temp_k=288.0, temp_at_depth_k=315.0, depth_m=1000.0)
    assert abs(r2["gradient_k_per_km"] - 27.0) < 1e-9


# 3. Plate-tectonic velocity — KNOWN: a stripe 225 km from the ridge dated at
#    4.5 Myr gives a full spreading rate of 5 cm/yr.
#    Ref: Seafloor spreading (Wikipedia); rate = distance / age.
def test_plate_velocity_seafloor_spreading():
    r = plate_velocity(distance_km=225.0, age_myr=4.5)
    assert abs(r["velocity_cm_per_yr"] - 5.0) < 1e-6     # 5 cm/yr
    assert abs(r["velocity_mm_per_yr"] - 50.0) < 1e-6
    # half-rate is exactly half
    assert abs(plate_velocity(half_rate=True)["velocity_cm_per_yr"] - 2.5) < 1e-6


# 4. Impact-crater scaling — KNOWN: final crater ~10-20x projectile diameter for
#    typical hypervelocity impacts; diameter rises with v & L, falls with g.
#    Ref: pi-group / point-source coupling scaling (Holsapple 1993; Melosh 1989).
def test_impact_crater_diameter_trend():
    r = impact_crater_diameter(projectile_diameter_m=1000.0, velocity_m_s=20000.0)
    assert 10.0 < r["diameter_ratio"] < 20.0             # ~10-20x projectile
    # faster impactor -> bigger crater
    assert (impact_crater_diameter(velocity_m_s=40000.0)["transient_diameter_m"]
            > impact_crater_diameter(velocity_m_s=20000.0)["transient_diameter_m"])
    # weaker gravity (Moon) -> bigger crater for same impactor
    assert (impact_crater_diameter(gravity_m_s2=1.62)["transient_diameter_m"]
            > impact_crater_diameter(gravity_m_s2=9.81)["transient_diameter_m"])
    # bigger projectile -> bigger crater
    assert (impact_crater_diameter(projectile_diameter_m=2000.0)["transient_diameter_m"]
            > impact_crater_diameter(projectile_diameter_m=1000.0)["transient_diameter_m"])


# 5. Radiogenic heat & decay — KNOWN: granite ~2-3 uW/m^3 (rho~2700, H~9.6e-10
#    W/kg -> ~2.6 uW/m^3); U-238 half-life 4.468 Gyr: one half-life leaves 50%.
#    Ref: radiogenic heat production; U-238 half-life 4.468e9 yr.
def test_radiogenic_heat_and_half_life():
    r = radiogenic_heat(rho_rock=2700.0, heat_gen_per_mass=9.6e-10,
                        half_life_yr=4.468e9, elapsed_yr=4.468e9)
    assert 2.0 < r["heat_production_uw_m3"] < 3.0        # granite ~2-3 uW/m^3
    assert abs(r["heat_production_uw_m3"] - 2.592) < 1e-3
    # one half-life -> 50% of parent remains
    assert abs(r["remaining_fraction"] - 0.5) < 1e-6
    assert abs(r["n_half_lives"] - 1.0) < 1e-9
    # two half-lives -> 25%
    assert abs(radiogenic_heat(elapsed_yr=2 * 4.468e9)["remaining_fraction"] - 0.25) < 1e-6


# 6. Seismic moment — KNOWN: M0 = mu*A*D; mu=3e10 Pa, A=1e9 m^2, D=5 m
#    -> M0 = 1.5e20 N.m and Mw ~= 7.4 (Hanks-Kanamori Mw=(2/3)log10 M0 - 6.07).
#    Ref: Seismic moment / moment magnitude scale.
def test_seismic_moment_and_magnitude():
    r = seismic_moment(rigidity_pa=3.0e10, rupture_area_m2=1.0e9, slip_m=5.0)
    assert abs(r["seismic_moment_nm"] - 1.5e20) < 1e14   # mu*A*D = 1.5e20
    assert abs(r["moment_magnitude_mw"] - 7.4) < 0.05    # ~7.4 great quake
    # dyne-cm conversion: 1 N.m = 1e7 dyne-cm
    assert abs(r["seismic_moment_dyne_cm"] - 1.5e27) < 1e21


# 7. Hydrostatic pressure — KNOWN: in water p = rho*g*h; at 1000 m depth
#    gauge ~= 9.81e6 Pa (~98 atm), i.e. ~1 atm per ~10.06 m.
#    Ref: hydrostatic / fluid pressure p = rho g h.
def test_hydrostatic_pressure_at_depth():
    r = hydrostatic_pressure(depth_m=1000.0, rho=1000.0)
    assert abs(r["gauge_pressure_pa"] - 1000.0 * 9.80665 * 1000.0) < 1e-3
    assert abs(r["gauge_pressure_pa"] - 9.80665e6) < 1.0  # ~9.81 MPa
    assert abs(r["gauge_pressure_atm"] - 96.8) < 0.2      # ~97 atm gauge
    assert abs(r["depth_per_atm_m"] - 10.33) < 0.05       # ~1 atm per ~10 m
    # pressure scales linearly with depth
    assert abs(hydrostatic_pressure(depth_m=2000.0)["gauge_pressure_pa"]
               - 2.0 * r["gauge_pressure_pa"]) < 1e-3


# 8. Planetary mass — KNOWN: M = g R^2 / G; g=9.80665, R=6.371e6, G=6.674e-11
#    -> M ~= 5.97e24 kg, mean density ~5510 kg/m^3 (Earth).
#    Ref: surface gravity g = GM/R^2; Earth mass 5.972e24 kg.
def test_planetary_mass_of_earth():
    r = planetary_mass()
    assert abs(r["mass_kg"] - 5.97e24) < 0.05e24         # ~5.97e24 kg
    assert abs(r["mean_density_kg_m3"] - 5510.0) < 30.0  # Earth mean density
    # GM product matches g*R^2 exactly
    assert abs(r["gm_product"] - 9.80665 * (6.371e6) ** 2) < 1e6
