"""Each structural-mechanics method must reproduce its KNOWN published or
analytically exact value.

Citations are inline. Tolerances are explicit. All quantities are SI.
"""
import math

from underworld.server.services.methods_structural import (
    axial_member,
    bending_stress,
    cantilever_point_load,
    circular_shaft_torsion,
    euler_buckling_load,
    second_moment_of_area,
    simply_supported_point_load,
    simply_supported_udl,
    truss_triangle_method_of_joints,
)

# Common steel-ish reference material.
E_STEEL = 200.0e9   # Young's modulus, Pa (200 GPa)
G_STEEL = 80.0e9    # shear modulus, Pa (80 GPa)


# 1. Simply-supported beam, central point load — KNOWN: delta = P L^3 / 48 E I,
#    M_max = P L / 4. Worked example: P=10 kN, L=4 m, rectangular 0.1x0.2 m
#    (I = b h^3/12 = 6.6667e-5 m^4), E=200 GPa.
#    Ref: Beam deflection tables (Gere); simply-supported, central load.
def test_simply_supported_point_load_known():
    P, L = 10_000.0, 4.0
    I = 0.1 * 0.2 ** 3 / 12.0                      # 6.66667e-5 m^4
    r = simply_supported_point_load(P, L, E_STEEL, I)
    delta_expected = P * L ** 3 / (48.0 * E_STEEL * I)
    assert abs(r["max_deflection_m"] - delta_expected) < 1e-12
    assert abs(r["max_deflection_m"] - 1.0e-3) < 5e-5   # ~1.0 mm
    assert abs(r["max_moment_Nm"] - P * L / 4.0) < 1e-9  # 10000 N*m
    assert abs(r["max_moment_Nm"] - 10_000.0) < 1e-6
    assert abs(r["reaction_left_N"] - 5_000.0) < 1e-9


# 2. Simply-supported beam, UDL — KNOWN: delta = 5 w L^4 / 384 E I,
#    M_max = w L^2 / 8.  Worked example: w=5 kN/m, L=6 m, I=8e-5 m^4, E=200 GPa.
#    Ref: Beam deflection tables (Gere); simply-supported, full-span UDL.
def test_simply_supported_udl_known():
    w, L, I = 5_000.0, 6.0, 8.0e-5
    r = simply_supported_udl(w, L, E_STEEL, I)
    delta_expected = 5.0 * w * L ** 4 / (384.0 * E_STEEL * I)
    assert abs(r["max_deflection_m"] - delta_expected) < 1e-12
    assert abs(r["max_moment_Nm"] - w * L ** 2 / 8.0) < 1e-9  # 22500 N*m
    assert abs(r["max_moment_Nm"] - 22_500.0) < 1e-6
    assert abs(r["reaction_left_N"] - w * L / 2.0) < 1e-9     # 15000 N
    assert abs(r["total_load_N"] - 30_000.0) < 1e-9


# 3. Cantilever, end load — KNOWN: delta_tip = P L^3 / 3 E I, M_max = P L.
#    Worked example: P=2 kN, L=3 m, I=4e-5 m^4, E=200 GPa.
#    Ref: Beam deflection tables (Gere); cantilever, end load.
def test_cantilever_point_load_known():
    P, L, I = 2_000.0, 3.0, 4.0e-5
    r = cantilever_point_load(P, L, E_STEEL, I)
    delta_expected = P * L ** 3 / (3.0 * E_STEEL * I)
    assert abs(r["tip_deflection_m"] - delta_expected) < 1e-12
    assert abs(r["max_moment_Nm"] - P * L) < 1e-9             # 6000 N*m
    assert abs(r["max_moment_Nm"] - 6_000.0) < 1e-6
    # cantilever tip deflection is 16x a simply-supported beam of same span/load
    ss = simply_supported_point_load(P, L, E_STEEL, I)
    assert abs(r["tip_deflection_m"] / ss["max_deflection_m"] - 16.0) < 1e-9


# 4. Euler buckling — KNOWN: P_cr = pi^2 E I / (K L)^2. For pinned-pinned (K=1),
#    E=200 GPa, I=4.909e-6 m^4 (d=0.1 m circle), L=3 m => P_cr ~= 1.077 MN.
#    Fixed-fixed (K=0.5) is 4x; fixed-free (K=2) is 1/4.
#    Ref: Euler's column formula; effective-length factor K (calcresource).
def test_euler_buckling_known():
    E, L = 200.0e9, 3.0
    I = math.pi * 0.1 ** 4 / 64.0                  # 4.9087e-6 m^4
    pin = euler_buckling_load(E, I, L, K=1.0)
    expected = math.pi ** 2 * E * I / (1.0 * L) ** 2
    assert abs(pin["critical_load_N"] - expected) < 1e-3
    assert abs(pin["critical_load_N"] - 1.0768e6) < 1.0e3   # ~1.077 MN
    # end-condition scaling vs pinned-pinned
    fixed = euler_buckling_load(E, I, L, K=0.5)
    free = euler_buckling_load(E, I, L, K=2.0)
    assert abs(fixed["critical_load_N"] / pin["critical_load_N"] - 4.0) < 1e-9
    assert abs(free["critical_load_N"] / pin["critical_load_N"] - 0.25) < 1e-9


