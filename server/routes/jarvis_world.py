"""JARVIS WORLD route — the loaded Stage-7 world ontology pack."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from ..auth import optional_bearer, require_bearer
from ..services import jarvis_world_pack as wp

router = APIRouter(prefix="/v1/jarvis/world", tags=["jarvis-world"])

@router.get("/summary")
async def summary(_t: str | None = Depends(optional_bearer)):
    return wp.summary()

@router.post("/load")
async def load(endpoint_limit: int | None = None, _t: str = Depends(require_bearer)):
    return wp.load(endpoint_limit=endpoint_limit)

@router.get("/subjects")
async def subjects(master_topic: str | None = None, limit: int = 100, _t: str | None = Depends(optional_bearer)):
    return {"subjects": wp.subjects(master_topic, limit)}

@router.get("/endpoints")
async def endpoints(subject_id: str | None = None, limit: int = 100, _t: str | None = Depends(optional_bearer)):
    return {"endpoints": wp.endpoints(subject_id, limit)}

@router.get("/research-targets")
async def targets(limit: int = 50, _t: str | None = Depends(optional_bearer)):
    return {"targets": wp.research_targets(limit)}
