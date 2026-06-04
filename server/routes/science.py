"""Science Console routes — surface the underworld science registry to the UI.

Both endpoints are public reads (optional_bearer): they expose computation over
benchmark-verified scientific methods and never touch user data. The underlying
bridge degrades gracefully, so these routes always return a JSON body even when
the underworld engine is not importable in this process.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import science_bridge

router = APIRouter()


class RunRequest(BaseModel):
    field: str
    params: dict | None = None


@router.get("/functions/science/methods")
async def science_methods(_token: str | None = Depends(optional_bearer)):
    """List every science method grouped-ready as {key, domain, doc}."""
    return science_bridge.list_methods()


@router.post("/functions/science/run")
async def science_run(req: RunRequest, _token: str | None = Depends(optional_bearer)):
    """Run a science method matched by `field`, with optional `params`."""
    return science_bridge.run_method(req.field, req.params)
