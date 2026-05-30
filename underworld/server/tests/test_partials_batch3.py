"""Batch 3 partial → done: #71 peer-review replication."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.agents import reviewer
from underworld.server.db.models import Event, GuildKind, Invention, Minion, TaskStatus, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory


@pytest.mark.asyncio
async def test_approved_invention_gets_independently_replicated():
    plan = factory.SeedingPlan(aptitude_pool=24, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Repl", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        inventor = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        inv = Invention(
            world_id=world.id, minion_id=inventor.id, tick=world.tick,
            title="Reproducible heat sink", problem="p", hypothesis="h",
            status=TaskStatus.APPROVED, feasibility_score=0.9,
            inputs={"guild": inventor.guild.value},
        )
        s.add(inv)
        await s.flush()
        assert inv.replicated is False

        n = await reviewer.replicate_pending(s, world, random.Random(1))
        assert n == 1
        assert inv.replicated is True
        assert inv.replicated_by and inv.replicated_by != inventor.id
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "invention:replicated")
        )).scalars().first()
        assert ev is not None and ev.payload["invention"] == inv.id


@pytest.mark.asyncio
async def test_replication_is_idempotent_once_done():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Repl2", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        inventor = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        inv = Invention(world_id=world.id, minion_id=inventor.id, tick=world.tick,
                        title="t", problem="p", status=TaskStatus.APPROVED,
                        feasibility_score=1.0, inputs={"guild": inventor.guild.value})
        s.add(inv)
        await s.flush()
        await reviewer.replicate_pending(s, world, random.Random(2))
        # second pass finds nothing left to replicate
        assert await reviewer.replicate_pending(s, world, random.Random(3)) == 0
