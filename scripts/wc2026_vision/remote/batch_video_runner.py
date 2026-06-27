#!/usr/bin/env python3
"""VPS-side batch runner: send a list of local MP4s to a Vast.ai GPU box.

Usage:
    .venv/bin/python scripts/wc2026_vision/remote/batch_video_runner.py \
        --instance-id 41281336 \
        --specs /path/to/batch_specs.json \
        --video-dir /path/to/videos \
        --frame-stride 5

batch_specs.json example:
    [
      {"match_id": "sportsmot_v_xxx", "video": "v_xxx.mp4", "home": "A", "away": "B"},
      ...
    ]
"""
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

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))
from server.services import gpu_instances as gi  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("batch_video_runner")


def sh(cmd: list[str] | str, **kwargs) -> subprocess.CompletedProcess:
    LOG.info("$ %s", cmd if isinstance(cmd, str) else " ".join(cmd))
    return subprocess.run(cmd, shell=isinstance(cmd, str), check=False, text=True, capture_output=True, **kwargs)


def package_code() -> Path:
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
    pub = inst.get("public_ipaddr")
    ports = inst.get("ports")
    m = ports.get("22/tcp") or ports.get("22") if isinstance(ports, dict) else None
    if pub and isinstance(m, list) and m and (m[0] or {}).get("HostPort"):
        return pub, int(m[0]["HostPort"])
    return inst.get("ssh_host"), int(inst.get("ssh_port") or 22)


def wait_ssh(instance_id: int, timeout: float = 300) -> dict[str, Any]:
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


def upload(instance_id: int, local: Path, remote_dir: str = "/workspace") -> dict[str, Any]:
    inst = next((i for i in (gi.list_instances().get("instances") or []) if i.get("id") == int(instance_id)), None)
    if not inst:
        return {"ok": False, "error": "instance not found"}
    host, port = _ssh_endpoint(inst)
    if not host or not port:
        return {"ok": False, "error": "instance has no SSH endpoint"}
    sh(["ssh", "-i", gi.SSH_KEY, "-p", str(port), "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=15",
        f"root@{host}", f"mkdir -p {remote_dir}"])
    remote = f"root@{host}:{remote_dir}"
    opts = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=4"]
    for attempt in range(3):
        r = sh(["scp", "-i", gi.SSH_KEY, "-P", str(port), "-r", *opts, str(local), remote])
        if r.returncode == 0:
            return {"ok": True}
        LOG.warning("Upload attempt %d failed: %s", attempt + 1, r.stderr[-300:])
        time.sleep(5)
    return {"ok": False, "stderr": r.stderr[-800:]}


