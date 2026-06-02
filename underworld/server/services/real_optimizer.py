"""Real Bayesian optimization — a genuine GP surrogate + acquisition, not a hash.

This replaces the synthetic, hash-derived "surrogate"/"active learning" in
self_driving_lab.py with the real thing:

  * surrogate     — a scikit-learn Gaussian Process (Matern-5/2 kernel + learned
                    noise), fit to observed (x, y) and giving a real posterior
                    mean μ(x) and std σ(x).
  * acquisition   — real Expected Improvement and Upper-Confidence-Bound computed
                    from that posterior (the same maths BoTorch/Ax use).
  * validation    — benchmark objectives with PUBLISHED global optima (Branin,
                    Hartmann-6, Ackley), so a convergence claim is externally
                    checkable, not self-graded. BO is compared to random search
                    over many seeds; the win is an empirical, reproducible fact.

Nothing here is mocked. Run `python -m underworld.server.services.real_optimizer`
or the tests to reproduce the numbers against the literature optima.

References for the ground-truth optima (Surjanovic & Bingham, "Virtual Library
of Simulation Experiments", sfu.ca/~ssurjano):
  Branin     global min f* = 0.397887
  Hartmann-6 global min f* = -3.32237
  Ackley(d)  global min f* = 0 at the origin
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy.stats import norm
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import ConstantKernel, Matern, WhiteKernel


# ── benchmark objectives with published global optima ───────────────────────
@dataclass(frozen=True)
class Benchmark:
    name: str
    fn: Callable[[np.ndarray], float]
    bounds: np.ndarray            # shape (d, 2)
    optimum: float                # published global minimum f*

    @property
    def dim(self) -> int:
        return self.bounds.shape[0]


def _branin(x: np.ndarray) -> float:
    x1, x2 = float(x[0]), float(x[1])
    a, b, c = 1.0, 5.1 / (4 * np.pi**2), 5.0 / np.pi
    r, s, t = 6.0, 10.0, 1.0 / (8 * np.pi)
    return a * (x2 - b * x1**2 + c * x1 - r) ** 2 + s * (1 - t) * np.cos(x1) + s


def _hartmann6(x: np.ndarray) -> float:
    alpha = np.array([1.0, 1.2, 3.0, 3.2])
    A = np.array([
        [10, 3, 17, 3.5, 1.7, 8],
        [0.05, 10, 17, 0.1, 8, 14],
        [3, 3.5, 1.7, 10, 17, 8],
        [17, 8, 0.05, 10, 0.1, 14],
    ])
    P = 1e-4 * np.array([
        [1312, 1696, 5569, 124, 8283, 5886],
        [2329, 4135, 8307, 3736, 1004, 9991],
        [2348, 1451, 3522, 2883, 3047, 6650],
        [4047, 8828, 8732, 5743, 1091, 381],
    ])
    outer = 0.0
    for i in range(4):
        inner = np.sum(A[i] * (x - P[i]) ** 2)
        outer += alpha[i] * np.exp(-inner)
    return float(-outer)


def _ackley(x: np.ndarray) -> float:
    x = np.asarray(x, dtype=float)
    d = x.size
    a, b, c = 20.0, 0.2, 2 * np.pi
    s1 = np.sum(x**2)
    s2 = np.sum(np.cos(c * x))
    return float(-a * np.exp(-b * np.sqrt(s1 / d)) - np.exp(s2 / d) + a + np.e)


BRANIN = Benchmark("branin", _branin,
                   np.array([[-5.0, 10.0], [0.0, 15.0]]), 0.397887)
HARTMANN6 = Benchmark("hartmann6", _hartmann6,
                      np.array([[0.0, 1.0]] * 6), -3.32237)
ACKLEY5 = Benchmark("ackley5", _ackley,
                    np.array([[-32.768, 32.768]] * 5), 0.0)

BENCHMARKS = {b.name: b for b in (BRANIN, HARTMANN6, ACKLEY5)}


# ── the real Gaussian-process surrogate ─────────────────────────────────────
def make_gp(seed: int = 0) -> GaussianProcessRegressor:
    """A real GP: Matern-5/2 over a learned signal scale, plus a WhiteKernel so
    the model fits observation noise instead of assuming noise-free data."""
    kernel = (ConstantKernel(1.0, (1e-3, 1e3))
              * Matern(length_scale=1.0, length_scale_bounds=(1e-2, 1e2), nu=2.5)
              + WhiteKernel(noise_level=1e-5, noise_level_bounds=(1e-10, 1e1)))
    return GaussianProcessRegressor(
        kernel=kernel, normalize_y=True, n_restarts_optimizer=2,
        random_state=seed)


# ── real acquisition functions (minimisation convention) ────────────────────
def expected_improvement(mu: np.ndarray, sigma: np.ndarray, best: float,
                         xi: float = 0.01) -> np.ndarray:
    """EI for minimisation. Higher = more worth sampling. Exact closed form."""
    sigma = np.maximum(sigma, 1e-12)
    imp = best - mu - xi
    z = imp / sigma
    return imp * norm.cdf(z) + sigma * norm.pdf(z)


def upper_confidence_bound(mu: np.ndarray, sigma: np.ndarray,
                           beta: float = 2.0) -> np.ndarray:
    """Lower-confidence-bound for minimisation, returned as a 'higher=better'
    score so the optimiser maximises it like EI."""
    return -(mu - beta * sigma)


@dataclass
class BOResult:
    best_x: np.ndarray
    best_y: float
    history: list[float]                  # best-so-far after each evaluation
    regret: float                         # best_y - published optimum
    n_eval: int
    converged: bool
    extra: dict = field(default_factory=dict)


# ── the real Bayesian-optimization loop ─────────────────────────────────────
def bayes_optimize(
    objective: Callable[[np.ndarray], float],
    bounds: np.ndarray,
    *,
    n_init: int = 5,
    n_iter: int = 25,
    acquisition: str = "ei",
    optimum: float | None = None,
    tol: float = 1e-2,
    seed: int = 0,
    noise: float = 0.0,
    cand_pool: int = 512,
) -> BOResult:
    """Minimise `objective` over `bounds` with a real GP + acquisition loop.

    Each iteration: fit the GP to all observations, score a fresh pool of
    candidate points by the acquisition function, evaluate the best candidate,
    repeat. Optionally adds measurement `noise` to mimic a real instrument — the
    GP's WhiteKernel then models it. Returns best point, best value, best-so-far
    history, and regret against the published optimum.
    """
    rng = np.random.default_rng(seed)
    d = bounds.shape[0]
    lo, hi = bounds[:, 0], bounds[:, 1]

    def sample(n: int) -> np.ndarray:
        return lo + (hi - lo) * rng.random((n, d))

    def evaluate(x: np.ndarray) -> float:
        y = objective(x)
        if noise:
            y += rng.normal(0.0, noise)
        return y

    X = sample(n_init)
    y = np.array([evaluate(xi) for xi in X])
    best_i = int(np.argmin(y))
    history = [float(np.min(y[: i + 1])) for i in range(len(y))]

    gp = make_gp(seed)
    for _ in range(n_iter):
        gp.fit(X, y)
        cand = sample(cand_pool)
        mu, sigma = gp.predict(cand, return_std=True)
        best_y = float(np.min(y))
        if acquisition == "ucb":
            score = upper_confidence_bound(mu, sigma)
        else:
            score = expected_improvement(mu, sigma, best_y)
        x_next = cand[int(np.argmax(score))]
        y_next = evaluate(x_next)
        X = np.vstack([X, x_next])
        y = np.append(y, y_next)
        history.append(float(np.min(y)))
        if optimum is not None and abs(np.min(y) - optimum) <= tol:
            break

    best_i = int(np.argmin(y))
    best_y = float(y[best_i])
    regret = abs(best_y - optimum) if optimum is not None else float("nan")
    return BOResult(
        best_x=X[best_i], best_y=best_y, history=history,
        regret=regret, n_eval=len(y),
        converged=(optimum is not None and regret <= tol),
        extra={"acquisition": acquisition, "kernel": str(gp.kernel_)},
    )


def random_search(objective, bounds, *, n_eval: int, optimum=None, seed=0,
                  noise: float = 0.0) -> BOResult:
    """Baseline: pure random search, same evaluation budget. The honest control
    BO must beat for the convergence claim to mean anything."""
    rng = np.random.default_rng(seed)
    d = bounds.shape[0]
    lo, hi = bounds[:, 0], bounds[:, 1]
    X = lo + (hi - lo) * rng.random((n_eval, d))
    y = np.array([objective(x) + (rng.normal(0, noise) if noise else 0.0) for x in X])
    best_i = int(np.argmin(y))
    history = [float(np.min(y[: i + 1])) for i in range(len(y))]
    regret = abs(float(y[best_i]) - optimum) if optimum is not None else float("nan")
    return BOResult(best_x=X[best_i], best_y=float(y[best_i]), history=history,
                    regret=regret, n_eval=n_eval, converged=False)


def benchmark_vs_random(name: str, *, seeds: int = 10, n_init: int = 5,
                        n_iter: int = 25) -> dict:
    """Reproducible head-to-head: BO vs random search on a benchmark with a
    published optimum, averaged over `seeds`. Returns mean final regret for
    both and the improvement factor — an externally verifiable result."""
    b = BENCHMARKS[name]
    budget = n_init + n_iter
    bo_reg, rs_reg = [], []
    for s in range(seeds):
        bo = bayes_optimize(b.fn, b.bounds, n_init=n_init, n_iter=n_iter,
                            optimum=b.optimum, seed=s)
        rs = random_search(b.fn, b.bounds, n_eval=budget, optimum=b.optimum, seed=s)
        bo_reg.append(bo.regret)
        rs_reg.append(rs.regret)
    bo_mean, rs_mean = float(np.mean(bo_reg)), float(np.mean(rs_reg))
    return {
        "benchmark": name,
        "dim": b.dim,
        "published_optimum": b.optimum,
        "budget_evals": budget,
        "seeds": seeds,
        "bo_mean_regret": round(bo_mean, 5),
        "random_mean_regret": round(rs_mean, 5),
        "improvement_factor": round(rs_mean / bo_mean, 2) if bo_mean > 0 else float("inf"),
        "bo_wins": int(sum(1 for a, r in zip(bo_reg, rs_reg) if a < r)),
    }


if __name__ == "__main__":  # pragma: no cover
    for nm in BENCHMARKS:
        print(benchmark_vs_random(nm, seeds=8))
