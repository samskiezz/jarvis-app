"""Solver Fidelity Ladder + numerical stability (kernel #4/#7).

Level-of-detail physics: run expensive high-fidelity solvers only where Minions
observe, build, measure or depend on the outcome; cheap approximations elsewhere.
Stability is governed by the Courant condition C = vΔt/Δx ≤ 1 — exceed it and the
solver diverges (the source of "numerical error weathering"), so the ladder also
reports the largest stable timestep.
"""

from __future__ import annotations

COURANT_LIMIT = 1.0


def courant_number(v: float, dt: float, dx: float) -> float:
    if dx <= 0:
        return float("inf")
    return abs(v) * dt / dx


def is_stable(v: float, dt: float, dx: float, *, limit: float = COURANT_LIMIT) -> bool:
    return courant_number(v, dt, dx) <= limit


def max_stable_dt(v: float, dx: float, *, limit: float = COURANT_LIMIT) -> float:
    if v == 0:
        return float("inf")
    return limit * dx / abs(v)


def truncation_error(dx: float, dt: float, *, p: int = 1, q: int = 2) -> float:
    """Local truncation error O(Δt^p + Δx^q) — how wrong a cheap step is."""
    return dt ** p + dx ** q


def fidelity_tier(*, observed: bool, importance: float) -> str:
    """Choose solver fidelity. Observed/critical → exact; otherwise cheaper."""
    if observed or importance >= 0.8:
        return "exact"
    if importance >= 0.5:
        return "high"
    if importance >= 0.2:
        return "medium"
    return "low"
