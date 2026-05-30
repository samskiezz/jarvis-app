"""Plate tectonics as a live hazard field (doc I.28).

Stress accumulates in the crust each tick at a rate set by the world's geology
(mountainous, high-elevation seeds sit on active boundaries and build stress
faster). When accumulated stress is high it can slip suddenly in an earthquake,
releasing the stress and scaling damage by magnitude — harming the living and
setting back fragile infrastructure like the patent scanner. Civilizations on
active ground live with the risk.
"""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World
from ..world.seed import derive_seed

BUILD_BASE = 0.015
QUAKE_THRESHOLD = 0.5


def tectonic_activity(elevation_bias: float) -> float:
    """0.4 (stable plains) … 1.0 (active mountains)."""
    return round(0.4 + 0.6 * max(0.0, min(1.0, elevation_bias)), 4)


async def _apply_quake(session: AsyncSession, world: World, magnitude: float) -> None:
    dmg = 0.05 * (magnitude / 8.0)
    for m in (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all():
        m.health = max(0.0, m.health - dmg)
        m.stress = min(1.0, m.stress + 0.5 * dmg)
    world.scanner_progress = max(0, world.scanner_progress - int(12 * magnitude / 8.0))
    session.add(Event(
        world_id=world.id, tick=world.tick, kind="tectonic:earthquake", actor_id=None,
        payload={"magnitude": magnitude},
    ))


async def tick_tectonics(session: AsyncSession, world: World, rng: random.Random) -> float | None:
    """Build stress; possibly trigger an earthquake. Returns its magnitude or None."""
    activity = tectonic_activity(derive_seed(world.seed_class).elevation_bias)
    stress = (world.tectonic_stress or 0.0) + BUILD_BASE * activity
    quake_mag: float | None = None
    if stress > QUAKE_THRESHOLD and rng.random() < (stress - QUAKE_THRESHOLD) * activity:
        quake_mag = round(4.0 + 4.0 * min(1.0, stress), 1)   # Richter-ish 4-8
        stress = max(0.0, stress - 0.6)
        await _apply_quake(session, world, quake_mag)
    world.tectonic_stress = round(min(1.0, stress), 4)
    return quake_mag
