"""Self-Driving Lab — the closed-loop autonomous-science engine (frontier §21).

This is the most advanced module in the spec and the direct analogue of the real
2026 comparables: Berkeley A-Lab's closed-loop synthesis, Toronto's self-driving
lab, CMU's cloud-lab, Liverpool's mobile robotic chemist. It runs the canonical
loop:

    goal → candidate generation → cheap simulation → experiment selection
         → (robotic) execution → measurement → uncertainty update
         → next experiment → replication → disclosure

with three things that make it research-grade rather than a toy:

  1. **Experiment-as-code** — every experiment is a declarative `Protocol`
     (objective, sample space, constraints, instruments, success metric, safety)
     that a compiler turns into concrete runs. Reproducible, auditable, plan-able.
  2. **Active learning** — the planner doesn't grid-search; it picks the next
     experiment by an acquisition function (Upper-Confidence-Bound over a cheap
     surrogate), the same Bayesian-optimisation strategy A-Lab/Toronto use.
  3. **Provenance-first** — every result carries who/instrument/calibration/raw/
     uncertainty/replication, so a claim can be traced and replicated (§37.2).

Pure functions + small dataclasses (no DB, no real robots): the "robotic
execution" is a simulated objective with measurement noise from the instruments
engine, so the loop is honest about uncertainty and never fabricates a result.
"""
from __future__ import annotations

import hashlib
import itertools
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable


# ── Autonomous-lab maturity (spec §21.4) ─────────────────────────────────────
class AutonomyLevel(int, Enum):
    HUMAN_PLANNED = 0
    AI_SUGGESTS = 1
    AI_SCHEDULES = 2
    ROBOTIC_APPROVAL = 3
    CLOSED_LOOP = 4          # active learning — this engine's default
    AUTONOMOUS_DOMAIN = 5
    MULTI_LAB = 6
    CIVILISATION_SCALE = 7


# ── Experiment-as-code (spec §21.3) ──────────────────────────────────────────
@dataclass(frozen=True)
class Protocol:
    """A declarative experiment. The compiler/planner reads this; nothing is
    executed that the protocol didn't authorise (safety + reproducibility)."""
    objective: str
    sample_space: dict[str, list]          # factor -> discrete levels
    success_metric: str                    # name of the measured quantity
    target: float                          # success threshold (maximise toward)
    instruments: list[str] = field(default_factory=list)
    max_runs: int = 12
    replication: int = 2
    safety: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Run:
    """One concrete experiment point + its measured outcome and provenance."""
    run_id: str
    point: dict                            # chosen factor levels
    measured: float                        # noisy measured success-metric value
    uncertainty: float
    replicated: int                        # independent repeats that agreed
    provenance: dict


@dataclass
class Campaign:
    """The running state of a closed-loop campaign."""
    protocol: Protocol
    runs: list[Run] = field(default_factory=list)
    best: Run | None = None
    converged: bool = False

    @property
    def n(self) -> int:
        return len(self.runs)


# ── candidate generation: enumerate / sample the sample space ────────────────
def candidate_points(space: dict[str, list], *, cap: int = 256) -> list[dict]:
    """Full factorial of the discrete sample space, capped. The raw search set
    the active-learning planner picks from."""
    keys = list(space.keys())
    combos = itertools.product(*(space[k] for k in keys))
    out = []
    for i, combo in enumerate(combos):
        if i >= cap:
            break
        out.append(dict(zip(keys, combo)))
    return out


# ── cheap surrogate: predict outcome + uncertainty for an unrun point ────────
def _point_key(point: dict) -> str:
    return "|".join(f"{k}={point[k]}" for k in sorted(point))


def surrogate(point: dict, runs: list[Run]) -> tuple[float, float]:
    """A cheap surrogate model (spec §37.3): predict the success metric at
    `point` and an uncertainty, from prior runs.

    Uses inverse-distance-weighted interpolation over observed runs (a stand-in
    for a Gaussian process). Far from any observation ⇒ high uncertainty, which
    is exactly what the acquisition function should chase.
    """
    if not runs:
        return 0.0, 1.0
    num = 0.0
    wsum = 0.0
    nearest = 1e9
    for r in runs:
        d = _distance(point, r.point)
        nearest = min(nearest, d)
        w = 1.0 / (1e-6 + d)
        num += w * r.measured
        wsum += w
    pred = num / wsum
    # uncertainty grows with distance to the nearest observed point
    unc = 1.0 - math.exp(-nearest)
    return pred, max(0.02, unc)


def _distance(a: dict, b: dict) -> float:
    """Normalised mismatch distance over shared factors (categorical-safe)."""
    keys = set(a) | set(b)
    if not keys:
        return 0.0
    diff = 0.0
    for k in keys:
        if a.get(k) != b.get(k):
            diff += 1.0
    return diff / len(keys)


# ── active learning: pick the next experiment (UCB acquisition) ──────────────
def select_next(candidates: list[dict], runs: list[Run], *, beta: float = 1.5) -> dict | None:
    """Upper-Confidence-Bound acquisition — the heart of the self-driving loop.

    Score = predicted_value + beta * uncertainty. This balances exploitation
    (high predicted metric) against exploration (unexplored, uncertain regions),
    the same strategy real autonomous labs use to minimise the number of costly
    experiments. Already-run points are skipped.
    """
    run_keys = {_point_key(r.point) for r in runs}
    best_point, best_score = None, -1e18
    for c in candidates:
        if _point_key(c) in run_keys:
            continue
        pred, unc = surrogate(c, runs)
        score = pred + beta * unc
        if score > best_score:
            best_score, best_point = score, c
    return best_point


