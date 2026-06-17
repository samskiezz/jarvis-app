#!/usr/bin/env python3
"""ue5_render_and_play.py — Higgsfield "render and play" generator.

Automates the full path from Higgsfield-rendered media assets to a packaged,
Pixel-Streaming-ready UE5 Underworld build:

1. Download all completed Higgsfield media from CDN to local storage.
2. Run the UE5 pipeline (manifest, chunked GLB import, media staging/import,
   level build, package).

This is the single command to run after a Higgsfield round finishes so the
scene update is live in UE5 without manual Editor work.

Usage:
    # After a Higgsfield round is complete in higgsfield_master_manifest.json:
    python3 underworld/scripts/ue5_render_and_play.py

    # Quick media refresh only (no GLB re-import, no package):
    python3 underworld/scripts/ue5_render_and_play.py --media-only

    # Skip downloading (media already local) and build everything:
    python3 underworld/scripts/ue5_render_and_play.py --skip-download

    # Custom paths:
    UW_UE_ROOT=/opt/UnrealEngine python3 underworld/scripts/ue5_render_and_play.py \
        --project-dir /opt/jarvis-app-1/underworld/deploy/ue5-project
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
UE_PROJ_DEFAULT = REPO_ROOT / "underworld" / "deploy" / "ue5-project"
MEDIA_DOWNLOAD_SCRIPT = REPO_ROOT / "underworld" / "scripts" / "download_higgsfield_media.py"
PIPELINE_SCRIPT = UE_PROJ_DEFAULT / "Scripts" / "ue5_pipeline.py"


def _log(msg: str) -> None:
    print(f"[ue5-render-play] {msg}", flush=True)


def _run(cmd: list[str], cwd: Path | None = None) -> int:
    _log("$ " + " ".join(str(c) for c in cmd))
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd or REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line, end="")
    return proc.wait()


def main() -> int:
    parser = argparse.ArgumentParser(description="Higgsfield UE5 render-and-play generator")
    parser.add_argument("--project-dir", type=Path, default=Path(os.environ.get("UW_PROJ", UE_PROJ_DEFAULT)))
    parser.add_argument("--ue-root", type=Path, default=Path(os.environ.get("UW_UE_ROOT", "/opt/UnrealEngine")))
    parser.add_argument("--chunk-size", type=int, default=int(os.environ.get("UW_CHUNK_SIZE", "30")))
    parser.add_argument("--skip-download", action="store_true", help="skip Higgsfield media download")
    parser.add_argument("--media-only", action="store_true", help="only refresh media, skip GLB/package")
    parser.add_argument("--skip-package", action="store_true")
    args = parser.parse_args()

    if not args.skip_download:
        if not MEDIA_DOWNLOAD_SCRIPT.exists():
            _log(f"download script missing: {MEDIA_DOWNLOAD_SCRIPT}")
            return 2
        rc = _run([sys.executable, str(MEDIA_DOWNLOAD_SCRIPT)], cwd=REPO_ROOT)
        if rc != 0:
            _log("media download failed")
            return rc

    pipeline_flags = ["--project-dir", str(args.project_dir), "--ue-root", str(args.ue_root), "--chunk-size", str(args.chunk_size)]
    if args.media_only:
        pipeline_flags.append("--media-only")
    if args.skip_package:
        pipeline_flags.append("--skip-package")

    rc = _run([sys.executable, str(PIPELINE_SCRIPT)] + pipeline_flags, cwd=args.project_dir)
    if rc != 0:
        _log(f"UE5 pipeline failed with exit {rc}")
        return rc

    _log("render and play complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
