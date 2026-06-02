"""Real electronics / electrical-machine models (feature category N).

Genuine device & circuit physics (numpy), checkable against closed forms:
  * DC/AC circuits: series-parallel resistance, complex impedance, resonance
  * Shockley diode equation, BJT collector current, MOSFET saturation current
  * battery capacity/Peukert, DC motor torque + back-EMF, transformer turns ratio,
    generator EMF
  * protection: fuse I²t, inverse-time breaker trip, intrinsic carrier density
  * power electronics: buck/boost converter duty-cycle relations
"""
from __future__ import annotations

import cmath
import math


# ── DC / AC circuits ─────────────────────────────────────────────────────────
def series_resistance(rs: list[float]) -> float:
    return sum(rs)


def parallel_resistance(rs: list[float]) -> float:
    inv = sum(1.0 / r for r in rs if r > 0)
    return 1.0 / inv if inv > 0 else math.inf


def dc_circuit_solve(*, voltage: float, resistances: list[float], parallel: bool = False) -> dict:
    """Solve a single-source DC circuit: total R, current, power."""
    R = parallel_resistance(resistances) if parallel else series_resistance(resistances)
    I = voltage / R if R > 0 else math.inf
    return {"resistance": round(R, 6), "current": round(I, 6), "power": round(voltage * I, 6)}


def ac_impedance(*, resistance: float, inductance: float, capacitance: float,
                 frequency: float) -> dict:
    """Series RLC complex impedance Z = R + j(ωL − 1/ωC), magnitude and phase."""
    w = 2 * math.pi * frequency
    xl = w * inductance
    xc = 1.0 / (w * capacitance) if capacitance > 0 else math.inf
    z = complex(resistance, xl - xc)
    return {"impedance_mag": round(abs(z), 6), "phase_deg": round(math.degrees(cmath.phase(z)), 4),
            "reactance": round(xl - xc, 6)}


def resonant_frequency(*, inductance: float, capacitance: float) -> float:
    """LC resonance f0 = 1/(2π√(LC))."""
    return 1.0 / (2 * math.pi * math.sqrt(inductance * capacitance))


# ── semiconductor devices ────────────────────────────────────────────────────
def diode_current(*, voltage: float, i_sat: float = 1e-12, temperature: float = 300.0,
                  ideality: float = 1.0) -> float:
    """Shockley diode equation I = I_s (exp(V/(n V_T)) − 1)."""
    vt = 1.380649e-23 * temperature / 1.602176634e-19      # thermal voltage
    return i_sat * (math.exp(voltage / (ideality * vt)) - 1)


def bjt_collector_current(*, base_current: float, beta: float = 100.0) -> float:
    """BJT in active mode: I_C = β I_B."""
    return beta * base_current


def mosfet_saturation_current(*, vgs: float, vth: float, k: float = 1e-3) -> float:
    """MOSFET saturation drain current I_D = (k/2)(V_GS − V_th)² for V_GS>V_th."""
    return 0.5 * k * (vgs - vth) ** 2 if vgs > vth else 0.0


def intrinsic_carrier_density(*, temperature: float, bandgap_ev: float) -> float:
    """Intrinsic carrier concentration n_i ∝ T^1.5 exp(−Eg/2kT) (relative units)."""
    kT = 8.617333e-5 * temperature                          # eV
    return temperature ** 1.5 * math.exp(-bandgap_ev / (2 * kT))


# ── machines / sources ───────────────────────────────────────────────────────
def transformer(*, primary_turns: int, secondary_turns: int, primary_voltage: float) -> dict:
    """Ideal transformer: V_s/V_p = N_s/N_p; power conserved."""
    ratio = secondary_turns / primary_turns
    return {"secondary_voltage": round(primary_voltage * ratio, 4), "turns_ratio": round(ratio, 4)}


def dc_motor(*, voltage: float, back_emf: float, resistance: float, kt: float = 0.1) -> dict:
    """DC motor: armature current I = (V − E_b)/R, torque τ = k_t I."""
    I = (voltage - back_emf) / resistance if resistance > 0 else math.inf
    return {"current": round(I, 5), "torque": round(kt * I, 5)}


def generator_emf(*, turns: int, flux: float, frequency: float) -> float:
    """RMS generated EMF E = √2 π N Φ f (Faraday)."""
    return math.sqrt(2) * math.pi * turns * flux * frequency


def battery_capacity(*, rated_capacity: float, current: float, peukert: float = 1.2) -> dict:
    """Peukert's law: effective capacity falls at high discharge current.
    t = C / I^k (relative)."""
    eff = rated_capacity / (current ** (peukert - 1)) if current > 0 else rated_capacity
    return {"effective_capacity": round(eff, 4),
            "runtime_h": round(eff / current, 4) if current > 0 else math.inf}


