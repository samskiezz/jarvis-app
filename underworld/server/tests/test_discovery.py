"""Not-done phase, batch 6 — tech discovery (#22) + dynamic time-scaling (#16)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Discovery, Event, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.services import discovery, factory, timescale
from underworld.server.services.simulation import advance_world


# ── #16 time-scaling ─────────────────────────────────────────────────────────
def test_early_ages_run_faster_than_late_ages():
    early = timescale.years_per_tick(population=4, inventions=0, era="stone")
    late = timescale.years_per_tick(population=300, inventions=80, era="information")
    assert early > late
    assert late >= timescale.MIN_YEARS_PER_TICK
    assert early <= timescale.MAX_YEARS_PER_TICK


@pytest.mark.asyncio
async def test_sim_year_advances_with_ticks():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Cal", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        await advance_world(s, world, ticks=3)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        assert world.sim_year > 0   # the in-world calendar moved forward


# ── #22 discovery ────────────────────────────────────────────────────────────
def test_ladder_dependencies_are_well_formed():
    names = {t.name for t in discovery.LADDER}
    for t in discovery.LADDER:
        for p in t.prereqs:
            assert p in names            # every prerequisite is a real tech


@pytest.mark.asyncio
async def test_prereqs_gate_discovery_order():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Disc", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # first tick: only prerequisite-free techs (fire / language) can appear,
        # never metallurgy (needs fire + toolmaking + high knowledge).
        found = await discovery.tick_discoveries(s, world, max_per_tick=5)
        assert "fire" in found
        assert "metallurgy" not in found
        have = await discovery.discovered_set(s, world.id)
        assert "toolmaking" not in have or "fire" in have   # toolmaking never precedes fire
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "discovery:tech")
        )).scalars().first()
        assert ev is not None


@pytest.mark.asyncio
async def test_accumulated_knowledge_unlocks_deeper_tech():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Deep", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # bootstrap fire + toolmaking, then pump knowledge so metallurgy qualifies
        s.add_all([
            Discovery(world_id=world.id, tech="fire", tick=0),
            Discovery(world_id=world.id, tech="toolmaking", tick=0),
        ])
        people = (await s.execute(
            select(Minion).where(Minion.world_id == world.id)
        )).scalars().all()
        for i, m in enumerate(people):
            s.add(Skill(minion_id=m.id, name=f"deep_{i}", level=9.0))  # lots of knowledge + masters
        await s.flush()
        # run discovery several times to climb the ladder
        for _ in range(8):
            await discovery.tick_discoveries(s, world, max_per_tick=1)
        have = await discovery.discovered_set(s, world.id)
        assert "metallurgy" in have       # knowledge + prereqs unlocked it


def test_discoveries_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "DiscAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})
    body = client.get(f"/worlds/{wid}/discoveries", headers=headers).json()
    assert "discovered" in body and "remaining" in body
    techs = [d["tech"] for d in body["discovered"]]
    assert "fire" in techs
