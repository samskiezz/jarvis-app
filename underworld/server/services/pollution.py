"""Pollution model (doc I.36).

Industrial activity contaminates the world. Emissions scale with the tech era
(an information-age factory pollutes far more than a stone-age camp), population,
and recent invention output; pollution decays slowly through natural processes
and remediation. When it rises high enough it harms the living — a steady health
drain standing in for respiratory disease, contaminated water, and bad air.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World

_ERA_EMISSION = {
    "stone": 0.0, "bronze": 0.002, "iron": 0.005, "industrial": 0.02,
    "electric": 0.018, "information": 0.012, "quantum": 0.006,
}
DECAY = 0.04            # natural + remediation cleanup per tick
HARM_THRESHOLD = 0.5    # above this, health starts to suffer


def emission(*, era: str, population: int, inventions: int) -> float:
    base = _ERA_EMISSION.get(era, 0.0)
    return base * (1.0 + population / 100.0) + 0.001 * inventions


async def tick_pollution(session: AsyncSession, world: World, *, inventions_this_tick: int = 0) -> float:
    population = int(await session.scalar(
        select(func.count(Minion.id)).where(
            Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0)
    emitted = emission(era=world.era, population=population, inventions=inventions_this_tick)
    before = world.pollution or 0.0
    world.pollution = max(0.0, min(1.0, before + emitted - DECAY * before))

    if world.pollution > HARM_THRESHOLD:
        harm = 0.02 * (world.pollution - HARM_THRESHOLD)
        for m in (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all():
            m.health = max(0.0, m.health - harm)
        if world.tick % 10 == 0:
            session.add(Event(
                world_id=world.id, tick=world.tick, kind="environment:pollution", actor_id=None,
                payload={"level": round(world.pollution, 3), "harm_per_minion": round(harm, 4)},
            ))
    return round(world.pollution, 4)
