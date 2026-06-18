"""Vision service — camera capture, object detection, and vision-LLM scene description.

Cluster C2 (gap-fix #9, #10, #11, #14): wraps three layers behind a single
graceful-degrade API so the rest of the app can call vision without knowing
whether the underlying stack (cv2, ultralytics, anthropic) is installed.

Layers
------
1. capture_frame()   — OpenCV VideoCapture, returns numpy BGR ndarray.
2. detect_objects()  — Ultralytics YOLO (YOLOv8n default, YOLO11/YOLO26 supported).
3. describe_scene()  — Claude vision (claude-opus-4 family) with base64 image payload.

All three layers fail soft: if a dependency is missing, the function returns
{ok: False, reason: '<install hint>'} instead of raising. This means the
FastAPI route is always callable and the JS shell can render a friendly
"install ultralytics to enable detection" message.

Activation
----------
- OpenCV: already in .venv (cv2 4.10.x verified 2026-06-18).
- YOLO: `pip install ultralytics` (~250MB, no GPU required for YOLOv8n).
- Claude vision: set ANTHROPIC_API_KEY env var and `pip install anthropic`.
- Hardware: any USB webcam exposed as /dev/video0, or a CSI Pi camera, or
  an RTSP URL passed as camera_id.

The /v1/vision/status endpoint reports per-layer availability so the UI can
disable the relevant button until the gap is closed.

Refs (2026 docs):
- https://docs.ultralytics.com/models/yolo11
- https://docs.ultralytics.com/models/yolo26
- https://docs.claude.com/en/docs/build-with-claude/vision
- https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js
"""
from __future__ import annotations

import base64
import io
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("jarvis.vision")

# --- Soft imports ---------------------------------------------------------
try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
    _CV2_OK = True
    _CV2_ERR: str | None = None
except Exception as exc:  # pragma: no cover - import guard
    cv2 = None  # type: ignore
    np = None  # type: ignore
    _CV2_OK = False
    _CV2_ERR = f"cv2 missing — pip install opencv-python ({exc})"

try:
    from ultralytics import YOLO  # type: ignore
    _YOLO_OK = True
    _YOLO_ERR: str | None = None
except Exception as exc:  # pragma: no cover - import guard
    YOLO = None  # type: ignore
    _YOLO_OK = False
    _YOLO_ERR = f"ultralytics missing — pip install ultralytics ({exc})"

try:
    import anthropic  # type: ignore
    _ANTHROPIC_OK = True
    _ANTHROPIC_ERR: str | None = None
except Exception as exc:  # pragma: no cover - import guard
    anthropic = None  # type: ignore
    _ANTHROPIC_OK = False
    _ANTHROPIC_ERR = f"anthropic SDK missing — pip install anthropic ({exc})"

# --- Configuration --------------------------------------------------------
DEFAULT_CAMERA_ID = int(os.environ.get("JARVIS_VISION_CAMERA", "0"))
DEFAULT_YOLO_MODEL = os.environ.get("JARVIS_YOLO_MODEL", "yolov8n.pt")
# claude-opus-4 family supports vision; allow override.
DEFAULT_CLAUDE_MODEL = os.environ.get(
    "JARVIS_VISION_LLM", "claude-opus-4-5-20250929"
)
CAPTURE_WARMUP_FRAMES = 3   # webcams typically need a few frames before AE settles

# Lazy-loaded YOLO model cache so we don't repay the 30MB load per call.
_yolo_cache: dict[str, Any] = {}


@dataclass(frozen=True)
class DetectedObject:
    """One YOLO detection result."""
    label: str
    confidence: float
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2)


@dataclass
class SceneDescription:
    """Result of describe_scene()."""
    ok: bool
    text: str = ""
    model: str = ""
    latency_ms: int = 0
    reason: str | None = None
    detections: list[dict[str, Any]] = field(default_factory=list)


