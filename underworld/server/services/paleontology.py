"""Geological epochs + the fossil record (doc I.14-15).

Deep time is represented as a stack of strata: older organisms lie deeper and are
older. A civilization can only excavate as deep as its technology reaches (you
stumble on surface fossils in the stone age; deep strata need industrial drilling).
Excavating a fossil teaches the finder about extinct life and deep time — a small
reputation + paleontology-skill gain — and reveals which geological epochs the
world has uncovered.
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Fossil, Minion, Skill, World

# (epoch, organism, age in millions of years) — oldest first → deepest.
_PREHISTORY = (
    ("Archean", "stromatolite", 3500.0),
    ("Cambrian", "trilobite", 520.0),
    ("Devonian", "armoured fish", 400.0),
    ("Carboniferous", "giant dragonfly", 310.0),
    ("Permian", "dimetrodon", 280.0),
    ("Triassic", "early dinosaur", 230.0),
    ("Jurassic", "ammonite", 160.0),
    ("Cretaceous", "tyrannosaur", 70.0),
    ("Paleogene", "early mammal", 50.0),
    ("Neogene", "mastodon", 5.0),
)
_OLDEST = _PREHISTORY[0][2]

# How deep a civilization can dig at each era (0 surface … 1 deepest).
ERA_REACH = {
    "stone": 0.2, "bronze": 0.4, "iron": 0.6,
    "industrial": 0.85, "electric": 1.0, "information": 1.0, "quantum": 1.0,
}


def reach_for(era: str) -> float:
    return ERA_REACH.get(era, 0.2)


async def seed_fossils(session: AsyncSession, world: World) -> None:
    if await session.scalar(select(func.count(Fossil.id)).where(Fossil.world_id == world.id)):
        return
    for epoch, organism, age in _PREHISTORY:
        depth = round(age / _OLDEST, 4)                  # older → deeper
        session.add(Fossil(world_id=world.id, organism=organism, epoch=epoch,
                          depth=depth, age_my=age, tick=world.tick))


async def excavate(session: AsyncSession, world: World, minion: Minion) -> Fossil | None:
    """Dig up the shallowest reachable un-excavated fossil, if any."""
    await seed_fossils(session, world)
    reach = reach_for(world.era)
    fossil = (await session.execute(
        select(Fossil).where(
            Fossil.world_id == world.id,
            Fossil.excavated.is_(False),
            Fossil.depth <= reach,
        ).order_by(Fossil.depth.asc()).limit(1)
    )).scalars().first()
    if fossil is None:
        return None
    fossil.excavated = True
    fossil.found_by = minion.id
    minion.reputation = min(5.0, minion.reputation + 0.05)
    skill = (await session.execute(
        select(Skill).where(Skill.minion_id == minion.id, Skill.name == "paleontology")
    )).scalars().first()
    if skill is None:
        session.add(Skill(minion_id=minion.id, name="paleontology", level=0.6,
                          last_practiced_tick=world.tick))
    else:
        skill.level = min(10.0, skill.level + 0.5)
    session.add(Event(
        world_id=world.id, tick=world.tick, kind="fossil:excavated", actor_id=minion.id,
        payload={"organism": fossil.organism, "epoch": fossil.epoch, "age_my": fossil.age_my},
    ))
    return fossil


async def tick_paleontology(session: AsyncSession, world: World, rng: random.Random) -> Fossil | None:
    """Occasionally a curious Minion unearths a fossil the era can reach."""
    await seed_fossils(session, world)
    digger = (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True)).limit(1)
    )).scalars().first()
    if digger is None or rng.random() > 0.5:
        return None
    return await excavate(session, world, digger)
