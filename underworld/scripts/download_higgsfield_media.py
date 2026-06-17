#!/usr/bin/env python3
"""Download all Higgsfield-rendered media from CDN to local storage.

Organizes files into images/ and videos/ and rewrites the manifest with local paths.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "data" / "media_assets" / "higgsfield_master_manifest.json"
MEDIA_ROOT = REPO_ROOT / "data" / "media_assets" / "higgsfield_downloads"


def _ext_for(url: str) -> str:
    if ".mp4" in url:
        return ".mp4"
    if ".jpeg" in url or ".jpg" in url:
        return ".jpg"
    if ".png" in url:
        return ".png"
    return ".bin"


def _write_file(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


async def _download(client: httpx.AsyncClient, url: str, path: Path) -> bool:
    try:
        r = await client.get(url, timeout=120)
        r.raise_for_status()
        await asyncio.to_thread(_write_file, path, r.content)
        return True
    except Exception as exc:
        print(f"[FAIL] {url}: {exc}")
        return False


async def main() -> None:
    if not MANIFEST_PATH.exists():
        print(f"Manifest not found: {MANIFEST_PATH}")
        sys.exit(1)

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assets = [a for a in manifest.get("assets", []) if a.get("url")]

    print(f"Downloading {len(assets)} assets to {MEDIA_ROOT}")

    async with httpx.AsyncClient() as client:
        sem = asyncio.Semaphore(5)

        async def handle(asset: dict) -> None:
            async with sem:
                kind = asset["kind"]
                name = asset["name"]
                url = asset["url"]
                ext = _ext_for(url)
                folder = MEDIA_ROOT / kind / name[:2]
                path = folder / f"{name}{ext}"
                ok = await _download(client, url, path)
                if ok:
                    rel = path.relative_to(REPO_ROOT).as_posix()
                    asset["local_path"] = rel
                    print(f"[DONE] {name} -> {rel}")

        await asyncio.gather(*[handle(a) for a in assets])

    manifest["media_root"] = MEDIA_ROOT.relative_to(REPO_ROOT).as_posix()
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nManifest updated with local paths: {MANIFEST_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
