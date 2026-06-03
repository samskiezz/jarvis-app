"""Computational-neuroscience simulation methods.

Eight named, real neuroscience methods, each computed from its canonical
published model/equation and each verified in the test suite against a KNOWN
textbook value or qualitative law:

  1. lif_neuron               — leaky integrate-and-fire: firing rate rises with
                                input current; no spike below the rheobase
                                I_thresh = V_thresh / R; rate saturates at 1/t_ref.
  2. fitzhugh_nagumo          — excitable system: a large stimulus elicits a full
                                spike (v overshoots ~+1) while a small one only
                                produces a subthreshold deflection.
  3. cable_length_constant    — passive cable theory: lambda = sqrt(r_m / r_i);
                                signal decays to 1/e (~37%) over one lambda.
                                Known: r_m=4, r_i=1 -> lambda=2.
  4. synaptic_epsp_decay      — single-exponential EPSP V(t)=V0*exp(-t/tau);
                                Known: at t=tau the EPSP has decayed to V0/e (~37%).
  5. stdp_weight_change       — spike-timing-dependent plasticity:
                                pre BEFORE post (dt=t_post-t_pre>0) -> potentiation
                                (dW>0); post before pre -> depression (dW<0).
  6. hodgkin_huxley_refractory- HH membrane: immediately after a spike the neuron
                                is refractory, so a 2nd spike requires a LARGER
                                current than the first.
  7. population_fi_curve      — population firing-rate / sigmoid f-I curve:
                                monotonic and SATURATES at r_max for large input.
  8. resting_membrane_potential— Nernst/Goldman: E_K = (RT/zF) ln([K]o/[K]i)
                                ~= -90 mV; Goldman resting potential ~= -70 mV.

Sources: Gerstner et al., Neuronal Dynamics (EPFL online book); Scholarpedia
(FitzHugh-Nagumo, STDP); Wikipedia (Length constant, Cable theory); Hodgkin &
Huxley 1952; standard neurophysiology texts (Nernst/Goldman).
"""
from __future__ import annotations

import numpy as np

# --- Published physical constants -------------------------------------------
R_GAS = 8.314462618          # universal gas constant, J/(mol*K)
F_FARADAY = 96485.33212      # Faraday constant, C/mol
T_BODY_K = 310.15            # mammalian body temperature, 37 C in kelvin


# 1. LEAKY INTEGRATE-AND-FIRE -------------------------------------------------
def lif_neuron(*, input_current: float, resistance: float = 10.0,
               tau_m: float = 10.0, v_threshold: float = 1.0,
               v_reset: float = 0.0, t_refractory: float = 2.0,
               t_max: float = 1000.0, dt: float = 0.05) -> dict:
    """Leaky integrate-and-fire neuron driven by a constant current.

    Membrane equation:  tau_m * dV/dt = -V + R * I
    A spike is emitted when V reaches v_threshold; V is then clamped to
    v_reset for the absolute refractory period t_refractory.

    Known behaviour (Gerstner, Neuronal Dynamics 1.3): the neuron is silent
    unless I exceeds the rheobase  I_thresh = v_threshold / R; above it the
    firing rate increases with I and saturates at f_inf = 1/t_refractory.
    (Times in ms, so rate is reported in Hz = 1000/ISI_ms.)
    """
    i_thresh = v_threshold / resistance
    n = int(t_max / dt)
    v = v_reset
    refrac_until = -1.0
    spike_times: list[float] = []
    for k in range(n):
        t = k * dt
        if t < refrac_until:
            v = v_reset
            continue
        dv = (-v + resistance * input_current) / tau_m
        v = v + dv * dt
        if v >= v_threshold:
            spike_times.append(t)
            v = v_reset
            refrac_until = t + t_refractory
    n_spikes = len(spike_times)
    if n_spikes >= 2:
        isis = np.diff(spike_times)
        mean_isi = float(np.mean(isis))
        firing_rate_hz = 1000.0 / mean_isi  # ms -> Hz
    else:
        firing_rate_hz = 0.0
    return {
        "input_current": float(input_current),
        "rheobase_current": float(i_thresh),
        "above_threshold": bool(input_current > i_thresh),
        "n_spikes": int(n_spikes),
        "fired": bool(n_spikes > 0),
        "firing_rate_hz": float(firing_rate_hz),
        "max_rate_hz": float(1000.0 / t_refractory),
    }


