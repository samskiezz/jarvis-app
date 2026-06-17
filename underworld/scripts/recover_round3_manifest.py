#!/usr/bin/env python3
"""Recover round-3 assets from the background-task log and merge into the master manifest."""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = Path(
    "/root/.kimi/sessions/ad93450e8d26bb09347037d30f8f14ce/"
    "e9d9b310-e1e2-4262-b20a-db89616c36f8/tasks/bash-4celdarv/output.log"
)
MANIFEST_PATH = REPO_ROOT / "data" / "media_assets" / "higgsfield_master_manifest.json"


def main():
    if not LOG_PATH.exists():
        print(f"Log not found: {LOG_PATH}")
        return

    text = LOG_PATH.read_text(encoding="utf-8")
    marker = text.find("Round 3 queued")
    if marker == -1:
        print("Round 3 marker not found in log")
        return
    text = text[marker:]

    done = re.findall(r"\[DONE\] ([^:]+): (https?://\S+)", text)
    print(f"Found {len(done)} DONE entries in round 3 log")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    existing_names = {a["name"] for a in manifest.get("assets", [])}

    added = 0
    for name, url in done:
        if name in existing_names:
            continue
        kind = "video" if url.endswith(".mp4") else "image"
        manifest["assets"].append({
            "name": name,
            "kind": kind,
            "url": url,
            "status": "completed",
            "model": "seedream" if kind == "image" else "kling-v2-1",
            "aspect_ratio": "16:9",
            "credits_est": 2 if kind == "image" else 9,
            "render_round": 3,
        })
        added += 1

    manifest["completed"] = len(manifest["assets"])
    manifest["spent_estimated"] = manifest.get("spent_estimated", 0) + sum(
        a.get("credits_est", 0) for a in manifest["assets"] if a.get("render_round") == 3
    )
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Added {added} new round-3 assets to manifest")
    print(f"Total manifest now at {manifest['completed']} assets")


if __name__ == "__main__":
    main()
