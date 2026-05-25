from __future__ import annotations

from fastapi import APIRouter, Depends

from ..agents import guilds
from ..auth import require_bearer

router = APIRouter(prefix="/guilds", tags=["guilds"])


@router.get("")
async def list_guilds(_token: str = Depends(require_bearer)):
    return [
        {
            "kind": spec.kind.value,
            "name": spec.name,
            "domain": spec.domain,
            "checklist": list(spec.checklist),
            "starting_skills": list(spec.starting_skills),
        }
        for spec in guilds.GUILDS.values()
    ]
