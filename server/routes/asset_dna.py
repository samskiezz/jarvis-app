"""ASSET DNA routes — identity cards for repo assets.

Mounted under ``/v1/asset``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..auth import optional_bearer, require_bearer
from ..services import asset_dna as ad

router = APIRouter(prefix="/v1/asset", tags=["asset-dna"])

# These scans walk thousands of files — run them in a threadpool so they NEVER block the async event
# loop (a blocking scan here previously wedged the whole backend / DoS'd every other endpoint).


@router.get("/list")
async def asset_list(limit: int = 200, _token: str | None = Depends(optional_bearer)):
    return {"items": await run_in_threadpool(ad.scan_assets, limit=limit)}


@router.get("/{asset_id:path}")
async def asset_get(asset_id: str, _token: str | None = Depends(optional_bearer)):
    asset = await run_in_threadpool(ad.get_asset, asset_id)  # ids are 'file:<path>' (contain slashes)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    recs = await run_in_threadpool(ad.recommend, asset)
    return {"asset": asset, "recommendations": recs}


@router.post("/scan")
async def asset_scan(_token: str = Depends(require_bearer)):
    return {"items": await run_in_threadpool(ad.scan_assets, limit=200)}


@router.post("/register")
async def asset_register(_token: str = Depends(require_bearer)):
    """Plan-compatible alias for POST /v1/asset/register."""
    return {"items": await run_in_threadpool(ad.scan_assets, limit=200)}
