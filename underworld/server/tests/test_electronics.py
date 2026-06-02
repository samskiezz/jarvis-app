"""Tests for real electronics models — assert circuit/device laws."""
import math

from underworld.server.services import electronics as el


def test_series_and_parallel_resistance():
    assert el.series_resistance([10, 20, 30]) == 60
    assert abs(el.parallel_resistance([10, 10]) - 5.0) < 1e-9


def test_dc_circuit_ohms_law():
    r = el.dc_circuit_solve(voltage=10, resistances=[5])
    assert abs(r["current"] - 2.0) < 1e-9
    assert abs(r["power"] - 20.0) < 1e-9


def test_ac_impedance_and_resonance():
    f0 = el.resonant_frequency(inductance=1e-3, capacitance=1e-6)
    z = el.ac_impedance(resistance=10, inductance=1e-3, capacitance=1e-6, frequency=f0)
    assert abs(z["reactance"]) < 1e-3                 # at resonance X~0
    assert abs(z["impedance_mag"] - 10) < 1e-2        # purely resistive


def test_diode_exponential():
    on = el.diode_current(voltage=0.7)
    off = el.diode_current(voltage=0.0)
    assert on > off
    assert abs(off) < 1e-15                            # ~0 at zero bias


def test_mosfet_saturation_square_law():
    assert el.mosfet_saturation_current(vgs=1.0, vth=1.0) == 0.0   # off below Vth
    i = el.mosfet_saturation_current(vgs=3.0, vth=1.0, k=1e-3)
    assert abs(i - 0.5e-3 * 4) < 1e-12                 # (k/2)(2)^2


def test_transformer_turns_ratio():
    t = el.transformer(primary_turns=100, secondary_turns=200, primary_voltage=120)
    assert abs(t["secondary_voltage"] - 240) < 1e-6


def test_dc_motor_torque():
    m = el.dc_motor(voltage=12, back_emf=10, resistance=1, kt=0.1)
    assert abs(m["current"] - 2.0) < 1e-9
    assert abs(m["torque"] - 0.2) < 1e-9


def test_battery_peukert_reduces_capacity():
    high = el.battery_capacity(rated_capacity=100, current=10)["effective_capacity"]
    low = el.battery_capacity(rated_capacity=100, current=1)["effective_capacity"]
    assert low > high                                  # lower current -> more capacity


def test_fuse_blows_above_i2t():
    assert el.fuse_i2t(current=10, time=1, rating_i2t=50)["blows"] is True
    assert el.fuse_i2t(current=5, time=1, rating_i2t=50)["blows"] is False


def test_breaker_trip_time_inverse():
    fast = el.breaker_trip_time(current=1000, pickup=100)
    slow = el.breaker_trip_time(current=150, pickup=100)
    assert fast < slow                                 # bigger overcurrent trips faster


def test_buck_boost_relations():
    assert abs(el.buck_converter(input_voltage=12, duty=0.5) - 6) < 1e-9
    assert el.boost_converter(input_voltage=12, duty=0.5) > 12


def test_battery_electrochemistry_nernst():
    r = el.battery_electrochemistry(e0=1.1, n=2, q_reaction=1.0)
    assert abs(r["cell_voltage"] - 1.1) < 1e-6        # Q=1 -> E=E0


def test_protection_coordination_selectivity():
    r = el.protection_coordination([{"name": "main", "pickup": 50, "fault": 1000},
                                    {"name": "branch", "pickup": 200, "fault": 1000}])
    assert "coordinated" in r


def test_microprocessor_throughput():
    r = el.microprocessor_architecture(clock_ghz=3.0, ipc=2.0, cores=4)
    assert abs(r["mips"] - 3 * 1000 * 2 * 4) < 1e-6


def test_semiconductor_band_and_ic():
    assert el.semiconductor_band_model(temperature=300, bandgap_ev=1.12)["thermal_voltage"] > 0
    assert el.integrated_circuit(transistors=1_000_000, node_nm=7)["relative_density"] > 0
