"""Music generation route (gap #50 — Awakening ambient music banks).

Endpoints:
    POST /v1/music/generate  {"prompt": "warm ambient drone, low strings", "duration_s": 30, "tags": ["awakening"]}
    GET  /v1/music/status
    GET  /v1/music/bank      lists pre-baked loops under server/data/music_bank/

Backend selection in services/music_gen.py: Suno → Stable Audio → MusicGen local → bank fallback.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import music_gen

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/music", tags=["music"])


class MusicRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=1024)
    duration_s: float = Field(default=30.0, ge=1.0, le=360.0)
    tags: list[str] | None = Field(default=None, max_length=16)


@router.post("/generate")
def post_generate(req: MusicRequest) -> dict[str, Any]:
    try:
        return music_gen.generate(req.prompt, req.duration_s, req.tags)
    except Exception as exc:
        log.exception("music generate failed")
        return {"ok": False, "error": "unexpected_error", "detail": str(exc)}


@router.get("/status")
def get_status() -> dict[str, Any]:
    return music_gen.status()


@router.get("/bank")
def get_bank() -> dict[str, Any]:
    bank_dir = Path(music_gen.MUSIC_BANK_DIR)
    items = []
    for ext in ("mp3", "ogg", "wav"):
        for f in sorted(bank_dir.glob(f"*.{ext}")):
            items.append({
                "name": f.name,
                "url": f"/jarvis/data/music_bank/{f.name}",
                "size_bytes": f.stat().st_size,
            })
    return {"count": len(items), "items": items, "bank_dir": str(bank_dir)}
