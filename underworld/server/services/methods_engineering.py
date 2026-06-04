"""Real engineering simulation methods.

Eight named, real engineering methods, each computed from its canonical
published formula and each verified in the test suite against a KNOWN value:

  1. pid_step_response        — control theory: closed-loop PID step response,
                                verify settling to the setpoint (zero steady-state
                                error for a P+I controller on a stable plant).
  2. second_order_response    — transfer function / damping: percent overshoot of
                                an underdamped 2nd-order system; ζ=0.5 -> ~16.3%.
  3. butterworth_lowpass      — signal processing: nth-order Butterworth low-pass;
                                magnitude at cutoff is 1/sqrt(2) (-3 dB) for any n.
  4. fin_heat_transfer        — heat transfer: straight fin temperature/efficiency;
                                efficiency = tanh(mL)/(mL) for an insulated tip.
  5. pipe_flow_head_loss      — fluid mechanics: Darcy-Weisbach head loss and
                                Reynolds number; verify laminar Re < 2300 and
                                f = 64/Re in the laminar regime.
  6. euler_buckling_load      — beam / column stability: critical buckling load
                                Pcr = pi^2 E I / (K L)^2.
  7. rankine_cycle_efficiency — thermodynamics: ideal Rankine / Carnot efficiency;
                                Carnot eta = 1 - Tc/Th.
  8. spring_mass_frequency    — modal / vibration: natural frequency of an
                                undamped spring-mass, f = (1/2pi) sqrt(k/m).

Formulas are standard mechanical / control / signal-processing textbook results.
Sources (verified):
  - Percent overshoot Mp = exp(-zeta*pi/sqrt(1-zeta^2)); zeta=0.5 -> 16.3%
    (Toronto Metropolitan U "Introduction to Control Systems", ScienceDirect).
  - Butterworth |H(jw_c)| = 1/sqrt(2) (-3 dB) independent of order
    (Wikipedia: Butterworth filter; electronics-tutorials.ws).
  - Darcy-Weisbach h_f = f (L/D) v^2/(2g); laminar f = 64/Re; Re_crit ~ 2300
    (Wikipedia: Darcy-Weisbach equation, Reynolds number).
  - Euler critical load Pcr = pi^2 E I / (K L)^2 (Wikipedia: Euler's critical load).
  - Carnot efficiency eta = 1 - Tc/Th (Wikipedia: Carnot cycle).
  - Fin efficiency eta_f = tanh(mL)/(mL), m = sqrt(hP/kAc)
    (Incropera, Fundamentals of Heat and Mass Transfer).
  - Spring-mass natural frequency f_n = (1/2pi) sqrt(k/m) (Wikipedia: Simple
    harmonic motion / Rao, Mechanical Vibrations).
"""
from __future__ import annotations

import numpy as np
from scipy import signal


