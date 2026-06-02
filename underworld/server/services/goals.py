"""Goal Stack — Layer 5 of the Minion Cognitive Stack (master system #2).

The design's "Layered Cognitive Agent" is Body · Emotion · Memory · Belief ·
**Goal stack** · Planning · Identity. This module is the goal stack: it turns a
Minion's body state, personality, and mood into an *explicit, prioritised list
of competing goals* — the layer the planner reads to decide what to actually do.

Where `agents/minion.py::_heuristic_decision` collapses needs + personality into
a single fallback action, this module keeps the whole motivational field
visible. A Minion can simultaneously want to EAT (because hunger is low),
SCAN_PATENTS (because it is open and curious) and PROTECT_KIN (because a child
is sick) — and the dramatic tension the spec wants comes from those goals
*competing*. The ranking mirrors the heuristic's philosophy (survival first,
then reproduction / cognitive / social drives) but exposes it as data.

One pure core lives here (no DB, no async, no LLM — fully unit-testable):

  GoalKind     the design's enumerated competing motivations.
  Goal         a frozen, ranked goal with priority + urgency + satisfaction.
  derive_goals derive a prioritised stack from a plain minion-state dict.
  top_goal / goal_conflict / action_bias  read derived intelligence back out.

Nothing here mutates a Minion or touches storage: callers pass a snapshot dict
(the fields listed in `MinionState` below) and read back goals + an action-bias
the planner can consume. Determinism is a contract — same state in, same stack
out — so the goal stack is replayable and testable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


# ── The competing motivations the design enumerates ──────────────────────────
class GoalKind(str, Enum):
    """Every motivation a Minion can hold at once. Roughly Maslow-ordered:
    survival drives at the top, self-actualisation / civilisational drives below.

    The point of the stack is that several of these are *active simultaneously*
    and compete; `derive_goals` scores them, it does not pick one.
    """

    # Survival (body) — dominate when the matching need is low.
    SURVIVE = "survive"
    EAT = "eat"
    DRINK = "drink"
    SLEEP = "sleep"
    # Drives (personality + life-stage).
    REPRODUCE = "reproduce"
    PROTECT_KIN = "protect_kin"
    GAIN_STATUS = "gain_status"
    SATISFY_CURIOSITY = "satisfy_curiosity"
    OBEY_LAW = "obey_law"
    SERVE_RELIGION = "serve_religion"
    # Civilisational / cognitive (the master loop's higher rungs).
    SCAN_PATENTS = "scan_patents"
    GAIN_MASTERY = "gain_mastery"
    HELP_TRIBE = "help_tribe"
    SEEK_REVENGE = "seek_revenge"
    PRESERVE_KNOWLEDGE = "preserve_knowledge"
    OPEN_GATEWAY = "open_gateway"  # the narrative apex goal (E-class fiction)


# Goals at/above this rank are "survival" goals and always sort above drives.
_SURVIVAL_KINDS = frozenset(
    {GoalKind.SURVIVE, GoalKind.EAT, GoalKind.DRINK, GoalKind.SLEEP}
)


@dataclass(frozen=True)
class Goal:
    """A single ranked motivation in a Minion's goal stack.

    priority      how much the Minion *wants* this now (0..~3). The stack sorts
                  on this. Survival goals scale priority up as the need worsens.
    urgency       how *time-critical* it is independent of want (0..1). A sick
                  child makes PROTECT_KIN urgent even while SCAN_PATENTS has the
                  higher raw priority — that gap is the dramatic conflict (#2).
    satisfaction  0..1 — how met the goal already is. Low = pressing.
    parent        optional id of a super-goal, so EAT can hang under SURVIVE and
                  the stack reads as a tree of sub-goals.
    """

    id: str
    kind: GoalKind
    priority: float
    urgency: float = 0.0
    satisfaction: float = 0.0
    parent: str | None = None
    meta: dict = field(default_factory=dict)

    @property
    def is_survival(self) -> bool:
        return self.kind in _SURVIVAL_KINDS


# ── Minion-state contract ────────────────────────────────────────────────────
# `derive_goals` reads a plain dict so it stays storage-agnostic and trivially
# testable. These are the recognised keys (all optional; sensible defaults).
# Needs are 0..1 where LOW means deprived (matches the Minion model: hunger=1
# is sated, hunger=0 is starving). Traits are 0..1.
_NEED_KEYS = ("hunger", "thirst", "fatigue", "health", "sanity")
_TRAIT_KEYS = (
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
    "intelligence",
    "creativity",
)


def _get(state: dict, key: str, default: float = 0.5) -> float:
    v = state.get(key, default)
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _need_priority(need: float, *, floor: float, scale: float) -> float:
    """Translate a deprivation need (0=critical, 1=sated) into a want.

    Below `floor` the goal spikes — the lower the reserve, the higher the
    priority — so a starving Minion always outranks a curious one. This is the
    explicit, ranked form of the heuristic's `if hunger < 0.3: eat` cliff.
    """
    if need >= floor:
        return 0.0
    # 0 at the floor, growing to `scale` as the need approaches empty.
    deficit = (floor - need) / floor if floor > 0 else 0.0
    return round(scale * deficit, 4)


# ── derive: minion state → prioritised goal stack ────────────────────────────
def derive_goals(minion_state: dict) -> list[Goal]:
    """Derive a Minion's prioritised goal stack from a state snapshot.

    Ordering philosophy mirrors `_heuristic_decision`: survival needs dominate
    when low, then reproduction / cognitive / social / maintenance drives shaped
    by personality. Unlike the heuristic we return *all* live goals ranked by
    priority (highest first), with ties broken by a stable kind order so the
    result is deterministic.

    Recognised state keys: hunger, thirst, fatigue, health, sanity (needs,
    0=critical), openness/conscientiousness/extraversion/agreeableness/
    neuroticism/intelligence/creativity (traits 0..1), age, reputation, karma,
    mood (a MoodKind value or string), child_sick (bool), threat (0..1).
    """
    goals: list[Goal] = []

    hunger = _get(minion_state, "hunger", 1.0)
    thirst = _get(minion_state, "thirst", 1.0)
    fatigue = _get(minion_state, "fatigue", 1.0)
    health = _get(minion_state, "health", 1.0)
    sanity = _get(minion_state, "sanity", 1.0)

    openness = _get(minion_state, "openness")
    conscientiousness = _get(minion_state, "conscientiousness")
    extraversion = _get(minion_state, "extraversion")
    agreeableness = _get(minion_state, "agreeableness")
    neuroticism = _get(minion_state, "neuroticism")
    creativity = _get(minion_state, "creativity")

    age = _get(minion_state, "age", 0.0)
    reputation = _get(minion_state, "reputation", 1.0)
    karma = _get(minion_state, "karma", 0.0)
    mood = str(minion_state.get("mood", "")).lower()
    child_sick = bool(minion_state.get("child_sick", False))
    threat = _get(minion_state, "threat", 0.0)

    # ── Survival layer — needs trump everything when low (heuristic order). ──
    # SURVIVE is the umbrella; the body needs hang under it as sub-goals.
    survive_pressure = 0.0
    eat_p = _need_priority(hunger, floor=0.3, scale=2.0)
    drink_p = _need_priority(thirst, floor=0.3, scale=2.0)
    sleep_p = _need_priority(fatigue, floor=0.25, scale=1.8)
    health_p = _need_priority(health, floor=0.3, scale=2.2)
    # Thirst kills faster than hunger → nudge it above EAT at equal deficit.
    if drink_p > 0.0:
        drink_p = round(drink_p + 0.05, 4)

    survive_pressure = max(eat_p, drink_p, sleep_p, health_p)
    if survive_pressure > 0.0:
        goals.append(
            Goal(
                id="survive",
                kind=GoalKind.SURVIVE,
                priority=round(survive_pressure + 0.5, 4),
                urgency=round(min(1.0, survive_pressure / 2.0), 4),
                satisfaction=round(min(hunger, thirst, fatigue, health), 4),
            )
        )
    if eat_p > 0.0:
        goals.append(Goal("eat", GoalKind.EAT, eat_p, urgency=round(min(1.0, eat_p / 2.0), 4),
                          satisfaction=round(hunger, 4), parent="survive"))
    if drink_p > 0.0:
        goals.append(Goal("drink", GoalKind.DRINK, drink_p, urgency=round(min(1.0, drink_p / 2.0), 4),
                          satisfaction=round(thirst, 4), parent="survive"))
    if sleep_p > 0.0:
        goals.append(Goal("sleep", GoalKind.SLEEP, sleep_p, urgency=round(min(1.0, sleep_p / 1.8), 4),
                          satisfaction=round(fatigue, 4), parent="survive"))

    # Sanity erosion → an explicit maintenance goal (heuristic: meditate).
    if sanity < 0.3:
        # Restoring the mind is self-preservation; route it through GAIN_MASTERY
        # of the self (meditation) but at survival-grade priority.
        goals.append(
            Goal(
                id="restore_sanity",
                kind=GoalKind.SURVIVE,
                priority=round(_need_priority(sanity, floor=0.3, scale=1.6) + 0.4, 4),
                urgency=round(1.0 - sanity, 4),
                satisfaction=round(sanity, 4),
                meta={"via": "meditate"},
            )
        )

    # ── Kin protection — can spike to the top regardless of raw priority. ──
    # A sick child is the spec's canonical dramatic interrupt: its *urgency* is
    # high even though a comfortable Minion's raw priority for patent-scanning
    # may be higher. goal_conflict surfaces exactly this tension.
    if child_sick or threat > 0.4:
        # Priority is deliberately MODERATE (not survival-dominant): a strongly
        # curious/conscientious Minion can still have a higher-priority standing
        # goal (e.g. SCAN_PATENTS), so the *urgency* of PROTECT_KIN is what
        # interrupts. That gap between "what I was pursuing" (priority) and "what
        # now demands me" (urgency) is the dramatic conflict goal_conflict()
        # surfaces — the canonical sick-child beat from the spec.
        protect_priority = (
            0.45
            + 0.25 * agreeableness
            + 0.10 * (1.0 if child_sick else 0.0)
            + 0.20 * threat
        )
        goals.append(
            Goal(
                id="protect_kin",
                kind=GoalKind.PROTECT_KIN,
                priority=round(protect_priority, 4),
                urgency=round(min(1.0, (0.85 if child_sick else 0.0) + threat), 4),
                satisfaction=0.0,
                meta={"child_sick": child_sick, "threat": round(threat, 4)},
            )
        )

    # ── Reproduction drive — adult, healthy, rested (heuristic gate). ──
    is_adult = age > 20
    if is_adult and health > 0.6 and fatigue > 0.4:
        repro = (
            0.10
            + 0.30 * extraversion
            + 0.15 * agreeableness
            + 0.15 * (1.0 - neuroticism)
        )
        goals.append(
            Goal(
                id="reproduce",
                kind=GoalKind.REPRODUCE,
                priority=round(repro, 4),
                urgency=0.0,
                satisfaction=0.0,
            )
        )

    # ── Cognitive / civilisational drives shaped by personality. ──
    # High openness → curiosity & patent scanning (heuristic: search_patents).
    if openness > 0.6:
        goals.append(
            Goal(
                id="satisfy_curiosity",
                kind=GoalKind.SATISFY_CURIOSITY,
                priority=round(0.20 + 0.50 * openness, 4),
                urgency=0.0,
                satisfaction=0.0,
            )
        )
        goals.append(
            Goal(
                id="scan_patents",
                kind=GoalKind.SCAN_PATENTS,
                priority=round(0.15 + 0.45 * openness + 0.10 * creativity, 4),
                urgency=0.0,
                satisfaction=0.0,
            )
        )

    # High conscientiousness → preserve knowledge + diligent patent scanning.
    if conscientiousness > 0.6:
        goals.append(
            Goal(
                id="preserve_knowledge",
                kind=GoalKind.PRESERVE_KNOWLEDGE,
                priority=round(0.20 + 0.45 * conscientiousness, 4),
                urgency=0.0,
                satisfaction=0.0,
            )
        )
        if "scan_patents" not in {g.id for g in goals}:
            goals.append(
                Goal(
                    id="scan_patents",
                    kind=GoalKind.SCAN_PATENTS,
                    priority=round(0.10 + 0.35 * conscientiousness, 4),
                    urgency=0.0,
                    satisfaction=0.0,
                )
            )

    # Mastery — the conscientious or creative practise their craft (study).
    if conscientiousness > 0.5 or creativity > 0.55:
        goals.append(
            Goal(
                id="gain_mastery",
                kind=GoalKind.GAIN_MASTERY,
                priority=round(0.15 + 0.30 * conscientiousness + 0.25 * creativity, 4),
                urgency=0.0,
                satisfaction=0.0,
            )
        )

    # High agreeableness → help the tribe (teach / socialise to others' benefit).
    if agreeableness > 0.55:
        goals.append(
            Goal(
                id="help_tribe",
                kind=GoalKind.HELP_TRIBE,
                priority=round(0.15 + 0.45 * agreeableness, 4),
                urgency=0.0,
                satisfaction=0.0,
            )
        )

    # Status — the reputable and extraverted seek standing.
    if reputation > 1.1 or extraversion > 0.6:
        goals.append(
            Goal(
                id="gain_status",
                kind=GoalKind.GAIN_STATUS,
                priority=round(0.10 + 0.20 * max(0.0, reputation - 1.0) + 0.25 * extraversion, 4),
                urgency=0.0,
                satisfaction=round(min(1.0, max(0.0, (reputation - 1.0))), 4),
            )
        )

    # Revenge — high neuroticism + low karma + a sour mood opens the door.
    # A grievance is urgent (it nags) even when its raw priority is modest.
    if neuroticism > 0.6 and karma < 0.0:
        grievance = -karma  # how wronged the Minion feels
        revenge_p = 0.15 + 0.40 * neuroticism + 0.30 * min(1.0, grievance)
        mood_amp = 1.25 if mood in {"anxious", "despairing"} else 1.0
        goals.append(
            Goal(
                id="seek_revenge",
                kind=GoalKind.SEEK_REVENGE,
                priority=round(revenge_p * mood_amp, 4),
                urgency=round(min(1.0, 0.4 + 0.5 * min(1.0, grievance)), 4),
                satisfaction=0.0,
                meta={"grievance": round(grievance, 4)},
            )
        )

    # Always-present floor goal so the stack is never empty (heuristic: rest).
    if not goals:
        goals.append(Goal("idle_survive", GoalKind.SURVIVE, 0.05,
                          satisfaction=round(min(hunger, thirst, fatigue, health, sanity), 4)))

    return _rank(goals)


# Stable secondary sort so ties are deterministic. Survival kinds first, then a
# fixed declaration order — guarantees identical stacks for identical input.
_KIND_ORDER = {k: i for i, k in enumerate(GoalKind)}


def _rank(goals: list[Goal]) -> list[Goal]:
    """Highest priority first; ties broken by (survival-first, kind order, id)."""
    return sorted(
        goals,
        key=lambda g: (
            -g.priority,
            0 if g.is_survival else 1,
            _KIND_ORDER[g.kind],
            g.id,
        ),
    )


# ── read-back: top goal, conflicts, action bias ──────────────────────────────
def top_goal(goals: Iterable[Goal]) -> Goal | None:
    """The single goal the planner should pursue first (highest priority).

    Assumes `goals` is the ranked output of `derive_goals`, but re-ranks
    defensively so it is correct on any list. Returns None for an empty stack.
    """
    ranked = _rank(list(goals))
    return ranked[0] if ranked else None


# Urgency this high makes a goal an "interrupt" even if it is not top-priority.
_URGENT_THRESHOLD = 0.6


def goal_conflict(goals: Iterable[Goal]) -> tuple[Goal, Goal] | None:
    """Detect the dramatic conflict the spec wants: a high-*priority* goal being
    undercut by a different, highly-*urgent* one.

    The canonical case: a Minion's top goal is SCAN_PATENTS (it is open and
    comfortable) but PROTECT_KIN is urgent because a child is sick. Raw priority
    says "scan", urgency says "protect" — that gap is the story beat.

    Returns (top_priority_goal, urgent_interrupt) when an interrupt exists that
    is *not itself the top goal* and is materially more urgent than it; else
    None. The returned pair is (the goal being pursued, the goal demanding
    attention) so callers can dramatise the trade-off.
    """
    ranked = _rank(list(goals))
    if len(ranked) < 2:
        return None
    leader = ranked[0]
    # Find the most-urgent goal that isn't the leader.
    interrupts = [g for g in ranked if g.id != leader.id]
    interrupts.sort(key=lambda g: (-g.urgency, -g.priority, _KIND_ORDER[g.kind], g.id))
    challenger = interrupts[0]
    if (
        challenger.urgency >= _URGENT_THRESHOLD
        and challenger.urgency > leader.urgency + 0.15
    ):
        return (leader, challenger)
    return None


# Map each motivation onto the planner's existing action vocabulary
# (agents/minion.py::_ACTIONS). A goal contributes its priority to every action
# that serves it; the planner consumes the summed bias.
_GOAL_ACTIONS: dict[GoalKind, tuple[str, ...]] = {
    GoalKind.SURVIVE: ("eat", "drink", "rest", "meditate"),
    GoalKind.EAT: ("eat",),
    GoalKind.DRINK: ("drink",),
    GoalKind.SLEEP: ("rest",),
    GoalKind.REPRODUCE: ("seek_partner", "fork_self"),
    GoalKind.PROTECT_KIN: ("socialise", "teach"),
    GoalKind.GAIN_STATUS: ("propose_invention", "teach", "socialise"),
    GoalKind.SATISFY_CURIOSITY: ("search_patents", "kb_lookup", "study"),
    GoalKind.OBEY_LAW: ("meditate",),
    GoalKind.SERVE_RELIGION: ("meditate",),
    GoalKind.SCAN_PATENTS: ("search_patents",),
    GoalKind.GAIN_MASTERY: ("study", "calculate"),
    GoalKind.HELP_TRIBE: ("teach", "socialise"),
    GoalKind.SEEK_REVENGE: ("socialise",),
    GoalKind.PRESERVE_KNOWLEDGE: ("teach", "kb_lookup"),
    GoalKind.OPEN_GATEWAY: ("propose_invention", "calculate"),
}

# The planner's full action vocabulary (mirrors _ACTIONS' decision-relevant set).
_ACTION_NAMES = (
    "eat", "drink", "rest", "meditate", "socialise", "seek_partner",
    "fork_self", "study", "teach", "search_patents", "propose_invention",
    "kb_lookup", "calculate",
)


def action_bias(goals: Iterable[Goal]) -> dict[str, float]:
    """Project a goal stack onto a bias over the planner's action names.

    Each goal adds its priority to every action that serves it (sanity-restore
    goals route through their `meta["via"]`). The planner can add this bias to
    its own scoring so the chosen action is *explained* by the active goals —
    closing the loop the heuristic short-circuits. Survival pressure therefore
    dominates the bias exactly when needs are low, and personality goals colour
    it otherwise. Always returns every action name (0.0 if unbiased).
    """
    bias: dict[str, float] = {name: 0.0 for name in _ACTION_NAMES}
    for g in goals:
        actions = _GOAL_ACTIONS.get(g.kind, ())
        # Honour an explicit routing hint (e.g. sanity-restore → meditate).
        via = g.meta.get("via")
        if via and via in bias:
            actions = (via,)
        if not actions:
            continue
        # Weight by priority, amplified by urgency so interrupts pull harder.
        weight = g.priority * (1.0 + g.urgency)
        for name in actions:
            if name in bias:
                bias[name] = round(bias[name] + weight, 4)
    return bias
