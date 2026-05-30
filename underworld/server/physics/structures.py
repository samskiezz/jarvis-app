"""Structural integrity model (doc I.7).

Given a member (column in compression or beam in bending), its material, geometry
and load, decide whether it stands. Improper design — too long a span, too thin a
section, too weak a material — fails, exactly as real physics demands. This is
what lets the simulation reward sound engineering and punish ziggurats that ignore
the stone.

Uses real strength-of-materials formulae in SI units. Strengths come from the
materials database (MPa → Pa).
"""

from __future__ import annotations

from dataclasses import dataclass

from ..knowledge import materials as materials_db

# A member is safe if its capacity exceeds demand by this margin.
DEFAULT_SAFETY_FACTOR = 1.5


@dataclass(frozen=True)
class StructuralResult:
    material: str
    member: str
    stress_pa: float
    capacity_pa: float
    safety_factor: float
    stable: bool
    failure_mode: str  # "" if stable


def evaluate(
    material: str,
    *,
    member: str = "beam",
    span_m: float = 1.0,
    load_kn: float = 1.0,
    size_m: float = 0.1,
    required_sf: float = DEFAULT_SAFETY_FACTOR,
) -> StructuralResult:
    """Evaluate a square-section member.

    - column (compression): axial stress = P / A, capacity = compressive strength.
    - beam (bending, central point load on a simple span): max fibre stress for a
      square section of side s is 1.5 * P * L / s^3; capacity = tensile strength.
    """
    mat = materials_db.get(material)
    if mat is None:
        raise ValueError(f"unknown material {material!r}")
    load_n = max(0.0, load_kn) * 1_000.0
    s = max(1e-3, size_m)
    area = s * s

    if member == "column":
        stress = load_n / area
        capacity = mat.compressive_mpa * 1e6
        mode = "crushing"
    else:  # beam
        stress = 1.5 * load_n * max(0.0, span_m) / (s ** 3)
        capacity = mat.tensile_mpa * 1e6
        mode = "bending fracture"

    sf = capacity / stress if stress > 0 else float("inf")
    stable = sf >= required_sf
    return StructuralResult(
        material=mat.name,
        member=member,
        stress_pa=round(stress, 2),
        capacity_pa=round(capacity, 2),
        safety_factor=round(sf, 3),
        stable=stable,
        failure_mode="" if stable else mode,
    )


def max_safe_span(
    material: str, *, load_kn: float = 1.0, size_m: float = 0.1,
    required_sf: float = DEFAULT_SAFETY_FACTOR,
) -> float:
    """Largest beam span (m) that still meets the safety factor for this load."""
    mat = materials_db.get(material)
    if mat is None:
        raise ValueError(f"unknown material {material!r}")
    load_n = max(1e-6, load_kn) * 1_000.0
    s = max(1e-3, size_m)
    capacity = mat.tensile_mpa * 1e6
    # capacity / (1.5 * P * L / s^3) >= sf  →  L <= capacity * s^3 / (1.5 * P * sf)
    return round(capacity * (s ** 3) / (1.5 * load_n * required_sf), 4)
