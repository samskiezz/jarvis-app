#!/usr/bin/env python3
"""stage_higgsfield_media.py — HEADLESS staging of Higgsfield 2D media for UE5.

Copies or symlinks every downloaded image/video from:
    underworld/data/media_assets/higgsfield_downloads/
into the UE5 project as source files under:
    Content/UnderworldMedia/Images/<bucket>/<name>.ext
    Content/UnderworldMedia/Videos/<bucket>/<name>.ext

and writes:
    Content/UnderworldMedia/media_manifest.json

The manifest maps each asset name to its UE5 content path plus tags (era, biome,
guild, situation, etc.) so Blueprint/C++ gallery/spawner code can load the right
poster/video by name or tag query.

Run headless (no Editor):
    python3 stage_higgsfield_media.py
    python3 stage_higgsfield_media.py --copy   # hard-copy instead of symlink
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)

MANIFEST_DEFAULT = "/opt/jarvis-app-1/underworld/data/media_assets/higgsfield_master_manifest.json"
UW_ROOT_DEFAULT = os.path.dirname(os.path.dirname(PROJ))  # /opt/jarvis-app-1/underworld


def _bucket(name: str) -> str:
    return name[:2].lower()


def _safe_ext(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".jpeg", ".jpg"):
        return ".jpg"
    if ext in (".png", ".mp4", ".webp", ".gif"):
        return ext
    return ext if ext else ".bin"


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage Higgsfield media for UE5")
    parser.add_argument("--manifest", default=os.environ.get("UW_HIGGSFIELD_MANIFEST", MANIFEST_DEFAULT))
    parser.add_argument("--project-root", default=os.environ.get("UW_ROOT", UW_ROOT_DEFAULT),
                        help="repo root under which local_path is relative (default: underworld/)")
    parser.add_argument("--copy", action="store_true", help="copy files instead of symlinking")
    parser.add_argument("--content-dir", default=os.environ.get("UW_PROJ_CONTENT", os.path.join(PROJ, "Content")))
    args = parser.parse_args()

    if not os.path.isfile(args.manifest):
        print(f"[stage-media] manifest not found: {args.manifest}", file=sys.stderr)
        return 2

    data = json.load(open(args.manifest, "r", encoding="utf-8"))
    assets = data.get("assets", [])

    dest_root = os.path.join(args.content_dir, "UnderworldMedia")
    img_root = os.path.join(dest_root, "Images")
    vid_root = os.path.join(dest_root, "Videos")
    os.makedirs(img_root, exist_ok=True)
    os.makedirs(vid_root, exist_ok=True)

    entries: dict[str, dict] = {}
    copied, linked, skipped, missing = 0, 0, 0, 0

    for a in assets:
        name = a.get("name")
        kind = a.get("kind")
        local = a.get("local_path")
        if not name or not kind or not local:
            skipped += 1
            continue

        src = local if os.path.isabs(local) else os.path.join(args.project_root, local)
        if not os.path.isfile(src):
            print(f"[stage-media] missing source: {src}", file=sys.stderr)
            missing += 1
            continue

        bucket = _bucket(name)
        ext = _safe_ext(src)
        if kind == "image":
            dest_dir = os.path.join(img_root, bucket)
            ue5_path = f"/Game/UnderworldMedia/Images/{bucket}/{name}"
        elif kind == "video":
            dest_dir = os.path.join(vid_root, bucket)
            ue5_path = f"/Game/UnderworldMedia/Videos/{bucket}/{name}"
        else:
            skipped += 1
            continue

        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, f"{name}{ext}")

        if os.path.lexists(dest):
            os.remove(dest)

        if args.copy:
            shutil.copy2(src, dest)
            copied += 1
        else:
            os.symlink(os.path.abspath(src), dest)
            linked += 1

        entries[name] = {
            "name": name,
            "kind": kind,
            "ue5_path": ue5_path,
            "source": os.path.abspath(src),
            "ext": ext,
            "era": a.get("era"),
            "biome": a.get("biome"),
            "guild": a.get("guild"),
            "situation": a.get("situation"),
            "saga": a.get("saga"),
            "emotion": a.get("emotion"),
            "building": a.get("building"),
            "tod": a.get("tod"),
            "weather": a.get("weather"),
            "camera_preset": a.get("camera_preset"),
            "aspect_ratio": a.get("aspect_ratio"),
            "duration": a.get("duration"),
            "model": a.get("model"),
            "credits_est": a.get("credits_est"),
        }

    manifest_dest = os.path.join(dest_root, "media_manifest.json")
    payload = {
        "source_manifest": os.path.abspath(args.manifest),
        "staged_at": dest_root,
        "copy_mode": args.copy,
        "total": len(entries),
        "by_kind": {
            "image": sum(1 for e in entries.values() if e["kind"] == "image"),
            "video": sum(1 for e in entries.values() if e["kind"] == "video"),
        },
        "by_prefix": {},
        "entries": entries,
    }
    prefix_counts: dict[str, int] = {}
    for e in entries.values():
        prefix = e["name"].split("_")[0] if "_" in e["name"] else e["name"]
        prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1
    payload["by_prefix"] = dict(sorted(prefix_counts.items(), key=lambda x: -x[1]))

    json.dump(payload, open(manifest_dest, "w", encoding="utf-8"), indent=2)

    mode = "copied" if args.copy else "symlinked"
    print(f"[stage-media] {mode} {len(entries)} assets ({payload['by_kind']})")
    print(f"[stage-media] copied={copied} linked={linked} skipped={skipped} missing={missing}")
    print(f"[stage-media] wrote {manifest_dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
