"""Geologically-plausible resource distribution (doc I.3).

Resources don't spawn at random — they follow the terrain the seed produced:
- metal ores + rare earths surface in high, mountainous, igneous terrain;
- coal / oil / gas pool in low, flat sedimentary basins (ancient seas);
- water tables sit under moderate, low-lying ground;
- timber grows on temperate mid-elevation; clay + stone are broadly available.

Everything is a pure function of (WorldSeed, heightmap), so a given world always
has the same geology — an "Aerospace" (mountain) world is ore-rich, an
"Agriculture" (plains) world is fuel/water-rich.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from .seed import WorldSeed, heightmap

# resource → which materials it ultimately yields (links to the materials DB)
RESOURCE_MATERIALS: dict[str, tuple[str, ...]] = {
    "iron_ore": ("iron",),
    "copper_ore": ("copper",),
    "tin_ore": ("tin",),
    "gold": ("gold",),
    "rare_earths": ("silicon",),
    "coal": (),
    "oil": ("plastic", "rubber"),
    "stone": ("stone", "granite"),
    "clay": ("clay", "brick"),
    "timber": ("wood",),
    "water": (),
}


@dataclass(frozen=True)
class Deposit:
    resource: str
    richness: float   # 0..1
    x: int
    y: int


def _cell_rng(seed: WorldSeed, x: int, y: int) -> random.Random:
    return random.Random((seed.seed_int ^ (x * 73856093) ^ (y * 19349663)) & 0x7FFFFFFFFFFFFFFF)


def deposit_at(seed: WorldSeed, elevation: float, x: int, y: int) -> dict[str, float]:
    """Return {resource: richness} for one cell given its elevation."""
    rng = _cell_rng(seed, x, y)
    out: dict[str, float] = {}

    def place(resource: str, base: float) -> None:
        # noisy threshold so deposits are patchy, not uniform
        if rng.random() < base:
            out[resource] = round(min(1.0, base * rng.uniform(0.5, 1.5)), 3)

    high = max(0.0, elevation - 0.6) / 0.4        # 0 at 0.6, 1 at 1.0
    low = max(0.0, 0.4 - elevation) / 0.4         # 0 at 0.4, 1 at 0.0
    mid = 1.0 - abs(elevation - 0.5) * 2.0        # peaks at 0.5

    # Igneous / mountain ores
    place("iron_ore", 0.10 + 0.45 * high)
    place("copper_ore", 0.06 + 0.30 * high)
    place("tin_ore", 0.04 + 0.20 * high)
    place("gold", 0.01 + 0.10 * high)
    place("rare_earths", 0.005 + 0.08 * high)
    place("stone", 0.20 + 0.40 * high)
    # Sedimentary basin fuels + water
    place("coal", 0.05 + 0.35 * low)
    place("oil", 0.02 + 0.25 * low)
    place("water", 0.10 + 0.50 * low)
    place("clay", 0.10 + 0.30 * low)
    # Temperate mid-elevation
    place("timber", 0.10 + 0.40 * max(0.0, mid))
    return out


def survey(seed: WorldSeed, *, size: int = 32) -> dict[str, dict]:
    """Aggregate the whole world's geology into a per-resource summary:
    total richness, deposit count, and the richest cell."""
    grid = heightmap(seed, size=size)
    totals: dict[str, dict] = {}
    for y in range(size):
        for x in range(size):
            for resource, richness in deposit_at(seed, grid[y][x], x, y).items():
                agg = totals.setdefault(
                    resource, {"total": 0.0, "deposits": 0, "peak": 0.0, "peak_cell": [x, y]}
                )
                agg["total"] = round(agg["total"] + richness, 3)
                agg["deposits"] += 1
                if richness > agg["peak"]:
                    agg["peak"] = richness
                    agg["peak_cell"] = [x, y]
    return totals


def richest_deposits(seed: WorldSeed, *, size: int = 32, limit: int = 20) -> list[Deposit]:
    grid = heightmap(seed, size=size)
    found: list[Deposit] = []
    for y in range(size):
        for x in range(size):
            for resource, richness in deposit_at(seed, grid[y][x], x, y).items():
                found.append(Deposit(resource=resource, richness=richness, x=x, y=y))
    found.sort(key=lambda d: d.richness, reverse=True)
    return found[:limit]
