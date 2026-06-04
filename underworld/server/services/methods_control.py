"""Real control-systems / control-theory simulations.

Each function is a distinct, named control-theory method (not a shared engine
reused), implemented with numpy/scipy/math and verified against a KNOWN published
or analytically exact value in the companion tests. Domains: second-order
transient response, PID closed-loop simulation, polynomial stability
(Routh-Hurwitz), pole-based damping/natural-frequency, Ziegler-Nichols tuning,
Bode gain/phase margins, discrete state-space controllability, and Lyapunov
stability.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_control.py.
"""
from __future__ import annotations

import math

import numpy as np
from scipy import linalg, signal


# ── 1. Second-order step response metrics ─────────────────────────────────────
def second_order_step_metrics(zeta: float, wn: float) -> dict:
    """Closed-form transient metrics of a standard underdamped second-order
    system  G(s) = wn^2 / (s^2 + 2*zeta*wn*s + wn^2)  to a unit step:
        percent overshoot  PO = 100 * exp(-pi*zeta / sqrt(1 - zeta^2))
        peak time          tp = pi / (wn*sqrt(1 - zeta^2))
        settling time (2%) ts = 4 / (zeta*wn)
        rise time (approx) tr ~= (pi - acos(zeta)) / (wn*sqrt(1 - zeta^2))
    KNOWN: zeta=0.5 -> overshoot ~= 16.30%; zeta=0.707 -> overshoot ~= 4.3%.

    Ref: Ogata, "Modern Control Engineering"; Nise, "Control Systems
    Engineering" (second-order transient response).
    """
    if not (0.0 < zeta < 1.0):
        raise ValueError("underdamped metrics require 0 < zeta < 1")
    if wn <= 0.0:
        raise ValueError("natural frequency wn must be positive")
    wd = wn * math.sqrt(1.0 - zeta * zeta)              # damped natural frequency
    percent_overshoot = 100.0 * math.exp(-math.pi * zeta / math.sqrt(1.0 - zeta * zeta))
    peak_time = math.pi / wd
    settling_time_2pct = 4.0 / (zeta * wn)
    settling_time_5pct = 3.0 / (zeta * wn)
    rise_time = (math.pi - math.acos(zeta)) / wd
    return {
        "zeta": zeta,
        "wn": wn,
        "damped_wn": wd,
        "percent_overshoot": percent_overshoot,
        "peak_time": peak_time,
        "settling_time_2pct": settling_time_2pct,
        "settling_time_5pct": settling_time_5pct,
        "rise_time": rise_time,
    }


# ── 2. PID closed-loop simulation of a first-order plant ───────────────────────
def pid_closed_loop_response(kp: float, ki: float, kd: float,
                             *, plant_tau: float = 1.0, plant_k: float = 1.0,
                             setpoint: float = 1.0, t_end: float = 50.0,
                             dt: float = 1e-3) -> dict:
    """Numerically integrate a PID controller driving a first-order plant
        plant:  tau * y' + y = K * u        (u = control signal)
        error:  e = setpoint - y
        u = kp*e + ki*∫e dt + kd*de/dt
    using explicit Euler integration, returning steady-state error and overshoot.
    For a pure-integral or PI controller the closed loop has zero steady-state
    error to a step (the integrator removes offset); a P-only controller leaves a
    finite offset e_ss = setpoint / (1 + K*kp).
    KNOWN: P-only (ki=kd=0) on K=1 plant with kp=9 -> e_ss = 1/(1+9) = 0.1 of the
    setpoint; adding integral action drives e_ss -> 0.

    Ref: Astrom & Murray, "Feedback Systems"; Franklin, Powell & Emami-Naeini,
    "Feedback Control of Dynamic Systems" (PID control).
    """
    n = int(round(t_end / dt))
    y = 0.0
    integral = 0.0
    prev_err = setpoint - y
    y_max = y
    ys = np.empty(n + 1)
    ys[0] = y
    for k in range(1, n + 1):
        err = setpoint - y
        integral += err * dt
        deriv = (err - prev_err) / dt
        u = kp * err + ki * integral + kd * deriv
        # first-order plant: y' = (K*u - y)/tau
        y += dt * (plant_k * u - y) / plant_tau
        prev_err = err
        ys[k] = y
        if y > y_max:
            y_max = y
    steady_state_value = y
    steady_state_error = setpoint - steady_state_value
    overshoot = max(0.0, y_max - setpoint)
    percent_overshoot = 100.0 * overshoot / setpoint if setpoint != 0.0 else 0.0
    return {
        "kp": kp, "ki": ki, "kd": kd,
        "setpoint": setpoint,
        "steady_state_value": steady_state_value,
        "steady_state_error": steady_state_error,
        "peak_value": y_max,
        "overshoot": overshoot,
        "percent_overshoot": percent_overshoot,
        "n_steps": n,
    }


