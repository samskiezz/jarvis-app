"""Wiring laws into consequences: live SIR epidemics (#67)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import disease, factory


def test_rates_respond_to_pollution_and_infrastructure():
    dirty = disease.rates(pollution=0.9, infrastructure=0.1)   # (beta, gamma)
    clean = disease.rates(pollution=0.0, infrastructure=0.9)
    assert dirty[0] > clean[0]      # pollution + crowding spread it faster
    assert clean[1] > dirty[1]      # good infrastructure recovers faster
    # a filthy, unplanned world tips R0 above 1; a clean, planned one keeps it down
    from underworld.server.physics.epidemiology import r0
    assert r0(*dirty) > r0(*clean)


@pytest.mark.asyncio
async def test_outbreak_spreads_and_harms_then_resolves():
    plan = factory.SeedingPlan(aptitude_pool=20, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Plague", cpc_class="C07D", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # force a bad-sanitation outbreak
        world.epidemic_active = True
        world.epidemic_infected = 0.1
        world.epidemic_recovered = 0.0
        world.pollution, world.infrastructure = 0.8, 0.1
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.health = 1.0
        await s.flush()
        out = await disease.tick_disease(s, world, random.Random(1))
        assert out["active"] and out["infected"] > 0
        assert out["r0"] > 1.0
        sick = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all()
        assert any(m.health < 1.0 for m in sick)     # the plague hurt people

        # a strong health system drives it to containment over time
        world.pollution, world.infrastructure = 0.0, 0.95
        contained = False
        for _ in range(200):
            r = await disease.tick_disease(s, world, random.Random())
            if not r["active"]:
                contained = True
                break
        assert contained
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "disease:contained")
        )).scalars().first()
        assert ev is not None


def test_epidemic_in_environment_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "EpiAPI", "cpc_class": "C07D", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    env = client.get(f"/worlds/{wid}/environment", headers=headers).json()
    assert "epidemic_active" in env and "epidemic_infected" in env
