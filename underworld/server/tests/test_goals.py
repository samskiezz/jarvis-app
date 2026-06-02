"""Tests for the Goal Stack — Layer 5 of the Minion Cognitive Stack (#2)."""
from underworld.server.services.goals import (
    Goal,
    GoalKind,
    action_bias,
    derive_goals,
    goal_conflict,
    top_goal,
)


# A comfortable, balanced Minion: all needs sated, neutral personality.
_SATED = {
    "hunger": 1.0,
    "thirst": 1.0,
    "fatigue": 1.0,
    "health": 1.0,
    "sanity": 1.0,
    "openness": 0.5,
    "conscientiousness": 0.5,
    "extraversion": 0.5,
    "agreeableness": 0.5,
    "neuroticism": 0.5,
    "intelligence": 0.5,
    "creativity": 0.5,
    "age": 30,
    "reputation": 1.0,
    "karma": 0.0,
}


def _with(**overrides) -> dict:
    state = dict(_SATED)
    state.update(overrides)
    return state


# ── Survival dominance ────────────────────────────────────────────────────────
def test_low_hunger_makes_eat_the_top_goal():
    goals = derive_goals(_with(hunger=0.1))
    leader = top_goal(goals)
    assert leader is not None
    # SURVIVE umbrella or EAT must lead; either way the planner eats.
    assert leader.kind in (GoalKind.SURVIVE, GoalKind.EAT)
    eat = next(g for g in goals if g.kind == GoalKind.EAT)
    assert eat.priority > 1.0
    assert eat.parent == "survive"


def test_survival_outranks_personality_drives():
    # A starving, highly-open Minion: curiosity exists but must not win.
    goals = derive_goals(_with(hunger=0.05, openness=0.95))
    leader = top_goal(goals)
    assert leader.is_survival
    curiosity = next(g for g in goals if g.kind == GoalKind.SATISFY_CURIOSITY)
    assert leader.priority > curiosity.priority


def test_thirst_edges_above_hunger_at_equal_deficit():
    goals = derive_goals(_with(hunger=0.1, thirst=0.1))
    eat = next(g for g in goals if g.kind == GoalKind.EAT)
    drink = next(g for g in goals if g.kind == GoalKind.DRINK)
    assert drink.priority > eat.priority


def test_sated_minion_has_no_survival_pressure():
    goals = derive_goals(_SATED)
    assert not any(
        g.kind in (GoalKind.EAT, GoalKind.DRINK, GoalKind.SLEEP)
        for g in goals
    )


# ── Personality-driven higher goals ───────────────────────────────────────────
def test_high_openness_yields_curiosity_and_patent_scan():
    goals = derive_goals(_with(openness=0.9))
    kinds = {g.kind for g in goals}
    assert GoalKind.SATISFY_CURIOSITY in kinds
    assert GoalKind.SCAN_PATENTS in kinds


def test_high_conscientiousness_yields_preserve_knowledge():
    goals = derive_goals(_with(openness=0.2, conscientiousness=0.9))
    kinds = {g.kind for g in goals}
    assert GoalKind.PRESERVE_KNOWLEDGE in kinds
    assert GoalKind.SCAN_PATENTS in kinds  # diligent scanning even w/o openness


def test_high_agreeableness_yields_help_tribe():
    goals = derive_goals(_with(agreeableness=0.9))
    assert any(g.kind == GoalKind.HELP_TRIBE for g in goals)


def test_neurotic_low_karma_can_seek_revenge():
    goals = derive_goals(_with(neuroticism=0.85, karma=-0.6, mood="despairing"))
    assert any(g.kind == GoalKind.SEEK_REVENGE for g in goals)
    # A contented, high-karma Minion does not.
    calm = derive_goals(_with(neuroticism=0.85, karma=0.4))
    assert not any(g.kind == GoalKind.SEEK_REVENGE for g in calm)


