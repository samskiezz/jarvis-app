"""The deepened lived actions must have real, bounded well-being effects."""
import random
import types

from underworld.server.services import activities as A


def _m(**kw):
    base = dict(hunger=0.5, thirst=0.5, fatigue=0.5, sanity=0.5, health=0.5,
                stress=0.5, reputation=1.0)
    base.update(kw)
    return types.SimpleNamespace(**base)


def test_all_new_actions_have_handlers():
    for a in A.NEW_ACTIONS:
        assert a in A._FN


def test_forage_feeds_and_waters():
    m = _m(hunger=0.3, thirst=0.3)
    A.perform("forage", m, random.Random(1))
    assert m.hunger > 0.3 and m.thirst > 0.3


def test_worship_calms():
    m = _m(sanity=0.4, stress=0.6)
    A.perform("worship", m, random.Random(2))
    assert m.sanity > 0.4 and m.stress < 0.6


def test_heal_restores_self_and_neighbour():
    m = _m(health=0.4)
    sick = _m(health=0.1)
    A.perform("heal", m, random.Random(3), neighbours=[_m(health=0.9), sick])
    assert m.health > 0.4
    assert sick.health > 0.1  # the neediest neighbour is the one tended


def test_effects_stay_in_bounds():
    m = _m(sanity=0.99, stress=0.01, health=0.99)
    for a in A.NEW_ACTIONS:
        A.perform(a, _m(**vars(m)), random.Random(4))
    # well-being fields never escape [0,1]
    A.perform("worship", m, random.Random(5))
    assert 0.0 <= m.sanity <= 1.0 and 0.0 <= m.stress <= 1.0


def test_deterministic_given_rng():
    m1, m2 = _m(), _m()
    A.perform("craft", m1, random.Random(9))
    A.perform("craft", m2, random.Random(9))
    assert m1.reputation == m2.reputation
