"""Deliberative decision-making — tree-of-thought + Monte-Carlo rollouts (doc I.126).

A thoughtful Minion doesn't just react: it imagines a few candidate actions,
projects how each would change its wellbeing over a short horizon (a depth-limited
tree of follow-on actions), samples that tree a handful of times with noise (the
Monte-Carlo part), and picks the action with the best expected outcome — biased by
what its causal beliefs (#23) say actually helps. Fast, pure, and unit-testable.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

# A compact need-state the planner reasons over (all 0..1).
@dataclass
class State:
    hunger: float
    thirst: float
    fatigue: float
    sanity: float
    stress: float

    def wellbeing(self) -> float:
        return (self.hunger + self.thirst + self.fatigue + self.sanity + (1 - self.stress)) / 5.0


_PRODUCTIVE = {"study", "calculate", "kb_lookup", "teach", "search_patents", "propose_invention"}


def _apply(s: State, action: str) -> State:
    """Approximate how an action changes the need-state (the planner's model)."""
    n = State(s.hunger, s.thirst, s.fatigue, s.sanity, s.stress)
    if action == "eat":
        n.hunger = min(1.0, n.hunger + 0.5)
    elif action == "drink":
        n.thirst = min(1.0, n.thirst + 0.5)
    elif action == "rest":
        n.fatigue = min(1.0, n.fatigue + 0.4)
    elif action == "meditate":
        n.stress = max(0.0, n.stress - 0.3)
    elif action == "socialise":
        n.sanity = min(1.0, n.sanity + 0.2)
    elif action in _PRODUCTIVE:
        n.fatigue = max(0.0, n.fatigue - 0.05)   # work tires you slightly
        n.sanity = min(1.0, n.sanity + 0.03)     # but purpose helps
    # natural decay applied to every step so doing nothing useful costs wellbeing
    n.hunger = max(0.0, n.hunger - 0.04)
    n.thirst = max(0.0, n.thirst - 0.05)
    n.fatigue = max(0.0, n.fatigue - 0.03)
    return n


def _immediate(s: State, action: str, belief_conf: dict[str, float]) -> float:
    after = _apply(s, action)
    # value = projected wellbeing + a sense of purpose from useful work + a nudge
    # from what experience says actually helps.
    purpose = 0.08 if action in _PRODUCTIVE else 0.0
    return after.wellbeing() + purpose + 0.15 * (belief_conf.get(action, 0.5) - 0.5)


def _rollout(s: State, depth: int, candidates: list[str], belief_conf: dict[str, float],
             rng: random.Random) -> float:
    if depth <= 0:
        return s.wellbeing()
    best = -1e9
    for a in candidates:
        v = _immediate(s, a, belief_conf) + rng.uniform(-0.03, 0.03)
        v += 0.7 * _rollout(_apply(s, a), depth - 1, candidates, belief_conf, rng)
        best = max(best, v)
    return best


def plan_action(
    minion,
    candidates: list[str],
    belief_conf: dict[str, float] | None = None,
    *,
    rng: random.Random | None = None,
    samples: int = 6,
    depth: int = 2,
) -> str | None:
    """Return the candidate action with the best Monte-Carlo-estimated value."""
    if not candidates:
        return None
    rng = rng or random.Random()
    belief_conf = belief_conf or {}
    s0 = State(minion.hunger, minion.thirst, minion.fatigue, minion.sanity, minion.stress)
    best_action, best_val = candidates[0], -1e9
    for a in candidates:
        total = 0.0
        for _ in range(samples):
            v = _immediate(s0, a, belief_conf) + rng.uniform(-0.03, 0.03)
            v += 0.7 * _rollout(_apply(s0, a), depth - 1, candidates, belief_conf, rng)
            total += v
        avg = total / samples
        if avg > best_val:
            best_val, best_action = avg, a
    return best_action
