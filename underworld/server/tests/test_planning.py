"""Architectural AI: tree-of-thought + Monte-Carlo planning (#126)."""

from __future__ import annotations

import random
import types

from underworld.server.services import planning


def _m(**kw):
    base = dict(hunger=0.8, thirst=0.8, fatigue=0.8, sanity=0.8, stress=0.2)
    base.update(kw)
    return types.SimpleNamespace(**base)


def test_planner_addresses_the_pressing_need():
    starving = _m(hunger=0.05)
    choice = planning.plan_action(starving, ["eat", "study", "rest", "drink"], rng=random.Random(0))
    assert choice == "eat"                      # the planner prioritises survival

    parched = _m(thirst=0.05)
    assert planning.plan_action(parched, ["eat", "drink", "study"], rng=random.Random(0)) == "drink"

    weary = _m(fatigue=0.05)
    assert planning.plan_action(weary, ["study", "rest", "calculate"], rng=random.Random(0)) == "rest"


def test_well_provided_minion_does_something_productive():
    comfy = _m(hunger=0.95, thirst=0.95, fatigue=0.95, sanity=0.95, stress=0.1)
    choice = planning.plan_action(comfy, ["study", "calculate", "rest"], rng=random.Random(1))
    assert choice in {"study", "calculate"}     # no need to eat/rest → it works


def test_beliefs_bias_the_choice():
    comfy = _m(hunger=0.9, thirst=0.9, fatigue=0.9, sanity=0.9, stress=0.1)
    # with study believed useless and calculate believed great, prefer calculate
    beliefs = {"study": 0.1, "calculate": 0.95}
    choice = planning.plan_action(comfy, ["study", "calculate"], beliefs, rng=random.Random(2))
    assert choice == "calculate"


def test_empty_candidates_is_safe():
    assert planning.plan_action(_m(), [], rng=random.Random(0)) is None
