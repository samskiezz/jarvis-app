#!/usr/bin/env python3
"""SAFE migration of cold/archival data to Wasabi — sorts everything per the taxonomy BEFORE moving it.

Reads config/wasabi_storage.json (migration.include / exclude + sorting rules). For each eligible file it
classifies the destination, uploads via server/services/cloud_storage.py (MD5-verified + recorded in the
manifest so the system always knows where things moved), then applies the configured after_verify policy.

DRY-RUN BY DEFAULT: with no flags it only PRINTS the plan (what would move where, totals). Nothing leaves
the box until you pass --apply. Live UE5 project files, live DBs, code, secrets and the engine are excluded
by config and never touched. Resumable: files already 'verified' in the manifest are skipped.

Usage:
  python3 scripts/migrate_to_wasabi.py                 # dry-run plan (default)
  python3 scripts/migrate_to_wasabi.py --apply         # actually upload + verify + manifest
  python3 scripts/migrate_to_wasabi.py --apply --prune # + apply after_verify policy (pointer/delete) per config
  python3 scripts/migrate_to_wasabi.py --include underworld/data/media_assets   # limit to one dir
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from server.services import cloud_storage as cs  # noqa: E402


def _excluded(rel: str, excludes: list) -> bool:
    low = rel.lower()
    for pat in excludes:
        p = pat.lower().strip("/")
        if p.startswith("/"):                       # absolute path exclude (e.g. /opt/UnrealEngine)
            if os.path.abspath(os.path.join(ROOT, rel)).lower().startswith(pat.lower()):
                return True
        elif p.replace("*", "") in low:             # simple substring/glob-ish
            return True
    return False


def _walk(include: list, excludes: list):
    for inc in include:
        base = os.path.join(ROOT, inc)
        if os.path.isfile(base):
            yield base
            continue
        for dirpath, dirnames, files in os.walk(base):
            rel_dir = os.path.relpath(dirpath, ROOT)
            if _excluded(rel_dir, excludes):
                dirnames[:] = []
                continue
            for f in files:
                full = os.path.join(dirpath, f)
                rel = os.path.relpath(full, ROOT)
                if not _excluded(rel, excludes):
                    yield full


def main():
    a = sys.argv
    apply = "--apply" in a
    prune = "--prune" in a
    cfg = cs.cfg()
    mig = cfg.get("migration", {})
    include = [a[a.index("--include") + 1]] if "--include" in a else mig.get("include", [])
    excludes = mig.get("exclude", [])
    after = mig.get("after_verify", "keep_local")

    if apply and not cs.enabled():
        print("ERROR: --apply needs cloud storage enabled (set WASABI_KEY/WASABI_SECRET in .env.secrets and "
              "`pip install boto3`). Run without --apply for the dry-run plan.")
        sys.exit(1)

    plan, total_bytes, by_prefix = [], 0, {}
    skipped = 0
    for full in _walk(include, excludes):
        rel = os.path.relpath(full, ROOT)
        existing = cs.locate(rel)
        if existing and existing.get("status") == "verified":
            skipped += 1
            continue
        try:
            bucket, key = cs.classify(full)
            size = os.path.getsize(full)
        except Exception as e:  # noqa: BLE001
            print("  skip (classify error): %s (%s)" % (rel, str(e)[:60]))
            continue
        prefix = key.rsplit("/", 1)[0] + "/" if "/" in key else key
        by_prefix[prefix] = by_prefix.get(prefix, 0) + 1
        total_bytes += size
        plan.append((full, rel, bucket, key, size))

    print("== Wasabi migration %s ==" % ("APPLY" if apply else "DRY-RUN (no data will move)"))
    print("  candidates: %d files, %.2f GB | already-verified skipped: %d" %
          (len(plan), total_bytes / 1e9, skipped))
    print("  by destination prefix:")
    for p, n in sorted(by_prefix.items(), key=lambda x: -x[1]):
        print("    %-32s %d" % (p, n))
    if not apply:
        print("  after_verify policy: %s | run with --apply to upload (and --prune to apply that policy)" % after)
        # show a few examples
        for full, rel, bucket, key, size in plan[:8]:
            print("    e.g. %s  ->  %s:%s" % (rel, bucket, key))
        return

    ok = fail = 0
    for full, rel, bucket, key, size in plan:
        r = cs.upload(full, verify=True)
        if r.get("ok"):
            ok += 1
            if prune and r.get("verified") and after != "keep_local":
                _apply_after(full, rel, r, after)
        else:
            fail += 1
            print("  FAIL %s : %s" % (rel, r.get("error")))
    print("== done: %d uploaded, %d failed ==" % (ok, fail))


def _apply_after(full: str, rel: str, r: dict, policy: str):
    """Only after a VERIFIED upload: leave a pointer or delete the local copy. keep_local does nothing."""
    try:
        if policy == "replace_with_pointer":
            with open(full + ".cloudref", "w", encoding="utf-8") as fh:
                json.dump({"bucket": r["bucket"], "key": r["key"], "md5": r["md5"]}, fh)
            os.remove(full)
        elif policy == "delete_local":
            os.remove(full)
    except Exception as e:  # noqa: BLE001
        print("  after_verify(%s) failed for %s: %s" % (policy, rel, str(e)[:60]))


if __name__ == "__main__":
    main()
