"""Vision route — exposes the vision service over HTTP.

Cluster C2 (gap-fix #9, #10, #11, #14).

Endpoints
---------
- GET  /v1/vision/status     -> per-layer availability
- POST /v1/vision/describe   -> capture → detect → describe pipeline
- POST /v1/vision/detect     -> capture → detect only (cheap, offline)

The Anthropic call is the only one that costs money; the detect-only path
runs fully offline once `ultralytics` is installed.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Body

from ..services import vision as vision_service

log = logging.getLogger("jarvis.routes.vision")

router = APIRouter(prefix="/v1/vision", tags=["vision"])


@router.get("/status")
def vision_status() -> dict[str, Any]:
    """Report which layers (capture / detect / describe) are activatable."""
    return vision_service.status()


@router.post("/detect")
def vision_detect(
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    """Grab one frame and run YOLO. No LLM call, no cost."""
    camera_id = payload.get("camera_id", vision_service.DEFAULT_CAMERA_ID)
    model = payload.get("model", vision_service.DEFAULT_YOLO_MODEL)
    cap = vision_service.capture_frame(camera_id)
    if not cap.get("ok"):
        return {"ok": False, "stage": "capture", "error": cap.get("error")}
    det = vision_service.detect_objects(cap["frame"], model=model)
    return {
        "ok": det.get("ok", False),
        "stage": "detect",
        "shape": cap.get("shape"),
        "model": det.get("model"),
        "detections": det.get("detections", []),
        "error": det.get("error"),
    }


@router.post("/describe")
def vision_describe(
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    """Capture → optional detect → Claude vision describe."""
    camera_id = payload.get("camera_id", vision_service.DEFAULT_CAMERA_ID)
    prompt = payload.get(
        "prompt", "Describe what you see in this image in one short paragraph."
    )
    return vision_service.capture_detect_describe(camera_id=camera_id, prompt=prompt)
