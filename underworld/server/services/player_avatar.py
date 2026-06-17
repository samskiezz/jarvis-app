"""PLAYER AVATAR — the creator's body in the world.

Three modes (Bible §4.4):
  • free        — a normal walking body the creator can drive around the colony.
  • possess     — bound to a specific minion (delegated to services/possession.py for the brain marks).
  • god_camera  — a free-flight observation pawn; no physical presence, but the renderer still
                  shows a faint sigil so the colony's PresenceField can react to gaze.

The pos/yaw/pitch are the source of truth for the UE5 / WebGL renderer's avatar actor. Like
PlayerSession, this is in-process + JSON sidecar persisted (no ORM table, no migration).
"""
from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional


AVATAR_MODES = {"free", "possess", "god_camera"}

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_STORE_PATH = _DATA_DIR / "player_avatars.json"
_LOCK = threading.RLock()


@dataclass
class PlayerAvatar:
    player_id: str
    world_id: str
    pos: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    yaw: float = 0.0
    pitch: float = 0.0
    mode: str = "god_camera"
    updated_ts: float = field(default_factory=lambda: time.time())


_AVATARS: dict[str, PlayerAvatar] = {}


def _key(world_id: str, player_id: str) -> str:
    return f"{world_id}::{player_id}"


def _save() -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = _STORE_PATH.with_suffix(".json.tmp")
        with _LOCK:
            payload = {k: asdict(v) for k, v in _AVATARS.items()}
        tmp.write_text(json.dumps(payload, separators=(",", ":")))
        os.replace(tmp, _STORE_PATH)
    except Exception:  # noqa: BLE001
        pass


def _load_once() -> None:
    if _AVATARS or not _STORE_PATH.is_file():
        return
    try:
        raw = json.loads(_STORE_PATH.read_text())
        with _LOCK:
            for k, v in raw.items():
                _AVATARS[k] = PlayerAvatar(**v)
    except Exception:  # noqa: BLE001
        pass


def spawn(world_id: str, player_id: str, *, pos: Optional[list[float]] = None,
          mode: str = "god_camera") -> PlayerAvatar:
    if mode not in AVATAR_MODES:
        mode = "god_camera"
    _load_once()
    with _LOCK:
        a = PlayerAvatar(player_id=player_id, world_id=world_id,
                         pos=list(pos or [0.0, 30.0, 0.0]), mode=mode)
        _AVATARS[_key(world_id, player_id)] = a
    _save()
    return a


def teleport(world_id: str, player_id: str, pos: list[float]) -> Optional[PlayerAvatar]:
    a = get(world_id, player_id)
    if a is None:
        return None
    with _LOCK:
        a.pos = [float(pos[0]), float(pos[1]) if len(pos) > 1 else a.pos[1],
                 float(pos[2]) if len(pos) > 2 else a.pos[2]]
        a.updated_ts = time.time()
    _save()
    return a


def move(world_id: str, player_id: str, *, pos: Optional[list[float]] = None,
         yaw: Optional[float] = None, pitch: Optional[float] = None) -> Optional[PlayerAvatar]:
    a = get(world_id, player_id)
    if a is None:
        return None
    with _LOCK:
        if pos is not None:
            a.pos = [float(pos[0]),
                     float(pos[1]) if len(pos) > 1 else a.pos[1],
                     float(pos[2]) if len(pos) > 2 else a.pos[2]]
        if yaw is not None:
            a.yaw = float(yaw)
        if pitch is not None:
            a.pitch = float(pitch)
        a.updated_ts = time.time()
    _save()
    return a


def set_mode(world_id: str, player_id: str, mode: str) -> Optional[PlayerAvatar]:
    if mode not in AVATAR_MODES:
        return None
    a = get(world_id, player_id)
    if a is None:
        return None
    with _LOCK:
        a.mode = mode
        a.updated_ts = time.time()
    _save()
    return a


def get(world_id: str, player_id: str) -> Optional[PlayerAvatar]:
    _load_once()
    with _LOCK:
        return _AVATARS.get(_key(world_id, player_id))


def world_avatars(world_id: str) -> list[PlayerAvatar]:
    """All avatars in a world — for the scene_state frame block. Most worlds have one creator."""
    _load_once()
    with _LOCK:
        return [a for k, a in _AVATARS.items() if a.world_id == world_id]


def primary_avatar_block(world_id: str) -> Optional[dict]:
    """Pick the most recently active avatar for a world and serialise it for the renderer
    contract. None when no creator is present so the renderer omits the actor entirely."""
    avs = world_avatars(world_id)
    if not avs:
        return None
    avs.sort(key=lambda a: a.updated_ts, reverse=True)
    a = avs[0]
    return {"player_id": a.player_id, "pos": a.pos, "yaw": a.yaw, "pitch": a.pitch,
            "mode": a.mode, "updated_ts": a.updated_ts}
