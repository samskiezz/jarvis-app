"""Engineering, safety & meta-science helpers (remainders #6/#8/#9/#83/#88/#89/#90/#100).

The relational checks that don't fit the single-output law format: building-code
safety factors, occupational + evacuation safety, the ethical-technology gate, the
meta physics-law debugger (observed − predicted residual), instrument constant
discovery, and boundary-condition validation.
"""

from __future__ import annotations

import math
import random

# ── #83 building-code inspector ──────────────────────────────────────────────
def safety_factor(capacity: float, demand: float) -> float:
    return capacity / demand if demand > 0 else math.inf


def building_code_ok(capacity: float, demand: float, *, required: float = 1.5) -> bool:
    return safety_factor(capacity, demand) >= required


# ── #88 occupational hazard ──────────────────────────────────────────────────
def occupational_risk(probability: float, consequence: float, exposure: float) -> float:
    return round(probability * consequence * exposure, 6)


# ── #89 evacuation flow ──────────────────────────────────────────────────────
def evacuation_flow(rho: float, v: float, area: float, *, bottleneck: float | None = None) -> float:
    """Q = ρ·v·A, capped by the narrowest bottleneck on the route."""
    q = rho * v * area
    return min(q, bottleneck) if bottleneck is not None else q


# ── #90 ethical technology gate ──────────────────────────────────────────────
def ethical_review(severity: float, likelihood: float, irreversibility: float,
                   misuse: float, *, threshold: float = 0.3) -> dict:
    """Risk = severity × likelihood × irreversibility × misuse potential. Above the
    threshold the technology needs containment/governance before deployment."""
    risk = round(severity * likelihood * irreversibility * misuse, 6)
    return {"risk": risk, "approved": risk <= threshold,
            "verdict": "DEPLOY" if risk <= threshold else "CONTAIN"}


# ── #100 meta physics-law debugger ───────────────────────────────────────────
def anomaly(observed: float, predicted: float, uncertainty: float) -> dict:
    """Residual R = observed − predicted; an anomaly worth a new law when |R| beats
    measurement uncertainty (the seed of discovery)."""
    r = observed - predicted
    return {"residual": round(r, 6), "anomaly": abs(r) > abs(uncertainty)}


# ── #8 physical constant discovery ───────────────────────────────────────────
def measure_constant(true_value: float, rel_error: float, rng: random.Random) -> dict:
    """A real instrument reads a constant with noise; better instruments (lower
    rel_error) converge on the true value."""
    noise = rng.gauss(0.0, rel_error * abs(true_value))
    measured = true_value + noise
    return {"measured": measured,
            "relative_error": abs(noise / true_value) if true_value else math.inf}


# ── #6 boundary-condition validation ─────────────────────────────────────────
_BC_KINDS = {"dirichlet", "neumann", "robin", "mixed"}


def boundary_valid(kind: str, value: float) -> bool:
    return kind.lower() in _BC_KINDS and math.isfinite(value)
