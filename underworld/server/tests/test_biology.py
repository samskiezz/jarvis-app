"""Deep physics: multi-species biology + evolution (#12/#34)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Species, World
from underworld.server.db.session import session_scope
from underworld.server.services import biology, factory


def test_climate_optimum_and_fitness():
    cold_opt = biology.climate_optimum(-10.0)
    warm_opt = biology.climate_optimum(35.0)
    assert cold_opt > warm_opt                          # cold climate favours cold tolerance
    assert biology.fitness(0.9, cold_opt) > biology.fitness(0.1, cold_opt)


@pytest.mark.asyncio
async def test_species_seed_and_adapt_toward_climate():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Bio", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.temperature = -10.0     # a frigid world
        await biology.ensure_seeded(s, world)
        await s.flush()
        # grab a warm-adapted species and watch its trait climb toward cold tolerance
        warm = (await s.execute(
            select(Species).where(Species.world_id == world.id, Species.name == "grass")
        )).scalars().first()
        before = warm.cold_tolerance
        for _ in range(10):
            await biology.tick_biology(s, world, random.Random(1))
        await s.refresh(warm)
        assert warm.cold_tolerance > before     # selection pushed it colder-adapted


@pytest.mark.asyncio
async def test_maladapted_species_can_go_extinct():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Extinct", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.temperature = 38.0      # scorching → cold-lovers die off
        await biology.ensure_seeded(s, world)
        cold_lover = (await s.execute(
            select(Species).where(Species.world_id == world.id, Species.name == "moss")
        )).scalars().first()
        cold_lover.cold_tolerance = 0.95
        cold_lover.population = 0.08
        await s.flush()
        for _ in range(20):
            await biology.tick_biology(s, world, random.Random(2))
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "species:extinct")
        )).scalars().first()
        assert ev is not None


def test_species_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "BioAPI", "cpc_class": "A01B", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    species = client.get(f"/worlds/{wid}/species", headers=headers).json()
    assert isinstance(species, list) and len(species) >= 1
    assert {"name", "kind", "population", "cold_tolerance"} <= set(species[0])
