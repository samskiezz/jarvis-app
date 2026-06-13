"""THOUGHT COMPRESSOR routes — compress messy info into reusable memory packs.

Mounted under ``/v1/compress``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import thought_compressor as tc

router = APIRouter(prefix="/v1/compress", tags=["thought-compressor"])


class CompressBody(BaseModel):
    text: str = Field(..., min_length=1)
    source_type: str = "text"
    title: str | None = None


@router.get("/list")
async def compress_list(limit: int = 50, _token: str | None = Depends(optional_bearer)):
    return {"items": tc.list_packs(limit=limit)}


@router.post("/create")
async def compress_create(body: CompressBody, _token: str = Depends(require_bearer)):
    return tc.compress(body.text, source_type=body.source_type, title=body.title)


@router.get("/{pack_id}")
async def compress_get(pack_id: str, _token: str | None = Depends(optional_bearer)):
    pack = tc.get_pack(pack_id)
    if pack is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="pack not found")
    return {"pack": pack}


@router.post("/{pack_id}/refresh")
async def compress_refresh(pack_id: str, _token: str = Depends(require_bearer)):
    return tc.refresh(pack_id)