# 1. CONTROL THEORY — CLOSED-LOOP PID STEP RESPONSE --------------------------
def pid_step_response(*, kp: float = 2.0, ki: float = 1.0, kd: float = 0.5,
                      plant_num=(1.0,), plant_den=(1.0, 1.0, 1.0),
                      t_end: float = 40.0, n: int = 4000,
                      setpoint: float = 1.0) -> dict:
    """Unity-feedback closed-loop step response of a PID-controlled plant.

    Controller  C(s) = Kp + Ki/s + Kd s
    Plant       G(s) = num/den
    Closed loop T(s) = C G / (1 + C G)

    With an integrator (Ki > 0) on a stable loop, the step response has zero
    steady-state error: the output settles to the setpoint.

    Known check: final value -> setpoint, and the response settles
    (|y - setpoint| within 2% band by t_end -> closed-loop stability).
    """
    # Controller as a rational transfer function: (Kd s^2 + Kp s + Ki) / s
    c_num = np.array([kd, kp, ki], dtype=float)
    c_den = np.array([1.0, 0.0], dtype=float)
    # Open loop L = C * G  (polynomial multiplication = convolution)
    l_num = np.convolve(c_num, np.asarray(plant_num, dtype=float))
    l_den = np.convolve(c_den, np.asarray(plant_den, dtype=float))
    # Closed loop T = L / (L + den_of_L) for unity feedback:
    # T = l_num / (l_den + l_num) after aligning polynomial lengths
    deg = max(len(l_num), len(l_den))
    a = np.zeros(deg); b = np.zeros(deg)
    a[deg - len(l_num):] = l_num
    b[deg - len(l_den):] = l_den
    cl_num = a
    cl_den = a + b
    sys = signal.TransferFunction(cl_num, cl_den)
    t = np.linspace(0.0, t_end, n)
    _, y = signal.step(sys, T=t)
    y = y * setpoint
    final = float(y[-1])
    # closed-loop poles must be in the left half plane for stability
    poles = np.roots(cl_den)
    stable = bool(np.all(poles.real < 0))
    # settling: stays within 2% of setpoint over the last 10% of the record
    tail = y[int(0.9 * n):]
    band = 0.02 * abs(setpoint)
    settled = bool(np.all(np.abs(tail - setpoint) <= band))
    steady_state_error = float(setpoint - final)
    return {
        "final_value": final,
        "setpoint": float(setpoint),
        "steady_state_error": steady_state_error,
        "stable": stable,
        "settled": settled,
        "closed_loop_poles_real": [float(p.real) for p in poles],
    }


# 2. TRANSFER FUNCTION — SECOND-ORDER DAMPING / OVERSHOOT --------------------
def second_order_response(*, zeta: float = 0.5, wn: float = 1.0,
                          t_end: float = 30.0, n: int = 6000) -> dict:
    """Step response of a standard 2nd-order system wn^2/(s^2+2 zeta wn s+wn^2).

    Percent overshoot (underdamped, 0 < zeta < 1):
        Mp = exp(-zeta*pi / sqrt(1 - zeta^2)) * 100

    Known check: zeta = 0.5 -> Mp ~= 16.3 % (and peak time tp = pi/(wn sqrt(1-z^2))).
    """
    sys = signal.TransferFunction([wn * wn], [1.0, 2.0 * zeta * wn, wn * wn])
    t = np.linspace(0.0, t_end, n)
    _, y = signal.step(sys, T=t)
    peak = float(np.max(y))
    final = 1.0  # unit step DC gain of this normalized system
    overshoot_sim = (peak - final) / final * 100.0
    if 0.0 < zeta < 1.0:
        overshoot_theory = float(np.exp(-zeta * np.pi / np.sqrt(1.0 - zeta * zeta)) * 100.0)
        peak_time = float(np.pi / (wn * np.sqrt(1.0 - zeta * zeta)))
    else:
        overshoot_theory = 0.0
        peak_time = float("nan")
    return {
        "zeta": float(zeta),
        "wn": float(wn),
        "percent_overshoot_simulated": float(overshoot_sim),
        "percent_overshoot_theory": overshoot_theory,
        "peak_time_s": peak_time,
        "underdamped": bool(0.0 < zeta < 1.0),
    }


