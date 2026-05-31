"""Universal Unit Ledger — SI dimensions + dimensional homogeneity (kernel #1/#4/#5).

Every physical quantity carries a dimension expressed as integer exponents over the
seven SI base units (m, kg, s, A, K, mol, cd). Multiplication/division add/subtract
exponents; addition/subtraction require *identical* dimensions, so any equation that
adds metres to seconds is rejected at the source. This is the validator the rest of
the physics kernel checks every formula against.
"""

from __future__ import annotations

from dataclasses import dataclass

BASE = ("m", "kg", "s", "A", "K", "mol", "cd")


class DimensionError(ValueError):
    """Raised when an operation violates dimensional homogeneity."""


@dataclass(frozen=True)
class Dimension:
    exps: tuple[int, ...]   # length 7, one exponent per SI base unit

    def __mul__(self, other: "Dimension") -> "Dimension":
        return Dimension(tuple(a + b for a, b in zip(self.exps, other.exps)))

    def __truediv__(self, other: "Dimension") -> "Dimension":
        return Dimension(tuple(a - b for a, b in zip(self.exps, other.exps)))

    def __pow__(self, n: int) -> "Dimension":
        return Dimension(tuple(a * n for a in self.exps))

    def __str__(self) -> str:
        parts = [f"{u}^{e}" if e != 1 else u for u, e in zip(BASE, self.exps) if e]
        return "·".join(parts) or "1"


def _d(**kw: int) -> Dimension:
    return Dimension(tuple(kw.get(u, 0) for u in BASE))


# base + common derived dimensions
DIMENSIONLESS = _d()
LENGTH = _d(m=1)
MASS = _d(kg=1)
TIME = _d(s=1)
CURRENT = _d(A=1)
TEMPERATURE = _d(K=1)
VELOCITY = LENGTH / TIME
ACCELERATION = VELOCITY / TIME
FORCE = MASS * ACCELERATION                 # N
ENERGY = FORCE * LENGTH                      # J
POWER = ENERGY / TIME                        # W
PRESSURE = FORCE / (LENGTH ** 2)             # Pa
CHARGE = CURRENT * TIME                       # C
VOLTAGE = POWER / CURRENT                     # V
RESISTANCE = VOLTAGE / CURRENT               # Ω

UNITS: dict[str, Dimension] = {
    "m": LENGTH, "kg": MASS, "s": TIME, "A": CURRENT, "K": TEMPERATURE,
    "m/s": VELOCITY, "m/s^2": ACCELERATION, "N": FORCE, "J": ENERGY, "W": POWER,
    "Pa": PRESSURE, "C": CHARGE, "V": VOLTAGE, "ohm": RESISTANCE, "1": DIMENSIONLESS,
}


@dataclass(frozen=True)
class Quantity:
    value: float
    dim: Dimension

    def __mul__(self, o: "Quantity") -> "Quantity":
        return Quantity(self.value * o.value, self.dim * o.dim)

    def __truediv__(self, o: "Quantity") -> "Quantity":
        return Quantity(self.value / o.value, self.dim / o.dim)

    def __add__(self, o: "Quantity") -> "Quantity":
        if self.dim != o.dim:
            raise DimensionError(f"cannot add {self.dim} to {o.dim}")
        return Quantity(self.value + o.value, self.dim)

    def __sub__(self, o: "Quantity") -> "Quantity":
        if self.dim != o.dim:
            raise DimensionError(f"cannot subtract {o.dim} from {self.dim}")
        return Quantity(self.value - o.value, self.dim)


def unit(name: str) -> Dimension:
    if name not in UNITS:
        raise DimensionError(f"unknown unit {name!r}")
    return UNITS[name]


def is_homogeneous(*dims: Dimension) -> bool:
    """True if every term shares the same dimension (the homogeneity rule)."""
    return all(d == dims[0] for d in dims) if dims else True


def check_equation(lhs: Dimension, *rhs_terms: Dimension) -> bool:
    """An equation is valid only if the LHS and every RHS term share dimensions."""
    return is_homogeneous(lhs, *rhs_terms)
