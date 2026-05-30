"""Deep physics: fluids / hydrology — the water cycle (#6/#29)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, hydrology


@pytest.mark.asyncio
async def test_rain_recharges_and_heat_evaporates():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Water", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.water_table, world.weather, world.temperature = 0.5, "rain", 15.0
        await hydrology.tick_hydrology(s, world)
        rained = world.water_table
        world.water_table, world.weather, world.temperature = 0.5, "clear", 40.0
        await hydrology.tick_hydrology(s, world)
        assert rained > 0.5 > world.water_table        # rain up, hot+clear down


@pytest.mark.asyncio
async def test_drought_makes_minions_thirsty():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Drought", cpc_class="C07D", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.water_table, world.weather, world.temperature = 0.05, "clear", 35.0
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.thirst = 0.8
        await s.flush()
        out = await hydrology.tick_hydrology(s, world)
        assert out["state"] == "drought"
        thirsty = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert thirsty.thirst < 0.8


@pytest.mark.asyncio
async def test_flood_damages_when_storm_tops_a_full_table():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Flood", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.water_table, world.weather, world.temperature = 0.95, "storm", 15.0
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.health = 1.0
        await s.flush()
        out = await hydrology.tick_hydrology(s, world)
        assert out["state"] == "flood"
        hurt = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert hurt.health < 1.0


def test_water_table_in_environment_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "HydroAPI", "cpc_class": "A01B", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    env = client.get(f"/worlds/{wid}/environment", headers=headers).json()
    assert "water_table" in env
