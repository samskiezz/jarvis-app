"""Ecosystem dynamics + overhunting collapse (doc I.35).

Wildlife follows a discrete Lotka-Volterra predator-prey cycle, plus harvest
pressure from the Minions who hunt for food. Hunt sustainably and prey recover;
hunt too hard and prey crash below a minimum viable population — a trophic
collapse that triggers famine. Prey level is the world's food availability, which
feeds back into how fast the living go hungry.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World

GROWTH = 0.4            # prey intrinsic growth toward carrying capacity (=1)
PREDATION = 0.6         # predator take of prey
PRED_EFFICIENCY = 0.5   # prey → predator conversion
PRED_DEATH = 0.3        # predator starvation
HARVEST_PER_HUNTER = 0.0009
COLLAPSE_BELOW = 0.15   # prey fraction that counts as collapsed


@dataclass(frozen=True)
class EcoStep:
    prey: float
    predator: float
    harvest: float


def step(prey: float, predator: float, hunters: int) -> EcoStep:
    harvest = min(prey, HARVEST_PER_HUNTER * hunters * prey)
    new_prey = prey + GROWTH * prey * (1.0 - prey) - PREDATION * prey * predator - harvest
    new_pred = predator + PRED_EFFICIENCY * PREDATION * prey * predator - PRED_DEATH * predator
    return EcoStep(
        prey=max(0.0, min(2.0, new_prey)),
        predator=max(0.0, min(2.0, new_pred)),
        harvest=round(harvest, 5),
    )


async def tick_ecosystem(session: AsyncSession, world: World, hunters: int) -> float:
    """Advance wildlife one tick. Returns food availability (= prey fraction)."""
    prey_before = world.prey_pop if world.prey_pop is not None else 1.0
    pred_before = world.predator_pop if world.predator_pop is not None else 0.25
    s = step(prey_before, pred_before, hunters)
    world.prey_pop = round(s.prey, 4)
    world.predator_pop = round(s.predator, 4)

    if s.prey < COLLAPSE_BELOW <= prey_before:
        session.add(Event(
            world_id=world.id, tick=world.tick, kind="ecosystem:collapse", actor_id=None,
            payload={"prey": world.prey_pop, "predator": world.predator_pop,
                     "hunters": hunters},
        ))
    return world.prey_pop


async def apply_famine(session: AsyncSession, world: World, food: float) -> None:
    """When food is scarce, the living go hungry faster (extra hunger drain)."""
    if food >= 0.4:
        return
    extra = 0.06 * (0.4 - food)
    for m in (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all():
        m.hunger = max(0.0, m.hunger - extra)
