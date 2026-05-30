from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import (
    Event,
    GuildKind,
    Invention,
    Minion,
    PeerReview,
    ReviewVerdict,
    SafetyReview,
    TaskStatus,
    World,
)
from ..db.session import get_session
from ..tools import safety
from .schemas import InventionOut, PeerReviewOut

router = APIRouter(prefix="/inventions", tags=["inventions"])


class CharterInvention(BaseModel):
    """Human-chartered invention. Doc Section IV.169 ('Patent Pilot AI').

    Lets a user (or external agent) seed an idea into a world without going
    through the per-minion decision loop. The invention still passes through
    every safety + peer-review gate, so this is not an escape hatch.
    """

    world_id: str
    minion_id: str | None = None
    title: str = Field(..., min_length=1, max_length=280)
    problem: str = Field(..., min_length=1)
    hypothesis: str = ""
    related_patents: list[str] = Field(default_factory=list)


@router.post("/charter", response_model=InventionOut, status_code=201)
async def charter_invention(
    body: CharterInvention,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await session.get(World, body.world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world not found")
    minion_id = body.minion_id
    if minion_id is not None:
        m = await session.get(Minion, minion_id)
        if not m:
            raise HTTPException(status_code=404, detail="minion not found")
        if m.world_id != world.id:
            raise HTTPException(status_code=400, detail="minion belongs to a different world")

    combined = " ".join([body.title, body.problem, body.hypothesis])
    safety_result = safety.check_text(combined)
    status = TaskStatus.NEEDS_SAFETY_REVIEW if safety_result.blocked else TaskStatus.NEEDS_PEER_REVIEW

    inv = Invention(
        world_id=world.id,
        minion_id=minion_id,
        tick=world.tick,
        title=body.title[:280],
        problem=body.problem,
        hypothesis=body.hypothesis,
        related_patents=body.related_patents,
        status=status,
        inputs={"chartered": True},
    )
    session.add(inv)
    await session.flush()

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


class ManualDecision(BaseModel):
    """Human override of the auto-review pipeline.

    Lets the operator approve, reject, or safety-block an invention from
    the UI without waiting for the next tick's review pass. The decision
    is recorded as a PeerReview row attributed to the closing guild
    (patent for approve/reject, safety for block), so the audit trail
    matches the auto-pipeline shape.
    """

    verdict: Literal["approve", "reject", "block_safety"]
    rationale: str = Field(default="", max_length=1000)


@router.post("/{invention_id}/decide", response_model=InventionOut)
async def decide_invention(
    invention_id: str,
    body: ManualDecision,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    inv = await session.get(Invention, invention_id)
    if not inv:
        raise HTTPException(status_code=404, detail="invention not found")

    if body.verdict == "approve":
        inv.status = TaskStatus.APPROVED
        reviewer_guild = GuildKind.PATENT
        verdict = ReviewVerdict.APPROVE
    elif body.verdict == "reject":
        inv.status = TaskStatus.REJECTED
        reviewer_guild = GuildKind.PATENT
        verdict = ReviewVerdict.REJECT
    else:
        inv.status = TaskStatus.REJECTED
        reviewer_guild = GuildKind.SAFETY
        verdict = ReviewVerdict.BLOCK_SAFETY

    rationale = body.rationale or f"Operator override: {body.verdict}"
    session.add(
        PeerReview(
            invention_id=inv.id,
            reviewer_guild=reviewer_guild,
            verdict=verdict,
            rationale=rationale,
        )
    )
    # Mirror the auto-pipeline: a safety block writes BOTH a PeerReview
    # (with BLOCK_SAFETY) and a SafetyReview row so /safety/reviews
    # surfaces the override alongside automatic blocks.
    if body.verdict == "block_safety":
        session.add(
            SafetyReview(
                subject_id=inv.id,
                subject_kind="invention",
                rule="operator_block_safety",
                detail=rationale[:1000],
                blocked=True,
            )
        )
    session.add(
        Event(
            world_id=inv.world_id,
            tick=inv.tick,
            kind=f"invention:operator_{body.verdict}",
            actor_id=inv.minion_id,
            payload={"invention_id": inv.id, "rationale": rationale[:200]},
        )
    )
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
