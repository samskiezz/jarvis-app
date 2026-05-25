from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import Invention, PeerReview
from ..db.session import get_session
from .schemas import InventionOut, PeerReviewOut

router = APIRouter(prefix="/inventions", tags=["inventions"])


@router.get("/{invention_id}", response_model=InventionOut)
async def get_invention(
    invention_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    inv = await session.get(Invention, invention_id)
    if not inv:
        raise HTTPException(status_code=404, detail="invention not found")
    return InventionOut(
        id=inv.id,
        world_id=inv.world_id,
        minion_id=inv.minion_id,
        tick=inv.tick,
        title=inv.title,
        problem=inv.problem,
        hypothesis=inv.hypothesis or "",
        feasibility_score=inv.feasibility_score,
        novelty_score=inv.novelty_score,
        safety_score=inv.safety_score,
        status=inv.status,
        related_patents=inv.related_patents or [],
        created_at=inv.created_at,
    )


@router.get("/{invention_id}/reviews", response_model=list[PeerReviewOut])
async def list_reviews(
    invention_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    stmt = (
        select(PeerReview)
        .where(PeerReview.invention_id == invention_id)
        .order_by(PeerReview.created_at)
    )
    res = await session.execute(stmt)
    return [
        PeerReviewOut(
            id=r.id,
            invention_id=r.invention_id,
            reviewer_guild=r.reviewer_guild,
            verdict=r.verdict,
            rationale=r.rationale,
            created_at=r.created_at,
        )
        for r in res.scalars().all()
    ]
