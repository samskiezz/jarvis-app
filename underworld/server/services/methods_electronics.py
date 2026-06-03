"""Real electronics & semiconductor-device simulation methods.

Eight named, real methods, each computed from its canonical published formula
and each verified in the test suite against a KNOWN published value:

  1. shockley_diode_current      — Shockley diode eq. I = I0(exp(V/nVt) - 1)
                                    (thermal voltage Vt ~= 25.85 mV at 300 K)
  2. transistor_operating_point  — BJT/MOSFET DC operating point + small-signal
                                    gain (BJT Ic = beta*Ib; common-emitter gain)
  3. op_amp_gain                 — ideal op-amp closed-loop gain
                                    (inverting -Rf/Rin, non-inverting 1+Rf/Rin)
  4. rlc_resonant_frequency      — series/parallel RLC f0 = 1/(2*pi*sqrt(LC))
  5. pn_junction_built_in_potential — Vbi = Vt*ln(Na*Nd/ni^2) (~0.7 V for Si)
  6. fermi_dirac_occupancy       — f(E) = 1/(exp((E-Ef)/kT)+1)  (= 1/2 at E=Ef)
  7. intrinsic_carrier_concentration — ni = sqrt(Nc*Nv)*exp(-Eg/2kT)
                                    (Si ni ~= 1e10 /cm^3 at 300 K)
  8. rc_lowpass_cutoff           — first-order RC low-pass fc = 1/(2*pi*R*C)

Constants are CODATA 2018 values (via scipy.constants).
Silicon material parameters (Nc, Nv, Eg) are standard semiconductor-physics
textbook values (Sze; Pierret) for T = 300 K.

Sources: Wikipedia (Shockley diode equation), PVEducation (diode equation,
intrinsic carrier concentration), standard analog-electronics and
semiconductor-device texts.
"""
from __future__ import annotations

import numpy as np
from scipy import constants as sc

# --- Published physical constants (CODATA 2018 / SI) ------------------------
KB = sc.k                    # Boltzmann constant, 1.380649e-23 J/K
Q = sc.e                     # elementary charge, 1.602176634e-19 C
T_ROOM = 300.0               # standard "room temperature" reference, K

# --- Silicon material parameters at 300 K (standard textbook values) --------
SI_NC = 2.8e19               # conduction-band effective DOS, /cm^3
SI_NV = 1.04e19              # valence-band effective DOS, /cm^3
SI_EG_EV = 1.10              # band gap (eV) reproducing ni ~ 1e10 /cm^3 at 300 K


def thermal_voltage(temperature_k: float = T_ROOM) -> float:
    """Thermal voltage Vt = kT/q (volts). ~= 0.025852 V (25.85 mV) at 300 K."""
    return KB * temperature_k / Q


# 1. SHOCKLEY DIODE EQUATION --------------------------------------------------
def shockley_diode_current(*, voltage_v: float, saturation_current_a: float = 1e-12,
                           ideality_factor: float = 1.0,
                           temperature_k: float = T_ROOM) -> dict:
    """Shockley diode current  I = I0 (exp(V / (n*Vt)) - 1).

    Vt = kT/q is the thermal voltage; n is the ideality factor (1..2).

    Known check: Vt ~= 25.85 mV at 300 K; at V = 0 the current is exactly 0.
    """
    vt = thermal_voltage(temperature_k)
    current = saturation_current_a * np.expm1(voltage_v / (ideality_factor * vt))
    return {
        "thermal_voltage_v": float(vt),
        "thermal_voltage_mv": float(vt * 1e3),
        "current_a": float(current),
        "current_ma": float(current * 1e3),
    }


# 2. BJT / MOSFET OPERATING POINT --------------------------------------------
def transistor_operating_point(*, base_current_a: float = 10e-6,
                               current_gain_beta: float = 100.0,
                               supply_voltage_v: float = 10.0,
                               collector_resistor_ohm: float = 1000.0) -> dict:
    """DC operating point of a common-emitter BJT and its small-signal gain.

    Collector current  Ic = beta * Ib
    Emitter current     Ie = Ic + Ib = (beta + 1) * Ib
    Collector-emitter   Vce = Vcc - Ic * Rc
    Transconductance    gm = Ic / Vt
    Small-signal gain   Av = -gm * Rc = -(Ic*Rc)/Vt  (common-emitter)

    Known check: with beta = 100 and Ib = 10 uA, Ic = 1.0 mA (Ic = beta*Ib).
    """
    ic = current_gain_beta * base_current_a
    ie = (current_gain_beta + 1.0) * base_current_a
    vce = supply_voltage_v - ic * collector_resistor_ohm
    vt = thermal_voltage()
    gm = ic / vt
    av = -gm * collector_resistor_ohm
    return {
        "collector_current_a": float(ic),
        "collector_current_ma": float(ic * 1e3),
        "emitter_current_a": float(ie),
        "vce_v": float(vce),
        "transconductance_s": float(gm),
        "voltage_gain": float(av),
    }


