"""Fluid / water dynamics as a live field (doc I.6, I.29).

The water table is recharged by precipitation (drawn from the climate weather)
and drawn down by evaporation (scaling with temperature) and consumption. When it
runs dry the land is in drought — the living grow thirsty faster and crops suffer;
when a storm tops off an already-saturated table it floods, damaging the living.
This closes the water cycle between climate and the population.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World

_RECHARGE = {"rain": 0.09, "storm": 0.15, "snow": 0.03, "cloudy": -0.01, "clear": -0.04}
DROUGHT_BELOW = 0.2
FLOOD_ABOVE = 0.9


def _evaporation(temp: float) -> float:
    return max(0.0, (temp - 15.0) / 100.0)   # hotter → more loss


async def tick_hydrology(session: AsyncSession, world: World) -> dict:
    level = world.water_table if world.water_table is not None else 0.6
    level += _RECHARGE.get(world.weather, 0.0)
    level -= _evaporation(world.temperature or 15.0)
    level -= 0.005                              # baseline consumption
    flooded = level > FLOOD_ABOVE and world.weather == "storm"
    level = max(0.0, min(1.0, level))
    world.water_table = round(level, 4)

    alive = (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all()
    state = "normal"
    if level < DROUGHT_BELOW:
        state = "drought"
        for m in alive:
            m.thirst = max(0.0, m.thirst - 0.05 * (DROUGHT_BELOW - level) / DROUGHT_BELOW)
    elif flooded:
        state = "flood"
        for m in alive:
            m.health = max(0.0, m.health - 0.03)
            m.stress = min(1.0, m.stress + 0.05)

    if state != "normal" and world.tick % 8 == 0:
        session.add(Event(
            world_id=world.id, tick=world.tick, kind=f"hydrology:{state}", actor_id=None,
            payload={"water_table": world.water_table, "weather": world.weather},
        ))
    return {"water_table": world.water_table, "state": state}
