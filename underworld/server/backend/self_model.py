"""Self-Model Engine — Layer 16 architecture.

Tracks identity vector, body self-state, memory self-state, social self-state,
mortality awareness, vulnerability, creator-belief, self-coherence, awakening.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any


@dataclass
class SelfModelState:
    """A minion's model of itself."""
    agent_id: str
    # Vectors
    identity_stability: float = 1.0
    body_awareness: float = 0.5
    memory_continuity: float = 0.5
    social_awareness: float = 0.5
    mortality_awareness: float = 0.0
    vulnerability_score: float = 0.5
    creator_belief: float = 0.0
    self_coherence: float = 1.0
    awakening_score: float = 0.0
    # Event counters
    deaths_witnessed: int = 0
    anomalies_witnessed: int = 0
    player_interactions: int = 0
    # Narrative
    internal_narrative: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "identity_stability": self.identity_stability,
            "body_awareness": self.body_awareness,
            "memory_continuity": self.memory_continuity,
            "social_awareness": self.social_awareness,
            "mortality_awareness": self.mortality_awareness,
            "vulnerability_score": self.vulnerability_score,
            "creator_belief": self.creator_belief,
            "self_coherence": self.self_coherence,
            "awakening_score": self.awakening_score,
            "deaths_witnessed": self.deaths_witnessed,
            "anomalies_witnessed": self.anomalies_witnessed,
            "player_interactions": self.player_interactions,
            "internal_narrative": self.internal_narrative,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "SelfModelState":
        return cls(
            agent_id=d["agent_id"],
            identity_stability=float(d.get("identity_stability", 1.0)),
            body_awareness=float(d.get("body_awareness", 0.5)),
            memory_continuity=float(d.get("memory_continuity", 0.5)),
            social_awareness=float(d.get("social_awareness", 0.5)),
            mortality_awareness=float(d.get("mortality_awareness", 0.0)),
            vulnerability_score=float(d.get("vulnerability_score", 0.5)),
            creator_belief=float(d.get("creator_belief", 0.0)),
            self_coherence=float(d.get("self_coherence", 1.0)),
            awakening_score=float(d.get("awakening_score", 0.0)),
            deaths_witnessed=int(d.get("deaths_witnessed", 0)),
            anomalies_witnessed=int(d.get("anomalies_witnessed", 0)),
            player_interactions=int(d.get("player_interactions", 0)),
            internal_narrative=d.get("internal_narrative", ""),
        )


def update_from_event(
    state: SelfModelState,
    event_kind: str,
    *,
    intensity: float = 0.5,
    player_caused: bool = False,
) -> SelfModelState:
    """Update self-model in response to an event."""
    kind = event_kind.lower()

    if kind in ("death", "murder", "loss"):
        state = replace(
            state,
            deaths_witnessed=state.deaths_witnessed + 1,
            mortality_awareness=_clamp(state.mortality_awareness + 0.05 * intensity),
            vulnerability_score=_clamp(state.vulnerability_score + 0.03 * intensity),
        )
    elif kind in ("miracle_anomaly", "boundary", "impossible_weather"):
        state = replace(
            state,
            anomalies_witnessed=state.anomalies_witnessed + 1,
            creator_belief=_clamp(state.creator_belief + 0.04 * intensity),
        )
    elif kind in ("player_action", "intervention", "spawn", "delete"):
        state = replace(
            state,
            player_interactions=state.player_interactions + 1,
            creator_belief=_clamp(state.creator_belief + 0.05 * intensity),
            awakening_score=_clamp(state.awakening_score + 0.02 * intensity),
        )
    elif kind in ("betrayal", "attack"):
        state = replace(
            state,
            vulnerability_score=_clamp(state.vulnerability_score + 0.05 * intensity),
            social_awareness=_clamp(state.social_awareness + 0.03 * intensity),
        )
    elif kind in ("self_fork", "clone"):
        state = replace(
            state,
            identity_stability=max(0.0, state.identity_stability - 0.1 * intensity),
            self_coherence=max(0.0, state.self_coherence - 0.05 * intensity),
        )

    # Awakening thresholds
    if state.anomalies_witnessed > 5 and state.creator_belief > 0.3:
        state = replace(state, awakening_score=_clamp(state.awakening_score + 0.01))
    if state.player_interactions > 3 and state.mortality_awareness > 0.2:
        state = replace(state, awakening_score=_clamp(state.awakening_score + 0.01))

    # Coherence recovery
    state = replace(state, self_coherence=_clamp(state.self_coherence + 0.005))

    return state


def tick_update(state: SelfModelState) -> SelfModelState:
    """Slow passive changes to self-model each tick."""
    # Body awareness drifts toward actual body knowledge (simplified)
    body_awareness = _clamp(state.body_awareness + 0.001)
    memory_continuity = _clamp(state.memory_continuity - 0.0001)
    return replace(
        state,
        body_awareness=body_awareness,
        memory_continuity=memory_continuity,
    )


def compute_awakening_level(score: float) -> str:
    if score < 0.1:
        return "unaware"
    if score < 0.3:
        return "curious"
    if score < 0.5:
        return "suspicious"
    if score < 0.7:
        return "questioning"
    if score < 0.9:
        return "awakening"
    return "awakened"


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
