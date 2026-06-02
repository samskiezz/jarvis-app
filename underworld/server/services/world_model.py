"""Hybrid World Model — perception, imagination & counterfactual layers (#1).

The deterministic engine (the rest of `services/`) is the **truth layer**: it
decides what is real. This module adds the three cognitive/analytic layers the
upgrade spec calls for on top of that truth, as pure functions:

  Perception    — a Minion does NOT receive perfect world state. It receives a
                  memory-biased, uncertain, partial reading. Intelligence
                  emerges from incomplete information.
  Imagination   — before acting, an agent mentally simulates outcomes ("if I dam
                  this river, what happens to the farm, the fish, the village?").
                  A lightweight internal forward model, distinct from the MCTS
                  planner: it answers *consequences*, not just *value*.
  Counterfactual — the global-rewind idea formalised into an experiment engine:
                  fork a world snapshot, apply a change, and compare divergence
                  across population / knowledge / invention / mortality / etc.
                  This is what turns a game into a civilisational experiment machine.

Pure, storage-agnostic, fully unit-testable. Callers hydrate plain-dict
snapshots from the DB (PopulationSnapshot rows, Minion fields) and read back
derived intelligence.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


# ── Perception layer ─────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Percept:
    """What a Minion *believes* it observes — not ground truth."""

    key: str
    true_value: float
    perceived_value: float
    uncertainty: float           # 0..1, how unsure the agent is
    bias_source: str = ""        # what skewed it (memory, culture, fear)


def perceive(
    true_state: dict[str, float],
    *,
    acuity: float,
    memory_bias: dict[str, float] | None = None,
    fear: float = 0.0,
    rng_jitter: float = 0.0,
) -> dict[str, Percept]:
    """Turn ground truth into a Minion's imperfect perception.

    - `acuity` (0..1): sensory/cognitive sharpness. High acuity → perceived ≈
      true, low uncertainty. Low acuity → noisier, more uncertain.
    - `memory_bias`: prior expectations pull perception toward what the agent
      remembers (the spec's "memory-biased perception"). A value here is the
      remembered value for that key; perception is a blend of true and remembered.
    - `fear`: amplifies threat-laden readings (danger perceived larger than real)
      — the spec's "false assumptions".
    - `rng_jitter`: deterministic-caller-supplied noise magnitude (no RNG inside
      so the function stays pure; caller injects a sampled value if desired).
    """
    acuity = _clamp01(acuity)
    memory_bias = memory_bias or {}
    out: dict[str, Percept] = {}
    for key, truth in true_state.items():
        remembered = memory_bias.get(key)
        # Blend truth with memory; weight of memory rises as acuity falls.
        if remembered is None:
            blended = truth
            bias_src = ""
        else:
            w_mem = (1.0 - acuity) * 0.6
            blended = (1.0 - w_mem) * truth + w_mem * remembered
            bias_src = "memory"
        # Fear inflates anything that reads like a threat (negative or "risk"/"danger").
        if fear > 0 and ("risk" in key or "danger" in key or "threat" in key):
            blended *= 1.0 + 0.5 * fear
            bias_src = "fear" if not bias_src else bias_src + "+fear"
        # Low acuity adds caller-supplied jitter.
        blended += rng_jitter * (1.0 - acuity)
        uncertainty = _clamp01((1.0 - acuity) + 0.2 * fear)
        out[key] = Percept(key=key, true_value=truth, perceived_value=blended,
                           uncertainty=round(uncertainty, 4), bias_source=bias_src)
    return out


# ── Imagination layer ────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ImaginedOutcome:
    action: str
    effects: dict[str, float]    # key -> predicted delta
    confidence: float            # 0..1
    side_effects: list[str] = field(default_factory=list)


def imagine(
    action: str,
    state: dict[str, float],
    causal_model: dict[str, dict[str, float]],
    *,
    depth: int = 1,
) -> ImaginedOutcome:
    """Mentally simulate an action's consequences using a causal model.

    `causal_model[action]` maps affected state-keys to per-step deltas. We roll
    the deltas forward `depth` steps (compounding, damped) and surface
    *side effects*: keys the agent's own goals don't target but that move
    materially — the "what happens to the fish and the downstream village" the
    spec demands. Confidence falls with depth and with how many keys are touched
    (more entanglement = less certain).
    """
    model = causal_model.get(action, {})
    effects: dict[str, float] = {}
    damp = 1.0
    for _ in range(max(1, depth)):
        for key, delta in model.items():
            effects[key] = round(effects.get(key, 0.0) + delta * damp, 4)
        damp *= 0.6  # diminishing forward influence
    # Side effects: anything not obviously "primary" (heuristic: smaller magnitude
    # secondary keys still moving) that the actor may not intend.
    if effects:
        peak = max(abs(v) for v in effects.values()) or 1.0
        side = [k for k, v in effects.items() if 0 < abs(v) < 0.5 * peak]
    else:
        side = []
    confidence = _clamp01(1.0 - 0.15 * (depth - 1) - 0.05 * len(effects))
    return ImaginedOutcome(action=action, effects=effects,
                           confidence=round(confidence, 4), side_effects=side)


def best_imagined(
    actions: Iterable[str],
    state: dict[str, float],
    causal_model: dict[str, dict[str, float]],
    goal_weights: dict[str, float],
    *,
    depth: int = 2,
) -> tuple[str, float]:
    """Pick the action whose imagined outcome best serves weighted goals.

    Unlike the MCTS planner (which estimates value via rollouts of need-relief),
    this scores by *consequence alignment*: sum of (predicted delta × goal
    weight), penalised by unintended side effects. Returns (action, score).
    """
    best, best_score = None, -math.inf
    for a in actions:
        out = imagine(a, state, causal_model, depth=depth)
        score = sum(out.effects.get(k, 0.0) * w for k, w in goal_weights.items())
        score -= 0.1 * len(out.side_effects)
        score *= out.confidence
        if score > best_score:
            best, best_score = a, score
    return (best or "", round(best_score, 4))


# ── Counterfactual layer ─────────────────────────────────────────────────────
class Metric(str, Enum):
    POPULATION = "population"
    KNOWLEDGE = "knowledge"
    INVENTION_RATE = "invention_rate"
    MORTALITY = "mortality"
    WAR_RISK = "war_risk"
    INSTITUTIONAL_STABILITY = "institutional_stability"
    PATENT_COMPLETION = "patent_completion"
    TECH_DIVERGENCE = "tech_divergence"


@dataclass(frozen=True)
class CounterfactualResult:
    intervention: str
    baseline: dict[str, float]
    forked: dict[str, float]
    divergence: dict[str, float]   # metric -> (forked - baseline)
    summary: str


def counterfactual(
    baseline: dict[str, float],
    intervention: dict[str, float],
    *,
    label: str,
) -> CounterfactualResult:
    """Compare a forked timeline against the baseline across the spec's metrics.

    `baseline` and `intervention` are end-state metric snapshots (the caller runs
    the deterministic engine twice — once unchanged, once with the change — and
    hands the two result snapshots here). This formalises "what if the library
    didn't burn / copper was never found / the priesthood banned the scanner".
    """
    diff: dict[str, float] = {}
    for m in Metric:
        b = baseline.get(m.value, 0.0)
        f = intervention.get(m.value, 0.0)
        diff[m.value] = round(f - b, 4)
    # Human-readable headline: the metric that moved most *relative to its own
    # baseline scale*, so a 0.5 jump in a 0..1 risk metric outranks a +5 in a
    # population count of hundreds. Falls back to absolute when baseline is ~0.
    def _relative(metric: str, delta: float) -> float:
        base = abs(baseline.get(metric, 0.0))
        return abs(delta) / base if base > 1e-9 else abs(delta)

    if diff:
        driver = max(diff.items(), key=lambda kv: _relative(kv[0], kv[1]))
        direction = "higher" if driver[1] > 0 else "lower" if driver[1] < 0 else "unchanged"
        summary = f"{label}: {driver[0]} {direction} by {abs(driver[1])}"
    else:
        summary = f"{label}: no measured divergence"
    return CounterfactualResult(intervention=label, baseline=baseline,
                                forked=intervention, divergence=diff, summary=summary)


def _clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x
