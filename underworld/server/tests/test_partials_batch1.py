"""Batch 1 of the spec partials → done:

#93/#94/#95 memory salience, decay, reinforcement + memory→emotion
#117        offspring inherit skills (not memories)
#68/#69     mastery milestone + effect
#70         community knowledge tracking in the snapshot
"""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.agents import minion as minion_agent
from underworld.server.db.models import Event, Memory, Minion, PopulationSnapshot, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, lifecycle, mastery
from underworld.server.services.simulation import advance_world


# ── memory dynamics ──────────────────────────────────────────────────────────
def test_memory_emotion_delta_sign():
    grim = [Memory(minion_id="x", tick=1, kind="death", content="...", importance=0.9)]
    glad = [Memory(minion_id="x", tick=1, kind="calculation", content="...", importance=0.9)]
    assert minion_agent._memory_emotion_delta(grim) < 0
    assert minion_agent._memory_emotion_delta(glad) > 0


@pytest.mark.asyncio
async def test_recall_reinforces_salient_and_decays_rest():
    plan = factory.SeedingPlan(aptitude_pool=10, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Mem", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        # one very salient memory + several trivial ones
        s.add(Memory(minion_id=m.id, tick=world.tick, kind="observation",
                     content="A mastery moment", importance=0.9))
        for i in range(8):
            s.add(Memory(minion_id=m.id, tick=world.tick, kind="thought",
                         content=f"noise {i}", importance=0.2))
        await s.flush()
        salient = await minion_agent._recall_salient(s, m.id, world.tick, limit=1)
        assert salient and max(x.importance for x in salient) > 0.9  # reinforced past 0.9
        # with only the top-1 kept, every trivial memory decayed below 0.2
        noise = (await s.execute(
            select(Memory).where(Memory.minion_id == m.id, Memory.kind == "thought")
        )).scalars().all()
        assert all(x.importance < 0.2 for x in noise)


# ── skill inheritance ────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_offspring_inherit_parent_skills():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Inherit", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        pair = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True)).limit(2)
        )).scalars().all()
        a, b = pair[0], pair[1]
        a.born_tick = b.born_tick = world.tick - 30  # old enough to breed
        # give parent A a strong, distinctive skill
        s.add(Skill(minion_id=a.id, name="warp_theory", level=8.0))
        await s.flush()
        child = await lifecycle.breed_pair(s, world=world, parent_a=a, parent_b=b, rng=random.Random(1))
        child_skill = (await s.execute(
            select(Skill).where(Skill.minion_id == child.id, Skill.name == "warp_theory")
        )).scalars().first()
        assert child_skill is not None and child_skill.level == pytest.approx(2.0)  # 0.25 * 8.0
        # memories are NOT inherited
        mem = (await s.execute(select(Memory).where(Memory.minion_id == child.id))).scalars().all()
        assert all(x.kind != "thought" for x in mem)


# ── mastery ──────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_mastery_event_fires_on_threshold_cross():
    plan = factory.SeedingPlan(aptitude_pool=10, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Mastery", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        s.add(Skill(minion_id=m.id, name="optics", level=5.95, last_practiced_tick=0))
        await s.flush()
        rep_before = m.reputation
        await minion_agent._do_study(s, m, world, {"skill": "optics"})  # pushes past 6.0
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "minion:mastery")
        )).scalars().first()
        assert ev is not None and ev.payload["skill"] == "optics"
        assert m.reputation > rep_before
        assert "optics" in await mastery.list_masteries(s, m.id)


# ── community knowledge in snapshot ──────────────────────────────────────────
@pytest.mark.asyncio
async def test_snapshot_records_total_knowledge():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Know", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        await advance_world(s, world, ticks=1)
    async with session_scope() as s:
        snap = (await s.execute(
            select(PopulationSnapshot).where(PopulationSnapshot.world_id == world.id)
        )).scalars().first()
        assert snap.total_knowledge > 0  # seeded minions carry starting skills
        assert snap.masters >= 0
