"""Eulogy routes — recent death-recap cards per world. Bearer-protected, read-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import World
from ..db.session import get_session
from ..services import eulogy as eulogy_svc

router = APIRouter(prefix="/worlds", tags=["eulogy"])


@router.get("/{world_id}/eulogies")
async def read_eulogies(
    world_id: str,
    limit: int = Query(20, ge=1, le=64),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """The most recent eulogies (newest first), capped at `limit`."""
    w = await session.get(World, world_id)
    if not w:
        raise HTTPException(status_code=404, detail="world not found")
    return {"ok": True, "eulogies": eulogy_svc.recent_eulogies(world_id, limit=limit)}
