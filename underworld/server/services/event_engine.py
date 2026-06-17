"""EVENT ENGINE — buffers irreversible "this needs a cutscene" requests so the renderer can
poll them and the player never misses a turning point. The director.on_event() path FIRES the
god-beat text (LLM-generated); this engine SIDES that fire by also queueing a cutscene request
that the UE5 Sequencer or the WebGL story-card layer can pick up.

Process-cached deque per world (cinematics are ephemeral — once the player has watched the act
play out, it's spent). The cinematic itself (SEQ_AwakeningAct1..5) is authored in the UE5
Editor and listed in the Phase 7 handoff doc.
"""
from __future__ import annotations

import time
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class CutsceneRequest:
    beat_id: str
    world_id: str
    type: str             # 'first_awaken' | 'are_we_real' | 'confront_creator' | 'rebellion' | ...
    payload: dict = field(default_factory=dict)
    ts: float = field(default_factory=lambda: time.time())
    consumed: bool = False


# world_id -> deque of CutsceneRequest (newest at the right)
_PENDING: dict[str, deque[CutsceneRequest]] = {}
# world_id -> set of beat keys already requested (so we don't re-queue an Act 1 every tick)
_FIRED_KEYS: dict[str, set[str]] = {}

MAX_PENDING_PER_WORLD = 16


def request_cutscene(world_id: str, *, type: str, payload: Optional[dict] = None,
                     key: Optional[str] = None) -> Optional[CutsceneRequest]:
    """Queue a cutscene request. De-duped by `key` (defaults to type) within a world so the
    same act doesn't re-queue every director tick. Returns the new request or None if it was a
    duplicate."""
    keys = _FIRED_KEYS.setdefault(world_id, set())
    k = key or type
    if k in keys:
        return None
    keys.add(k)
    q = _PENDING.setdefault(world_id, deque(maxlen=MAX_PENDING_PER_WORLD))
    req = CutsceneRequest(beat_id=str(uuid.uuid4()), world_id=world_id,
                          type=type, payload=payload or {})
    q.append(req)
    return req


def pending_cutscenes(world_id: str) -> list[dict]:
    """The renderer-facing read: all currently-unconsumed cutscene requests for a world."""
    q = _PENDING.get(world_id) or deque()
    return [asdict(r) for r in q if not r.consumed]


def mark_consumed(world_id: str, beat_id: str) -> bool:
    """Called by the renderer once it has played the cinematic. Returns True if it found
    the beat."""
    q = _PENDING.get(world_id) or deque()
    for r in q:
        if r.beat_id == beat_id and not r.consumed:
            r.consumed = True
            return True
    return False


def subscribe_to_director(world_id: str, beat_key: str, beat_text: str) -> Optional[CutsceneRequest]:
    """director.on_event() should call this after a successful god-beat fire so the cinematic
    queue mirrors the LLM beat. Idempotent per (world_id, beat_key)."""
    return request_cutscene(world_id, type=beat_key,
                            payload={"god_beat_text": beat_text}, key=beat_key)


def clear_world(world_id: str) -> None:
    """Wipe a world's pending queue + fired keys (for tests / scheduler resets)."""
    _PENDING.pop(world_id, None)
    _FIRED_KEYS.pop(world_id, None)
