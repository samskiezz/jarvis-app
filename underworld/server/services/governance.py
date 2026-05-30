"""Emergent government & legal systems (doc I.41-42).

Political and legal institutions emerge from the size, knowledge, and temperament
of a society — they are not chosen. A handful of people self-organize as a tribe;
larger groups need a chief, then a king; a literate, open, knowledgeable society
tends toward a republic or democracy, while a low-openness one hardens into
autocracy. Law tracks the same arc: unwritten custom → written codes (once writing
exists) → courts → constitutional limits. A maturing rule of law brings order,
which calms the population.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Discovery, Event, Minion, World
from . import mastery

GOVERNMENTS = ("tribe", "chiefdom", "kingdom", "autocracy", "republic", "democracy")
LEGAL_STAGES = ("customary", "codified", "courts", "constitutional")
_ORDER = {"customary": 0.0, "codified": 0.01, "courts": 0.02, "constitutional": 0.03}


@dataclass(frozen=True)
class Society:
    government: str
    legal_system: str
    population: int
    avg_openness: float


def government_for(*, population: int, avg_openness: float) -> str:
    if population < 8:
        return "tribe"
    if population < 20:
        return "chiefdom"
    if population < 45:
        return "kingdom"
    # large societies branch on temperament
    if avg_openness > 0.6:
        return "democracy"
    if avg_openness > 0.5:
        return "republic"
    return "autocracy"


def legal_for(*, population: int, knowledge: float, has_writing: bool) -> str:
    if population < 10:
        return "customary"
    if not has_writing:
        return "customary"
    if knowledge < 120:
        return "codified"
    if knowledge < 260:
        return "courts"
    return "constitutional"


async def assess_society(session: AsyncSession, world: World) -> Society:
    row = (await session.execute(
        select(func.count(Minion.id), func.avg(Minion.openness))
        .where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).first()
    pop = int(row[0] or 0)
    avg_open = float(row[1] or 0.5)
    knowledge, _m = await mastery.world_knowledge(session, world.id)
    has_writing = (await session.scalar(
        select(func.count(Discovery.id)).where(
            Discovery.world_id == world.id, Discovery.tech == "writing")
    ) or 0) > 0
    return Society(
        government=government_for(population=pop, avg_openness=avg_open),
        legal_system=legal_for(population=pop, knowledge=knowledge, has_writing=has_writing),
        population=pop,
        avg_openness=round(avg_open, 3),
    )


async def tick_governance(session: AsyncSession, world: World) -> dict:
    """Recompute institutions; log any change; apply the calming effect of order."""
    soc = await assess_society(session, world)
    changed = {}
    if soc.government != world.government:
        session.add(Event(world_id=world.id, tick=world.tick, kind="society:government",
                          actor_id=None, payload={"from": world.government, "to": soc.government}))
        world.government = soc.government
        changed["government"] = soc.government
    if soc.legal_system != world.legal_system:
        session.add(Event(world_id=world.id, tick=world.tick, kind="society:law",
                          actor_id=None, payload={"from": world.legal_system, "to": soc.legal_system}))
        world.legal_system = soc.legal_system
        changed["legal_system"] = soc.legal_system

    # Rule of law brings order — a small, ongoing calming of the population.
    calm = _ORDER.get(world.legal_system, 0.0)
    if calm > 0:
        for m in (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all():
            m.stress = max(0.0, m.stress - calm)
    return changed