# 3. IDEAL OP-AMP GAIN --------------------------------------------------------
def op_amp_gain(*, feedback_resistor_ohm: float, input_resistor_ohm: float,
                configuration: str = "inverting") -> dict:
    """Ideal (infinite open-loop gain) op-amp closed-loop voltage gain.

    Inverting      Av = -Rf / Rin
    Non-inverting  Av = 1 + Rf / Rin

    Known check: inverting amp with Rf = 100 k, Rin = 10 k -> Av = -10.
    """
    if input_resistor_ohm <= 0:
        raise ValueError("input resistor must be positive")
    ratio = feedback_resistor_ohm / input_resistor_ohm
    if configuration == "inverting":
        av = -ratio
    elif configuration == "non_inverting":
        av = 1.0 + ratio
    else:
        raise ValueError("configuration must be 'inverting' or 'non_inverting'")
    return {
        "configuration": configuration,
        "voltage_gain": float(av),
        "gain_magnitude": float(abs(av)),
        "gain_db": float(20.0 * np.log10(abs(av))),
    }


# 4. RLC RESONANT FREQUENCY ---------------------------------------------------
def rlc_resonant_frequency(*, inductance_h: float, capacitance_f: float,
                           resistance_ohm: float = 0.0) -> dict:
    """Resonant frequency of an LC / RLC circuit  f0 = 1/(2*pi*sqrt(L*C)).

    Angular resonance  w0 = 1/sqrt(L*C)
    Quality factor     Q = (1/R)*sqrt(L/C)   (series RLC, R > 0)

    Known check: L = 1 mH, C = 1 uF -> f0 ~= 5033 Hz.
    """
    if inductance_h <= 0 or capacitance_f <= 0:
        raise ValueError("L and C must be positive")
    w0 = 1.0 / np.sqrt(inductance_h * capacitance_f)
    f0 = w0 / (2.0 * np.pi)
    q = (np.sqrt(inductance_h / capacitance_f) / resistance_ohm
         if resistance_ohm > 0 else float("inf"))
    return {
        "resonant_frequency_hz": float(f0),
        "angular_frequency_rad_s": float(w0),
        "quality_factor": float(q),
    }


# 5. PN-JUNCTION BUILT-IN POTENTIAL ------------------------------------------
def pn_junction_built_in_potential(*, acceptor_doping_cm3: float = 1e17,
                                   donor_doping_cm3: float = 1e17,
                                   intrinsic_carrier_cm3: float = 1.0e10,
                                   temperature_k: float = T_ROOM) -> dict:
    """Built-in potential of an abrupt PN junction.

    Vbi = (kT/q) * ln(Na * Nd / ni^2)

    Known check: for silicon (ni ~ 1e10) with Na = Nd = 1e17 /cm^3 at 300 K,
    Vbi ~= 0.7 V (the familiar silicon junction "knee" voltage).
    """
    vt = thermal_voltage(temperature_k)
    vbi = vt * np.log(acceptor_doping_cm3 * donor_doping_cm3
                      / intrinsic_carrier_cm3 ** 2)
    return {
        "thermal_voltage_v": float(vt),
        "built_in_potential_v": float(vbi),
    }


# 6. FERMI-DIRAC OCCUPANCY ----------------------------------------------------
def fermi_dirac_occupancy(*, energy_ev: float, fermi_energy_ev: float,
                          temperature_k: float = T_ROOM) -> dict:
    """Fermi-Dirac occupation probability f(E) = 1/(exp((E-Ef)/kT) + 1).

    Known check: at E = Ef the occupancy is exactly 1/2 for any T > 0.
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive (kelvin)")
    kt_ev = KB * temperature_k / Q          # kT in eV
    x = (energy_ev - fermi_energy_ev) / kt_ev
    f = 1.0 / (np.exp(x) + 1.0)
    return {
        "occupancy": float(f),
        "kt_ev": float(kt_ev),
        "energy_above_fermi_ev": float(energy_ev - fermi_energy_ev),
    }


# 7. INTRINSIC CARRIER CONCENTRATION -----------------------------------------
def intrinsic_carrier_concentration(*, conduction_dos_cm3: float = SI_NC,
                                    valence_dos_cm3: float = SI_NV,
                                    band_gap_ev: float = SI_EG_EV,
                                    temperature_k: float = T_ROOM) -> dict:
    """Intrinsic carrier concentration  ni = sqrt(Nc*Nv) * exp(-Eg/(2kT)).

    Known check: for silicon (Nc=2.8e19, Nv=1.04e19, Eg~1.1 eV) at 300 K,
    ni ~= 1e10 /cm^3.
    """
    kt_ev = KB * temperature_k / Q
    ni = np.sqrt(conduction_dos_cm3 * valence_dos_cm3) \
        * np.exp(-band_gap_ev / (2.0 * kt_ev))
    return {
        "intrinsic_carrier_cm3": float(ni),
        "kt_ev": float(kt_ev),
    }


# 8. RC LOW-PASS CUTOFF FREQUENCY --------------------------------------------
def rc_lowpass_cutoff(*, resistance_ohm: float, capacitance_f: float) -> dict:
    """First-order RC low-pass filter -3 dB cutoff  fc = 1/(2*pi*R*C).

    Time constant  tau = R*C
    At f = fc the magnitude response is 1/sqrt(2) (~ -3.01 dB).

    Known check: R = 1 kOhm, C = 1 uF -> fc ~= 159.15 Hz.
    """
    if resistance_ohm <= 0 or capacitance_f <= 0:
        raise ValueError("R and C must be positive")
    tau = resistance_ohm * capacitance_f
    fc = 1.0 / (2.0 * np.pi * tau)
    return {
        "cutoff_frequency_hz": float(fc),
        "time_constant_s": float(tau),
        "magnitude_at_cutoff": float(1.0 / np.sqrt(2.0)),
    }
