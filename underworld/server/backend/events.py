"""Event Stream Backend — Layer 5 architecture implementation.

Provides:
- Central event type enumeration with severity and category
- Event creation helpers with anomaly / player-caused flags
- Event query/retrieval functions
- Memory importance seeding from events
- Deterministic event ordering
"""
from __future__ import annotations

import enum
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


class EventCategory(str, enum.Enum):
    BIRTH = "birth"
    DEATH = "death"
    INJURY = "injury"
    DISEASE = "disease"
    HUNGER = "hunger"
    FEAR = "fear"
    RESCUE = "rescue"
    BETRAYAL = "betrayal"
    GIFT = "gift"
    THEFT = "theft"
    TRADE = "trade"
    ATTACK = "attack"
    MURDER = "murder"
    MIGRATION = "migration"
    BONDING = "bonding"
    CHILDBIRTH = "childbirth"
    LEADERSHIP = "leadership"
    REBELLION = "rebellion"
    WORSHIP = "worship"
    RITUAL = "ritual"
    FUNERAL = "funeral"
    DREAM = "dream"
    SPEECH = "speech"
    SYMBOL = "symbol"
    EXPERIMENT = "experiment"
    INVENTION = "invention"
    LAW = "law"
    PROPAGANDA = "propaganda"
    TRIAL = "trial"
    PLAYER_ACTION = "player_action"
    TIME_ROLLBACK = "time_rollback"
    SAVE_LOAD = "save_load"
    RESURRECTION = "resurrection"
    CLONE_FORK = "clone_fork"
    MIRACLE_ANOMALY = "miracle_anomaly"
    CIVILISATION_PHASE = "civilisation_phase"
    OTHER = "other"


class EventSeverity(int, enum.Enum):
    DEBUG = 0
    INFO = 1
    NOTICE = 2
    WARNING = 3
    ERROR = 4
    CRITICAL = 5


@dataclass(frozen=True)
class UnderworldEvent:
    """Immutable event record."""
    id: str
    tick: int
    timestamp: datetime
    category: EventCategory
    severity: EventSeverity
    actor_ids: tuple[str, ...]
    location: str | None
    payload: dict[str, Any]
    player_caused: bool
    anomaly: bool
    memory_importance_seed: float


