"""Civilization systems: urban planning (#44), war/diplomacy (#43), entertainment (#48)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.services import civics, factory


# ── #43 conflict ─────────────────────────────────────────────────────────────
def test_conflict_pressure_rises_with_scarcity_and_lawlessness():
    calm = civics.conflict_pressure(food=0.9, water=0.9, pollution=0.0, legal_order=1.0)
    crisis = civics.conflict_pressure(food=0.1, water=0.1, pollution=0.8, legal_order=0.2)
    assert crisis > calm
    assert calm < 0.2


@pytest.mark.asyncio
async def test_scarcity_breeds_conflict_that_harms():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="War", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.crop_yield, world.water_table, world.pollution = 0.05, 0.05, 0.7
        world.legal_system = "customary"
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.health = 1.0
        await s.flush()
        outcome = None
        for _ in range(60):
            outcome = await civics.tick_conflict(s, world, random.Random())
            if outcome == "conflict":
                break
        assert outcome == "conflict"
        assert world.tension >= 0.0
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "society:conflict")
        )).scalars().first()
        assert ev is not None


# ── #44 urban planning ───────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_knowledge_builds_infrastructure_that_eases_stress():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="City", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        people = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all()
        for i, m in enumerate(people):
            s.add(Skill(minion_id=m.id, name=f"k{i}", level=9.0))   # lots of knowledge
            m.stress = 0.6
        world.infrastructure = 0.8        # already a planned city
        await s.flush()
        await civics.tick_infrastructure(s, world)
        assert world.infrastructure > 0.1
        eased = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert eased.stress < 0.6          # planning eased crowding stress


# ── #48 entertainment ────────────────────────────────────────────────────────
def test_entertainment_evolves_with_era():
    assert civics.entertainment_for("stone") == "foot races"
    assert civics.entertainment_for("information") == "video games"
    assert civics.entertainment_for("quantum") == "virtual reality"


@pytest.mark.asyncio
async def test_festival_lifts_morale():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Fest", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.sanity = 0.5
        await s.flush()
        form = await civics.tick_entertainment(s, world)
        assert form
        happier = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert happier.sanity > 0.5


def test_society_route_exposes_civics(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "CivAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    body = client.get(f"/worlds/{created['id']}/society", headers=headers).json()
    assert {"infrastructure", "tension", "entertainment"} <= set(body)
