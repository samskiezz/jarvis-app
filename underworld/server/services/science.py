"""Minion-facing science tooling (expansion #71-73, #75, #77, #78, #80).

The instruments of disciplined inquiry: Bayesian hypothesis updating, measurement
statistics + calibration, replication confidence, a unit-checked formula parser
(tied to the physics kernel), a prior-art graph that links patents by shared
physics, mastery-by-demonstration scoring, and a constrained optimiser for the
"empty patent" gaps. (Feasibility gate #74, impossible-patent detector #76 and the
Socratic oracle #79 already live in the kernel + oracle.)
"""

from __future__ import annotations

import math
import random
import re
from collections.abc import Callable

from ..physics.dimensions import DIMENSIONLESS, DimensionError, unit


# ── #71 experiment design — Bayesian update ──────────────────────────────────
def bayes_update(prior: float, p_e_given_h: float, p_e_given_not_h: float) -> float:
    """Posterior P(H|E) = P(E|H)P(H) / P(E)."""
    p_e = p_e_given_h * prior + p_e_given_not_h * (1 - prior)
    if p_e <= 0:
        return prior
    return p_e_given_h * prior / p_e


# ── #72 measurement error + calibration ──────────────────────────────────────
def measurement_stats(readings: list[float]) -> dict:
    n = len(readings)
    if n == 0:
        return {"n": 0, "mean": 0.0, "variance": 0.0, "std": 0.0, "sem": 0.0}
    mean = sum(readings) / n
    var = sum((x - mean) ** 2 for x in readings) / n
    std = math.sqrt(var)
    sem = std / math.sqrt(n) if n else 0.0
    return {"n": n, "mean": round(mean, 6), "variance": round(var, 6),
            "std": round(std, 6), "sem": round(sem, 6)}


def calibrate(readings: list[float], true_value: float) -> dict:
    """An uncalibrated instrument has a systematic offset; calibration removes it."""
    stats = measurement_stats(readings)
    offset = round(stats["mean"] - true_value, 6)
    return {"offset": offset, "corrected_mean": round(stats["mean"] - offset, 6), **stats}


# ── #73 replication scoreboard ───────────────────────────────────────────────
def confidence_interval(mean: float, std: float, n: int, *, z: float = 1.96) -> tuple[float, float]:
    if n <= 0:
        return (mean, mean)
    half = z * std / math.sqrt(n)
    return (round(mean - half, 6), round(mean + half, 6))


def is_established(replications: int, agreement: float, *, min_reps: int = 3, min_agree: float = 0.8) -> bool:
    """A result is accepted only with enough independent replications that agree."""
    return replications >= min_reps and agreement >= min_agree


# ── #75 unit-checked formula parser ──────────────────────────────────────────
def parse_equation(equation: str, units: dict[str, str]) -> dict:
    """Parse 'lhs = term*term/...' and check both sides share dimensions using the
    SI unit ledger. Returns variables, per-side signatures and validity."""
    if "=" not in equation:
        raise ValueError("equation must contain '='")
    lhs, rhs = (s.strip() for s in equation.split("=", 1))
    variables = sorted(set(re.findall(r"[A-Za-z_]\w*", equation)))

    def side_dim(expr: str):
        d = DIMENSIONLESS
        # split on * and /, tracking division
        tokens = re.findall(r"[*/]|[A-Za-z_]\w*", expr)
        op = "*"
        for tok in tokens:
            if tok in ("*", "/"):
                op = tok
                continue
            u = units.get(tok)
            if u is None:
                raise ValueError(f"no unit given for {tok!r}")
            ud = unit(u)
            d = d * ud if op == "*" else d / ud
        return d

    try:
        ld, rd = side_dim(lhs), side_dim(rhs)
    except (DimensionError, ValueError) as e:
        return {"valid": False, "error": str(e), "variables": variables}
    return {
        "valid": ld == rd,
        "lhs": str(ld), "rhs": str(rd),
        "variables": variables,
    }


# ── #77 prior-art physics graph ──────────────────────────────────────────────
def _overlap(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)   # Jaccard


def prior_art_graph(patents: list[dict]) -> list[dict]:
    """Edges between patents weighted by shared laws, materials and functions —
    physical relatedness, not keyword matching."""
    edges = []
    for i in range(len(patents)):
        for j in range(i + 1, len(patents)):
            a, b = patents[i], patents[j]
            w = (
                0.5 * _overlap(set(a.get("laws", [])), set(b.get("laws", [])))
                + 0.3 * _overlap(set(a.get("materials", [])), set(b.get("materials", [])))
                + 0.2 * _overlap(set(a.get("functions", [])), set(b.get("functions", [])))
            )
            if w > 0:
                edges.append({"a": a.get("id"), "b": b.get("id"), "weight": round(w, 4)})
    return sorted(edges, key=lambda e: e["weight"], reverse=True)


# ── #78 mastery by demonstration ─────────────────────────────────────────────
def mastery_by_demonstration(accuracy: float, repeatability: float, explanation: float) -> float:
    """M = accuracy × repeatability × explanation quality (all 0..1)."""
    return round(max(0.0, min(1.0, accuracy)) * max(0.0, min(1.0, repeatability))
                 * max(0.0, min(1.0, explanation)), 4)


# ── #80 empty-patent constraint solver ───────────────────────────────────────
def optimize(
    objective: Callable[[list[float]], float],
    constraints: list[Callable[[list[float]], float]],
    bounds: list[tuple[float, float]],
    *,
    samples: int = 2000,
    seed: int = 0,
) -> dict:
    """Maximise objective(x) subject to every g_i(x) ≤ 0, over box bounds.
    Random search — cheap, derivative-free, good enough for the gap puzzles."""
    rng = random.Random(seed)
    best_x: list[float] | None = None
    best_v = -math.inf
    for _ in range(samples):
        x = [rng.uniform(lo, hi) for lo, hi in bounds]
        if all(g(x) <= 1e-9 for g in constraints):
            v = objective(x)
            if v > best_v:
                best_v, best_x = v, x
    return {"feasible": best_x is not None, "x": best_x, "objective": (None if best_x is None else round(best_v, 6))}
