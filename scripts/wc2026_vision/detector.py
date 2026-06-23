"""YOLO-based player/ball detector."""
from __future__ import annotations

from typing import Any

import numpy as np

from . import config

_YOLO = None


def get_yolo(model: str | None = None) -> Any:
    """Lazy-load the YOLO model (downloads weights on first call)."""
    global _YOLO
    if _YOLO is None:
        from ultralytics import YOLO
        import torch
        _YOLO = YOLO(model or config.DEFAULT_YOLO_MODEL, verbose=False)
        # Move model to GPU once and enable half precision for speed.
        if torch.cuda.is_available():
            _YOLO.to("cuda")
            if config.YOLO_HALF_PRECISION:
                _YOLO.model.half()
    return _YOLO


def detect(frame: np.ndarray, model: str | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Run YOLO on a single BGR frame.

    Returns boxes (N,4 as xyxy), confidences (N,), class_ids (N,).
    Filtered to persons and balls only.
    """
    yolo = get_yolo(model)
    results = yolo(frame, verbose=False, conf=min(config.PLAYER_CONF, config.BALL_CONF),
                   half=config.YOLO_HALF_PRECISION, device="cuda" if yolo.device.type == "cuda" else "cpu")
    result = results[0]
    if result.boxes is None or len(result.boxes) == 0:
        return np.empty((0, 4)), np.empty(0), np.empty(0)
    boxes = result.boxes.xyxy.cpu().numpy()
    confs = result.boxes.conf.cpu().numpy()
    cls = result.boxes.cls.cpu().numpy().astype(int)

    # Keep persons and sports balls.
    keep = ((cls == config.PERSON_CLASS) |
            (cls == config.BALL_CLASS) |
            (cls == config.SPORTS_BALL_CLASS))
    boxes, confs, cls = boxes[keep], confs[keep], cls[keep]

    # Separate confidence thresholds.
    person_mask = (cls == config.PERSON_CLASS) & (confs >= config.PLAYER_CONF)
    ball_mask = ((cls == config.BALL_CLASS) | (cls == config.SPORTS_BALL_CLASS)) & (confs >= config.BALL_CONF)
    keep = person_mask | ball_mask
    return boxes[keep], confs[keep], cls[keep]
