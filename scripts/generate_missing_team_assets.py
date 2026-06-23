#!/usr/bin/env python3
"""Generate hero images + videos for player-profile teams missing from fixtures.

These are real countries that appear in wc2026_player_profiles_enriched.json but
not in wc2026_fixtures_all.json, so the main asset generator skipped them.
Run with: MATCHCENTRE_VIDEO_BUDGET=200 .venv/bin/python scripts/generate_missing_team_assets.py
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = REPO_ROOT / "jarvis_assets"
MANIFEST_PATH = ASSET_DIR / "matchcentre_manifest.json"
ENV_PATH = REPO_ROOT / "underworld" / ".env"
BASE_URL = "https://platform.higgsfield.ai"
POLL_INTERVAL = 8.0
MAX_POLL_ATTEMPTS = 60
BUDGET_TOTAL = int(os.environ.get("MATCHCENTRE_VIDEO_BUDGET", "200"))
CREDIT_COST = {"image": 1, "video": 8}
CONCURRENCY = 2

TEAMS = [
    "Cameroon", "Costa Rica", "Denmark", "Italy", "Nigeria",
    "Poland", "Slovakia", "Ukraine", "Wales",
]


def _load_creds() -> tuple[str, str]:
    key_id = key_secret = ""
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k == "UNDERWORLD_HIGGSFIELD_KEY_ID":
                key_id = v
            elif k == "UNDERWORLD_HIGGSFIELD_KEY_SECRET":
                key_secret = v
    if not key_id or not key_secret:
        raise RuntimeError("Higgsfield credentials not found in underworld/.env")
    return key_id, key_secret


def _headers(key_id: str, key_secret: str) -> dict[str, str]:
    return {
        "Authorization": f"Key {key_id}:{key_secret}",
        "Content-Type": "application/json",
    }


def _extract_url(data: dict[str, Any], seen: set[int] | None = None) -> str:
    if not isinstance(data, dict):
        return ""
    seen = seen or set()
    if id(data) in seen:
        return ""
    seen.add(id(data))
    images = data.get("images")
    if isinstance(images, list) and images:
        return str(images[0].get("url", ""))
    videos = data.get("videos")
    if isinstance(videos, list) and videos:
        return str(videos[0].get("url", ""))
    video = data.get("video")
    if isinstance(video, dict) and video.get("url"):
        return str(video["url"])
    for key in ("output_url", "video_url", "url", "image_url"):
        if key in data and data[key]:
            return str(data[key])
    nested = data.get("output") or data.get("result") or data.get("data") or {}
    if isinstance(nested, dict) and nested:
        return _extract_url(nested, seen)
    return ""


def _request_id(resp: dict[str, Any], seen: set[int] | None = None) -> str | None:
    if not isinstance(resp, dict):
        return None
    seen = seen or set()
    if id(resp) in seen:
        return None
    seen.add(id(resp))
    for key in ("request_id", "id", "task_id", "job_id"):
        if key in resp and resp[key]:
            return str(resp[key])
    nested = resp.get("data") or resp.get("result") or resp.get("output")
    if isinstance(nested, dict) and nested:
        return _request_id(nested, seen)
    return None


async def _poll(client: httpx.AsyncClient, key_id: str, key_secret: str, request_id: str) -> dict[str, Any]:
    headers = {"Authorization": f"Key {key_id}:{key_secret}"}
    for _ in range(MAX_POLL_ATTEMPTS):
        r = await client.get(f"{BASE_URL}/requests/{request_id}/status", headers=headers)
        r.raise_for_status()
        data = r.json()
        status = (data.get("status") or data.get("state") or "").lower()
        if status in ("success", "done", "completed", "ready"):
            return data
        if status in ("failed", "error", "cancelled", "rejected", "nsfw"):
            raise RuntimeError(f"Job failed: {data}")
        await asyncio.sleep(POLL_INTERVAL)
    raise RuntimeError("Polling timed out")


async def submit_image(client, key_id, key_secret, prompt):
    payload = {
        "model": "soul",
        "params": {
            "model": "soul",
            "prompt": prompt,
            "quality": "720p",
            "width_and_height": "2048x1152",
            "seed": 42,
        },
    }
    r = await client.post(
        f"{BASE_URL}/v1/text2image/soul",
        headers=_headers(key_id, key_secret),
        json=payload,
    )
    r.raise_for_status()
    return r.json()


async def submit_video(client, key_id, key_secret, prompt, image_url):
    payload = {
        "model": "kling-v2-1",
        "params": {
            "model": "kling-v2-1",
            "prompt": prompt,
            "duration": 5,
            "aspect_ratio": "16:9",
            "seed": 42,
            "input_image": {"type": "image_url", "image_url": image_url},
        },
    }
    r = await client.post(
        f"{BASE_URL}/v1/image2video/kling",
        headers=_headers(key_id, key_secret),
        json=payload,
    )
    r.raise_for_status()
    return r.json()


async def download(client, url, path):
    r = await client.get(url)
    r.raise_for_status()
    path.write_bytes(r.content)


class Budget:
    def __init__(self, total):
        self.total = total
        self.spent = 0
        self.lock = asyncio.Lock()

    async def charge(self, cost, kind):
        async with self.lock:
            if self.spent + cost > self.total:
                print(f"[budget] skipping {kind}: would exceed {self.total}")
                return False
            self.spent += cost
            print(f"[budget] {kind} (-{cost}) total spent {self.spent}/{self.total}")
            return True


class Manifest:
    def __init__(self, path):
        self.path = path
        self.entries = list(json.loads(path.read_text(encoding="utf-8"))) if path.exists() else []
        self.lock = asyncio.Lock()

    async def append(self, entry):
        async with self.lock:
            self.entries.append(entry)
            self._save()

    def _save(self):
        self.path.write_text(json.dumps(self.entries, indent=2), encoding="utf-8")


def slug(name):
    return name.lower().replace("'", "").replace("ç", "c").replace("ã", "a").replace("ü", "u").replace("é", "e").replace(" ", "_")


async def generate_image(sem, client, key_id, key_secret, budget, manifest, country):
    name = f"mc_team_{slug(country)}_hero"
    out_path = ASSET_DIR / f"{name}.png"
    if out_path.exists() and out_path.stat().st_size > 1024:
        print(f"[skip] {name} already exists")
        return name, None
    if not await budget.charge(CREDIT_COST["image"], f"image {name}"):
        return name, None
    prompt = (
        f"Cinematic hero portrait of the {country} national football team, "
        f"players in national kit silhouettes, stadium floodlights, dramatic dark atmosphere, "
        f"glowing cyan and blue data overlays, premium sports broadcast, no text"
    )
    async with sem:
        print(f"[img submit] {name}")
        try:
            sub = await submit_image(client, key_id, key_secret, prompt)
            rid = _request_id(sub)
            if not rid:
                raise RuntimeError("no request id")
            status = await _poll(client, key_id, key_secret, rid)
            url = _extract_url(status)
            if not url:
                raise RuntimeError("no url")
            await download(client, url, out_path)
            print(f"[img saved] {out_path} ({out_path.stat().st_size} bytes)")
            await manifest.append({
                "name": name, "kind": "image", "path": str(out_path),
                "url": url, "request_id": rid, "credits": CREDIT_COST["image"], "prompt": prompt,
            })
            return name, url
        except Exception as exc:
            print(f"[img fail] {name}: {exc}")
            await manifest.append({"name": name, "kind": "image", "error": str(exc), "credits": CREDIT_COST["image"]})
            return name, None


async def generate_video(sem, client, key_id, key_secret, budget, manifest, country, image_url):
    name = f"mc_team_{slug(country)}_video"
    out_path = ASSET_DIR / f"{name}.mp4"
    if out_path.exists() and out_path.stat().st_size > 1024:
        print(f"[skip] {name} already exists")
        return
    if not image_url:
        print(f"[skip] no source image for {name}")
        return
    if not await budget.charge(CREDIT_COST["video"], f"video {name}"):
        return
    prompt = (
        f"Cinematic hero shot for {country}, subtle motion, glowing national team colours, "
        f"stadium lights and data overlays, premium sports broadcast, no text"
    )
    async with sem:
        print(f"[vid submit] {name}")
        try:
            sub = await submit_video(client, key_id, key_secret, prompt, image_url)
            rid = _request_id(sub)
            if not rid:
                raise RuntimeError("no request id")
            status = await _poll(client, key_id, key_secret, rid)
            url = _extract_url(status)
            if not url:
                raise RuntimeError("no url")
            await download(client, url, out_path)
            print(f"[vid saved] {out_path} ({out_path.stat().st_size} bytes)")
            await manifest.append({
                "name": name, "kind": "video", "path": str(out_path),
                "url": url, "request_id": rid, "credits": CREDIT_COST["video"], "prompt": prompt,
            })
        except Exception as exc:
            print(f"[vid fail] {name}: {exc}")
            await manifest.append({"name": name, "kind": "video", "error": str(exc), "credits": CREDIT_COST["video"]})


async def main():
    key_id, key_secret = _load_creds()
    budget = Budget(BUDGET_TOTAL)
    manifest = Manifest(MANIFEST_PATH)
    sem = asyncio.Semaphore(CONCURRENCY)

    async with httpx.AsyncClient(timeout=300.0) as client:
        # Phase 1: images
        img_results = await asyncio.gather(*[
            generate_image(sem, client, key_id, key_secret, budget, manifest, c)
            for c in TEAMS
        ], return_exceptions=True)
        image_urls = {name: url for name, url in img_results if url}

        # Phase 2: videos from generated images
        await asyncio.gather(*[
            generate_video(sem, client, key_id, key_secret, budget, manifest, c, image_urls.get(f"mc_team_{slug(c)}_hero"))
            for c in TEAMS
        ], return_exceptions=True)

    print(f"\n[done] spent ~{budget.spent}/{budget.total} credits")
    print(f"[done] manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