# 2. FITZHUGH-NAGUMO EXCITABILITY --------------------------------------------
def fitzhugh_nagumo(*, stimulus: float, a: float = 0.7, b: float = 0.8,
                    tau: float = 12.5, t_stim: float = 1.0,
                    t_max: float = 200.0, dt: float = 0.01) -> dict:
    """FitzHugh-Nagumo excitable system.

        dv/dt = v - v^3/3 - w + I(t)
        dw/dt = (v + a - b*w) / tau

    The resting state is stable, but a brief stimulus larger than a threshold
    triggers a single large spike (v overshoots toward ~+2), whereas a small
    stimulus produces only a small subthreshold deflection that decays.

    `stimulus` is applied as a current pulse over the first t_stim units.
    Known behaviour (Scholarpedia, FitzHugh-Nagumo): spike vs subthreshold.
    """
    n = int(t_max / dt)
    # resting state near the stable fixed point
    v = -1.2
    w = -0.6
    v_peak = v
    for k in range(n):
        t = k * dt
        i_ext = stimulus if t < t_stim else 0.0
        dv = (v - (v ** 3) / 3.0 - w + i_ext)
        dw = (v + a - b * w) / tau
        v = v + dv * dt
        w = w + dw * dt
        if v > v_peak:
            v_peak = v
    # A genuine action potential overshoots well above zero (~+1.5..2).
    spiked = bool(v_peak > 1.0)
    return {
        "stimulus": float(stimulus),
        "v_peak": float(v_peak),
        "spiked": spiked,
        "subthreshold": bool(not spiked),
    }


# 3. CABLE EQUATION / LENGTH CONSTANT ----------------------------------------
def cable_length_constant(*, r_m: float, r_i: float,
                          distance: float | None = None) -> dict:
    """Passive-cable length (space) constant  lambda = sqrt(r_m / r_i).

    Steady-state solution of the cable equation:  V(x) = V0 * exp(-x/lambda),
    so the voltage decays to 1/e (~37%) of its value over one length constant.

    Known check: r_m = 4, r_i = 1  ->  lambda = 2; and V(lambda)/V0 = 1/e.
    """
    if r_m <= 0 or r_i <= 0:
        raise ValueError("resistances must be positive")
    lam = float(np.sqrt(r_m / r_i))
    if distance is None:
        distance = lam
    decay_fraction = float(np.exp(-distance / lam))
    return {
        "length_constant": lam,
        "distance": float(distance),
        "voltage_fraction": decay_fraction,
        "fraction_at_one_lambda": float(np.exp(-1.0)),  # ~0.3679
    }


# 4. SYNAPTIC EXPONENTIAL EPSP DECAY -----------------------------------------
def synaptic_epsp_decay(*, tau: float = 5.0, v0: float = 1.0,
                        t_eval: float | None = None,
                        t_max: float = 50.0, dt: float = 0.01) -> dict:
    """Single-exponential synaptic EPSP  V(t) = V0 * exp(-t / tau).

    The membrane potential relaxes back to baseline with time constant tau.
    Known check: at t = tau the EPSP has fallen to V0/e (~36.8% of V0);
    the time to decay to V0/2 is the half-life  t_half = tau * ln 2.

    The decay time constant is also recovered numerically from the simulated
    trace (slope of log V vs t) and must equal tau.
    """
    if tau <= 0:
        raise ValueError("tau must be positive")
    if t_eval is None:
        t_eval = tau
    t = np.arange(0.0, t_max, dt)
    v = v0 * np.exp(-t / tau)
    # recover tau from log-linear fit: ln V = ln V0 - t/tau
    slope = np.polyfit(t, np.log(v), 1)[0]
    tau_fit = -1.0 / slope
    return {
        "tau": float(tau),
        "tau_recovered": float(tau_fit),
        "v_at_tau": float(v0 * np.exp(-1.0)),     # V0/e
        "v_at_t_eval": float(v0 * np.exp(-t_eval / tau)),
        "half_life": float(tau * np.log(2.0)),
        "fraction_at_tau": float(np.exp(-1.0)),   # ~0.3679
    }


