#!/usr/bin/env python3
"""Non-stop batch processor: ingest every SoccerNet game in index chunks.

Usage:
    SOCCERNET_PASSWORD="..." .venv/bin/python scripts/wc2026_vision/remote/run_all_soccernet.py \
        --instance-id 41598645 --chunk-size 5
"""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))
from SoccerNet.utils import getListGames  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("run_all_soccernet")


def run_batch(start: int, end: int, password: str, instance_id: int | None, frame_stride: int, chunk_size: int) -> int:
    cmd = [
        sys.executable,
        str(REPO_ROOT / "scripts" / "wc2026_vision" / "remote" / "batch_soccernet_runner.py"),
        "--start", str(start),
        "--end", str(end),
        "--soccernet-password", password,
        "--frame-stride", str(frame_stride),
        "--keep",
    ]
    if instance_id:
        cmd.extend(["--instance-id", str(instance_id)])
    LOG.info("Running batch %d-%d", start, end)
    r = subprocess.run(cmd, check=False)
    return r.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Process all SoccerNet games in chunks")
    parser.add_argument("--instance-id", type=int, default=None, help="Reuse existing instance")
    parser.add_argument("--chunk-size", type=int, default=5, help="Games per batch")
    parser.add_argument("--frame-stride", type=int, default=5)
    parser.add_argument("--password", default=os.environ.get("SOCCERNET_PASSWORD"), help="SoccerNet password (or set SOCCERNET_PASSWORD)")
    parser.add_argument("--max-games", type=int, default=None, help="Stop after N games (None = all)")
    parser.add_argument("--resume", type=int, default=0, help="Start at game index")
    args = parser.parse_args()

    if not args.password:
        LOG.error("Set --password or SOCCERNET_PASSWORD")
        return 1

    games = getListGames("all")
    total = args.max_games if args.max_games else len(games)
    start = args.resume
    instance_id = args.instance_id

    while start < total:
        end = min(start + args.chunk_size, total)
        rc = run_batch(start, end, args.password, instance_id, args.frame_stride, args.chunk_size)
        if rc != 0:
            LOG.error("Batch %d-%d failed", start, end)
            return rc
        instance_id = instance_id  # runner returns instance id? not currently; keep reusing if provided
        start = end
        if start < total:
            LOG.info("Batch complete. Next batch starts at %d/%d", start, total)

    LOG.info("All batches complete. %d games processed.", total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
