"""PLAYER ROUTES — the god-layer ingress for a creator binding to a world.

A creator opens a session against a world, spawns/moves their avatar (free body, god-camera, or
possess-target), and the existing /worlds/{id}/player/{gaze,act} routes in routes/god.py do the
heavy intervention work. This module is purely the SESSION + AVATAR lifecycle; intervention
verbs stay in god.py so the B-3 rate-limit / audit pipeline isn't duplicated.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import World
from ..db.session import get_session
from ..services import player_avatar, player_session

router = APIRouter(prefix="/worlds", tags=["player"])


class AvatarSpawnRequest(BaseModel):
    pos: Optional[list[float]] = None
    mode: str = "god_camera"


class AvatarMoveRequest(BaseModel):
    pos: Optional[list[float]] = None
    yaw: Optional[float] = None
    pitch: Optional[float] = None


class AvatarModeRequest(BaseModel):
    mode: str


async def _world_or_404(session: AsyncSession, world_id: str) -> World:
    w = await session.get(World, world_id)
    if not w:
        raise HTTPException(status_code=404, detail="world not found")
    return w


def _serialize_session(s) -> dict:
    return {"player_id": s.player_id, "world_id": s.world_id,
            "possessed_minion_id": s.possessed_minion_id,
            "gaze_target_id": s.gaze_target_id,
            "started_ts": s.started_ts, "last_seen_ts": s.last_seen_ts,
            "last_intervention": s.last_intervention}


def _serialize_avatar(a) -> dict:
    return {"player_id": a.player_id, "world_id": a.world_id, "pos": a.pos,
            "yaw": a.yaw, "pitch": a.pitch, "mode": a.mode, "updated_ts": a.updated_ts}


@router.post("/{world_id}/player/session")
async def start_player_session(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
    x_player_id: str = Header(default="creator"),
):
    """Open or refresh the creator's session against a world."""
    await _world_or_404(session, world_id)
    s = player_session.start_session(world_id, x_player_id)
    return {"ok": True, "session": _serialize_session(s)}


@router.delete("/{world_id}/player/session/{player_id}")
async def end_player_session(
    world_id: str,
    player_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Close a creator's session. Avatar persists so a re-open lands in the same spot."""
    await _world_or_404(session, world_id)
    gone = player_session.end_session(world_id, player_id)
    return {"ok": True, "ended": gone}


@router.get("/{world_id}/player/session/{player_id}")
async def read_player_session(
    world_id: str,
    player_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Read the creator's current session — gaze target, last intervention, possessed body id."""
    await _world_or_404(session, world_id)
    s = player_session.get_session(world_id, player_id)
    if s is None:
        raise HTTPException(status_code=404, detail="session not found")
    a = player_avatar.get(world_id, player_id)
    return {"ok": True, "session": _serialize_session(s),
            "avatar": _serialize_avatar(a) if a else None}


@router.post("/{world_id}/player/avatar/spawn")
async def spawn_player_avatar(
    world_id: str,
    body: AvatarSpawnRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
    x_player_id: str = Header(default="creator"),
):
    """Place / reset the creator's avatar in the world. Defaults to god-camera at (0, 30, 0)."""
    await _world_or_404(session, world_id)
    if player_session.get_session(world_id, x_player_id) is None:
        player_session.start_session(world_id, x_player_id)
    a = player_avatar.spawn(world_id, x_player_id, pos=body.pos, mode=body.mode)
    return {"ok": True, "avatar": _serialize_avatar(a)}


@router.post("/{world_id}/player/avatar/move")
async def move_player_avatar(
    world_id: str,
    body: AvatarMoveRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
    x_player_id: str = Header(default="creator"),
):
    """Update avatar position / yaw / pitch. Renderers read this on the next scene_state frame."""
    await _world_or_404(session, world_id)
    a = player_avatar.move(world_id, x_player_id, pos=body.pos, yaw=body.yaw, pitch=body.pitch)
    if a is None:
        raise HTTPException(status_code=404, detail="avatar not spawned")
    return {"ok": True, "avatar": _serialize_avatar(a)}


@router.post("/{world_id}/player/avatar/mode")
async def set_player_avatar_mode(
    world_id: str,
    body: AvatarModeRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
    x_player_id: str = Header(default="creator"),
):
    """Switch the avatar between free / possess / god_camera. Possession's brain marks are
    written by routes/god.py (the override/possess verbs); this only updates the avatar mode flag."""
    await _world_or_404(session, world_id)
    a = player_avatar.set_mode(world_id, x_player_id, body.mode)
    if a is None:
        raise HTTPException(status_code=400, detail="avatar not spawned or invalid mode")
    return {"ok": True, "avatar": _serialize_avatar(a)}
