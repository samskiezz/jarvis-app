"""ASSET DNA routes — identity cards for repo assets.

Mounted under ``/v1/asset``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..auth import optional_bearer, require_bearer
from ..services import asset_dna as ad

router = APIRouter(prefix="/v1/asset", tags=["asset-dna"])


@router.get("/list")
async def asset_list(limit: int = 200, _token: str | None = Depends(optional_bearer)):
    return {"items": ad.scan_assets(limit=limit)}


@router.get("/{asset_id}")
async def asset_get(asset_id: str, _token: str | None = Depends(optional_bearer)):
    asset = ad.get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return {"asset": asset, "recommendations": ad.recommend(asset)}


@router.post("/scan")
async def asset_scan(_token: str = Depends(require_bearer)):
    return {"items": ad.scan_assets(limit=200)}


@router.post("/register")
async def asset_register(_token: str = Depends(require_bearer)):
    """Plan-compatible alias for POST /v1/asset/register."""
    return {"items": ad.scan_assets(limit=200)}
