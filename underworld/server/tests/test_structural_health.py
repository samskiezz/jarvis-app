"""Wiring laws into consequences: structural fatigue → collapse (#25/#7)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, structural_health as sh


def test_crack_growth_responds_to_quakes_and_maintenance():
    seismic = sh.crack_growth(tectonic_stress=0.9, infrastructure=0.0)
    cared_for = sh.crack_growth(tectonic_stress=0.0, infrastructure=0.9)
    assert seismic > 0                        # earthquakes grow cracks
    assert cared_for < seismic                # maintenance offsets growth
    assert cared_for < 0                       # a well-maintained, calm world heals


@pytest.mark.asyncio
async def test_unmaintained_structures_collapse():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Ruin", cpc_class="E21B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.structure_fatigue = 0.95
        world.tectonic_stress = 0.8           # active fault
        world.infrastructure = 0.05           # no maintenance
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.health = 1.0
        await s.flush()
        outcome = None
        for _ in range(20):
            outcome = await sh.tick_structures(s, world, random.Random())
            if outcome == "collapse":
                break
        assert outcome == "collapse"
        assert world.structure_fatigue < 1.0          # rebuilt
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "structure:collapse")
        )).scalars().first()
        assert ev is not None


@pytest.mark.asyncio
async def test_maintenance_keeps_fatigue_low():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Kept", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.structure_fatigue = 0.3
        world.tectonic_stress = 0.0           # stable ground
        world.infrastructure = 0.9            # well maintained
        await s.flush()
        for _ in range(10):
            assert await sh.tick_structures(s, world, random.Random()) is None
        assert world.structure_fatigue < 0.3          # cracks were repaired
