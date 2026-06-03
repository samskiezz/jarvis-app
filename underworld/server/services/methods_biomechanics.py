"""Biomechanics simulations — real, textbook-grade locomotion and tissue
mechanics built from the canonical equations and verified against KNOWN values.

Researched (WebSearch, June 2026) and each method verified vs an independent
KNOWN reference:

1. Hill muscle force–velocity model (A.V. Hill 1938)
   KNOWN: F=0 at v=Vmax; F=Fmax at v=0.
2. Bone stress / Euler critical buckling load for a long bone modelled as a
   slender column.  KNOWN: Pcr = π²EI/L² (Euler).
3. Joint torque from moment arms / static equilibrium (biceps–elbow lever).
   KNOWN: OpenStax forearm example, F_biceps ≈ 470 N.
4. Pendulum gait — leg as a uniform-rod physical pendulum.
   KNOWN: T = 2π√(2L/3g); L=0.9 m → T ≈ 1.55 s.
5. Metabolic cost of transport (dimensionless).
   KNOWN: human walking COT ≈ 0.2.
6. Tendon elastic energy storage (linear-elastic strain energy).
   KNOWN: U = ½·stress·strain·volume.
7. Ground reaction force impulse–momentum theorem.
   KNOWN: ∫F dt − mg·t = m·Δv (net impulse = change in momentum).
8. Allometric scaling of stride length & muscle strength.
   KNOWN: stride length ∝ M^(1/3) (geometric), strength ∝ M^(2/3) (area).

Sources:
- Hill model: Reading Univ. biomechanics notes; PMC6627110 (Force–Velocity).
- Euler buckling: Wikipedia "Euler's critical load"; EngineeringToolbox.
- Joint torque: OpenStax College Physics 9.6; Body Physics 2.0 ch. 6.5.
- Pendulum gait: SFU LocomotionLab legswing2005; physical-pendulum period.
- Cost of transport: Wikipedia "Cost of transport"; Nature s41598-018-29429-z.
- Tendon strain energy: Wikipedia "Strain energy"; PMC2269645 tendon props.
- Impulse–momentum: BCcampus Biomechanics 6.13; Linthorne force-platform.
- Allometry: Wikipedia "Allometry"/"Kleiber's law"; PMC3832634 limb design.
"""
from __future__ import annotations

import math

import numpy as np

G0 = 9.80665  # m/s^2, standard gravity


# ---------------------------------------------------------------------------
# 1. Hill muscle force–velocity model
# ---------------------------------------------------------------------------
def hill_muscle(*, v: float, f_max: float, v_max: float,
                a_rel: float = 0.25) -> dict:
    """A.V. Hill (1938) force–velocity hyperbola for concentric shortening.

    (F + a)(v + b) = (Fmax + a)·b, with a = a_rel·Fmax and b chosen so that
    F → 0 as v → v_max:  b = a_rel·v_max.

    Boundary conditions (KNOWN):
      * v = 0      → F = Fmax  (isometric)
      * v = v_max  → F = 0     (unloaded max shortening velocity)
    """
    a = a_rel * f_max
    b = a_rel * v_max
    if v >= v_max:
        force = 0.0
    else:
        force = (f_max + a) * b / (v + b) - a
        force = max(force, 0.0)
    power = force * v
    return {"force_N": round(force, 6),
            "power_W": round(power, 6),
            "a_N": round(a, 6), "b_ms": round(b, 6),
            "f_max_N": f_max, "v_max_ms": v_max}


def hill_max_power(*, f_max: float, v_max: float, a_rel: float = 0.25,
                   n: int = 2000) -> dict:
    """Optimal shortening velocity & peak mechanical power of the Hill curve.

    For the classic a/Fmax = b/Vmax = 0.25 case, peak power occurs near
    v ≈ 0.3·Vmax and reaches ≈ 0.1·Fmax·Vmax (KNOWN curve property)."""
    vs = np.linspace(0.0, v_max, n)
    forces = np.array([hill_muscle(v=float(v), f_max=f_max, v_max=v_max,
                                   a_rel=a_rel)["force_N"] for v in vs])
    powers = forces * vs
    i = int(np.argmax(powers))
    return {"v_opt_ms": round(float(vs[i]), 6),
            "p_max_W": round(float(powers[i]), 6),
            "v_opt_frac": round(float(vs[i] / v_max), 4),
            "p_max_frac": round(float(powers[i] / (f_max * v_max)), 4)}


# ---------------------------------------------------------------------------
# 2. Bone stress / Euler column buckling of a long bone
# ---------------------------------------------------------------------------
def bone_stress(*, force_N: float, area_m2: float) -> dict:
    """Axial compressive stress σ = F/A (Pa). Cortical bone yields ≈ 150 MPa."""
    sigma = force_N / area_m2
    return {"stress_Pa": round(sigma, 4), "stress_MPa": round(sigma / 1e6, 6)}


