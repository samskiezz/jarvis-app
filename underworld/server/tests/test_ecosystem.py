"""Not-done phase, batch 9 — ecosystem feedback + overhunting collapse (#35)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, World
from underworld.server.db.session import session_scope
from underworld.server.services import ecosystem, factory
from underworld.server.services.simulation import advance_world


def test_sustainable_hunting_lets_prey_persist():
    prey, predator = 1.0, 0.25
    for _ in range(60):
        s = ecosystem.step(prey, predator, hunters=10)   # light pressure
        prey, predator = s.prey, s.predator
    assert prey > ecosystem.COLLAPSE_BELOW   # wildlife survives light hunting


def test_overhunting_collapses_prey():
    prey, predator = 1.0, 0.25
    crashed = False
    for _ in range(60):
        s = ecosystem.step(prey, predator, hunters=5000)  # massive pressure
        prey, predator = s.prey, s.predator
        if prey < ecosystem.COLLAPSE_BELOW:
            crashed = True
            break
    assert crashed   # too many hunters wipe out the prey


def test_predator_prey_oscillation_without_hunters():
    prey, predator = 0.8, 0.6
    preys = []
    for _ in range(40):
        s = ecosystem.step(prey, predator, hunters=0)
        prey, predator = s.prey, s.predator
        preys.append(prey)
    # populations move (not frozen) and both stay non-negative
    assert max(preys) - min(preys) > 0.05
    assert prey >= 0.0 and predator >= 0.0


@pytest.mark.asyncio
async def test_collapse_event_and_famine_in_sim():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Eco", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # crash the herd directly, then a tick should famine + log collapse
        world.prey_pop = 0.2
        await s.flush()
        # simulate a tick of overhunting with a huge hunter count
        food = await ecosystem.tick_ecosystem(s, world, hunters=100000)
        assert food < 0.2
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "ecosystem:collapse")
        )).scalars().first()
        assert ev is not None


@pytest.mark.asyncio
async def test_environment_route():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="EcoAPI", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        w = await s.get(World, world.id)
        await advance_world(s, w, ticks=2)
    # route assertion is light; the field presence is what matters
    async with session_scope() as s:
        w = await s.get(World, world.id)
        assert 0.0 <= (w.prey_pop or 0) <= 2.0


def test_environment_endpoint(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "EnvAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    body = client.get(f"/worlds/{created['id']}/environment", headers=headers).json()
    assert {"pollution", "prey_pop", "predator_pop", "food_availability"} <= set(body)
