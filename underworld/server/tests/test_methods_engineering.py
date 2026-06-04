"""Each engineering method must reproduce its KNOWN engineering result.

Every assertion below is checked against a published / textbook value with an
explicit tolerance and citation.
"""
import math

from underworld.server.services.methods_engineering import (
    pid_step_response,
    second_order_response,
    butterworth_lowpass,
    fin_heat_transfer,
    pipe_flow_head_loss,
    euler_buckling_load,
    rankine_cycle_efficiency,
    spring_mass_frequency,
)


# 1. CONTROL — PID closed loop settles with zero steady-state error.
#    KNOWN: an integral term removes steady-state error and a stable loop
#    settles to the setpoint (Ogata, Modern Control Engineering, step response).
def test_pid_step_response_settles_and_stable():
    r = pid_step_response(kp=2.0, ki=1.0, kd=0.5, setpoint=1.0)
    assert r["stable"] is True
    assert r["settled"] is True
    assert abs(r["steady_state_error"]) < 1e-2   # integral action -> ~0 error


# 2. TRANSFER FUNCTION — percent overshoot for zeta = 0.5.
#    KNOWN: Mp = exp(-zeta*pi/sqrt(1-zeta^2))*100 = 16.3 % at zeta=0.5
#    (Toronto Metropolitan U "Introduction to Control Systems"; ScienceDirect
#    "Percentage Overshoot"). Simulated step response must match the formula.
def test_second_order_overshoot_zeta_half():
    r = second_order_response(zeta=0.5, wn=1.0)
    assert abs(r["percent_overshoot_theory"] - 16.3) < 0.3        # 16.3 %
    assert abs(r["percent_overshoot_simulated"] - 16.3) < 0.6     # sim matches
    assert r["underdamped"] is True


# 3. SIGNAL PROCESSING — Butterworth magnitude at cutoff.
#    KNOWN: |H(jw_c)| = 1/sqrt(2) = 0.70710678 (-3.0103 dB) for ANY order
#    (Wikipedia: Butterworth filter; electronics-tutorials.ws filter_8).
def test_butterworth_minus_3db_at_cutoff_any_order():
    for order in (2, 4, 8):
        r = butterworth_lowpass(order=order, cutoff_hz=100.0, fs=2000.0)
        assert abs(r["magnitude_at_cutoff"] - (1.0 / math.sqrt(2.0))) < 5e-3
        assert abs(r["db_at_cutoff"] - (-3.0103)) < 0.05
        assert abs(r["dc_gain"] - 1.0) < 1e-6                     # unity passband


# 4. HEAT TRANSFER — fin efficiency = tanh(mL)/(mL).
#    KNOWN: closed-form fin efficiency (Incropera, Fundamentals of Heat & Mass
#    Transfer). Cross-check: q_fin / q_max == eta exactly, and eta in (0,1].
def test_fin_efficiency_matches_tanh_form():
    r = fin_heat_transfer()
    mL = r["mL"]
    expected_eta = math.tanh(mL) / mL
    assert abs(r["efficiency"] - expected_eta) < 1e-9
    assert abs(r["efficiency"] - r["efficiency_from_ratio"]) < 1e-9
    assert 0.0 < r["efficiency"] <= 1.0


# 5. FLUID — Darcy-Weisbach / Reynolds number.
#    KNOWN: Re = rho v D / mu; laminar (Re<2300) friction f = 64/Re exactly
#    (Wikipedia: Darcy-Weisbach equation; Reynolds number critical ~2300).
def test_pipe_flow_laminar_and_friction():
    # Slow flow -> laminar: water 0.02 m/s, D=0.05 m -> Re ~ 996 < 2300.
    lam = pipe_flow_head_loss(velocity=0.02, diameter=0.05)
    assert lam["laminar"] is True
    assert lam["reynolds"] < 2300.0
    assert abs(lam["friction_factor"] - 64.0 / lam["reynolds"]) < 1e-9
    # Fast flow -> turbulent: water 1 m/s, D=0.05 m -> Re ~ 49,700.
    turb = pipe_flow_head_loss(velocity=1.0, diameter=0.05)
    assert turb["laminar"] is False
    assert turb["reynolds"] > 2300.0
    assert abs(turb["reynolds"] - 49800.0) < 600.0   # rho/mu of water at 20C


# 6. STRUCTURAL — Euler critical buckling load Pcr = pi^2 E I / (K L)^2.
#    KNOWN: pinned-pinned column (K=1) Pcr = pi^2 E I / L^2
#    (Wikipedia: Euler's critical load).
def test_euler_buckling_critical_load():
    E, I, L = 200e9, 1.0e-8, 2.0
    r = euler_buckling_load(E=E, I=I, length=L, k_factor=1.0)
    expected = (math.pi ** 2) * E * I / (L ** 2)
    assert abs(r["critical_load_n"] - expected) < 1e-3
    assert abs(r["critical_load_n"] - 4934.8) < 0.5   # numeric KNOWN value


# 7. THERMODYNAMICS — Carnot efficiency = 1 - Tc/Th.
#    KNOWN: Th=600 K, Tc=300 K -> eta = 0.5 (Wikipedia: Carnot cycle).
def test_rankine_carnot_efficiency():
    r = rankine_cycle_efficiency(t_hot_k=600.0, t_cold_k=300.0,
                                 q_in=2000.0, w_net=800.0)
    assert abs(r["carnot_efficiency"] - 0.5) < 1e-12
    assert r["within_carnot_bound"] is True            # 0.4 cycle <= 0.5 Carnot


# 8. VIBRATION — spring-mass natural frequency f = (1/2pi) sqrt(k/m).
#    KNOWN: k=1000 N/m, m=2 kg -> wn=22.3607 rad/s, f_n=3.5588 Hz
#    (Rao, Mechanical Vibrations; Wikipedia: simple harmonic motion).
def test_spring_mass_natural_frequency():
    r = spring_mass_frequency(k=1000.0, m=2.0)
    assert abs(r["natural_freq_rad_s"] - math.sqrt(1000.0 / 2.0)) < 1e-9
    assert abs(r["natural_freq_hz"] - 3.5588) < 1e-3
    assert abs(r["natural_freq_hz"] - (1.0 / (2.0 * math.pi)) * math.sqrt(500.0)) < 1e-9