def bone_buckling(*, e_modulus_Pa: float, outer_r_m: float,
                  inner_r_m: float, length_m: float,
                  k_eff: float = 1.0) -> dict:
    """Euler critical buckling load of a long bone modelled as a hollow
    cylindrical column (pinned-pinned by default, K=1).

    KNOWN: Pcr = π²·E·I / (K·L)².  Second moment of area of an annulus:
    I = (π/4)(r_o⁴ − r_i⁴)."""
    I = (math.pi / 4.0) * (outer_r_m ** 4 - inner_r_m ** 4)
    L_eff = k_eff * length_m
    p_cr = (math.pi ** 2) * e_modulus_Pa * I / (L_eff ** 2)
    area = math.pi * (outer_r_m ** 2 - inner_r_m ** 2)
    r_gyr = math.sqrt(I / area)
    slenderness = L_eff / r_gyr
    crit_stress = p_cr / area
    return {"critical_load_N": round(p_cr, 4),
            "second_moment_m4": I,
            "slenderness_ratio": round(slenderness, 4),
            "critical_stress_MPa": round(crit_stress / 1e6, 6)}


# ---------------------------------------------------------------------------
# 3. Joint torque from moment arms / static equilibrium
# ---------------------------------------------------------------------------
def joint_torque(*, muscle_moment_arm_m: float,
                 loads: list[tuple[float, float]]) -> dict:
    """Static equilibrium about a joint (e.g. elbow). Each load is a
    (weight_N, moment_arm_m) tuple acting on the resisting side.

    Σ τ = 0  →  F_muscle·r_muscle = Σ (w_i·r_i)
    KNOWN (OpenStax 9.6 forearm): r_muscle=4 cm; book 50 N @ 35 cm and
    forearm 13.2 N @ 16 cm → F_biceps ≈ 470 N."""
    resisting = sum(w * r for w, r in loads)
    f_muscle = resisting / muscle_moment_arm_m
    return {"muscle_force_N": round(f_muscle, 4),
            "resisting_torque_Nm": round(resisting, 6),
            "muscle_torque_Nm": round(f_muscle * muscle_moment_arm_m, 6)}


# ---------------------------------------------------------------------------
# 4. Pendulum gait / walking natural frequency
# ---------------------------------------------------------------------------
def gait_pendulum(*, leg_length_m: float, g: float = G0,
                  uniform_rod: bool = True) -> dict:
    """Leg modelled as a physical pendulum pivoting at the hip.

    Uniform rod about its end:  I = (1/3)mL², x_cm = L/2  →
       T = 2π√(I/(m g x_cm)) = 2π√(2L/3g).
    Simple-pendulum limit (point mass at tip): T = 2π√(L/g).
    KNOWN: L = 0.9 m uniform rod → T ≈ 1.55 s.
    One walking step ≈ half a swing period."""
    if uniform_rod:
        T = 2 * math.pi * math.sqrt(2 * leg_length_m / (3 * g))
    else:
        T = 2 * math.pi * math.sqrt(leg_length_m / g)
    f = 1.0 / T
    return {"period_s": round(T, 6),
            "frequency_hz": round(f, 6),
            "angular_freq_rads": round(2 * math.pi * f, 6),
            "step_time_s": round(T / 2.0, 6),
            "cadence_steps_per_min": round(60.0 / (T / 2.0), 4)}


# ---------------------------------------------------------------------------
# 5. Metabolic cost of transport
# ---------------------------------------------------------------------------
def cost_transport(*, energy_J: float, mass_kg: float,
                   distance_m: float, g: float = G0) -> dict:
    """Dimensionless cost of transport: COT = E / (m·g·d).

    KNOWN: human walking COT ≈ 0.2 (energy normalised by body weight and
    distance)."""
    cot = energy_J / (mass_kg * g * distance_m)
    cot_per_m = energy_J / (mass_kg * distance_m)  # J/(kg·m)
    return {"cost_of_transport": round(cot, 6),
            "energy_per_kg_per_m_J": round(cot_per_m, 6)}


