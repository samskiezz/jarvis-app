"""Electrical grid load + Joule-heating fires (wiring expansion #42/#47).

Once a civilization electrifies, its grid carries a load that scales with
population and industrial output. Infrastructure sets the grid's capacity (wire
gauge, transformers, breakers). When load exceeds capacity the conductors run hot
— I²R Joule heating beyond what they can shed — and can start an electrical fire
that damages people and sets back infrastructure. Build the grid properly and it's
safe; under-build it and it burns.
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Invention, Minion, TaskStatus, World
from ..physics.electrical import joule_heat

ELECTRIC_ERAS = {"electric", "information", "quantum"}


def grid_load(population: int, inventions: int) -> float:
    """Absolute electrical demand from people + industry."""
    return 0.02 * population + 0.05 * inventions


def grid_capacity(infrastructure: float, population: int = 100) -> float:
    """A grid built in proportion to population, its quality set by infrastructure.
    Under-built (low-infra) grids can't keep up with demand → overload."""
    infra = max(0.0, min(1.0, infrastructure))
    return 0.02 * population * (0.4 + 1.2 * infra) + 0.3


def is_overloaded(load: float, capacity: float) -> bool:
    return load > capacity


async def tick_grid(session: AsyncSession, world: World, rng: random.Random) -> str | None:
    if world.era not in ELECTRIC_ERAS:
        return None
    pop = int(await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0)
    inv = int(await session.scalar(
        select(func.count(Invention.id)).where(
            Invention.world_id == world.id, Invention.status == TaskStatus.APPROVED)
    ) or 0)
    infra = world.infrastructure if world.infrastructure is not None else 0.1
    load = grid_load(pop, inv)
    capacity = grid_capacity(infra, pop)
    if not is_overloaded(load, capacity):
        return None

    severity = load - capacity
    if rng.random() >= min(0.6, severity):
        return None

    # I²R heat in the overloaded conductors — thin (low-infra) wiring sheds less.
    current = 10.0 + 30.0 * severity
    heat_w = joule_heat(current, 0.4 * (1.0 - infra) * 10.0)
    world.infrastructure = round(max(0.0, infra - 0.05), 4)
    for m in (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all():
        if rng.random() < 0.2:
            m.health = max(0.0, m.health - 0.1)
            m.stress = min(1.0, m.stress + 0.1)
    session.add(Event(world_id=world.id, tick=world.tick, kind="fire:electrical", actor_id=None,
                      payload={"load": round(load, 3), "capacity": round(capacity, 3),
                               "joule_w": round(heat_w, 1)}))
    return "fire"
