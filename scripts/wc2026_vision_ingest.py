#!/usr/bin/env python3
"""Batch ingest match videos into tracking features.

Drop video files into server/data/vision_videos_in/ named like:
    WC2022_Final_Argentina_vs_France.mp4
    WC2022_SF_France_vs_Morocco.mp4

The script extracts match_id, home, and away from the filename, runs the
vision pipeline, and writes features to server/data/wc2026_tracking_features.json.
"""
from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from wc2026_vision import config, process_video, export_features_json

LOG = logging.getLogger("wc2026_vision_ingest")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _parse_filename(path: Path) -> tuple[str, str, str] | None:
    """Very permissive filename parser: expects ...Home_vs_Away..."""
    stem = path.stem.replace("-", "_")
    m = re.search(r"([A-Za-z\s]+)_vs_([A-Za-z\s]+)", stem)
    if not m:
        return None
    home = m.group(1).strip().replace("_", " ")
    away = m.group(2).strip().replace("_", " ")
    match_id = re.sub(r"[^A-Za-z0-9_]+", "_", stem).strip("_")
    return match_id, home, away


def ingest_dir(video_dir: Path, max_frames: int | None = None, frame_stride: int = 1) -> int:
    video_dir.mkdir(parents=True, exist_ok=True)
    processed = 0
    for path in sorted(video_dir.iterdir()):
        if path.suffix.lower() not in (".mp4", ".mov", ".avi", ".mkv"):
            continue
        parsed = _parse_filename(path)
        if parsed is None:
            LOG.warning("skipping %s — cannot parse home_vs_away", path.name)
            continue
        match_id, home, away = parsed
        LOG.info("ingesting %s -> %s vs %s", path.name, home, away)
        try:
            process_video(path, match_id=match_id, home=home, away=away,
                          output_video=True, max_frames=max_frames, frame_stride=frame_stride)
            processed += 1
        except Exception as exc:
            LOG.error("failed to process %s: %s", path.name, exc)
    export_features_json()
    return processed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest match videos for WC2026 vision tracking")
    parser.add_argument("--dir", type=Path, default=config.VIDEO_IN_DIR,
                        help="Directory containing match videos")
    parser.add_argument("--max-frames", type=int, default=None,
                        help="Process only first N frames per video (for testing)")
    parser.add_argument("--frame-stride", type=int, default=1,
                        help="Process every Nth frame (default 1 = all frames)")
    args = parser.parse_args(argv)
    n = ingest_dir(args.dir, max_frames=args.max_frames, frame_stride=args.frame_stride)
    LOG.info("ingested %d videos", n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
