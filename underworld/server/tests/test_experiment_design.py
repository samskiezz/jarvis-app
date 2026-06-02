"""Tests for the real experiment-design algorithms — assert actual properties."""
import numpy as np

from underworld.server.services import experiment_design as ed


def test_latin_hypercube_is_stratified_and_in_bounds():
    bounds = [(0.0, 10.0), (-5.0, 5.0)]
    pts = ed.latin_hypercube(8, bounds, seed=1)
    assert pts.shape == (8, 2)
    assert (pts[:, 0] >= 0).all() and (pts[:, 0] <= 10).all()
    # stratification: exactly one sample per equal-width stratum on each axis
    for j, (lo, hi) in enumerate(bounds):
        strata = ((pts[:, j] - lo) / (hi - lo) * 8).astype(int)
        assert sorted(strata.tolist()) == list(range(8))


def test_full_factorial_enumerates_all_combinations():
    design = ed.full_factorial({"a": [0, 1], "b": [0, 1, 2]})
    assert len(design) == 6
    assert {"a": 1, "b": 2} in design


def test_fractional_factorial_columns_are_balanced():
    M = ed.fractional_factorial_2level(["A", "B", "C"])
    assert M.shape == (8, 3)
    # each column is balanced (+1/-1 in equal numbers) -> orthogonal main effects
    assert all(M[:, j].sum() == 0 for j in range(3))


def test_response_surface_recovers_known_quadratic_optimum():
    # true surface: f = -((x-3)^2 + (y+2)^2) + 10, optimum at (3,-2), value 10
    rng = np.random.default_rng(0)
    X = rng.uniform(-5, 5, size=(60, 2))
    y = -((X[:, 0] - 3) ** 2 + (X[:, 1] + 2) ** 2) + 10
    rs = ed.response_surface_fit(X, y)
    assert rs.r2 > 0.99                                   # quadratic fits exactly
    opt = ed.response_surface_optimum(rs, [(-5, 5), (-5, 5)])
    assert abs(opt["x"][0] - 3) < 0.2 and abs(opt["x"][1] + 2) < 0.2
    assert abs(opt["predicted"] - 10) < 0.2


def test_ucb1_bandit_converges_to_best_arm():
    rng = np.random.default_rng(0)
    true = [0.2, 0.5, 0.9]                                # arm 2 is best
    bandit = ed.UCB1Bandit(3)
    for _ in range(2000):
        a = bandit.select()
        bandit.update(a, float(rng.random() < true[a]))
    assert int(np.argmax(bandit.counts)) == 2            # pulled the best arm most


def test_active_learning_picks_most_uncertain():
    assert ed.active_learning_select(np.array([0.1, 0.9, 0.3])) == 1


def test_control_check_matches_scipy_and_detects_effect():
    from scipy import stats
    control = [10, 11, 9, 10, 10]
    treatment = [13, 14, 12, 13, 13]
    res = ed.control_check(control, treatment)
    t, p = stats.ttest_ind(treatment, control, equal_var=False)
    assert abs(res["t_stat"] - t) < 1e-3      # function rounds to 4 dp
    assert res["significant"] and res["effect"] > 0


def test_replication_manager_flags_tight_vs_noisy():
    tight = ed.replication_manager([10.0, 10.1, 9.9, 10.05])
    noisy = ed.replication_manager([10.0, 5.0, 15.0])
    assert tight["replicated"] is True
    assert noisy["replicated"] is False


def test_deviation_logger_finds_injected_outlier():
    readings = [10.0, 10.1, 9.9, 10.0, 10.2, 25.0]       # last is an outlier
    assert 5 in ed.deviation_logger(readings)


def test_contamination_carryover_decreases_with_wash():
    assert ed.contamination_carryover(1.0, wash_efficiency=0.9) < \
           ed.contamination_carryover(1.0, wash_efficiency=0.1)


def test_confidence_ledger_aggregates_evidence():
    led = ed.ConfidenceLedger()
    led.add("replication", 2.0, supports=True)
    led.add("control", 1.0, supports=True)
    led.add("skeptic", 0.5, supports=False)
    c = led.confidence()
    assert 0.5 < c <= 1.0


def test_publication_package_is_reproducible_flag():
    pkg = ed.publication_package(
        title="Test", result={"value": 1.0, "metric": "yield"},
        replication={"replicated": True}, control={"significant": True},
        confidence=0.9)
    assert pkg["reproducible"] is True
    assert pkg["result"]["value"] == 1.0
    assert "disclaimer" in pkg


def test_doe_engine_dispatches():
    pts = ed.design_of_experiments([(0, 1), (0, 1)], n=10, method="lhs")
    assert pts.shape == (10, 2)
