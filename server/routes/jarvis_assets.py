"""JARVIS ASSETS routes — the render-asset pipeline + Tripo3D generation.

  * GET  /v1/jarvis/assets/status            — library / wired / gaps / tripo-ready
  * GET  /v1/jarvis/assets/library?q=        — available Tripo GLBs (search)
  * POST /v1/jarvis/assets/wire   {name}     — copy a library model into public/models
  * GET  /v1/jarvis/assets/gaps              — manifest surfaces needing a new render
  * POST /v1/jarvis/assets/generate {prompt,name} — NEW custom GLB via Tripo3D (key-gated)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_assets as assets

router = APIRouter(prefix="/v1/jarvis/assets", tags=["jarvis-assets"])


@router.get("/status")
async def status(_t: str | None = Depends(optional_bearer)):
    return assets.status()


@router.get("/library")
async def library(q: str = Query(""), _t: str | None = Depends(optional_bearer)):
    return {"models": assets.search_library(q) if q else assets.library()[:200],
            "total": len(assets.library())}


class WireRequest(BaseModel):
    name: str


@router.post("/wire")
async def wire(req: WireRequest, _t: str = Depends(require_bearer)):
    return assets.wire(req.name)


@router.get("/gaps")
async def gaps(_t: str | None = Depends(optional_bearer)):
    return {"gaps": assets.gaps()}


class GenerateRequest(BaseModel):
    prompt: str
    name: str
    style: Optional[str] = ""


@router.post("/generate")
async def generate(req: GenerateRequest, _t: str = Depends(require_bearer)):
    from ..services import tripo_client as tc
    return tc.generate(req.prompt, req.name, style=req.style or "")