# ── Goal conflict detection ───────────────────────────────────────────────────
def test_urgent_grievance_conflicts_with_calm_top_goal():
    # A curious Minion's top *priority* goal is SATISFY_CURIOSITY, but a fresh
    # grievance makes SEEK_REVENGE *urgent* — raw want says "explore", urgency
    # says "settle the score". That gap is the spec's dramatic conflict (#2).
    goals = derive_goals(_with(
        openness=0.95, conscientiousness=0.95, creativity=0.95,
        agreeableness=0.2, extraversion=0.2,
        neuroticism=0.62, karma=-0.45, mood="content",
    ))
    conflict = goal_conflict(goals)
    assert conflict is not None
    leader, challenger = conflict
    assert challenger.kind == GoalKind.SEEK_REVENGE
    assert challenger.urgency >= 0.6
    assert challenger.urgency > leader.urgency
    # The leader is the higher-*priority* goal being undercut.
    assert leader.priority >= challenger.priority


def test_sick_child_becomes_the_top_urgent_goal():
    # A sick child is so pressing that PROTECT_KIN dominates outright (it leads
    # on priority) rather than merely interrupting — there is no goal above it.
    goals = derive_goals(_with(openness=0.95, agreeableness=0.5, child_sick=True))
    leader = top_goal(goals)
    assert leader.kind == GoalKind.PROTECT_KIN
    assert leader.urgency >= 0.6


def test_no_conflict_when_nothing_urgent():
    goals = derive_goals(_with(openness=0.9, agreeableness=0.9))
    assert goal_conflict(goals) is None


# ── action_bias ───────────────────────────────────────────────────────────────
def test_action_bias_routes_hunger_to_eat():
    bias = action_bias(derive_goals(_with(hunger=0.05)))
    assert bias["eat"] > 0.0
    assert bias["eat"] >= max(bias["study"], bias["teach"], bias["search_patents"])


def test_action_bias_routes_curiosity_to_research():
    bias = action_bias(derive_goals(_with(openness=0.95)))
    assert bias["search_patents"] > 0.0
    assert bias["eat"] == 0.0  # sated → no survival bias


def test_action_bias_always_lists_every_action():
    bias = action_bias(derive_goals(_SATED))
    expected = {
        "eat", "drink", "rest", "meditate", "socialise", "seek_partner",
        "fork_self", "study", "teach", "search_patents", "propose_invention",
        "kb_lookup", "calculate",
    }
    assert set(bias) == expected


def test_protect_kin_urgency_amplifies_its_action_bias():
    sick = action_bias(derive_goals(_with(agreeableness=0.9, child_sick=True)))
    well = action_bias(derive_goals(_with(agreeableness=0.9)))
    # PROTECT_KIN serves socialise/teach; the urgent interrupt pulls harder.
    assert sick["socialise"] > well["socialise"]


# ── Determinism & structure ───────────────────────────────────────────────────
def test_derive_goals_is_deterministic():
    state = _with(openness=0.9, agreeableness=0.8, hunger=0.2, neuroticism=0.7,
                  karma=-0.5, child_sick=True)
    a = derive_goals(state)
    b = derive_goals(state)
    assert [(g.kind, g.priority, g.urgency) for g in a] == \
           [(g.kind, g.priority, g.urgency) for g in b]


def test_stack_is_ranked_highest_priority_first():
    goals = derive_goals(_with(hunger=0.1, openness=0.9))
    priorities = [g.priority for g in goals]
    assert priorities == sorted(priorities, reverse=True)


def test_goal_is_frozen():
    g = Goal(id="x", kind=GoalKind.EAT, priority=1.0)
    try:
        g.priority = 2.0  # type: ignore[misc]
    except Exception:
        return
    raise AssertionError("Goal should be frozen / immutable")


def test_empty_or_sated_stack_never_empty():
    goals = derive_goals(_SATED)
    assert top_goal(goals) is not None  # floor goal keeps the stack non-empty


def test_top_goal_of_empty_list_is_none():
    assert top_goal([]) is None
