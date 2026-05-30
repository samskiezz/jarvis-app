"""Chemistry engine — reactions, smelting, combustion, pH (doc I.11).

Reactions obey the physical properties already in the materials database: an ore
only smelts into its metal once the temperature exceeds that metal's melting
point; combustion of a fuel with oxygen releases energy; two metals form an alloy
(rule-of-mixtures or a known recipe); an acid and a base neutralise to salt +
water. So chemistry is grounded in the same physics as the rest of the world, not
a lookup of magic recipes.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..knowledge import materials as materials_db
from ..world.resources import RESOURCE_MATERIALS

# fuel → energy density (MJ/kg, approximate) released on combustion
_FUEL_ENERGY = {"coal": 30.0, "oil": 42.0, "wood": 16.0, "timber": 16.0}
# ore → metal it yields when smelted
_SMELT = {ore: mats[0] for ore, mats in RESOURCE_MATERIALS.items() if mats and ore.endswith("_ore")}
_SMELT.update({"iron_ore": "iron", "copper_ore": "copper", "tin_ore": "tin"})


@dataclass(frozen=True)
class ReactionResult:
    products: list[str]
    energy_mj: float = 0.0
    ph: float | None = None
    succeeded: bool = True
    notes: list[str] = field(default_factory=list)


def react(reactants: list[str], *, temperature_c: float | None = None) -> ReactionResult:
    items = [r.strip().lower() for r in reactants if r and r.strip()]
    s = set(items)

    # Combustion: a fuel + oxygen, given enough heat to ignite.
    fuel = next((f for f in _FUEL_ENERGY if f in s), None)
    if fuel and "oxygen" in s:
        if temperature_c is not None and temperature_c < 200:
            return ReactionResult(products=[fuel, "oxygen"], succeeded=False,
                                  notes=["Below ignition temperature."])
        return ReactionResult(products=["carbon_dioxide", "ash"], energy_mj=_FUEL_ENERGY[fuel],
                              notes=[f"Combustion of {fuel} released {_FUEL_ENERGY[fuel]} MJ/kg."])

    # Neutralisation: acid + base → salt + water (pH 7).
    if "acid" in s and "base" in s:
        return ReactionResult(products=["salt", "water"], ph=7.0,
                              notes=["Acid + base neutralised to a salt and water."])

    # Smelting: an ore → its metal, if hot enough to melt that metal.
    ore = next((o for o in _SMELT if o in s), None)
    if ore:
        metal = _SMELT[ore]
        mat = materials_db.get(metal)
        needed = mat.melting_point_c if mat else 1500.0
        if temperature_c is None or temperature_c < needed:
            return ReactionResult(products=[ore], succeeded=False,
                                  notes=[f"Smelting {ore} needs ≥{needed:.0f}°C (got "
                                         f"{temperature_c if temperature_c is not None else 'n/a'})."])
        return ReactionResult(products=[metal], energy_mj=0.0,
                              notes=[f"Smelted {ore} → {metal} at {temperature_c:.0f}°C."])

    # Alloying: two metals combine.
    metals = [m for m in items if (mat := materials_db.get(m)) and mat.category in {"metal", "alloy"}]
    if len(metals) >= 2:
        alloy = materials_db.alloy(metals[0], metals[1])
        return ReactionResult(products=[alloy.name],
                              notes=[f"Alloyed {metals[0]} + {metals[1]} → {alloy.name}."])

    return ReactionResult(products=items, succeeded=False, notes=["No known reaction."])
