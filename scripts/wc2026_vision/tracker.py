"""Multi-object tracker (players + ball) using supervision ByteTrack."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import supervision as sv

from . import config


@dataclass
class FrameTracks:
    """Tracking output for one frame."""
    frame_idx: int
    timestamp: float
    player_ids: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=int))
    player_boxes: np.ndarray = field(default_factory=lambda: np.empty((0, 4)))
    player_classes: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=int))
    ball_box: np.ndarray | None = None
    ball_conf: float = 0.0


def make_byte_tracker() -> sv.ByteTrack:
    return sv.ByteTrack(
        track_activation_threshold=config.TRACKER_TRACK_THRESH,
        lost_track_buffer=config.TRACKER_LOST_BUFFER,
        minimum_matching_threshold=config.TRACKER_MATCH_THRESH,
    )


def update_tracker(tracker: sv.ByteTrack, boxes: np.ndarray, confs: np.ndarray,
                   class_ids: np.ndarray, frame_idx: int, fps: float) -> FrameTracks:
    """Update ByteTrack with detections and split players/ball."""
    detections = sv.Detections(xyxy=boxes, confidence=confs, class_id=class_ids)
    tracks = tracker.update_with_detections(detections)

    player_mask = tracks.class_id == config.PERSON_CLASS
    ball_mask = (tracks.class_id == config.BALL_CLASS) | (tracks.class_id == config.SPORTS_BALL_CLASS)

    ft = FrameTracks(
        frame_idx=frame_idx,
        timestamp=round(frame_idx / fps, 3) if fps else 0.0,
    )
    if np.any(player_mask):
        ft.player_ids = tracks.tracker_id[player_mask].astype(int)
        ft.player_boxes = tracks.xyxy[player_mask]
        ft.player_classes = tracks.class_id[player_mask]
    if np.any(ball_mask):
        # If multiple ball detections, take highest-conf.
        idx = int(np.argmax(tracks.confidence[ball_mask]))
        ft.ball_box = tracks.xyxy[ball_mask][idx]
        ft.ball_conf = float(tracks.confidence[ball_mask][idx])
    return ft
