"""Live climate as world state (doc I.5, I.28-30).

Each tick the world's physical environment advances: the season cycles with the
in-world calendar, the ambient temperature is computed from season + day/night +
the biome/elevation the seed produced, and weather is drawn from that temperature.
The result feeds back onto the living — cold and heat stress drain health and
energy, storms unsettle, snow bites — so survival genuinely depends on the
physical world, not just social dynamics. This is the thermodynamic/weather field
the simulation previously only had as inert formulas.
"""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, World
from ..world.seed import derive_seed
from . import lifecycle

SEASONS = ("spring", "summer", "autumn", "winter")
_SEASON_BASE = {"spring": 12.0, "summer": 27.0, "autumn": 12.0, "winter": -2.0}
_BIOME_ADJ = {"desert": 9.0, "mountains": -7.0, "plateau": -3.0,
              "forest": -1.0, "hills": 0.0, "plains": 1.0}

# Comfortable band; outside it Minions suffer thermal stress.
COMFORT_LOW, COMFORT_HIGH = 5.0, 30.0


def season_for(sim_year: float) -> str:
    return SEASONS[int((sim_year % 1.0) * 4) % 4]


def base_temperature(season: str, biome: str, elevation_bias: float, *, night: bool) -> float:
    temp = _SEASON_BASE.get(season, 12.0)
    temp -= 16.0 * elevation_bias               # higher / mountainous worlds are colder
    temp += _BIOME_ADJ.get(biome, 0.0)
    if night:
        temp -= 7.0                              # doc I.1 day/night now bites
    return temp


def pick_weather(temp: float, rng: random.Random) -> str:
    if temp <= 0.0 and rng.random() < 0.6:
        return "snow"
    r = rng.random()
    if r < 0.5:
        return "clear"
    if r < 0.72:
        return "cloudy"
    if r < 0.9:
        return "rain"
    return "storm"


def thermal_stress(temp: float) -> float:
    """0 inside the comfort band, rising as it gets colder/hotter."""
    if temp < COMFORT_LOW:
        return (COMFORT_LOW - temp) / 25.0
    if temp > COMFORT_HIGH:
        return (temp - COMFORT_HIGH) / 25.0
    return 0.0


async def tick_climate(session: AsyncSession, world: World, rng: random.Random) -> dict:
    seed = derive_seed(world.seed_class)
    season = season_for(world.sim_year or 0.0)
    night = lifecycle.is_night(world.tick)
    temp = base_temperature(season, seed.biome_hint, seed.elevation_bias, night=night)
    temp += rng.uniform(-3.0, 3.0)
    weather = pick_weather(temp, rng)
    if weather == "storm":
        temp -= 2.0
    world.season = season
    world.temperature = round(temp, 1)
    world.weather = weather

    stress = thermal_stress(temp)
    if stress > 0.0 or weather == "storm":
        for m in (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all():
            if stress > 0.0:
                m.health = max(0.0, m.health - 0.03 * stress)
                m.fatigue = max(0.0, m.fatigue - 0.04 * stress)
            if weather == "storm":
                m.stress = min(1.0, m.stress + 0.03)
        if (stress > 0.4 or weather == "storm") and world.tick % 5 == 0:
            session.add(Event(
                world_id=world.id, tick=world.tick, kind="climate:extreme", actor_id=None,
                payload={"season": season, "temperature": world.temperature, "weather": weather},
            ))
    return {"season": season, "temperature": world.temperature, "weather": weather}
