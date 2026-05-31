"""Live epidemics — the SIR law made to bite (doc I.67, wiring expansion #67).

A world occasionally suffers an outbreak. Its spread is governed by the SIR model
from the physics layer, with the transmission rate β raised by pollution and poor
infrastructure (crowding + bad sanitation) and the recovery rate γ raised by good
infrastructure (hospitals/clean water). While an outbreak runs, a fraction of the
living lose health each tick in proportion to the infected share; recovered
individuals are immune. Out grows an epidemic only when R0 = β/γ > 1.
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World
from ..physics.epidemiology import SIR, r0, sir_step

BASE_BETA = 0.35
BASE_GAMMA = 0.12
SEED_FRACTION = 0.03
CONTAINED_BELOW = 0.005
OUTBREAK_CHANCE = 0.02


def rates(*, pollution: float, infrastructure: float) -> tuple[float, float]:
    beta = BASE_BETA * (1.0 + 0.6 * pollution) * (1.0 + 0.4 * (1.0 - infrastructure))
    gamma = BASE_GAMMA * (1.0 + 0.8 * infrastructure)
    return beta, gamma


async def tick_disease(session: AsyncSession, world: World, rng: random.Random) -> dict:
    pop = int(await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0)
    pollution = world.pollution or 0.0
    infra = world.infrastructure if world.infrastructure is not None else 0.1

    # Start an outbreak?
    if not world.epidemic_active and pop >= 8 and rng.random() < OUTBREAK_CHANCE:
        world.epidemic_active = True
        world.epidemic_infected = SEED_FRACTION
        world.epidemic_recovered = 0.0
        session.add(Event(world_id=world.id, tick=world.tick, kind="disease:outbreak",
                          actor_id=None, payload={"infected": SEED_FRACTION}))

    if not world.epidemic_active:
        return {"active": False, "infected": 0.0, "recovered": world.epidemic_recovered or 0.0}

    beta, gamma = rates(pollution=pollution, infrastructure=infra)
    I = world.epidemic_infected or 0.0
    R = world.epidemic_recovered or 0.0
    nxt = sir_step(SIR(S=max(0.0, 1.0 - I - R), I=I, R=R), beta=beta, gamma=gamma, dt=1.0)
    world.epidemic_infected = round(nxt.I, 5)
    world.epidemic_recovered = round(nxt.R, 5)

    # The sick lose health in proportion to the infected share.
    if nxt.I > 0:
        for m in (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all():
            if rng.random() < nxt.I:
                m.health = max(0.0, m.health - 0.08)
                m.stress = min(1.0, m.stress + 0.05)

    if world.epidemic_infected < CONTAINED_BELOW:
        world.epidemic_active = False
        world.epidemic_infected = 0.0
        session.add(Event(world_id=world.id, tick=world.tick, kind="disease:contained",
                          actor_id=None, payload={"recovered": world.epidemic_recovered}))

    return {"active": world.epidemic_active, "infected": world.epidemic_infected,
            "recovered": world.epidemic_recovered, "r0": round(r0(beta, gamma), 3)}