# 3. SIGNAL PROCESSING — BUTTERWORTH LOW-PASS FILTER -------------------------
def butterworth_lowpass(*, order: int = 4, cutoff_hz: float = 100.0,
                        fs: float = 2000.0) -> dict:
    """Digital nth-order Butterworth low-pass filter and its magnitude response.

    The defining property: |H(jw_c)| = 1/sqrt(2) (i.e. -3.0103 dB) at the
    cutoff frequency, for ANY filter order n. The passband is maximally flat.

    Known check: magnitude at cutoff = 0.70710678 (-3.0103 dB), any order.
    """
    b, a = signal.butter(order, cutoff_hz, btype="low", fs=fs)
    w, h = signal.freqz(b, a, worN=8192, fs=fs)
    mag = np.abs(h)
    idx = int(np.argmin(np.abs(w - cutoff_hz)))
    mag_at_cutoff = float(mag[idx])
    db_at_cutoff = float(20.0 * np.log10(mag_at_cutoff))
    # attenuation well above cutoff (one octave up) should drop with order
    idx_2x = int(np.argmin(np.abs(w - 2.0 * cutoff_hz)))
    db_octave_above = float(20.0 * np.log10(mag[idx_2x]))
    return {
        "order": int(order),
        "cutoff_hz": float(cutoff_hz),
        "magnitude_at_cutoff": mag_at_cutoff,
        "db_at_cutoff": db_at_cutoff,
        "db_one_octave_above": db_octave_above,
        "dc_gain": float(mag[0]),
    }


# 4. HEAT TRANSFER — FIN CONDUCTION / EFFICIENCY -----------------------------
def fin_heat_transfer(*, k: float = 200.0, h: float = 20.0,
                      length: float = 0.05, width: float = 0.05,
                      thickness: float = 0.003,
                      base_temp_c: float = 100.0,
                      ambient_temp_c: float = 25.0) -> dict:
    """Straight rectangular fin with an adiabatic (insulated) tip.

    Fin parameter   m   = sqrt(h P / (k A_c))      P=2(w+t), A_c = w*t
    Heat rate       q_f = sqrt(h P k A_c) * theta_b * tanh(mL)
    Efficiency      eta = tanh(mL) / (mL)
    Theta(x)/theta_b = cosh(m(L-x)) / cosh(mL)

    Known check: as mL -> 0, eta -> 1; the closed-form q_f equals
    sqrt(h P k A_c) * theta_b * tanh(mL) (Incropera, fin equation).
    """
    perimeter = 2.0 * (width + thickness)
    area_c = width * thickness
    theta_b = base_temp_c - ambient_temp_c
    m = np.sqrt(h * perimeter / (k * area_c))
    mL = m * length
    efficiency = float(np.tanh(mL) / mL)
    q_fin = float(np.sqrt(h * perimeter * k * area_c) * theta_b * np.tanh(mL))
    # max heat if entire fin were at base temperature
    q_max = float(h * perimeter * length * theta_b)
    tip_temp_c = float(ambient_temp_c + theta_b / np.cosh(mL))
    return {
        "fin_parameter_m": float(m),
        "mL": float(mL),
        "efficiency": efficiency,
        "heat_rate_w": q_fin,
        "max_heat_rate_w": q_max,
        "tip_temperature_c": tip_temp_c,
        "efficiency_from_ratio": float(q_fin / q_max),
    }


# 5. FLUID MECHANICS — DARCY-WEISBACH / REYNOLDS NUMBER ----------------------
def pipe_flow_head_loss(*, velocity: float = 1.0, diameter: float = 0.05,
                        length: float = 10.0, density: float = 998.0,
                        viscosity: float = 1.002e-3, g: float = 9.80665) -> dict:
    """Pressure / head loss in a circular pipe via the Darcy-Weisbach equation.

    Reynolds number Re = rho v D / mu
    Laminar (Re < 2300):  f = 64 / Re
    Turbulent (smooth):   f via Blasius f = 0.316 Re^-0.25 (4e3 < Re < 1e5)
    Head loss       h_f = f (L/D) v^2 / (2 g)
    Pressure drop   dP  = rho g h_f

    Known check: water at 1 m/s in a 0.05 m pipe -> Re ~ 49,700 (turbulent),
    and at 0.02 m/s -> Re ~ 996 (laminar, < 2300) with f = 64/Re exactly.
    """
    reynolds = density * velocity * diameter / viscosity
    laminar = bool(reynolds < 2300.0)
    if laminar:
        friction_factor = 64.0 / reynolds
        regime = "laminar"
    elif reynolds < 1.0e5:
        friction_factor = 0.316 * reynolds ** (-0.25)
        regime = "turbulent_blasius"
    else:
        friction_factor = 0.316 * reynolds ** (-0.25)
        regime = "turbulent_extrapolated"
    head_loss = friction_factor * (length / diameter) * velocity ** 2 / (2.0 * g)
    pressure_drop = density * g * head_loss
    return {
        "reynolds": float(reynolds),
        "regime": regime,
        "laminar": laminar,
        "friction_factor": float(friction_factor),
        "head_loss_m": float(head_loss),
        "pressure_drop_pa": float(pressure_drop),
    }


