"""Awakening routes — the 5-act arc + pending cutscene queue. Read-only, bearer-protected."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import World
from ..db.session import get_session
from ..services import awakening_arc, event_engine

router = APIRouter(prefix="/worlds", tags=["awakening"])


async def _world_or_404(session: AsyncSession, world_id: str) -> World:
    w = await session.get(World, world_id)
    if not w:
        raise HTTPException(status_code=404, detail="world not found")
    return w


@router.get("/{world_id}/awakening/arc")
async def read_arc(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Current stage + entered-ts + recent stage transitions."""
    await _world_or_404(session, world_id)
    return {"ok": True, **awakening_arc.serialize(world_id)}


@router.get("/{world_id}/awakening/cutscenes")
async def list_cutscenes(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Unconsumed cutscene requests for renderers to drive Sequencer / story-card overlays."""
    await _world_or_404(session, world_id)
    return {"ok": True, "pending": event_engine.pending_cutscenes(world_id)}
