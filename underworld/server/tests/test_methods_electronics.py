"""Verification tests for methods_electronics — each asserts a computed result
matches a KNOWN published value.
"""
import numpy as np

from underworld.server.services.methods_electronics import (
    shockley_diode_current,
    transistor_operating_point,
    op_amp_gain,
    rlc_resonant_frequency,
    pn_junction_built_in_potential,
    fermi_dirac_occupancy,
    intrinsic_carrier_concentration,
    rc_lowpass_cutoff,
)


def test_shockley_thermal_voltage_and_zero_bias():
    # KNOWN: thermal voltage Vt = kT/q ~= 25.85 mV at 300 K.
    out = shockley_diode_current(voltage_v=0.0)
    assert abs(out["thermal_voltage_mv"] - 25.85) < 0.05    # ~25.85 mV
    # KNOWN: at V = 0 the Shockley current is exactly 0.
    assert abs(out["current_a"]) < 1e-18
    # KNOWN: forward bias gives positive current that grows exponentially.
    fwd = shockley_diode_current(voltage_v=0.6, saturation_current_a=1e-12)
    assert fwd["current_a"] > 0.0


def test_transistor_collector_current_beta_times_base():
    # KNOWN: BJT Ic = beta * Ib; beta=100, Ib=10 uA -> Ic = 1.0 mA.
    out = transistor_operating_point(base_current_a=10e-6,
                                     current_gain_beta=100.0)
    assert abs(out["collector_current_ma"] - 1.0) < 1e-9    # 1.0 mA
    # KNOWN: Ie = (beta+1)*Ib = 101 * 10 uA = 1.01 mA.
    assert abs(out["emitter_current_a"] - 1.01e-3) < 1e-9
    # common-emitter stage is inverting -> negative voltage gain
    assert out["voltage_gain"] < 0.0


def test_op_amp_inverting_gain_minus_10():
    # KNOWN: inverting op-amp Av = -Rf/Rin; Rf=100k, Rin=10k -> -10.
    out = op_amp_gain(feedback_resistor_ohm=100e3, input_resistor_ohm=10e3,
                      configuration="inverting")
    assert abs(out["voltage_gain"] - (-10.0)) < 1e-9        # -10
    assert abs(out["gain_db"] - 20.0) < 1e-6                # |gain|=10 -> 20 dB
    # KNOWN: non-inverting Av = 1 + Rf/Rin = 11 for the same resistors.
    nin = op_amp_gain(feedback_resistor_ohm=100e3, input_resistor_ohm=10e3,
                      configuration="non_inverting")
    assert abs(nin["voltage_gain"] - 11.0) < 1e-9           # +11


def test_rlc_resonant_frequency():
    # KNOWN: f0 = 1/(2*pi*sqrt(LC)); L=1 mH, C=1 uF -> ~5033 Hz.
    out = rlc_resonant_frequency(inductance_h=1e-3, capacitance_f=1e-6)
    assert abs(out["resonant_frequency_hz"] - 5032.92) < 1.0   # ~5033 Hz
    # KNOWN: with R=10 ohm series, Q = (1/R)sqrt(L/C) = (1/10)*sqrt(1000)=3.162
    q = rlc_resonant_frequency(inductance_h=1e-3, capacitance_f=1e-6,
                               resistance_ohm=10.0)
    assert abs(q["quality_factor"] - 3.16228) < 1e-3


def test_pn_junction_built_in_potential_silicon_0_7v():
    # KNOWN: Si PN junction (ni=1e10) Na=Nd=1e17 at 300 K -> Vbi ~ 0.7 V.
    out = pn_junction_built_in_potential(acceptor_doping_cm3=1e17,
                                         donor_doping_cm3=1e17,
                                         intrinsic_carrier_cm3=1.0e10,
                                         temperature_k=300.0)
    assert 0.6 < out["built_in_potential_v"] < 0.85           # ~0.7 V
    assert abs(out["thermal_voltage_v"] - 0.025852) < 5e-5


def test_fermi_dirac_half_at_fermi_level():
    # KNOWN: f(E) = 1/2 exactly when E = Ef (for any T > 0).
    out = fermi_dirac_occupancy(energy_ev=0.55, fermi_energy_ev=0.55,
                                temperature_k=300.0)
    assert abs(out["occupancy"] - 0.5) < 1e-12               # exactly 1/2
    # KNOWN: well above Ef occupancy -> 0; well below Ef -> 1.
    hi = fermi_dirac_occupancy(energy_ev=1.0, fermi_energy_ev=0.55)
    lo = fermi_dirac_occupancy(energy_ev=0.1, fermi_energy_ev=0.55)
    assert hi["occupancy"] < 1e-6
    assert lo["occupancy"] > 0.999999


def test_intrinsic_carrier_concentration_silicon_1e10():
    # KNOWN: silicon ni ~= 1e10 /cm^3 at 300 K (order-of-magnitude consensus).
    out = intrinsic_carrier_concentration(temperature_k=300.0)
    ni = out["intrinsic_carrier_cm3"]
    assert 5e9 < ni < 2e10                                   # ~1e10 /cm^3
    assert abs(out["kt_ev"] - 0.025852) < 5e-5
    # KNOWN: ni rises steeply with temperature.
    hot = intrinsic_carrier_concentration(temperature_k=400.0)
    assert hot["intrinsic_carrier_cm3"] > ni


def test_rc_lowpass_cutoff_159hz():
    # KNOWN: fc = 1/(2*pi*R*C); R=1k, C=1uF -> ~159.15 Hz.
    out = rc_lowpass_cutoff(resistance_ohm=1000.0, capacitance_f=1e-6)
    assert abs(out["cutoff_frequency_hz"] - 159.155) < 0.01   # ~159.15 Hz
    assert abs(out["time_constant_s"] - 1e-3) < 1e-12         # tau = 1 ms
    # KNOWN: magnitude at cutoff = 1/sqrt(2) ~ 0.707 (-3 dB).
    assert abs(out["magnitude_at_cutoff"] - 0.70710678) < 1e-6
