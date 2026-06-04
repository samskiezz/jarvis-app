"""Stochastic network SIR: epidemic spreads above threshold, dies out below,
and shows real run-to-run variance the mean-field ODE can't."""
from underworld.server.services import epidemic_network as EN


def test_small_world_has_expected_mean_degree():
    import numpy as np
    adj = EN.small_world(200, 8, 0.1, np.random.default_rng(0))
    deg = np.mean([len(a) for a in adj])
    assert 6 < deg < 10            # ~k


def test_epidemic_spreads_above_threshold():
    r = EN.simulate(n=400, k=10, beta=0.08, gamma=0.08, i0=5, seed=1)
    assert r["r0_estimate"] > 1
    assert r["attack_rate"] > 0.3   # a real outbreak infects a big fraction
    assert r["peak_infected"] > 5


def test_epidemic_dies_out_below_threshold():
    r = EN.simulate(n=400, k=6, beta=0.01, gamma=0.4, i0=3, seed=2)
    assert r["r0_estimate"] < 1
    assert r["attack_rate"] < 0.2   # fizzles


def test_conservation_SIR_compartments():
    r = EN.simulate(n=300, seed=3)
    last = r["curve"][-1]
    assert last["S"] + last["I"] + last["R"] == 300


def test_ensemble_reports_variance_and_fadeout():
    e = EN.ensemble(runs=8, n=250, k=8, beta=0.05, gamma=0.12, i0=2, seed=10)
    assert e["runs"] == 8
    assert e["attack_rate_std"] >= 0.0
    assert 0.0 <= e["fade_out_fraction"] <= 1.0