# 5. HEBBIAN / STDP WEIGHT CHANGE --------------------------------------------
def stdp_weight_change(*, t_pre: float, t_post: float,
                       a_plus: float = 0.01, a_minus: float = 0.012,
                       tau_plus: float = 20.0, tau_minus: float = 20.0) -> dict:
    """Spike-timing-dependent plasticity (asymmetric Hebbian rule).

        dt = t_post - t_pre
        dt > 0 (pre BEFORE post):  dW = +A+ * exp(-dt / tau+)   (potentiation)
        dt < 0 (post before pre):  dW = -A- * exp( dt / tau-)   (depression)

    Known behaviour (Bi & Poo 1998; Scholarpedia, STDP): a presynaptic spike
    that precedes the postsynaptic spike strengthens the synapse (dW > 0);
    the reverse order weakens it (dW < 0). Default tau = 20 ms.
    """
    dt = t_post - t_pre
    if dt > 0:
        dw = a_plus * np.exp(-dt / tau_plus)
    elif dt < 0:
        dw = -a_minus * np.exp(dt / tau_minus)
    else:
        dw = 0.0
    return {
        "dt": float(dt),
        "delta_w": float(dw),
        "potentiated": bool(dw > 0),
        "depressed": bool(dw < 0),
        "pre_before_post": bool(dt > 0),
    }


# 6. HODGKIN-HUXLEY REFRACTORY BEHAVIOUR -------------------------------------
def _hh_simulate(i_func, *, t_max: float, dt: float) -> dict:
    """Integrate the classic Hodgkin-Huxley squid-axon equations (1952).

    i_func(t) returns the injected current density (uA/cm^2) at time t (ms).
    Returns spike count and times. Constants are HH's original values.
    """
    # HH constants (squid giant axon, 6.3 C)
    Cm = 1.0          # uF/cm^2
    g_Na, g_K, g_L = 120.0, 36.0, 0.3   # mS/cm^2
    E_Na, E_K, E_L = 50.0, -77.0, -54.387  # mV
    V = -65.0
    # steady-state gating at rest
    def a_n(v): return 0.01 * (v + 55.0) / (1.0 - np.exp(-(v + 55.0) / 10.0))
    def b_n(v): return 0.125 * np.exp(-(v + 65.0) / 80.0)
    def a_m(v): return 0.1 * (v + 40.0) / (1.0 - np.exp(-(v + 40.0) / 10.0))
    def b_m(v): return 4.0 * np.exp(-(v + 65.0) / 18.0)
    def a_h(v): return 0.07 * np.exp(-(v + 65.0) / 20.0)
    def b_h(v): return 1.0 / (1.0 + np.exp(-(v + 35.0) / 10.0))
    n = a_n(V) / (a_n(V) + b_n(V))
    m = a_m(V) / (a_m(V) + b_m(V))
    h = a_h(V) / (a_h(V) + b_h(V))
    steps = int(t_max / dt)
    spike_times: list[float] = []
    above = False
    for k in range(steps):
        t = k * dt
        I = i_func(t)
        i_na = g_Na * (m ** 3) * h * (V - E_Na)
        i_k = g_K * (n ** 4) * (V - E_K)
        i_l = g_L * (V - E_L)
        dV = (I - i_na - i_k - i_l) / Cm
        V = V + dV * dt
        n = n + (a_n(V) * (1 - n) - b_n(V) * n) * dt
        m = m + (a_m(V) * (1 - m) - b_m(V) * m) * dt
        h = h + (a_h(V) * (1 - h) - b_h(V) * h) * dt
        # threshold crossing detection at 0 mV (upward)
        if V > 0.0 and not above:
            spike_times.append(t)
            above = True
        elif V < -20.0:
            above = False
    return {"n_spikes": len(spike_times), "spike_times": spike_times}


