#!/usr/bin/env python3
"""Remote batch task: process a list of local MP4s with the vision pipeline.

Reads batch_specs.json from /workspace/batch_specs.json.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("batch_video_task")

WORK_DIR = os.environ.get("GPU_WORK_DIR", "/workspace")
PYLIBS = os.path.join(WORK_DIR, "pylibs")
sys.path.insert(0, PYLIBS)
sys.path.insert(0, os.path.join(WORK_DIR, "jarvis-app-1", "scripts"))

# Fix Vast.ai forward-compat libcuda issue on GeForce.
if os.path.exists("/usr/lib/x86_64-linux-gnu/libcuda.so.1"):
    os.environ["LD_LIBRARY_PATH"] = "/usr/lib/x86_64-linux-gnu"


def run(cmd: list[str] | str, **kwargs) -> subprocess.CompletedProcess:
    LOG.info("$ %s", cmd if isinstance(cmd, str) else " ".join(cmd))
    return subprocess.run(cmd, shell=isinstance(cmd, str), check=False, text=True, capture_output=True, **kwargs)


def ensure_system_packages():
    LOG.info("Ensuring system packages...")
    run("apt-get update -qq && apt-get install -y -qq python3-pip python3-venv libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1 build-essential", timeout=300)


def _has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except ImportError:
        return False


def install_deps():
    needed = not (Path(PYLIBS).exists() and _has_module("torch") and _has_module("cv2") and _has_module("ultralytics"))
    if not needed:
        LOG.info("Python deps already present at %s", PYLIBS)
        return
    LOG.info("Installing Python deps into %s", PYLIBS)
    ensure_system_packages()
    run(
        f"{sys.executable} -m pip install --target {PYLIBS} --no-cache-dir "
        "torch==2.4.0 torchvision==0.19.0 --extra-index-url https://download.pytorch.org/whl/cu124 "
        "ultralytics==8.2.18 supervision==0.21.0 opencv-python==4.8.0.76 "
        "numpy==1.26.4 scikit-learn==1.5.0 scipy==1.13.1",
        timeout=600,
    )


def write_status(status: str):
    os.makedirs(os.path.join(WORK_DIR, "results"), exist_ok=True)
    Path(os.path.join(WORK_DIR, "results", "STATUS")).write_text(status, encoding="utf-8")


def main() -> int:
    try:
        specs_path = os.path.join(WORK_DIR, "batch_specs.json")
        if not os.path.exists(specs_path):
            write_status("failed: missing batch_specs.json")
            return 1
        specs = json.loads(Path(specs_path).read_text(encoding="utf-8"))
        videos = specs.get("videos", [])
        frame_stride = specs.get("frame_stride", 5)
        max_frames = specs.get("max_frames")
        if not videos:
            write_status("failed: no videos in batch")
            return 1

        install_deps()
        from wc2026_vision import process_video

        results = {"processed": [], "failed": []}
        video_dir = Path(WORK_DIR) / "videos"
        for item in videos:
            match_id = item["match_id"]
            video_file = item["video"]
            home = item.get("home", "Home")
            away = item.get("away", "Away")
            video_path = video_dir / video_file
            LOG.info("=== %s -> %s ===", match_id, video_path)
            if not video_path.exists():
                LOG.error("Missing video: %s", video_path)
                results["failed"].append({"match_id": match_id, "video": video_file, "stage": "missing"})
                continue
            try:
                process_video(
                    str(video_path),
                    match_id=match_id,
                    home=home,
                    away=away,
                    output_video=False,
                    max_frames=max_frames,
                    frame_stride=frame_stride,
                )
                results["processed"].append(match_id)
            except Exception as exc:
                LOG.exception("Processing failed for %s", match_id)
                results["failed"].append({"match_id": match_id, "video": video_file, "stage": "process", "error": str(exc)})

        # Copy artefacts to results folder for the VPS to sync.
        data_dir = os.path.join(WORK_DIR, "jarvis-app-1", "server", "data")
        results_dir = os.path.join(WORK_DIR, "results")
        for fname in ("wc2026_tracking.db", "wc2026_tracking_features.json"):
            src = os.path.join(data_dir, fname)
            dst = os.path.join(results_dir, fname)
            if os.path.exists(src):
                shutil.copy2(src, dst)
                LOG.info("Copied %s -> results", fname)

        Path(os.path.join(WORK_DIR, "results", "batch_summary.json")).write_text(
            json.dumps(results, indent=2), encoding="utf-8"
        )
        write_status(f"done: {len(results['processed'])} processed, {len(results['failed'])} failed")
        return 0
    except Exception as exc:
        LOG.exception("Batch task failed")
        write_status(f"failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
