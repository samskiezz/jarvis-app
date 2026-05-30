"""Dynamic time-scaling (doc I.16).

Early ages run fast and later, detailed ages run slow. Rather than changing the
real-time tick cadence, we advance the *in-world calendar* by a complexity-scaled
amount each tick: a sparse stone-age world rockets through decades per tick, a
dense high-tech world creeps forward a fraction of a year per tick.
"""

from __future__ import annotations

MAX_YEARS_PER_TICK = 50.0
MIN_YEARS_PER_TICK = 0.2

_ERA_INDEX = {
    "stone": 0, "bronze": 1, "iron": 2, "industrial": 3,
    "electric": 4, "information": 5, "quantum": 6,
}


def complexity(*, population: int, inventions: int, era: str) -> float:
    """A rough measure of how much is going on — drives the slowdown."""
    return population + 2.0 * inventions + 40.0 * _ERA_INDEX.get(era, 0)


def years_per_tick(*, population: int, inventions: int, era: str) -> float:
    c = complexity(population=population, inventions=inventions, era=era)
    return round(max(MIN_YEARS_PER_TICK, MAX_YEARS_PER_TICK / (1.0 + c / 20.0)), 4)
