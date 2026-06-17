"""PLAYER SESSION — the foundation under the god-layer.

Every connected creator gets a PlayerSession bound to a world. Sessions are PROCESS-CACHED for
the live god-camera / scene-state read-path and JSON-PERSISTED to a sidecar file so a server
restart doesn't drop the open creators on the floor. Kept deliberately out of the ORM: nothing
the simulation cares about lives here (the persistent god-effects already write through Event /
Memory / brain marks in routes/god.py), so a heavyweight table would just be drag.

Keeps the gaze sample + last intervention valence locally so the InterventionPanel can show
"you last culled at tick 1432" without round-tripping the audit log.
"""
from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional


_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_STORE_PATH = _DATA_DIR / "player_sessions.json"
_LOCK = threading.RLock()


@dataclass
class PlayerSession:
    player_id: str
    world_id: str
    possessed_minion_id: Optional[str] = None
    gaze_target_id: Optional[str] = None
    gaze_camera: Optional[dict] = None
    last_seen_ts: float = field(default_factory=lambda: time.time())
    started_ts: float = field(default_factory=lambda: time.time())
    last_intervention: Optional[dict] = None    # {verb, target_id, valence, tick}


# in-process cache, primary
_SESSIONS: dict[str, PlayerSession] = {}


def _key(world_id: str, player_id: str) -> str:
    return f"{world_id}::{player_id}"


def _save() -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = _STORE_PATH.with_suffix(".json.tmp")
        with _LOCK:
            payload = {k: asdict(v) for k, v in _SESSIONS.items()}
        tmp.write_text(json.dumps(payload, separators=(",", ":")))
        os.replace(tmp, _STORE_PATH)
    except Exception:  # noqa: BLE001 - persistence must never break the live request
        pass


def _load_once() -> None:
    if _SESSIONS or not _STORE_PATH.is_file():
        return
    try:
        raw = json.loads(_STORE_PATH.read_text())
        with _LOCK:
            for k, v in raw.items():
                _SESSIONS[k] = PlayerSession(**v)
    except Exception:  # noqa: BLE001
        pass


def start_session(world_id: str, player_id: str) -> PlayerSession:
    _load_once()
    with _LOCK:
        s = PlayerSession(player_id=player_id, world_id=world_id)
        _SESSIONS[_key(world_id, player_id)] = s
    _save()
    return s


def end_session(world_id: str, player_id: str) -> bool:
    _load_once()
    with _LOCK:
        gone = _SESSIONS.pop(_key(world_id, player_id), None) is not None
    if gone:
        _save()
    return gone


def get_session(world_id: str, player_id: str) -> Optional[PlayerSession]:
    _load_once()
    with _LOCK:
        return _SESSIONS.get(_key(world_id, player_id))


def world_sessions(world_id: str) -> list[PlayerSession]:
    _load_once()
    with _LOCK:
        return [s for k, s in _SESSIONS.items() if s.world_id == world_id]


def update_gaze(world_id: str, player_id: str, *, target_id: Optional[str] = None,
                camera: Optional[dict] = None) -> Optional[PlayerSession]:
    s = get_session(world_id, player_id)
    if s is None:
        return None
    with _LOCK:
        s.gaze_target_id = target_id
        if camera is not None:
            s.gaze_camera = camera
        s.last_seen_ts = time.time()
    _save()
    return s


def record_intervention(world_id: str, player_id: str, *, verb: str,
                        target_id: Optional[str], valence: float, tick: int) -> Optional[PlayerSession]:
    s = get_session(world_id, player_id)
    if s is None:
        return None
    with _LOCK:
        s.last_intervention = {"verb": verb, "target_id": target_id,
                               "valence": valence, "tick": tick, "ts": time.time()}
        s.last_seen_ts = time.time()
    _save()
    return s


def set_possessed(world_id: str, player_id: str, minion_id: Optional[str]) -> Optional[PlayerSession]:
    s = get_session(world_id, player_id)
    if s is None:
        return None
    with _LOCK:
        s.possessed_minion_id = minion_id
        s.last_seen_ts = time.time()
    _save()
    return s
