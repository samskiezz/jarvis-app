"""INTENT INBOX routes — capture and convert raw ideas.

Mounted under ``/v1/intent``.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import intent_inbox as ii

router = APIRouter(prefix="/v1/intent", tags=["intent-inbox"])


class CaptureBody(BaseModel):
    text: str = Field(..., min_length=1)
    source: str = "ui"


class StateBody(BaseModel):
    state: str = "ready"


class ConvertBody(BaseModel):
    target: str = Field(..., pattern="^(spec|reminder|task|decision)$")


@router.get("/list")
async def intent_list(state: Optional[str] = None, limit: int = 50, _token: str | None = Depends(optional_bearer)):
    return {"items": ii.list_intents(state=state, limit=limit)}


@router.post("/capture")
async def intent_capture(body: CaptureBody, _token: str = Depends(require_bearer)):
    return ii.capture(body.text, source=body.source)


@router.post("/{intent_id}/state")
async def intent_set_state(intent_id: str, body: StateBody, _token: str = Depends(require_bearer)):
    return ii.set_state(intent_id, body.state)


@router.post("/{intent_id}/convert")
async def intent_convert(intent_id: str, body: ConvertBody, _token: str = Depends(require_bearer)):
    return ii.convert(intent_id, body.target)