def hodgkin_huxley_refractory(*, current_amplitude: float,
                              pulse_width: float = 0.5,
                              inter_pulse: float = 5.0,
                              t_max: float = 30.0, dt: float = 0.01) -> dict:
    """Probe HH refractoriness with two brief current pulses.

    Two identical pulses of amplitude `current_amplitude` are delivered, the
    second `inter_pulse` ms after the first. During the relative refractory
    period the second pulse needs a LARGER current to evoke a spike.

    This function reports how many spikes a given amplitude evokes when paired
    pulses are applied; the test sweeps amplitude to confirm that a single
    pulse fires at a lower amplitude than is needed for the second of a pair.
    Known behaviour (Hodgkin & Huxley 1952): refractoriness raises the
    threshold of the second spike.
    """
    t1_start, t1_end = 1.0, 1.0 + pulse_width
    t2_start = 1.0 + inter_pulse
    t2_end = t2_start + pulse_width

    def two_pulse(t):
        if t1_start <= t < t1_end:
            return current_amplitude
        if t2_start <= t < t2_end:
            return current_amplitude
        return 0.0

    def one_pulse(t):
        if t1_start <= t < t1_end:
            return current_amplitude
        return 0.0

    pair = _hh_simulate(two_pulse, t_max=t_max, dt=dt)
    single = _hh_simulate(one_pulse, t_max=t_max, dt=dt)
    return {
        "current_amplitude": float(current_amplitude),
        "n_spikes_paired": int(pair["n_spikes"]),
        "n_spikes_single": int(single["n_spikes"]),
        # second pulse evoked an extra spike only if pair > single
        "second_pulse_fired": bool(pair["n_spikes"] > single["n_spikes"]),
        "first_pulse_fired": bool(single["n_spikes"] >= 1),
    }


# 7. POPULATION FIRING-RATE / SIGMOID f-I CURVE ------------------------------
def population_fi_curve(*, input_current: float, r_max: float = 100.0,
                        gain: float = 1.0, theta: float = 5.0) -> dict:
    """Population firing-rate (sigmoid) f-I curve.

        r(I) = r_max / (1 + exp(-gain * (I - theta)))

    A monotonically increasing, saturating gain function widely used for
    neural-mass / population-rate models (Wilson-Cowan style).

    Known behaviour: r is bounded in (0, r_max), rises monotonically with I,
    passes through r_max/2 at I = theta, and SATURATES at r_max as I -> inf.
    """
    r = r_max / (1.0 + np.exp(-gain * (input_current - theta)))
    return {
        "input_current": float(input_current),
        "rate": float(r),
        "r_max": float(r_max),
        "half_max_current": float(theta),
        "saturation_fraction": float(r / r_max),
    }


# 8. NERNST / GOLDMAN RESTING MEMBRANE POTENTIAL -----------------------------
def resting_membrane_potential(*, k_out: float = 5.0, k_in: float = 140.0,
                               na_out: float = 145.0, na_in: float = 15.0,
                               cl_out: float = 110.0, cl_in: float = 10.0,
                               p_k: float = 1.0, p_na: float = 0.04,
                               p_cl: float = 0.45,
                               temperature_k: float = T_BODY_K) -> dict:
    """Resting membrane potential from the Nernst and Goldman-Hodgkin-Katz
    equations (mammalian neuron, 37 C, concentrations in mM).

    Nernst (single ion, z = +1):
        E_ion = (R T / F) * ln([ion]_out / [ion]_in)

    Goldman-Hodgkin-Katz (K+, Na+, Cl-):
        Vm = (RT/F) * ln( (P_K[K]o + P_Na[Na]o + P_Cl[Cl]i)
                          / (P_K[K]i + P_Na[Na]i + P_Cl[Cl]o) )

    Known checks: E_K ~= -90 mV; GHK resting potential ~= -70 mV.
    """
    rt_f = R_GAS * temperature_k / F_FARADAY  # volts
    e_k = rt_f * np.log(k_out / k_in) * 1000.0     # mV
    e_na = rt_f * np.log(na_out / na_in) * 1000.0
    # Cl- is an anion (z=-1): ratio is inverted
    e_cl = -rt_f * np.log(cl_out / cl_in) * 1000.0
    numer = p_k * k_out + p_na * na_out + p_cl * cl_in
    denom = p_k * k_in + p_na * na_in + p_cl * cl_out
    vm = rt_f * np.log(numer / denom) * 1000.0
    return {
        "E_K_mV": float(e_k),
        "E_Na_mV": float(e_na),
        "E_Cl_mV": float(e_cl),
        "resting_potential_mV": float(vm),
        "temperature_k": float(temperature_k),
    }
