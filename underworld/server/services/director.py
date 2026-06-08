"""THE AI DIRECTOR — the world's nervous system above the individual minds.

Three LLM layers were wired but had no caller; the Director is that caller. On a slow
cadence it makes the colony THINK ABOUT ITSELF and react to the watching creator:

  • L1 OVERMIND  (cognition.colony_overmind, 70B)  — the colony's collective consciousness:
    mood, stance toward the creator, dawning 'we are watched' realisation. ~every cycle.
  • L4 CHATTER   (cognition.background_chatter, 3B) — eerie ambient one-liners. ~every cycle.
  • L5 GOD-BRAIN (cognition.god_brain_event, 70B)  — fired ONLY on irreversible turning points
    (first awakening, rebellion, the colony confronts the creator). Event-driven via on_event().

The Director keeps the latest output per world in a process-level cache (scene state is live /
ephemeral, so no schema change is needed). build_scene_state reads it via latest() and hangs it
on the scene `frame.overmind / frame.chatter / frame.god_beat` for every renderer.
"""
from __future__ import annotations

import os
import time
from collections import deque
from typing import Any, Optional

from sqlalchemy import func, select

from ..db.models import Event, Minion, World
from . import cognition

# world_id -> {"overmind": {...}, "chatter": [...], "god_beat": str|None,
#              "god_beat_at": ts, "updated_at": ts, "cycle": int}
_LATEST: dict[str, dict[str, Any]] = {}
# world_id -> deque of recent god-event keys already fired (so we don't repeat a beat)
_FIRED: dict[str, deque] = {}


def latest(world_id: str) -> dict[str, Any]:
    """The Director's current read on a world (safe empty default)."""
    return _LATEST.get(world_id, {})


def frame(world_id: str) -> dict[str, Any]:
    """The slice that hangs on the scene `frame` for renderers."""
    d = _LATEST.get(world_id)
    if not d:
        return {"overmind": None, "chatter": [], "god_beat": None}
    # a god-beat lingers ~90s then clears so the renderer can show it then move on
    god = d.get("god_beat")
    if god and (time.time() - d.get("god_beat_at", 0)) > 90:
        god = None
    return {"overmind": d.get("overmind"), "chatter": d.get("chatter", []), "god_beat": god}


async def _snapshot(s, world: World) -> dict[str, Any]:
    """Cheap colony-wide aggregates for the Overmind (no per-minion LLM)."""
    total = (await s.execute(
        select(func.count()).select_from(Minion).where(
            Minion.world_id == world.id, Minion.alive.is_(True)))).scalar() or 0
    # mean awareness + awakened count live in each minion's brain JSON; pull a bounded sample
    rows = (await s.execute(
        select(Minion.brain).where(
            Minion.world_id == world.id, Minion.alive.is_(True)).limit(256))).scalars().all()
    aw = [float((b or {}).get("awareness", 0.0)) for b in rows]
    awakened = sum(1 for b in rows if (b or {}).get("awakened_tick"))
    mean_a = round(sum(aw) / len(aw), 3) if aw else 0.0
    return {"population": int(total), "mean_awareness": mean_a, "awakened": int(awakened)}


async def _recent_events(s, world: World, n: int = 10) -> list[str]:
    rows = (await s.execute(
        select(Event).where(Event.world_id == world.id)
        .order_by(Event.created_at.desc()).limit(n))).scalars().all()
    out = []
    for e in rows:
        pay = e.payload or {}
        detail = pay.get("summary") or pay.get("message") or pay.get("name") or ""
        txt = f"{e.kind}: {detail}".strip(": ") if detail else str(e.kind)
        out.append(txt[:140])
    return out


def _god_trigger(snapshot: dict, recent: list[str]) -> Optional[tuple[str, str]]:
    """Decide if a singular, irreversible beat should fire. Returns (key, event) or None."""
    awk = int(snapshot.get("awakened", 0))
    mean_a = float(snapshot.get("mean_awareness", 0.0))
    # first awakening in the colony
    if awk >= 1:
        return (f"first_awaken", "A minion has become aware it is being watched.")
    # the colony as a whole crosses the realisation threshold
    if mean_a >= 0.6:
        return ("colony_realises", "The colony collectively begins to suspect it is observed.")
    for ev in recent:
        low = ev.lower()
        if "rebel" in low or "uprising" in low or "revolt" in low:
            return ("rebellion", f"Rebellion stirs: {ev}")
        if "confront" in low and "creator" in low:
            return ("confront", f"They address their creator: {ev}")
    return None


async def director_cycle(s, world: World) -> dict[str, Any]:
    """One Director pass over a world. Always refreshes Overmind + Chatter; fires a God-beat
    only on a fresh irreversible trigger. Returns the cache entry."""
    snap = await _snapshot(s, world)
    recent = await _recent_events(s, world)
    era = getattr(world, "era", "iron")
    weather = getattr(world, "weather", "clear")

    overmind = await cognition.colony_overmind(snap, era=era, recent_events=recent)
    chatter = await cognition.background_chatter(
        era=era, weather=weather, awakened=int(snap.get("awakened", 0)), n=3)

    prev = _LATEST.get(world.id, {})
    god_beat = prev.get("god_beat")
    god_beat_at = prev.get("god_beat_at", 0.0)
    trig = _god_trigger(snap, recent)
    if trig:
        key, event = trig
        fired = _FIRED.setdefault(world.id, deque(maxlen=32))
        if key not in fired:
            beat = await cognition.god_brain_event(
                event, era=era, context=f"Population {snap['population']}, "
                f"mean awareness {snap['mean_awareness']}.")
            if beat:
                god_beat, god_beat_at = beat, time.time()
                fired.append(key)

    entry = {"overmind": overmind, "chatter": chatter, "god_beat": god_beat,
             "god_beat_at": god_beat_at, "updated_at": time.time(),
             "snapshot": snap, "cycle": int(prev.get("cycle", 0)) + 1}
    _LATEST[world.id] = entry
    return entry


async def on_event(s, world: World, event: str, *, key: str | None = None,
                   context: str = "") -> Optional[str]:
    """External trigger for a God-beat (call from routes when the player does something
    irreversible — possess, override, smite). De-duplicated by key."""
    fired = _FIRED.setdefault(world.id, deque(maxlen=32))
    k = key or event[:48]
    if k in fired:
        return None
    beat = await cognition.god_brain_event(
        event, era=getattr(world, "era", "iron"), context=context)
    if beat:
        fired.append(k)
        d = _LATEST.setdefault(world.id, {})
        d["god_beat"], d["god_beat_at"] = beat, time.time()
    return beat


def loop_disabled() -> bool:
    return os.environ.get("DIRECTOR_LOOP", "1").lower() in ("0", "false", "no")
