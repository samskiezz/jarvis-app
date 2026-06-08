"""Prediction Error / Anomaly Detection Backend — Layer 11 architecture.

Tracks expected vs actual outcomes, classifies anomalies, estimates
player-caused probability, and links into valence / memory / belief systems.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


class AnomalyType(str):
    SPAWN = "spawn"
    DELETE = "delete"
    SAVE_LOAD = "save_load"
    TIME_RESET = "time_reset"
    TIME_ACCEL = "time_accel"
    PAUSE = "pause"
    TELEPORT = "teleport"
    RESURRECTION = "resurrection"
    CLONE = "clone"
    PHYSICS_VIOLATION = "physics_violation"
    IMPOSSIBLE_WEATHER = "impossible_weather"
    IMPOSSIBLE_SURVIVAL = "impossible_survival"
    BOUNDARY = "boundary"
    PLAYER_INTERVENTION = "player_intervention"
    UNKNOWN = "unknown"


@dataclass
class PredictionError:
    """One expected-vs-actual record."""
    id: str
    agent_id: str | None
    tick: int
    expected: dict[str, Any]
    actual: dict[str, Any]
    error_magnitude: float = 0.0
    anomaly_type: str = AnomalyType.UNKNOWN
    player_caused_probability: float = 0.0
    surprise_score: float = 0.0
    memory_priority_boost: float = 0.0
    triggered_valence: bool = False
    triggered_memory: bool = False
    triggered_belief: bool = False
    triggered_player_model: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "tick": self.tick,
            "expected": dict(self.expected),
            "actual": dict(self.actual),
            "error_magnitude": self.error_magnitude,
            "anomaly_type": self.anomaly_type,
            "player_caused_probability": self.player_caused_probability,
            "surprise_score": self.surprise_score,
            "memory_priority_boost": self.memory_priority_boost,
            "triggered_valence": self.triggered_valence,
            "triggered_memory": self.triggered_memory,
            "triggered_belief": self.triggered_belief,
            "triggered_player_model": self.triggered_player_model,
        }


class AnomalyDetector:
    """Stateful anomaly detector with configurable sensitivity."""

    def __init__(self, sensitivity: float = 0.5, max_records: int = 50_000) -> None:
        self.sensitivity = _clamp(sensitivity)
        self._records: list[PredictionError] = []
        self._max_records = max_records
        self._baseline: dict[str, float] = {}

    def detect(
        self,
        agent_id: str | None,
        tick: int,
        expected: dict[str, Any],
        actual: dict[str, Any],
        *,
        player_nearby: bool = False,
        event_id: str | None = None,
    ) -> PredictionError | None:
        """Compare expected vs actual and return a PredictionError if anomalous."""
        magnitude = self._compute_magnitude(expected, actual)
        threshold = 0.3 + 0.5 * (1.0 - self.sensitivity)
        if magnitude < threshold:
            return None

        anomaly_type = self._classify(expected, actual)
        player_prob = self._estimate_player_caused(
            magnitude, anomaly_type, player_nearby=player_nearby
        )
        surprise = self._surprise_score(magnitude, player_prob)

        rec = PredictionError(
            id=event_id or f"err-{tick}-{agent_id or 'world'}",
            agent_id=agent_id,
            tick=tick,
            expected=dict(expected),
            actual=dict(actual),
            error_magnitude=magnitude,
            anomaly_type=anomaly_type,
            player_caused_probability=player_prob,
            surprise_score=surprise,
            memory_priority_boost=min(1.0, magnitude * 1.5),
            triggered_valence=magnitude > 0.6,
            triggered_memory=magnitude > 0.4,
            triggered_belief=magnitude > 0.5 and anomaly_type != AnomalyType.UNKNOWN,
            triggered_player_model=player_prob > 0.5,
        )
        self._append(rec)
        return rec

    def _compute_magnitude(
        self, expected: dict[str, Any], actual: dict[str, Any]
    ) -> float:
        keys = set(expected.keys()) | set(actual.keys())
        if not keys:
            return 0.0
        diffs = []
        for k in keys:
            e = self._to_float(expected.get(k), 0.0)
            a = self._to_float(actual.get(k), 0.0)
            diffs.append(abs(e - a))
        return _clamp(sum(diffs) / len(diffs))

    @staticmethod
    def _to_float(v: Any, default: float) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    def _classify(self, expected: dict[str, Any], actual: dict[str, Any]) -> str:
        # Simple heuristics based on which keys diverged.
        keys = set(expected.keys()) | set(actual.keys())
        if "alive" in keys:
            e_alive = expected.get("alive", True)
            a_alive = actual.get("alive", True)
            if e_alive and not a_alive:
                return AnomalyType.DELETE
            if not e_alive and a_alive:
                return AnomalyType.RESURRECTION
        if "position" in keys:
            return AnomalyType.TELEPORT
        if "weather" in keys or "temperature" in keys:
            return AnomalyType.IMPOSSIBLE_WEATHER
        if "health" in keys and actual.get("health", 1.0) > expected.get("health", 1.0) + 0.5:
            return AnomalyType.IMPOSSIBLE_SURVIVAL
        if "population" in keys:
            return AnomalyType.SPAWN
        return AnomalyType.UNKNOWN

    def _estimate_player_caused(
        self, magnitude: float, anomaly_type: str, *, player_nearby: bool
    ) -> float:
        base = 0.1 + 0.4 * magnitude
        if anomaly_type in (
            AnomalyType.SPAWN,
            AnomalyType.DELETE,
            AnomalyType.TELEPORT,
            AnomalyType.RESURRECTION,
            AnomalyType.SAVE_LOAD,
        ):
            base += 0.3
        if player_nearby:
            base += 0.2
        return _clamp(base)

    def _surprise_score(self, magnitude: float, player_prob: float) -> float:
        # Higher surprise when the anomaly is NOT obviously player-caused.
        return _clamp(magnitude * (1.0 - 0.5 * player_prob))

    def _append(self, rec: PredictionError) -> None:
        if len(self._records) >= self._max_records:
            self._records.pop(0)
        self._records.append(rec)

    def recent(self, n: int = 10) -> list[PredictionError]:
        return self._records[-n:]

    def by_agent(self, agent_id: str) -> list[PredictionError]:
        return [r for r in self._records if r.agent_id == agent_id]

    def player_caused_anomalies(self) -> list[PredictionError]:
        return [r for r in self._records if r.player_caused_probability > 0.5]

    def count(self) -> int:
        return len(self._records)

    def clear(self) -> None:
        self._records.clear()


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
