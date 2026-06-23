"""VPS-side runner: send SoccerNet/SportsMOT videos to a Vast.ai GPU box for hyper-fast ingestion."""
from __future__ import annotations

import argparse
import json
import logging
import os
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Any

# Make repo imports available.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))
from server.services import gpu_instances as gi  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("gpu_vision_runner")


def sh(cmd: list[str] | str, **kwargs) -> subprocess.CompletedProcess:
    LOG.info("$ %s", cmd if isinstance(cmd, str) else " ".join(cmd))
    return subprocess.run(cmd, shell=isinstance(cmd, str), check=False, text=True, capture_output=True, **kwargs)


def package_code() -> Path:
    """Tar the vision package + model weights so the GPU box can run standalone."""
    tmp = Path(tempfile.gettempdir()) / "wc2026_vision_code.tar.gz"
    pkg = REPO_ROOT / "scripts" / "wc2026_vision"
    model = REPO_ROOT / "server" / "data" / "vision_models" / "yolov8n.pt"
    with tarfile.open(tmp, "w:gz") as tf:
        tf.add(pkg, arcname="jarvis-app-1/scripts/wc2026_vision")
        if model.exists():
            tf.add(model, arcname="jarvis-app-1/server/data/vision_models/yolov8n.pt")
    LOG.info("Code package: %s (%.1f MB)", tmp, tmp.stat().st_size / 1e6)
    return tmp


def _ssh_endpoint(inst: dict) -> tuple[str, int]:
    """Prefer direct public IP; fall back to Vast proxy."""
    pub = inst.get("public_ipaddr")
    ports = inst.get("ports")
    m = ports.get("22/tcp") or ports.get("22") if isinstance(ports, dict) else None
    if pub and isinstance(m, list) and m and (m[0] or {}).get("HostPort"):
        return pub, int(m[0]["HostPort"])
    return inst.get("ssh_host"), int(inst.get("ssh_port") or 22)


def upload(instance_id: int, local: Path, remote_dir: str = "/workspace") -> dict[str, Any]:
    """scp a local file/directory to a remote path on a Vast instance with retry."""
    inst = next((i for i in (gi.list_instances().get("instances") or []) if i.get("id") == int(instance_id)), None)
    if not inst:
        return {"ok": False, "error": "instance not found"}
    host, port = _ssh_endpoint(inst)
    if not host or not port:
        return {"ok": False, "error": "instance has no SSH endpoint"}
    # Ensure remote dir exists.
    sh(["ssh", "-i", gi.SSH_KEY, "-p", str(port), "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=15",
        f"root@{host}", f"mkdir -p {remote_dir}"])
    remote = f"root@{host}:{remote_dir}"
    opts = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=4"]
    for attempt in range(3):
        r = sh(["scp", "-i", gi.SSH_KEY, "-P", str(port), "-r", *opts, str(local), remote])
        if r.returncode == 0:
            return {"ok": True, "stdout": r.stdout[-200:], "stderr": r.stderr[-200:]}
        LOG.warning("Upload attempt %d failed: %s", attempt + 1, r.stderr[-300:])
        time.sleep(5)
    return {"ok": False, "stdout": r.stdout[-500:], "stderr": r.stderr[-800:]}


