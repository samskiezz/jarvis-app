"""Real tribology (friction, wear, lubrication) simulations.

Each function is a distinct, named tribology method (not a shared engine reused),
implemented with numpy/math and verified against a KNOWN published or analytically
exact value in the companion tests. Domains: dry friction (Amontons-Coulomb,
angle of repose), wear (Archard), contact mechanics (Hertz sphere-on-flat),
lubrication regimes (Stribeck lambda film ratio, Hersey number/minimum film),
hydrodynamic bearings (Petroff friction torque), viscous drag (Stokes), and
rolling resistance.

All quantities are SI unless noted. References are inline in each docstring.
KNOWN values are reproduced in server/tests/test_methods_tribology.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants ────────────────────────────────────────────────────────
G_STD = 9.80665      # standard gravity, m/s^2 (CGPM 1901 / ISO 80000-3)


# ── 1. Amontons-Coulomb dry friction & angle of repose ────────────────────────
def amontons_coulomb_friction(normal_force_N: float, mu: float,
                              applied_force_N: float | None = None) -> dict:
    """Amontons-Coulomb law of dry friction:
        F_friction_max = mu * N           (1st & 2nd laws: F proportional to N,
                                           independent of apparent contact area)
    A body remains static until the applied tangential force exceeds mu*N; the
    angle of repose theta is the incline angle at which sliding just begins:
        tan(theta) = mu   ->  theta = atan(mu).
    KNOWN: mu = 0.5773502692 (= 1/sqrt(3)) gives angle of repose = 30 deg; the
    limiting friction force for N = 100 N is 50 N at mu = 0.5.

    Ref: Amontons (1699) / Coulomb (1785); Bhushan, "Introduction to Tribology".
    """
    f_max = mu * normal_force_N
    angle_rad = math.atan(mu)
    out = {
        "friction_force_max_N": f_max,
        "angle_of_repose_rad": angle_rad,
        "angle_of_repose_deg": math.degrees(angle_rad),
        "mu": mu,
        "normal_force_N": normal_force_N,
    }
    if applied_force_N is not None:
        slips = applied_force_N > f_max
        out["applied_force_N"] = applied_force_N
        out["is_sliding"] = bool(slips)
        # net tangential force once sliding (kinetic), else 0 (static balance)
        out["net_tangential_force_N"] = (applied_force_N - f_max) if slips else 0.0
    return out


# ── 2. Archard wear volume ────────────────────────────────────────────────────
def archard_wear(normal_load_N: float, sliding_distance_m: float,
                 hardness_Pa: float, K: float) -> dict:
    """Archard wear equation for sliding wear volume:
        V = K * W * L / H
    where V is worn volume (m^3), K the dimensionless wear coefficient, W the
    normal load (N), L the sliding distance (m), and H the hardness of the
    softer surface (Pa = N/m^2). The wear rate (volume per unit distance) is
    Q = V/L = K*W/H, and the specific wear rate is k = K/H (m^2/N = m^3/(N m)).
    KNOWN: W=100 N, L=1000 m, H=2e9 Pa, K=1e-4 gives V = 5e-9 m^3 (= 5 mm^3).

    Ref: Archard, J. Appl. Phys. 24, 981 (1953).
    """
    V = K * normal_load_N * sliding_distance_m / hardness_Pa
    return {
        "wear_volume_m3": V,
        "wear_volume_mm3": V * 1e9,
        "wear_rate_m3_per_m": K * normal_load_N / hardness_Pa,
        "specific_wear_rate_m3_per_Nm": K / hardness_Pa,
        "wear_coefficient_K": K,
    }


# ── 3. Hertzian contact: sphere on flat ───────────────────────────────────────
def hertz_sphere_flat(load_N: float, radius_m: float,
                      E1_Pa: float, nu1: float,
                      E2_Pa: float, nu2: float) -> dict:
    """Hertzian elastic contact of a sphere on a flat half-space.
    Effective (reduced) modulus and radius:
        1/E* = (1-nu1^2)/E1 + (1-nu2^2)/E2 ;  R = sphere radius (flat: 1/R2 = 0)
    Contact radius, peak (centre) and mean pressure, and approach:
        a  = (3*P*R / (4*E*))^(1/3)
        p0 = 3*P / (2*pi*a^2)        (max, at centre = 1.5 * mean pressure)
        delta = a^2 / R              (mutual approach)
    KNOWN: P=10 N, R=0.01 m, steel E=200 GPa nu=0.3 on like steel ->
    a ~= 8.80e-5 m, p0 ~= 6.16e8 Pa (0.62 GPa); p0 = 1.5 * p_mean exactly.

    Ref: Hertz (1882); Johnson, "Contact Mechanics" (1985), Ch. 4.
    """
    E_star = 1.0 / ((1.0 - nu1 ** 2) / E1_Pa + (1.0 - nu2 ** 2) / E2_Pa)
    a = (3.0 * load_N * radius_m / (4.0 * E_star)) ** (1.0 / 3.0)
    contact_area = math.pi * a ** 2
    p_max = 3.0 * load_N / (2.0 * contact_area)
    p_mean = load_N / contact_area
    delta = a ** 2 / radius_m
    return {
        "contact_radius_m": a,
        "contact_area_m2": contact_area,
        "max_pressure_Pa": p_max,
        "mean_pressure_Pa": p_mean,
        "approach_m": delta,
        "effective_modulus_Pa": E_star,
    }


# ── 4. Stribeck lambda film-thickness ratio (lubrication regime) ──────────────
def stribeck_lambda_ratio(film_thickness_m: float,
                          Rq1_m: float, Rq2_m: float) -> dict:
    """Specific film thickness (lambda ratio) classifying the lubrication regime:
        sigma = sqrt(Rq1^2 + Rq2^2)        (composite RMS surface roughness)
        lambda = h_min / sigma
    Regime thresholds (common convention):
        lambda < 1     boundary lubrication (asperity contact dominates)
        1 <= lambda <= 3   mixed lubrication
        lambda > 3     full-film (hydrodynamic / EHL) lubrication
    KNOWN: h=0.4 um with Rq1=Rq2=0.1 um -> sigma=0.1414 um, lambda=2.83 (mixed).

    Ref: Stribeck (1902); Hamrock, "Fundamentals of Fluid Film Lubrication".
    """
    sigma = math.sqrt(Rq1_m ** 2 + Rq2_m ** 2)
    lam = film_thickness_m / sigma
    if lam < 1.0:
        regime = "boundary"
    elif lam <= 3.0:
        regime = "mixed"
    else:
        regime = "full_film"
    return {
        "lambda_ratio": lam,
        "composite_roughness_m": sigma,
        "regime": regime,
        "film_thickness_m": film_thickness_m,
    }


# ── 5. Petroff hydrodynamic journal-bearing friction torque ───────────────────
def petroff_bearing_friction(radius_m: float, length_m: float,
                             clearance_m: float, viscosity_Pa_s: float,
                             speed_rev_s: float,
                             unit_load_Pa: float | None = None) -> dict:
    """Petroff's equation for a lightly-loaded, concentric journal bearing
    (no eccentricity, pure Couette shear of the oil film):
        T = 4*pi^2 * r^3 * l * mu * N' / c        (friction torque, N m)
    with r journal radius, l bearing length, c radial clearance, mu dynamic
    viscosity (Pa s), N' rotational speed (rev/s). The friction coefficient for
    a unit bearing pressure p is the classic Petroff form:
        f = 2*pi^2 * (mu*N'/p) * (r/c).
    KNOWN: r=0.025 m, l=0.05 m, c=2.5e-5 m, mu=0.05 Pa s, N'=30 rev/s ->
    T ~= 4*pi^2*r^3*l*mu*N'/c = 1.8506 N m.

    Ref: Petroff (1883); Shigley, "Mechanical Engineering Design".
    """
    torque = (4.0 * math.pi ** 2 * radius_m ** 3 * length_m *
              viscosity_Pa_s * speed_rev_s / clearance_m)
    omega = 2.0 * math.pi * speed_rev_s          # angular velocity, rad/s
    friction_power_W = torque * omega
    out = {
        "friction_torque_Nm": torque,
        "angular_velocity_rad_s": omega,
        "friction_power_W": friction_power_W,
        "viscosity_Pa_s": viscosity_Pa_s,
    }
    if unit_load_Pa is not None:
        out["friction_coefficient"] = (2.0 * math.pi ** 2 *
                                       (viscosity_Pa_s * speed_rev_s / unit_load_Pa) *
                                       (radius_m / clearance_m))
        out["unit_load_Pa"] = unit_load_Pa
    return out


# ── 6. Stokes drag on a sphere (creeping flow) ────────────────────────────────
def stokes_drag(radius_m: float, velocity_m_s: float, viscosity_Pa_s: float,
                *, fluid_density_kg_m3: float | None = None,
                sphere_density_kg_m3: float | None = None) -> dict:
    """Stokes' law for the viscous drag on a sphere in creeping flow (Re << 1):
        F_drag = 6 * pi * mu * r * v
    Optionally the gravitational terminal (settling) velocity, where drag plus
    buoyancy balance weight:
        v_t = 2*(rho_s - rho_f)*g*r^2 / (9*mu)
    and the particle Reynolds number Re = rho_f * v * (2r) / mu.
    KNOWN: r=1e-3 m, v=0.01 m/s, mu=1.0 Pa s -> F = 6*pi*mu*r*v = 1.885e-4 N.

    Ref: Stokes (1851); Batchelor, "An Introduction to Fluid Dynamics".
    """
    F = 6.0 * math.pi * viscosity_Pa_s * radius_m * velocity_m_s
    out = {
        "drag_force_N": F,
        "radius_m": radius_m,
        "velocity_m_s": velocity_m_s,
    }
    if fluid_density_kg_m3 is not None and sphere_density_kg_m3 is not None:
        v_t = (2.0 * (sphere_density_kg_m3 - fluid_density_kg_m3) * G_STD *
               radius_m ** 2 / (9.0 * viscosity_Pa_s))
        out["terminal_velocity_m_s"] = v_t
        out["reynolds_number"] = (fluid_density_kg_m3 * abs(v_t) *
                                  (2.0 * radius_m) / viscosity_Pa_s)
    return out


# ── 7. Rolling resistance ─────────────────────────────────────────────────────
def rolling_resistance(normal_load_N: float, c_rr: float,
                       wheel_radius_m: float | None = None) -> dict:
    """Rolling resistance (rolling friction) force:
        F_rr = C_rr * N
    where C_rr is the dimensionless coefficient of rolling resistance and N the
    normal load. C_rr relates to the dimensional coefficient b (the forward
    offset of the resultant normal reaction, length units) by b = C_rr * r, so
    given a wheel radius b = C_rr * r.
    KNOWN: car tyre C_rr=0.01, N=1000 N -> F_rr = 10 N; with r=0.3 m the
    dimensional arm b = 0.003 m (3 mm).

    Ref: Coulomb rolling-friction model; Wikipedia "Rolling resistance".
    """
    F = c_rr * normal_load_N
    out = {
        "rolling_resistance_force_N": F,
        "c_rr": c_rr,
        "normal_load_N": normal_load_N,
    }
    if wheel_radius_m is not None:
        out["resistance_arm_b_m"] = c_rr * wheel_radius_m
        out["wheel_radius_m"] = wheel_radius_m
    return out


# ── 8. Hersey number & minimum hydrodynamic film thickness ────────────────────
def hersey_number(viscosity_Pa_s: float, speed_rev_s: float, pressure_Pa: float,
                  *, radius_m: float | None = None,
                  clearance_m: float | None = None) -> dict:
    """Hersey number (bearing characteristic / duty parameter), the dimensionless
    abscissa of the Stribeck curve:
        H = mu * N / P
    with mu dynamic viscosity (Pa s), N rotational speed (rev/s), P unit bearing
    load (Pa). A minimum hydrodynamic film thickness estimate from the linearized
    Petroff/Reynolds bearing analysis (concentric long bearing) is:
        h_min ~= 2*pi^2 * (r/c) * H * c = 2*pi^2 * r * (mu*N/P)
    which makes the dimensionless film thickness h_min/c proportional to H.
    KNOWN: mu=0.05 Pa s, N=30 rev/s, P=1e6 Pa -> H = 1.5e-6 (dimensionless).

    Ref: Hersey (1914); Stribeck curve (Wikipedia); Hamrock, "Fluid Film Lub.".
    """
    H = viscosity_Pa_s * speed_rev_s / pressure_Pa
    out = {
        "hersey_number": H,
        "viscosity_Pa_s": viscosity_Pa_s,
        "speed_rev_s": speed_rev_s,
        "pressure_Pa": pressure_Pa,
    }
    if radius_m is not None:
        h_min = 2.0 * math.pi ** 2 * radius_m * H
        out["min_film_thickness_m"] = h_min
        if clearance_m is not None:
            out["dimensionless_film_thickness"] = h_min / clearance_m
            out["clearance_m"] = clearance_m
    return out
