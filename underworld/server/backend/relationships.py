"""Relationship Intelligence Backend — Layer 20 architecture.

Tracks multi-dimensional relationship state: trust, fear, loyalty, debt,
betrayal, kinship, reputation, status, influence.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any


@dataclass
class RelationshipState:
    """Directed relationship from agent A to agent B."""
    from_id: str
    to_id: str
    trust: float = 0.5
    fear: float = 0.0
    loyalty: float = 0.5
    debt: float = 0.0
    betrayal: float = 0.0
    kinship: float = 0.0
    reputation: float = 1.0
    status_delta: float = 0.0  # positive = A sees B as higher status
    influence: float = 0.0
    formed_tick: int = 0
    last_interaction_tick: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "from_id": self.from_id,
            "to_id": self.to_id,
            "trust": self.trust,
            "fear": self.fear,
            "loyalty": self.loyalty,
            "debt": self.debt,
            "betrayal": self.betrayal,
            "kinship": self.kinship,
            "reputation": self.reputation,
            "status_delta": self.status_delta,
            "influence": self.influence,
            "formed_tick": self.formed_tick,
            "last_interaction_tick": self.last_interaction_tick,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "RelationshipState":
        return cls(
            from_id=d["from_id"],
            to_id=d["to_id"],
            trust=float(d.get("trust", 0.5)),
            fear=float(d.get("fear", 0.0)),
            loyalty=float(d.get("loyalty", 0.5)),
            debt=float(d.get("debt", 0.0)),
            betrayal=float(d.get("betrayal", 0.0)),
            kinship=float(d.get("kinship", 0.0)),
            reputation=float(d.get("reputation", 1.0)),
            status_delta=float(d.get("status_delta", 0.0)),
            influence=float(d.get("influence", 0.0)),
            formed_tick=int(d.get("formed_tick", 0)),
            last_interaction_tick=int(d.get("last_interaction_tick", 0)),
        )


class RelationshipGraph:
    """In-memory relationship graph with fast lookups."""

    def __init__(self, max_edges: int = 200_000) -> None:
        self._edges: dict[tuple[str, str], RelationshipState] = {}
        self._outgoing: dict[str, list[str]] = {}
        self._incoming: dict[str, list[str]] = {}
        self._max_edges = max_edges

    def _key(self, a: str, b: str) -> tuple[str, str]:
        return (a, b)

    def upsert(self, rel: RelationshipState) -> RelationshipState:
        key = self._key(rel.from_id, rel.to_id)
        if key not in self._edges and len(self._edges) >= self._max_edges:
            raise RuntimeError("Relationship graph at capacity")
        self._edges[key] = rel
        if rel.to_id not in self._outgoing.get(rel.from_id, []):
            self._outgoing.setdefault(rel.from_id, []).append(rel.to_id)
        if rel.from_id not in self._incoming.get(rel.to_id, []):
            self._incoming.setdefault(rel.to_id, []).append(rel.from_id)
        return rel

    def get(self, from_id: str, to_id: str) -> RelationshipState | None:
        return self._edges.get(self._key(from_id, to_id))

    def outgoing(self, agent_id: str) -> list[RelationshipState]:
        return [self._edges[self._key(agent_id, tid)] for tid in self._outgoing.get(agent_id, [])]

    def incoming(self, agent_id: str) -> list[RelationshipState]:
        return [self._edges[self._key(fid, agent_id)] for fid in self._incoming.get(agent_id, [])]

    def update_from_event(
        self,
        from_id: str,
        to_id: str,
        event_kind: str,
        *,
        tick: int,
        intensity: float = 0.5,
    ) -> RelationshipState:
        """Update or create a relationship edge based on an event."""
        rel = self.get(from_id, to_id)
        if rel is None:
            rel = RelationshipState(from_id=from_id, to_id=to_id, formed_tick=tick)

        kind = event_kind.lower()
        if kind in ("gift", "rescue", "help", "teach"):
            rel = replace(
                rel,
                trust=_clamp(rel.trust + 0.2 * intensity),
                loyalty=_clamp(rel.loyalty + 0.15 * intensity),
                debt=_clamp(rel.debt - 0.1 * intensity),
                fear=_clamp(rel.fear - 0.05 * intensity),
                betrayal=max(0.0, rel.betrayal - 0.05 * intensity),
            )
        elif kind in ("betrayal", "theft", "attack", "murder"):
            rel = replace(
                rel,
                betrayal=_clamp(rel.betrayal + 0.4 * intensity),
                trust=_clamp(rel.trust - 0.3 * intensity),
                loyalty=_clamp(rel.loyalty - 0.25 * intensity),
                fear=_clamp(rel.fear + 0.2 * intensity),
            )
        elif kind in ("bonding", "childbirth", "marriage"):
            rel = replace(
                rel,
                kinship=_clamp(rel.kinship + 0.3 * intensity),
                attachment=0.0,  # not stored here, but signals
                trust=_clamp(rel.trust + 0.15 * intensity),
            )
        elif kind in ("rivalry", "insult", "competition"):
            rel = replace(
                rel,
                status_delta=rel.status_delta + 0.1 * intensity,
                trust=_clamp(rel.trust - 0.05 * intensity),
            )

        rel = replace(rel, last_interaction_tick=tick)
        self.upsert(rel)
        return rel

    def aggregate_reputation(self, agent_id: str) -> float:
        """Compute mean reputation as seen by all agents who know this one."""
        incoming = self.incoming(agent_id)
        if not incoming:
            return 1.0
        return sum(r.reputation for r in incoming) / len(incoming)

    def trusted_allies(self, agent_id: str, threshold: float = 0.6) -> list[str]:
        return [r.to_id for r in self.outgoing(agent_id) if r.trust >= threshold]

    def feared_enemies(self, agent_id: str, threshold: float = 0.5) -> list[str]:
        return [r.to_id for r in self.outgoing(agent_id) if r.fear >= threshold]

    def remove(self, from_id: str, to_id: str) -> bool:
        key = self._key(from_id, to_id)
        if key not in self._edges:
            return False
        del self._edges[key]
        self._outgoing.get(from_id, []).remove(to_id)
        self._incoming.get(to_id, []).remove(from_id)
        return True

    def count(self) -> int:
        return len(self._edges)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
