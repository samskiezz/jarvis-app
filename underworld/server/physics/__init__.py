"""Real physics engine for the Underworld simulation.

Turns the Physics Laws & Equations Master Compendium (V4) from inert reference
text into a registry of *computable* laws plus authoritative SI constants. The
simulation uses it three ways:

  * Minions run the ``calculate`` action — they pick a law, get a real problem
    instance, predict an answer, and the engine grades it against the true
    computed value. Accuracy (and therefore learning) is grounded in physics.
  * Invention feasibility is checked against hard physical limits (no faster-
    than-light, no over-unity / perpetual motion, efficiency ≤ 1), so the world
    constrains what can be built — like the real world.
  * The frontend gets a live calculator (/physics/solve) over the same laws.
"""

from __future__ import annotations

from . import constants, engine
from .engine import (
    LAWS,
    Law,
    assess_invention,
    compute,
    discipline_for_guild,
    generate_problem,
    get_law,
    grade_attempt,
    list_laws,
    world_limits,
)

__all__ = [
    "constants",
    "engine",
    "LAWS",
    "Law",
    "assess_invention",
    "compute",
    "discipline_for_guild",
    "generate_problem",
    "get_law",
    "grade_attempt",
    "list_laws",
    "world_limits",
]
