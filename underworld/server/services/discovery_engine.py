"""Discovery Engine — the central law: WorldTruth is not MinionBelief.

The frontier spec's keystone (sections 5, 9, 19, 20): the world holds hidden
*true* material properties; a Minion never receives them. It can only form a
*belief* about a property by **measuring** it — through an instrument, with
measurement error, skill error, instrument precision, and contamination — and
that belief converges toward truth only through *repeated, replicated* tests.

No scripted unlock. A Minion "knows" copper conducts only after enough
instrumented observations drive its belief's confidence past the acceptance bar,
the way real science earns a fact.

Pure functions over plain dataclasses (no DB, no LLM): the simulation layer maps
DB rows onto these and persists the resulting beliefs/observations as events.

Composes the existing pieces rather than reinventing them:
  - knowledge.materials  → the hidden true property table (WorldTruth)
  - services.instruments → measurement with precision/uncertainty
  - services.science     → bayes_update / measurement_stats / is_established
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from enum import Enum


# ── what can be measured, and which instrument each property needs ───────────
class Property(str, Enum):
    DENSITY = "density"
    HARDNESS = "hardness"
    CONDUCTIVITY = "electrical_conductivity"
    THERMAL_CONDUCTIVITY = "thermal_conductivity"
    MELTING_POINT = "melting_point"
    TENSILE_STRENGTH = "tensile_strength"
    MAGNETISM = "magnetic_susceptibility"


# A property cannot be quantified without the right instrument — "no instrument,
# no measurement; no measurement, no science" (spec §19).
PROPERTY_INSTRUMENT: dict[Property, str] = {
    Property.DENSITY: "balance",
    Property.HARDNESS: "hand",
    Property.CONDUCTIVITY: "voltmeter",
    Property.THERMAL_CONDUCTIVITY: "thermometer",
    Property.MELTING_POINT: "thermometer",
    Property.TENSILE_STRENGTH: "balance",
    Property.MAGNETISM: "compass",
}


@dataclass(frozen=True)
class MaterialTruth:
    """The hidden authoritative properties. Minions never read this directly."""
    material_id: str
    true_name: str
    properties: dict[str, float]          # Property.value -> true value (SI-ish)
    contamination: float = 0.0            # 0..1, raises interpretation error


@dataclass(frozen=True)
class Observation:
    """One instrumented measurement of one property — what a Minion actually gets.

    `value` is the *measured* (error-laden) reading; `uncertainty` is the honest
    band around it. The true value is NEVER present here.
    """
    material_id: str
    property: Property
    value: float
    uncertainty: float
    instrument: str
    observer_skill: float                 # 0..1
    tick: int


@dataclass
class Belief:
    """A Minion's evolving estimate of a hidden property.

    Confidence rises with replication + agreement and falls with spread. The
    belief is "held" (institutional-ready) only once `is_established`.
    """
    material_id: str
    property: Property
    estimate: float = 0.0
    confidence: float = 0.0               # 0..1
    observations: list[Observation] = field(default_factory=list)

    @property
    def n(self) -> int:
        return len(self.observations)


# ── measurement: truth → observation (with all the real error sources) ───────
def _deterministic_noise(seed_parts: tuple, spread: float) -> float:
    """Reproducible pseudo-noise in [-spread, +spread] — determinism (spec §5.2):
    same seed + same inputs ⇒ same observation, so discovery is auditable."""
    h = hashlib.sha256("|".join(map(str, seed_parts)).encode()).hexdigest()
    frac = int(h[:8], 16) / 0xFFFFFFFF            # 0..1
    return (frac * 2 - 1) * spread


def measure_property(
    truth: MaterialTruth,
    prop: Property,
    *,
    instrument: str,
    instrument_precision: float,
    observer_skill: float,
    tick: int,
) -> Observation | None:
    """Produce an instrumented Observation of `prop`, or None if the instrument
    can't measure it (wrong tool → no data, the comprehension gate at §2 law 4).

    Total error = instrument precision + skill error + contamination, all
    relative to the magnitude. The reported value is the truth perturbed by a
    deterministic-but-unknown-to-the-Minion noise draw within that band.
    """
    if PROPERTY_INSTRUMENT.get(prop) != instrument:
        return None  # this instrument cannot quantify this property
    true_val = truth.properties.get(prop.value)
    if true_val is None:
        return None
    magnitude = abs(true_val) if true_val != 0 else 1.0
    skill_err = (1.0 - max(0.0, min(1.0, observer_skill))) * 0.15
    total_rel = max(0.0, instrument_precision) + skill_err + truth.contamination * 0.1
    noise = _deterministic_noise((truth.material_id, prop.value, tick), total_rel * magnitude)
    return Observation(
        material_id=truth.material_id,
        property=prop,
        value=true_val + noise,
        uncertainty=total_rel * magnitude,
        instrument=instrument,
        observer_skill=observer_skill,
        tick=tick,
    )


# ── belief update: observations → estimate + confidence ──────────────────────
def update_belief(belief: Belief, obs: Observation) -> Belief:
    """Fold one observation into the belief.

    Estimate = inverse-variance-weighted mean of all observations (better/more
    certain measurements count more). Confidence grows with replication count
    and *agreement* (low relative spread) — never from a single reading.
    """
    belief.observations.append(obs)
    obss = belief.observations
    # inverse-variance weighting (uncertainty acts as sigma)
    weights = [1.0 / max(o.uncertainty, 1e-9) ** 2 for o in obss]
    wsum = sum(weights)
    belief.estimate = sum(w * o.value for w, o in zip(weights, obss)) / wsum

    if belief.n >= 2:
        mean = sum(o.value for o in obss) / belief.n
        var = sum((o.value - mean) ** 2 for o in obss) / belief.n
        spread = (var ** 0.5) / (abs(mean) if mean != 0 else 1.0)   # rel. std
        agreement = max(0.0, 1.0 - spread)
    else:
        agreement = 0.0
    # confidence: saturating in replication count, scaled by agreement
    replication_factor = 1.0 - (0.6 ** belief.n)
    belief.confidence = round(replication_factor * agreement, 4)
    return belief


# Acceptance bar (spec §20.3): established only with enough agreeing replications.
def is_discovered(belief: Belief, *, min_reps: int = 3,
                  min_confidence: float = 0.6) -> bool:
    return belief.n >= min_reps and belief.confidence >= min_confidence


def belief_error(belief: Belief, truth: MaterialTruth) -> float | None:
    """Diagnostic ONLY (the player/admin view): how far the belief is from the
    hidden truth, relative. Minions cannot call this — it reads WorldTruth."""
    true_val = truth.properties.get(belief.property.value)
    if true_val is None:
        return None
    mag = abs(true_val) if true_val != 0 else 1.0
    return abs(belief.estimate - true_val) / mag


# ── the discovery loop: run repeated measurements until established ───────────
def discover_property(
    truth: MaterialTruth,
    prop: Property,
    *,
    instrument: str,
    instrument_precision: float,
    observer_skill: float,
    max_trials: int = 12,
    start_tick: int = 0,
) -> Belief:
    """Repeatedly measure `prop` until the belief is established or trials run out.

    Returns the Belief — which converges toward (but, honestly, never exactly
    equals) the hidden truth. This is the MVP victory mechanic: a Minion *earns*
    'copper conducts' through instrumented replication, not a scripted unlock.
    """
    belief = Belief(material_id=truth.material_id, property=prop)
    for i in range(max_trials):
        obs = measure_property(
            truth, prop, instrument=instrument,
            instrument_precision=instrument_precision,
            observer_skill=observer_skill, tick=start_tick + i,
        )
        if obs is None:
            break  # wrong instrument: no progress possible
        update_belief(belief, obs)
        if is_discovered(belief):
            break
    return belief


# ── convenience: build a MaterialTruth from the existing materials table ─────
def truth_from_material(mat, *, contamination: float = 0.0) -> MaterialTruth:
    """Adapt a knowledge.materials.Material into a hidden MaterialTruth.

    Pulls whatever properties the table exposes; missing ones simply aren't
    measurable (the world doesn't have to define every property for every rock).
    """
    props: dict[str, float] = {}
    for prop, attr in (
        (Property.DENSITY, "density"),
        (Property.THERMAL_CONDUCTIVITY, "thermal_wmk"),
        (Property.TENSILE_STRENGTH, "tensile_mpa"),
        (Property.MELTING_POINT, "melt_c"),
    ):
        val = getattr(mat, attr, None)
        if isinstance(val, (int, float)):
            props[prop.value] = float(val)
    # conductivity from resistivity if present (S/m = 1/(ohm*m))
    rho = getattr(mat, "resistivity_ohm_m", None) or getattr(mat, "resistivity", None)
    if isinstance(rho, (int, float)) and rho > 0:
        props[Property.CONDUCTIVITY.value] = 1.0 / rho
    return MaterialTruth(material_id=getattr(mat, "name", "unknown"),
                         true_name=getattr(mat, "name", "unknown"),
                         properties=props, contamination=contamination)
