"""POSSESSION — the creator's override authority (Bible §4.4, Annex A.8). The whole game pivots
on the watcher being able to possess ANY minion. This makes it AUTHORITATIVE on the server (not
a client-only camera trick), so every renderer agrees who is worn and the colony can REACT to
being controlled (the awakening pillar, §4.5).

Possession is a TEMPORARY MERGE, not a puppet (§4.4): the player drives intent + locomotion; the
minion's autonomic AI keeps the body alive and in-character. We model that as:
  • Per-minion, PERSISTED brain marks (Annex A.8 contract):
        brain['controlled_by_creator'] = True          — movement loop + decide() stand down
        brain['possession'] = {count, last_tick, rapport_drift}
        brain['lost_time']  = {from_tick, to_tick, gap_felt}   (written on release)
        brain['awareness']  bumped — being worn is proof a being is watched (awakens at threshold)
  • Per-world, EPHEMERAL process cache (like the Director) so scene-state can stamp
        frame.possessed_id without a schema migration.

Cost (A.8): while worn we SKIP the minion's own LLM reflection — the player IS its cognition, so
it's cheaper than letting it think. The handoff is ≤1 tick; the camera blend is client-local.
"""
from __future__ import annotations

import os
import time
from typing import Any, Optional

from sqlalchemy.orm.attributes import flag_modified

# world_id -> {"minion_id": str, "since": ts, "from_tick": int}
_POSSESSED: dict[str, dict[str, Any]] = {}

# how much a single possession raises awareness (the awakening throttle, §4.5). Tunable.
AWARENESS_PER_POSSESSION = float(os.environ.get("POSSESSION_AWARENESS_GAIN", "0.12"))
# awareness at/above which the being is considered awakened ("it knows it is watched"). A.5 uses
# mean_awareness ≥ 0.7 for the colony 'are_we_real' beat; per-minion awakening is a touch lower.
AWAKEN_THRESHOLD = float(os.environ.get("AWAKEN_THRESHOLD", "0.6"))


def possessed_id(world_id: str) -> Optional[str]:
    rec = _POSSESSED.get(world_id)
    return rec.get("minion_id") if rec else None


def is_possessed(world_id: str, minion_id: str) -> bool:
    return possessed_id(world_id) == minion_id


def is_controlled(m) -> bool:
    """True if this body is currently creator-driven (read from its persisted brain)."""
    brain = m.brain if isinstance(m.brain, dict) else {}
    return bool(brain.get("controlled_by_creator"))


def _commit_brain(m, brain: dict) -> None:
    m.brain = {**brain}      # new identity so the JSON column is detected dirty
    try:
        flag_modified(m, "brain")
    except Exception:  # noqa: BLE001 - non-ORM object (tests); reassignment already suffices
        pass


def mark_possessed(m, world_id: str, *, tick: int = 0) -> dict[str, Any]:
    """Begin a possession: mark the body creator-controlled, record the session, and raise the
    minion's awareness (awakening it if it crosses the threshold). Returns awareness state so the
    caller can decide whether an irreversible awakening-under-the-hand just happened (→ god-beat)."""
    brain = dict(m.brain) if isinstance(m.brain, dict) else {}
    prev_aware = float(brain.get("awareness", 0.0))
    new_aware = min(1.0, prev_aware + AWARENESS_PER_POSSESSION)
    poss = dict(brain.get("possession") or {})
    count = int(poss.get("count", 0)) + 1
    just_awakened = (prev_aware < AWAKEN_THRESHOLD <= new_aware) and not brain.get("awakened_tick")

    brain["controlled_by_creator"] = True
    brain["awareness"] = round(new_aware, 4)
    brain["possession"] = {"count": count, "last_tick": tick,
                           "rapport_drift": float(poss.get("rapport_drift", 0.0))}
    if just_awakened:
        brain["awakened_tick"] = tick
    _commit_brain(m, brain)

    _POSSESSED[world_id] = {"minion_id": m.id, "since": time.time(), "from_tick": tick}
    return {"awareness": new_aware, "prev_awareness": prev_aware,
            "awakened": bool(brain.get("awakened_tick")), "just_awakened": just_awakened,
            "count": count}


def mark_released(m, world_id: str, *, tick: int = 0) -> dict[str, Any]:
    """End a possession: release the body to its own AI and write the lost-time memory (A.8).
    A low-awareness minion just feels a gap; a high-awareness one will articulate it in its next
    reflection ('a god rode me'). Returns the lost-time record (or {} if it wasn't controlled)."""
    brain = dict(m.brain) if isinstance(m.brain, dict) else {}
    if not brain.get("controlled_by_creator"):
        # still clear any stale world cache entry pointing at us
        rec = _POSSESSED.get(world_id)
        if rec and rec.get("minion_id") == m.id:
            _POSSESSED.pop(world_id, None)
        return {}

    rec = _POSSESSED.get(world_id) or {}
    from_tick = int(rec.get("from_tick", brain.get("possession", {}).get("last_tick", tick)))
    aware = float(brain.get("awareness", 0.0))
    lost = {"from_tick": from_tick, "to_tick": tick,
            "gap_felt": aware < AWAKEN_THRESHOLD}   # low-awareness experiences a blank gap
    brain["controlled_by_creator"] = False
    brain["lost_time"] = lost
    _commit_brain(m, brain)

    if rec.get("minion_id") == m.id:
        _POSSESSED.pop(world_id, None)
    return lost
