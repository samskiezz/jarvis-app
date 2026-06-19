"""Gotham mini-app — case/event surface (P-O implementation reading
world_os/gotham_runtime/ schemas)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import gotham_service as gs

router = APIRouter(prefix="/v1/gotham", tags=["gotham"])


@router.get("/cases")
def list_cases(limit: int = 100, _t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    items = gs.list_cases(limit=max(1, min(limit, 500)))
    return {"ok": True, "items": items, "count": len(items)}


@router.get("/events")
def list_events(limit: int = 200, _t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    items = gs.list_events(limit=max(1, min(limit, 500)))
    return {"ok": True, "items": items, "count": len(items)}


class _CaseBody(BaseModel):
    title: str
    created_by: str = "system"
    priority: str = "normal"
    linked_objects: list = Field(default_factory=list)
    evidence: list = Field(default_factory=list)


@router.post("/case")
def create_case(body: _CaseBody, _t: str = Depends(require_bearer)) -> dict[str, Any]:
    if not body.title:
        raise HTTPException(status_code=400, detail="title required")
    return gs.create_case(
        title=body.title, created_by=body.created_by,
        priority=body.priority, linked_objects=body.linked_objects,
        evidence=body.evidence,
    )
