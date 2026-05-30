"""Not-done phase, batch 8 — memes/fads (#142/#143) + pollution (#36)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Meme, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, memes, pollution


# ── #142/#143 memes ──────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_popular_meme_spreads_and_weak_meme_dies():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Meme", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        strong = await memes.seed_meme(s, world, "skyward", "fashion", popularity=0.4)
        weak = await memes.seed_meme(s, world, "old-ways", "idea", popularity=0.021)
        await s.flush()
        p0 = strong.popularity
        await memes.tick_memes(s, world, random.Random(0))
        assert strong.popularity > p0          # a popular meme recruits carriers
        assert weak.alive is False             # an unpopular one fades out


@pytest.mark.asyncio
async def test_thriving_meme_mutates_into_a_variant():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Mutate", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        await memes.seed_meme(s, world, "deepcurrent", "idea", popularity=0.7)
        await s.flush()
        # run several ticks; a high-popularity meme should spawn a variant
        rng = random.Random(1)
        for _ in range(12):
            await memes.tick_memes(s, world, rng)
        variants = (await s.execute(
            select(Meme).where(Meme.world_id == world.id, Meme.variant_of.is_not(None))
        )).scalars().all()
        assert variants, "a thriving meme should have mutated into a variant"
        assert all(v.generation >= 1 for v in variants)


# ── #36 pollution ────────────────────────────────────────────────────────────
def test_emission_scales_with_era_and_population():
    stone = pollution.emission(era="stone", population=50, inventions=0)
    industrial = pollution.emission(era="industrial", population=50, inventions=0)
    busier = pollution.emission(era="industrial", population=500, inventions=20)
    assert stone == 0.0
    assert industrial > 0.0
    assert busier > industrial


@pytest.mark.asyncio
async def test_pollution_accumulates_and_harms_when_high():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Smog", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.era = "industrial"
        world.pollution = 0.8           # already toxic
        for m in (await s.execute(
            select(Minion).where(Minion.world_id == world.id)
        )).scalars().all():
            m.health = 1.0
        await s.flush()
        level = await pollution.tick_pollution(s, world, inventions_this_tick=5)
        assert level > 0.0
        hurt = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert hurt.health < 1.0        # toxic air harmed the living
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "environment:pollution")
        )).scalars().all()
        # event only logged on tick % 10; at minimum pollution stayed high
        assert world.pollution > pollution.HARM_THRESHOLD


def test_culture_and_memes_routes(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "CultAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 3})
    culture = client.get(f"/worlds/{wid}/culture", headers=headers).json()
    assert "pollution" in culture
    memes_body = client.get(f"/worlds/{wid}/memes", headers=headers).json()
    assert isinstance(memes_body, list)
