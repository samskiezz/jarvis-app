"""Deep physics: agriculture as a climate-driven field (#13)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import agriculture, factory


def test_growing_factor_follows_climate():
    summer_rain = agriculture.growing_factor("summer", 22.0, "rain")
    winter_snow = agriculture.growing_factor("winter", -5.0, "snow")
    assert summer_rain > winter_snow
    assert winter_snow == 0.0                       # nothing grows in a frozen winter
    # heat beyond the optimum band reduces growth
    assert agriculture.growing_factor("summer", 22.0, "clear") > \
        agriculture.growing_factor("summer", 40.0, "clear")


@pytest.mark.asyncio
async def test_good_harvest_feeds_people():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Farm", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.season, world.temperature, world.weather = "summer", 22.0, "rain"
        world.soil_fertility = 0.9
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.hunger = 0.5
        await s.flush()
        out = await agriculture.tick_agriculture(s, world)
        assert out["crop_yield"] > 0.4
        fed = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert fed.hunger > 0.5                      # the harvest fed them


@pytest.mark.asyncio
async def test_crop_failure_on_exhausted_soil_starves():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Dust", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # prime growing weather, but the soil is exhausted → the harvest fails
        world.season, world.temperature, world.weather = "summer", 22.0, "clear"
        world.soil_fertility = 0.1
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.hunger = 0.5
        await s.flush()
        out = await agriculture.tick_agriculture(s, world)
        assert out["growing_factor"] > 0.3 and out["crop_yield"] < 0.15
        hungry = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert hungry.hunger < 0.5                   # crop failure bit


@pytest.mark.asyncio
async def test_continuous_farming_depletes_then_recovers():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Soil", cpc_class="A01B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.season, world.temperature, world.weather = "summer", 22.0, "clear"
        world.soil_fertility = 0.95
        await s.flush()
        # heavy growing draws fertility down from a high start
        await agriculture.tick_agriculture(s, world)
        assert world.soil_fertility < 0.95
        # a depleted field recovers when growth is low (winter fallow)
        world.soil_fertility = 0.1
        world.season, world.temperature = "winter", -2.0
        await agriculture.tick_agriculture(s, world)
        assert world.soil_fertility > 0.1


def test_agriculture_in_environment_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "AgriAPI", "cpc_class": "A01B", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    env = client.get(f"/worlds/{wid}/environment", headers=headers).json()
    assert "soil_fertility" in env and "crop_yield" in env
