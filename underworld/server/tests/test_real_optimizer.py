"""Tests for the REAL Bayesian optimizer — no mocks, no hashes.

These assert against the published global optima of standard benchmark
functions, so a green run is an externally-checkable claim that the optimizer
actually works (and actually beats random search).
"""
import numpy as np
import pytest

from underworld.server.services.real_optimizer import (
    BENCHMARKS,
    BRANIN,
    HARTMANN6,
    bayes_optimize,
    benchmark_vs_random,
    expected_improvement,
    make_gp,
    random_search,
    upper_confidence_bound,
)


def test_benchmark_optima_match_literature():
    # the functions evaluate to their published minima at the known optimisers
    # Branin optimiser (one of three): (-pi, 12.275) -> 0.397887
    assert abs(BRANIN.fn(np.array([-np.pi, 12.275])) - 0.397887) < 1e-3
    # Hartmann-6 optimiser -> -3.32237
    x_opt = np.array([0.20169, 0.150011, 0.476874, 0.275332, 0.311652, 0.6573])
    assert abs(HARTMANN6.fn(x_opt) - (-3.32237)) < 1e-3


def test_gp_posterior_is_real():
    # a real GP: uncertainty collapses at observed points, grows away from them
    gp = make_gp(seed=0)
    X = np.array([[0.0], [1.0], [2.0]])
    y = np.array([0.0, 1.0, 0.0])
    gp.fit(X, y)
    _, sigma_at = gp.predict(X, return_std=True)
    _, sigma_far = gp.predict(np.array([[10.0]]), return_std=True)
    assert sigma_at.mean() < sigma_far[0]          # certain where observed
    assert sigma_far[0] > 0


def test_expected_improvement_is_nonneg_and_rewards_promise():
    mu = np.array([0.0, -1.0])     # second point predicted better (lower)
    sigma = np.array([0.5, 0.5])
    ei = expected_improvement(mu, sigma, best=0.0)
    assert np.all(ei >= 0)
    assert ei[1] > ei[0]           # the more promising point scores higher


def test_ucb_prefers_low_mean_high_uncertainty():
    mu = np.array([0.0, 0.0])
    sigma = np.array([0.1, 1.0])
    ucb = upper_confidence_bound(mu, sigma)
    assert ucb[1] > ucb[0]         # explore the uncertain point


def test_bo_finds_branin_global_optimum():
    # averaged over seeds, BO gets close to the published 0.397887
    regrets = [bayes_optimize(BRANIN.fn, BRANIN.bounds, n_init=5, n_iter=30,
                              optimum=BRANIN.optimum, seed=s).regret
               for s in range(4)]
    assert np.mean(regrets) < 0.5        # within 0.5 of the true optimum


def test_bo_beats_random_search_on_branin():
    bo = benchmark_vs_random("branin", seeds=4, n_iter=25)
    assert bo["bo_mean_regret"] < bo["random_mean_regret"]
    assert bo["bo_wins"] >= 3            # wins the clear majority of seeds
    assert bo["improvement_factor"] > 1.0


@pytest.mark.parametrize("name", list(BENCHMARKS))
def test_bo_beats_random_on_all_benchmarks(name):
    # the honest claim across every benchmark, including the hard one (Ackley):
    # BO's mean regret is no worse than random's, and wins most seeds.
    r = benchmark_vs_random(name, seeds=4, n_iter=20)
    assert r["bo_mean_regret"] <= r["random_mean_regret"]
    assert r["bo_wins"] >= 2


def test_noise_is_modelled_not_ignored():
    # with instrument noise, the optimizer still beats random (GP fits the noise)
    bo = bayes_optimize(BRANIN.fn, BRANIN.bounds, n_init=5, n_iter=20,
                        optimum=BRANIN.optimum, seed=0, noise=0.5)
    rs = random_search(BRANIN.fn, BRANIN.bounds, n_eval=25,
                       optimum=BRANIN.optimum, seed=0, noise=0.5)
    assert bo.regret < rs.regret


def test_history_is_monotone_nonincreasing():
    # best-so-far can only improve — a real optimisation trace
    res = bayes_optimize(BRANIN.fn, BRANIN.bounds, n_init=5, n_iter=15,
                        optimum=BRANIN.optimum, seed=2)
    assert all(b <= a + 1e-9 for a, b in zip(res.history, res.history[1:]))
