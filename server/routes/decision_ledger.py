"""DECISION LEDGER routes — record and review important decisions.

Mounted under ``/v1/decision``.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import decision_ledger as dl

router = APIRouter(prefix="/v1/decision", tags=["decision-ledger"])


class CreateBody(BaseModel):
    title: str = Field(..., min_length=1)
    reason: str = ""
    evidence: list[str] = Field(default_factory=list)
    alternatives: list[str] = Field(default_factory=list)
    rejected: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    expected_outcome: str = ""
    review_at: Optional[int] = None


class ReviewBody(BaseModel):
    actual_outcome: str = ""
    score: Optional[float] = Field(default=None, ge=0, le=1)


@router.get("/list")
async def decision_list(limit: int = 50, _token: str | None = Depends(optional_bearer)):
    return {"items": dl.list_decisions(limit=limit)}


@router.post("/")
async def decision_create_root(body: CreateBody, _token: str = Depends(require_bearer)):
    """Plan-compatible alias for POST /v1/decision."""
    return await decision_create(body, _token)


@router.post("/create")
async def decision_create(body: CreateBody, _token: str = Depends(require_bearer)):
    return dl.create_decision(
        title=body.title,
        reason=body.reason,
        evidence=body.evidence,
        alternatives=body.alternatives,
        rejected=body.rejected,
        risks=body.risks,
        expected_outcome=body.expected_outcome,
        review_at=body.review_at,
    )


@router.post("/{decision_id}/finalize")
async def decision_finalize(decision_id: str, _token: str = Depends(require_bearer)):
    return dl.finalize(decision_id)


@router.post("/{decision_id}/review")
async def decision_review(decision_id: str, body: ReviewBody, _token: str = Depends(require_bearer)):
    return dl.review(decision_id, body.actual_outcome, body.score)
