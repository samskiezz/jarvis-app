"""Computable physics laws + the world's physical limits.

Each :class:`Law` wraps a real formula as a Python callable with named inputs,
units, and sane sampling ranges. The engine can:

  * ``compute(law_id, inputs)``      → evaluate the formula for real numbers,
  * ``generate_problem(law, rng)``   → sample a random valid instance + truth,
  * ``grade_attempt(...)``           → score a minion's prediction vs. truth and
                                       return the skill/karma deltas (learning),
  * ``assess_invention(text)``       → check a proposal against hard limits,
  * ``world_limits()``               → the constants that bound the world.

Disciplines line up with the KnowledgeFormula.discipline tags already used by
the KB (mechanics, thermodynamics, electrical, fluid, quantum, physics) so a
minion's guild maps onto the laws it tends to practise.
"""

from __future__ import annotations

import math
import random
import re
from dataclasses import dataclass, field
from typing import Callable

from . import constants as K


@dataclass(frozen=True)
class Var:
    name: str
    unit: str
    lo: float
    hi: float


@dataclass(frozen=True)
class Law:
    id: str
    name: str
    section: str
    discipline: str
    equation: str
    inputs: tuple[Var, ...]
    out_unit: str
    fn: Callable[..., float]
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "section": self.section,
            "discipline": self.discipline,
            "equation": self.equation,
            "inputs": [
                {"name": v.name, "unit": v.unit, "lo": v.lo, "hi": v.hi} for v in self.inputs
            ],
            "out_unit": self.out_unit,
            "note": self.note,
        }


