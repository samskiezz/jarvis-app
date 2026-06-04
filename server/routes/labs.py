"""LABS routes — surface the woken-up dormant underworld lab modules.

Both endpoints are public reads (optional_bearer). They expose curated, real
scientific lab capabilities (drug discovery, epidemiology, exotic quantum,
manufacturing, patent classification, materials/standards) that previously had
no route. The underlying :mod:`server.services.labs_bridge` degrades gracefully,
so these routes always return a JSON body even when the underworld modules are
not importable in this process.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import labs_bridge

router = APIRouter()


class LabRunRequest(BaseModel):
    capability: str
    params: dict | None = None


@router.get("/v1/labs/catalog")
async def labs_catalog(_token: str | None = Depends(optional_bearer)):
    """List every lab capability + whether its backing module imported."""
    return {"capabilities": labs_bridge.catalog()}


@router.post("/v1/labs/run")
async def labs_run(req: LabRunRequest, _token: str | None = Depends(optional_bearer)):
    """Run a lab ``capability`` with optional ``params``."""
    return labs_bridge.run(req.capability, req.params)
