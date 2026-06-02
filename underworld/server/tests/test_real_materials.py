"""Tests for real materials modelling on REAL measured data.

These assert against the known, published behaviour of the concrete compressive
strength dataset — so a green run means the pipeline genuinely learned real
structure from real lab measurements, not a mock.
"""
import pytest

rm = pytest.importorskip("underworld.server.services.real_materials")


def test_real_dataset_loads():
    ds = rm.load()
    assert ds.n > 1000                      # ~1030 real measured samples
    assert ds.X.shape[1] == 8               # 8 mix-design inputs
    assert ds.y.min() > 0                   # strengths are positive MPa


def test_random_forest_matches_published_accuracy():
    # published strong models reach R2 ~ 0.90 on this dataset; shuffled CV must
    # land in that neighbourhood (this is the real, reproducible claim).
    perf = rm.cross_validated_performance(model="rf", folds=5)
    assert perf["r2_mean"] > 0.85
    assert perf["rmse_mpa"] < 7.0           # MPa, vs published ~5
    assert perf["r2_std"] < 0.1             # shuffled folds are stable


def test_feature_importance_is_materials_sane():
    # materials science: cement content and curing age dominate strength
    imp = rm.feature_importance()["importance"]
    top2 = {d["feature"] for d in imp[:2]}
    assert "cement" in top2 or "age" in top2
    assert abs(sum(d["weight"] for d in imp) - 1.0) < 1e-6


def test_design_optimal_mix_is_grounded_and_honest():
    des = rm.design_optimal_mix(n_iter=15)
    # designed strength is positive and not an absurd extrapolation beyond data
    assert des["predicted_strength_mpa"] > 0
    assert des["predicted_strength_mpa"] <= des["best_measured_in_dataset_mpa"] * 1.15
    # the recipe stays within the dataset's real envelope
    ds = rm.load()
    for i, f in enumerate(rm.FEATURES):
        assert ds.X[:, i].min() - 1e-6 <= des["designed_mix"][f] <= ds.X[:, i].max() + 1e-6
    assert "caveat" in des                  # honest about needing physical testing


def test_gp_path_subsamples_to_stay_tractable():
    perf = rm.cross_validated_performance(model="gp", folds=3, max_samples=120)
    assert perf["subsampled"] is True
    assert perf["samples"] == 120
    assert perf["full_dataset_size"] > 1000
