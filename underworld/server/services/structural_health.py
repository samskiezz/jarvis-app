"""Structural fatigue → collapse (wiring expansion #25/#24/#7).

A civilization's great structures don't last forever. Every tick adds fatigue:
load cycles from use, and big jolts from earthquakes (tectonic stress) grow the
cracks (Paris-law style). Maintenance — funded by infrastructure — repairs them.
When accumulated crack growth reaches the Griffith-critical point the structure
collapses, hurting people and setting back infrastructure, then is rebuilt.
"""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World

BASE_CYCLE = 0.008          # routine load cycling
QUAKE_FACTOR = 0.08         # crack growth per unit tectonic stress
MAINT_FACTOR = 0.02         # repair per unit infrastructure
CRITICAL = 1.0              # Griffith-critical crack → collapse


def crack_growth(*, tectonic_stress: float, infrastructure: float) -> float:
    """Net change in normalized crack length this tick (Paris growth − maintenance)."""
    return BASE_CYCLE + QUAKE_FACTOR * tectonic_stress - MAINT_FACTOR * infrastructure


async def tick_structures(session: AsyncSession, world: World, rng: random.Random) -> str | None:
    infra = world.infrastructure if world.infrastructure is not None else 0.1
    fatigue = (world.structure_fatigue or 0.0) + crack_growth(
        tectonic_stress=world.tectonic_stress or 0.0, infrastructure=infra)
    fatigue = max(0.0, fatigue)

    if fatigue >= CRITICAL:
        world.structure_fatigue = 0.2     # collapsed + rebuilt with residual damage
        world.infrastructure = round(max(0.0, infra - 0.15), 4)
        for m in (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all():
            if rng.random() < 0.25:
                m.health = max(0.0, m.health - 0.12)
                m.stress = min(1.0, m.stress + 0.1)
        session.add(Event(world_id=world.id, tick=world.tick, kind="structure:collapse",
                          actor_id=None, payload={"cause": "fatigue + Griffith-critical crack"}))
        return "collapse"

    world.structure_fatigue = round(fatigue, 5)
    return None
