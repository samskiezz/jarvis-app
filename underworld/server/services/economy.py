"""Economy: scarcity, supply/demand pricing, inflation (doc I.39-40).

Trade emerges from scarcity. A world's *supply* of each resource is fixed by its
geology (the resource survey), while *demand* scales with population. The market
clears at a price that rises when demand outstrips supply — so an ore-poor plains
world prices iron dearly, and a populous world sees every price climb. Money
growing faster than goods produces inflation.
"""

from __future__ import annotations

from ..world.resources import survey
from ..world.seed import WorldSeed

# Relative intrinsic value of each tradable good.
BASE_PRICES: dict[str, float] = {
    "iron_ore": 8.0, "copper_ore": 10.0, "tin_ore": 12.0, "gold": 60.0,
    "rare_earths": 80.0, "coal": 5.0, "oil": 14.0, "stone": 2.0,
    "clay": 1.5, "timber": 3.0, "water": 1.0,
}

# Per-capita demand weight — how much each citizen wants of a good per tick.
DEMAND_WEIGHT: dict[str, float] = {
    "water": 1.0, "timber": 0.6, "stone": 0.5, "coal": 0.4, "clay": 0.3,
    "iron_ore": 0.35, "copper_ore": 0.25, "oil": 0.3, "tin_ore": 0.15,
    "gold": 0.05, "rare_earths": 0.08,
}


def clearing_price(base: float, supply: float, demand: float) -> float:
    """Market-clearing price: rises with demand, falls with supply."""
    return round(base * (demand + 1.0) / (supply + 1.0), 3)


def market(seed: WorldSeed, population: int, *, size: int = 32) -> dict[str, dict]:
    """Per-good {supply, demand, price} for a world of `population` citizens."""
    surv = survey(seed, size=size)
    out: dict[str, dict] = {}
    for good, base in BASE_PRICES.items():
        supply = float(surv.get(good, {}).get("total", 0.0))
        demand = round(population * DEMAND_WEIGHT.get(good, 0.2), 3)
        out[good] = {
            "supply": round(supply, 3),
            "demand": demand,
            "price": clearing_price(base, supply, demand),
        }
    return out


def price_index(mkt: dict[str, dict]) -> float:
    """A single consumer-price index — the average good price."""
    if not mkt:
        return 0.0
    return round(sum(g["price"] for g in mkt.values()) / len(mkt), 3)


def inflation(prev_money: float, new_money: float, prev_goods: float, new_goods: float) -> float:
    """Inflation rate when the money supply grows faster than the goods supply
    (doc I.40 — 'money grows faster than goods → prices rise')."""
    if prev_money <= 0 or prev_goods <= 0:
        return 0.0
    money_growth = new_money / prev_money
    goods_growth = max(1e-6, new_goods / prev_goods)
    return round(money_growth / goods_growth - 1.0, 4)
