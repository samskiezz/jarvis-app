"""End-to-end video processing pipeline for one match."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from . import config
from .detector import detect
from .events import EventDetector
from .features import extract_player_features, extract_rhythmic_features
from .storage import ensure_schema, export_features_json, save_match_features
from .team_assigner import TeamAssigner
from .tracker import FrameTracks, make_byte_tracker, update_tracker

LOG = logging.getLogger("wc2026_vision")


def process_video(video_path: str | Path, match_id: str, home: str, away: str,
                  output_video: bool = False, max_frames: int | None = None,
                  frame_stride: int = 1) -> dict[str, Any]:
    """Run the full vision pipeline on a single match video.

    Args:
        video_path: path to local video file.
        match_id: unique match identifier (used as DB key).
        home, away: team names.
        output_video: if True, write an annotated output video.
        max_frames: cap for quick tests.
        frame_stride: process every Nth frame (e.g. 5 = 5 fps from 25 fps video).

    Returns:
        dict with summary features.
    """
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(video_path)

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    tracker = make_byte_tracker()
    team_assigner = TeamAssigner(n_clusters=config.N_TEAM_CLUSTERS)
    event_detector = EventDetector()
    tracks: list[FrameTracks] = []
    frames: list[np.ndarray] = []

    writer: cv2.VideoWriter | None = None
    if output_video:
        out_path = config.VIDEO_OUT_DIR / f"{match_id}_tracked.mp4"
        config.VIDEO_OUT_DIR.mkdir(parents=True, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(out_path), fourcc, fps / frame_stride, (width, height))

    raw_frame_idx = 0
    processed_frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        raw_frame_idx += 1
        if (raw_frame_idx - 1) % frame_stride != 0:
            continue
        if max_frames and processed_frame_idx >= max_frames:
            break

        boxes, confs, cls = detect(frame)
        ft = update_tracker(tracker, boxes, confs, cls, processed_frame_idx, fps / frame_stride)
        tracks.append(ft)
        frames.append(frame)
        processed_frame_idx += 1

        if processed_frame_idx % 300 == 0:
            LOG.info("%s frame %d/%d (raw %d)", match_id, processed_frame_idx, total_frames // frame_stride, raw_frame_idx)

    cap.release()

    if not tracks:
        LOG.warning("%s: no frames processed", match_id)
        return {}

    # Fit team colours on first 150 frames (or all if shorter).
    fit_window = min(len(frames), 150)
    team_assigner.fit(frames[:fit_window], tracks[:fit_window])

    # Build team map per frame and run event detection.
    teams_by_frame: list[dict[int, str]] = []
    for frame, ft in zip(frames, tracks):
        teams: dict[int, str] = {}
        for pid, box in zip(ft.player_ids, ft.player_boxes):
            teams[pid] = team_assigner.predict(frame, pid, box)
        teams_by_frame.append(teams)
        event_detector.process(ft, teams, fps / frame_stride)

    # Annotated output.
    if writer is not None:
        import supervision as sv
        box_annotator = sv.BoxAnnotator()
        label_annotator = sv.LabelAnnotator()
        for frame, ft, teams in zip(frames, tracks, teams_by_frame):
            if len(ft.player_ids) == 0:
                writer.write(frame)
                continue
            detections = sv.Detections(
                xyxy=ft.player_boxes,
                class_id=ft.player_classes,
                tracker_id=ft.player_ids,
            )
            labels = [f"{teams.get(int(pid), '?')}:{int(pid)}" for pid in ft.player_ids]
            ann = box_annotator.annotate(frame.copy(), detections)
            ann = label_annotator.annotate(ann, detections, labels)
            if ft.ball_box is not None:
                x1, y1, x2, y2 = map(int, ft.ball_box)
                cv2.rectangle(ann, (x1, y1), (x2, y2), (0, 255, 255), 2)
            writer.write(ann)
        writer.release()
        LOG.info("%s wrote annotated video -> %s", match_id, config.VIDEO_OUT_DIR / f"{match_id}_tracked.mp4")

    player_features = extract_player_features(tracks, teams_by_frame[-1] if teams_by_frame else {}, (height, width))
    rhythmic_features = extract_rhythmic_features(event_detector.possession_log)
    summary = event_detector.summarise()
    features = {
        "player": player_features,
        "rhythmic": rhythmic_features,
        "video_meta": {"fps": fps, "frames": processed_frame_idx, "width": width, "height": height},
    }

    conn = ensure_schema()
    save_match_features(match_id, home, away, str(video_path), summary, features,
                        event_detector.possession_log, conn=conn)
    export_features_json()
    conn.close()

    LOG.info("%s tracking summary: %s", match_id, summary)
    return {"summary": summary, "features": features}
