"""Wiring laws into consequences: Joule-heating grid fires (#42)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, grid


def test_load_and_capacity_relations():
    assert grid.grid_load(500, 50) > grid.grid_load(50, 5)        # more people/industry → more load
    assert grid.grid_capacity(0.9) > grid.grid_capacity(0.1)      # planned grid carries more
    assert grid.is_overloaded(2.0, 1.0) and not grid.is_overloaded(0.5, 1.0)


@pytest.mark.asyncio
async def test_underbuilt_electric_grid_catches_fire():
    plan = factory.SeedingPlan(aptitude_pool=30, patent_guild_seats=3, safety_guild_seats=3)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Grid", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.era = "electric"
        world.infrastructure = 0.05            # badly under-built grid
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.health = 1.0
        await s.flush()
        fired = False
        for _ in range(80):
            if await grid.tick_grid(s, world, random.Random()) == "fire":
                fired = True
                break
        assert fired
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "fire:electrical")
        )).scalars().first()
        assert ev is not None
        assert world.infrastructure < 0.05 + 1e-9    # the fire set infrastructure back


@pytest.mark.asyncio
async def test_no_grid_fire_before_electrification():
    plan = factory.SeedingPlan(aptitude_pool=20, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Stone", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.era = "stone"
        await s.flush()
        for _ in range(50):
            assert await grid.tick_grid(s, world, random.Random()) is None
