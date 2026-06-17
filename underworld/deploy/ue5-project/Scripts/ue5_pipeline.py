#!/usr/bin/env python3
"""ue5_pipeline.py — one-shot, resumable UE5 Underworld build pipeline.

Turns the raw Higgsfield media + GLB source tree into a packaged, Pixel-Streaming-ready
UE5 build with no manual Editor clicking.  Each step is idempotent and writes a JSON
status file so the process can resume after interruption.

Steps
-----
0. validate       -> validate_ue5_prep.py
1. manifest       -> gen_manifest.py (headless)
2. import_glbs    -> chunked Editor commandlet (memory-safe, auto-restart per chunk)
3. stage_media    -> stage_higgsfield_media.py (headless)
4. materials      -> make_underworld_materials.py (Editor commandlet)
5. import_media   -> import_higgsfield_media.py (Editor commandlet)
6. level          -> make_underworld_level.py (Editor commandlet)
7. package        -> package_underworld.sh

Usage
-----
# Full build (run as root; drops to ueuser for the Editor automatically):
python3 Scripts/ue5_pipeline.py

# Quick scene refresh: re-stage + re-import media, skip GLB import & package:
python3 Scripts/ue5_pipeline.py --media-only

# Custom paths:
UW_UE_ROOT=/opt/UnrealEngine python3 Scripts/ue5_pipeline.py --project-dir /opt/jarvis-app-1/underworld/deploy/ue5-project --chunk-size 20
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
PROJ_DEFAULT = HERE.parent
UE_ROOT_DEFAULT = "/opt/UnrealEngine"
STATUS_DEFAULT = PROJ_DEFAULT / "Saved" / "ue5_pipeline_status.json"


def _log(msg: str) -> None:
    print(f"[ue5-pipeline] {msg}", flush=True)


def _run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> int:
    """Run a subprocess and stream stdout/stderr. Returns exit code."""
    _log("$ " + " ".join(cmd))
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd or PROJ_DEFAULT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line, end="")
    return proc.wait()


def _run_as_ueuser(shell_cmd: str, *, cwd: Path | None = None) -> int:
    """Run a shell command as the ueuser account. If already ueuser, run directly."""
    if os.getuid() == 0:
        # root -> switch to ueuser without password prompt
        return _run(["su", "-", "ueuser", "-c", shell_cmd], cwd=cwd)
    current = os.environ.get("USER", "")
    if current == "ueuser":
        return _run(["/bin/bash", "-c", shell_cmd], cwd=cwd)
    # Fallback: hope the current user can launch the Editor (not recommended as root)
    _log(f"WARNING: running Editor as {current}; UE5 Editor refuses root")
    return _run(["/bin/bash", "-c", shell_cmd], cwd=cwd)


def _editor_cmdlet(script: Path, *, project: Path, ue_root: Path, extra_env: dict[str, str] | None = None) -> str:
    """Return the shell command string for an Editor Python commandlet."""
    editor = ue_root / "Engine" / "Binaries" / "Linux" / "UnrealEditor-Cmd"
    env = ""
    if extra_env:
        env = " ".join(f"{k}={v!r}" for k, v in extra_env.items()) + " "
    return (
        f"{env}'{editor}' '{project}/Underworld.uproject' "
        f"-run=pythonscript -script='{script}' -unattended -nullrhi -stdout"
    )


def _load_status(path: Path) -> dict[str, Any]:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    return {"step": None, "completed_steps": []}


def _save_status(path: Path, status: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(status, indent=2), encoding="utf-8")


def _step_done(status: dict[str, Any], name: str) -> bool:
    return name in status.get("completed_steps", [])


def _mark_done(status: dict[str, Any], name: str) -> None:
    status["step"] = name
    if name not in status.get("completed_steps", []):
        status.setdefault("completed_steps", []).append(name)


def step_validate(args: argparse.Namespace, status: dict[str, Any]) -> int:
    script = HERE / "validate_ue5_prep.py"
    rc = _run([sys.executable, str(script)], cwd=args.project_dir)
    if rc != 0:
        _log("validate failed")
        return rc
    _mark_done(status, "validate")
    return 0


def step_manifest(args: argparse.Namespace, status: dict[str, Any]) -> int:
    script = HERE / "gen_manifest.py"
    env = os.environ.copy()
    env["UW_GLB_ROOT"] = args.glb_root
    rc = _run([sys.executable, str(script)], cwd=args.project_dir, env=env)
    if rc != 0:
        return rc
    _mark_done(status, "manifest")
    return 0


def _glb_progress(project_dir: Path) -> tuple[int, int, int]:
    """Return (total, imported, first_missing_index) from the manifest and Content tree."""
    manifest_path = project_dir / "Content" / "UnderworldAssets" / "manifest.json"
    if not manifest_path.exists():
        return 0, 0, 0
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    items = list(data.get("by_url", {}).items())
    total = len(items)
    imported = 0
    first_missing = total
    for idx, (_, gpath) in enumerate(items):
        rel = gpath[len("/Game/"):] + ".uasset"
        if (project_dir / "Content" / rel).exists():
            imported += 1
        elif first_missing == total:
            first_missing = idx
    return total, imported, first_missing


def step_import_glbs(args: argparse.Namespace, status: dict[str, Any]) -> int:
    total, imported, first_missing = _glb_progress(args.project_dir)
    if total == 0:
        _log("no GLB manifest; generating first")
        rc = step_manifest(args, status)
        if rc != 0:
            return rc
        total, imported, first_missing = _glb_progress(args.project_dir)

    _log(f"GLBs: {imported}/{total} already imported, {total - imported} remaining")
    if imported >= total:
        _mark_done(status, "import_glbs")
        return 0

    script = HERE / "import_glbs.py"
    chunk_size = args.chunk_size
    failed_chunks = 0

    for offset in range(first_missing, total, chunk_size):
        _log(f"GLB chunk offset={offset} size={chunk_size}")
        env = {"UW_CHUNK_SIZE": str(chunk_size), "UW_CHUNK_OFFSET": str(offset)}
        cmd = _editor_cmdlet(
            script,
            project=args.project_dir,
            ue_root=args.ue_root,
            extra_env=env,
        )
        rc = _run_as_ueuser(cmd, cwd=args.project_dir)
        if rc == 137:
            _log("OOM kill (exit 137). Halting — re-run with --chunk-size smaller.")
            return rc
        if rc != 0:
            _log(f"chunk offset={offset} exited {rc}; continuing")
            failed_chunks += 1
        # Refresh progress and status after each chunk
        total, imported, _ = _glb_progress(args.project_dir)
        status["glb_imported"] = imported
        status["glb_total"] = total
        _save_status(args.status_file, status)

    if failed_chunks:
        _log(f"{failed_chunks} chunks had errors; review logs above")
    _mark_done(status, "import_glbs")
    return 0


def step_stage_media(args: argparse.Namespace, status: dict[str, Any]) -> int:
    script = HERE / "stage_higgsfield_media.py"
    rc = _run([sys.executable, str(script)], cwd=args.project_dir)
    if rc != 0:
        return rc
    _mark_done(status, "stage_media")
    return 0


def step_materials(args: argparse.Namespace, status: dict[str, Any]) -> int:
    cmd = _editor_cmdlet(
        HERE / "make_underworld_materials.py",
        project=args.project_dir,
        ue_root=args.ue_root,
    )
    rc = _run_as_ueuser(cmd, cwd=args.project_dir)
    if rc != 0:
        return rc
    _mark_done(status, "materials")
    return 0


def step_import_media(args: argparse.Namespace, status: dict[str, Any]) -> int:
    cmd = _editor_cmdlet(
        HERE / "import_higgsfield_media.py",
        project=args.project_dir,
        ue_root=args.ue_root,
    )
    rc = _run_as_ueuser(cmd, cwd=args.project_dir)
    if rc != 0:
        return rc
    _mark_done(status, "import_media")
    return 0


def step_level(args: argparse.Namespace, status: dict[str, Any]) -> int:
    cmd = _editor_cmdlet(
        HERE / "make_underworld_level.py",
        project=args.project_dir,
        ue_root=args.ue_root,
    )
    rc = _run_as_ueuser(cmd, cwd=args.project_dir)
    if rc != 0:
        return rc
    _mark_done(status, "level")
    return 0


def step_package(args: argparse.Namespace, status: dict[str, Any]) -> int:
    script = HERE / "package_underworld.sh"
    env = os.environ.copy()
    env["UE_ROOT"] = str(args.ue_root)
    env["ARCHIVE"] = str(args.archive_dir)
    rc = _run(["/bin/bash", str(script)], cwd=args.project_dir, env=env)
    if rc != 0:
        return rc
    _mark_done(status, "package")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="UE5 Underworld build pipeline")
    parser.add_argument("--project-dir", type=Path, default=Path(os.environ.get("UW_PROJ", PROJ_DEFAULT)))
    parser.add_argument("--ue-root", type=Path, default=Path(os.environ.get("UW_UE_ROOT", UE_ROOT_DEFAULT)))
    parser.add_argument("--glb-root", default=os.environ.get("UW_GLB_ROOT", "/opt/jarvis-app-1/underworld/web/public/models"))
    parser.add_argument("--chunk-size", type=int, default=int(os.environ.get("UW_CHUNK_SIZE", "30")))
    parser.add_argument("--archive-dir", type=Path, default=Path(os.environ.get("UW_ARCHIVE", PROJ_DEFAULT / ".." / "pixelstream" / "game")))
    parser.add_argument("--status-file", type=Path, default=Path(os.environ.get("UW_STATUS", STATUS_DEFAULT)))
    parser.add_argument("--skip-validate", action="store_true")
    parser.add_argument("--skip-glbs", action="store_true", help="skip GLB import (media-only refreshes)")
    parser.add_argument("--skip-media", action="store_true", help="skip Higgsfield media staging/import")
    parser.add_argument("--skip-package", action="store_true")
    parser.add_argument("--media-only", action="store_true", help="stage/import media only, skip GLBs/level/package")
    parser.add_argument("--from-step", default=None, help="resume from this step name")
    args = parser.parse_args()

    if args.media_only:
        args.skip_glbs = True
        args.skip_package = True

    status = _load_status(args.status_file)
    _save_status(args.status_file, status)

    step_order = [
        ("validate", step_validate, args.skip_validate),
        ("manifest", step_manifest, False),
        ("import_glbs", step_import_glbs, args.skip_glbs),
        ("stage_media", step_stage_media, args.skip_media),
        ("materials", step_materials, args.skip_media),
        ("import_media", step_import_media, args.skip_media),
        ("level", step_level, args.media_only),  # skip level on media-only refresh
        ("package", step_package, args.skip_package),
    ]

    found = args.from_step is None
    for name, func, skipped in step_order:
        if args.from_step and not found:
            if name == args.from_step:
                found = True
            else:
                _log(f"skipping {name} (before --from-step)")
                continue
        if skipped:
            _log(f"skipping {name} (flagged)")
            continue
        if _step_done(status, name):
            _log(f"skipping {name} (already completed)")
            continue
        _log(f"=== step: {name} ===")
        rc = func(args, status)
        status["last_rc"] = rc
        _save_status(args.status_file, status)
        if rc != 0 and name != "import_glbs":
            _log(f"step {name} failed with exit {rc}; pipeline halted")
            return rc
        _mark_done(status, name)
        _save_status(args.status_file, status)

    _log("pipeline complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