# --- Status ---------------------------------------------------------------
def status() -> dict[str, Any]:
    """Return per-layer availability for /v1/vision/status."""
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {
        "ok": True,
        "ts": int(time.time()),
        "layers": {
            "capture": {
                "available": _CV2_OK,
                "reason": _CV2_ERR,
                "default_camera_id": DEFAULT_CAMERA_ID,
            },
            "detect": {
                "available": _YOLO_OK,
                "reason": _YOLO_ERR,
                "default_model": DEFAULT_YOLO_MODEL,
            },
            "describe": {
                "available": _ANTHROPIC_OK and has_key,
                "reason": (
                    _ANTHROPIC_ERR
                    if not _ANTHROPIC_OK
                    else (None if has_key else "ANTHROPIC_API_KEY env var not set")
                ),
                "default_model": DEFAULT_CLAUDE_MODEL,
            },
        },
    }


# --- Capture --------------------------------------------------------------
def capture_frame(camera_id: int | str = DEFAULT_CAMERA_ID) -> dict[str, Any]:
    """Grab one frame from the camera.

    `camera_id` can be an int (device index) or a string (RTSP/HTTP URL).
    Returns {ok, frame, shape, error}.  `frame` is a numpy BGR array when ok,
    None otherwise.
    """
    if not _CV2_OK:
        return {"ok": False, "frame": None, "shape": None, "error": _CV2_ERR}
    cap = None
    try:
        cap = cv2.VideoCapture(camera_id)  # type: ignore[union-attr]
        if not cap.isOpened():
            return {
                "ok": False,
                "frame": None,
                "shape": None,
                "error": f"camera_id={camera_id!r} could not be opened "
                         "(no device, in use, or permission denied)",
            }
        # Drain warmup frames so the first real frame is exposed.
        last_ok = False
        last_frame = None
        for _ in range(CAPTURE_WARMUP_FRAMES + 1):
            last_ok, last_frame = cap.read()
        if not last_ok or last_frame is None:
            return {
                "ok": False,
                "frame": None,
                "shape": None,
                "error": "camera opened but read() returned no frame",
            }
        return {
            "ok": True,
            "frame": last_frame,
            "shape": tuple(last_frame.shape),
            "error": None,
        }
    finally:
        if cap is not None:
            cap.release()


def encode_frame_jpeg(frame: Any, quality: int = 85) -> bytes:
    """Encode a BGR numpy frame to JPEG bytes for transport / LLM payload."""
    if not _CV2_OK:
        raise RuntimeError(_CV2_ERR or "cv2 unavailable")
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])  # type: ignore[union-attr]
    if not ok:
        raise RuntimeError("cv2.imencode failed")
    return buf.tobytes()


# --- Detection ------------------------------------------------------------
def _get_yolo(model_name: str) -> Any:
    if model_name not in _yolo_cache:
        log.info("loading YOLO model %s", model_name)
        _yolo_cache[model_name] = YOLO(model_name)  # type: ignore[misc]
    return _yolo_cache[model_name]


def detect_objects(
    frame: Any,
    model: str = DEFAULT_YOLO_MODEL,
    conf: float = 0.25,
) -> dict[str, Any]:
    """Run object detection on a BGR ndarray.

    Returns {ok, model, detections: [{label,confidence,bbox}], error}.
    """
    if not _YOLO_OK:
        return {"ok": False, "model": model, "detections": [], "error": _YOLO_ERR}
    if not _CV2_OK or frame is None:
        return {
            "ok": False,
            "model": model,
            "detections": [],
            "error": "no frame supplied (cv2 unavailable or capture failed)",
        }
    try:
        net = _get_yolo(model)
        results = net.predict(frame, conf=conf, verbose=False)
        out: list[dict[str, Any]] = []
        for r in results:
            names = getattr(r, "names", {}) or {}
            boxes = getattr(r, "boxes", None)
            if boxes is None:
                continue
            for b in boxes:
                cls_id = int(b.cls[0]) if hasattr(b, "cls") else -1
                conf_v = float(b.conf[0]) if hasattr(b, "conf") else 0.0
                xyxy = b.xyxy[0].tolist() if hasattr(b, "xyxy") else [0, 0, 0, 0]
                out.append(
                    {
                        "label": str(names.get(cls_id, str(cls_id))),
                        "confidence": round(conf_v, 4),
                        "bbox": [round(float(v), 2) for v in xyxy],
                    }
                )
        return {"ok": True, "model": model, "detections": out, "error": None}
    except Exception as exc:
        log.exception("detect_objects failed")
        return {
            "ok": False,
            "model": model,
            "detections": [],
            "error": f"{type(exc).__name__}: {exc}",
        }


