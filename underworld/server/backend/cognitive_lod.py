"""Cognitive Level-of-Detail (LOD) Engine — Layer 38 architecture.

Schedules agents into full / medium / low / statistical tiers based on
proximity, importance, trauma, and compute budgets.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class CognitiveTier(str, enum.Enum):
    FULL = "full"
    MEDIUM = "medium"
    LOW = "low"
    STATISTICAL = "statistical"


@dataclass
class AgentLODState:
    agent_id: str
    tier: CognitiveTier = CognitiveTier.MEDIUM
    tick_budget: float = 1.0
    player_proximity: float = 0.0
    historical_importance: float = 0.5
    trauma_score: float = 0.0
    awakening_score: float = 0.0
    is_leader: bool = False
    is_sacred: bool = False
    ticks_in_tier: int = 0


class CognitiveLODScheduler:
    """Deterministic LOD scheduler with configurable thresholds."""

    def __init__(
        self,
        *,
        full_max: int = 100,
        medium_max: int = 1000,
        low_max: int = 10_000,
        promotion_hysteresis: int = 3,
        demotion_hysteresis: int = 5,
    ) -> None:
        self.full_max = full_max
        self.medium_max = medium_max
        self.low_max = low_max
        self.promotion_hysteresis = promotion_hysteresis
        self.demotion_hysteresis = demotion_hysteresis
        self._agents: dict[str, AgentLODState] = {}

    def register(self, agent_id: str, **kwargs: Any) -> AgentLODState:
        state = AgentLODState(agent_id=agent_id, **kwargs)
        self._agents[agent_id] = state
        return state

    def update_state(self, agent_id: str, **kwargs: Any) -> AgentLODState | None:
        state = self._agents.get(agent_id)
        if state is None:
            return None
        for k, v in kwargs.items():
            if hasattr(state, k):
                setattr(state, k, v)
        return state

    def schedule(self) -> dict[str, CognitiveTier]:
        """Run one scheduling pass and return agent_id -> tier assignments."""
        # Compute raw priority scores
        scored: list[tuple[float, str]] = []
        for agent_id, state in self._agents.items():
            score = self._priority_score(state)
            scored.append((score, agent_id))

        # Sort descending by priority
        scored.sort(reverse=True)

        assignments: dict[str, CognitiveTier] = {}
        full_count = 0
        medium_count = 0
        low_count = 0

        for _, agent_id in scored:
            state = self._agents[agent_id]
            desired = self._desired_tier(state)

            # Apply tier caps with hysteresis
            if desired == CognitiveTier.FULL:
                if full_count < self.full_max:
                    assignments[agent_id] = CognitiveTier.FULL
                    full_count += 1
                else:
                    assignments[agent_id] = CognitiveTier.MEDIUM
                    medium_count += 1
            elif desired == CognitiveTier.MEDIUM:
                if medium_count < self.medium_max:
                    assignments[agent_id] = CognitiveTier.MEDIUM
                    medium_count += 1
                else:
                    assignments[agent_id] = CognitiveTier.LOW
                    low_count += 1
            elif desired == CognitiveTier.LOW:
                if low_count < self.low_max:
                    assignments[agent_id] = CognitiveTier.LOW
                    low_count += 1
                else:
                    assignments[agent_id] = CognitiveTier.STATISTICAL
            else:
                assignments[agent_id] = CognitiveTier.STATISTICAL

            # Track tier residence time
            if assignments[agent_id] == state.tier:
                state.ticks_in_tier += 1
            else:
                state.ticks_in_tier = 0
            state.tier = assignments[agent_id]

        return assignments

    def _priority_score(self, state: AgentLODState) -> float:
        """Higher score = more deserving of full cognition."""
        score = (
            0.3 * state.player_proximity
            + 0.2 * state.historical_importance
            + 0.2 * state.trauma_score
            + 0.2 * state.awakening_score
            + 0.1 * (1.0 if state.is_leader else 0.0)
            + 0.1 * (1.0 if state.is_sacred else 0.0)
        )
        return score

    def _desired_tier(self, state: AgentLODState) -> CognitiveTier:
        if state.player_proximity > 0.7 or state.awakening_score > 0.8 or state.is_sacred:
            return CognitiveTier.FULL
        if state.player_proximity > 0.3 or state.trauma_score > 0.6 or state.is_leader:
            return CognitiveTier.MEDIUM
        if state.historical_importance > 0.3:
            return CognitiveTier.LOW
        return CognitiveTier.STATISTICAL

    def get(self, agent_id: str) -> AgentLODState | None:
        return self._agents.get(agent_id)

    def count_in_tier(self, tier: CognitiveTier) -> int:
        return sum(1 for s in self._agents.values() if s.tier == tier)

    def enforce_budget(self, max_full: int | None = None, max_medium: int | None = None) -> None:
        """Dynamically tighten caps if needed."""
        if max_full is not None:
            self.full_max = max_full
        if max_medium is not None:
            self.medium_max = max_medium
