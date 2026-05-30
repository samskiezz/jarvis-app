"""Closing partial items: information loss / atrophy (#64) + libraries (#65)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Discovery, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, knowledge_decay


@pytest.mark.asyncio
async def test_unpracticed_skills_atrophy():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Atrophy", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.tick = 100
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        fresh = Skill(minion_id=m.id, name="fresh", level=5.0, last_practiced_tick=99)
        stale = Skill(minion_id=m.id, name="stale", level=5.0, last_practiced_tick=10)
        s.add_all([fresh, stale])
        await s.flush()
        faded = await knowledge_decay.tick_atrophy(s, world)
        assert faded >= 1
        assert stale.level < 5.0     # long-unused skill faded
        assert fresh.level == 5.0    # recently practiced skill is intact


@pytest.mark.asyncio
async def test_library_slows_forgetting():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)

    async def make_world(name: str, with_library: bool) -> float:
        async with session_scope() as s:
            world = await factory.create_world(s, name=name, cpc_class="H02J", plan=plan)
        async with session_scope() as s:
            world = await s.get(World, world.id)
            world.tick = 100
            people = (await s.execute(
                select(Minion).where(Minion.world_id == world.id)
            )).scalars().all()
            if with_library:
                s.add(Discovery(world_id=world.id, tech="writing", tick=0))
                for i, mm in enumerate(people):     # lots of knowledge → a real library
                    s.add(Skill(minion_id=mm.id, name=f"k{i}", level=9.0, last_practiced_tick=99))
            target = people[0]
            sk = Skill(minion_id=target.id, name="craft", level=5.0, last_practiced_tick=10)
            s.add(sk)
            await s.flush()
            assert await knowledge_decay.has_library(s, world) is with_library
            await knowledge_decay.tick_atrophy(s, world)
            return sk.level

    no_lib = await make_world("NoLib", False)
    lib = await make_world("Lib", True)
    assert lib > no_lib   # the library preserved more of the skill
