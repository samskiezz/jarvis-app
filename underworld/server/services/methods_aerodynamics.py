"""Real aerodynamics simulations (lift/drag/airfoil/compressible flow).

Each function is a distinct, named aerodynamic method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: lift from the lift
equation, drag with lifting-line induced drag, pitot/dynamic-pressure airspeed,
Mach number & speed of sound, Prandtl-Glauert compressibility correction,
isentropic stagnation (total) T/p ratios, thin-airfoil-theory lift-curve slope,
and glide performance (best L/D, glide ratio, sink rate).

This module deliberately AVOIDS orbital astrodynamics (see services/aerospace.py)
and generic fluid mechanics; it focuses on atmospheric flight aerodynamics.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_aerodynamics.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Standard-atmosphere / air constants (SI) ──────────────────────────────────
GAMMA_AIR = 1.4                  # ratio of specific heats for diatomic air
R_SPECIFIC_AIR = 287.05          # specific gas constant of dry air, J/(kg*K)
T_SEA_LEVEL_K = 288.15           # ISA sea-level temperature, K (15 C)
P_SEA_LEVEL_PA = 101325.0        # ISA sea-level static pressure, Pa
RHO_SEA_LEVEL = 1.225            # ISA sea-level density, kg/m^3
A_SEA_LEVEL = 340.294            # ISA sea-level speed of sound, m/s


# ── 1. Lift force from the lift equation ──────────────────────────────────────
def lift_force(density_kg_m3: float, velocity_ms: float, wing_area_m2: float,
               cl: float) -> dict:
    """Aerodynamic lift from the lift equation:
        L = 1/2 * rho * V^2 * S * C_L
    with dynamic pressure q = 1/2 rho V^2 (Pa) reported separately.
    KNOWN: rho=1.225 kg/m^3, V=100 m/s, S=16.2 m^2, C_L=0.5 -> L=49612.5 N.

    Ref: NASA Glenn "The Lift Equation"; Anderson, Fundamentals of Aerodynamics.
    """
    q = 0.5 * density_kg_m3 * velocity_ms ** 2
    lift_n = q * wing_area_m2 * cl
    return {
        "lift_n": lift_n,
        "dynamic_pressure_pa": q,
        "wing_loading_pa": lift_n / wing_area_m2 if wing_area_m2 else float("nan"),
        "wing_area_m2": wing_area_m2,
        "cl": cl,
    }


# ── 2. Drag polar with lifting-line induced drag ──────────────────────────────
def drag_polar(density_kg_m3: float, velocity_ms: float, wing_area_m2: float,
               cl: float, cd0: float, aspect_ratio: float,
               *, oswald_e: float = 1.0) -> dict:
    """Total drag from the parabolic drag polar (profile + induced drag):
        C_D = C_D0 + C_L^2 / (pi * e * AR)
        D   = 1/2 rho V^2 S C_D
    The second term is the lifting-line induced ("drag-due-to-lift") component;
    e is the Oswald span efficiency and AR the wing aspect ratio.
    KNOWN: C_D0=0.02, C_L=0.5, e=0.8, AR=10 -> C_Di=0.25/(pi*8)=0.009947,
    so C_D=0.029947.

    Ref: Prandtl lifting-line theory; Anderson, Fundamentals of Aerodynamics;
    NASA Glenn "Induced Drag Coefficient".
    """
    cdi = cl ** 2 / (math.pi * oswald_e * aspect_ratio)
    cd = cd0 + cdi
    q = 0.5 * density_kg_m3 * velocity_ms ** 2
    drag_n = q * wing_area_m2 * cd
    return {
        "cd": cd,
        "cd_profile": cd0,
        "cd_induced": cdi,
        "drag_n": drag_n,
        "dynamic_pressure_pa": q,
        "oswald_e": oswald_e,
        "aspect_ratio": aspect_ratio,
    }


# ── 3. Pitot-static airspeed from dynamic pressure ────────────────────────────
def pitot_airspeed(total_pressure_pa: float, static_pressure_pa: float,
                   density_kg_m3: float = RHO_SEA_LEVEL) -> dict:
    """Incompressible (Bernoulli) airspeed from a pitot-static probe:
        q = p_total - p_static = 1/2 rho V^2   =>   V = sqrt(2 q / rho)
    Valid for low Mach (incompressible) flow; q is the dynamic pressure.
    KNOWN: q=6125 Pa at rho=1.225 -> V=sqrt(2*6125/1.225)=100 m/s exactly.

    Ref: Bernoulli's equation; NASA Glenn "Pitot-Static (Prandtl) Tube".
    """
    q = total_pressure_pa - static_pressure_pa
    if q < 0.0:
        raise ValueError("total pressure must be >= static pressure")
    velocity = math.sqrt(2.0 * q / density_kg_m3)
    return {
        "velocity_ms": velocity,
        "dynamic_pressure_pa": q,
        "density_kg_m3": density_kg_m3,
    }


# ── 4. Speed of sound & Mach number ───────────────────────────────────────────
def mach_number(velocity_ms: float, temperature_k: float = T_SEA_LEVEL_K,
                *, gamma: float = GAMMA_AIR, r_specific: float = R_SPECIFIC_AIR) -> dict:
    """Speed of sound of a perfect gas and the resulting Mach number:
        a = sqrt(gamma * R * T),   M = V / a
    plus the flow-regime classification (subsonic/transonic/supersonic).
    KNOWN: at T=288.15 K, a=sqrt(1.4*287.05*288.15)=340.29 m/s; V=170.15 m/s
    gives M=0.5.

    Ref: NASA Glenn "Speed of Sound" / "Mach Number"; Anderson, Modern
    Compressible Flow.
    """
    a = math.sqrt(gamma * r_specific * temperature_k)
    mach = velocity_ms / a
    if mach < 0.8:
        regime = "subsonic"
    elif mach < 1.2:
        regime = "transonic"
    elif mach < 5.0:
        regime = "supersonic"
    else:
        regime = "hypersonic"
    return {
        "mach": mach,
        "speed_of_sound_ms": a,
        "regime": regime,
        "temperature_k": temperature_k,
    }


# ── 5. Prandtl-Glauert compressibility correction ─────────────────────────────
def prandtl_glauert(cp_incompressible: float, mach: float) -> dict:
    """Prandtl-Glauert subsonic compressibility correction:
        beta = sqrt(1 - M^2)
        C_p = C_p0 / beta   (and likewise C_L = C_L0 / beta)
    Valid for M < ~0.7 (before transonic effects). The factor 1/beta is the
    compressibility amplification of incompressible pressure coefficients.
    KNOWN: M=0.6 -> beta=0.8, factor=1.25; C_p0=-0.4 -> C_p=-0.5.

    Ref: Prandtl-Glauert rule (Glauert 1928); Anderson, Fundamentals of
    Aerodynamics, compressible thin-airfoil theory.
    """
    if mach >= 1.0:
        raise ValueError("Prandtl-Glauert rule is valid only for subsonic M < 1")
    beta = math.sqrt(1.0 - mach ** 2)
    factor = 1.0 / beta
    return {
        "cp_corrected": cp_incompressible * factor,
        "beta": beta,
        "correction_factor": factor,
        "mach": mach,
    }


# ── 6. Isentropic stagnation (total) T/p ratios ───────────────────────────────
def isentropic_stagnation(mach: float, *, gamma: float = GAMMA_AIR,
                          static_temperature_k: float = T_SEA_LEVEL_K,
                          static_pressure_pa: float = P_SEA_LEVEL_PA) -> dict:
    """Isentropic (compressible) stagnation-to-static ratios for a perfect gas:
        T0/T = 1 + (gamma-1)/2 * M^2
        p0/p = (T0/T)^(gamma/(gamma-1))
        rho0/rho = (T0/T)^(1/(gamma-1))
    KNOWN: M=1, gamma=1.4 -> T0/T=1.2 and p0/p=1.2^3.5=1.8929.

    Ref: NASA Glenn "Isentropic Flow Relations"; Anderson, Modern Compressible
    Flow.
    """
    t_ratio = 1.0 + (gamma - 1.0) / 2.0 * mach ** 2
    p_ratio = t_ratio ** (gamma / (gamma - 1.0))
    rho_ratio = t_ratio ** (1.0 / (gamma - 1.0))
    return {
        "t0_over_t": t_ratio,
        "p0_over_p": p_ratio,
        "rho0_over_rho": rho_ratio,
        "stagnation_temperature_k": static_temperature_k * t_ratio,
        "stagnation_pressure_pa": static_pressure_pa * p_ratio,
        "mach": mach,
    }


# ── 7. Thin-airfoil-theory lift-curve slope & lift coefficient ────────────────
def thin_airfoil_lift(alpha_deg: float, *, alpha_l0_deg: float = 0.0,
                      aspect_ratio: float | None = None,
                      oswald_e: float = 1.0) -> dict:
    """Thin-airfoil theory: the 2-D lift-curve slope is exactly 2*pi per radian,
        c_l = 2*pi*(alpha - alpha_L0)        [alpha in radians]
    For a finite wing the 3-D slope is reduced by induced downwash
    (Helmblod / lifting-line):
        a = a0 / (1 + a0/(pi e AR)),   a0 = 2*pi
    KNOWN: 2-D slope = 2*pi = 6.2832 /rad; at alpha=5 deg (alpha_L0=0),
    c_l = 2*pi*rad(5) = 0.5483.

    Ref: Thin airfoil theory (Glauert/Munk); Anderson, Fundamentals of
    Aerodynamics; NASA Glenn "Inclination Effects on Lift".
    """
    a0 = 2.0 * math.pi  # 2-D lift-curve slope, per radian
    alpha_eff_rad = math.radians(alpha_deg - alpha_l0_deg)
    if aspect_ratio is None:
        slope = a0
    else:
        slope = a0 / (1.0 + a0 / (math.pi * oswald_e * aspect_ratio))
    cl = slope * alpha_eff_rad
    return {
        "cl": cl,
        "lift_curve_slope_per_rad": slope,
        "lift_curve_slope_per_deg": math.radians(slope),
        "alpha_effective_deg": alpha_deg - alpha_l0_deg,
        "aspect_ratio": aspect_ratio,
    }


# ── 8. Glide performance: best L/D, glide ratio, sink rate ─────────────────────
def glide_performance(cd0: float, aspect_ratio: float, *, oswald_e: float = 1.0,
                      weight_n: float | None = None,
                      wing_area_m2: float | None = None,
                      density_kg_m3: float = RHO_SEA_LEVEL) -> dict:
    """Best glide performance from the parabolic drag polar. Maximum lift-to-drag
    ratio occurs where induced drag equals profile drag:
        C_L,opt = sqrt(pi e AR * C_D0)
        (L/D)_max = 1/2 * sqrt(pi e AR / C_D0)
    The minimum glide (flight-path) angle is gamma = atan(1 / (L/D)_max), and the
    best-glide airspeed (for a given wing loading) is
        V = sqrt( 2 W / (rho S C_L,opt) ),  with sink rate w = V * sin(gamma).
    KNOWN: C_D0=0.02, e=0.8, AR=10 -> (L/D)_max = 0.5*sqrt(pi*8/0.02) = 17.72.

    Ref: Anderson, Aircraft Performance and Design; NASA Glenn glide relations.
    """
    cl_opt = math.sqrt(math.pi * oswald_e * aspect_ratio * cd0)
    ld_max = 0.5 * math.sqrt(math.pi * oswald_e * aspect_ratio / cd0)
    glide_angle_rad = math.atan2(1.0, ld_max)
    out = {
        "ld_max": ld_max,
        "cl_optimal": cl_opt,
        "glide_ratio": ld_max,                       # horizontal:vertical
        "glide_angle_deg": math.degrees(glide_angle_rad),
        "aspect_ratio": aspect_ratio,
    }
    if weight_n is not None and wing_area_m2 is not None:
        v_bg = math.sqrt(2.0 * weight_n / (density_kg_m3 * wing_area_m2 * cl_opt))
        out["best_glide_speed_ms"] = v_bg
        out["sink_rate_ms"] = v_bg * math.sin(glide_angle_rad)
    return out
