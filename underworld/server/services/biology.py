"""Multi-species biology with evolution (doc I.12, I.34).

Each world hosts several flora and fauna species. Every species carries a
heritable trait (cold tolerance) and a population. Each tick the climate exerts
selection: a species whose trait matches the current temperature thrives and its
trait drifts further toward the optimum (mutation + selection), while a maladapted
one declines and can go extinct. A thriving species occasionally speciates into a
variant with a mutated trait — genuine adaptive radiation, not cosmetics.
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Species, World

_SEED_SPECIES = (
    ("moss", "flora", 0.8), ("fern", "flora", 0.5), ("grass", "flora", 0.4),
    ("deer", "fauna", 0.45), ("hare", "fauna", 0.55), ("wolf", "fauna", 0.5),
)
EXTINCT_BELOW = 0.05
SPECIATE_ABOVE = 0.85


def climate_optimum(temperature: float) -> float:
    """The cold-tolerance trait best suited to a temperature (cold → high)."""
    return max(0.0, min(1.0, (20.0 - temperature) / 30.0 + 0.5))


def fitness(trait: float, optimum: float) -> float:
    """1 at a perfect match, falling off with mismatch."""
    return max(0.0, 1.0 - abs(trait - optimum) * 1.5)


async def ensure_seeded(session: AsyncSession, world: World) -> None:
    existing = await session.scalar(
        select(func.count(Species.id)).where(Species.world_id == world.id)
    )
    if existing:
        return
    for name, kind, cold in _SEED_SPECIES:
        session.add(Species(world_id=world.id, name=name, kind=kind, population=0.5,
                            cold_tolerance=cold, born_tick=world.tick))


async def tick_biology(session: AsyncSession, world: World, rng: random.Random) -> dict:
    await ensure_seeded(session, world)
    optimum = climate_optimum(world.temperature or 15.0)
    species = list((await session.execute(
        select(Species).where(Species.world_id == world.id, Species.alive.is_(True))
    )).scalars().all())

    extinct = 0
    speciated = 0
    for sp in species:
        fit = fitness(sp.cold_tolerance, optimum)
        # population logistic growth scaled by fitness, minus a baseline cull
        sp.population = max(0.0, min(1.0, sp.population + (fit - 0.5) * 0.1 * sp.population * (1 - sp.population) + (fit - 0.55) * 0.02))
        if sp.population < EXTINCT_BELOW:
            sp.alive = False
            extinct += 1
            session.add(Event(world_id=world.id, tick=world.tick, kind="species:extinct",
                              actor_id=None, payload={"species": sp.name, "trait": round(sp.cold_tolerance, 3)}))
            continue
        # selection nudges the trait toward the optimum (adaptation)
        sp.cold_tolerance = round(sp.cold_tolerance + (optimum - sp.cold_tolerance) * 0.05, 4)
        # a thriving species radiates into a mutated variant
        if sp.population > SPECIATE_ABOVE and rng.random() < 0.1:
            mutant = round(max(0.0, min(1.0, sp.cold_tolerance + rng.uniform(-0.2, 0.2))), 4)
            session.add(Species(world_id=world.id, name=f"{sp.name}+", kind=sp.kind,
                               population=sp.population * 0.3, cold_tolerance=mutant,
                               generation=sp.generation + 1, born_tick=world.tick))
            sp.population *= 0.8
            speciated += 1

    return {"alive": len([s for s in species if s.alive]), "extinct": extinct, "speciated": speciated}
