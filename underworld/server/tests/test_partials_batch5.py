"""Batch 5 partials → done:

#103/#104/#106  soul banks knowledge + temperament at death; a talented soul
                seeds its next incarnation with a head-start (talent skips gens)
#150            gossip spreads reputation; the disgraced are ostracised
"""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import (
    CauseOfDeath, GuildKind, Minion, Relationship, RelationshipKind, Skill, Soul, World,
)
from underworld.server.db.session import session_scope
from underworld.server.services import factory, lifecycle


# ── #103/#104/#106 soul knowledge + talent-skip ──────────────────────────────
@pytest.mark.asyncio
async def test_soul_banks_knowledge_and_next_life_starts_ahead():
    plan = factory.SeedingPlan(aptitude_pool=10, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Soul", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        # make this a very accomplished life
        s.add(Skill(minion_id=m.id, name="grand_unified", level=10.0))
        s.add(Skill(minion_id=m.id, name="optics", level=9.0))
        await s.flush()
        soul_id = m.soul_id
        await lifecycle.kill(s, m, cause=CauseOfDeath.OLD_AGE, world_tick=world.tick)
        soul = await s.get(Soul, soul_id)
        assert soul.knowledge >= 19.0          # banked the peak knowledge
        assert soul.temperament                 # emotional tone recorded

        # Talent skips generations: with IDENTICAL DNA, a knowledgeable soul
        # seeds its next body's skills higher than a blank soul does.
        from underworld.server.genetics import dna as dna_mod
        fixed_dna = dna_mod.random_dna(random.Random(7))
        blank = Soul(world_id=world.id, knowledge=0.0)
        gifted = Soul(world_id=world.id, knowledge=40.0)
        s.add_all([blank, gifted])
        await s.flush()
        baseline = await lifecycle._make_minion(
            s, world=world, name="A", surname="x", guild=GuildKind.PHYSICS,
            dna=fixed_dna, generation=0, soul=blank)
        talented = await lifecycle._make_minion(
            s, world=world, name="B", surname="x", guild=GuildKind.PHYSICS,
            dna=fixed_dna, generation=0, soul=gifted)
        base_max = max(sk.level for sk in (await s.execute(
            select(Skill).where(Skill.minion_id == baseline.id))).scalars().all())
        gift_max = max(sk.level for sk in (await s.execute(
            select(Skill).where(Skill.minion_id == talented.id))).scalars().all())
        assert gift_max > base_max  # the soul's accumulated talent carried over


# ── #150 gossip + ostracism ──────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_gossip_converges_reputation():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Gossip", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        a, b = (await s.execute(
            select(Minion).where(Minion.world_id == world.id).limit(2)
        )).scalars().all()
        a.reputation, b.reputation = 2.0, 1.0
        await lifecycle.pair_socialise(s, a, b, world.tick)
        assert a.reputation < 2.0 and b.reputation > 1.0  # drifted toward the mean


@pytest.mark.asyncio
async def test_disgraced_minion_is_ostracised():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Ostracise", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        a, b = (await s.execute(
            select(Minion).where(Minion.world_id == world.id).limit(2)
        )).scalars().all()
        a.reputation, a.sanity = 0.3, 0.8   # disgraced
        b.reputation = 2.0
        await lifecycle.pair_socialise(s, a, b, world.tick)
        rival = (await s.execute(
            select(Relationship).where(
                Relationship.from_id == b.id, Relationship.to_id == a.id,
                Relationship.kind == RelationshipKind.RIVAL)
        )).scalars().first()
        assert rival is not None        # community shuns the disgraced
        assert a.sanity < 0.8           # being ostracised hurts
