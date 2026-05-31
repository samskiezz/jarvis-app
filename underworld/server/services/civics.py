"""Civic systems — urban planning, conflict/diplomacy, entertainment (doc I.43-44/48).

- Urban planning (#44): infrastructure (roads, utilities, zoning) grows with
  knowledge + population and, once substantial, eases the stress of crowding.
- War & diplomacy (#43): social tension builds from scarcity (failing crops, dry
  wells, pollution) and weak rule of law; left high it erupts into conflict that
  harms the population, while abundance + strong law lets tension cool into peace.
- Entertainment (#48): era-appropriate recreation (contests → theatre → cinema →
  VR) periodically lifts the population's morale and sanity.
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World
from . import mastery

_LEGAL_ORDER = {"customary": 0.2, "codified": 0.5, "courts": 0.75, "constitutional": 1.0}

_ENTERTAINMENT_BY_ERA = {
    "stone": "foot races", "bronze": "wrestling games", "iron": "arena contests",
    "industrial": "theatre", "electric": "cinema", "information": "video games",
    "quantum": "virtual reality",
}


# ── #44 urban planning ───────────────────────────────────────────────────────
async def tick_infrastructure(session: AsyncSession, world: World) -> float:
    knowledge, _m = await mastery.world_knowledge(session, world.id)
    pop = int(await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0)
    infra = world.infrastructure if world.infrastructure is not None else 0.1
    # planning capacity scales with knowledge per capita; sprawl (decay) with size
    growth = 0.01 * min(2.0, knowledge / max(1, pop) / 4.0) - 0.002
    infra = max(0.0, min(1.0, infra + growth))
    world.infrastructure = round(infra, 4)
    if infra > 0.5 and pop > 0:               # good planning eases crowding stress
        for m in (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all():
            m.stress = max(0.0, m.stress - 0.01 * (infra - 0.5))
    return world.infrastructure


# ── #43 war & diplomacy ──────────────────────────────────────────────────────
def conflict_pressure(*, food: float, water: float, pollution: float, legal_order: float) -> float:
    return round(max(0.0, min(1.0,
        0.25 * (1 - food) + 0.25 * (1 - water) + 0.2 * pollution + 0.3 * (1 - legal_order))), 4)


async def tick_conflict(session: AsyncSession, world: World, rng: random.Random) -> str | None:
    legal_order = _LEGAL_ORDER.get(world.legal_system, 0.2)
    pressure = conflict_pressure(
        food=world.crop_yield if world.crop_yield is not None else 0.5,
        water=world.water_table if world.water_table is not None else 0.6,
        pollution=world.pollution or 0.0,
        legal_order=legal_order,
    )
    cur = world.tension or 0.0
    world.tension = round(max(0.0, min(1.0, cur + (pressure - cur) * 0.2)), 4)

    if world.tension > 0.6 and rng.random() < (world.tension - 0.6):
        people = (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all()
        hurt = 0
        for m in people:
            if rng.random() < 0.3:
                m.health = max(0.0, m.health - 0.15)
                m.stress = min(1.0, m.stress + 0.2)
                hurt += 1
        world.tension = max(0.0, world.tension - 0.3)   # the eruption releases pressure
        session.add(Event(world_id=world.id, tick=world.tick, kind="society:conflict",
                          actor_id=None, payload={"tension": world.tension, "casualties_risk": hurt}))
        return "conflict"
    if world.tension < 0.2 and rng.random() < 0.1:
        session.add(Event(world_id=world.id, tick=world.tick, kind="society:treaty",
                          actor_id=None, payload={"tension": world.tension}))
        return "treaty"
    return None


# ── #48 entertainment ────────────────────────────────────────────────────────
def entertainment_for(era: str) -> str:
    return _ENTERTAINMENT_BY_ERA.get(era, "foot races")


async def tick_entertainment(session: AsyncSession, world: World) -> str:
    form = entertainment_for(world.era)
    for m in (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all():
        m.sanity = min(1.0, m.sanity + 0.02)
        if m.morale is not None:
            m.morale = min(1.0, m.morale + 0.02)
    session.add(Event(world_id=world.id, tick=world.tick, kind="society:festival",
                      actor_id=None, payload={"form": form}))
    return form
