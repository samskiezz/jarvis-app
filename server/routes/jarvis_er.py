"""JARVIS ER routes — entity resolution / master data HTTP surface.

Mounted under ``/v1/jarvis/er``:

  * POST /find-duplicates    — block + score candidate duplicates of an object type.
  * GET  /queue              — human adjudication queue (pending matches).
  * POST /resolve            — merge (survivorship) or reject a candidate pair.
  * POST /unmerge            — reverse a merge.
  * GET  /golden/{id}        — resolved golden record (canonical + merged ids).
  * GET  /stats              — pending/merged counts.

Mutating endpoints require a bearer token; reads use optional bearer. Never raise.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_er as er

router = APIRouter(prefix="/v1/jarvis/er", tags=["jarvis-er"])


class FindBody(BaseModel):
    object_type: str
    threshold: float = Field(default=0.6, ge=0.0, le=1.0)


class ResolveBody(BaseModel):
    a_id: str
    b_id: str
    merge: bool = True
    role: str = "operator"
    actor: str = "api"


class UnmergeBody(BaseModel):
    canonical_id: str
    merged_id: str
    role: str = "operator"
    actor: str = "api"


@router.post("/find-duplicates")
async def post_find(body: FindBody, _t: str = Depends(require_bearer)):
    return er.find_duplicates(body.object_type, threshold=body.threshold)


@router.get("/queue")
async def get_queue(status: str = "pending", limit: int = 100, _t: str | None = Depends(optional_bearer)):
    return {"queue": er.queue(status, limit)}


@router.post("/resolve")
async def post_resolve(body: ResolveBody, _t: str = Depends(require_bearer)):
    return er.resolve(body.a_id, body.b_id, merge=body.merge, role=body.role, actor=body.actor)


@router.post("/unmerge")
async def post_unmerge(body: UnmergeBody, _t: str = Depends(require_bearer)):
    return er.unmerge(body.canonical_id, body.merged_id, role=body.role, actor=body.actor)


@router.get("/golden/{object_id}")
async def get_golden(object_id: str, _t: str | None = Depends(optional_bearer)):
    return er.golden(object_id)


@router.get("/stats")
async def get_stats(_t: str | None = Depends(optional_bearer)):
    return er.stats()