# ── Law registry ─────────────────────────────────────────────────────────────
# Curated, computable subset of the V4 compendium spanning every major section.
_LAW_LIST: list[Law] = [
    # Classical mechanics ----------------------------------------------------
    Law("newton_second", "Newton second law", "Classical mechanics", "mechanics",
        "F = m*a", (Var("m", "kg", 0.1, 100), Var("a", "m/s^2", 0.1, 50)), "N",
        lambda m, a: m * a, "Net force equals mass times acceleration."),
    Law("kinetic_energy", "Kinetic energy", "Classical mechanics", "mechanics",
        "K = 1/2*m*v^2", (Var("m", "kg", 0.1, 100), Var("v", "m/s", 0.1, 300)), "J",
        lambda m, v: 0.5 * m * v * v, "Energy of translational motion."),
    Law("momentum", "Linear momentum", "Classical mechanics", "mechanics",
        "p = m*v", (Var("m", "kg", 0.1, 100), Var("v", "m/s", 0.1, 300)), "kg m/s",
        lambda m, v: m * v),
    Law("work", "Work (constant force)", "Classical mechanics", "mechanics",
        "W = F*d", (Var("F", "N", 1, 1000), Var("d", "m", 0.1, 100)), "J",
        lambda F, d: F * d),
    Law("power", "Power", "Classical mechanics", "mechanics",
        "P = W/t", (Var("W", "J", 1, 100000), Var("t", "s", 0.1, 100)), "W",
        lambda W, t: W / t),
    Law("hooke", "Hooke law", "Classical mechanics", "mechanics",
        "F = k*x", (Var("k", "N/m", 1, 5000), Var("x", "m", 0.001, 0.5)), "N",
        lambda k, x: k * x, "Linear restoring force of a spring."),
    Law("weight", "Weight", "Classical mechanics", "mechanics",
        "W = m*g", (Var("m", "kg", 0.1, 200),), "N", lambda m: m * K.GRAV),
    Law("potential_energy", "Gravitational PE (near Earth)", "Classical mechanics", "mechanics",
        "U = m*g*h", (Var("m", "kg", 0.1, 100), Var("h", "m", 0.1, 100)), "J",
        lambda m, h: m * K.GRAV * h),
    Law("centripetal", "Centripetal acceleration", "Classical mechanics", "mechanics",
        "a = v^2/r", (Var("v", "m/s", 0.1, 100), Var("r", "m", 0.5, 500)), "m/s^2",
        lambda v, r: v * v / r),
    Law("kinematic_v", "Velocity under constant accel", "Classical mechanics", "mechanics",
        "v = u + a*t", (Var("u", "m/s", 0, 50), Var("a", "m/s^2", -10, 10), Var("t", "s", 0.1, 60)), "m/s",
        lambda u, a, t: u + a * t),
    Law("pendulum", "Simple pendulum period", "Classical mechanics", "mechanics",
        "T = 2*pi*sqrt(L/g)", (Var("L", "m", 0.05, 10),), "s",
        lambda L: 2 * math.pi * math.sqrt(L / K.GRAV)),
    # Gravitation ------------------------------------------------------------
    Law("gravitation", "Newton gravitation", "Gravitation", "mechanics",
        "F = G*m1*m2/r^2", (Var("m1", "kg", 1e3, 1e24), Var("m2", "kg", 1, 1e6), Var("r", "m", 1e3, 1e8)), "N",
        lambda m1, m2, r: K.G * m1 * m2 / (r * r)),
    Law("orbital_velocity", "Circular orbital velocity", "Gravitation", "mechanics",
        "v = sqrt(G*M/r)", (Var("M", "kg", 1e22, 2e30), Var("r", "m", 1e6, 1e9)), "m/s",
        lambda M, r: math.sqrt(K.G * M / r)),
    Law("escape_velocity", "Escape velocity", "Gravitation", "mechanics",
        "v = sqrt(2*G*M/r)", (Var("M", "kg", 1e22, 2e30), Var("r", "m", 1e6, 1e9)), "m/s",
        lambda M, r: math.sqrt(2 * K.G * M / r)),
    # Thermodynamics & gas ---------------------------------------------------
    Law("ideal_gas", "Ideal gas law (for P)", "Thermodynamics", "thermodynamics",
        "P = n*R*T/V", (Var("n", "mol", 0.1, 100), Var("T", "K", 100, 1000), Var("V", "m^3", 0.01, 10)), "Pa",
        lambda n, T, V: n * K.R_GAS * T / V),
    Law("heat", "Sensible heat", "Thermodynamics", "thermodynamics",
        "Q = m*c*dT", (Var("m", "kg", 0.1, 100), Var("c", "J/kg/K", 100, 4200), Var("dT", "K", 1, 200)), "J",
        lambda m, c, dT: m * c * dT),
    Law("carnot", "Carnot efficiency", "Thermodynamics", "thermodynamics",
        "eta = 1 - Tc/Th", (Var("Tc", "K", 200, 400), Var("Th", "K", 401, 1200)), "-",
        lambda Tc, Th: 1 - Tc / Th, "Upper bound on heat-engine efficiency (< 1)."),
    Law("stefan_boltzmann", "Stefan-Boltzmann radiated power", "Thermodynamics", "thermodynamics",
        "P = sigma*A*T^4", (Var("A", "m^2", 0.01, 100), Var("T", "K", 100, 2000)), "W",
        lambda A, T: K.CONSTANTS["sigma"].value * A * T ** 4),
    # Electromagnetism & circuits -------------------------------------------
    Law("ohm", "Ohm law", "Electromagnetism", "electrical",
        "V = I*R", (Var("I", "A", 0.001, 50), Var("R", "ohm", 0.1, 10000)), "V",
        lambda I, R: I * R),
    Law("electric_power", "Electrical power", "Electromagnetism", "electrical",
        "P = V*I", (Var("V", "V", 0.1, 400), Var("I", "A", 0.001, 50)), "W",
        lambda V, I: V * I),
    Law("coulomb", "Coulomb law", "Electromagnetism", "electrical",
        "F = k_e*q1*q2/r^2", (Var("q1", "C", 1e-9, 1e-3), Var("q2", "C", 1e-9, 1e-3), Var("r", "m", 0.001, 5)), "N",
        lambda q1, q2, r: K.K_E * q1 * q2 / (r * r)),
    Law("capacitor_energy", "Capacitor stored energy", "Electromagnetism", "electrical",
        "E = 1/2*C*V^2", (Var("C", "F", 1e-9, 1e-2), Var("V", "V", 1, 400)), "J",
        lambda C, V: 0.5 * C * V * V),
    # Waves & optics ---------------------------------------------------------
    Law("wave_speed", "Wave speed", "Waves & optics", "physics",
        "v = f*lambda", (Var("f", "Hz", 1, 1e9), Var("lambda", "m", 1e-6, 1e3)), "m/s",
        lambda f, lmbda: f * lmbda),
    Law("photon_energy", "Photon energy", "Waves & optics", "quantum",
        "E = h*f", (Var("f", "Hz", 1e12, 1e18),), "J", lambda f: K.H * f),
    # Fluids -----------------------------------------------------------------
    Law("dynamic_pressure", "Dynamic pressure", "Fluid mechanics", "fluid",
        "q = 1/2*rho*v^2", (Var("rho", "kg/m^3", 0.5, 1200), Var("v", "m/s", 0.1, 100)), "Pa",
        lambda rho, v: 0.5 * rho * v * v),
    Law("hydrostatic", "Hydrostatic pressure", "Fluid mechanics", "fluid",
        "P = rho*g*h", (Var("rho", "kg/m^3", 500, 1200), Var("h", "m", 0.1, 1000)), "Pa",
        lambda rho, h: rho * K.GRAV * h),
    Law("reynolds", "Reynolds number", "Fluid mechanics", "fluid",
        "Re = rho*v*L/mu", (Var("rho", "kg/m^3", 0.5, 1200), Var("v", "m/s", 0.01, 50),
                            Var("L", "m", 0.001, 10), Var("mu", "Pa s", 1e-5, 1.0)), "-",
        lambda rho, v, L, mu: rho * v * L / mu),
    # Relativity -------------------------------------------------------------
    Law("mass_energy", "Mass-energy equivalence", "Relativity", "physics",
        "E = m*c^2", (Var("m", "kg", 1e-6, 10),), "J", lambda m: m * K.C * K.C),
    Law("lorentz_factor", "Lorentz factor", "Relativity", "physics",
        "gamma = 1/sqrt(1-v^2/c^2)", (Var("v", "m/s", 1e6, 2.9e8),), "-",
        lambda v: 1 / math.sqrt(1 - (v / K.C) ** 2), "Requires v < c."),
    # Quantum ----------------------------------------------------------------
    Law("de_broglie", "de Broglie wavelength", "Quantum mechanics", "quantum",
        "lambda = h/(m*v)", (Var("m", "kg", 1e-30, 1e-24), Var("v", "m/s", 1e2, 1e7)), "m",
        lambda m, v: K.H / (m * v)),
    Law("heisenberg", "Heisenberg minimum momentum uncertainty", "Quantum mechanics", "quantum",
        "dp = hbar/(2*dx)", (Var("dx", "m", 1e-12, 1e-6),), "kg m/s",
        lambda dx: K.HBAR / (2 * dx)),
]

