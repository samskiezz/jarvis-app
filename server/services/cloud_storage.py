"""Wasabi (S3-compatible) cloud storage access layer for JARVIS.

One seam the whole server uses to put/get/locate files in Wasabi, with:
  * auto-sorting by config/wasabi_storage.json rules (WHERE every file goes),
  * a local manifest (server/data/cloud_manifest.db) recording WHERE everything moved,
  * the Wasabi integrity gotcha handled (force MD5; AWS SDK v2's default CRC64NVME errors on Wasabi),
  * verify-after-upload (compare local MD5 to the object ETag).

Import-safe: if boto3 isn't installed or no WASABI_KEY/WASABI_SECRET is set, enabled() is False and every
call degrades gracefully — it can NEVER take the app down. Secrets come only from the environment
(.env.secrets: WASABI_KEY, WASABI_SECRET), never from the config file or code.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.path.join(ROOT, "config", "wasabi_storage.json")
MANIFEST = os.path.join(ROOT, "server", "data", "cloud_manifest.db")

_CFG = None
_CLIENT = None


def cfg() -> dict:
    global _CFG
    if _CFG is None:
        try:
            with open(CONFIG, encoding="utf-8") as fh:
                _CFG = json.load(fh)
        except Exception:  # noqa: BLE001
            _CFG = {}
    return _CFG


def enabled() -> bool:
    """True only if boto3 is importable AND credentials are present."""
    if not (os.environ.get("WASABI_KEY") and os.environ.get("WASABI_SECRET")):
        return False
    try:
        import boto3  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def _client():
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    import boto3
    from botocore.config import Config
    c = cfg()
    endpoint = os.environ.get("WASABI_ENDPOINT", c.get("endpoint", "https://s3.us-east-1.wasabisys.com"))
    region = os.environ.get("WASABI_REGION", c.get("region", "us-east-1"))
    # Force MD5 / avoid CRC64NVME which 400s on Wasabi. Newer botocore supports these knobs; older ignores them.
    kwargs = {"s3": {"addressing_style": "path"}, "signature_version": "s3v4",
              "retries": {"max_attempts": 5, "mode": "standard"}}
    try:
        conf = Config(request_checksum_calculation="when_required",
                      response_checksum_validation="when_required", **kwargs)
    except TypeError:  # older botocore without the checksum knobs
        conf = Config(**kwargs)
    _CLIENT = boto3.client("s3", endpoint_url=endpoint, region_name=region,
                           aws_access_key_id=os.environ["WASABI_KEY"],
                           aws_secret_access_key=os.environ["WASABI_SECRET"], config=conf)
    return _CLIENT


# ── manifest (the record of WHERE everything moved) ──────────────────────────
def _db():
    con = sqlite3.connect(MANIFEST, timeout=15)
    con.execute("""CREATE TABLE IF NOT EXISTS objects(
        original_path TEXT PRIMARY KEY, bucket TEXT, key TEXT, size INTEGER, md5 TEXT,
        status TEXT, migrated_at INTEGER)""")
    return con


def record(original_path: str, bucket: str, key: str, size: int, md5: str, status: str):
    con = _db()
    with con:
        con.execute("INSERT OR REPLACE INTO objects VALUES(?,?,?,?,?,?,?)",
                    (original_path, bucket, key, size, md5, status, int(time.time())))
    con.close()


def locate(original_path: str):
    """Where did this local path move to? Returns {bucket,key,status,...} or None."""
    con = _db()
    row = con.execute("SELECT bucket,key,size,md5,status,migrated_at FROM objects WHERE original_path=?",
                      (original_path,)).fetchone()
    con.close()
    if not row:
        return None
    return {"bucket": row[0], "key": row[1], "size": row[2], "md5": row[3],
            "status": row[4], "migrated_at": row[5]}


# ── classification (WHERE a file should go, per the sorting rules) ────────────
def _md5(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def classify(path: str) -> tuple:
    """Apply config sorting_rules → (bucket, key). First matching rule wins."""
    rel = os.path.relpath(os.path.abspath(path), ROOT)
    low = rel.lower()
    ext = os.path.splitext(low)[1]
    try:
        mt = time.localtime(os.path.getmtime(path))
    except Exception:  # noqa: BLE001
        mt = time.localtime()
    yyyy, mm = "%04d" % mt.tm_year, "%02d" % mt.tm_mon
    cat = "misc"
    if "underworldassets/" in low:
        try:
            cat = low.split("underworldassets/", 1)[1].split("/", 1)[0] or "misc"
        except Exception:  # noqa: BLE001
            cat = "misc"
    buckets = cfg().get("buckets", {})
    for rule in cfg().get("sorting_rules", {}).get("rules", []):
        w = rule.get("when", {})
        ok_ext = (not w.get("ext")) or ext in w.get("ext", [])
        ok_path = (not w.get("path_any")) or any(p in low for p in w.get("path_any", []))
        if ok_ext and ok_path:
            dest = rule["to"].replace("{yyyy}", yyyy).replace("{mm}", mm).replace("{cat}", cat)
            bkey, prefix = dest.split(":", 1)
            bucket = buckets.get(bkey, bkey)
            key = prefix + os.path.basename(rel)
            return bucket, key
    bucket = buckets.get("primary", "jarvis-store")
    return bucket, "misc/%s/%s/%s" % (yyyy, mm, os.path.basename(rel))


# ── upload / verify / ingest ─────────────────────────────────────────────────
def upload(path: str, verify: bool = True) -> dict:
    """Classify, upload (multipart for large files via boto3's transfer manager), verify MD5, record manifest.
    Returns {ok, bucket, key, md5, verified, error}."""
    if not enabled():
        return {"ok": False, "error": "cloud storage disabled (no boto3 or no WASABI keys)"}
    if not os.path.isfile(path):
        return {"ok": False, "error": "not a file: %s" % path}
    rel = os.path.relpath(os.path.abspath(path), ROOT)
    bucket, key = classify(path)
    try:
        from boto3.s3.transfer import TransferConfig
        ic = cfg().get("integrity", {})
        tc = TransferConfig(multipart_threshold=ic.get("multipart_threshold_mb", 64) * 1024 * 1024,
                            multipart_chunksize=ic.get("multipart_chunk_mb", 16) * 1024 * 1024)
        local_md5 = _md5(path)
        _client().upload_file(path, bucket, key, Config=tc)
        verified = None
        if verify:
            head = _client().head_object(Bucket=bucket, Key=key)
            etag = (head.get("ETag") or "").strip('"')
            verified = ("-" not in etag and etag == local_md5)  # multipart ETags aren't a plain md5
        record(rel, bucket, key, os.path.getsize(path), local_md5, "verified" if verified else "uploaded")
        return {"ok": True, "bucket": bucket, "key": key, "md5": local_md5, "verified": verified}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200], "bucket": bucket, "key": key}


def ingest(path: str) -> dict:
    """Auto-sort a NEW file as it enters the system (the 'rules when things enter' hook).
    Safe no-op when cloud storage is disabled."""
    if not enabled():
        return {"ok": False, "skipped": "cloud disabled"}
    return upload(path, verify=cfg().get("integrity", {}).get("verify_after_upload", True))


def presigned_url(original_path: str, expires: int = 3600):
    """A temporary download URL for something that moved to the cloud (or None)."""
    loc = locate(original_path)
    if not loc or not enabled():
        return None
    return presigned_url_for(loc["bucket"], loc["key"], expires)


def presigned_url_for(bucket: str, key: str, expires: int = 3600):
    """A temporary download URL for a known bucket/key (used by cloud-aware serving via .cloudref)."""
    if not enabled():
        return None
    try:
        return _client().generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires)
    except Exception:  # noqa: BLE001
        return None
