#!/usr/bin/env python3
"""Convenience wrapper to ingest SportsMOT football clips."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from wc2026_vision.datasets import ingest_sportsmot_football  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

if __name__ == "__main__":
    import argparse

    from wc2026_vision import config

    parser = argparse.ArgumentParser(description="Ingest SportsMOT football clips into WC2026 tracking DB")
    parser.add_argument("--root", type=Path, default=config.VISION_DIR / "sportsmot",
                        help="Path to unzipped SportsMOT dataset")
    parser.add_argument("--max-clips", type=int, default=None, help="Process only first N clips")
    parser.add_argument("--max-frames", type=int, default=None, help="Process only first N frames per clip")
    parser.add_argument("--output-video", action="store_true", help="Write annotated output videos")
    args = parser.parse_args()

    ingest_sportsmot_football(
        args.root,
        max_clips=args.max_clips,
        max_frames_per_clip=args.max_frames,
        output_video=args.output_video,
    )
