"""Biomechanics methods verified against KNOWN textbook / literature values."""
import math

import numpy as np

from underworld.server.services.methods_biomechanics import (
    allometric_fit,
    allometric_stride,
    bone_buckling,
    bone_stress,
    cost_transport,
    gait_pendulum,
    ground_reaction,
    hill_max_power,
    hill_muscle,
    joint_torque,
    route,
    tendon_energy,
)


# ---- 1. Hill muscle force–velocity --------------------------------------
def test_hill_isometric_equals_fmax():
    # KNOWN: at v=0 the muscle produces its full isometric force Fmax.
    r = hill_muscle(v=0.0, f_max=1000.0, v_max=8.0)
    assert abs(r["force_N"] - 1000.0) < 1e-6


def test_hill_zero_force_at_vmax():
    # KNOWN: at v=Vmax the (concentric) force is zero.
    r = hill_muscle(v=8.0, f_max=1000.0, v_max=8.0)
    assert abs(r["force_N"] - 0.0) < 1e-6


def test_hill_force_monotonic_decreasing():
    fm, vm = 1000.0, 8.0
    fs = [hill_muscle(v=v, f_max=fm, v_max=vm)["force_N"]
          for v in np.linspace(0, vm, 50)]
    assert all(fs[i] >= fs[i + 1] - 1e-9 for i in range(len(fs) - 1))


def test_hill_peak_power_curve_property():
    # KNOWN: for a/Fmax=b/Vmax=0.25, peak power ≈ 0.1·Fmax·Vmax near 0.3·Vmax.
    r = hill_max_power(f_max=1000.0, v_max=8.0, a_rel=0.25)
    assert abs(r["p_max_frac"] - 0.095) < 0.01
    assert abs(r["v_opt_frac"] - 0.30) < 0.03


# ---- 2. Bone stress / Euler buckling ------------------------------------
def test_bone_stress_known():
    # KNOWN: 1000 N over 1 cm^2 (1e-4 m^2) = 10 MPa.
    r = bone_stress(force_N=1000.0, area_m2=1e-4)
    assert abs(r["stress_MPa"] - 10.0) < 1e-6


def test_euler_buckling_solid_rod_known():
    # KNOWN: Pcr = π²EI/L². Solid rod r=1cm, E=17 GPa (cortical bone), L=0.4 m.
    # I = π/4·r⁴ = 7.854e-9 m⁴ ; Pcr = π²·17e9·7.854e-9/0.16 = 8235 N.
    r = bone_buckling(e_modulus_Pa=17e9, outer_r_m=0.01, inner_r_m=0.0,
                      length_m=0.4)
    I = math.pi / 4 * 0.01 ** 4
    expected = math.pi ** 2 * 17e9 * I / 0.4 ** 2
    assert abs(r["critical_load_N"] - expected) < 1.0
    assert abs(r["critical_load_N"] - 8235.0) < 50.0


# ---- 3. Joint torque / static equilibrium -------------------------------
def test_joint_torque_openstax_forearm():
    # KNOWN (OpenStax College Physics 9.6): biceps moment arm 4 cm; book 50 N
    # at 35 cm, forearm+hand 13.2 N at 16 cm. F_B = (17.5+2.112)/0.04 ≈ 490 N.
    r = joint_torque(muscle_moment_arm_m=0.04,
                     loads=[(50.0, 0.35), (13.2, 0.16)])
    assert abs(r["muscle_force_N"] - 490.3) < 1.0


def test_joint_torque_equilibrium_balances():
    r = joint_torque(muscle_moment_arm_m=0.04, loads=[(50.0, 0.35)])
    assert abs(r["muscle_torque_Nm"] - r["resisting_torque_Nm"]) < 1e-6


# ---- 4. Pendulum gait ----------------------------------------------------
def test_gait_uniform_rod_period_known():
    # KNOWN: uniform-rod physical pendulum T = 2π√(2L/3g).
    # L = 0.9 m → T = 2π√(1.8/29.42) = 1.554 s.
    r = gait_pendulum(leg_length_m=0.9)
    expected = 2 * math.pi * math.sqrt(2 * 0.9 / (3 * 9.80665))
    assert abs(r["period_s"] - expected) < 1e-6
    assert abs(r["period_s"] - 1.554) < 0.01


