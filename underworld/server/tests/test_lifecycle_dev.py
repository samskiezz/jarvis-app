"""Closing genuinely-partial items: childhood stages (#118), parenting (#119),
circadian rhythm (#147)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.agents import minion as minion_agent
from underworld.server.db.models import GuildKind, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, lifecycle


# ── #118 developmental stages ────────────────────────────────────────────────
def test_life_stages_and_capability():
    assert lifecycle.life_stage(1) == "infant"
    assert lifecycle.life_stage(5) == "child"
    assert lifecycle.life_stage(10) == "adolescent"
    assert lifecycle.life_stage(40) == "adult"
    assert lifecycle.capability(1) == 0.0          # infants contribute nothing
    assert lifecycle.capability(5) < lifecycle.capability(10) < lifecycle.capability(40)
    assert lifecycle.capability(40) == 1.0


# ── #147 circadian ───────────────────────────────────────────────────────────
def test_circadian_day_vs_night():
    assert lifecycle.is_night(0) is False          # dawn
    assert lifecycle.is_night(7) is True           # late in the day cycle
    assert lifecycle.circadian_factor(0) > lifecycle.circadian_factor(7)


def test_growth_multiplier_combines_factors():
    adult_day = Minion(world_id="w", name="a", guild=GuildKind.PHYSICS, dna="d",
                       born_tick=-30, upbringing=1.0)
    infant = Minion(world_id="w", name="b", guild=GuildKind.PHYSICS, dna="d",
                    born_tick=0, upbringing=1.0)
    assert lifecycle.growth_multiplier(adult_day, 0) == 1.0     # adult, daytime
    assert lifecycle.growth_multiplier(infant, 0) == 0.0        # infant learns nothing
    # same adult at night learns slower
    assert lifecycle.growth_multiplier(adult_day, 7) < lifecycle.growth_multiplier(adult_day, 0)


# ── #119 parenting quality ───────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_good_parents_raise_faster_learners():
    plan = factory.SeedingPlan(aptitude_pool=24, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Parent", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        ms = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True)).limit(4)
        )).scalars().all()
        a, b, c, d = ms[0], ms[1], ms[2], ms[3]
        for m in (a, b, c, d):
            m.born_tick = world.tick - 30
        a.reputation, b.reputation, a.stress, b.stress = 4.5, 4.5, 0.1, 0.1   # great parents
        c.reputation, d.reputation, c.stress, d.stress = 0.6, 0.6, 0.9, 0.9   # poor parents
        await s.flush()
        gifted = await lifecycle.breed_pair(s, world=world, parent_a=a, parent_b=b, rng=random.Random(1))
        neglected = await lifecycle.breed_pair(s, world=world, parent_a=c, parent_b=d, rng=random.Random(2))
        assert gifted.upbringing > neglected.upbringing


@pytest.mark.asyncio
async def test_child_learns_less_than_adult_from_studying():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Study", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        adult, child = (await s.execute(
            select(Minion).where(Minion.world_id == world.id).limit(2)
        )).scalars().all()
        adult.born_tick = world.tick - 30      # adult
        child.born_tick = world.tick - 5       # a child
        for m in (adult, child):
            s.add(Skill(minion_id=m.id, name=m.guild.value, level=2.0, last_practiced_tick=0))
        await s.flush()
        await minion_agent._do_study(s, adult, world, {"skill": adult.guild.value})
        await minion_agent._do_study(s, child, world, {"skill": child.guild.value})
        adult_skill = (await s.execute(
            select(Skill).where(Skill.minion_id == adult.id, Skill.name == adult.guild.value)
        )).scalars().first()
        child_skill = (await s.execute(
            select(Skill).where(Skill.minion_id == child.id, Skill.name == child.guild.value)
        )).scalars().first()
        assert (adult_skill.level - 2.0) > (child_skill.level - 2.0) > 0
