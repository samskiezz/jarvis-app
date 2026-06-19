"""Foundry mini-app — pipeline/lineage surface."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..auth import optional_bearer
from ..services import foundry_service as fs

router = APIRouter(prefix="/v1/foundry", tags=["foundry"])


@router.get("/pipelines")
def list_pipelines(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    items = fs.list_pipelines()
    return {"ok": True, "items": items, "count": len(items)}


@router.get("/lineage/{run_id}")
def get_lineage(run_id: str, _t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return fs.get_lineage(run_id)
