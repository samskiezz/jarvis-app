"""Remote GPU task script.

This file is copied to a Vast.ai GPU instance and executed there. It expects:
  <GPU_WORK_DIR>/code.tar.gz          - tarball of scripts/wc2026_vision + config
  <GPU_WORK_DIR>/videos/<match>.mp4   - input videos
  <GPU_WORK_DIR>/video_specs.json     - list of {video_path, match_id, home, away, frame_stride, max_frames}

It writes:
  <GPU_WORK_DIR>/results/wc2026_tracking.db
  <GPU_WORK_DIR>/results/wc2026_tracking_features.json
  <GPU_WORK_DIR>/results/run.log
  <GPU_WORK_DIR>/results/STATUS
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tarfile
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("gpu_vision_task")

WORK = Path(os.environ.get("GPU_WORK_DIR", "/workspace"))
PYLIBS = WORK / "pylibs"
TMP = WORK / "tmp"
TMP.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("TMPDIR", str(TMP))
os.environ.setdefault("TEMP", str(TMP))
os.environ.setdefault("TMP", str(TMP))
os.environ.setdefault("XDG_CACHE_HOME", str(TMP / "cache"))
os.environ.setdefault("PIP_CACHE_DIR", str(TMP / "cache"))


def run(cmd: str, **kwargs) -> subprocess.CompletedProcess:
    LOG.info("$ %s", cmd)
    env = {**os.environ, **kwargs.pop("env", {})}
    return subprocess.run(cmd, shell=True, check=True, text=True, env=env, **kwargs)


def install_deps() -> None:
    """Install Python deps into a local target dir under the work dir so we never touch the small root overlay."""
    try:
        # If a previous run already installed the packages, skip.
        run(f"{sys.executable} -c 'import cv2, numpy, sklearn, supervision, torch, ultralytics'")
        LOG.info("All vision deps already available")
        return
    except Exception as exc:  # noqa: BLE001
        LOG.info("Missing deps, installing... (%s)", exc)

    PYLIBS.mkdir(parents=True, exist_ok=True)
    # Install into PYLIBS and add it to PYTHONPATH for this process.
    reqs = [
        "torch==2.4.1", "torchvision==0.19.1", "ultralytics==8.4.75",
        "supervision==0.29.0.post0", "opencv-python==4.10.0.84",
        "numpy==1.26.4", "scikit-learn==1.5.2", "scipy==1.14.1",
    ]
    run(f"{sys.executable} -m pip install --no-cache-dir --target {PYLIBS} " + " ".join(reqs))
    if str(PYLIBS) not in sys.path:
        sys.path.insert(0, str(PYLIBS))


def unpack_code() -> None:
    tars = list(WORK.glob("*.tar.gz"))
    if not tars:
        raise FileNotFoundError("No *.tar.gz found in %s" % WORK)
    tar = tars[0]
    LOG.info("Unpacking %s", tar)
    dest = WORK / "jarvis-app-1"
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar, "r:gz") as tf:
        tf.extractall(dest)
    LOG.info("Code unpacked to %s", dest)


def log_gpus() -> None:
    try:
        import torch
        LOG.info("CUDA available: %s  devices: %d", torch.cuda.is_available(), torch.cuda.device_count())
        for i in range(torch.cuda.device_count()):
            LOG.info("GPU %d: %s", i, torch.cuda.get_device_name(i))
    except Exception as exc:  # noqa: BLE001
        LOG.warning("Could not log GPUs: %s", exc)


def main() -> int:
    try:
        install_deps()
        unpack_code()

        repo_root = (WORK / "jarvis-app-1").resolve()
        sys.path.insert(0, str(repo_root))

        log_gpus()

        from scripts.wc2026_vision.pipeline import process_video
        from scripts.wc2026_vision.storage import export_features_json

        specs_path = WORK / "video_specs.json"
        specs = json.loads(specs_path.read_text()) if specs_path.exists() else []
        if not specs:
            LOG.error("No video specs found at %s", specs_path)
            return 1

        # Ensure output directories exist.
        (repo_root / "server" / "data").mkdir(parents=True, exist_ok=True)

        for spec in specs:
            video_path = Path(spec["video_path"])
            if not video_path.exists():
                LOG.error("Video not found: %s", video_path)
                continue
            LOG.info("Processing %s (%s vs %s) stride=%s max=%s",
                     spec["match_id"], spec["home"], spec["away"],
                     spec.get("frame_stride", 1), spec.get("max_frames"))
            try:
                process_video(
                    video_path=video_path,
                    match_id=spec["match_id"],
                    home=spec["home"],
                    away=spec["away"],
                    output_video=False,
                    max_frames=spec.get("max_frames"),
                    frame_stride=spec.get("frame_stride", 1),
                )
                LOG.info("Done %s", spec["match_id"])
            except Exception as exc:  # noqa: BLE001
                LOG.exception("Failed %s: %s", spec["match_id"], exc)

        # Export aggregated JSON to the results dir as well.
        export_features_json()

        results_dir = WORK / "results"
        results_dir.mkdir(parents=True, exist_ok=True)
        db_src = repo_root / "server" / "data" / "wc2026_tracking.db"
        json_src = repo_root / "server" / "data" / "wc2026_tracking_features.json"
        if db_src.exists():
            os.replace(str(db_src), str(results_dir / db_src.name))
        if json_src.exists():
            os.replace(str(json_src), str(results_dir / json_src.name))

        (results_dir / "STATUS").write_text("done")
        LOG.info("Remote task complete")
        return 0
    except Exception as exc:  # noqa: BLE001
        LOG.exception("Remote task failed: %s", exc)
        (WORK / "results").mkdir(parents=True, exist_ok=True)
        (WORK / "results" / "STATUS").write_text(f"failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
