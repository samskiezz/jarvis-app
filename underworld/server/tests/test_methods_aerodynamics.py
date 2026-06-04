"""Each aerodynamics method must reproduce its KNOWN published or analytically
exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_aerodynamics import (
    A_SEA_LEVEL,
    RHO_SEA_LEVEL,
    drag_polar,
    glide_performance,
    isentropic_stagnation,
    lift_force,
    mach_number,
    pitot_airspeed,
    prandtl_glauert,
    thin_airfoil_lift,
)


# 1. Lift equation — KNOWN: rho=1.225, V=100, S=16.2, C_L=0.5 -> L=49612.5 N.
#    Ref: NASA Glenn "The Lift Equation"; Anderson, Fundamentals of Aerodynamics.
def test_lift_force_known_value():
    r = lift_force(1.225, 100.0, 16.2, 0.5)
    assert abs(r["lift_n"] - 49612.5) < 1e-3
    assert abs(r["dynamic_pressure_pa"] - 6125.0) < 1e-6
    # lift scales with V^2: doubling V quadruples L
    r2 = lift_force(1.225, 200.0, 16.2, 0.5)
    assert abs(r2["lift_n"] / r["lift_n"] - 4.0) < 1e-9


# 2. Drag polar / induced drag — KNOWN: C_D0=0.02, C_L=0.5, e=0.8, AR=10 ->
#    C_Di = 0.5^2/(pi*0.8*10) = 0.0099472, C_D = 0.0299472.
#    Ref: Prandtl lifting-line theory; NASA Glenn "Induced Drag Coefficient".
def test_drag_polar_induced_drag():
    r = drag_polar(1.225, 100.0, 16.2, 0.5, 0.02, 10.0, oswald_e=0.8)
    assert abs(r["cd_induced"] - 0.0099472) < 1e-6
    assert abs(r["cd"] - 0.0299472) < 1e-6
    # induced drag grows with C_L^2
    r2 = drag_polar(1.225, 100.0, 16.2, 1.0, 0.02, 10.0, oswald_e=0.8)
    assert abs(r2["cd_induced"] / r["cd_induced"] - 4.0) < 1e-9
    # higher aspect ratio reduces induced drag
    r3 = drag_polar(1.225, 100.0, 16.2, 0.5, 0.02, 20.0, oswald_e=0.8)
    assert r3["cd_induced"] < r["cd_induced"]


# 3. Pitot-static airspeed — KNOWN: q = 6125 Pa at rho=1.225 -> V = 100 m/s.
#    Ref: Bernoulli; NASA Glenn "Pitot-Static (Prandtl) Tube".
def test_pitot_airspeed_known_value():
    # p_total - p_static = 6125 Pa
    r = pitot_airspeed(101325.0 + 6125.0, 101325.0, 1.225)
    assert abs(r["velocity_ms"] - 100.0) < 1e-9
    assert abs(r["dynamic_pressure_pa"] - 6125.0) < 1e-9
    # inverse of the lift-equation dynamic pressure
    assert abs(pitot_airspeed(106125.0, 100000.0, 1.225)["velocity_ms"] - 100.0) < 1e-9


# 4. Speed of sound & Mach — KNOWN: T=288.15 K -> a=340.29 m/s;
#    V=170.146 m/s -> M=0.5.
#    Ref: NASA Glenn "Speed of Sound" / "Mach Number".
def test_mach_and_speed_of_sound():
    r = mach_number(170.14614343263852, 288.15)
    assert abs(r["speed_of_sound_ms"] - 340.294) < 0.01
    assert abs(r["speed_of_sound_ms"] - A_SEA_LEVEL) < 0.01
    assert abs(r["mach"] - 0.5) < 1e-6
    assert r["regime"] == "subsonic"
    # supersonic classification
    assert mach_number(680.0, 288.15)["regime"] == "supersonic"


# 5. Prandtl-Glauert — KNOWN: M=0.6 -> beta=0.8, factor=1.25; C_p0=-0.4 -> -0.5.
#    Ref: Prandtl-Glauert rule (Glauert 1928).
def test_prandtl_glauert_correction():
    r = prandtl_glauert(-0.4, 0.6)
    assert abs(r["beta"] - 0.8) < 1e-9
    assert abs(r["correction_factor"] - 1.25) < 1e-9
    assert abs(r["cp_corrected"] - (-0.5)) < 1e-9
    # incompressible limit M->0: no correction
    assert abs(prandtl_glauert(-0.4, 0.0)["correction_factor"] - 1.0) < 1e-12


# 6. Isentropic stagnation ratios — KNOWN: M=1, gamma=1.4 -> T0/T=1.2,
#    p0/p = 1.2^3.5 = 1.892929.
#    Ref: NASA Glenn "Isentropic Flow Relations".
def test_isentropic_stagnation_ratios():
    r = isentropic_stagnation(1.0)
    assert abs(r["t0_over_t"] - 1.2) < 1e-12
    assert abs(r["p0_over_p"] - 1.8929291587) < 1e-9
    # M=0 -> all ratios are unity
    z = isentropic_stagnation(0.0)
    assert abs(z["t0_over_t"] - 1.0) < 1e-12
    assert abs(z["p0_over_p"] - 1.0) < 1e-12
    # stagnation temperature uses the supplied static T
    assert abs(r["stagnation_temperature_k"] - 288.15 * 1.2) < 1e-6


# 7. Thin-airfoil theory — KNOWN: 2-D lift-curve slope = 2*pi = 6.28319 /rad;
#    at alpha=5 deg, c_l = 2*pi*rad(5) = 0.548311.
#    Ref: Thin airfoil theory (Glauert/Munk); Anderson, Fundamentals of Aero.
def test_thin_airfoil_lift_slope():
    r = thin_airfoil_lift(5.0)
    assert abs(r["lift_curve_slope_per_rad"] - 2.0 * math.pi) < 1e-12
    assert abs(r["cl"] - 2.0 * math.pi * math.radians(5.0)) < 1e-12
    assert abs(r["cl"] - 0.5483113556) < 1e-9
    # zero lift at the zero-lift angle of attack
    assert abs(thin_airfoil_lift(2.0, alpha_l0_deg=2.0)["cl"]) < 1e-12
    # finite-wing slope is reduced below 2*pi by induced downwash
    fw = thin_airfoil_lift(5.0, aspect_ratio=10.0)
    assert fw["lift_curve_slope_per_rad"] < 2.0 * math.pi
    assert abs(fw["lift_curve_slope_per_rad"] - 5.2359877) < 1e-6


# 8. Glide performance — KNOWN: C_D0=0.02, e=0.8, AR=10 ->
#    (L/D)_max = 0.5*sqrt(pi*0.8*10/0.02) = 17.7245.
#    Ref: Anderson, Aircraft Performance and Design.
def test_glide_best_ld_and_sink():
    r = glide_performance(0.02, 10.0, oswald_e=0.8)
    assert abs(r["ld_max"] - 17.7245385) < 1e-6
    assert abs(r["cl_optimal"] - 0.7089815) < 1e-6
    # glide angle = atan(1 / L/D)
    assert abs(r["glide_angle_deg"] - math.degrees(math.atan2(1.0, r["ld_max"]))) < 1e-9
    # with weight & area: best-glide speed and sink rate are positive & consistent
    rp = glide_performance(0.02, 10.0, oswald_e=0.8,
                           weight_n=8000.0, wing_area_m2=16.2,
                           density_kg_m3=RHO_SEA_LEVEL)
    v = rp["best_glide_speed_ms"]
    assert v > 0.0
    # sink rate = V * sin(gamma)
    assert abs(rp["sink_rate_ms"]
               - v * math.sin(math.radians(rp["glide_angle_deg"]))) < 1e-9
