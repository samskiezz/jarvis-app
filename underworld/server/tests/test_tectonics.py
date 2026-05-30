"""Deep physics: plate tectonics + earthquakes (#28)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, tectonics


def test_active_geology_builds_stress_faster():
    # H/E sections are mountainous (high elevation bias) → more active than plains (A)
    from underworld.server.world.seed import derive_seed
    mountain = tectonics.tectonic_activity(derive_seed("E21B").elevation_bias)
    plains = tectonics.tectonic_activity(derive_seed("A01B").elevation_bias)
    assert mountain > plains


@pytest.mark.asyncio
async def test_stress_accumulates_on_quiet_ticks():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Stress", cpc_class="E21B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.tectonic_stress = 0.0
        # an rng that won't trigger a quake (no stress yet anyway)
        await tectonics.tick_tectonics(s, world, random.Random(0))
        assert world.tectonic_stress > 0.0


@pytest.mark.asyncio
async def test_earthquake_strikes_and_damages():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Quake", cpc_class="E21B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.tectonic_stress = 0.99      # primed to slip
        world.scanner_progress = 50
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.health = 1.0
        await s.flush()
        # run until the (stochastic) quake fires — certain within many tries
        mag = None
        for _ in range(80):
            mag = await tectonics.tick_tectonics(s, world, random.Random())
            if mag:
                break
        assert mag is not None and 4.0 <= mag <= 8.0
        assert world.scanner_progress < 50           # infrastructure set back
        hurt = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert hurt.health < 1.0                      # the quake hurt people
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "tectonic:earthquake")
        )).scalars().first()
        assert ev is not None


def test_tectonics_in_environment_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "TectAPI", "cpc_class": "E21B", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    env = client.get(f"/worlds/{wid}/environment", headers=headers).json()
    assert "tectonic_stress" in env
