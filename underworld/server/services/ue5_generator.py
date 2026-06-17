"""ue5_generator.py — Higgsfield "render and play" feature.

Ties Higgsfield media generation to the UE5 build pipeline.  The high-level
flow is:

1. Download completed Higgsfield renders from the master manifest.
2. Run the resumable UE5 pipeline (GLB import, media import, level, package).

This service is intentionally thin: heavy lifting lives in the scripts under
`underworld/deploy/ue5-project/Scripts/`, which can also be run standalone.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path
from typing import Any

import structlog

log = structlog.get_logger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
MEDIA_DOWNLOAD_SCRIPT = REPO_ROOT / "underworld" / "scripts" / "download_higgsfield_media.py"
PIPELINE_SCRIPT = (
    REPO_ROOT / "underworld" / "deploy" / "ue5-project" / "Scripts" / "ue5_pipeline.py"
)


def _run(cmd: list[str], cwd: Path) -> int:
    log.info("ue5_generator.run", cmd=" ".join(str(c) for c in cmd), cwd=str(cwd))
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line, end="")
    return proc.wait()


async def sync_media_and_build(
    project_dir: Path | None = None,
    ue_root: Path | None = None,
    chunk_size: int = 30,
    *,
    skip_download: bool = False,
    media_only: bool = False,
    skip_package: bool = False,
) -> dict[str, Any]:
    """Download Higgsfield media and run the UE5 pipeline in a background thread.

    Returns a dict with the pipeline exit code and status-file path.
    """
    proj = project_dir or (REPO_ROOT / "underworld" / "deploy" / "ue5-project")
    ue = ue_root or Path(os.environ.get("UW_UE_ROOT", "/opt/UnrealEngine"))

    if not skip_download:
        rc = await asyncio.to_thread(
            _run, [str(REPO_ROOT / ".venv" / "bin" / "python"), str(MEDIA_DOWNLOAD_SCRIPT)], REPO_ROOT
        )
        if rc != 0:
            return {"ok": False, "error": "media_download_failed", "exit_code": rc}

    pipeline_flags = [
        str(REPO_ROOT / ".venv" / "bin" / "python"),
        str(PIPELINE_SCRIPT),
        "--project-dir",
        str(proj),
        "--ue-root",
        str(ue),
        "--chunk-size",
        str(chunk_size),
    ]
    if media_only:
        pipeline_flags.append("--media-only")
    if skip_package:
        pipeline_flags.append("--skip-package")

    rc = await asyncio.to_thread(_run, pipeline_flags, proj)
    return {
        "ok": rc == 0,
        "exit_code": rc,
        "status_file": str(proj / "Saved" / "ue5_pipeline_status.json"),
    }
