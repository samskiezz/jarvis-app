#!/usr/bin/env python3
"""One-time Wasabi bucket setup from config/wasabi_storage.json.

Creates the two buckets, enables versioning, turns Object Lock ON for the vault (must be done at creation —
cannot be added later), and applies the prefix lifecycle policy. Idempotent: skips what already exists.
Loads WASABI_KEY/WASABI_SECRET from the environment (source .env.secrets first). Prints no secrets.

Usage:  set -a; . ./.env.secrets; set +a; python3 scripts/wasabi_setup.py
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from server.services import cloud_storage as cs  # noqa: E402


def _create_bucket(cl, name: str, region: str, object_lock: bool):
    existing = [b["Name"] for b in cl.list_buckets().get("Buckets", [])]
    if name in existing:
        print("  bucket exists: %s" % name)
        return
    kwargs = {"Bucket": name}
    if region and region != "us-east-1":
        kwargs["CreateBucketConfiguration"] = {"LocationConstraint": region}
    if object_lock:
        kwargs["ObjectLockEnabledForBucket"] = True
    cl.create_bucket(**kwargs)
    print("  created bucket: %s%s" % (name, " (Object Lock ON)" if object_lock else ""))


def _enable_versioning(cl, name: str):
    cl.put_bucket_versioning(Bucket=name, VersioningConfiguration={"Status": "Enabled"})
    print("  versioning enabled: %s" % name)


def _apply_lifecycle(cl, name: str, lifecycle: dict):
    rules = []
    for r in lifecycle.get("rules", []):
        rule = {"ID": (r["prefix"].strip("/") or "root") + "-lc",
                "Filter": {"Prefix": r["prefix"]}, "Status": "Enabled"}
        if r.get("expire_days"):
            rule["Expiration"] = {"Days": int(r["expire_days"])}
        if r.get("noncurrent_version_expire_days"):
            rule["NoncurrentVersionExpiration"] = {"NoncurrentDays": int(r["noncurrent_version_expire_days"])}
        rules.append(rule)
    if not rules:
        return
    cl.put_bucket_lifecycle_configuration(Bucket=name, LifecycleConfiguration={"Rules": rules})
    print("  lifecycle applied to %s: %d rules" % (name, len(rules)))


def main():
    if not cs.enabled():
        print("ERROR: cloud disabled — `set -a; . ./.env.secrets; set +a` first (need WASABI_KEY/SECRET).")
        sys.exit(1)
    c = cs.cfg()
    region = os.environ.get("WASABI_REGION", c.get("region", "us-east-1"))
    buckets = c.get("buckets", {})
    primary, vault = buckets.get("primary", "jarvis-store"), buckets.get("immutable", "jarvis-vault")
    cl = cs._client()
    print("== Wasabi setup (region %s, endpoint %s) ==" % (region, c.get("endpoint")))
    _create_bucket(cl, primary, region, object_lock=False)
    _enable_versioning(cl, primary)
    _apply_lifecycle(cl, primary, c.get("lifecycle", {}))
    _create_bucket(cl, vault, region, object_lock=True)   # immutable bucket — object lock at creation
    _enable_versioning(cl, vault)
    print("== setup complete ==")
    print("  buckets now:", [b["Name"] for b in cl.list_buckets().get("Buckets", [])])


if __name__ == "__main__":
    main()
