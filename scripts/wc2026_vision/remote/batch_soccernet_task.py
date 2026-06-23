#!/usr/bin/env python3
"""Remote batch task: download a slice of SoccerNet games and run vision pipeline.

Designed to run on a Vast.ai GPU worker. Reads BATCH_SPECS from /workspace/batch_specs.json.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("batch_soccernet_task")

WORK_DIR = os.environ.get("GPU_WORK_DIR", "/workspace")
PYLIBS = os.path.join(WORK_DIR, "pylibs")
sys.path.insert(0, PYLIBS)
sys.path.insert(0, os.path.join(WORK_DIR, "jarvis-app-1", "scripts"))

# Vast.ai CUDA runtime images inject a forward-compatibility libcuda in
# /usr/local/nvidia/lib64 that is unsupported on GeForce hardware and breaks
# torch.cuda with error 804. Force the host driver library instead.
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
    needed = not (Path(PYLIBS).exists() and _has_module("torch") and _has_module("SoccerNet"))
    if not needed:
        LOG.info("Python deps already present at %s", PYLIBS)
        return
    LOG.info("Installing Python deps into %s", PYLIBS)
    # Match the CUDA 12.4 runtime shipped by the nvidia/cuda:12.4 images.
    run(
        f"{sys.executable} -m pip install --target {PYLIBS} --no-cache-dir "
        "torch==2.4.0 torchvision==0.19.0 --index-url https://download.pytorch.org/whl/cu124 "
        "ultralytics==8.2.18 supervision==0.21.0 opencv-python==4.8.0.76 "
        "numpy==1.26.4 scikit-learn==1.5.0 scipy==1.13.1 SoccerNet",
        timeout=600,
    )


def write_status(status: str):
    os.makedirs(os.path.join(WORK_DIR, "results"), exist_ok=True)
    Path(os.path.join(WORK_DIR, "results", "STATUS")).write_text(status, encoding="utf-8")


def download_game(local_dir: Path, game: str, password: str, resolution: str = "224p") -> bool:
    """Download a single SoccerNet game using the official SDK."""
    from SoccerNet.Downloader import SoccerNetDownloader
    downloader = SoccerNetDownloader(LocalDirectory=str(local_dir))
    downloader.password = password
    files = [f"1_{resolution}.mkv", f"2_{resolution}.mkv"]
    # Determine split from game path prefix.
    spl = "train"
    if "test" in game.split("/")[0]:
        spl = "test"
    elif "valid" in game.split("/")[0]:
        spl = "valid"
    try:
        downloader.downloadGame(game, files=files, spl=spl, verbose=True)
        return all((local_dir / game / f).exists() for f in files)
    except Exception as exc:
        LOG.error("Download failed for %s: %s", game, exc)
        return False


def process_game(local_dir: Path, game: str, frame_stride: int, max_frames: int | None) -> bool:
    """Concatenate halves and run vision pipeline."""
    from wc2026_vision import process_video
    game_dir = local_dir / game
    parts = sorted(game_dir.glob("*_224p.mkv"))
    if not parts:
        LOG.warning("No video parts found for %s", game)
        return False
    video_path = parts[0]
    if len(parts) > 1:
        tmp_dir = Path(tempfile.mkdtemp(prefix="soccernet_"))
        video_path = tmp_dir / "concat.mkv"
        with video_path.open("wb") as out:
            for part in parts:
                with part.open("rb") as inp:
                    shutil.copyfileobj(inp, out)
    match_id = f"soccernet_{game.replace('/', '_').replace(' ', '_')}"
    try:
        process_video(
            str(video_path),
            match_id=match_id,
            home="SoccerNet_Home",
            away="SoccerNet_Away",
            output_video=False,
            max_frames=max_frames,
            frame_stride=frame_stride,
        )
        return True
    except Exception as exc:
        LOG.error("Processing failed for %s: %s", game, exc)
        return False
    finally:
        if len(parts) > 1:
            shutil.rmtree(video_path.parent, ignore_errors=True)


def main() -> int:
    try:
        specs_path = os.path.join(WORK_DIR, "batch_specs.json")
        if not os.path.exists(specs_path):
            write_status("failed: missing batch_specs.json")
            return 1
        specs = json.loads(Path(specs_path).read_text(encoding="utf-8"))
        password = specs.get("password") or os.environ.get("SOCCERNET_PASSWORD")
        if not password:
            write_status("failed: missing SoccerNet password")
            return 1
        games = specs.get("games", [])
        frame_stride = specs.get("frame_stride", 5)
        max_frames = specs.get("max_frames")
        resolution = specs.get("resolution", "224p")
        if not games:
            write_status("failed: no games in batch")
            return 1

        ensure_system_packages()
        install_deps()

        local_dir = Path(WORK_DIR) / "soccernet_downloads"
        local_dir.mkdir(parents=True, exist_ok=True)
        results = {"processed": [], "failed": []}
        for game in games:
            LOG.info("=== Game: %s ===", game)
            ok = download_game(local_dir, game, password, resolution)
            if not ok:
                results["failed"].append({"game": game, "stage": "download"})
                continue
            ok = process_game(local_dir, game, frame_stride, max_frames)
            if ok:
                results["processed"].append(game)
            else:
                results["failed"].append({"game": game, "stage": "process"})
            # Clean up video to save disk for next game.
            game_dir = local_dir / game
            if game_dir.exists():
                shutil.rmtree(game_dir, ignore_errors=True)

        # Copy the tracking artefacts to the results folder so the VPS can sync them.
        data_dir = os.path.join(WORK_DIR, "jarvis-app-1", "server", "data")
        results_dir = os.path.join(WORK_DIR, "results")
        for fname in ("wc2026_tracking.db", "wc2026_tracking_features.json"):
            src = os.path.join(data_dir, fname)
            dst = os.path.join(results_dir, fname)
            if os.path.exists(src):
                shutil.copy2(src, dst)
                LOG.info("Copied %s -> results", fname)

        # Write a summary next to results.
        Path(os.path.join(WORK_DIR, "results", "batch_summary.json")).write_text(json.dumps(results, indent=2), encoding="utf-8")
        write_status(f"done: {len(results['processed'])} processed, {len(results['failed'])} failed")
        return 0
    except Exception as exc:
        LOG.exception("Batch task failed")
        write_status(f"failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
