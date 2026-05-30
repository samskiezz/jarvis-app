"""Civilization: art, music & literature with stylistic evolution (#47)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import Artwork, Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import art, factory


def test_forms_and_styles_unlock_with_era():
    stone = art.forms_for_era("stone")
    info = art.forms_for_era("information")
    assert "cave_painting" in stone and "novel" not in stone
    assert "novel" in info and "film" in info and "cave_painting" in info  # cumulative
    assert art.style_for_era("stone") != art.style_for_era("information")  # style evolves


@pytest.mark.asyncio
async def test_creation_records_work_and_lifts_creator():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Art", cpc_class="D06P", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        world.era = "industrial"
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        m.creativity = 0.9
        rep_before = m.reputation
        work = await art.create(s, world, m, random.Random(1))
        assert work.form in art.forms_for_era("industrial")
        assert work.style == art.style_for_era("industrial")
        assert m.reputation >= rep_before
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "art:created")
        )).scalars().first()
        assert ev is not None and ev.payload["title"]


def test_art_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "ArtAPI", "cpc_class": "D06P", "aptitude_pool": 16,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 6})
    corpus = client.get(f"/worlds/{wid}/art", headers=headers).json()
    assert isinstance(corpus, list)
