"""Tests for in-world lab simulators (SPICE, CFD, robotic digital twins)."""
import math
from underworld.server.services import spice_sim, cfd_sim, robotic_lab as rl


def test_spice_resistive_divider():
    # 10V across two equal 1k resistors -> midpoint 5V (textbook)
    net = [{"type": "V", "n1": 1, "n2": 0, "value": 10},
           {"type": "R", "n1": 1, "n2": 2, "value": 1000},
           {"type": "R", "n1": 2, "n2": 0, "value": 1000}]
    r = spice_sim.solve_dc(net, n_nodes=3)
    assert abs(r["node_voltages"][2] - 5.0) < 1e-6
    assert r["physical_hardware"] is False


def test_spice_transient_charges_to_steady_state():
    t = spice_sim.transient([], 2, cap_node=1, capacitance=1e-6, resistance=1000,
                            v_source=5.0, steps=200, dt=1e-4)
    assert t["final_voltage"] > 4.0          # approaching 5V


def test_cfd_lid_driven_cavity_runs_and_conserves_mass():
    r = cfd_sim.cfd_simulate(n=12, steps=30, lid_velocity=1.0)
    assert r["top_row_mean_u"] > 0.5         # lid drags fluid
    assert r["mean_abs_divergence"] < 1.0    # ~incompressible
    assert r["physical_hardware"] is False


def test_cfd_poiseuille_parabolic():
    p = cfd_sim.pipe_flow_profile(radius=0.01, dp_dx=1000, viscosity=1e-3)
    assert p["centreline_velocity"] > 0      # peak at centre
    assert p["parabolic"] is True


def test_pipetting_within_spec_and_labelled():
    r = rl.robotic_pipetting(target_volume_ul=100, precision_cv=0.01)
    assert r["within_spec"] is True
    assert r["simulation"] is True and r["physical_hardware"] is False


def test_thermal_reaches_setpoint():
    r = rl.robotic_heating(t_start=20, t_target=80, ambient=20, k=0.2, steps=80)
    assert r["reached_setpoint"] is True


def test_synthesis_first_order_kinetics():
    r = rl.robotic_synthesis(reactant=1.0, rate_k=1.0, time=5.0)
    assert r["conversion"] > 0.99            # ~complete after 5 time-constants


def test_sequencing_quality_and_cleaning():
    s = rl.robotic_sequencing(sequence="ACGT" * 25, error_rate=0.001)
    assert s["phred_quality"] == 30.0        # Q30 at 0.1% error
    c = rl.robotic_cleaning(contamination=1.0, wash_efficiency=0.99, cycles=2)
    assert c["clean"] is True


def test_imaging_snr_positive():
    assert rl.robotic_imaging(true_intensity=100.0)["snr"] > 0


def test_all_robotic_modules_declare_simulation():
    for fn in (rl.robotic_pipetting, rl.robotic_imaging):
        out = fn(target_volume_ul=10) if fn is rl.robotic_pipetting else fn(true_intensity=10)
        assert out["physical_hardware"] is False
