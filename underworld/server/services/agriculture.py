"""Agriculture as a live field (doc I.13).

Crops grow as a function of the world's climate (season, temperature, weather) and
its soil. Farming draws down soil fertility; fallow ground recovers it, faster
when it's most depleted (a stand-in for crop rotation / natural replenishment). A
good harvest feeds the population; a crop failure during the growing season bites.
This couples the climate field to the food supply alongside the wildlife
ecosystem.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World

_SEASON_GROWTH = {"spring": 0.9, "summer": 1.0, "autumn": 0.6, "winter": 0.1}
_WEATHER_GROWTH = {"rain": 1.1, "cloudy": 1.0, "clear": 0.9, "storm": 0.7, "snow": 0.3}


def _temp_factor(temp: float) -> float:
    if temp < 0:
        return 0.0
    if temp < 10:
        return 0.5
    if temp <= 25:
        return 1.0
    if temp <= 35:
        return 0.6
    return 0.2


def growing_factor(season: str, temperature: float, weather: str) -> float:
    g = _SEASON_GROWTH.get(season, 0.6) * _temp_factor(temperature) * _WEATHER_GROWTH.get(weather, 1.0)
    return round(max(0.0, min(1.0, g)), 4)


async def tick_agriculture(session: AsyncSession, world: World) -> dict:
    gf = growing_factor(world.season, world.temperature or 15.0, world.weather)
    fert = world.soil_fertility if world.soil_fertility is not None else 0.7
    crop = round(fert * gf, 4)
    world.crop_yield = crop

    # Farming depletes nutrients while growing; fallow ground recovers (more when poor).
    fert = fert - 0.02 * gf + 0.02 * (1.0 - fert)
    world.soil_fertility = round(max(0.05, min(1.0, fert)), 4)

    alive = (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all()
    if crop > 0.4:                       # a good harvest feeds people
        for m in alive:
            m.hunger = min(1.0, m.hunger + 0.03 * crop)
    elif gf > 0.3 and crop < 0.15:       # crop failure in the growing season
        for m in alive:
            m.hunger = max(0.0, m.hunger - 0.03)
        if world.tick % 10 == 0:
            session.add(Event(
                world_id=world.id, tick=world.tick, kind="agriculture:failure", actor_id=None,
                payload={"season": world.season, "crop_yield": crop,
                         "soil_fertility": world.soil_fertility},
            ))
    return {"crop_yield": crop, "soil_fertility": world.soil_fertility, "growing_factor": gf}