LAWS: dict[str, Law] = {law.id: law for law in _LAW_LIST}


# Guild → preferred physics discipline for the calculate action.
_DISCIPLINE_BY_GUILD: dict[str, str] = {
    "physics": "physics",
    "mechanical": "mechanics",
    "electrical": "electrical",
    "civil": "fluid",
    "materials": "thermodynamics",
    "energy": "thermodynamics",
    "computing": "quantum",
    "maths": "mechanics",
    "agriculture": "fluid",
    "patent": "physics",
    "safety": "mechanics",
}

_DISCIPLINES = sorted({law.discipline for law in _LAW_LIST})


def discipline_for_guild(guild: str) -> str:
    return _DISCIPLINE_BY_GUILD.get(guild, "mechanics")


def get_law(law_id: str) -> Law | None:
    return LAWS.get(law_id)


def list_laws(discipline: str | None = None) -> list[Law]:
    if discipline is None:
        return list(_LAW_LIST)
    return [law for law in _LAW_LIST if law.discipline == discipline]


def laws_for_discipline(discipline: str) -> list[Law]:
    matches = list_laws(discipline)
    return matches or _LAW_LIST


def compute(law_id: str, inputs: dict[str, float]) -> dict:
    """Evaluate a law for concrete inputs. Returns value, unit, and a step string."""
    law = LAWS.get(law_id)
    if law is None:
        raise KeyError(f"unknown law {law_id!r}")
    kwargs: dict[str, float] = {}
    for v in law.inputs:
        if v.name not in inputs:
            raise ValueError(f"missing input {v.name!r} for {law_id}")
        kwargs[v.name] = float(inputs[v.name])
    # `lambda` is a Python keyword — the de Broglie / wave laws use it as a var.
    call_kwargs = {(k if k != "lambda" else "lmbda"): val for k, val in kwargs.items()}
    value = float(law.fn(**call_kwargs))
    subs = ", ".join(f"{k}={val:g}{_unit(law, k)}" for k, val in kwargs.items())
    return {
        "law_id": law.id,
        "name": law.name,
        "equation": law.equation,
        "inputs": kwargs,
        "value": value,
        "unit": law.out_unit,
        "steps": f"{law.equation}  [{subs}]  = {value:.6g} {law.out_unit}",
    }


