"""Tests for real instrument/measurement models — assert measurement-science facts."""
import numpy as np

from underworld.server.services import instruments_lab as il


def test_calibration_drift_zero_at_origin_and_grows():
    assert il.calibration_drift(0, rate=0.1) == 0
    assert il.calibration_drift(10, rate=0.1) > il.calibration_drift(1, rate=0.1)
    # exponential form saturates toward rate
    assert il.calibration_drift(1e9, rate=2.0, tau=5.0) < 2.0 + 1e-6


def test_needs_recalibration_threshold():
    assert il.needs_recalibration(100, rate=0.1, tolerance=1.0) is True
    assert il.needs_recalibration(1, rate=0.1, tolerance=1.0) is False


def test_snr_increases_with_signal():
    weak = il.noise_profile(1.0, white=0.1)["snr"]
    strong = il.noise_profile(10.0, white=0.1)["snr"]
    assert strong > weak


def test_sensitivity_linear_then_saturates():
    x = np.linspace(0, 10, 50)
    r = il.sensitivity_curve(x, gain=2.0, x_sat=5.0)
    assert abs(r[5] - 2.0 * x[5]) < 1e-6              # linear at small x
    assert r[-1] < 2.0 * x[-1]                        # saturated at large x


def test_linear_range_detects_span():
    x = np.linspace(-5, 5, 101)
    r = il.sensitivity_curve(x, gain=1.0, x_sat=3.0)
    lr = il.linear_range(x, r)
    assert 2.0 <= lr <= 4.5                            # estimate near the x_sat region


def test_reproducibility_high_for_consistent_runs():
    consistent = il.reproducibility_score([[10, 10.1, 9.9], [10.0, 10.05, 9.95]])
    divergent = il.reproducibility_score([[1, 1, 1], [9, 9, 9]])
    assert consistent["score"] > divergent["score"]
    assert consistent["score"] > 0.5


def test_comparison_test_identical_instruments_zero_bias():
    a = [10.0, 11.0, 12.0]
    res = il.comparison_test(a, a)
    assert abs(res["bias"]) < 1e-9
    assert res["agree"] is True


def test_resolution_limit():
    assert abs(il.resolution_limit(10.0, bits=10) - 10.0 / 1024) < 1e-9


def test_misuse_risk_scaling():
    hi = il.misuse_risk(operator_skill=0.1, complexity=0.9, safeguards=0.1)
    lo = il.misuse_risk(operator_skill=0.95, complexity=0.3, safeguards=0.9)
    assert hi["risk"] > lo["risk"]


def test_dependency_graph_topological_and_cycle():
    g = il.dependency_graph({"scope": ["lens"], "lens": [], "lab": ["scope"]})
    assert g["build_order"].index("lens") < g["build_order"].index("scope")
    import pytest
    with pytest.raises(ValueError):
        il.dependency_graph({"a": ["b"], "b": ["a"]})


def test_chain_of_custody_intact_detection():
    coc = il.ChainOfCustody()
    coc.handoff("store", "lab", 1)
    coc.handoff("lab", "field", 2)
    assert coc.intact() is True
    coc.handoff("warehouse", "field", 3)             # broken: from != prev.to
    assert coc.intact() is False


def test_standardisation_against_reference():
    s = il.standardisation(9.0, reference=10.0)
    assert abs(s["correction_factor"] - 10.0 / 9.0) < 1e-6
    assert s["relative_error"] > 0