# ── 3. Routh-Hurwitz stability test ───────────────────────────────────────────
def routh_hurwitz(coeffs: list) -> dict:
    """Routh-Hurwitz stability criterion for a characteristic polynomial
        a0*s^n + a1*s^(n-1) + ... + an = 0
    (coeffs given highest-order first). Builds the Routh array; the system is
    asymptotically stable iff every entry of the first column has the same
    (nonzero) sign. The number of first-column sign changes equals the number of
    closed right-half-plane (unstable) roots.
    KNOWN: s^3 + 2 s^2 + 3 s + 1 is stable (0 sign changes); s^3 + s^2 + 2 s + 8
    has 2 RHP roots (2 sign changes), hence unstable.

    Ref: Routh-Hurwitz stability criterion (Ogata; Dorf & Bishop, "Modern
    Control Systems").
    """
    a = [float(c) for c in coeffs]
    n = len(a) - 1
    if n < 1:
        raise ValueError("need a polynomial of degree >= 1")
    ncols = (n // 2) + 1
    table = np.zeros((n + 1, ncols))
    # first two rows from the coefficients (even/odd index split)
    table[0, : len(a[0::2])] = a[0::2]
    table[1, : len(a[1::2])] = a[1::2]
    eps = 1e-12
    for i in range(2, n + 1):
        if abs(table[i - 1, 0]) < eps:
            table[i - 1, 0] = eps                       # avoid divide-by-zero
        for j in range(ncols - 1):
            a_ = table[i - 2, 0]
            b_ = table[i - 1, 0]
            c_ = table[i - 2, j + 1]
            d_ = table[i - 1, j + 1]
            table[i, j] = (b_ * c_ - a_ * d_) / b_
    first_col = table[:, 0]
    # count sign changes among nonzero first-column entries
    signs = [math.copysign(1.0, v) for v in first_col if abs(v) > eps]
    sign_changes = sum(1 for p, q in zip(signs, signs[1:]) if p != q)
    stable = (sign_changes == 0) and all(abs(v) > eps for v in first_col)
    return {
        "degree": n,
        "first_column": first_col.tolist(),
        "sign_changes": sign_changes,
        "rhp_roots": sign_changes,
        "stable": bool(stable),
    }


# ── 4. Pole damping & natural frequency ───────────────────────────────────────
def pole_damping(poles: list) -> dict:
    """Damping ratio and natural frequency of each closed-loop pole. For a pole
    p = -sigma +/- j*wd of a second-order mode:
        wn   = |p| = sqrt(sigma^2 + wd^2)
        zeta = -Re(p) / |p| = sigma / wn
    The system is asymptotically stable iff every pole has Re(p) < 0.
    KNOWN: poles -1 +/- j (i.e. s^2 + 2s + 2) -> wn = sqrt(2) = 1.4142,
    zeta = 1/sqrt(2) = 0.7071.

    Ref: pole-zero analysis of second-order systems (Nise; Ogata).
    """
    ps = np.asarray(poles, dtype=complex)
    wn = np.abs(ps)
    with np.errstate(invalid="ignore", divide="ignore"):
        zeta = np.where(wn > 0.0, -ps.real / wn, 0.0)
    stable = bool(np.all(ps.real < 0.0))
    return {
        "poles_real": ps.real.tolist(),
        "poles_imag": ps.imag.tolist(),
        "natural_frequencies": wn.tolist(),
        "damping_ratios": zeta.tolist(),
        "stable": stable,
    }


# ── 5. Ziegler-Nichols PID tuning ─────────────────────────────────────────────
def ziegler_nichols_tuning(ku: float, tu: float, *, rule: str = "classic_pid") -> dict:
    """Ziegler-Nichols closed-loop ("ultimate gain") PID tuning rules. From the
    ultimate gain Ku (gain at which the loop sustains oscillation) and the
    oscillation period Tu, the classic PID gains are:
        Kp = 0.6*Ku,  Ti = Tu/2,  Td = Tu/8
        Ki = Kp/Ti = 1.2*Ku/Tu,  Kd = Kp*Td = 0.075*Ku*Tu
    Also supports the "P", "PI", and "pessen"/"some_overshoot"/"no_overshoot"
    variants.
    KNOWN: Ku=10, Tu=4 (classic PID) -> Kp=6.0, Ki=3.0, Kd=3.0.

    Ref: Ziegler & Nichols (1942), "Optimum Settings for Automatic Controllers";
    Astrom & Hagglund, "PID Controllers".
    """
    if ku <= 0.0 or tu <= 0.0:
        raise ValueError("Ku and Tu must be positive")
    rules = {
        # rule: (Kp_factor, Ti_factor_of_Tu, Td_factor_of_Tu)  (None => disabled)
        "P":              (0.5, None, None),
        "PI":             (0.45, 1.0 / 1.2, None),
        "PD":             (0.8, None, 0.125),
        "classic_pid":    (0.6, 0.5, 0.125),
        "pessen":         (0.7, 0.4, 0.15),
        "some_overshoot": (1.0 / 3.0, 0.5, 1.0 / 3.0),
        "no_overshoot":   (0.2, 0.5, 1.0 / 3.0),
    }
    if rule not in rules:
        raise ValueError(f"unknown rule {rule!r}; choose from {sorted(rules)}")
    kp_f, ti_f, td_f = rules[rule]
    kp = kp_f * ku
    ti = ti_f * tu if ti_f is not None else math.inf
    td = td_f * tu if td_f is not None else 0.0
    ki = kp / ti if math.isfinite(ti) else 0.0
    kd = kp * td
    return {
        "rule": rule,
        "ku": ku, "tu": tu,
        "kp": kp, "ki": ki, "kd": kd,
        "ti": ti, "td": td,
    }


# ── 6. Bode gain & phase margins ──────────────────────────────────────────────
def bode_margins(num: list, den: list) -> dict:
    """Gain margin and phase margin of an open-loop transfer function
        L(s) = num(s)/den(s)
    via scipy.signal. The phase margin is (180 deg + phase at the gain-crossover
    frequency, where |L| = 1); the gain margin is 1/|L| at the phase-crossover
    frequency (where phase = -180 deg). Positive margins => the unity-feedback
    closed loop is stable.
    KNOWN: L(s) = 1 / (s*(s+1)*(s+2)) has gain margin ~= 6 (about 15.6 dB) at the
    phase crossover wpc = sqrt(2) ~= 1.414 rad/s, and a positive phase margin.

    Ref: Bode stability margins (Franklin, Powell & Emami-Naeini; Ogata).
    """
    sys = signal.TransferFunction(np.asarray(num, dtype=float),
                                  np.asarray(den, dtype=float))
    w = np.logspace(-3, 3, 200000)
    w, mag_db, phase_deg = signal.bode(sys, w=w)
    mag = 10.0 ** (mag_db / 20.0)
    phase = phase_deg

    def _interp_crossing(x, y, target):
        crossings = []
        for i in range(len(y) - 1):
            if (y[i] - target) == 0.0:
                crossings.append(x[i])
            elif (y[i] - target) * (y[i + 1] - target) < 0.0:
                t = (target - y[i]) / (y[i + 1] - y[i])
                crossings.append(x[i] + t * (x[i + 1] - x[i]))
        return crossings

    # gain crossover: |L| = 1  (mag_db = 0) -> phase margin
    gc = _interp_crossing(w, mag_db, 0.0)
    phase_margin = None
    wc_gain = None
    if gc:
        wc_gain = gc[0]
        ph_at = float(np.interp(wc_gain, w, phase))
        phase_margin = 180.0 + ph_at

    # phase crossover: phase = -180 deg -> gain margin
    pc = _interp_crossing(w, phase, -180.0)
    gain_margin = None
    gain_margin_db = None
    wc_phase = None
    if pc:
        wc_phase = pc[0]
        mag_at = float(np.interp(wc_phase, w, mag))
        gain_margin = 1.0 / mag_at if mag_at != 0.0 else math.inf
        gain_margin_db = -20.0 * math.log10(mag_at) if mag_at > 0.0 else math.inf

    stable = ((phase_margin is None or phase_margin > 0.0) and
              (gain_margin is None or gain_margin > 1.0))
    return {
        "gain_crossover_w": wc_gain,
        "phase_crossover_w": wc_phase,
        "phase_margin_deg": phase_margin,
        "gain_margin": gain_margin,
        "gain_margin_db": gain_margin_db,
        "stable": bool(stable),
    }


# ── 7. Discrete state-space step & controllability ────────────────────────────
def state_space_controllability(A: list, B: list,
                                *, x0: list | None = None,
                                u: float = 1.0, steps: int = 1) -> dict:
    """Discrete-time state-space propagation  x_{k+1} = A x_k + B u_k  together
    with the Kalman controllability test. The controllability matrix is
        C = [ B  A B  A^2 B  ...  A^(n-1) B ]
    and the pair (A, B) is controllable (every state reachable) iff rank(C) = n.
    KNOWN: A=[[0,1],[0,0]], B=[[0],[1]] (a discrete double integrator) is
    controllable, rank(C) = n = 2.

    Ref: Kalman controllability rank condition (Chen, "Linear System Theory and
    Design"; Ogata).
    """
    Am = np.asarray(A, dtype=float)
    Bm = np.asarray(B, dtype=float)
    if Bm.ndim == 1:
        Bm = Bm.reshape(-1, 1)
    n = Am.shape[0]
    # controllability matrix C = [B, AB, ..., A^(n-1) B]
    blocks = [Bm]
    Ak = Bm
    for _ in range(1, n):
        Ak = Am @ Ak
        blocks.append(Ak)
    C = np.hstack(blocks)
    rank = int(np.linalg.matrix_rank(C))
    controllable = (rank == n)

    # propagate the discrete state for `steps` with a constant scalar input u
    x = np.zeros(n) if x0 is None else np.asarray(x0, dtype=float)
    uvec = np.full(Bm.shape[1], float(u))
    traj = [x.tolist()]
    for _ in range(steps):
        x = Am @ x + Bm @ uvec
        traj.append(x.tolist())
    return {
        "n_states": n,
        "controllability_rank": rank,
        "controllable": bool(controllable),
        "controllability_matrix": C.tolist(),
        "final_state": x.tolist(),
        "trajectory": traj,
    }


# ── 8. Lyapunov stability ─────────────────────────────────────────────────────
def lyapunov_stability(A: list, Q: list | None = None) -> dict:
    """Continuous Lyapunov stability test. For a stable linear system x' = A x,
    the Lyapunov equation
        A^T P + P A = -Q     (Q symmetric positive-definite)
    has a unique symmetric positive-definite solution P iff A is Hurwitz (all
    eigenvalues have negative real part). P > 0 then certifies asymptotic
    stability via V(x) = x^T P x.
    KNOWN: A = [[0,1],[-2,-3]] (eigenvalues -1, -2) with Q = I yields a positive-
    definite P, confirming stability.

    Ref: Lyapunov's direct method / Lyapunov equation (Khalil, "Nonlinear
    Systems"; solved with scipy.linalg.solve_continuous_lyapunov).
    """
    Am = np.asarray(A, dtype=float)
    n = Am.shape[0]
    Qm = np.eye(n) if Q is None else np.asarray(Q, dtype=float)
    # scipy solves A X + X A^H = Q, so pass A^T and -Q to get A^T P + P A = -Q
    P = linalg.solve_continuous_lyapunov(Am.T, -Qm)
    P = 0.5 * (P + P.T)                                  # symmetrize
    p_eigs = np.linalg.eigvalsh(P)
    a_eigs = np.linalg.eigvals(Am)
    p_pos_def = bool(np.all(p_eigs > 0.0))
    hurwitz = bool(np.all(a_eigs.real < 0.0))
    return {
        "P": P.tolist(),
        "P_eigenvalues": p_eigs.tolist(),
        "P_positive_definite": p_pos_def,
        "A_eigenvalues_real": a_eigs.real.tolist(),
        "hurwitz": hurwitz,
        "stable": p_pos_def and hurwitz,
    }
