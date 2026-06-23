#!/usr/bin/env python3
"""WC2026 Wasabi backup — syncs prediction artefacts to s3://jarvis-wc2026/snapshots/<ts>/

Reads WASABI_KEY / WASABI_SECRET from /opt/jarvis-app-1/.env.secrets.
Cron-runnable: tolerates missing files, network errors, and missing bucket
(creates bucket on first run). Logs to /var/log/wc2026_wasabi.log when run
under cron, or stdout otherwise.
"""

from __future__ import annotations

import glob
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import boto3
    from botocore.exceptions import ClientError, EndpointConnectionError
except ImportError:
    sys.stderr.write("boto3 not available; install with: .venv/bin/pip install boto3\n")
    sys.exit(0)  # cron-tolerant: exit clean

REPO_ROOT = Path("/opt/jarvis-app-1")
DATA_DIR = REPO_ROOT / "server" / "data"
ENV_SECRETS = REPO_ROOT / ".env.secrets"
BUCKET = "jarvis-wc2026"
ENDPOINT = "https://s3.wasabisys.com"
REGION = "us-east-1"  # Wasabi default region for s3.wasabisys.com

logger = logging.getLogger("wc2026_wasabi")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)


def load_secrets() -> tuple[str | None, str | None]:
    """Read WASABI_KEY/WASABI_SECRET from .env.secrets without exposing values."""
    if not ENV_SECRETS.exists():
        logger.error("missing %s", ENV_SECRETS)
        return None, None
    key = secret = None
    try:
        for raw in ENV_SECRETS.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k == "WASABI_KEY":
                key = v
            elif k == "WASABI_SECRET":
                secret = v
    except OSError as e:
        logger.error("failed to read .env.secrets: %s", e)
        return None, None
    return key, secret


def make_client(key: str, secret: str):
    return boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name=REGION,
    )


def ensure_bucket(client) -> bool:
    """Return True if bucket exists or was created."""
    try:
        client.head_bucket(Bucket=BUCKET)
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            logger.error("head_bucket failed: %s", e)
            return False
    except EndpointConnectionError as e:
        logger.error("wasabi endpoint unreachable: %s", e)
        return False

    try:
        client.create_bucket(Bucket=BUCKET)
        logger.info("created bucket %s", BUCKET)
        return True
    except ClientError as e:
        # Race / already-owned tolerated
        code = e.response.get("Error", {}).get("Code", "")
        if code in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            return True
        logger.error("create_bucket failed: %s", e)
        return False


def gather_files() -> list[Path]:
    """All wc2026_*.json / *.csv / *.db files under server/data/."""
    patterns = ["wc2026_*.json", "wc2026_*.csv", "wc2026_*.db"]
    found: list[Path] = []
    for pat in patterns:
        for p in glob.glob(str(DATA_DIR / pat)):
            path = Path(p)
            if path.is_file():
                found.append(path)
    return sorted(set(found))


def upload(client, files: list[Path], snapshot_prefix: str) -> tuple[int, int]:
    ok = fail = 0
    for f in files:
        key = f"snapshots/{snapshot_prefix}/{f.name}"
        try:
            client.upload_file(str(f), BUCKET, key)
            logger.info("uploaded %s -> s3://%s/%s (%d bytes)", f.name, BUCKET, key, f.stat().st_size)
            ok += 1
        except (ClientError, EndpointConnectionError, OSError) as e:
            logger.error("upload failed for %s: %s", f.name, e)
            fail += 1
    return ok, fail


def main() -> int:
    key, secret = load_secrets()
    if not key or not secret:
        logger.error("missing WASABI_KEY/WASABI_SECRET; aborting (clean exit)")
        return 0  # cron-tolerant

    try:
        client = make_client(key, secret)
    except Exception as e:  # pragma: no cover - defensive
        logger.error("boto3 client init failed: %s", e)
        return 0

    if not ensure_bucket(client):
        logger.error("bucket unavailable; aborting (clean exit)")
        return 0

    files = gather_files()
    if not files:
        logger.warning("no wc2026 files to upload")
        return 0

    snapshot = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    ok, fail = upload(client, files, snapshot)
    logger.info("snapshot %s complete: %d ok, %d failed", snapshot, ok, fail)
    return 0


if __name__ == "__main__":
    sys.exit(main())
