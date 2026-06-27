#!/usr/bin/env python3
"""Non-stop batch processor: ingest every SportsMOT football clip in chunks.

Usage:
    .venv/bin/python scripts/wc2026_vision/remote/run_all_sportsmot.py \
        --instance-id 41281336 \
        --chunk-size 10 \
        --frame-stride 5
"""
from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("run_all_sportsmot")

SPECS_PATH = REPO_ROOT / "server" / "data" / "vision_tracking" / "sportsmot_football" / "videos" / "batch_specs.json"
VIDEO_DIR = SPECS_PATH.parent


def run_batch(items: list[dict], instance_id: int | None, frame_stride: int, max_frames: int | None) -> int:
    staging = Path(__file__).resolve().parent / f"sportsmot_batch_{items[0]['match_id']}.json"
    staging.write_text(json.dumps(items, indent=2), encoding="utf-8")
    cmd = [
        sys.executable,
        str(REPO_ROOT / "scripts" / "wc2026_vision" / "remote" / "batch_video_runner.py"),
        "--specs", str(staging),
        "--video-dir", str(VIDEO_DIR),
        "--frame-stride", str(frame_stride),
        "--label", "jarvis-vision-sportsmot",
        "--keep",
    ]
    if max_frames is not None:
        cmd.extend(["--max-frames", str(max_frames)])
    if instance_id:
        cmd.extend(["--instance-id", str(instance_id)])
    LOG.info("Running batch with %d clips", len(items))
    r = subprocess.run(cmd, check=False)
    return r.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Process all SportsMOT football clips in chunks")
    parser.add_argument("--instance-id", type=int, default=None, help="Reuse existing instance")
    parser.add_argument("--chunk-size", type=int, default=10, help="Clips per batch")
    parser.add_argument("--frame-stride", type=int, default=5)
    parser.add_argument("--max-frames", type=int, default=None)
    parser.add_argument("--resume", type=int, default=0, help="Start at clip index")
    parser.add_argument("--max-clips", type=int, default=None, help="Stop after N clips")
    args = parser.parse_args()

    if not SPECS_PATH.exists():
        LOG.error("Specs not found: %s", SPECS_PATH)
        return 1

    specs = json.loads(SPECS_PATH.read_text(encoding="utf-8"))
    total = args.max_clips if args.max_clips else len(specs)
    start = args.resume
    instance_id = args.instance_id

    while start < total:
        end = min(start + args.chunk_size, total)
        chunk = specs[start:end]
        rc = run_batch(chunk, instance_id, args.frame_stride, args.max_frames)
        if rc != 0:
            LOG.error("Batch %d-%d failed", start, end)
            return rc
        start = end
        if start < total:
            LOG.info("Batch complete. Next batch starts at %d/%d", start, total)
            time.sleep(5)

    LOG.info("All batches complete. %d clips processed.", total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
