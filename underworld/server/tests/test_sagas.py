"""Tests for the procedural saga engine."""
from underworld.server.services import sagas as sg


def test_archetypes_have_benefits_and_beats():
    assert len(sg.ARCHETYPES) >= 10
    for a in sg.ARCHETYPES:
        assert len(a.beats) == 3                     # call -> trial -> payoff
        assert a.learn_multiplier >= 1.0
        assert a.goal


def test_instantiate_is_unique_and_named():
    s1 = sg.instantiate("prodigy", cast_names={"hero": "Ada Volt"}, cast_ids={"hero": "m1"},
                        guild="physics", epoch="Steam Engine", tech="Steam", tick=5)
    s2 = sg.instantiate("prodigy", cast_names={"hero": "Bo Quark"}, cast_ids={"hero": "m2"},
                        guild="physics", epoch="Steam Engine", tech="Steam", tick=5)
    assert "Ada Volt" in s1.title and "Bo Quark" in s2.title
    assert s1.id != s2.id                            # distinct instances


def test_saga_advances_through_acts_and_resolves():
    s = sg.instantiate("mentorship", cast_names={"hero": "H", "mentor": "M"},
                       cast_ids={"hero": "h", "mentor": "mm"}, guild="energy",
                       epoch="Electricity", tech="Electricity", tick=0)
    assert s.act == 0 and not s.resolved
    sg.advance(s); assert s.act == 1
    sg.advance(s); assert s.act == 2
    sg.advance(s); assert s.resolved is True


def test_benefits_help_development():
    s = sg.instantiate("mentorship", cast_names={"hero": "H", "mentor": "M"},
                       cast_ids={"hero": "h", "mentor": "mm"}, guild="energy",
                       epoch="Electricity", tech="Electricity", tick=0)
    sg.advance(s)                                    # climax act
    b = sg.benefits(s)
    assert b["learn_multiplier"] > 1.0              # apprentices learn faster
    assert b["mentor_id"] == "mm" and b["apprentice_id"] == "h"
    assert b["purpose"]


def test_choose_archetype_reflects_world_moment():
    assert sg.choose_archetype(has_master=False, in_hardship=True, crossed_epoch=False,
                               has_rival=False, made_discovery=False, seed=0) == "plague_trial"
    assert sg.choose_archetype(has_master=False, in_hardship=False, crossed_epoch=True,
                               has_rival=False, made_discovery=False, seed=0) == "first_of_kind"


def test_current_beat_fills_names():
    s = sg.instantiate("rivalry", cast_names={"hero": "Ada", "rival": "Bo"},
                       cast_ids={"hero": "a", "rival": "b"}, guild="maths",
                       epoch="Calculus", tech="Calculus", tick=0)
    beat = sg.current_beat(s, names={"hero": "Ada", "rival": "Bo"}, guild="maths",
                           epoch="Calculus", tech="Calculus")
    assert "Ada" in beat and "Bo" in beat
