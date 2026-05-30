"""Foundational technology discovery from scratch (doc I.22).

Civilizations don't follow a scripted tech tree — instead, each foundational
technology becomes discoverable once its prerequisites exist and the population
has accumulated enough knowledge/people. The ladder enforces sensible dependencies
(fire before metallurgy, language before writing) while leaving room for different
worlds to reach them at different times. A discovery is a one-time event that
gives the living a small thrill (morale lift).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Discovery, Event, Minion, World
from . import mastery


@dataclass(frozen=True)
class Tech:
    name: str
    prereqs: tuple[str, ...] = field(default_factory=tuple)
    min_knowledge: float = 0.0
    min_population: int = 0
    min_masters: int = 0


# Ordered ladder of foundational technologies.
LADDER: tuple[Tech, ...] = (
    Tech("fire"),
    Tech("toolmaking", prereqs=("fire",), min_knowledge=10),
    Tech("language", min_population=8),
    Tech("cooking", prereqs=("fire",), min_knowledge=20),
    Tech("agriculture", prereqs=("toolmaking",), min_knowledge=40, min_population=12),
    Tech("pottery", prereqs=("fire", "toolmaking"), min_knowledge=55),
    Tech("writing", prereqs=("language",), min_knowledge=70, min_masters=1),
    Tech("the_wheel", prereqs=("toolmaking",), min_knowledge=80),
    Tech("metallurgy", prereqs=("fire", "toolmaking"), min_knowledge=120, min_masters=2),
    Tech("mathematics", prereqs=("writing",), min_knowledge=160, min_masters=3),
    Tech("masonry", prereqs=("toolmaking", "metallurgy"), min_knowledge=200),
    Tech("printing", prereqs=("writing", "metallurgy"), min_knowledge=280, min_masters=4),
)

_BY_NAME = {t.name: t for t in LADDER}


async def discovered_set(session: AsyncSession, world_id: str) -> set[str]:
    rows = await session.execute(select(Discovery.tech).where(Discovery.world_id == world_id))
    return {r[0] for r in rows.all()}


def _ready(tech: Tech, have: set[str], knowledge: float, population: int, masters: int) -> bool:
    return (
        tech.name not in have
        and all(p in have for p in tech.prereqs)
        and knowledge >= tech.min_knowledge
        and population >= tech.min_population
        and masters >= tech.min_masters
    )


async def tick_discoveries(session: AsyncSession, world: World, *, max_per_tick: int = 1) -> list[str]:
    """Discover any newly-eligible foundational techs this tick (default ≤1)."""
    have = await discovered_set(session, world.id)
    knowledge, masters = await mastery.world_knowledge(session, world.id)
    population = int(await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0)

    found: list[str] = []
    for tech in LADDER:
        if len(found) >= max_per_tick:
            break
        if _ready(tech, have, knowledge, population, masters):
            session.add(Discovery(world_id=world.id, tech=tech.name, tick=world.tick,
                                 sim_year=world.sim_year))
            session.add(Event(
                world_id=world.id, tick=world.tick, kind="discovery:tech", actor_id=None,
                payload={"tech": tech.name, "sim_year": round(world.sim_year, 1)},
            ))
            have.add(tech.name)
            found.append(tech.name)
            # The thrill of discovery lifts everyone a little.
            for m in (await session.execute(
                select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
            )).scalars().all():
                m.morale = min(1.0, (m.morale if m.morale is not None else 0.5) + 0.05)
    return found
