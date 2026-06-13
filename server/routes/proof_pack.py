"""PROOF PACK routes — evidence packs for changes, specs, and decisions.

Mounted under ``/v1/proofpack``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import proof_pack as pp

router = APIRouter(prefix="/v1/proofpack", tags=["proof-pack"])


class CreateBody(BaseModel):
    title: str = Field(..., min_length=1)
    spec_id: str = ""
    decision_ids: list[str] | None = None
    include_diff: bool = True
    screenshot_url: str = ""


class ExportBody(BaseModel):
    format: str = "markdown"  # reserved for future json/pdf


@router.get("/list")
async def proof_pack_list(limit: int = 50, _token: str | None = Depends(optional_bearer)):
    return {"items": pp.list_packs(limit=limit)}


@router.get("/{pack_id}")
async def proof_pack_get(pack_id: str, _token: str | None = Depends(optional_bearer)):
    note = pp.get_pack(pack_id)
    if note is None:
        raise HTTPException(status_code=404, detail="proof pack not found")
    return {"pack": note}


@router.post("/create")
async def proof_pack_create(body: CreateBody, _token: str = Depends(require_bearer)):
    return pp.create_pack(
        title=body.title,
        spec_id=body.spec_id,
        decision_ids=body.decision_ids or [],
        include_diff=body.include_diff,
        screenshot_url=body.screenshot_url,
    )


@router.post("/{pack_id}/export")
async def proof_pack_export(pack_id: str, _body: ExportBody, _token: str = Depends(require_bearer)):
    result = pp.export_pack(pack_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "not found"))
    return result
