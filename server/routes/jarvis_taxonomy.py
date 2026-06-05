"""JARVIS TAXONOMY routes — the world taxonomy in the operational ontology."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_taxonomy as tax

router = APIRouter(prefix="/v1/jarvis/taxonomy", tags=["jarvis-taxonomy"])


@router.get("/summary")
async def get_summary(_t: str | None = Depends(optional_bearer)):
    return tax.summary()


@router.post("/load")
async def post_load(_t: str = Depends(require_bearer)):
    """Seed the 300 cells + 20 families and register the 12 object types."""
    return tax.load()


@router.get("/cells")
async def get_cells(topic: str | None = None, limit: int = 500,
                    _t: str | None = Depends(optional_bearer)):
    return {"cells": tax.cells(topic, limit)}


@router.get("/families")
async def get_families(_t: str | None = Depends(optional_bearer)):
    return {"families": tax.ACQUISITION_FAMILIES, "count": len(tax.ACQUISITION_FAMILIES)}


@router.get("/frontier")
async def get_frontier(limit: int = 30, with_niche: bool = False,
                       _t: str | None = Depends(optional_bearer)):
    return {"frontier": tax.frontier(limit, with_niche=with_niche)}
