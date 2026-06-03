"""Real structural-mechanics simulations.

Each function is a distinct, named structural-engineering method (not a shared
engine reused), implemented with numpy/math and verified against a KNOWN
published or analytically exact value in the companion tests. Domains:
beam bending (deflection & moment), cantilevers, column buckling, bending and
axial stress, section properties (second moment of area, section modulus),
truss analysis (method of joints), and torsion of circular shafts.

All quantities are SI: forces in newtons (N), lengths in metres (m),
distributed loads in N/m, Young's / shear modulus in pascals (Pa = N/m^2),
stresses in pascals, moments in N*m, torques in N*m, angles in radians.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_structural.py.
"""
from __future__ import annotations

import math

import numpy as np


# ── 1. Simply-supported beam, central point load ──────────────────────────────
def simply_supported_point_load(P: float, L: float, E: float, I: float) -> dict:
    """Simply-supported (pin-roller) beam of span L carrying a single point load
    P at midspan. Classic Euler-Bernoulli results:
        max deflection (at midspan):  delta_max = P*L^3 / (48*E*I)
        max bending moment (midspan): M_max     = P*L / 4
        end reactions:                R = P/2 each
    KNOWN: published beam-deflection table value delta = P L^3 / 48 E I and the
    maximum moment P L / 4 at the centre.

    Ref: Beam deflection formulae (Iowa State / Gere "Mechanics of Materials");
    simply-supported beam, central concentrated load.
    """
    delta_max = P * L ** 3 / (48.0 * E * I)
    M_max = P * L / 4.0
    R = P / 2.0
    return {
        "max_deflection_m": delta_max,
        "max_moment_Nm": M_max,
        "reaction_left_N": R,
        "reaction_right_N": R,
        "max_moment_location_m": L / 2.0,
    }


# ── 2. Simply-supported beam, uniformly distributed load (UDL) ─────────────────
def simply_supported_udl(w: float, L: float, E: float, I: float) -> dict:
    """Simply-supported beam of span L under a uniformly distributed load w
    (N/m) over its full length:
        max deflection (midspan): delta_max = 5*w*L^4 / (384*E*I)
        max bending moment (midspan): M_max  = w*L^2 / 8
        end reactions:                R = w*L/2 each
    KNOWN: published table value 5 w L^4 / 384 E I and M_max = w L^2 / 8.

    Ref: Beam deflection formulae (Iowa State / Gere); simply-supported beam,
    full-span UDL.
    """
    delta_max = 5.0 * w * L ** 4 / (384.0 * E * I)
    M_max = w * L ** 2 / 8.0
    R = w * L / 2.0
    return {
        "max_deflection_m": delta_max,
        "max_moment_Nm": M_max,
        "reaction_left_N": R,
        "reaction_right_N": R,
        "total_load_N": w * L,
    }


# ── 3. Cantilever beam, end point load ────────────────────────────────────────
def cantilever_point_load(P: float, L: float, E: float, I: float) -> dict:
    """Cantilever beam of length L (fixed at one end, free at the other) carrying
    a point load P at the free tip:
        tip deflection: delta_tip = P*L^3 / (3*E*I)
        tip slope:      theta_tip = P*L^2 / (2*E*I)
        max moment (at the fixed support): M_max = P*L
    KNOWN: published cantilever-deflection table value P L^3 / 3 E I; the maximum
    moment P L occurs at the wall.

    Ref: Beam deflection formulae (Iowa State / Gere); cantilever, end load.
    """
    delta_tip = P * L ** 3 / (3.0 * E * I)
    theta_tip = P * L ** 2 / (2.0 * E * I)
    M_max = P * L
    return {
        "tip_deflection_m": delta_tip,
        "tip_slope_rad": theta_tip,
        "max_moment_Nm": M_max,
        "max_moment_location_m": 0.0,  # at the fixed end (wall)
    }