# 6. STRUCTURAL — EULER COLUMN BUCKLING --------------------------------------
def euler_buckling_load(*, E: float = 200e9, I: float = 1.0e-8,
                        length: float = 2.0, k_factor: float = 1.0) -> dict:
    """Euler critical buckling load of a slender column.

    Pcr = pi^2 E I / (K L)^2        (K = effective length factor)
    Critical stress sigma_cr = Pcr / A   (if area supplied; here as Pcr only)

    Known check: pinned-pinned (K=1) Pcr = pi^2 E I / L^2 exactly.
    """
    effective_length = k_factor * length
    p_cr = (np.pi ** 2) * E * I / (effective_length ** 2)
    return {
        "critical_load_n": float(p_cr),
        "critical_load_kn": float(p_cr / 1000.0),
        "effective_length_m": float(effective_length),
        "k_factor": float(k_factor),
    }


# 7. THERMODYNAMICS — RANKINE / CARNOT CYCLE EFFICIENCY ----------------------
def rankine_cycle_efficiency(*, t_hot_k: float = 600.0, t_cold_k: float = 300.0,
                             q_in: float = 2000.0, w_net: float = 800.0) -> dict:
    """Ideal cycle efficiencies.

    Carnot (upper bound) eta_carnot = 1 - Tc / Th
    Cycle (1st law)      eta_cycle  = W_net / Q_in

    A real / Rankine cycle efficiency must never exceed the Carnot bound.

    Known check: Th=600 K, Tc=300 K -> eta_carnot = 0.5 (50%).
    """
    if t_hot_k <= t_cold_k:
        raise ValueError("hot reservoir must exceed cold reservoir (kelvin)")
    eta_carnot = 1.0 - t_cold_k / t_hot_k
    eta_cycle = w_net / q_in
    return {
        "carnot_efficiency": float(eta_carnot),
        "carnot_efficiency_percent": float(eta_carnot * 100.0),
        "cycle_efficiency": float(eta_cycle),
        "within_carnot_bound": bool(eta_cycle <= eta_carnot + 1e-12),
    }


# 8. VIBRATION — SPRING-MASS NATURAL FREQUENCY -------------------------------
def spring_mass_frequency(*, k: float = 1000.0, m: float = 2.0,
                          c: float = 0.0) -> dict:
    """Natural frequency of an undamped (and optionally damped) spring-mass.

    Undamped natural freq   wn = sqrt(k/m),  f_n = (1/2pi) sqrt(k/m)
    Damping ratio           zeta = c / (2 sqrt(k m))
    Damped natural freq     wd = wn sqrt(1 - zeta^2)   (zeta < 1)

    Known check: k=1000 N/m, m=2 kg -> wn = 22.36 rad/s, f_n = 3.559 Hz.
    """
    wn = np.sqrt(k / m)
    f_n = wn / (2.0 * np.pi)
    zeta = c / (2.0 * np.sqrt(k * m)) if c else 0.0
    if 0.0 <= zeta < 1.0:
        wd = wn * np.sqrt(1.0 - zeta * zeta)
    else:
        wd = 0.0
    return {
        "natural_freq_rad_s": float(wn),
        "natural_freq_hz": float(f_n),
        "period_s": float(1.0 / f_n),
        "damping_ratio": float(zeta),
        "damped_freq_rad_s": float(wd),
    }