# ── protection / power electronics ───────────────────────────────────────────
def fuse_i2t(*, current: float, time: float, rating_i2t: float) -> dict:
    """Fuse melts when I²t exceeds its rating."""
    energy = current ** 2 * time
    return {"i2t": round(energy, 4), "blows": energy > rating_i2t}


def breaker_trip_time(*, current: float, pickup: float, k: float = 0.14, alpha: float = 0.02) -> float:
    """IEC inverse-time overcurrent breaker trip: t = k / ((I/I_pickup)^α − 1)."""
    ratio = current / pickup
    if ratio <= 1:
        return math.inf
    return round(k / (ratio ** alpha - 1), 4)


def arc_fault_energy(*, voltage: float, current: float, duration: float) -> float:
    """Incident arc energy ~ V·I·t (relative magnitude)."""
    return round(voltage * current * duration, 4)


def buck_converter(*, input_voltage: float, duty: float) -> float:
    """Buck (step-down) converter output V_out = D · V_in."""
    return round(input_voltage * max(0.0, min(1.0, duty)), 4)


def boost_converter(*, input_voltage: float, duty: float) -> float:
    """Boost (step-up) converter output V_out = V_in / (1 − D)."""
    d = max(0.0, min(0.99, duty))
    return round(input_voltage / (1 - d), 4)


# ── canonical-named feature entry points (real device physics) ───────────────
def battery_electrochemistry(*, e0: float, n: int, q_reaction: float,
                             temperature: float = 298.0) -> dict:
    """Battery electrochemistry: Nernst-equation cell voltage
    E = E0 − (RT/nF) ln Q."""
    R, F = 8.314462618, 96485.33212
    e = e0 - (R * temperature / (n * F)) * math.log(max(1e-12, q_reaction))
    return {"cell_voltage": round(e, 5), "standard_potential": e0}


def semiconductor_band_model(*, temperature: float, bandgap_ev: float) -> dict:
    """Semiconductor band model: intrinsic carrier density + thermal voltage."""
    ni = intrinsic_carrier_density(temperature=temperature, bandgap_ev=bandgap_ev)
    return {"intrinsic_carrier_rel": round(ni, 6), "bandgap_ev": bandgap_ev,
            "thermal_voltage": round(1.380649e-23 * temperature / 1.602176634e-19, 6)}


def integrated_circuit(*, transistors: int, node_nm: float) -> dict:
    """Integrated-circuit scaling: gate density and a Dennard-ish performance
    proxy (smaller node -> higher density)."""
    density = transistors / (node_nm ** 2) if node_nm > 0 else math.inf
    return {"transistors": transistors, "node_nm": node_nm,
            "relative_density": round(density, 4)}


def sensor_electronics(*, bridge_voltage: float, delta_r_over_r: float, gain: float = 1.0) -> dict:
    """Sensor electronics: quarter-bridge Wheatstone output V ≈ (Vb/4)(ΔR/R)·gain."""
    out = (bridge_voltage / 4) * delta_r_over_r * gain
    return {"output_voltage": round(out, 8)}


def power_electronics(*, input_voltage: float, duty: float, topology: str = "buck") -> dict:
    """Power-electronics converter (buck or boost) output."""
    v = boost_converter(input_voltage=input_voltage, duty=duty) if topology == "boost" \
        else buck_converter(input_voltage=input_voltage, duty=duty)
    return {"topology": topology, "output_voltage": v}


def protection_coordination(devices: list[dict]) -> dict:
    """Protection-coordination engine: check that downstream breakers trip before
    upstream ones at a fault current (selectivity). `devices` ordered upstream->
    downstream with {pickup}."""
    fault = max(d.get("fault", 1000) for d in devices) if devices else 1000
    times = [(d["name"], breaker_trip_time(current=fault, pickup=d["pickup"])) for d in devices]
    # downstream (last) should be fastest
    coordinated = all(times[i][1] >= times[i + 1][1] for i in range(len(times) - 1))
    return {"trip_times": [(n, t) for n, t in times], "coordinated": coordinated}


def microprocessor_architecture(*, clock_ghz: float, ipc: float, cores: int = 1) -> dict:
    """Microprocessor architecture: throughput model
    MIPS ≈ clock·IPC·cores (a real first-order performance estimate)."""
    mips = clock_ghz * 1000 * ipc * cores
    return {"mips": round(mips, 2), "clock_ghz": clock_ghz, "ipc": ipc, "cores": cores}


def diode_path(*, voltage: float) -> dict:
    """Diode discovery/characteristic path (Shockley I-V point)."""
    return {"current": diode_current(voltage=voltage), "voltage": voltage}


def transistor_path(*, base_current: float, beta: float = 100.0) -> dict:
    """Transistor characteristic path (BJT active region)."""
    return {"collector_current": bjt_collector_current(base_current=base_current, beta=beta)}
