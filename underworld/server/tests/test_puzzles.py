"""Big push — gateway research puzzles (#82-85)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import (
    EmptyDataset, Event, Invention, Minion, Patent, World,
)
from underworld.server.db.session import session_scope
from underworld.server.services import factory, puzzles


async def _patents(s, n, *, expired=True):
    out = []
    for i in range(n):
        p = Patent(id=f"P{i}-{random.randint(0, 1_000_000)}", title=f"prior art {i}",
                   abstract="...", expired=expired)
        s.add(p)
        out.append(p)
    await s.flush()
    return out


@pytest.mark.asyncio
async def test_generate_creates_a_gap():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Gap", cpc_class="G06F", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        gap = await puzzles.generate(s, world, random.Random(0))
        assert gap.discipline in puzzles._DISCIPLINES
        assert gap.prompt and gap.required_patents >= 2
        assert len(await puzzles.open_gaps(s, world.id)) == 1


@pytest.mark.asyncio
async def test_solving_requires_combining_expired_patents():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Solve", cpc_class="G06F", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        gap = await puzzles.generate(s, world, random.Random(1))
        gap.required_patents = 2
        await s.flush()

        # too few patents → not solved
        one = await _patents(s, 1, expired=True)
        miss = await puzzles.solve(s, m, gap, [one[0].id])
        assert miss["solved"] is False and "≥2" in miss["reason"]

        # non-expired don't count
        fresh = await _patents(s, 2, expired=False)
        assert (await puzzles.solve(s, m, gap, [p.id for p in fresh]))["solved"] is False

        # two expired patents combined → solved + invention + draft
        two = await _patents(s, 2, expired=True)
        rep_before = m.reputation
        ok = await puzzles.solve(s, m, gap, [p.id for p in two])
        assert ok["solved"] is True
        assert ok["patent_draft"]["claims"] and ok["patent_draft"]["cited_prior_art"]
        assert m.reputation > rep_before
        inv = await s.get(Invention, ok["invention_id"])
        assert inv is not None and inv.inputs["from_gap"] == gap.id
        assert gap.solved is True
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "gateway:solved")
        )).scalars().first()
        assert ev is not None


def test_gap_routes(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "GapAPI", "cpc_class": "G06F", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    gaps = client.get(f"/worlds/{wid}/gaps", headers=headers).json()
    assert isinstance(gaps, list)   # none yet (world not at peak info), but endpoint works