def wait_ssh(instance_id: int, timeout: float = 300) -> dict[str, Any]:
    """Wait until an instance accepts SSH (prefer direct IP)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        inst = next((i for i in (gi.list_instances().get("instances") or []) if i.get("id") == int(instance_id)), None)
        if not inst:
            time.sleep(5)
            continue
        if "running" not in (inst.get("status") or ""):
            time.sleep(5)
            continue
        host, port = _ssh_endpoint(inst)
        if host and port:
            r = sh(["ssh", "-i", gi.SSH_KEY, "-p", str(port), "-o", "StrictHostKeyChecking=no",
                    "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=8",
                    f"root@{host}", "echo ready"])
            if r.returncode == 0:
                return {"ok": True, "host": host, "port": port}
        time.sleep(5)
    return {"ok": False, "error": f"SSH not ready within {timeout}s"}


def run_remote(instance_id: int, cmd: str, timeout: float = 3600) -> dict[str, Any]:
    inst = next((i for i in (gi.list_instances().get("instances") or []) if i.get("id") == int(instance_id)), None)
    if not inst:
        return {"ok": False, "error": "instance not found"}
    host, port = _ssh_endpoint(inst)
    if not host or not port:
        return {"ok": False, "error": "instance has no SSH endpoint"}
    r = sh(["ssh", "-i", gi.SSH_KEY, "-p", str(port),
            "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=10",
            f"root@{host}", cmd], timeout=timeout)
    return {"ok": r.returncode == 0, "stdout": r.stdout[-4000:], "stderr": r.stderr[-1500:], "code": r.returncode}


def build_specs(videos: list[Path], frame_stride: int, max_frames: int | None, remote_dir: str = "/workspace") -> list[dict]:
    specs = []
    for vp in videos:
        # Derive match_id from filename/directory.
        stem = vp.stem.replace(" ", "_").replace("-", "_")
        # Try to extract teams from path like .../Chelsea_1_-_1_Burnley/1_224p.mkv
        teams = ["home", "away"]
        parts = vp.parent.name.replace(" ", "_").split("_")
        if len(parts) >= 3 and "-" in parts:
            try:
                idx = parts.index("-")
                teams = ["_".join(parts[:idx]).replace("-", ""), "_".join(parts[idx + 1:]).replace("-", "")]
            except ValueError:
                pass
        specs.append({
            "video_path": f"{remote_dir}/videos/{vp.name}",
            "match_id": f"{stem}_{len(specs)}",
            "home": teams[0], "away": teams[1],
            "frame_stride": frame_stride,
            "max_frames": max_frames,
        })
    return specs


def discover_videos(paths: list[str]) -> list[Path]:
    videos: list[Path] = []
    for p in paths:
        pp = Path(p)
        if pp.is_dir():
            videos.extend(sorted(pp.rglob("*.mp4")))
            videos.extend(sorted(pp.rglob("*.mkv")))
        elif pp.exists():
            videos.append(pp)
    # Deduplicate by absolute path.
    seen = set()
    out = []
    for v in videos:
        key = v.resolve()
        if key not in seen:
            seen.add(key)
            out.append(v)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Run WC2026 vision ingestion on a Vast.ai GPU instance.")
    parser.add_argument("videos", nargs="+", help="video files or directories to ingest")
    parser.add_argument("--frame-stride", type=int, default=5, help="process every Nth frame (default 5 -> 5 fps from 25 fps)")
    parser.add_argument("--max-frames", type=int, default=None, help="cap frames per video for quick tests")
    parser.add_argument("--min-vram", type=float, default=12, help="minimum GPU VRAM in GB")
    parser.add_argument("--max-price", type=float, default=0.15, help="max $/hr")
    parser.add_argument("--gpu-name", type=str, default=None, help="require a specific GPU name (e.g. RTX 4090)")
    parser.add_argument("--disk-gb", type=int, default=80, help="instance disk size in GB")
    parser.add_argument("--keep", action="store_true", help="do not destroy the instance after processing")
    parser.add_argument("--instance-id", type=int, default=None, help="reuse an existing running instance instead of provisioning")
    parser.add_argument("--remote-dir", type=str, default="/workspace", help="remote work directory on the GPU box")
    args = parser.parse_args()

    videos = discover_videos(args.videos)
    if not videos:
        LOG.error("No videos found in %s", args.videos)
        return 1
    LOG.info("Videos to ingest: %d", len(videos))
    for v in videos:
        LOG.info("  %s (%.1f MB)", v, v.stat().st_size / 1e6)

    remote_dir = args.remote_dir.rstrip("/")

    # Build local staging dir with videos + specs.
    staging = Path(tempfile.mkdtemp(prefix="wc2026_gpu_"))
    video_dir = staging / "videos"
    video_dir.mkdir(parents=True, exist_ok=True)
    for v in videos:
        shutil.copy2(v, video_dir / v.name)
    specs = build_specs(videos, args.frame_stride, args.max_frames, remote_dir=remote_dir)
    (staging / "video_specs.json").write_text(json.dumps(specs, indent=2), encoding="utf-8")

    # Package and upload code.
    code_tar = package_code()

    if args.instance_id:
        instance_id = args.instance_id
        LOG.info("Reusing instance %d", instance_id)
    else:
        LOG.info("Provisioning GPU: ≥%.0fGB VRAM, ≤$%.2f/hr, disk=%dGB", args.min_vram, args.max_price, args.disk_gb)
        os.environ.setdefault("GPU_MAX_INSTANCES", "3")
        off = gi.cheapest_offer(gpu_name=args.gpu_name, max_price=args.max_price, min_vram_gb=args.min_vram)
        if not off.get("ok"):
            LOG.error("No GPU offer: %s", off.get("error"))
            return 1
        LOG.info("Offer: %s %.1fGB $%.3f/hr", off["offer"]["gpu"], off["offer"]["total_vram_gb"], off["offer"]["price"])
        created = gi.create_instance(off["offer"]["id"], image=os.environ.get("GPU_IMAGE", gi.DEFAULT_IMAGE),
                                     disk_gb=args.disk_gb, label="jarvis-vision", runtype="ssh_direct")
        if not created.get("ok"):
            LOG.error("Provision failed: %s", created.get("error"))
            return 1
        instance_id = created.get("id") or created.get("new_contract")
        LOG.info("Instance %s created", instance_id)

    try:
        LOG.info("Waiting for SSH on instance %s...", instance_id)
        ssh = wait_ssh(instance_id, timeout=300)
        if not ssh.get("ok"):
            LOG.error("SSH not ready: %s", ssh.get("error"))
            return 1
        LOG.info("SSH ready at %s:%s", ssh["host"], ssh["port"])

        LOG.info("Uploading code package to %s...", remote_dir)
        up = upload(instance_id, code_tar, remote_dir)
        if not up.get("ok"):
            LOG.error("Code upload failed: %s", up.get("stderr", up))
            return 1

        LOG.info("Uploading %d videos + specs to %s...", len(videos), remote_dir)
        up = upload(instance_id, staging, remote_dir)
        if not up.get("ok"):
            LOG.error("Video upload failed: %s", up.get("stderr", up))
            return 1

        LOG.info("Flattening staging directory on remote...")
        staging_name = staging.name
        r = run_remote(instance_id, f"cd {remote_dir} && rm -rf videos video_specs.json && mv {staging_name}/* . && rmdir {staging_name} && ls -la", timeout=30)
        if not r.get("ok"):
            LOG.error("Flatten failed: %s", r.get("stderr", r))
            return 1

        LOG.info("Extracting code package in %s...", remote_dir)
        tar_name = code_tar.name
        r = run_remote(instance_id, f"cd {remote_dir} && tar -xzf {tar_name} && ls -la jarvis-app-1/scripts/wc2026_vision/remote/", timeout=60)
        if not r.get("ok"):
            LOG.error("Extraction failed: %s", r.get("stderr", r))
            return 1

        LOG.info("Resetting remote results sentinel...")
        run_remote(instance_id, f"rm -f {remote_dir}/results/STATUS {remote_dir}/results/wc2026_tracking.db {remote_dir}/results/wc2026_tracking_features.json", timeout=30)

        LOG.info("Starting remote vision task in %s...", remote_dir)
        task_cmd = (
            f"mkdir -p {remote_dir}/results && "
            f"cd {remote_dir} && "
            f"export GPU_WORK_DIR={shlex.quote(remote_dir)} && "
            f"python3 {remote_dir}/jarvis-app-1/scripts/wc2026_vision/remote/task.py "
            f"> {remote_dir}/results/run.log 2>&1"
        )
        # setsid + full redirection so SSH returns immediately; the task keeps running on the box.
        r = run_remote(instance_id, f"setsid bash -c {shlex.quote(task_cmd)} > /dev/null 2>&1 </dev/null &", timeout=30)
        if not r.get("ok"):
            LOG.error("Failed to start task: %s", r.get("stderr", r))
            return 1

        # Poll for completion.
        LOG.info("Polling remote task...")
        deadline = time.time() + 7200
        while time.time() < deadline:
            time.sleep(15)
            r = run_remote(instance_id, f"cat {remote_dir}/results/STATUS 2>/dev/null || echo running", timeout=30)
            status = (r.get("stdout") or "").strip()
            LOG.info("  status: %s", status.splitlines()[0] if status else "running")
            if status.startswith("done"):
                break
            if status.startswith("failed"):
                LOG.error("Remote task failed: %s", status)
                return 1
        else:
            LOG.error("Remote task timed out")
            return 1

        LOG.info("Downloading results...")
        local_results = REPO_ROOT / "server" / "data" / "gpu_results" / str(instance_id)
        os.makedirs(local_results, exist_ok=True)
        r = gi.sync_results(instance_id, f"{remote_dir}/results")
        if not r.get("ok"):
            LOG.error("Result download failed: %s", r.get("stderr", r))
            return 1

        # Merge results into the live DB/JSON if present.
        src_db = Path(r["dest"]) / "wc2026_tracking.db"
        src_json = Path(r["dest"]) / "wc2026_tracking_features.json"
        dst_db = REPO_ROOT / "server" / "data" / "wc2026_tracking.db"
        dst_json = REPO_ROOT / "server" / "data" / "wc2026_tracking_features.json"
        if src_db.exists():
            if dst_db.exists():
                merge_sqlite(src_db, dst_db)
            else:
                shutil.copy2(src_db, dst_db)
        if src_json.exists():
            shutil.copy2(src_json, dst_json)

        LOG.info("Done. Results in %s", r["dest"])
        return 0
    finally:
        if not args.keep:
            LOG.info("Destroying instance %s...", instance_id)
            gi.safe_dispose(instance_id, force=False)
        else:
            LOG.info("Keeping instance %s alive", instance_id)


def merge_sqlite(src: Path, dst: Path) -> None:
    """Merge rows from a remote SQLite DB into the local one."""
    import sqlite3
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(dst))
    try:
        for row in src_conn.execute("SELECT * FROM matches"):
            dst_conn.execute(
                "INSERT OR REPLACE INTO matches VALUES (?,?,?,?,?,?,?,?,?,?)", row
            )
        for row in src_conn.execute("SELECT * FROM frame_tracks"):
            dst_conn.execute(
                "INSERT OR REPLACE INTO frame_tracks (match_id, frame_idx, timestamp, player_id, team, x, y) VALUES (?,?,?,?,?,?,?)", row
            )
        dst_conn.commit()
    finally:
        src_conn.close()
        dst_conn.close()


if __name__ == "__main__":
    sys.exit(main())
