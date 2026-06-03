"""Verification tests for methods_fluids — each asserts a computed result
matches a KNOWN published fluid-dynamics / aerodynamics value.
"""
import numpy as np

from underworld.server.services.methods_fluids import (
    bernoulli_pressure,
    lift_coefficient_force,
    drag_terminal_velocity,
    reynolds_number,
    blasius_boundary_layer,
    speed_of_sound_mach,
    normal_shock_relations,
    hagen_poiseuille_flow,
)


def test_bernoulli_static_pressure_drop():
    # KNOWN: on a level streamline, accelerating still air (v1=0) to 50 m/s
    # drops the static pressure by the dynamic pressure 1/2 rho v^2.
    # 1/2 * 1.225 * 50^2 = 1531.25 Pa  ->  p2 = 101325 - 1531.25 = 99793.75 Pa.
    out = bernoulli_pressure(pressure1_pa=101325.0, velocity1_ms=0.0,
                             velocity2_ms=50.0, density_kg_m3=1.225)
    assert abs(out["dynamic_pressure2_pa"] - 1531.25) < 1e-6
    assert abs(out["pressure2_pa"] - 99793.75) < 1e-6
    # stagnation pressure = static + dynamic at the upstream point
    assert abs(out["stagnation_pressure_pa"] - 101325.0) < 1e-6  # v1=0


def test_lift_force_equation():
    # KNOWN: L = 1/2 rho v^2 S C_L. rho=1.225, v=50, S=16.2, C_L=1.0
    # -> q = 1531.25 Pa, L = 1531.25 * 16.2 = 24806.25 N.
    out = lift_coefficient_force(density_kg_m3=1.225, velocity_ms=50.0,
                                 wing_area_m2=16.2, lift_coefficient=1.0)
    assert abs(out["dynamic_pressure_pa"] - 1531.25) < 1e-6
    assert abs(out["lift_force_n"] - 24806.25) < 1e-4


def test_drag_terminal_velocity_of_sphere():
    # KNOWN: at terminal velocity, drag force exactly balances weight m g.
    # Steel sphere (rho_steel=7850, d=0.0381 m): m = rho * (4/3) pi r^3.
    d = 0.0381
    m = 7850.0 * (4.0 / 3.0) * np.pi * (d / 2.0) ** 3
    out = drag_terminal_velocity(mass_kg=m, diameter_m=d,
                                 density_kg_m3=1.225, drag_coefficient=0.5)
    # drag-balance identity: F_drag(v_t) == weight (the defining condition)
    assert abs(out["drag_force_at_terminal_n"] - out["weight_n"]) < 1e-6
    # closed-form v_t = sqrt(2 m g / (rho C_d A)) for a steel ball ~ 80 m/s
    A = np.pi * d ** 2 / 4.0
    v_expected = np.sqrt(2.0 * m * 9.80665 / (1.225 * 0.5 * A))
    assert abs(out["terminal_velocity_ms"] - v_expected) < 1e-6
    assert 75.0 < out["terminal_velocity_ms"] < 85.0   # HyperPhysics-class value


def test_reynolds_number_pipe_transition_2300():
    # KNOWN: classical laminar->turbulent pipe transition at Re ~ 2300.
    # water (rho=1000, mu=1.002e-3), v=0.1 m/s, D=0.02306 m -> Re ~= 2301.
    out = reynolds_number(velocity_ms=0.1, length_m=0.02306,
                          density_kg_m3=1000.0, dynamic_viscosity_pa_s=1.002e-3)
    assert abs(out["reynolds_number"] - 2300.0) < 5.0     # right at transition
    assert out["transition_reynolds"] == 2300.0
    # clearly laminar case
    lam = reynolds_number(velocity_ms=0.01, length_m=0.02306,
                          density_kg_m3=1000.0, dynamic_viscosity_pa_s=1.002e-3)
    assert lam["is_laminar"] and lam["regime"] == "laminar"


def test_blasius_boundary_layer_thickness():
    # KNOWN (Blasius): delta = 5 x / sqrt(Re_x).
    # air (rho=1.225, mu=1.81e-5), U=1 m/s, x=1 m -> Re_x=67680,
    # delta = 5/sqrt(67680) ~= 0.01922 m (~19.2 mm).
    out = blasius_boundary_layer(distance_m=1.0, freestream_velocity_ms=1.0,
                                 density_kg_m3=1.225,
                                 dynamic_viscosity_pa_s=1.81e-5)
    re_x = 1.225 * 1.0 * 1.0 / 1.81e-5
    delta_expected = 5.0 / np.sqrt(re_x)
    assert abs(out["reynolds_x"] - re_x) < 1.0
    assert abs(out["boundary_layer_thickness_m"] - delta_expected) < 1e-9
    assert abs(out["boundary_layer_thickness_mm"] - 19.22) < 0.05  # ~19.2 mm


def test_speed_of_sound_air_20C_343():
    # KNOWN: a = sqrt(gamma R T); dry air (gamma=1.4, R=287.05) at 20 C (293.15 K)
    # gives ~343 m/s.
    out = speed_of_sound_mach(temperature_k=293.15, velocity_ms=343.23)
    assert abs(out["speed_of_sound_ms"] - 343.0) < 1.0     # ~343 m/s
    assert abs(out["mach_number"] - 1.0) < 1e-2            # flow at ~Mach 1


def test_normal_shock_mach2_pressure_ratio_4_5():
    # KNOWN: normal shock at M1=2, gamma=1.4 -> p2/p1 = 4.5,
    # M2 ~= 0.5774, rho2/rho1 ~= 2.667, Prandtl-Meyer nu(2) ~= 26.38 deg.
    out = normal_shock_relations(mach1=2.0, gamma=1.4)
    assert abs(out["pressure_ratio"] - 4.5) < 1e-9          # exactly 4.5
    assert abs(out["mach2"] - 0.5774) < 1e-3
    assert abs(out["density_ratio"] - 2.6667) < 1e-3
    assert abs(out["prandtl_meyer_deg"] - 26.38) < 0.01     # ~26.38 deg


def test_hagen_poiseuille_flow_rate():
    # KNOWN: Q = pi dP r^4 / (8 mu L). water (mu=1.002e-3), r=0.005 m,
    # L=1 m, dP=100 Pa -> Q ~= 2.449e-5 m^3/s (~24.5 mL/s).
    out = hagen_poiseuille_flow(radius_m=0.005, length_m=1.0,
                                pressure_drop_pa=100.0,
                                dynamic_viscosity_pa_s=1.002e-3)
    q_expected = np.pi * 100.0 * 0.005 ** 4 / (8.0 * 1.002e-3 * 1.0)
    assert abs(out["flow_rate_m3_s"] - q_expected) < 1e-12
    assert abs(out["flow_rate_m3_s"] - 2.449e-5) < 1e-7
    assert abs(out["flow_rate_ml_s"] - 24.49) < 0.05        # ~24.5 mL/s
