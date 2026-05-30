"""Deep physics: geological epochs + fossils (#14/#15)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Fossil, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, paleontology


def test_era_reach_deepens_with_technology():
    assert paleontology.reach_for("stone") < paleontology.reach_for("iron") < paleontology.reach_for("industrial")


@pytest.mark.asyncio
async def test_seed_places_older_fossils_deeper():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Dig", cpc_class="E21B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        await paleontology.seed_fossils(s, world)
        await s.flush()
        rows = (await s.execute(
            select(Fossil).where(Fossil.world_id == world.id)
        )).scalars().all()
        assert len(rows) >= 8
        # the oldest organism is the deepest
        oldest = max(rows, key=lambda f: f.age_my)
        assert oldest.depth == max(f.depth for f in rows)


@pytest.mark.asyncio
async def test_stone_age_reaches_only_shallow_fossils():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Shallow", cpc_class="E21B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.era = "stone"
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        found = await paleontology.excavate(s, world, m)
        assert found is not None and found.depth <= paleontology.reach_for("stone")
        # a deep Archean fossil stays buried in the stone age
        archean = (await s.execute(
            select(Fossil).where(Fossil.world_id == world.id, Fossil.epoch == "Archean")
        )).scalars().first()
        assert archean.excavated is False


@pytest.mark.asyncio
async def test_excavation_teaches_the_finder():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Teach", cpc_class="E21B", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.era = "industrial"     # can reach deep strata
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        rep_before = m.reputation
        found = await paleontology.excavate(s, world, m)
        assert found is not None and found.found_by == m.id
        assert m.reputation > rep_before
        skill = (await s.execute(
            select(Skill).where(Skill.minion_id == m.id, Skill.name == "paleontology")
        )).scalars().first()
        assert skill is not None
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "fossil:excavated")
        )).scalars().first()
        assert ev is not None


def test_fossils_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "FossilAPI", "cpc_class": "E21B", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    body = client.get(f"/worlds/{wid}/fossils", headers=headers).json()
    assert "reach" in body and "buried" in body and "excavated" in body
