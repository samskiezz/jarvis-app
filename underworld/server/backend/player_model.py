"""Player Model Backend — Layer 30 architecture.

Tracks player actions, classifies interventions, scores mercy/cruelty/neglect,
and links to anomaly records.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PlayerActionLog:
    """One logged player interaction."""
    tick: int
    action_kind: str
    target_agent_id: str | None
    target_location: str | None
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlayerModel:
    """Aggregated player model for a world."""
    world_id: str
    action_count: int = 0
    intervention_count: int = 0
    mercy_score: float = 0.5
    cruelty_score: float = 0.5
    neglect_score: float = 0.5
    anomaly_response_score: float = 0.5
    symbol_response_log: list[dict[str, Any]] = field(default_factory=list)
    player_caused_anomalies: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "world_id": self.world_id,
            "action_count": self.action_count,
            "intervention_count": self.intervention_count,
            "mercy_score": self.mercy_score,
            "cruelty_score": self.cruelty_score,
            "neglect_score": self.neglect_score,
            "anomaly_response_score": self.anomaly_response_score,
            "symbol_response_log": list(self.symbol_response_log),
            "player_caused_anomalies": list(self.player_caused_anomalies),
        }


class PlayerModelBackend:
    """Tracks and updates the player model from world events."""

    def __init__(self, world_id: str) -> None:
        self.world_id = world_id
        self.model = PlayerModel(world_id=world_id)
        self._action_log: list[PlayerActionLog] = []
        self._max_log_size = 10_000

    def log_action(
        self,
        tick: int,
        action_kind: str,
        *,
        target_agent_id: str | None = None,
        target_location: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self.model.action_count += 1
        log = PlayerActionLog(
            tick=tick,
            action_kind=action_kind,
            target_agent_id=target_agent_id,
            target_location=target_location,
            payload=payload or {},
        )
        self._action_log.append(log)
        if len(self._action_log) > self._max_log_size:
            self._action_log.pop(0)

        # Classification
        if action_kind in ("spawn", "delete", "teleport", "resurrect", "gift", "punish"):
            self.model.intervention_count += 1

        if action_kind in ("gift", "rescue", "heal", "spawn"):
            self.model.mercy_score = _clamp(self.model.mercy_score + 0.02)
            self.model.cruelty_score = _clamp(self.model.cruelty_score - 0.01)
        elif action_kind in ("delete", "punish", "kill", "hurt"):
            self.model.cruelty_score = _clamp(self.model.cruelty_score + 0.03)
            self.model.mercy_score = _clamp(self.model.mercy_score - 0.01)

    def log_neglect(self, tick: int, ignored_requests: int) -> None:
        """Call when player ignores minion requests (pleas, gifts, etc)."""
        if ignored_requests > 0:
            self.model.neglect_score = _clamp(self.model.neglect_score + 0.01 * ignored_requests)

    def log_symbol_response(self, tick: int, symbol: str, responded: bool) -> None:
        self.model.symbol_response_log.append({
            "tick": tick,
            "symbol": symbol,
            "responded": responded,
        })

    def link_anomaly(self, anomaly_id: str) -> None:
        self.model.player_caused_anomalies.append(anomaly_id)

    def classify_intervention(self, action_kind: str) -> str:
        """Classify a player action into an intervention category."""
        creative = {"spawn", "create", "build", "gift", "heal", "rescue", "resurrect"}
        destructive = {"delete", "kill", "punish", "hurt", "curse"}
        informational = {"message", "symbol", "camera", "pause", "save", "load"}
        if action_kind in creative:
            return "creative"
        if action_kind in destructive:
            return "destructive"
        if action_kind in informational:
            return "informational"
        return "other"

    def summary(self) -> dict[str, Any]:
        return {
            "world_id": self.world_id,
            "total_actions": self.model.action_count,
            "interventions": self.model.intervention_count,
            "mercy": round(self.model.mercy_score, 3),
            "cruelty": round(self.model.cruelty_score, 3),
            "neglect": round(self.model.neglect_score, 3),
            "recent_actions": [a.action_kind for a in self._action_log[-10:]],
        }


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
