"""Epidemic + population dynamics helpers (expansion #67/#68).

The single-point laws (R0, logistic rate, drug clearance) live in the physics
engine so Minions can discover them. These helpers step the *dynamics* — an SIR
epidemic over time — which the world can run when a disease breaks out.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SIR:
    S: float
    I: float
    R: float

    @property
    def N(self) -> float:
        return self.S + self.I + self.R


def r0(beta: float, gamma: float) -> float:
    return beta / gamma if gamma else float("inf")


def sir_step(state: SIR, *, beta: float, gamma: float, dt: float = 1.0) -> SIR:
    """One forward-Euler step of the SIR model (doc #67)."""
    n = state.N or 1.0
    new_inf = beta * state.S * state.I / n
    recov = gamma * state.I
    return SIR(
        S=max(0.0, state.S - new_inf * dt),
        I=max(0.0, state.I + (new_inf - recov) * dt),
        R=max(0.0, state.R + recov * dt),
    )


def epidemic_peaks(beta: float, gamma: float) -> bool:
    """An outbreak grows (an epidemic) only when R0 > 1."""
    return r0(beta, gamma) > 1.0
