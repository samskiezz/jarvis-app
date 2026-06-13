"""FRICTION MAP routes — detect repeated workflow friction.

Mounted under ``/v1/friction``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import friction_map as fm

router = APIRouter(prefix="/v1/friction", tags=["friction-map"])


class LogBody(BaseModel):
    action: str
    detail: dict | None = None


@router.get("/scan")
async def friction_scan(hours: int = 24, _token: str | None = Depends(optional_bearer)):
    return fm.scan(hours=hours)


@router.post("/scan")
async def friction_scan_post(hours: int = 24, _token: str = Depends(require_bearer)):
    """Plan-compatible alias for POST /v1/friction/scan."""
    return fm.scan(hours=hours)


@router.post("/log")
async def friction_log(body: LogBody, _token: str = Depends(require_bearer)):
    return fm.log_action(body.action, body.detail or {})
