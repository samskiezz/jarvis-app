"""MODE MIXER routes — behaviour-mode profiles for Jarvis.

Mounted under ``/v1/mode``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import mode_mixer as mm

router = APIRouter(prefix="/v1/mode", tags=["mode-mixer"])


class ProfileBody(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = "Custom"
    tone: str = "neutral"
    detail: str = "normal"
    speed: str = "normal"
    strictness: float = Field(0.5, ge=0, le=1)
    privacy: str = "normal"
    tool_use: str = "full"
    cost: str = "normal"
    safety: str = "high"
    autonomy: float = Field(0.2, ge=0, le=1)
    voice_style: str = "neutral"


class MixBody(BaseModel):
    base_id: str
    overrides: dict[str, Any] = Field(default_factory=dict)


@router.get("/active")
async def mode_active(_token: str | None = Depends(optional_bearer)):
    return mm.get_active()


@router.get("/profiles")
async def mode_profiles(_token: str | None = Depends(optional_bearer)):
    return {"presets": mm.get_presets(), "custom": mm.get_custom()}


@router.post("/apply/{profile_id}")
async def mode_apply(profile_id: str, _token: str = Depends(require_bearer)):
    return mm.apply(profile_id)


@router.post("/save")
async def mode_save(body: ProfileBody, _token: str = Depends(require_bearer)):
    return mm.save_profile(body.model_dump())


@router.post("/mix")
async def mode_mix(body: MixBody, _token: str = Depends(require_bearer)):
    return mm.mix(body.base_id, body.overrides)
