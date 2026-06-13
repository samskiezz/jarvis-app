"""FORGE routes — read-only APEX surface for the Forge code-improvement agent.

Exposes Forge's status + approval queue so it's visible in the app. Read-only by
design: the web tier never triggers model-driven code rewrites (that stays with
the Forge job). All handlers degrade gracefully (the service never raises).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..auth import optional_bearer, require_bearer
from ..services import forge_bridge

router = APIRouter(prefix="/v1/forge", tags=["forge"])


@router.get("/status")
async def forge_status(_token: str | None = Depends(optional_bearer)):
    return forge_bridge.status()


@router.get("/approvals")
async def forge_approvals(status: str | None = None, _token: str | None = Depends(optional_bearer)):
    return {"items": forge_bridge.approvals(status=status), "available": forge_bridge.available()}


@router.get("/approvals/{change_id}")
async def forge_change(change_id: str, _token: str | None = Depends(optional_bearer)):
    change = forge_bridge.get_change(change_id)
    if change is None:
        raise HTTPException(status_code=404, detail="change not found")
    return change


@router.post("/approvals/{change_id}/approve")
async def forge_approve(change_id: str, _token: str = Depends(require_bearer)):
    change = forge_bridge.set_status(change_id, "approved")
    if change is None:
        raise HTTPException(status_code=404, detail="change not found or forge unavailable")
    return {"ok": True, "change": change}


@router.post("/approvals/{change_id}/reject")
async def forge_reject(change_id: str, _token: str = Depends(require_bearer)):
    change = forge_bridge.set_status(change_id, "rejected")
    if change is None:
        raise HTTPException(status_code=404, detail="change not found or forge unavailable")
    return {"ok": True, "change": change}
