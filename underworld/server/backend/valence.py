"""Valence Engine — Layer 15 architecture backend.

Tracks multi-dimensional emotional state: fear, curiosity, attachment,
grief, trust, betrayal, awe, anger, hope, despair, trauma load.
Event-driven updates with decay/recovery rules.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any


@dataclass
class ValenceState:
    """Dimensional emotional state vector."""
    fear: float = 0.0
    curiosity: float = 0.5
    attachment: float = 0.5
    grief: float = 0.0
    trust: float = 0.5
    betrayal: float = 0.0
    awe: float = 0.0
    anger: float = 0.0
    hope: float = 0.5
    despair: float = 0.0
    trauma_load: float = 0.0
    # Collective contagion modifiers (applied by civilisation layer)
    collective_fear: float = 0.0
    collective_awe: float = 0.0
    collective_anger: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "fear": self.fear,
            "curiosity": self.curiosity,
            "attachment": self.attachment,
            "grief": self.grief,
            "trust": self.trust,
            "betrayal": self.betrayal,
            "awe": self.awe,
            "anger": self.anger,
            "hope": self.hope,
            "despair": self.despair,
            "trauma_load": self.trauma_load,
            "collective_fear": self.collective_fear,
            "collective_awe": self.collective_awe,
            "collective_anger": self.collective_anger,
        }

    @classmethod
    def from_dict(cls, d: dict[str, float]) -> "ValenceState":
        return cls(**{k: float(v) for k, v in d.items() if k in cls.__dataclass_fields__})


def update_from_event(
    state: ValenceState,
    event_kind: str,
    *,
    intensity: float = 0.5,
    player_caused: bool = False,
    towards_agent: str | None = None,
) -> ValenceState:
    """Update valence state in response to an event."""
    kind = event_kind.lower()
    delta = intensity

    if kind in ("death", "loss", "bereavement"):
        state = replace(state, grief=_clamp(state.grief + 0.4 * delta))
        state = replace(state, despair=_clamp(state.despair + 0.2 * delta))
        state = replace(state, hope=_clamp(state.hope - 0.15 * delta))
        if player_caused:
            state = replace(state, fear=_clamp(state.fear + 0.3 * delta))
            state = replace(state, trust=_clamp(state.trust - 0.2 * delta))
            state = replace(state, trauma_load=_clamp(state.trauma_load + 0.25 * delta))

    elif kind in ("betrayal", "theft", "attack"):
        state = replace(state, betrayal=_clamp(state.betrayal + 0.5 * delta))
        state = replace(state, anger=_clamp(state.anger + 0.4 * delta))
        state = replace(state, trust=_clamp(state.trust - 0.3 * delta))
        state = replace(state, attachment=_clamp(state.attachment - 0.15 * delta))
        if player_caused:
            state = replace(state, fear=_clamp(state.fear + 0.2 * delta))

    elif kind in ("rescue", "gift", "bonding"):
        state = replace(state, trust=_clamp(state.trust + 0.3 * delta))
        state = replace(state, attachment=_clamp(state.attachment + 0.2 * delta))
        state = replace(state, hope=_clamp(state.hope + 0.15 * delta))
        state = replace(state, anger=_clamp(max(0.0, state.anger - 0.1 * delta)))
        state = replace(state, betrayal=_clamp(max(0.0, state.betrayal - 0.1 * delta)))

    elif kind in ("miracle_anomaly", "wonder", "discovery"):
        state = replace(state, awe=_clamp(state.awe + 0.4 * delta))
        state = replace(state, curiosity=_clamp(state.curiosity + 0.2 * delta))
        if player_caused:
            state = replace(state, fear=_clamp(state.fear + 0.15 * delta))

    elif kind in ("rebellion", "war", "invasion"):
        state = replace(state, fear=_clamp(state.fear + 0.35 * delta))
        state = replace(state, anger=_clamp(state.anger + 0.25 * delta))
        state = replace(state, hope=_clamp(state.hope - 0.1 * delta))

    elif kind in ("player_action", "intervention"):
        state = replace(state, fear=_clamp(state.fear + 0.2 * delta))
        state = replace(state, curiosity=_clamp(state.curiosity + 0.15 * delta))
        state = replace(state, awe=_clamp(state.awe + 0.1 * delta))

    return state


def decay(state: ValenceState, *, tick_rate: float = 0.02) -> ValenceState:
    """Apply one tick of emotional decay/recovery.

    Negative emotions decay toward zero; positive emotions decay toward
    a baseline (0.5 for trust/attachment/hope/curiosity, 0 for awe/anger).
    Trauma load decays very slowly.
    """
    def toward(current: float, target: float, rate: float) -> float:
        return current + (target - current) * rate

    return replace(
        state,
        fear=toward(state.fear, 0.0, tick_rate),
        grief=toward(state.grief, 0.0, tick_rate * 0.5),
        betrayal=toward(state.betrayal, 0.0, tick_rate),
        anger=toward(state.anger, 0.0, tick_rate),
        despair=toward(state.despair, 0.0, tick_rate * 0.5),
        awe=toward(state.awe, 0.0, tick_rate * 2.0),
        trust=toward(state.trust, 0.5, tick_rate * 0.5),
        attachment=toward(state.attachment, 0.5, tick_rate * 0.5),
        hope=toward(state.hope, 0.5, tick_rate * 0.5),
        curiosity=toward(state.curiosity, 0.5, tick_rate * 0.5),
        trauma_load=toward(state.trauma_load, 0.0, tick_rate * 0.1),
    )


def apply_collective_contagion(
    state: ValenceState,
    *,
    fear: float = 0.0,
    awe: float = 0.0,
    anger: float = 0.0,
) -> ValenceState:
    """Apply civilisation-level emotional contagion."""
    return replace(
        state,
        collective_fear=_clamp(fear),
        collective_awe=_clamp(awe),
        collective_anger=_clamp(anger),
        fear=_clamp(state.fear + 0.2 * fear),
        awe=_clamp(state.awe + 0.15 * awe),
        anger=_clamp(state.anger + 0.15 * anger),
    )


def dominant_valence(state: ValenceState) -> str:
    """Return the name of the strongest emotional dimension."""
    dims = {
        "fear": state.fear,
        "curiosity": state.curiosity,
        "attachment": state.attachment,
        "grief": state.grief,
        "trust": state.trust,
        "betrayal": state.betrayal,
        "awe": state.awe,
        "anger": state.anger,
        "hope": state.hope,
        "despair": state.despair,
        "trauma_load": state.trauma_load,
    }
    return max(dims, key=dims.get)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
