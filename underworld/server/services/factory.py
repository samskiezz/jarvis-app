"""World + population seeding.

The doc (Section II.193) wants 100,000+ Minions; we cap at a defensible
size for v1 (default 128). Seeding uses random DNA, with each Minion's
guild chosen by the strongest aptitude locus — so populations naturally
weight toward the world's CPC class.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from ..agents import guilds
from ..db.models import GuildKind, Minion, Skill, Soul, World
from ..genetics import dna as dna_mod
from ..world.seed import derive_seed
from . import lifecycle


_DEFAULT_PATENT_SEATS = 6
_DEFAULT_SAFETY_SEATS = 4


@dataclass
class SeedingPlan:
    """How many Minions to seed and how to apportion across guilds.

    `aptitude_pool` = positions filled by random-DNA Minions whose guild
    is decided by their strongest aptitude locus.
    `patent_guild_seats` and `safety_guild_seats` are fixed because those
    guilds are functional roles (reviewers) not aptitude domains.
    """

    aptitude_pool: int = 118
    patent_guild_seats: int = _DEFAULT_PATENT_SEATS
    safety_guild_seats: int = _DEFAULT_SAFETY_SEATS
    population_cap: int = 400

    @property
    def total_starting(self) -> int:
        return self.aptitude_pool + self.patent_guild_seats + self.safety_guild_seats


def default_seeding() -> SeedingPlan:
    return SeedingPlan()


async def create_world(
    session: AsyncSession,
    *,
    name: str,
    cpc_class: str,
    plan: SeedingPlan | None = None,
) -> World:
    plan = plan or default_seeding()
    seed = derive_seed(cpc_class)
    world = World(
        name=name,
        seed_class=seed.cpc_class,
        seed_value=seed.seed_int,
        tick=0,
        population_cap=plan.population_cap,
    )
    session.add(world)
    await session.flush()

    rng = random.Random(seed.seed_int)

    # 1. Aptitude pool — random DNA, guild from strongest locus.
    for _ in range(plan.aptitude_pool):
        dna = dna_mod.random_dna(rng)
        guild_kind = lifecycle.guild_from_dna(dna)
        given, surname = lifecycle.random_name(rng)
        await _spawn_founder(session, world, given, surname, guild_kind, dna)

    # 2. Patent + Safety reviewers — fixed counts.
    for _ in range(plan.patent_guild_seats):
        dna = dna_mod.random_dna(rng)
        given, surname = lifecycle.random_name(rng)
        await _spawn_founder(session, world, given, surname, GuildKind.PATENT, dna)
    for _ in range(plan.safety_guild_seats):
        dna = dna_mod.random_dna(rng)
        given, surname = lifecycle.random_name(rng)
        await _spawn_founder(session, world, given, surname, GuildKind.SAFETY, dna)

    return world


async def _spawn_founder(
    session: AsyncSession,
    world: World,
    given: str,
    surname: str,
    guild_kind: GuildKind,
    dna: str,
) -> Minion:
    """Generation-0 Minion. No parents, fresh soul."""
    soul = Soul(world_id=world.id)
    session.add(soul)
    await session.flush()

    traits = dna_mod.trait_vector(dna)
    m = Minion(
        world_id=world.id,
        soul_id=soul.id,
        name=given,
        surname=surname,
        guild=guild_kind,
        dna=dna,
        generation=0,
        openness=traits["openness"],
        conscientiousness=traits["conscientiousness"],
        extraversion=traits["extraversion"],
        agreeableness=traits["agreeableness"],
        neuroticism=traits["neuroticism"],
        intelligence=traits["intelligence"],
        creativity=traits["creativity"],
        born_tick=0,
        reputation=1.0,
    )
    session.add(m)
    await session.flush()

    spec = guilds.get(guild_kind)
    for skill_name in spec.starting_skills:
        base_level = 0.5 + 0.5 * dna_mod.trait(dna, "intelligence")
        session.add(Skill(minion_id=m.id, name=skill_name, level=base_level))

    return m


__all__ = ["SeedingPlan", "default_seeding", "create_world"]
