"""Each tribology method must reproduce its KNOWN published or analytically
exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_tribology import (
    G_STD,
    amontons_coulomb_friction,
    archard_wear,
    hertz_sphere_flat,
    hersey_number,
    petroff_bearing_friction,
    rolling_resistance,
    stokes_drag,
    stribeck_lambda_ratio,
)


# 1. Amontons-Coulomb — KNOWN: F = mu*N = 50 N at mu=0.5, N=100 N; angle of
#    repose = atan(mu); mu = 1/sqrt(3) -> 30 deg exactly.
#    Ref: Amontons (1699) / Coulomb (1785).
def test_amontons_coulomb_friction_and_repose():
    r = amontons_coulomb_friction(100.0, 0.5)
    assert abs(r["friction_force_max_N"] - 50.0) < 1e-9      # F = mu*N
    # angle of repose = atan(mu); 1/sqrt(3) -> 30 deg
    r30 = amontons_coulomb_friction(100.0, 1.0 / math.sqrt(3.0))
    assert abs(r30["angle_of_repose_deg"] - 30.0) < 1e-9
    # mu = 1 -> 45 deg
    assert abs(amontons_coulomb_friction(1.0, 1.0)["angle_of_repose_deg"] - 45.0) < 1e-9
    # sliding onset: applied just above limiting friction slides, below sticks
    assert amontons_coulomb_friction(100.0, 0.5, applied_force_N=60.0)["is_sliding"]
    assert not amontons_coulomb_friction(100.0, 0.5, applied_force_N=40.0)["is_sliding"]
    stuck = amontons_coulomb_friction(100.0, 0.5, applied_force_N=40.0)
    assert stuck["net_tangential_force_N"] == 0.0


# 2. Archard wear — KNOWN: V = K*W*L/H = 1e-4*100*1000/2e9 = 5e-9 m^3.
#    Ref: Archard, J. Appl. Phys. 24, 981 (1953).
def test_archard_wear_known_volume():
    r = archard_wear(normal_load_N=100.0, sliding_distance_m=1000.0,
                     hardness_Pa=2e9, K=1e-4)
    assert abs(r["wear_volume_m3"] - 5e-9) < 1e-15           # V = K W L / H
    assert abs(r["wear_volume_mm3"] - 5.0) < 1e-6            # 5 mm^3
    # wear volume scales linearly with load and distance
    r2 = archard_wear(200.0, 1000.0, 2e9, 1e-4)
    assert abs(r2["wear_volume_m3"] / r["wear_volume_m3"] - 2.0) < 1e-9
    assert abs(r["wear_rate_m3_per_m"] - 5e-12) < 1e-18      # Q = K W / H


# 3. Hertz sphere-on-flat — KNOWN: P=10 N, R=0.01 m, steel/steel E=200 GPa
#    nu=0.3 -> a ~= 8.80e-5 m, p0 ~= 6.16e8 Pa; p0 = 1.5 * p_mean exactly.
#    Ref: Hertz (1882); Johnson, "Contact Mechanics" (1985).
def test_hertz_sphere_flat_known_contact():
    r = hertz_sphere_flat(load_N=10.0, radius_m=0.01,
                          E1_Pa=200e9, nu1=0.3, E2_Pa=200e9, nu2=0.3)
    # E* = 1/(2*(1-0.09)/200e9) = 1.0989e11 Pa
    assert abs(r["effective_modulus_Pa"] - 1.0989e11) < 1e8
    assert abs(r["contact_radius_m"] - 8.804e-5) < 1e-7     # a
    assert abs(r["max_pressure_Pa"] - 6.159e8) < 1e6        # p0
    # peak pressure is exactly 3/2 of the mean pressure for spherical Hertz
    assert abs(r["max_pressure_Pa"] - 1.5 * r["mean_pressure_Pa"]) < 1.0
    # contact radius scales as P^(1/3)
    r8 = hertz_sphere_flat(80.0, 0.01, 200e9, 0.3, 200e9, 0.3)
    assert abs(r8["contact_radius_m"] / r["contact_radius_m"] - 2.0) < 1e-6


# 4. Stribeck lambda ratio — KNOWN: h=0.4 um, Rq1=Rq2=0.1 um ->
#    sigma=0.14142 um, lambda=2.828 (mixed regime); lambda<1 boundary, >3 full.
#    Ref: Stribeck (1902); Hamrock, "Fundamentals of Fluid Film Lubrication".
def test_stribeck_lambda_regimes():
    r = stribeck_lambda_ratio(0.4e-6, 0.1e-6, 0.1e-6)
    assert abs(r["composite_roughness_m"] - math.sqrt(2) * 0.1e-6) < 1e-12
    assert abs(r["lambda_ratio"] - 2.8284271) < 1e-6
    assert r["regime"] == "mixed"
    # boundary regime: lambda < 1
    assert stribeck_lambda_ratio(0.05e-6, 0.1e-6, 0.1e-6)["regime"] == "boundary"
    # full-film regime: lambda > 3
    assert stribeck_lambda_ratio(1.0e-6, 0.1e-6, 0.1e-6)["regime"] == "full_film"


# 5. Petroff bearing friction — KNOWN: r=0.025, l=0.05, c=2.5e-5, mu=0.05 Pa s,
#    N'=30 rev/s -> T = 4*pi^2*r^3*l*mu*N'/c = 1.8506 N m.
#    Ref: Petroff (1883); Shigley, "Mechanical Engineering Design".
def test_petroff_friction_torque_known():
    r = petroff_bearing_friction(radius_m=0.025, length_m=0.05,
                                 clearance_m=2.5e-5, viscosity_Pa_s=0.05,
                                 speed_rev_s=30.0)
    expected = 4.0 * math.pi ** 2 * 0.025 ** 3 * 0.05 * 0.05 * 30.0 / 2.5e-5
    assert abs(r["friction_torque_Nm"] - expected) < 1e-9
    assert abs(r["friction_torque_Nm"] - 1.85055) < 1e-3
    # torque is linear in speed
    r2 = petroff_bearing_friction(0.025, 0.05, 2.5e-5, 0.05, 60.0)
    assert abs(r2["friction_torque_Nm"] / r["friction_torque_Nm"] - 2.0) < 1e-9
    # Petroff friction coefficient f = 2*pi^2*(mu N/p)*(r/c)
    rf = petroff_bearing_friction(0.025, 0.05, 2.5e-5, 0.05, 30.0,
                                  unit_load_Pa=1e6)
    f_exp = 2.0 * math.pi ** 2 * (0.05 * 30.0 / 1e6) * (0.025 / 2.5e-5)
    assert abs(rf["friction_coefficient"] - f_exp) < 1e-9


# 6. Stokes drag — KNOWN: r=1e-3 m, v=0.01 m/s, mu=1.0 Pa s ->
#    F = 6*pi*mu*r*v = 1.8850e-4 N; terminal velocity balances net weight.
#    Ref: Stokes (1851); Batchelor, "An Introduction to Fluid Dynamics".
def test_stokes_drag_and_terminal_velocity():
    r = stokes_drag(radius_m=1e-3, velocity_m_s=0.01, viscosity_Pa_s=1.0)
    assert abs(r["drag_force_N"] - 6.0 * math.pi * 1.0 * 1e-3 * 0.01) < 1e-12
    assert abs(r["drag_force_N"] - 1.8850e-4) < 1e-7        # F = 6 pi mu r v
    # terminal velocity: at v_t, drag = net weight (buoyant)
    rt = stokes_drag(radius_m=1e-3, velocity_m_s=0.0, viscosity_Pa_s=1.0,
                     fluid_density_kg_m3=1000.0, sphere_density_kg_m3=2000.0)
    v_t = rt["terminal_velocity_m_s"]
    v_expect = 2.0 * (2000.0 - 1000.0) * G_STD * (1e-3) ** 2 / (9.0 * 1.0)
    assert abs(v_t - v_expect) < 1e-12
    # at terminal velocity, Stokes drag equals net (gravity - buoyancy) weight
    net_weight = (4.0 / 3.0) * math.pi * (1e-3) ** 3 * (2000.0 - 1000.0) * G_STD
    drag_at_vt = 6.0 * math.pi * 1.0 * 1e-3 * v_t
    assert abs(drag_at_vt - net_weight) < 1e-12


# 7. Rolling resistance — KNOWN: C_rr=0.01, N=1000 N -> F_rr = 10 N;
#    with r=0.3 m the dimensional arm b = C_rr*r = 0.003 m.
#    Ref: Coulomb rolling-friction model; "Rolling resistance" (Wikipedia).
def test_rolling_resistance_force_and_arm():
    r = rolling_resistance(normal_load_N=1000.0, c_rr=0.01)
    assert abs(r["rolling_resistance_force_N"] - 10.0) < 1e-9    # F = C_rr*N
    rb = rolling_resistance(1000.0, 0.01, wheel_radius_m=0.3)
    assert abs(rb["resistance_arm_b_m"] - 0.003) < 1e-12         # b = C_rr*r
    # rolling resistance is far smaller than sliding friction for same load
    sliding = amontons_coulomb_friction(1000.0, 0.5)["friction_force_max_N"]
    assert r["rolling_resistance_force_N"] < sliding


# 8. Hersey number — KNOWN: mu=0.05 Pa s, N=30 rev/s, P=1e6 Pa ->
#    H = mu*N/P = 1.5e-6 (dimensionless); film thickness ~ H.
#    Ref: Hersey (1914); Stribeck curve (Wikipedia).
def test_hersey_number_known():
    r = hersey_number(viscosity_Pa_s=0.05, speed_rev_s=30.0, pressure_Pa=1e6)
    assert abs(r["hersey_number"] - 1.5e-6) < 1e-12         # H = mu N / P
    # film thickness estimate proportional to Hersey number
    rf = hersey_number(0.05, 30.0, 1e6, radius_m=0.025, clearance_m=2.5e-5)
    h_exp = 2.0 * math.pi ** 2 * 0.025 * 1.5e-6
    assert abs(rf["min_film_thickness_m"] - h_exp) < 1e-15
    # doubling speed doubles the Hersey number
    r2 = hersey_number(0.05, 60.0, 1e6)
    assert abs(r2["hersey_number"] / r["hersey_number"] - 2.0) < 1e-9
