"""Tests for real discovery-mechanics Bayesian machinery."""
from underworld.server.services import discovery_mechanics as dm


def test_posterior_rises_with_confirming_evidence():
    p1 = dm.hypothesis_posterior(0.5, 0.9, 0.1)
    p2 = dm.hypothesis_posterior(p1, 0.9, 0.1)        # second confirmation
    assert p2 > p1 > 0.5


def test_generate_hypotheses_ranks_real_effect_first():
    obs = {"temp": [20, 21, 19, 20], "noise": [10, 10, 10, 10]}
    h = dm.generate_hypotheses(obs, baseline=[10, 10, 10, 10])
    assert h[0]["hypothesis"].startswith("temp")      # the real shift ranks top
    assert h[0]["evidence"] >= h[-1]["evidence"]


def test_reject_low_posterior():
    assert dm.reject_hypothesis(0.02)["rejected"] is True
    assert dm.reject_hypothesis(0.8)["rejected"] is False


def test_replication_threshold_requires_majority_and_count():
    assert dm.replication_threshold([True, True, True])["established"] is True
    assert dm.replication_threshold([True, False, False])["established"] is False


def test_resolve_conflicting_evidence_pools_between_and_tightens():
    res = dm.resolve_conflicting_evidence([(10.0, 1.0), (12.0, 1.0)])
    assert 10.0 < res["pooled"] < 12.0                # pooled lies between
    assert res["pooled_sigma"] < 1.0                  # tighter than either input


def test_resolve_flags_real_conflict():
    # two estimates far apart relative to their tiny errors -> conflict
    res = dm.resolve_conflicting_evidence([(0.0, 0.01), (5.0, 0.01)])
    assert res["conflict"] is True
