"""Body and Needs State Component — Layer 3 architecture.

Formalised body-state vector with tick update hooks, mortality tracking,
and save/load serialisation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BodyState:
    """Complete physical state vector for an embodied agent."""
    health: float = 1.0
    energy: float = 1.0
    hunger: float = 0.85
    thirst: float = 0.85
    fatigue: float = 0.85
    pain: float = 0.0
    injury_flags: dict[str, bool] = field(default_factory=dict)
    disease_flags: dict[str, bool] = field(default_factory=dict)
    mortality_risk: float = 0.0
    immune_strength: float = 0.5
    temperature_stress: float = 0.0

    def is_critical(self) -> bool:
        return (
            self.health < 0.2
            or self.hunger < 0.15
            or self.thirst < 0.15
            or self.fatigue < 0.15
            or self.pain > 0.8
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "health": self.health,
            "energy": self.energy,
            "hunger": self.hunger,
            "thirst": self.thirst,
            "fatigue": self.fatigue,
            "pain": self.pain,
            "injury_flags": dict(self.injury_flags),
            "disease_flags": dict(self.disease_flags),
            "mortality_risk": self.mortality_risk,
            "immune_strength": self.immune_strength,
            "temperature_stress": self.temperature_stress,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "BodyState":
        return cls(
            health=float(d.get("health", 1.0)),
            energy=float(d.get("energy", 1.0)),
            hunger=float(d.get("hunger", 0.85)),
            thirst=float(d.get("thirst", 0.85)),
            fatigue=float(d.get("fatigue", 0.85)),
            pain=float(d.get("pain", 0.0)),
            injury_flags=dict(d.get("injury_flags", {})),
            disease_flags=dict(d.get("disease_flags", {})),
            mortality_risk=float(d.get("mortality_risk", 0.0)),
            immune_strength=float(d.get("immune_strength", 0.5)),
            temperature_stress=float(d.get("temperature_stress", 0.0)),
        )


def tick_update(
    body: BodyState,
    *,
    intensity: float = 1.0,
    ambient_temperature: float = 15.0,
    pollution: float = 0.0,
) -> BodyState:
    """Advance body state by one tick.

    Returns a *new* BodyState (immutable update) so replays are deterministic.
    """
    from dataclasses import replace

    # Metabolic decay
    hunger = max(0.0, body.hunger - 0.04 * intensity)
    thirst = max(0.0, body.thirst - 0.06 * intensity)
    fatigue = max(0.0, body.fatigue - 0.03 * intensity)
    energy = max(0.0, body.energy - 0.02 * intensity)

    # Temperature stress
    temp_diff = abs(ambient_temperature - 20.0)
    temp_stress = min(1.0, body.temperature_stress + 0.01 * temp_diff)

    # Pollution damage
    health = body.health - 0.005 * pollution

    # Injury / disease progression
    if body.injury_flags:
        health -= 0.01 * sum(1 for v in body.injury_flags.values() if v)
    if body.disease_flags:
        health -= 0.02 * sum(1 for v in body.disease_flags.values() if v)
        # Immune response
        immune = min(1.0, body.immune_strength + 0.01)
    else:
        immune = body.immune_strength

    # Recovery while resting
    if fatigue > 0.6 and not body.disease_flags:
        health = min(1.0, health + 0.01)
        energy = min(1.0, energy + 0.02)

    # Critical thresholds
    if min(hunger, thirst, fatigue) < 0.15:
        health -= 0.04
    if temp_stress > 0.7:
        health -= 0.02

    health = max(0.0, min(1.0, health))
    pain = body.pain
    if health < 0.3:
        pain = min(1.0, pain + 0.05)
    else:
        pain = max(0.0, pain - 0.01)

    # Mortality risk climbs with low health + old age proxies
    mortality = 1.0 - health
    if any(body.disease_flags.values()):
        mortality += 0.1

    return replace(
        body,
        health=round(health, 4),
        energy=round(energy, 4),
        hunger=round(hunger, 4),
        thirst=round(thirst, 4),
        fatigue=round(fatigue, 4),
        pain=round(pain, 4),
        mortality_risk=round(min(1.0, max(0.0, mortality)), 4),
        immune_strength=round(immune, 4),
        temperature_stress=round(max(0.0, temp_stress - 0.005), 4),
    )


def apply_injury(body: BodyState, kind: str, severity: float = 0.5) -> BodyState:
    """Apply an injury to the body state."""
    from dataclasses import replace
    flags = dict(body.injury_flags)
    flags[kind] = True
    health = max(0.0, body.health - 0.1 * severity)
    pain = min(1.0, body.pain + 0.2 * severity)
    return replace(body, injury_flags=flags, health=round(health, 4), pain=round(pain, 4))


def apply_disease(body: BodyState, kind: str) -> BodyState:
    """Apply a disease flag."""
    from dataclasses import replace
    flags = dict(body.disease_flags)
    flags[kind] = True
    return replace(body, disease_flags=flags)


def heal_injury(body: BodyState, kind: str) -> BodyState:
    """Remove an injury flag."""
    from dataclasses import replace
    flags = dict(body.injury_flags)
    flags.pop(kind, None)
    return replace(body, injury_flags=flags)
