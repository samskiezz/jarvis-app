import asyncio
import random

import pytest

from underworld.server.db.models import (
    CauseOfDeath,
    GuildKind,
    Minion,
    MoodKind,
    Soul,
    World,
)
from underworld.server.db.session import session_scope
from underworld.server.genetics import dna as dna_mod
from underworld.server.services import factory, lifecycle


def _make_minion(world: World, *, dna=None, born_tick=0):
    rng = random.Random(world.seed_value)
    dna = dna or dna_mod.random_dna(rng)
    traits = dna_mod.trait_vector(dna)
    return Minion(
        world_id=world.id,
        name="Test",
        surname="Subject",
        guild=GuildKind.COMPUTING,
        dna=dna,
        generation=0,
        openness=traits["openness"],
        conscientiousness=traits["conscientiousness"],
        extraversion=traits["extraversion"],
        agreeableness=traits["agreeableness"],
        neuroticism=traits["neuroticism"],
        intelligence=traits["intelligence"],
        creativity=traits["creativity"],
        born_tick=born_tick,
        # Explicit defaults — SQLAlchemy defaults only fire on insert.
        hunger=0.85, thirst=0.85, fatigue=0.85, sanity=0.85, health=1.0,
        mood=MoodKind.CONTENT, stress=0.2,
        reputation=1.0, karma=0.0, alive=True,
    )


@pytest.mark.asyncio
async def test_derive_mood_responds_to_critical_needs():
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="MoodTest", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=4, patent_guild_seats=1, safety_guild_seats=1),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        m = _make_minion(world)
        m.health = 0.1
        mood, _ = lifecycle.derive_mood(m)
        assert mood == MoodKind.DESPAIRING
        m.health = 1.0
        m.hunger = 0.1
        mood, _ = lifecycle.derive_mood(m)
        assert mood == MoodKind.EXHAUSTED


@pytest.mark.asyncio
async def test_decay_and_replenish_bound_to_unit_interval():
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="NeedTest", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=4, patent_guild_seats=1, safety_guild_seats=1),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        m = _make_minion(world)
        for _ in range(60):
            lifecycle.decay_needs(m, intensity=2.0)
        assert 0.0 <= m.hunger <= 1.0
        assert 0.0 <= m.sanity <= 1.0
        assert m.hunger == 0.0  # bottomed out
        lifecycle.replenish(m, food=999, water=999, rest=999, socialise=999)
        assert m.hunger == 1.0 and m.sanity == 1.0


@pytest.mark.asyncio
async def test_can_breed_blocks_close_kin_and_youth():
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="KinTest", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=4, patent_guild_seats=1, safety_guild_seats=1),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        a = _make_minion(world, born_tick=0)
        b = _make_minion(world, dna=a.dna, born_tick=0)  # identical dna
        world.tick = 100
        # Same DNA = high kinship blocks it.
        assert lifecycle.can_breed(a, b, world_tick=world.tick) is False
        # Different DNA but too young (born_tick 90, tick 100 → age 10 < 40)
        c = _make_minion(world, born_tick=90)
        assert lifecycle.can_breed(a, c, world_tick=world.tick) is False


@pytest.mark.asyncio
async def test_breed_pair_creates_child_with_new_generation():
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="BreedTest", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=10, patent_guild_seats=1, safety_guild_seats=1),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        world.tick = 50
        # Pick two adult, alive, gen-0 minions with sufficiently different DNA.
        from sqlalchemy import select
        res = await session.execute(select(Minion).where(Minion.world_id == world.id))
        pool = list(res.scalars().all())
        a, b = None, None
        for x in pool:
            for y in pool:
                if x.id == y.id:
                    continue
                if dna_mod.kinship(x.dna, y.dna) < 0.5:
                    a, b = x, y
                    break
            if a:
                break
        assert a and b
        rng = random.Random(123)
        child = await lifecycle.breed_pair(session, world=world, parent_a=a, parent_b=b, rng=rng)
        assert child.generation == 1
        assert child.parent_a_id == a.id
        assert child.parent_b_id == b.id
        assert child.born_tick == world.tick
        assert child.alive is True
        assert len(child.dna) == dna_mod.DNA_LENGTH


@pytest.mark.asyncio
async def test_fork_creates_clone_with_same_generation_and_new_soul():
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="ForkTest", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=8, patent_guild_seats=1, safety_guild_seats=1),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        from sqlalchemy import select
        src = (await session.execute(select(Minion).where(Minion.world_id == world.id).limit(1))).scalars().first()
        assert src
        rng = random.Random(7)
        clone = await lifecycle.fork_minion(session, world=world, source=src, rng=rng)
        assert clone.generation == src.generation
        assert clone.forked_from_id == src.id
        assert clone.soul_id != src.soul_id
        assert dna_mod.kinship(src.dna, clone.dna) > 0.9


@pytest.mark.asyncio
async def test_kill_assigns_cause_and_updates_soul_summary():
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="DeathTest", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=4, patent_guild_seats=1, safety_guild_seats=1),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        from sqlalchemy import select
        m = (await session.execute(select(Minion).where(Minion.world_id == world.id).limit(1))).scalars().first()
        assert m
        await lifecycle.kill(session, m, cause=CauseOfDeath.OLD_AGE, world_tick=99)
        assert m.alive is False
        assert m.died_tick == 99
        assert m.cause_of_death == CauseOfDeath.OLD_AGE
        soul = await session.get(Soul, m.soul_id)
        assert soul is not None
        assert "OLD_AGE" in soul.ancestral_summary.upper() or "old_age" in soul.ancestral_summary
