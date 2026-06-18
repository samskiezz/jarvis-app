"""Sensor + ambient-audio routes (Gap C3 #12 + #13).

Mounted under ``/v1/sensors``. Three capabilities:

* ``POST /v1/sensors/imu`` — ingest one or a batch of accelerometer/gyroscope
  samples from the mobile UI (DeviceMotionEvent + Generic Sensor API).
* ``GET  /v1/sensors/recent`` — summary of recent IMU activity for the
  assistant to query ("have I been still for the last hour?").
* ``GET  /v1/sensors/status`` — health tile for the dashboard.
* ``POST /v1/sensors/audio/classify`` — classify an ambient audio clip
  with YAMNet (521 AudioSet classes).
* ``GET  /v1/sensors/audio/status`` — whether the audio classifier is
  installed / loaded.

All handlers use ``optional_bearer`` so the existing auth gate applies. They
NEVER raise — every failure path is a clean JSON envelope.

Mount in ``server/main.py``::

    from .routes import sensors as sensors_routes
    app.include_router(sensors_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer
from ..services import audio_classifier as audio_svc
from ..services import sensors as sensor_svc

router = APIRouter(prefix="/v1/sensors", tags=["sensors"])


class _Vec3(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None


class _Rot3(BaseModel):
    alpha: Optional[float] = None
    beta: Optional[float] = None
    gamma: Optional[float] = None


class IMUSampleBody(BaseModel):
    ts: Optional[float] = None
    acceleration: Optional[_Vec3] = None
    rotationRate: Optional[_Rot3] = None
    source: Optional[str] = None


class IMUBatchBody(BaseModel):
    """Either a single sample or a batch under ``samples``."""

    ts: Optional[float] = None
    acceleration: Optional[_Vec3] = None
    rotationRate: Optional[_Rot3] = None
    samples: Optional[list[dict[str, Any]]] = None
    source: Optional[str] = None


class AudioClassifyBody(BaseModel):
    audio_path: str = Field(..., description="Absolute path to a wav file on the server.")
    top_k: int = Field(5, ge=1, le=50)


@router.post("/imu")
async def imu_ingest(
    body: IMUBatchBody,
    _token: str | None = Depends(optional_bearer),
):
    """Accept one IMU sample or a batch from the mobile UI."""
    payload = body.model_dump(exclude_none=True)
    return sensor_svc.ingest(payload)


@router.get("/recent")
async def imu_recent(
    window_s: float = 60.0,
    samples: int = 0,
    _token: str | None = Depends(optional_bearer),
):
    """Summarise recent motion. Pass ``samples=N`` to also get raw rows."""
    summary = sensor_svc.recent_motion(window_s=window_s)
    if samples > 0:
        summary["raw"] = sensor_svc.recent_samples(limit=samples)
    return summary


@router.get("/status")
async def imu_status(_token: str | None = Depends(optional_bearer)):
    """IMU + audio-classifier health for the dashboard tile."""
    return {
        "ok": True,
        "imu": sensor_svc.status(),
        "audio": audio_svc.status(),
    }


@router.post("/audio/classify")
async def audio_classify(
    body: AudioClassifyBody,
    _token: str | None = Depends(optional_bearer),
):
    """Classify an ambient audio clip with YAMNet."""
    return audio_svc.classify(body.audio_path, top_k=body.top_k)


@router.get("/audio/status")
async def audio_status(_token: str | None = Depends(optional_bearer)):
    """Cheap availability check for the dashboard."""
    return audio_svc.status()
