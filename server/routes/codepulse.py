"""CODE PULSE routes — VS Code bridge + approval queue.

Mounted under ``/v1/codepulse``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import codepulse as cp

router = APIRouter(prefix="/v1/codepulse", tags=["code-pulse"])


class ConnectBody(BaseModel):
    workspace: str = Field(..., min_length=1)


class CommandBody(BaseModel):
    type: str = Field(..., min_length=1)
    payload: dict | None = None


class ReasonBody(BaseModel):
    reason: str = ""


class ExplainBody(BaseModel):
    question: str = ""


@router.get("/status")
async def codepulse_status(_token: str | None = Depends(optional_bearer)):
    return cp.status()


@router.post("/connect")
async def codepulse_connect(body: ConnectBody, _token: str = Depends(require_bearer)):
    return cp.connect(body.workspace)


@router.post("/disconnect")
async def codepulse_disconnect(_token: str = Depends(require_bearer)):
    return cp.disconnect()


@router.post("/command")
async def codepulse_command(body: CommandBody, _token: str = Depends(require_bearer)):
    return cp.command(body.type, body.payload or {})


@router.get("/pending")
async def codepulse_pending(status: str | None = None, _token: str | None = Depends(optional_bearer)):
    return {"items": cp.list_pending(status=status)}


@router.get("/pending/{item_id}")
async def codepulse_pending_get(item_id: str, _token: str | None = Depends(optional_bearer)):
    item = cp.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="item not found")
    return {"item": item}


@router.post("/pending/{item_id}/approve")
async def codepulse_approve(item_id: str, _token: str = Depends(require_bearer)):
    result = cp.approve(item_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "not found"))
    return result


@router.post("/pending/{item_id}/reject")
async def codepulse_reject(item_id: str, body: ReasonBody, _token: str = Depends(require_bearer)):
    result = cp.reject(item_id, body.reason)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "not found"))
    return result


@router.post("/pending/{item_id}/explain")
async def codepulse_explain(item_id: str, _body: ExplainBody, _token: str = Depends(require_bearer)):
    result = cp.explain(item_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "not found"))
    return result


@router.post("/stop")
async def codepulse_stop(_token: str = Depends(require_bearer)):
    return cp.stop()
