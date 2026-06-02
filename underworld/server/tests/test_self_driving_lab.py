"""Tests for the Self-Driving Lab closed-loop active-learning engine."""
from underworld.server.services.self_driving_lab import (
    AutonomyLevel,
    Campaign,
    Protocol,
    Run,
    campaign_report,
    candidate_points,
    execute,
    run_campaign,
    select_next,
    surrogate,
)


def _ionic_protocol() -> Protocol:
    # the spec's worked example: maximise ionic conductivity over a metal/halide space
    return Protocol(
        objective="increase ionic conductivity",
        sample_space={"metal": ["Li", "Mg", "Al"], "halide": ["Cl", "Br", "I"]},
        success_metric="ionic_conductivity_ms_cm",
        target=0.9,
        instruments=["xrd", "impedance_spectroscopy"],
        max_runs=12,
        replication=2,
        safety={"glovebox_required": True},
    )


def _hidden_objective():
    # hidden truth: Li+I is the best combination (lab must DISCOVER this)
    best = {"metal": "Li", "halide": "I"}
    def obj(point):
        score = 0.4
        if point.get("metal") == best["metal"]:
            score += 0.3
        if point.get("halide") == best["halide"]:
            score += 0.3
        return score
    return obj, best


def test_candidate_points_full_factorial():
    pts = candidate_points({"a": [1, 2], "b": ["x", "y", "z"]})
    assert len(pts) == 6
    assert {"a": 1, "b": "x"} in pts


def test_surrogate_unknown_point_is_max_uncertain():
    pred, unc = surrogate({"metal": "Li", "halide": "I"}, [])
    assert unc == 1.0  # no data -> maximal uncertainty


def test_select_next_prefers_high_ucb_and_skips_run_points():
    obj, _ = _hidden_objective()
    # seed one run; next selection must not repeat it
    runs = [execute({"metal": "Mg", "halide": "Cl"}, obj,
                    instrument_precision=0.02, replication=2, run_index=0)]
    nxt = select_next(candidate_points(_ionic_protocol().sample_space), runs)
    assert nxt is not None
    assert nxt != {"metal": "Mg", "halide": "Cl"}


def test_execute_provenance_and_noise():
    obj, _ = _hidden_objective()
    r = execute({"metal": "Li", "halide": "I"}, obj,
                instrument_precision=0.03, replication=3, run_index=5)
    assert r.uncertainty > 0
    assert r.provenance["replicates"] == 3
    assert "raw" in r.provenance and len(r.provenance["raw"]) == 3
    assert r.run_id == "run-5"


def test_execute_is_deterministic():
    obj, _ = _hidden_objective()
    a = execute({"metal": "Li", "halide": "I"}, obj, instrument_precision=0.03,
                replication=2, run_index=1)
    b = execute({"metal": "Li", "halide": "I"}, obj, instrument_precision=0.03,
                replication=2, run_index=1)
    assert a.measured == b.measured  # auditable replay


def test_closed_loop_finds_the_hidden_optimum():
    obj, best = _hidden_objective()
    camp = run_campaign(_ionic_protocol(), obj, instrument_precision=0.02)
    assert camp.converged
    # the lab discovered the true best combination
    assert camp.best.point == best


def test_active_learning_beats_exhaustive_search():
    obj, _ = _hidden_objective()
    camp = run_campaign(_ionic_protocol(), obj, instrument_precision=0.02)
    rep = campaign_report(camp)
    # converged using fewer runs than the full 9-point space
    assert rep["runs_used"] < rep["search_space_size"]
    assert rep["efficiency"] > 0.0


def test_campaign_report_is_provenance_complete():
    obj, _ = _hidden_objective()
    rep = campaign_report(run_campaign(_ionic_protocol(), obj, instrument_precision=0.02))
    for key in ("objective", "converged", "runs_used", "best_point",
                "best_value", "best_provenance", "disclaimer"):
        assert key in rep
    assert rep["best_provenance"] is not None


def test_autonomy_levels_ordered():
    assert AutonomyLevel.CLOSED_LOOP.value == 4
    assert AutonomyLevel.HUMAN_PLANNED < AutonomyLevel.CIVILISATION_SCALE


def test_noisy_instrument_widens_uncertainty():
    obj, _ = _hidden_objective()
    clean = execute({"metal": "Li", "halide": "I"}, obj, instrument_precision=0.01,
                    replication=2, run_index=0)
    noisy = execute({"metal": "Li", "halide": "I"}, obj, instrument_precision=0.2,
                    replication=2, run_index=0)
    assert noisy.uncertainty > clean.uncertainty
