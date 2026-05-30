"""Batch 2 partials → done:

#21  natural selection — heritable immunity changes survival odds
#63  knowledge transfer needs proximity (neighbour) + language (guild) + time
#115 love/cooperation — bonded students learn faster; teaching deepens the bond
"""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.agents import minion as minion_agent
from underworld.server.db.models import (
    CauseOfDeath, GuildKind, Minion, Relationship, RelationshipKind, Skill, World,
)
from underworld.server.db.session import session_scope
from underworld.server.services import factory, lifecycle


# ── #21 natural selection ────────────────────────────────────────────────────
def test_immunity_reduces_disease_death(monkeypatch):
    def make(immune: float):
        m = Minion(world_id="w", name="t", guild=GuildKind.PHYSICS, dna="d",
                   health=0.5, hunger=0.9, thirst=0.9, sanity=0.9, born_tick=0,
                   intelligence=0.5)
        return m, immune

    def trait_stub(dna, name, _immune=[0.5]):
        return {"immune": _immune[0], "longevity": 0.5, "dexterity": 0.5}.get(name, 0.5)

    def count_disease(immune: float) -> int:
        monkeypatch.setattr(lifecycle.dna_mod, "trait",
                            lambda dna, name: {"immune": immune, "longevity": 0.5,
                                               "dexterity": 0.5}.get(name, 0.5))
        m, _ = make(immune)
        rng = random.Random(42)
        return sum(
            lifecycle.determine_death(m, world_tick=10, rng=rng) == CauseOfDeath.DISEASE
            for _ in range(4000)
        )

    weak = count_disease(0.1)
    strong = count_disease(0.9)
    assert weak > strong > 0  # selection pressure is real and immunity helps


# ── #63 + #115 teaching ──────────────────────────────────────────────────────
async def _two_same_guild(session, world):
    pair = (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True)).limit(40)
    )).scalars().all()
    by_guild: dict = {}
    for m in pair:
        by_guild.setdefault(m.guild, []).append(m)
    for g, members in by_guild.items():
        if len(members) >= 2:
            return members[0], members[1]
    raise AssertionError("need two same-guild minions")


@pytest.mark.asyncio
async def test_teach_requires_a_nearby_same_guild_minion():
    plan = factory.SeedingPlan(aptitude_pool=24, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Teach", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        teacher, _ = await _two_same_guild(s, world)
        # no neighbours in earshot → cannot teach (proximity requirement)
        msg = await minion_agent._do_teach(s, teacher, world, {"skill": "x"}, neighbours=[])
        assert "nearby" in msg.lower()


@pytest.mark.asyncio
async def test_bonded_student_learns_faster_and_cooldown_applies():
    plan = factory.SeedingPlan(aptitude_pool=24, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Bond", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        teacher, student = await _two_same_guild(s, world)
        # strong friendship bond teacher → student
        s.add(Relationship(from_id=teacher.id, to_id=student.id,
                           kind=RelationshipKind.FRIEND, strength=1.0,
                           formed_tick=0, last_interaction_tick=0))
        await s.flush()
        msg = await minion_agent._do_teach(s, teacher, world, {"skill": "alloys"},
                                           neighbours=[student])
        assert "bonded" in msg
        skill = (await s.execute(
            select(Skill).where(Skill.minion_id == student.id, Skill.name == "alloys")
        )).scalars().first()
        # bonded transfer ≈ 0.12 * (1 + 1.0) = 0.24 on top of the 0.3 base
        assert skill.level == pytest.approx(0.3 + 0.24, abs=1e-6)
        # a MENTOR bond now exists, and re-teaching within cooldown is refused
        mentor = (await s.execute(
            select(Relationship).where(
                Relationship.from_id == teacher.id, Relationship.to_id == student.id,
                Relationship.kind == RelationshipKind.MENTOR)
        )).scalars().first()
        assert mentor is not None
        again = await minion_agent._do_teach(s, teacher, world, {"skill": "alloys"},
                                             neighbours=[student])
        assert "recently" in again.lower()
