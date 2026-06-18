#!/usr/bin/env python3
"""Burst launcher — one-shot CLI wrapper around gpu_instances.launch_disposable.

Usage:
    python3 scripts/burst_launcher.py "fine-tune llama-70b on /workspace/data"
    python3 scripts/burst_launcher.py --gpu-name 'RTX A6000' --max-price 0.40 "train 32B"
    python3 scripts/burst_launcher.py --label kgik-fine-tune --image pytorch/pytorch:2.4.1 "..."

Defaults match `launch_disposable`: auto-sizes VRAM from the task description via
`estimate_task_vram`; picks the cheapest matching GPU; the box's onstart writes
results into /workspace and the burst-watcher polls /workspace/.done to auto-dispose.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

JOBS_PATH = os.path.join(ROOT, "server", "data", "burst_jobs.jsonl")


def _log_job(rec: dict):
    rec.setdefault("ts", time.time())
    try:
        with open(JOBS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
    except Exception:
        pass


def main():
    ap = argparse.ArgumentParser(description="Burst-launch a disposable GPU task")
    ap.add_argument("task", nargs="+", help="natural-language task description (used to size VRAM)")
    ap.add_argument("--gpu-name", default=None, help="force a specific GPU name (e.g. 'RTX A6000')")
    ap.add_argument("--max-price", type=float, default=None, help="max $/hr (default: env GPU_MAX_PRICE)")
    ap.add_argument("--image", default=None, help="Docker image (default: pytorch/pytorch:2.4.1)")
    ap.add_argument("--label", default="jarvis-burst", help="instance label (default: jarvis-burst)")
    args = ap.parse_args()

    task_cmd = " ".join(args.task).strip()
    if not task_cmd:
        print("error: empty task", file=sys.stderr); return 2

    from server.services import gpu_instances as gi  # type: ignore

    print(f"launching burst → task={task_cmd!r} gpu={args.gpu_name} max_price={args.max_price} "
          f"label={args.label}")
    r = gi.launch_disposable(task_cmd, gpu_name=args.gpu_name, max_price=args.max_price,
                             image=args.image, label=args.label)
    print(json.dumps(r, indent=2))
    _log_job({"event": "launch", "task": task_cmd, "gpu_name": args.gpu_name,
              "max_price": args.max_price, "label": args.label, "result": r})
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
