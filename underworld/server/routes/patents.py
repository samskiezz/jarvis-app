from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import Patent
from ..db.session import get_session
from ..tools import patent_search
from .schemas import PatentOut, PatentSearchRequest

router = APIRouter(prefix="/patents", tags=["patents"])


@router.post("/search", response_model=list[PatentOut])
async def search(
    body: PatentSearchRequest,
    _token: str = Depends(require_bearer),
):
    records = await patent_search.search(body.query, limit=body.limit, only_expired=body.only_expired)
    return [
        PatentOut(
            id=r.id,
            title=r.title,
            abstract=r.abstract,
            cpc_class=r.cpc_class,
            grant_date=r.grant_date,
            expired=r.expired,
            source=r.source,
        )
        for r in records
    ]


@router.get("/{patent_id}", response_model=PatentOut)
async def get_patent(
    patent_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    p = await session.get(Patent, patent_id)
    if not p:
        raise HTTPException(status_code=404, detail="patent not seen by any minion yet")
    return PatentOut(
        id=p.id,
        title=p.title,
        abstract=p.abstract,
        cpc_class=p.cpc_class,
        grant_date=p.grant_date,
        expired=p.expired,
        source=p.source,
    )
