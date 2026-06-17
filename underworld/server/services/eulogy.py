"""EULOGY — the death-recap loop the Blizzard-level doc flagged.

Each minion who dies gets a generated Eulogy (cause, last action, age, lineage, knowledge
contribution, relationships). Renderers surface them as cards — a momentary pause for the
colony's most important loss-of-meaning beat.

PROCESS-CACHED ring per world (16-deep). Persistence is the EVENT table — every cull/smite
ALREADY writes Event(kind=divine_act); a future eulogy persistence layer can index that table.
The on_minion_death hook is the entry point we expose for the simulation / death lifecycle.
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class Eulogy:
    minion_id: str
    world_id: str
    name: str
    cause: str
    last_action: str = ""
    age_ticks: int = 0
    generation: int = 0
    knowledge_contribution: str = ""
    relationships: list[str] = field(default_factory=list)
    lineage: list[str] = field(default_factory=list)
    died_at_tick: int = 0
    ts: float = field(default_factory=lambda: time.time())


_RECENT: dict[str, deque[Eulogy]] = {}
MAX_PER_WORLD = 64


def record_death(world_id: str, minion_id: str, *, name: str, cause: str,
                 last_action: str = "", age_ticks: int = 0, generation: int = 0,
                 knowledge_contribution: str = "", relationships: Optional[list[str]] = None,
                 lineage: Optional[list[str]] = None, died_at_tick: int = 0) -> Eulogy:
    """Push a fresh eulogy to the world's ring. Callable from the lifecycle / god routes."""
    e = Eulogy(minion_id=minion_id, world_id=world_id, name=name, cause=cause,
               last_action=last_action, age_ticks=age_ticks, generation=generation,
               knowledge_contribution=knowledge_contribution,
               relationships=list(relationships or []), lineage=list(lineage or []),
               died_at_tick=died_at_tick)
    q = _RECENT.setdefault(world_id, deque(maxlen=MAX_PER_WORLD))
    q.append(e)
    return e


def recent_eulogies(world_id: str, limit: int = 20) -> list[dict]:
    q = _RECENT.get(world_id) or deque()
    items = list(q)[-limit:]
    items.reverse()
    return [asdict(e) for e in items]


def clear_world(world_id: str) -> None:
    _RECENT.pop(world_id, None)
