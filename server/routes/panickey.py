"""PANICKEY routes — emergency control, snapshots, and active-work visibility.

These endpoints complement the dashboard's existing /panickey/* paths by exposing
new control surfaces under /v1/panickey for the live mini-app sheet.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import panickey as PK

router = APIRouter(prefix="/v1/panickey", tags=["panickey"])


class SnapshotBody(BaseModel):
    label: str | None = None


class ActionBody(BaseModel):
    action: str
    payload: dict | None = None


@router.get("/active")
async def panickey_active(_token: str | None = Depends(optional_bearer)):
    return PK.active_snapshot()


@router.get("/snapshots")
async def panickey_snapshots(_token: str | None = Depends(optional_bearer)):
    return {"items": PK.list_snapshots()}


@router.post("/snapshot")
async def panickey_snapshot(body: SnapshotBody, _token: str = Depends(require_bearer)):
    return PK.snapshot(body.label)


@router.post("/snapshot/{snap_id}/restore")
async def panickey_restore(snap_id: str, _token: str = Depends(require_bearer)):
    return PK.restore_snapshot(snap_id)


@router.post("/safemode")
async def panickey_safemode(_token: str = Depends(require_bearer)):
    return PK.safe_mode()


@router.post("/action")
async def panickey_action(body: ActionBody, _token: str = Depends(require_bearer)):
    return PK.run_action(body.action, body.payload or {})