def _unit(law: Law, var_name: str) -> str:
    for v in law.inputs:
        if v.name == var_name:
            return v.unit
    return ""


def generate_problem(law: Law, rng: random.Random) -> tuple[dict[str, float], float]:
    """Sample a valid problem instance and return (inputs, true_value)."""
    inputs: dict[str, float] = {}
    for v in law.inputs:
        if v.lo > 0 and v.hi / max(v.lo, 1e-30) > 1e4:
            # span many orders of magnitude → sample log-uniform
            val = math.exp(rng.uniform(math.log(v.lo), math.log(v.hi)))
        else:
            val = rng.uniform(v.lo, v.hi)
        inputs[v.name] = val
    truth = compute(law.id, inputs)["value"]
    return inputs, truth


@dataclass
class AttemptResult:
    law_id: str
    name: str
    discipline: str
    inputs: dict[str, float]
    true_value: float
    predicted: float
    rel_error: float
    correct: bool
    skill_delta: float
    reputation_delta: float
    karma_delta: float
    steps: str


def grade_attempt(
    law: Law,
    *,
    skill_level: float,
    intelligence: float,
    creativity: float,
    rng: random.Random,
) -> AttemptResult:
    """Simulate a minion attempting a real calculation, then grade it.

    Mastery (how reliably the minion lands near the true value) rises with the
    minion's skill in this discipline and its intelligence. A correct answer
    (within 5% of the physically computed truth) yields more learning and karma;
    a miss still teaches, but less. Predictions are bounded so the engine never
    rewards a non-physical guess.
    """
    inputs, truth = generate_problem(law, rng)

    # Mastery rises with practised skill (0..10) and innate intelligence, so a
    # minion that keeps practising a discipline becomes reliably accurate.
    mastery = max(0.02, min(0.98, 0.12 + 0.09 * skill_level + 0.30 * intelligence))
    sigma = (1.0 - mastery) * 0.6  # relative-error spread shrinks with mastery
    rel_error = rng.gauss(0.0, sigma) if sigma > 0 else 0.0
    predicted = truth * (1.0 + rel_error)

    abs_rel = abs(rel_error)
    correct = abs_rel <= 0.05
    if correct:
        skill_delta = 0.15 + 0.08 * intelligence + 0.04 * creativity
        reputation_delta = 0.01
        karma_delta = 0.01
    else:
        # Learning from mistakes — smaller, and scaled by how close they were.
        skill_delta = 0.05 + 0.04 * max(0.0, 1.0 - abs_rel)
        reputation_delta = 0.0
        karma_delta = 0.002

    mark = "✓" if correct else "✗"
    steps = compute(law.id, inputs)["steps"]
    detail = (
        f"{law.name}: {steps} — predicted {predicted:.4g} {law.out_unit} "
        f"(err {abs_rel*100:.1f}%) {mark}"
    )
    return AttemptResult(
        law_id=law.id,
        name=law.name,
        discipline=law.discipline,
        inputs=inputs,
        true_value=truth,
        predicted=predicted,
        rel_error=rel_error,
        correct=correct,
        skill_delta=round(skill_delta, 4),
        reputation_delta=reputation_delta,
        karma_delta=karma_delta,
        steps=detail,
    )