# --- Vision LLM -----------------------------------------------------------
def describe_scene(
    frame: Any,
    prompt: str = "Describe what you see in this image in one short paragraph.",
    model: str = DEFAULT_CLAUDE_MODEL,
    include_detections: bool = True,
) -> SceneDescription:
    """Send a frame to Claude vision and return a natural-language description.

    Optionally enrich the prompt with YOLO detections so the LLM has a
    pre-parsed object list to reason over (helps small models).
    """
    if not _ANTHROPIC_OK:
        return SceneDescription(ok=False, reason=_ANTHROPIC_ERR or "anthropic unavailable")
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return SceneDescription(
            ok=False, reason="ANTHROPIC_API_KEY env var not set"
        )
    if not _CV2_OK or frame is None:
        return SceneDescription(
            ok=False, reason="no frame supplied (cv2 unavailable or capture failed)"
        )

    # Optionally pre-detect to help the LLM.
    detections: list[dict[str, Any]] = []
    if include_detections and _YOLO_OK:
        det = detect_objects(frame)
        if det.get("ok"):
            detections = det.get("detections", [])

    try:
        jpeg = encode_frame_jpeg(frame)
        b64 = base64.standard_b64encode(jpeg).decode("ascii")
    except Exception as exc:
        return SceneDescription(ok=False, reason=f"encode failed: {exc}")

    enriched_prompt = prompt
    if detections:
        labels = ", ".join(
            sorted({d["label"] for d in detections if d.get("confidence", 0) > 0.3})
        )
        if labels:
            enriched_prompt = (
                f"{prompt}\n\nFor context, a local detector found: {labels}."
            )

    started = time.time()
    try:
        client = anthropic.Anthropic(api_key=api_key)  # type: ignore[union-attr]
        resp = client.messages.create(
            model=model,
            max_tokens=400,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": enriched_prompt},
                    ],
                }
            ],
        )
        text_parts = [
            blk.text for blk in resp.content if getattr(blk, "type", "") == "text"
        ]
        text = "\n".join(text_parts).strip()
        return SceneDescription(
            ok=True,
            text=text,
            model=model,
            latency_ms=int((time.time() - started) * 1000),
            detections=detections,
        )
    except Exception as exc:
        log.exception("describe_scene failed")
        return SceneDescription(
            ok=False,
            reason=f"{type(exc).__name__}: {exc}",
            model=model,
            latency_ms=int((time.time() - started) * 1000),
            detections=detections,
        )


# --- Convenience end-to-end --------------------------------------------
def capture_detect_describe(
    camera_id: int | str = DEFAULT_CAMERA_ID,
    prompt: str = "Describe what you see in this image in one short paragraph.",
) -> dict[str, Any]:
    """One-call pipeline: grab a frame, detect, describe. Used by the route."""
    cap = capture_frame(camera_id)
    if not cap.get("ok"):
        return {
            "ok": False,
            "stage": "capture",
            "error": cap.get("error"),
            "status": status(),
        }
    frame = cap["frame"]
    det = detect_objects(frame)
    desc = describe_scene(frame, prompt=prompt, include_detections=False)
    return {
        "ok": desc.ok or det.get("ok", False),
        "stage": "complete",
        "shape": cap.get("shape"),
        "detections": det.get("detections", []),
        "detect_error": det.get("error"),
        "description": desc.text,
        "describe_ok": desc.ok,
        "describe_reason": desc.reason,
        "describe_model": desc.model,
        "latency_ms": desc.latency_ms,
    }
