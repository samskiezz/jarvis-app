"""Closing partial item: scientific fraud + reputation damage (#72)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.agents import reviewer
from underworld.server.db.models import Event, GuildKind, Invention, Minion, TaskStatus, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory


async def _approved_invention(s, world, inventor, *, fabricated: bool, feasibility: float):
    inv = Invention(
        world_id=world.id, minion_id=inventor.id, tick=world.tick,
        title="claim", problem="p", status=TaskStatus.APPROVED,
        feasibility_score=feasibility,
        inputs={"guild": inventor.guild.value, "fabricated": fabricated},
    )
    s.add(inv)
    await s.flush()
    return inv


@pytest.mark.asyncio
async def test_failed_replication_of_fabricated_work_damages_reputation():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Fraud", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        inventor = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        inventor.reputation = 2.0
        # low feasibility (p = 0.5) so replication fails under this rng seed
        inv = await _approved_invention(s, world, inventor, fabricated=True, feasibility=0.0)
        await reviewer.replicate_pending(s, world, random.Random(0))  # first draw 0.84 > 0.5 → fails
        assert inv.replicated is False
        assert inventor.reputation < 2.0                      # fraud cost the inventor
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "fraud:detected")
        )).scalars().first()
        assert ev is not None and ev.payload["invention"] == inv.id


@pytest.mark.asyncio
async def test_honest_failed_replication_is_not_fraud():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Honest", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        inventor = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        inventor.reputation = 2.0
        await _approved_invention(s, world, inventor, fabricated=False, feasibility=0.0)
        await reviewer.replicate_pending(s, world, random.Random(0))  # also fails to replicate
        assert inventor.reputation == 2.0                    # honest failure → no penalty
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "fraud:detected")
        )).scalars().first()
        assert ev is None
