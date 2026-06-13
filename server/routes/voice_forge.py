"""VOICE FORGE routes — profile-scoped voice cloning studio.

Mounted under ``/v1/voiceforge``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import voice_forge as vf

router = APIRouter(prefix="/v1/voiceforge", tags=["voice-forge"])


class ProfileBody(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""


class ProfileUpdateBody(BaseModel):
    profile_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    description: str = ""


class TestBody(BaseModel):
    text: str = "VoiceForge profile test."


@router.get("/profiles")
async def voice_forge_profiles(_token: str | None = Depends(optional_bearer)):
    return vf.list_profiles()


@router.get("/profiles/{profile_id}")
async def voice_forge_profile_get(profile_id: str, _token: str | None = Depends(optional_bearer)):
    p = vf.get_profile(profile_id)
    if p is None:
        raise HTTPException(status_code=404, detail="profile not found")
    return {"profile": p}


@router.post("/profile")
async def voice_forge_profile_create(body: ProfileBody, _token: str = Depends(require_bearer)):
    return vf.create_profile(body.name, body.description)


@router.post("/profiles/{profile_id}")
async def voice_forge_profile_update(profile_id: str, body: ProfileBody, _token: str = Depends(require_bearer)):
    return vf.save_profile(profile_id, body.name, body.description)


@router.post("/profiles/{profile_id}/upload")
async def voice_forge_upload(profile_id: str, file: UploadFile = File(...), _token: str = Depends(require_bearer)):
    content = await file.read()
    return vf.upload_sample(profile_id, file.filename or "sample.wav", content)


@router.post("/profiles/{profile_id}/build")
async def voice_forge_build(profile_id: str, _token: str = Depends(require_bearer)):
    return vf.build_profile(profile_id)


@router.post("/test")
async def voice_forge_test(body: TestBody, _token: str = Depends(require_bearer)):
    return vf.test_voice(body.text)


@router.post("/activate/{profile_id}")
async def voice_forge_activate(profile_id: str, _token: str = Depends(require_bearer)):
    result = vf.activate_profile(profile_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "activation failed"))
    return result


@router.delete("/profiles/{profile_id}")
async def voice_forge_delete(profile_id: str, _token: str = Depends(require_bearer)):
    result = vf.delete_profile(profile_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "not found"))
    return result