# ── robotic execution (simulated): truth + measurement noise ─────────────────
def execute(point: dict, objective_fn: Callable[[dict], float], *,
            instrument_precision: float, replication: int, run_index: int,
            operator: str = "lab-bot") -> Run:
    """Run one experiment: evaluate the (hidden) objective and *measure* it with
    instrument noise + replication. Returns a fully-provenanced Run.

    `objective_fn` is the world's hidden truth (the synthesis outcome); the lab
    never sees it directly — it sees the noisy measured mean of `replication`
    repeats. Deterministic given inputs (auditable replay, §5.2).
    """
    true_val = objective_fn(point)
    mag = abs(true_val) if true_val != 0 else 1.0
    reps = []
    agree = 0
    for j in range(max(1, replication)):
        h = hashlib.sha256(f"{_point_key(point)}|{run_index}|{j}".encode()).hexdigest()
        noise = (int(h[:8], 16) / 0xFFFFFFFF * 2 - 1) * instrument_precision * mag
        reps.append(true_val + noise)
    mean = sum(reps) / len(reps)
    if len(reps) >= 2:
        var = sum((x - mean) ** 2 for x in reps) / len(reps)
        rel_spread = (var ** 0.5) / mag
        agree = sum(1 for x in reps if abs(x - mean) / mag < instrument_precision)
    else:
        rel_spread = instrument_precision
        agree = 1
    return Run(
        run_id=f"run-{run_index}",
        point=point,
        measured=mean,
        uncertainty=max(instrument_precision, rel_spread) * mag,
        replicated=agree,
        provenance={
            "operator": operator,
            "instruments": list(point.get("_instruments", [])) or None,
            "replicates": len(reps),
            "raw": reps,
            "run_index": run_index,
            "calibration": f"prec={instrument_precision}",
        },
    )


# ── the closed loop ──────────────────────────────────────────────────────────
def run_campaign(
    protocol: Protocol,
    objective_fn: Callable[[dict], float],
    *,
    instrument_precision: float = 0.05,
) -> Campaign:
    """Drive the full self-driving-lab loop until the target is met or the run
    budget is exhausted. Returns the Campaign with all runs, best result, and
    convergence flag.

    Each iteration: surrogate-predict over candidates → UCB-select the most
    informative next experiment → execute (measure w/ noise + replication) →
    fold into the surrogate → check the success metric. This is active learning:
    it reaches the target in far fewer runs than a grid search.
    """
    camp = Campaign(protocol=protocol)
    candidates = candidate_points(protocol.sample_space)
    for i in range(protocol.max_runs):
        nxt = select_next(candidates, camp.runs)
        if nxt is None:
            break
        run = execute(nxt, objective_fn, instrument_precision=instrument_precision,
                      replication=protocol.replication, run_index=i)
        camp.runs.append(run)
        if camp.best is None or run.measured > camp.best.measured:
            camp.best = run
        if run.measured >= protocol.target and run.replicated >= 1:
            camp.converged = True
            break
    return camp


def campaign_report(camp: Campaign) -> dict:
    """A reviewable summary: outcome, efficiency vs exhaustive search, and a
    provenance-complete record of the winning experiment."""
    total_space = 1
    for levels in camp.protocol.sample_space.values():
        total_space *= max(1, len(levels))
    return {
        "objective": camp.protocol.objective,
        "metric": camp.protocol.success_metric,
        "target": camp.protocol.target,
        "converged": camp.converged,
        "runs_used": camp.n,
        "search_space_size": total_space,
        "efficiency": round(1.0 - camp.n / total_space, 3) if total_space else 0.0,
        "best_point": camp.best.point if camp.best else None,
        "best_value": round(camp.best.measured, 4) if camp.best else None,
        "best_uncertainty": round(camp.best.uncertainty, 4) if camp.best else None,
        "best_provenance": camp.best.provenance if camp.best else None,
        "disclaimer": "Simulated autonomous campaign. Results are in-silico "
                      "candidates requiring physical wet-lab replication.",
    }


# ── REAL continuous campaign: delegate to the genuine GP optimizer ───────────
def real_continuous_campaign(
    objective: "Callable[[list[float]], float]",
    bounds: list[tuple[float, float]],
    *,
    n_init: int = 5,
    n_iter: int = 25,
    minimize: bool = True,
    noise: float = 0.0,
    seed: int = 0,
) -> dict:
    """Run a campaign over a *continuous* design space with the REAL Bayesian
    optimizer (scikit-learn GP + Expected Improvement) instead of the categorical
    hash surrogate. This is the honest engine for real continuous problems:
    process parameters, alloy fractions, reaction conditions.

    `objective` maps a parameter vector to a measured scalar. Set `minimize`
    False to maximise (a success metric). Returns a provenance-complete report
    with the real GP kernel and convergence history.
    """
    import numpy as np

    from . import real_optimizer

    b = np.array(bounds, dtype=float)
    sign = 1.0 if minimize else -1.0

    def obj(x: np.ndarray) -> float:
        return sign * float(objective([float(v) for v in x]))

    res = real_optimizer.bayes_optimize(
        obj, b, n_init=n_init, n_iter=n_iter, seed=seed, noise=noise)
    best_value = sign * res.best_y
    return {
        "mode": "real-continuous",
        "engine": "scikit-learn GaussianProcessRegressor + Expected Improvement",
        "best_point": [round(float(v), 5) for v in res.best_x],
        "best_value": round(best_value, 5),
        "evaluations": res.n_eval,
        "history": [round(sign * h, 5) for h in res.history],
        "kernel": res.extra.get("kernel"),
        "disclaimer": "Real GP optimization over a continuous design space. "
                      "Physical candidates still require wet-lab replication.",
    }