def merge_sqlite(src: Path, dst: Path) -> None:
    import sqlite3
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(dst))
    try:
        for row in src_conn.execute("SELECT * FROM matches"):
            dst_conn.execute("INSERT OR REPLACE INTO matches VALUES (?,?,?,?,?,?,?,?,?,?)", row)
        for row in src_conn.execute("SELECT * FROM frame_tracks"):
            dst_conn.execute("INSERT OR REPLACE INTO frame_tracks (match_id, frame_idx, timestamp, player_id, team, x, y) VALUES (?,?,?,?,?,?,?)", row)
        dst_conn.commit()
    finally:
        src_conn.close()
        dst_conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-process local MP4s on a remote GPU.")
    parser.add_argument("--instance-id", type=int, default=None, help="Reuse an existing instance")
    parser.add_argument("--specs", required=True, help="Path to batch_specs.json")
    parser.add_argument("--video-dir", required=True, help="Directory containing MP4s referenced in specs")
    parser.add_argument("--frame-stride", type=int, default=5)
    parser.add_argument("--max-frames", type=int, default=None)
    parser.add_argument("--min-vram", type=float, default=12)
    parser.add_argument("--max-price", type=float, default=0.15)
    parser.add_argument("--gpu-name", type=str, default=None)
    parser.add_argument("--disk-gb", type=int, default=80)
    parser.add_argument("--label", type=str, default="jarvis-vision-batch", help="Vast instance label")
    parser.add_argument("--keep", action="store_true", help="Keep instance alive")
    parser.add_argument("--remote-dir", type=str, default="/workspace")
    args = parser.parse_args()

    specs_path = Path(args.specs)
    video_dir = Path(args.video_dir)
    if not specs_path.exists():
        LOG.error("Specs file not found: %s", specs_path)
        return 1
    raw_specs = json.loads(specs_path.read_text(encoding="utf-8"))
    if not raw_specs:
        LOG.error("No videos in specs")
        return 1

    # Resolve video paths and build specs for worker.
    worker_specs = []
    for item in raw_specs:
        vid = item["video"]
        local = video_dir / vid if not Path(vid).is_absolute() else Path(vid)
        if not local.exists():
            LOG.error("Missing video: %s", local)
            return 1
        worker_specs.append({
            "video": vid,
            "match_id": item["match_id"],
            "home": item.get("home", "Home"),
            "away": item.get("away", "Away"),
        })

    remote_dir = args.remote_dir.rstrip("/")
    full_specs = {
        "videos": worker_specs,
        "frame_stride": args.frame_stride,
        "max_frames": args.max_frames,
    }
    staging = Path(tempfile.mkdtemp(prefix="wc2026_video_batch_"))
    (staging / "batch_specs.json").write_text(json.dumps(full_specs, indent=2), encoding="utf-8")
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
        created = gi.create_instance(off["offer"]["id"], image=os.environ.get("GPU_IMAGE", gi.DEFAULT_IMAGE),
                                     disk_gb=args.disk_gb, label=args.label, runtype="ssh_direct")
        if not created.get("ok"):
            LOG.error("Provision failed: %s", created.get("error"))
            return 1
        instance_id = created.get("id") or created.get("new_contract")

    try:
        ssh = wait_ssh(instance_id, timeout=300)
        if not ssh.get("ok"):
            LOG.error("SSH not ready: %s", ssh.get("error"))
            return 1
        LOG.info("SSH ready at %s:%s", ssh["host"], ssh["port"])

        LOG.info("Uploading code package...")
        up = upload(instance_id, code_tar, remote_dir)
        if not up.get("ok"):
            LOG.error("Code upload failed: %s", up.get("stderr", up))
            return 1

        LOG.info("Uploading batch specs...")
        up = upload(instance_id, staging, remote_dir)
        if not up.get("ok"):
            LOG.error("Specs upload failed: %s", up.get("stderr", up))
            return 1

        staging_name = staging.name
        r = run_remote(instance_id, f"cd {remote_dir} && rm -f batch_specs.json && mv {staging_name}/batch_specs.json . && rmdir {staging_name} && tar -xzf {code_tar.name}", timeout=60)
        if not r.get("ok"):
            LOG.error("Setup failed: %s", r.get("stderr", r))
            return 1

        LOG.info("Uploading %d MP4s...", len(worker_specs))
        sh(["ssh", "-i", gi.SSH_KEY, "-p", str(ssh["port"]), "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null", f"root@{ssh['host']}", f"mkdir -p {remote_dir}/videos"])
        for item in worker_specs:
            local_mp4 = video_dir / item["video"]
            up = upload(instance_id, local_mp4, f"{remote_dir}/videos")
            if not up.get("ok"):
                LOG.error("Failed to upload %s: %s", local_mp4, up.get("stderr", up))
                return 1

        run_remote(instance_id, f"rm -f {remote_dir}/results/STATUS {remote_dir}/results/wc2026_tracking.db {remote_dir}/results/wc2026_tracking_features.json", timeout=30)

        task_cmd = (
            f"mkdir -p {remote_dir}/results && "
            f"cd {remote_dir} && "
            f"export GPU_WORK_DIR={shlex.quote(remote_dir)} && "
            f"export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu && "
            f"export PYTHONPATH={shlex.quote(os.path.join(remote_dir, 'pylibs'))} && "
            f"python3 {remote_dir}/jarvis-app-1/scripts/wc2026_vision/remote/batch_video_task.py "
            f"> {remote_dir}/results/run.log 2>&1"
        )
        r = run_remote(instance_id, f"setsid bash -c {shlex.quote(task_cmd)} > /dev/null 2>&1 </dev/null &", timeout=30)
        if not r.get("ok"):
            LOG.error("Failed to start task: %s", r.get("stderr", r))
            return 1

        LOG.info("Polling remote batch task...")
        deadline = time.time() + 14400
        while time.time() < deadline:
            time.sleep(30)
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

        local_results = REPO_ROOT / "server" / "data" / "gpu_results" / str(instance_id)
        os.makedirs(local_results, exist_ok=True)
        r = gi.sync_results(instance_id, f"{remote_dir}/results")
        if not r.get("ok"):
            LOG.error("Result download failed: %s", r.get("stderr", r))
            return 1

        src_db = Path(r["dest"]) / "wc2026_tracking.db"
        src_json = Path(r["dest"]) / "wc2026_tracking_features.json"
        dst_db = REPO_ROOT / "server" / "data" / "wc2026_tracking.db"
        dst_json = REPO_ROOT / "server" / "data" / "wc2026_tracking_features.json"
        if src_db.exists():
            if dst_db.exists():
                merge_sqlite(src_db, dst_db)
            else:
                shutil.copy2(src_db, dst_db)
            LOG.info("Merged tracking DB")
        if src_json.exists():
            shutil.copy2(src_json, dst_json)
            LOG.info("Updated tracking features JSON")

        summary_path = Path(r["dest"]) / "batch_summary.json"
        if summary_path.exists():
            LOG.info("Batch summary: %s", summary_path.read_text(encoding="utf-8"))

        LOG.info("Done. Results in %s", r["dest"])
        return 0
    finally:
        if not args.keep:
            LOG.info("Destroying instance %s...", instance_id)
            gi.safe_dispose(instance_id, force=False)
        else:
            LOG.info("Keeping instance %s alive", instance_id)


if __name__ == "__main__":
    sys.exit(main())