# 5. Bending stress — KNOWN: sigma = M c / I = M / S. Worked example:
#    M=10 kN*m on a 0.1x0.2 m rectangle (I=6.6667e-5 m^4, c=0.1 m)
#    => sigma = 15 MPa; S = I/c = 6.6667e-4 m^3.
#    Ref: Flexure formula sigma = M c / I (Gere).
def test_bending_stress_known():
    M = 10_000.0
    I = 0.1 * 0.2 ** 3 / 12.0
    c = 0.2 / 2.0
    r = bending_stress(M, c, I)
    assert abs(r["bending_stress_Pa"] - M * c / I) < 1e-6
    assert abs(r["bending_stress_MPa"] - 15.0) < 1e-3        # 15 MPa
    assert abs(r["section_modulus_m3"] - I / c) < 1e-15
    # sigma = M / S consistency
    assert abs(r["bending_stress_Pa"] - M / r["section_modulus_m3"]) < 1e-6


# 6. Second moment of area — KNOWN: rectangle I = b h^3/12; circle I = pi d^4/64.
#    Ref: Section property tables (Wikipedia / Gere).
def test_second_moment_of_area_known():
    rect = second_moment_of_area("rectangle", b=0.1, h=0.2)
    assert abs(rect["second_moment_area_m4"] - 0.1 * 0.2 ** 3 / 12.0) < 1e-15
    assert abs(rect["section_modulus_m3"] - 0.1 * 0.2 ** 2 / 6.0) < 1e-12
    assert abs(rect["area_m2"] - 0.02) < 1e-12

    circ = second_moment_of_area("circle", d=0.1)
    assert abs(circ["second_moment_area_m4"] - math.pi * 0.1 ** 4 / 64.0) < 1e-15
    assert abs(circ["second_moment_area_m4"] - 4.9087e-6) < 1e-9
    assert abs(circ["section_modulus_m3"] - math.pi * 0.1 ** 3 / 32.0) < 1e-12

    # hollow circle = solid outer minus solid inner
    hollow = second_moment_of_area("hollow_circle", d_o=0.1, d_i=0.06)
    inner = second_moment_of_area("circle", d=0.06)
    assert abs(hollow["second_moment_area_m4"]
               - (circ["second_moment_area_m4"] - inner["second_moment_area_m4"])) < 1e-18


# 7. Axial member — KNOWN: delta = P L / A E; strain = stress / E.
#    Worked example: P=100 kN bar, L=2 m, A=1e-3 m^2 (1000 mm^2), E=200 GPa
#    => sigma = 100 MPa, strain = 5e-4, delta = 1.0 mm.
#    Ref: Axial deformation, Hooke's law (Gere).
def test_axial_member_known():
    P, L, A = 100_000.0, 2.0, 1.0e-3
    r = axial_member(P, L, A, E_STEEL)
    assert abs(r["axial_stress_Pa"] - P / A) < 1e-3
    assert abs(r["axial_stress_MPa"] - 100.0) < 1e-6        # 100 MPa
    assert abs(r["strain"] - 5.0e-4) < 1e-12
    assert abs(r["elongation_m"] - 1.0e-3) < 1e-9           # 1.0 mm
    assert abs(r["elongation_m"] - P * L / (A * E_STEEL)) < 1e-15


# 8. Truss method of joints — KNOWN: equilateral (theta=60), P=1000 N down at
#    apex => diagonals -577.35 N (compression), tie +288.68 N (tension);
#    vertical reactions P/2 = 500 N each.
#    Ref: Method of joints (Hibbeler, "Engineering Mechanics: Statics").
def test_truss_method_of_joints_known():
    P = 1000.0
    r = truss_triangle_method_of_joints(P, theta_deg=60.0)
    assert abs(r["F_AC_N"] - (-577.350269)) < 1e-3          # compression
    assert abs(r["F_BC_N"] - r["F_AC_N"]) < 1e-12           # symmetry
    assert abs(r["F_AB_N"] - 288.675135) < 1e-3             # tension
    assert r["AC_state"] == "compression"
    assert r["AB_state"] == "tension"
    assert abs(r["reaction_A_vertical_N"] - 500.0) < 1e-9
    # joint C vertical equilibrium: 2 * |F_AC| * sin(60) == P
    assert abs(2.0 * abs(r["F_AC_N"]) * math.sin(math.radians(60.0)) - P) < 1e-6


# 9. Torsion of a circular shaft — KNOWN: J = pi d^4 / 32; tau = T r / J;
#    phi = T L / (G J). Worked example: T=1 kN*m, d=0.05 m solid shaft, L=1.5 m,
#    G=80 GPa => J=6.1359e-7 m^4, tau_max=40.74 MPa, phi=0.03055 rad.
#    Ref: Torsion of circular shafts (Gere).
def test_circular_shaft_torsion_known():
    T, L, d = 1_000.0, 1.5, 0.05
    r = circular_shaft_torsion(T, L, d, G_STEEL)
    J_expected = math.pi * d ** 4 / 32.0
    assert abs(r["polar_moment_J_m4"] - J_expected) < 1e-15
    assert abs(r["polar_moment_J_m4"] - 6.1359e-7) < 1e-10
    tau_expected = T * (d / 2.0) / J_expected
    assert abs(r["max_shear_stress_Pa"] - tau_expected) < 1e-3
    assert abs(r["max_shear_stress_MPa"] - 40.74) < 0.05    # ~40.7 MPa
    phi_expected = T * L / (G_STEEL * J_expected)
    assert abs(r["twist_angle_rad"] - phi_expected) < 1e-15
    assert abs(r["twist_angle_rad"] - 0.030558) < 1e-4
    # hollow shaft has a larger J than... no: smaller-material hollow has
    # smaller J; verify hollow J = solid_o J minus solid_i J relationship
    hollow = circular_shaft_torsion(T, L, d, G_STEEL, d_inner=0.03)
    J_hollow = math.pi * (d ** 4 - 0.03 ** 4) / 32.0
    assert abs(hollow["polar_moment_J_m4"] - J_hollow) < 1e-15
