"""Batch 6 partials → done:

#107/108/110/111  appraisal-based mood: morale + purpose drive flow/inspiration
                  vs burnout/despair (not just raw needs)
#130/131/132      sense of purpose from mission work; fulfilment vs crisis
#67               guilds compete for prestige
#122              earned nicknames
"""

from __future__ import annotations

import types

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, MoodKind, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, lifecycle
from underworld.server.services.simulation import advance_world


def _m(**kw):
    base = dict(hunger=0.8, thirst=0.8, fatigue=0.8, sanity=0.8, health=0.9,
               neuroticism=0.3, conscientiousness=0.3, creativity=0.5, openness=0.5,
               morale=0.5, purpose=0.5)
    base.update(kw)
    return types.SimpleNamespace(**base)


# ── #107/110/111 appraisal mood ──────────────────────────────────────────────
def test_stress_with_high_morale_is_breakthrough_not_burnout():
    low_needs = dict(hunger=0.3, thirst=0.3, fatigue=0.3, sanity=0.3, health=0.3,
                     neuroticism=1.0, conscientiousness=0.1)
    inspired, s1 = lifecycle.derive_mood(_m(creativity=0.8, morale=0.85, **low_needs))
    burnt, s2 = lifecycle.derive_mood(_m(creativity=0.8, morale=0.1, **low_needs))
    assert s1 > 0.7 and s2 > 0.7
    assert inspired == MoodKind.INSPIRED   # high morale → breakthrough
    assert burnt == MoodKind.ANXIOUS       # low morale → burnout


def test_purpose_vacuum_is_an_existential_crisis():
    # needs are fine, but no sense of purpose → despair (doc II.132)
    mood, _ = lifecycle.derive_mood(_m(purpose=0.1, morale=0.5))
    assert mood == MoodKind.DESPAIRING


# ── #130/131/132 purpose appraisal ───────────────────────────────────────────
def test_mission_work_builds_purpose_and_fulfilment():
    m = _m(purpose=0.5, morale=0.5, sanity=0.8)
    for _ in range(20):
        lifecycle.appraise(m, mission=True, idle=False, mood_signal=0.0)
    assert m.purpose > 0.7          # mission work fulfils
    assert m.sanity > 0.8           # fulfilment lifts sanity

    idler = _m(purpose=0.3, morale=0.5, sanity=0.8)
    for _ in range(10):
        lifecycle.appraise(idler, mission=False, idle=True, mood_signal=0.0)
    assert idler.purpose < 0.3      # idling erodes purpose
    assert idler.sanity < 0.8       # purpose vacuum drains sanity


# ── #122 nicknames ───────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_some_minions_earn_nicknames():
    plan = factory.SeedingPlan(aptitude_pool=30, patent_guild_seats=3, safety_guild_seats=3)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Nick", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        nicks = [m.nickname for m in (await s.execute(
            select(Minion).where(Minion.world_id == world.id)
        )).scalars().all() if m.nickname]
        assert nicks  # at least one charismatic Minion earned a nickname


# ── #67 guild competition ────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_guild_standings_and_competition_event():
    plan = factory.SeedingPlan(aptitude_pool=24, patent_guild_seats=3, safety_guild_seats=3)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Compete", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        standings = await lifecycle.guild_standings(s, world.id)
        assert len(standings) >= 2
        scores = [sc for _g, sc in standings]
        assert scores == sorted(scores, reverse=True)   # ranked best-first
        await advance_world(s, world, ticks=1)
    async with session_scope() as s:
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "guild:standings")
        )).scalars().first()
        assert ev is not None and "leader" in ev.payload
