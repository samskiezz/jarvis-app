from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import SafetyReview
from ..db.session import get_session
from ..tools import safety as safety_tool

router = APIRouter(prefix="/safety", tags=["safety"])


class SafetyCheckRequest(BaseModel):
    text: str | None = None
    cpc: str | None = None


@router.post("/check")
async def check(body: SafetyCheckRequest, _token: str = Depends(require_bearer)):
    out = {"blocked": False, "rules": []}
    if body.text:
        r = safety_tool.check_text(body.text)
        if r.blocked:
            out["blocked"] = True
            out["rules"].append({"rule": r.rule, "detail": r.detail})
    if body.cpc:
        r = safety_tool.check_cpc(body.cpc)
        if r.blocked:
            out["blocked"] = True
            out["rules"].append({"rule": r.rule, "detail": r.detail})
    return out


@router.get("/reviews")
async def list_reviews(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    stmt = (
        select(SafetyReview)
        .order_by(SafetyReview.created_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    res = await session.execute(stmt)
    return [
        {
            "id": r.id,
            "subject_id": r.subject_id,
            "subject_kind": r.subject_kind,
            "rule": r.rule,
            "detail": r.detail,
            "blocked": r.blocked,
            "created_at": r.created_at.isoformat(),
        }
        for r in res.scalars().all()
    ]
