"""Agent Identity Continuity Backend — Layer 2 / Layer 8 architecture.

Tracks persistent identity across incarnation, clone/fork divergence,
death/archive transitions, and soul continuity.
"""
from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from typing import Any


class OriginKind(str, enum.Enum):
    NATURAL_BIRTH = "natural_birth"
    REINCARNATION = "reincarnation"
    FORK = "fork"
    CLONE = "clone"
    EMERGENT = "emergent"
    IMPORTED = "imported"


class DeathState(str, enum.Enum):
    ALIVE = "alive"
    DYING = "dying"
    DEAD = "dead"
    ARCHIVED = "archived"
    ASCENDED = "ascended"


@dataclass
class AgentIdentity:
    """Persistent identity record for a synthetic agent.

    This is the backend identity vector; UI display names live on the
    Minion body row and reference this identity via ``identity_id``.
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    soul_token: str = field(default_factory=lambda: str(uuid.uuid4()))
    display_name: str = ""
    birth_tick: int = 0
    origin: OriginKind = OriginKind.NATURAL_BIRTH
    parent_ids: tuple[str, ...] = ()
    clone_source_id: str | None = None
    fork_source_id: str | None = None
    death_state: DeathState = DeathState.ALIVE
    death_tick: int | None = None
    cause_of_death: str | None = None
    # Identity continuity scores
    self_coherence: float = 1.0
    identity_fracture: float = 0.0
    clone_divergence: float = 0.0
    reincarnation_count: int = 0
    # Metadata
    extra: dict[str, Any] = field(default_factory=dict)


class IdentityRegistry:
    """In-memory registry of persistent identities.

    In production this should be backed by the ``Soul`` and ``Minion`` tables.
    The registry provides fast lookups and continuity checks without DB round
    trips during simulation ticks.
    """

    def __init__(self, max_identities: int = 50_000) -> None:
        self._idents: dict[str, AgentIdentity] = {}
        self._by_soul: dict[str, str] = {}  # soul_token -> identity_id
        self._by_parent: dict[str, list[str]] = {}
        self._by_clone_source: dict[str, list[str]] = {}
        self._max_identities = max_identities

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def register(self, ident: AgentIdentity) -> AgentIdentity:
        if len(self._idents) >= self._max_identities:
            raise RuntimeError("Identity registry at capacity")
        self._idents[ident.id] = ident
        self._by_soul[ident.soul_token] = ident.id
        for pid in ident.parent_ids:
            self._by_parent.setdefault(pid, []).append(ident.id)
        if ident.clone_source_id:
            self._by_clone_source.setdefault(ident.clone_source_id, []).append(ident.id)
        if ident.fork_source_id:
            self._by_clone_source.setdefault(ident.fork_source_id, []).append(ident.id)
        return ident

    def get(self, identity_id: str) -> AgentIdentity | None:
        return self._idents.get(identity_id)

    def by_soul(self, soul_token: str) -> AgentIdentity | None:
        iid = self._by_soul.get(soul_token)
        return self._idents.get(iid) if iid else None

    def children_of(self, parent_id: str) -> list[AgentIdentity]:
        return [self._idents[iid] for iid in self._by_parent.get(parent_id, []) if iid in self._idents]

    def clones_of(self, source_id: str) -> list[AgentIdentity]:
        return [self._idents[iid] for iid in self._by_clone_source.get(source_id, []) if iid in self._idents]

    def update(self, identity_id: str, **kwargs: Any) -> AgentIdentity | None:
        ident = self._idents.get(identity_id)
        if ident is None:
            return None
        for k, v in kwargs.items():
            if hasattr(ident, k):
                setattr(ident, k, v)
        return ident

    def mark_dead(
        self,
        identity_id: str,
        tick: int,
        cause: str,
        death_state: DeathState = DeathState.DEAD,
    ) -> AgentIdentity | None:
        ident = self._idents.get(identity_id)
        if ident is None:
            return None
        ident.death_state = death_state
        ident.death_tick = tick
        ident.cause_of_death = cause
        return ident

    def mark_reincarnated(
        self,
        identity_id: str,
        new_body_id: str,
        tick: int,
    ) -> AgentIdentity | None:
        ident = self._idents.get(identity_id)
        if ident is None:
            return None
        ident.reincarnation_count += 1
        ident.death_state = DeathState.ALIVE
        ident.death_tick = None
        ident.cause_of_death = None
        ident.birth_tick = tick
        ident.origin = OriginKind.REINCARNATION
        ident.self_coherence = max(0.0, ident.self_coherence - 0.1 * ident.identity_fracture)
        return ident

    def all_alive(self) -> list[AgentIdentity]:
        return [i for i in self._idents.values() if i.death_state == DeathState.ALIVE]

    def all_dead(self) -> list[AgentIdentity]:
        return [i for i in self._idents.values() if i.death_state == DeathState.DEAD]

    def count(self) -> int:
        return len(self._idents)

    def compute_divergence(
        self,
        identity_id: str,
        source_id: str,
        *,
        tick_delta: int,
        event_count_delta: int,
    ) -> float:
        """Compute clone/fork divergence score between two identities."""
        ident = self._idents.get(identity_id)
        source = self._idents.get(source_id)
        if not ident or not source:
            return 0.0
        # Simple divergence model: time + experience drift.
        time_drift = min(1.0, tick_delta / 1000.0)
        exp_drift = min(1.0, event_count_delta / 100.0)
        divergence = 0.4 * time_drift + 0.6 * exp_drift
        ident.clone_divergence = divergence
        return divergence

    def continuity_check(self, identity_id: str) -> dict[str, Any]:
        """Return a diagnostic dict for identity continuity."""
        ident = self._idents.get(identity_id)
        if not ident:
            return {"valid": False, "reason": "identity_not_found"}
        issues: list[str] = []
        if ident.identity_fracture > 0.7:
            issues.append("high_fracture")
        if ident.clone_divergence > 0.8:
            issues.append("high_divergence")
        if ident.self_coherence < 0.3:
            issues.append("low_coherence")
        return {
            "valid": len(issues) == 0,
            "identity_id": ident.id,
            "soul_token": ident.soul_token,
            "death_state": ident.death_state.value,
            "self_coherence": ident.self_coherence,
            "identity_fracture": ident.identity_fracture,
            "clone_divergence": ident.clone_divergence,
            "reincarnation_count": ident.reincarnation_count,
            "issues": issues,
        }
