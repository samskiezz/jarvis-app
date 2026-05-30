"""Physics engine routes — laws, constants, limits, and a live solver.

These back the Knowledge/physics panel: the frontend can list the computable
laws, read the world's hard limits, and POST real inputs to /physics/solve to
get a genuinely computed answer (same engine the minions learn on).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import require_bearer
from ..physics import constants as physics_constants
from ..physics import engine as physics_engine

router = APIRouter(prefix="/physics", tags=["physics"])


class SolveRequest(BaseModel):
    law_id: str
    inputs: dict[str, float]


@router.get("/laws")
async def list_laws(
    discipline: str | None = Query(default=None),
    _token: str = Depends(require_bearer),
):
    laws = physics_engine.list_laws(discipline)
    return {"count": len(laws), "laws": [law.to_dict() for law in laws]}


@router.get("/constants")
async def constants(_token: str = Depends(require_bearer)):
    return {"constants": physics_constants.as_dicts()}


@router.get("/limits")
async def limits(_token: str = Depends(require_bearer)):
    return physics_engine.world_limits()


@router.get("/laws/{law_id}")
async def get_law(law_id: str, _token: str = Depends(require_bearer)):
    law = physics_engine.get_law(law_id)
    if law is None:
        raise HTTPException(status_code=404, detail=f"unknown law {law_id!r}")
    return law.to_dict()


@router.post("/solve")
async def solve(req: SolveRequest, _token: str = Depends(require_bearer)):
    try:
        return physics_engine.compute(req.law_id, req.inputs)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown law {req.law_id!r}")
    except (ValueError, ZeroDivisionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/assess")
async def assess(payload: dict, _token: str = Depends(require_bearer)):
    """Assess free-text invention against physical limits (used by tooling)."""
    text = str(payload.get("text") or "")
    a = physics_engine.assess_invention(text)
    return {"feasibility": a.feasibility, "violates_limit": a.violates_limit, "notes": a.notes}
