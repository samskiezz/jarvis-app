"""Architectural AI: per-minion neural network (#101)."""

from __future__ import annotations

import types

import pytest
from sqlalchemy import select

from underworld.server.db.models import Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, neural


def _m(dna="A" * 900, **kw):
    base = dict(dna=dna, hunger=0.7, thirst=0.7, fatigue=0.7, sanity=0.7, stress=0.3,
                morale=0.5, purpose=0.5, openness=0.5, intelligence=0.5, creativity=0.5,
                brain={})
    base.update(kw)
    return types.SimpleNamespace(**base)


def test_brain_is_deterministic_per_dna():
    a1 = neural.policy(_m(dna="ACGT" * 200))
    a2 = neural.policy(_m(dna="ACGT" * 200))
    b = neural.policy(_m(dna="TTTT" * 200))
    assert a1 == a2                      # same DNA + state → same innate policy
    assert a1 != b                       # different DNA → different disposition


def test_learning_shifts_preference_toward_reward():
    m = _m()
    before = neural.policy(m)["calculate"]
    for _ in range(10):
        neural.learn(m, "calculate", reward=1.0)
    after = neural.policy(m)["calculate"]
    assert after > before                # rewarding an action raises its score
    # and punishing one lowers it
    m2 = _m()
    base = neural.policy(m2)["rest"]
    for _ in range(10):
        neural.learn(m2, "rest", reward=-1.0)
    assert neural.policy(m2)["rest"] < base


def test_choose_returns_a_candidate():
    m = _m()
    pick = neural.choose(m, ["study", "calculate", "meditate"])
    assert pick in {"study", "calculate", "meditate"}
    assert neural.choose(m, []) is None


@pytest.mark.asyncio
async def test_brains_train_during_simulation():
    from underworld.server.services.simulation import advance_world
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Brains", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        await advance_world(s, world, ticks=4)
    async with session_scope() as s:
        trained = [m for m in (await s.execute(
            select(Minion).where(Minion.world_id == world.id)
        )).scalars().all() if (m.brain or {}).get("b2")]
        assert trained, "some minions should have trained their neural policy"


def test_brain_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "BrainAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    mid = client.get(f"/worlds/{wid}/minions", headers=headers).json()[0]["id"]
    brain = client.get(f"/minions/{mid}/brain", headers=headers).json()
    assert brain["dispositions"] and {"action", "score"} <= set(brain["dispositions"][0])
