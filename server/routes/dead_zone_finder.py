"""DEAD ZONE FINDER routes — cleanup intelligence for repo and inventory.

Mounted under ``/v1/deadzone``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..auth import optional_bearer
from ..services import dead_zone_finder as dz

router = APIRouter(prefix="/v1/deadzone", tags=["dead-zone-finder"])


@router.get("/scan")
async def deadzone_scan(limit: int = 100, _token: str | None = Depends(optional_bearer)):
    return {"items": dz.scan(limit=limit)}


@router.get("/{finding_id}")
async def deadzone_get(finding_id: str, _token: str | None = Depends(optional_bearer)):
    finding = dz.get_finding(finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="finding not found")
    return {"finding": finding}
