"""A materials database with scientifically accurate properties (doc I.4).

Every material carries a full property sheet, so the rest of the simulation can
reason about it physically: whether a beam stands (structures), whether a wire
conducts, what melts at a forge temperature, what alloy results from mixing two
metals (bronze = copper + tin).

Values are real-world approximations in SI-friendly units:
- density           kg/m^3
- melting_point_c   degrees Celsius
- tensile_mpa       ultimate tensile strength, MPa (= N/mm^2)
- compressive_mpa   ultimate compressive strength, MPa
- youngs_gpa        Young's modulus, GPa
- thermal_wmk       thermal conductivity, W/(m*K)
- resistivity_ohm_m electrical resistivity, ohm*metre (lower = better conductor)
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Material:
    name: str
    category: str
    density: float
    melting_point_c: float
    tensile_mpa: float
    compressive_mpa: float
    youngs_gpa: float
    thermal_wmk: float
    resistivity_ohm_m: float

    @property
    def conducts(self) -> bool:
        return self.resistivity_ohm_m < 1e-3


_MATERIALS: dict[str, Material] = {
    m.name: m for m in (
        # name, category, density, melt°C, tensile, compressive, E(GPa), k(W/mK), resistivity
        Material("wood", "organic", 600, 300, 40, 30, 11, 0.15, 1e14),
        Material("bamboo", "organic", 700, 300, 140, 50, 20, 0.2, 1e13),
        Material("bone", "organic", 1800, 600, 130, 170, 18, 0.4, 1e9),
        Material("clay", "ceramic", 1900, 1000, 3, 30, 8, 1.0, 1e10),
        Material("brick", "ceramic", 1920, 1200, 5, 28, 14, 0.7, 1e11),
        Material("stone", "ceramic", 2700, 1260, 15, 200, 60, 2.5, 1e12),
        Material("granite", "ceramic", 2700, 1260, 20, 200, 60, 2.9, 1e12),
        Material("concrete", "ceramic", 2400, 1500, 4, 40, 30, 1.7, 1e9),
        Material("glass", "ceramic", 2500, 1450, 50, 1000, 70, 1.0, 1e12),
        Material("ceramic", "ceramic", 3900, 2050, 300, 3000, 370, 30, 1e12),
        Material("copper", "metal", 8960, 1085, 210, 210, 117, 401, 1.68e-8),
        Material("tin", "metal", 7265, 232, 15, 15, 50, 67, 1.09e-7),
        Material("bronze", "metal", 8800, 950, 350, 350, 110, 60, 1.0e-7),
        Material("iron", "metal", 7870, 1538, 350, 350, 211, 80, 9.7e-8),
        Material("steel", "metal", 7850, 1450, 540, 540, 200, 50, 1.4e-7),
        Material("aluminium", "metal", 2700, 660, 310, 310, 69, 237, 2.65e-8),
        Material("titanium", "metal", 4506, 1668, 434, 434, 116, 22, 4.2e-7),
        Material("gold", "metal", 19300, 1064, 120, 120, 79, 318, 2.44e-8),
        Material("silver", "metal", 10490, 962, 170, 170, 83, 429, 1.59e-8),
        Material("lead", "metal", 11340, 327, 18, 18, 16, 35, 2.2e-7),
        Material("tungsten", "metal", 19250, 3422, 980, 980, 411, 173, 5.6e-8),
        Material("silicon", "semiconductor", 2330, 1414, 165, 700, 130, 150, 6.4e2),
        Material("rubber", "polymer", 1100, 180, 16, 10, 0.05, 0.15, 1e13),
        Material("plastic", "polymer", 950, 130, 35, 60, 2, 0.2, 1e14),
        Material("carbon_fibre", "composite", 1600, 3600, 3500, 1600, 230, 10, 1e-5),
    )
}


def get(name: str) -> Material | None:
    return _MATERIALS.get(name.strip().lower())


def all_materials() -> list[Material]:
    return list(_MATERIALS.values())


def by_category(category: str) -> list[Material]:
    return [m for m in _MATERIALS.values() if m.category == category]


def strongest(*, by: str = "tensile_mpa") -> Material:
    return max(_MATERIALS.values(), key=lambda m: getattr(m, by))


def best_conductor() -> Material:
    return min(_MATERIALS.values(), key=lambda m: m.resistivity_ohm_m)


# Known alloy recipes — mixing produces emergent properties (doc I.4).
_ALLOYS: dict[frozenset[str], str] = {
    frozenset({"copper", "tin"}): "bronze",
    frozenset({"iron", "carbon_fibre"}): "steel",  # iron + carbon → steel (approx)
}


def alloy(a: str, b: str, ratio: float = 0.5) -> Material:
    """Mix two materials. A known recipe yields its named alloy; otherwise a
    rule-of-mixtures blend (weighted average of properties)."""
    ma, mb = get(a), get(b)
    if ma is None or mb is None:
        raise ValueError(f"unknown material in alloy({a!r}, {b!r})")
    named = _ALLOYS.get(frozenset({ma.name, mb.name}))
    if named and get(named):
        return get(named)  # type: ignore[return-value]
    r = max(0.0, min(1.0, ratio))

    def blend(attr: str) -> float:
        return round(r * getattr(ma, attr) + (1 - r) * getattr(mb, attr), 4)

    return Material(
        name=f"{ma.name}-{mb.name}-alloy",
        category="alloy",
        density=blend("density"),
        melting_point_c=blend("melting_point_c"),
        tensile_mpa=blend("tensile_mpa"),
        compressive_mpa=blend("compressive_mpa"),
        youngs_gpa=blend("youngs_gpa"),
        thermal_wmk=blend("thermal_wmk"),
        resistivity_ohm_m=blend("resistivity_ohm_m"),
    )
