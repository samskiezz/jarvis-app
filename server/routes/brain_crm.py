"""BRAIN CRM routes — the tiered people-CRM HTTP surface over
``server/services/brain_crm.py``.

Mounted under ``/v1/brain`` (shared with the second-brain router), but on a
DISTINCT set of subpaths so the two never collide:

  * ``GET  /people``          — roster: ``[{person, tier, mention_count}]``.
  * ``GET  /people/{name}``   — assemble the tiered, source-cited profile.
  * ``POST /mention``         — record an observation about a person (bearer).

Reads use ``optional_bearer``; the write uses ``require_bearer``. The service
never raises — routes surface 404 only on a clean miss.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import brain_crm as crm

router = APIRouter(prefix="/v1/brain", tags=["brain-crm"])


class MentionBody(BaseModel):
    person: str = Field(..., description="Person's name.")
    context: str = Field(default="", description="What you observed/learned about them.")
    source: Optional[str] = Field(default=None, description="Where it came from (cited).")


@router.get("/people")
async def get_people(_token: str | None = Depends(optional_bearer)):
    """The CRM roster: everyone known, with their current tier + mention count."""
    items = crm.people()
    return {"items": items, "count": len(items)}


@router.post("/mention")
async def post_mention(body: MentionBody, _token: str = Depends(require_bearer)):
    """Record an observation about a person and bump their mention count."""
    res = crm.mention(body.person, body.context, body.source)
    if not res or not res.get("ok"):
        raise HTTPException(status_code=400, detail=(res or {}).get("error", "mention failed"))
    return res


@router.get("/people/{name}")
async def get_person(name: str, _token: str | None = Depends(optional_bearer)):
    """Assemble the tiered, source-cited profile for ``name`` (and mirror it into
    the vault as a kind=entity note)."""
    prof = crm.profile(name)
    if not prof or not prof.get("ok"):
        raise HTTPException(status_code=404, detail="person not found")
    return prof
