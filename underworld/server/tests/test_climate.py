"""Big push 1 — deep physics as world state: live climate (#5/#28-30)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import climate, factory


def test_seasons_cycle_with_the_calendar():
    assert climate.season_for(0.0) == "spring"
    assert climate.season_for(0.3) == "summer"
    assert climate.season_for(0.6) == "autumn"
    assert climate.season_for(0.8) == "winter"
    assert climate.season_for(1.0) == "spring"   # wraps each year


def test_temperature_responds_to_season_biome_and_daynight():
    summer = climate.base_temperature("summer", "plains", 0.2, night=False)
    winter = climate.base_temperature("winter", "plains", 0.2, night=False)
    assert summer > winter                                   # seasons matter
    mountain = climate.base_temperature("summer", "mountains", 0.7, night=False)
    desert = climate.base_temperature("summer", "desert", 0.2, night=False)
    assert desert > mountain                                 # biome + elevation matter
    day = climate.base_temperature("spring", "plains", 0.2, night=False)
    night = climate.base_temperature("spring", "plains", 0.2, night=True)
    assert day > night                                       # night is colder


def test_thermal_stress_band():
    assert climate.thermal_stress(18.0) == 0.0               # comfortable
    assert climate.thermal_stress(-10.0) > 0.0               # freezing
    assert climate.thermal_stress(45.0) > 0.0                # scorching


def test_snow_only_when_freezing():
    rng = random.Random(0)
    assert all(climate.pick_weather(30.0, rng) != "snow" for _ in range(50))


@pytest.mark.asyncio
async def test_cold_world_drains_health():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    # E-section seed → mountains (cold). Force deep winter.
    async with session_scope() as s:
        world = await factory.create_world(s, name="Cold", cpc_class="E21B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.sim_year = 0.8        # winter
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.health = 1.0
        await s.flush()
        out = await climate.tick_climate(s, world, random.Random(3))
        assert out["season"] == "winter"
        assert world.temperature < 10.0
        chilled = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert chilled.health < 1.0     # the cold bit


def test_climate_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "Clim", "cpc_class": "E21B", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    body = client.get(f"/worlds/{wid}/climate", headers=headers).json()
    assert body["season"] in climate.SEASONS
    assert "temperature" in body and "weather" in body
