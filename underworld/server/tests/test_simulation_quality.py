"""Tests for real simulation-quality / UQ models — assert V&V facts."""
import math

from underworld.server.services import simulation_quality as sq


def test_richardson_improves_estimate():
    # f(h) = 1 + h^2 ; coarse h=0.2 -> 1.04, fine h=0.1 -> 1.01 ; exact=1
    est = sq.richardson_extrapolation(1.04, 1.01, ratio=2.0, order=2.0)
    assert abs(est - 1.0) < abs(1.01 - 1.0)         # closer to exact than fine


def test_observed_order_recovers_second_order():
    # errors shrink 4x per halving for a 2nd-order method
    f = [1 + 0.16, 1 + 0.04, 1 + 0.01]              # exact 1
    p = sq.observed_order(f[0], f[1], f[2], ratio=2.0)
    assert abs(p - 2.0) < 0.1


def test_convergence_tracker_detects_convergence():
    conv = sq.convergence_tracker([1.0, 0.5, 0.1, 0.001, 0.0005], tol=1e-3)
    assert conv["converged"] is True
    div = sq.convergence_tracker([1.0, 2.0, 4.0], tol=1e-3)
    assert div["converged"] is False


def test_ensemble_uncertainty_ci_widens_with_scatter():
    tight = sq.ensemble_uncertainty([10, 10.1, 9.9, 10.0])
    wide = sq.ensemble_uncertainty([5, 10, 15, 20])
    assert (wide["ci95"][1] - wide["ci95"][0]) > (tight["ci95"][1] - tight["ci95"][0])


def test_uncertainty_score_bounds():
    assert sq.uncertainty_score([10, 10, 10]) == 0.0
    assert 0 < sq.uncertainty_score([1, 5, 9]) <= 1.0


def test_solver_credibility_falls_with_error():
    good = sq.solver_credibility([1, 2, 3], [1, 2, 3])
    bad = sq.solver_credibility([1, 2, 3], [2, 4, 6])
    assert good["credibility"] > bad["credibility"]
    assert good["credibility"] > 0.99


def test_simulation_cost_superlinear():
    cheap = sq.simulation_cost(n_dof=100)["relative_cost"]
    dear = sq.simulation_cost(n_dof=1000)["relative_cost"]
    assert dear > 10 * cheap                         # superlinear scaling


def test_reality_depth_index_bounds_and_validation_bonus():
    lo = sq.reality_depth_index(fidelity=0.2, validated=False, resolution=0.2)
    hi = sq.reality_depth_index(fidelity=0.9, validated=True, resolution=1.0)
    assert 0 <= lo < hi <= 1.0


def test_artifact_detector_finds_nan_and_spike():
    res = sq.artifact_detector([1.0, 1.1, 0.9, float("nan"), 1.0, 50.0])
    assert 3 in res["nan_indices"]
    assert 5 in res["spike_indices"]
    assert res["clean"] is False


def test_provenance_ledger_is_tamper_evident():
    led = sq.ProvenanceLedger()
    led.record("solve", {"dt": 0.1}, 1.0)
    led.record("refine", {"dt": 0.05}, 1.01)
    assert led.verify() is True
    led.records[0]["output"] = 999.0                 # tamper
    assert led.verify() is False


def test_hidden_truth_layer_quantises_and_bounds():
    h = sq.hidden_truth_layer(3.14159, observer_resolution=0.1)
    assert h["contains_truth"] is True
    assert abs(h["observed"] - 3.1) < 1e-9