class EventStream:
    """In-memory event stream with query capabilities.

    Production deployments should persist via the ORM ``Event`` model;
    this class is the pure logic layer that can also be used in tests
    and replay harnesses without a database.
    """

    def __init__(self, max_events: int = 100_000) -> None:
        self._events: list[UnderworldEvent] = []
        self._by_tick: dict[int, list[UnderworldEvent]] = {}
        self._by_actor: dict[str, list[UnderworldEvent]] = {}
        self._by_category: dict[EventCategory, list[UnderworldEvent]] = {}
        self._max_events = max_events

    # ── mutation ──────────────────────────────────────────────────────────────

    def emit(
        self,
        tick: int,
        category: EventCategory,
        *,
        severity: EventSeverity = EventSeverity.INFO,
        actor_ids: tuple[str, ...] = (),
        location: str | None = None,
        payload: dict[str, Any] | None = None,
        player_caused: bool = False,
        anomaly: bool = False,
        memory_importance_seed: float = 0.5,
        event_id: str | None = None,
        timestamp: datetime | None = None,
    ) -> UnderworldEvent:
        """Create and store an event."""
        evt = UnderworldEvent(
            id=event_id or str(uuid.uuid4()),
            tick=tick,
            timestamp=timestamp or datetime.now(timezone.utc),
            category=category,
            severity=severity,
            actor_ids=actor_ids,
            location=location,
            payload=payload or {},
            player_caused=player_caused,
            anomaly=anomaly,
            memory_importance_seed=_clamp(memory_importance_seed),
        )
        self._append(evt)
        return evt

    def _append(self, evt: UnderworldEvent) -> None:
        if len(self._events) >= self._max_events:
            # Drop oldest event and rebuild indices if needed.
            self._events.pop(0)
            self._rebuild_indices()
        self._events.append(evt)
        self._by_tick.setdefault(evt.tick, []).append(evt)
        for aid in evt.actor_ids:
            self._by_actor.setdefault(aid, []).append(evt)
        self._by_category.setdefault(evt.category, []).append(evt)

    def _rebuild_indices(self) -> None:
        self._by_tick.clear()
        self._by_actor.clear()
        self._by_category.clear()
        for evt in self._events:
            self._by_tick.setdefault(evt.tick, []).append(evt)
            for aid in evt.actor_ids:
                self._by_actor.setdefault(aid, []).append(evt)
            self._by_category.setdefault(evt.category, []).append(evt)

    # ── queries ───────────────────────────────────────────────────────────────

    def all_events(self) -> list[UnderworldEvent]:
        return list(self._events)

    def by_tick(self, tick: int) -> list[UnderworldEvent]:
        return list(self._by_tick.get(tick, []))

    def by_actor(self, actor_id: str) -> list[UnderworldEvent]:
        return list(self._by_actor.get(actor_id, []))

    def by_category(self, category: EventCategory) -> list[UnderworldEvent]:
        return list(self._by_category.get(category, []))

    def by_severity(self, min_level: EventSeverity) -> list[UnderworldEvent]:
        return [e for e in self._events if e.severity.value >= min_level.value]

    def anomalies(self) -> list[UnderworldEvent]:
        return [e for e in self._events if e.anomaly]

    def player_caused_events(self) -> list[UnderworldEvent]:
        return [e for e in self._events if e.player_caused]

    def range_query(
        self,
        start_tick: int,
        end_tick: int,
        *,
        category: EventCategory | None = None,
        min_severity: EventSeverity | None = None,
        actor_id: str | None = None,
    ) -> list[UnderworldEvent]:
        results: list[UnderworldEvent] = []
        for tick in range(start_tick, end_tick + 1):
            for evt in self._by_tick.get(tick, []):
                if category is not None and evt.category != category:
                    continue
                if min_severity is not None and evt.severity.value < min_severity.value:
                    continue
                if actor_id is not None and actor_id not in evt.actor_ids:
                    continue
                results.append(evt)
        return results

    def latest(self, n: int = 1) -> list[UnderworldEvent]:
        return self._events[-n:]

    def count(self) -> int:
        return len(self._events)

    def clear(self) -> None:
        self._events.clear()
        self._by_tick.clear()
        self._by_actor.clear()
        self._by_category.clear()

    # ── memory importance helpers ─────────────────────────────────────────────

    def importance_for_actor(self, actor_id: str, tick: int) -> float:
        """Aggregate memory importance seed for an actor at a given tick."""
        events = [e for e in self._by_tick.get(tick, []) if actor_id in e.actor_ids]
        if not events:
            return 0.0
        return max(e.memory_importance_seed for e in events)


# ── event factory helpers (deterministic when rng provided) ──────────────────

@dataclass
class EventFactory:
    """Deterministic event generator for tests and soak harnesses."""
    rng: random.Random = field(default_factory=lambda: random.Random(42))

    def spawn_event(
        self,
        tick: int,
        category: EventCategory,
        actor_ids: tuple[str, ...] = (),
        **kwargs: Any,
    ) -> UnderworldEvent:
        """Generate a plausible event with randomized but seeded internals."""
        severity = kwargs.pop("severity", self._default_severity(category))
        memory_importance_seed = kwargs.pop(
            "memory_importance_seed",
            round(self.rng.uniform(0.2, 0.9), 3),
        )
        return UnderworldEvent(
            id=str(uuid.uuid4()),
            tick=tick,
            timestamp=datetime.now(timezone.utc),
            category=category,
            severity=severity,
            actor_ids=actor_ids,
            location=kwargs.pop("location", None),
            payload=kwargs.pop("payload", {}),
            player_caused=kwargs.pop("player_caused", False),
            anomaly=kwargs.pop("anomaly", category == EventCategory.MIRACLE_ANOMALY),
            memory_importance_seed=memory_importance_seed,
        )

    @staticmethod
    def _default_severity(category: EventCategory) -> EventSeverity:
        mapping = {
            EventCategory.DEATH: EventSeverity.WARNING,
            EventCategory.MURDER: EventSeverity.CRITICAL,
            EventCategory.ATTACK: EventSeverity.ERROR,
            EventCategory.BETRAYAL: EventSeverity.ERROR,
            EventCategory.MIRACLE_ANOMALY: EventSeverity.CRITICAL,
            EventCategory.PLAYER_ACTION: EventSeverity.NOTICE,
            EventCategory.REBELLION: EventSeverity.WARNING,
            EventCategory.CIVILISATION_PHASE: EventSeverity.INFO,
        }
        return mapping.get(category, EventSeverity.INFO)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
