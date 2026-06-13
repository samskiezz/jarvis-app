"""SPEC FORGE routes — build-ready spec generator.

Mounted under ``/v1/spec``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import spec_forge as sf

router = APIRouter(prefix="/v1/spec", tags=["spec-forge"])


class CreateBody(BaseModel):
    idea: str = Field(..., min_length=1)
    context: str = ""


@router.get("/list")
async def spec_list(limit: int = 50, _token: str | None = Depends(optional_bearer)):
    return {"items": sf.list_specs(limit=limit)}


@router.post("/create")
async def spec_create(body: CreateBody, _token: str = Depends(require_bearer)):
    return sf.create_spec(body.idea, context=body.context)


@router.get("/{spec_id}")
async def spec_get(spec_id: str, _token: str | None = Depends(optional_bearer)):
    spec = sf.get_spec(spec_id)
    if spec is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="spec not found")
    return {"spec": spec}


@router.post("/{spec_id}/approve")
async def spec_approve(spec_id: str, _token: str = Depends(require_bearer)):
    return sf.approve(spec_id)