def test_gait_simple_pendulum_limit():
    # KNOWN: simple pendulum L=1 m, g≈9.81 → T ≈ 2.006 s.
    r = gait_pendulum(leg_length_m=1.0, uniform_rod=False)
    assert abs(r["period_s"] - 2.006) < 0.01


# ---- 5. Cost of transport ------------------------------------------------
def test_cost_transport_human_walking_known():
    # KNOWN: human walking dimensionless COT ≈ 0.2.
    # 70 kg, walk 1 km, ~137 kJ metabolic → COT = 137000/(70·9.80665·1000)=0.2.
    energy = 0.2 * 70.0 * 9.80665 * 1000.0
    r = cost_transport(energy_J=energy, mass_kg=70.0, distance_m=1000.0)
    assert abs(r["cost_of_transport"] - 0.2) < 1e-6


# ---- 6. Tendon elastic energy -------------------------------------------
def test_tendon_strain_energy_known():
    # KNOWN: U = ½·k·x², k = EA/L. E=1.2 GPa, A=80 mm²=8e-5 m², L=0.25 m,
    # F=3000 N → ΔL=F·L/(EA)=3000·0.25/(1.2e9·8e-5)=7.8125 mm,
    # U=½·F·ΔL = ½·3000·0.0078125 = 11.72 J.
    r = tendon_energy(force_N=3000.0, area_m2=8e-5, length_m=0.25,
                      e_modulus_Pa=1.2e9)
    assert abs(r["stored_energy_J"] - 11.72) < 0.05
    # both energy formulations agree
    assert abs(r["stored_energy_J"] - r["spring_energy_J"]) < 1e-6


def test_tendon_achilles_stress_strain():
    # KNOWN: Achilles σ≈30 MPa at ε≈0.025 with E=1.2 GPa.
    r = tendon_energy(force_N=2400.0, area_m2=8e-5, length_m=0.25,
                      e_modulus_Pa=1.2e9)
    assert abs(r["stress_MPa"] - 30.0) < 0.5
    assert abs(r["strain"] - 0.025) < 0.001


# ---- 7. Ground reaction impulse–momentum --------------------------------
def test_ground_reaction_constant_force_known():
    # KNOWN: net impulse = m·Δv. 80 kg, constant GRF=1184.6 N for 0.5 s.
    # net F = 1184.6 - 80·9.80665 = 400 N ; Δv = 400·0.5/80 = 2.5 m/s.
    n = 1001
    force = np.full(n, 80.0 * 9.80665 + 400.0)
    dt = 0.5 / (n - 1)
    r = ground_reaction(force_series_N=force, dt_s=dt, mass_kg=80.0)
    assert abs(r["delta_v_ms"] - 2.5) < 1e-3
    # h = v²/2g = 2.5²/(2·9.80665) = 0.3187 m
    assert abs(r["jump_height_m"] - 0.3187) < 1e-3


# ---- 8. Allometric scaling ----------------------------------------------
def test_allometric_strength_two_thirds():
    # KNOWN: force/strength scales with cross-sectional area ∝ M^(2/3).
    # Doubling mass → strength × 2^(2/3) ≈ 1.587.
    r = allometric_stride(mass_kg=160.0, ref_mass_kg=80.0, ref_value=1000.0,
                          exponent=2.0 / 3.0)
    assert abs(r["scaled_value"] - 1000.0 * 2 ** (2 / 3)) < 1e-3
    assert abs(r["scaled_value"] - 1587.4) < 0.5


def test_allometric_fit_recovers_one_third_stride():
    # KNOWN: geometric similarity → stride length ∝ M^(1/3). Recover exponent.
    masses = np.array([1.0, 10.0, 100.0, 1000.0])
    values = 0.5 * masses ** (1.0 / 3.0)
    r = allometric_fit(masses=masses, values=values)
    assert abs(r["exponent"] - 1.0 / 3.0) < 1e-6
    assert abs(r["coefficient"] - 0.5) < 1e-6


# ---- Route table ---------------------------------------------------------
def test_route_table():
    assert route("hill_muscle") is hill_muscle
    assert route("bone_stress") is bone_stress
    assert route("joint_torque") is joint_torque
    assert route("gait") is gait_pendulum
    assert route("cost_transport") is cost_transport
    assert route("tendon") is tendon_energy
    assert route("ground_reaction") is ground_reaction
    assert route("allometric_stride") is allometric_stride
    assert route("biomechanic") is hill_muscle
    assert route("nonexistent") is None