# ── World limits: what physics forbids ───────────────────────────────────────
_IMPOSSIBLE_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"faster[\s-]+than[\s-]+light|superluminal|exceed(s|ing)?\s+the\s+speed\s+of\s+light",
     "Special relativity: nothing with mass reaches or exceeds c."),
    (r"perpetual\s+motion|over[\s-]?unity|free\s+energy|infinite\s+energy|limitless\s+energy",
     "First/second law of thermodynamics: energy is conserved; no over-unity."),
    (r"(100|hundred|>?\s*100)\s*%?\s*efficien|efficiency\s+of\s+(1(\.0+)?|100%)|zero\s+loss",
     "Carnot/2nd law: real efficiency is strictly below 1."),
    (r"anti[\s-]?gravity|negate\s+gravity|cancel\s+gravity",
     "No known mechanism negates gravitation."),
    (r"cold\s+fusion",
     "Not reproducible under known nuclear physics."),
)
_QUANTITY = re.compile(r"\d+(\.\d+)?\s*(N|J|W|V|A|Pa|K|kg|m/s|m|s|Hz|mol|%|ohm)\b", re.I)


@dataclass
class InventionAssessment:
    feasibility: float
    violates_limit: bool
    notes: list[str] = field(default_factory=list)


def assess_invention(text: str) -> InventionAssessment:
    """Grade a proposal against the world's physical limits.

    Hard violations (FTL, over-unity, >100% efficiency) clamp feasibility near
    zero and flag the proposal so the reviewer rejects it. Grounded, quantified
    proposals (real units, stated numbers) score higher.
    """
    blob = (text or "").lower()
    notes: list[str] = []
    violates = False
    for pattern, why in _IMPOSSIBLE_PATTERNS:
        if re.search(pattern, blob):
            violates = True
            notes.append(f"Violates physical limit — {why}")

    if violates:
        return InventionAssessment(feasibility=0.05, violates_limit=True, notes=notes)

    feasibility = 0.45
    n_quant = len(_QUANTITY.findall(text or ""))
    if n_quant:
        feasibility += min(0.30, 0.10 * n_quant)
        notes.append(f"Grounded with {n_quant} quantified term(s).")
    if len(blob) > 200:
        feasibility += 0.10
    feasibility = max(0.0, min(0.95, feasibility))
    return InventionAssessment(feasibility=round(feasibility, 3), violates_limit=False, notes=notes)


def world_limits() -> dict:
    """The constants that bound any world — exposed to the UI and reviewer."""
    return {
        "max_speed_m_s": K.C,
        "max_efficiency": 1.0,
        "surface_gravity_m_s2": K.GRAV,
        "energy_conserved": True,
        "constants": K.as_dicts(),
        "disciplines": _DISCIPLINES,
    }


__all__ = [
    "Law", "Var", "LAWS", "AttemptResult", "InventionAssessment",
    "get_law", "list_laws", "laws_for_discipline", "compute", "generate_problem",
    "grade_attempt", "assess_invention", "world_limits", "discipline_for_guild",
]
