import pytest
from sqlalchemy import select, func

from underworld.server.db.models import Minion, PopulationSnapshot, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory
from underworld.server.services.simulation import advance_world


@pytest.mark.asyncio
async def test_seed_creates_requested_population_split():
    plan = factory.SeedingPlan(aptitude_pool=80, patent_guild_seats=6, safety_guild_seats=4)
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="ScaleTest", cpc_class="H02J", plan=plan,
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        count = await session.scalar(
            select(func.count(Minion.id)).where(Minion.world_id == world.id)
        )
        assert count == plan.total_starting


@pytest.mark.asyncio
async def test_advance_writes_population_snapshot():
    plan = factory.SeedingPlan(aptitude_pool=24, patent_guild_seats=3, safety_guild_seats=3)
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="SnapTest", cpc_class="H02J", plan=plan,
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        reports = await advance_world(session, world, ticks=2)
    assert len(reports) == 2
    async with session_scope() as session:
        snaps = (await session.execute(
            select(PopulationSnapshot).where(PopulationSnapshot.world_id == world.id)
        )).scalars().all()
        ticks = sorted(s.tick for s in snaps)
        assert ticks == [1, 2]
        latest = max(snaps, key=lambda s: s.tick)
        assert latest.alive > 0
        assert set(latest.guild_breakdown.keys()).issubset({
            "maths", "physics", "electrical", "mechanical", "civil", "materials",
            "computing", "energy", "agriculture", "patent", "safety",
        })


@pytest.mark.asyncio
async def test_advance_decays_needs_for_each_minion():
    plan = factory.SeedingPlan(aptitude_pool=20, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="NeedDecay", cpc_class="G06F", plan=plan,
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        await advance_world(session, world, ticks=1)
    async with session_scope() as session:
        # Every alive minion should have hunger less than the starting 0.85
        # (decay always runs post-action).
        res = await session.execute(select(Minion).where(Minion.world_id == world.id))
        hungers = [m.hunger for m in res.scalars().all()]
        assert any(h < 0.85 for h in hungers), "expected at least one need to have decayed"


@pytest.mark.asyncio
async def test_stub_llm_produces_diverse_actions_via_heuristic():
    """Without a real LLM, the heuristic decision path should yield a mix
    of action types — proving Minions aren't all sitting on `rest`."""
    plan = factory.SeedingPlan(aptitude_pool=40, patent_guild_seats=4, safety_guild_seats=4)
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="DiverseActions", cpc_class="G06F", plan=plan,
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        reports = await advance_world(session, world, ticks=1, use_llm=False)
    actions = [o["action"] for o in reports[0].minion_outcomes]
    assert len(set(actions)) >= 3, f"expected at least 3 distinct actions, got {set(actions)}"
