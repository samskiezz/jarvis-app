"""Each control-systems method must reproduce its KNOWN published or
analytically exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_control import (
    bode_margins,
    lyapunov_stability,
    pid_closed_loop_response,
    pole_damping,
    routh_hurwitz,
    second_order_step_metrics,
    state_space_controllability,
    ziegler_nichols_tuning,
)


# 1. Second-order step metrics — KNOWN: zeta=0.5 -> overshoot ~= 16.30%;
#    zeta=0.707 -> ~= 4.3%; ts(2%) = 4/(zeta*wn).
#    Ref: Ogata / Nise, second-order transient response.
def test_second_order_overshoot_known():
    r = second_order_step_metrics(0.5, 1.0)
    assert abs(r["percent_overshoot"] - 16.303) < 1e-2      # zeta=0.5 -> 16.30%
    assert abs(r["peak_time"] - math.pi / math.sqrt(0.75)) < 1e-9
    assert abs(r["settling_time_2pct"] - 8.0) < 1e-9        # 4/(0.5*1)
    # damping ratio sqrt(2)/2 -> overshoot ~= 4.32%
    r2 = second_order_step_metrics(math.sqrt(2) / 2, 2.0)
    assert abs(r2["percent_overshoot"] - 4.321) < 1e-2
    assert abs(r2["settling_time_2pct"] - 4.0 / (math.sqrt(2) / 2 * 2.0)) < 1e-9


# 2. PID closed-loop — KNOWN: P-only on a unit-gain plant with kp=9 leaves a
#    finite offset e_ss = 1/(1+K*kp) = 0.1; adding integral action -> e_ss ~= 0.
#    Ref: Astrom & Murray, "Feedback Systems".
def test_pid_steady_state_error_known():
    p = pid_closed_loop_response(9.0, 0.0, 0.0)            # P-only
    assert abs(p["steady_state_error"] - 0.1) < 1e-3       # 1/(1+9)
    assert abs(p["steady_state_value"] - 0.9) < 1e-3
    pi = pid_closed_loop_response(2.0, 1.0, 0.0)           # add integral
    assert abs(pi["steady_state_error"]) < 1e-3            # integrator removes offset
    # higher P gain -> smaller offset
    p_high = pid_closed_loop_response(99.0, 0.0, 0.0)
    assert p_high["steady_state_error"] < p["steady_state_error"]


# 3. Routh-Hurwitz — KNOWN: s^3 + 2 s^2 + 3 s + 1 stable (0 sign changes);
#    s^3 + s^2 + 2 s + 8 has 2 RHP roots (unstable).
#    Ref: Routh-Hurwitz criterion (Ogata; Dorf & Bishop).
def test_routh_hurwitz_stable_and_unstable():
    stable = routh_hurwitz([1.0, 2.0, 3.0, 1.0])
    assert stable["stable"] is True
    assert stable["sign_changes"] == 0
    unstable = routh_hurwitz([1.0, 1.0, 2.0, 8.0])
    assert unstable["stable"] is False
    assert unstable["rhp_roots"] == 2                      # two RHP roots
    # cross-check against numpy root signs
    import numpy as np
    roots = np.roots([1.0, 1.0, 2.0, 8.0])
    assert int(np.sum(roots.real > 0.0)) == unstable["rhp_roots"]


# 4. Pole damping — KNOWN: poles -1 +/- j (s^2+2s+2) -> wn=sqrt(2)=1.4142,
#    zeta=1/sqrt(2)=0.7071.
#    Ref: pole-zero analysis (Nise; Ogata).
def test_pole_damping_known():
    r = pole_damping([complex(-1, 1), complex(-1, -1)])
    assert abs(r["natural_frequencies"][0] - math.sqrt(2)) < 1e-9
    assert abs(r["damping_ratios"][0] - 1.0 / math.sqrt(2)) < 1e-9
    assert r["stable"] is True
    # an RHP pole is unstable
    assert pole_damping([complex(1, 1)])["stable"] is False


# 5. Ziegler-Nichols — KNOWN: Ku=10, Tu=4 (classic PID) -> Kp=6.0, Ki=3.0, Kd=3.0.
#    Ref: Ziegler & Nichols (1942); Astrom & Hagglund.
def test_ziegler_nichols_classic_pid_known():
    r = ziegler_nichols_tuning(10.0, 4.0, rule="classic_pid")
    assert abs(r["kp"] - 6.0) < 1e-12                      # 0.6*Ku
    assert abs(r["ki"] - 3.0) < 1e-12                      # 1.2*Ku/Tu
    assert abs(r["kd"] - 3.0) < 1e-12                      # 0.075*Ku*Tu
    # P-only rule: Kp = 0.5*Ku, no integral/derivative
    p = ziegler_nichols_tuning(10.0, 4.0, rule="P")
    assert abs(p["kp"] - 5.0) < 1e-12
    assert p["ki"] == 0.0 and p["kd"] == 0.0


# 6. Bode margins — KNOWN: L(s) = 1/(s(s+1)(s+2)) has gain margin = 6
#    (~15.56 dB) at phase crossover wpc = sqrt(2) ~= 1.414 rad/s.
#    Ref: Bode stability margins (Franklin, Powell & Emami-Naeini).
def test_bode_gain_margin_known():
    r = bode_margins([1.0], [1.0, 3.0, 2.0, 0.0])
    assert abs(r["phase_crossover_w"] - math.sqrt(2)) < 1e-3   # wpc = sqrt(2)
    assert abs(r["gain_margin"] - 6.0) < 1e-2                  # GM = 6
    assert abs(r["gain_margin_db"] - 15.563) < 1e-2           # ~15.56 dB
    assert r["phase_margin_deg"] > 0.0
    assert r["stable"] is True


# 7. State-space controllability — KNOWN: discrete double integrator
#    A=[[0,1],[0,0]], B=[[0],[1]] is controllable, rank(C) = n = 2.
#    Ref: Kalman controllability rank condition (Chen; Ogata).
def test_state_space_controllability_known():
    r = state_space_controllability([[0.0, 1.0], [0.0, 0.0]], [[0.0], [1.0]])
    assert r["controllability_rank"] == 2
    assert r["controllable"] is True
    # an uncontrollable pair: B aligned with an eigenvector, no coupling
    unc = state_space_controllability([[1.0, 0.0], [0.0, 2.0]], [[1.0], [0.0]])
    assert unc["controllable"] is False
    assert unc["controllability_rank"] == 1
    # propagation: x_{k+1}=Ax+Bu from rest, u=1, one step -> [0,1]
    step = state_space_controllability([[0.0, 1.0], [0.0, 0.0]], [[0.0], [1.0]],
                                       x0=[0.0, 0.0], u=1.0, steps=1)
    assert step["final_state"] == [0.0, 1.0]


# 8. Lyapunov stability — KNOWN: A=[[0,1],[-2,-3]] (eigenvalues -1,-2) with Q=I
#    yields a positive-definite P, confirming asymptotic stability.
#    Ref: Lyapunov's direct method (Khalil); scipy solve_continuous_lyapunov.
def test_lyapunov_stability_known():
    import numpy as np
    A = [[0.0, 1.0], [-2.0, -3.0]]
    r = lyapunov_stability(A)
    assert r["P_positive_definite"] is True
    assert r["hurwitz"] is True
    assert r["stable"] is True
    # verify A^T P + P A = -Q (= -I) is actually satisfied
    Am = np.array(A)
    P = np.array(r["P"])
    residual = Am.T @ P + P @ Am + np.eye(2)
    assert np.max(np.abs(residual)) < 1e-9
    # an unstable A (positive eigenvalue) is not Hurwitz
    assert lyapunov_stability([[1.0, 0.0], [0.0, -2.0]])["stable"] is False