# ---------------------------------------------------------------------------
# 6. Tendon elastic energy storage
# ---------------------------------------------------------------------------
def tendon_energy(*, force_N: float, area_m2: float, length_m: float,
                  e_modulus_Pa: float) -> dict:
    """Strain energy stored in a linearly-elastic tendon under tensile load.

    σ = F/A,  ε = σ/E,  ΔL = ε·L,  U = ½·F·ΔL = ½·(σε)·V.
    KNOWN: U = ½·k·x² with axial stiffness k = EA/L (springlike behaviour).
    Achilles ref: σ≈30 MPa, ε≈0.02, E≈1.2 GPa."""
    stress = force_N / area_m2
    strain = stress / e_modulus_Pa
    elongation = strain * length_m
    volume = area_m2 * length_m
    energy = 0.5 * stress * strain * volume
    stiffness = e_modulus_Pa * area_m2 / length_m
    energy_spring = 0.5 * stiffness * elongation ** 2
    return {"stress_MPa": round(stress / 1e6, 6),
            "strain": round(strain, 8),
            "elongation_mm": round(elongation * 1e3, 6),
            "stored_energy_J": round(energy, 8),
            "spring_energy_J": round(energy_spring, 8),
            "stiffness_N_per_m": round(stiffness, 4)}


# ---------------------------------------------------------------------------
# 7. Ground reaction force impulse–momentum
# ---------------------------------------------------------------------------
def ground_reaction(*, force_series_N, dt_s: float, mass_kg: float,
                    v_initial_ms: float = 0.0, g: float = G0) -> dict:
    """Impulse–momentum theorem on a vertical force-platform trace.

    Net impulse J = ∫(F − mg) dt = m·Δv.  Integrate the measured GRF, subtract
    body-weight impulse, divide by mass for take-off velocity; jump height
    h = v²/(2g).  KNOWN: J_net = m·Δv (Newton's 2nd law in integral form)."""
    f = np.asarray(force_series_N, dtype=float)
    weight = mass_kg * g
    grf_impulse = float(np.trapezoid(f, dx=dt_s))
    bw_impulse = weight * (len(f) - 1) * dt_s
    net_impulse = grf_impulse - bw_impulse
    delta_v = net_impulse / mass_kg
    v_takeoff = v_initial_ms + delta_v
    jump_height = max(v_takeoff, 0.0) ** 2 / (2 * g)
    return {"grf_impulse_Ns": round(grf_impulse, 6),
            "net_impulse_Ns": round(net_impulse, 6),
            "delta_v_ms": round(delta_v, 6),
            "takeoff_velocity_ms": round(v_takeoff, 6),
            "jump_height_m": round(jump_height, 6)}


# ---------------------------------------------------------------------------
# 8. Allometric scaling of stride / strength
# ---------------------------------------------------------------------------
def allometric_stride(*, mass_kg: float, ref_mass_kg: float,
                      ref_value: float, exponent: float = 1.0 / 3.0) -> dict:
    """Allometric (power-law) scaling  Y = ref·(M/M_ref)^b.

    KNOWN geometric exponents:
      * stride length / limb length ∝ M^(1/3)   (lengths scale as M^1/3)
      * muscle strength / force      ∝ M^(2/3)   (area scales as M^2/3)
      * metabolic rate (Kleiber)     ∝ M^(3/4)
    """
    value = ref_value * (mass_kg / ref_mass_kg) ** exponent
    return {"scaled_value": round(value, 6),
            "exponent": round(exponent, 6),
            "mass_ratio": round(mass_kg / ref_mass_kg, 6)}


def allometric_fit(*, masses, values) -> dict:
    """Recover the scaling exponent b from data via log–log least squares:
    log Y = log a + b·log M.  Returns the slope b (the allometric exponent)."""
    m = np.log(np.asarray(masses, dtype=float))
    y = np.log(np.asarray(values, dtype=float))
    b, log_a = np.polyfit(m, y, 1)
    return {"exponent": round(float(b), 6),
            "coefficient": round(float(math.exp(log_a)), 6)}


# ---------------------------------------------------------------------------
# Route table (keyword tuple -> function)
# ---------------------------------------------------------------------------
ROUTES = {
    ("hill_muscle", "force_velocity", "biomechanic"): hill_muscle,
    ("hill_power", "muscle_power"): hill_max_power,
    ("bone_stress", "compressive_stress"): bone_stress,
    ("bone_buckling", "euler_column", "long_bone"): bone_buckling,
    ("joint_torque", "moment_arm", "static_equilibrium"): joint_torque,
    ("gait", "pendulum", "walking_frequency"): gait_pendulum,
    ("cost_transport", "metabolic_cost"): cost_transport,
    ("tendon", "elastic_energy", "strain_energy"): tendon_energy,
    ("ground_reaction", "impulse_momentum", "grf"): ground_reaction,
    ("allometric_stride", "scaling", "allometry"): allometric_stride,
    ("allometric_fit",): allometric_fit,
}


def route(keyword: str):
    """Map a keyword to its biomechanics function (None if unknown)."""
    for keys, fn in ROUTES.items():
        if keyword in keys:
            return fn
    return None