# ── 4. Euler column buckling critical load ────────────────────────────────────
def euler_buckling_load(E: float, I: float, L: float, *, K: float = 1.0) -> dict:
    """Euler critical (elastic) buckling load of a slender column:
        P_cr = pi^2 * E * I / (K*L)^2
    where K is the effective-length factor set by the end conditions:
        K = 1.0  pinned-pinned, K = 2.0 fixed-free (cantilever),
        K = 0.5  fixed-fixed,   K = 0.699 fixed-pinned.
    The critical buckling stress is sigma_cr = P_cr / A (A supplied separately).
    KNOWN: for pinned-pinned (K=1) P_cr = pi^2 E I / L^2; fixed-fixed (K=0.5) is
    4x stronger and fixed-free (K=2) is 1/4 as strong.

    Ref: Euler's column formula; effective length factor K (calcresource,
    MechaniCalc).
    """
    Le = K * L
    P_cr = math.pi ** 2 * E * I / Le ** 2
    return {
        "critical_load_N": P_cr,
        "effective_length_m": Le,
        "effective_length_factor_K": K,
        "critical_load_kN": P_cr / 1000.0,
    }


# ── 5. Bending stress and section modulus ─────────────────────────────────────
def bending_stress(M: float, c: float, I: float) -> dict:
    """Flexure (bending) stress from the Euler-Bernoulli bending formula:
        sigma = M*c / I = M / S,      with section modulus S = I / c
    where M is the bending moment, c the distance from the neutral axis to the
    extreme fibre, and I the second moment of area about the neutral axis.
    KNOWN: the maximum stress occurs at the extreme fibre (c = c_max), and is
    equivalently M / S with S the elastic section modulus.

    Ref: Flexure formula sigma = M c / I (Gere "Mechanics of Materials").
    """
    S = I / c
    sigma = M * c / I
    return {
        "bending_stress_Pa": sigma,
        "bending_stress_MPa": sigma / 1.0e6,
        "section_modulus_m3": S,
    }


# ── 6. Second moment of area of standard sections ─────────────────────────────
def second_moment_of_area(shape: str, **dims) -> dict:
    """Second moment of area (area moment of inertia) about the centroidal
    (neutral) axis for standard cross-sections:
        rectangle (b x h, bending about horizontal centroidal axis):
            I = b*h^3 / 12,      c = h/2,   S = b*h^2 / 6
        solid circle (diameter d):
            I = pi*d^4 / 64,     c = d/2,   S = pi*d^3 / 32
        hollow circle / tube (outer d_o, inner d_i):
            I = pi*(d_o^4 - d_i^4) / 64
    KNOWN: rectangle I = b h^3 / 12; solid circle I = pi d^4 / 64.

    Ref: Second moment of area, standard section tables (Wikipedia / Gere).
    """
    shape = shape.lower()
    if shape in ("rectangle", "rect"):
        b = float(dims["b"])
        h = float(dims["h"])
        I = b * h ** 3 / 12.0
        c = h / 2.0
        A = b * h
    elif shape in ("circle", "solid_circle"):
        d = float(dims["d"])
        I = math.pi * d ** 4 / 64.0
        c = d / 2.0
        A = math.pi * d ** 2 / 4.0
    elif shape in ("hollow_circle", "tube", "annulus"):
        d_o = float(dims["d_o"])
        d_i = float(dims["d_i"])
        I = math.pi * (d_o ** 4 - d_i ** 4) / 64.0
        c = d_o / 2.0
        A = math.pi * (d_o ** 2 - d_i ** 2) / 4.0
    else:
        raise ValueError(f"unknown section shape: {shape!r}")
    return {
        "second_moment_area_m4": I,
        "extreme_fibre_c_m": c,
        "section_modulus_m3": I / c,
        "area_m2": A,
    }


