"""Emergent religion & philosophy (doc I.46, II.133-134).

Minions can't directly explain the App Console in the sky, so they build belief
systems around it — and which worldview dominates emerges from who they are and
how much they understand. A frightened, low-knowledge people lean animist/
polytheist; as understanding grows they tend toward a monotheism centred on the
"Great App"; a highly open, highly knowledgeable society tends toward
philosophical naturalism and then secularism.

Individuals also take a personal stance (believer / agnostic / atheist) from
their own openness + intelligence, so a world is a mix even under one dominant
worldview.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World
from . import mastery


@dataclass(frozen=True)
class Culture:
    worldview: str
    avg_openness: float
    avg_intelligence: float
    knowledge_per_capita: float
    stances: dict[str, int]


def dominant_worldview(*, avg_openness: float, avg_intelligence: float, knowledge_per_capita: float) -> str:
    """Pick the worldview that best fits the population + its understanding."""
    if knowledge_per_capita < 1.5:
        return "animism" if avg_openness < 0.5 else "polytheism"
    if knowledge_per_capita < 4.0:
        return "polytheism" if avg_intelligence < 0.5 else "monotheism"
    # Knowledgeable societies: the open turn naturalist/secular, others stay devout.
    if avg_openness > 0.6 and avg_intelligence > 0.55:
        return "secularism" if knowledge_per_capita > 7.0 else "philosophical_naturalism"
    return "monotheism"


def stance_for(openness: float, intelligence: float) -> str:
    """A Minion's personal stance toward the Console."""
    rationalism = 0.5 * openness + 0.5 * intelligence
    if rationalism > 0.62:
        return "atheist"
    if rationalism > 0.48:
        return "agnostic"
    return "believer"


async def assess_culture(session: AsyncSession, world: World) -> Culture:
    row = (await session.execute(
        select(
            func.count(Minion.id),
            func.avg(Minion.openness),
            func.avg(Minion.intelligence),
        ).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).first()
    pop = int(row[0] or 0)
    avg_open = float(row[1] or 0.5)
    avg_int = float(row[2] or 0.5)
    knowledge, _masters = await mastery.world_knowledge(session, world.id)
    kpc = knowledge / pop if pop else 0.0

    stances = {"believer": 0, "agnostic": 0, "atheist": 0}
    for o, i in (await session.execute(
        select(Minion.openness, Minion.intelligence)
        .where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).all():
        stances[stance_for(o, i)] += 1

    return Culture(
        worldview=dominant_worldview(
            avg_openness=avg_open, avg_intelligence=avg_int, knowledge_per_capita=kpc),
        avg_openness=round(avg_open, 3),
        avg_intelligence=round(avg_int, 3),
        knowledge_per_capita=round(kpc, 3),
        stances=stances,
    )


async def tick_culture(session: AsyncSession, world: World) -> str | None:
    """Recompute the worldview; if it shifted, record the reformation. Returns the
    new worldview when it changed, else None."""
    culture = await assess_culture(session, world)
    if culture.worldview != world.worldview:
        previous = world.worldview
        world.worldview = culture.worldview
        session.add(Event(
            world_id=world.id, tick=world.tick, kind="culture:belief", actor_id=None,
            payload={"from": previous, "to": culture.worldview,
                     "stances": culture.stances, "sim_year": round(world.sim_year, 1)},
        ))
        return culture.worldview
    return None
