"""Memory Backend Enhancements — Layer 6 / Layer 7 architecture.

Extends the core memory system with trauma scoring, compression markers,
related entities, and belief links.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Any


@dataclass
class MemoryRecord:
    """Enhanced memory record with architecture-mandated fields."""
    id: str
    agent_id: str
    source_event_id: str | None
    memory_type: str  # episodic, semantic, procedural, emotional, social, ...
    content: str
    emotional_tags: dict[str, float] = field(default_factory=dict)
    importance: float = 0.5
    recency: float = 1.0
    trauma_score: float = 0.0
    related_agents: list[str] = field(default_factory=list)
    related_objects: list[str] = field(default_factory=list)
    related_location: str | None = None
    belief_links: list[str] = field(default_factory=list)
    compression_marker: str | None = None  # e.g. "summarised", "compressed", "dream"
    tick_created: int = 0
    tick_last_recalled: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "source_event_id": self.source_event_id,
            "memory_type": self.memory_type,
            "content": self.content,
            "emotional_tags": dict(self.emotional_tags),
            "importance": self.importance,
            "recency": self.recency,
            "trauma_score": self.trauma_score,
            "related_agents": list(self.related_agents),
            "related_objects": list(self.related_objects),
            "related_location": self.related_location,
            "belief_links": list(self.belief_links),
            "compression_marker": self.compression_marker,
            "tick_created": self.tick_created,
            "tick_last_recalled": self.tick_last_recalled,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "MemoryRecord":
        return cls(
            id=d["id"],
            agent_id=d["agent_id"],
            source_event_id=d.get("source_event_id"),
            memory_type=d.get("memory_type", "episodic"),
            content=d["content"],
            emotional_tags=dict(d.get("emotional_tags", {})),
            importance=float(d.get("importance", 0.5)),
            recency=float(d.get("recency", 1.0)),
            trauma_score=float(d.get("trauma_score", 0.0)),
            related_agents=list(d.get("related_agents", [])),
            related_objects=list(d.get("related_objects", [])),
            related_location=d.get("related_location"),
            belief_links=list(d.get("belief_links", [])),
            compression_marker=d.get("compression_marker"),
            tick_created=int(d.get("tick_created", 0)),
            tick_last_recalled=int(d.get("tick_last_recalled", 0)),
        )


def compute_importance(
    *,
    emotional_intensity: float = 0.0,
    outcome_significance: float = 0.5,
    novelty: float = 0.5,
    player_caused: bool = False,
    anomaly: bool = False,
) -> float:
    """Compute a memory importance score from event features."""
    base = 0.3 * emotional_intensity + 0.4 * outcome_significance + 0.3 * novelty
    if player_caused:
        base += 0.15
    if anomaly:
        base += 0.2
    return _clamp(base)


def compute_recency(
    record: MemoryRecord,
    current_tick: int,
    *,
    recall_boost: float = 1.0,
) -> float:
    """Recency decays with time but is refreshed on recall."""
    elapsed = max(0, current_tick - record.tick_last_recalled)
    decayed = record.recency * math.exp(-0.02 * elapsed)
    return _clamp(decayed + 0.1 * recall_boost)


def compute_trauma_score(
    record: MemoryRecord,
    *,
    betrayal_weight: float = 0.4,
    loss_weight: float = 0.35,
    fear_weight: float = 0.25,
) -> float:
    """Derive trauma score from emotional tags."""
    tags = record.emotional_tags
    score = (
        betrayal_weight * tags.get("betrayal", 0.0)
        + loss_weight * tags.get("grief", 0.0)
        + fear_weight * tags.get("fear", 0.0)
    )
    return _clamp(score)


def compress_memory(record: MemoryRecord, summary: str) -> MemoryRecord:
    """Mark a memory as compressed/summarised and replace content."""
    return replace(
        record,
        content=summary,
        compression_marker="compressed",
        importance=max(0.2, record.importance * 0.9),
    )


def mark_summarised(record: MemoryRecord, summary: str) -> MemoryRecord:
    """Mark a memory as summarised (higher fidelity than compressed)."""
    return replace(
        record,
        content=summary,
        compression_marker="summarised",
        importance=max(0.3, record.importance * 0.95),
    )


def retrieve_by_agent(memories: list[MemoryRecord], agent_id: str) -> list[MemoryRecord]:
    return [m for m in memories if m.agent_id == agent_id]


def retrieve_by_type(memories: list[MemoryRecord], memory_type: str) -> list[MemoryRecord]:
    return [m for m in memories if m.memory_type == memory_type]


def retrieve_by_location(memories: list[MemoryRecord], location: str) -> list[MemoryRecord]:
    return [m for m in memories if m.related_location == location]


def retrieve_by_related_agent(memories: list[MemoryRecord], agent_id: str) -> list[MemoryRecord]:
    return [m for m in memories if agent_id in m.related_agents]


def retrieve_salient(
    memories: list[MemoryRecord],
    *,
    current_tick: int,
    k: int = 10,
) -> list[MemoryRecord]:
    """Return the k most salient memories by importance * recency * (1 + trauma)."""
    def score(m: MemoryRecord) -> float:
        recency = compute_recency(m, current_tick)
        return m.importance * recency * (1.0 + m.trauma_score)

    return sorted(memories, key=score, reverse=True)[:k]


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