# ── 7. Axial stress, strain and elongation ────────────────────────────────────
def axial_member(P: float, L: float, A: float, E: float) -> dict:
    """Uniaxial bar in tension/compression (Hooke's law):
        normal stress:  sigma   = P / A
        normal strain:  epsilon = sigma / E = P / (A*E)
        elongation:     delta   = P*L / (A*E) = epsilon*L
    KNOWN: the classic deformation formula delta = P L / A E; strain = stress / E.

    Ref: Axial deformation, Hooke's law (Gere "Mechanics of Materials").
    """
    sigma = P / A
    epsilon = sigma / E
    delta = P * L / (A * E)
    return {
        "axial_stress_Pa": sigma,
        "axial_stress_MPa": sigma / 1.0e6,
        "strain": epsilon,
        "elongation_m": delta,
    }


# ── 8. Plane truss — method of joints (determinate triangle) ──────────────────
def truss_triangle_method_of_joints(P: float, theta_deg: float = 60.0) -> dict:
    """Statically-determinate planar truss solved by the method of joints.

    Geometry: a simple triangle with a horizontal bottom chord A--B (supports)
    and apex C above. Members: AC (left diagonal), BC (right diagonal), AB
    (bottom tie). A vertical downward load P (N) is applied at apex C. Each
    diagonal makes angle theta with the horizontal (theta_deg, default 60 deg
    for an equilateral truss). Equilibrium at joint C:
        sum Fy: F_AC*sin(theta) + F_BC*sin(theta) - P = 0
        sum Fx: -F_AC*cos(theta) + F_BC*cos(theta)   = 0   (symmetry)
    so  F_AC = F_BC = -P / (2*sin(theta))  (negative => compression).
    Then at joint A the horizontal equilibrium gives the bottom-tie force
        F_AB = -F_AC*cos(theta) = P*cos(theta)/(2*sin(theta))  (>0 => tension).
    Sign convention: tension positive, compression negative.
    KNOWN: for theta = 60 deg, P = 1000 N => diagonals -577.35 N (compression),
    tie +288.68 N (tension); vertical reactions P/2 each.

    Ref: Method of joints for determinate trusses (Hibbeler "Engineering
    Mechanics: Statics").
    """
    theta = math.radians(theta_deg)
    F_AC = -P / (2.0 * math.sin(theta))          # compression (negative)
    F_BC = F_AC                                  # symmetry
    F_AB = -F_AC * math.cos(theta)               # tension (positive)
    return {
        "F_AC_N": F_AC,
        "F_BC_N": F_BC,
        "F_AB_N": F_AB,
        "reaction_A_vertical_N": P / 2.0,
        "reaction_B_vertical_N": P / 2.0,
        "AC_state": "compression" if F_AC < 0 else "tension",
        "AB_state": "tension" if F_AB > 0 else "compression",
    }


# ── 9. Torsion of a circular shaft ────────────────────────────────────────────
def circular_shaft_torsion(T: float, L: float, d: float, G: float,
                           *, d_inner: float = 0.0) -> dict:
    """Torsion of a circular (solid or hollow) shaft. The polar second moment of
    area is
        solid:  J = pi*d^4 / 32
        hollow: J = pi*(d_o^4 - d_i^4) / 32
    From the torsion formula T/J = tau/r = G*phi/L:
        max shear stress (at outer radius r = d/2):  tau_max = T*r / J
        angle of twist over length L:                phi     = T*L / (G*J)
    KNOWN: torsion formula tau = T r / J and twist angle phi = T L / (G J).

    Ref: Torsion of circular shafts, tau = T r / J, phi = T L / G J
    (Gere "Mechanics of Materials").
    """
    r = d / 2.0
    if d_inner > 0.0:
        J = math.pi * (d ** 4 - d_inner ** 4) / 32.0
    else:
        J = math.pi * d ** 4 / 32.0
    tau_max = T * r / J
    phi = T * L / (G * J)
    return {
        "polar_moment_J_m4": J,
        "max_shear_stress_Pa": tau_max,
        "max_shear_stress_MPa": tau_max / 1.0e6,
        "twist_angle_rad": phi,
        "twist_angle_deg": math.degrees(phi),
    }
