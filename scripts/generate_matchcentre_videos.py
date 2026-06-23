#!/usr/bin/env python3
"""Generate the remaining custom videos for Jarvis Match Centre.

Uses the image URLs already saved in jarvis_assets/matchcentre_manifest.json
so videos can be produced without re-burning image credits. Videos are written
to jarvis_assets/ and served via /asset/<basename>.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
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
BUDGET_TOTAL = int(os.environ.get("MATCHCENTRE_VIDEO_BUDGET", "458"))
CREDIT_COST = 8


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
    video = data.get("video")
    if isinstance(video, dict) and video.get("url"):
        return str(video["url"])
    videos = data.get("videos")
    if isinstance(videos, list) and videos:
        return str(videos[0].get("url", ""))
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


async def submit_video(
    client: httpx.AsyncClient,
    key_id: str,
    key_secret: str,
    prompt: str,
    image_url: str,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    seed: int = 42,
) -> dict[str, Any]:
    payload = {
        "model": "kling-v2-1",
        "params": {
            "model": "kling-v2-1",
            "prompt": prompt,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "seed": seed,
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


async def download(client: httpx.AsyncClient, url: str, path: Path) -> None:
    r = await client.get(url)
    r.raise_for_status()
    path.write_bytes(r.content)


class Budget:
    def __init__(self, total: int):
        self.total = total
        self.spent = 0
        self.lock = asyncio.Lock()

    async def charge(self, cost: int, kind: str) -> bool:
        async with self.lock:
            if self.spent + cost > self.total:
                print(f"[budget] skipping {kind}: would exceed {self.total} credits")
                return False
            self.spent += cost
            print(f"[budget] {kind} (-{cost}) total spent {self.spent}/{self.total}")
            return True


class Manifest:
    def __init__(self, path: Path):
        self.path = path
        self.entries: list[dict[str, Any]] = list(json.loads(path.read_text(encoding="utf-8"))) if path.exists() else []
        self.lock = asyncio.Lock()

    async def append(self, entry: dict[str, Any]) -> None:
        async with self.lock:
            self.entries.append(entry)
            self._save()

    def _save(self) -> None:
        self.path.write_text(json.dumps(self.entries, indent=2), encoding="utf-8")


async def generate_video(
    sem: asyncio.Semaphore,
    client: httpx.AsyncClient,
    key_id: str,
    key_secret: str,
    budget: Budget,
    manifest: Manifest,
    name: str,
    prompt: str,
    image_url: str,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    seed: int = 42,
) -> None:
    if not await budget.charge(CREDIT_COST, f"video {name}"):
        return
    async with sem:
        print(f"[vid submit] {name}")
        try:
            sub = await submit_video(client, key_id, key_secret, prompt, image_url, duration, aspect_ratio, seed)
            rid = _request_id(sub)
            if not rid:
                raise RuntimeError("no request id")
            status = await _poll(client, key_id, key_secret, rid)
            url = _extract_url(status)
            if not url:
                raise RuntimeError("no url")
            ext = ".mp4" if ".mp4" in url else ".mp4"
            path = ASSET_DIR / f"{name}{ext}"
            await download(client, url, path)
            print(f"[vid saved] {path} ({path.stat().st_size} bytes)")
            await manifest.append({
                "name": name,
                "kind": "video",
                "path": str(path),
                "url": url,
                "request_id": rid,
                "credits": CREDIT_COST,
                "prompt": prompt,
            })
        except Exception as exc:
            print(f"[vid fail] {name}: {exc}")
            await manifest.append({"name": name, "kind": "video", "error": str(exc), "credits": CREDIT_COST})


def load_manifest_images() -> dict[str, str]:
    if not MANIFEST_PATH.exists():
        return {}
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {entry["name"]: entry["url"] for entry in data if entry.get("kind") == "image" and entry.get("url")}


def load_fixtures() -> list[dict[str, Any]]:
    path = REPO_ROOT / "server" / "data" / "wc2026_fixtures_all.json"
    return json.loads(path.read_text(encoding="utf-8")).get("matches", [])


async def main() -> None:
    key_id, key_secret = _load_creds()
    budget = Budget(BUDGET_TOTAL)
    manifest = Manifest(MANIFEST_PATH)
    vid_sem = asyncio.Semaphore(2)

    image_urls = load_manifest_images()
    fixtures = load_fixtures()
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    upcoming = [m for m in fixtures if not m.get("played") and m["kickoff_iso"] > now]
    upcoming.sort(key=lambda m: m["kickoff_iso"])

    async with httpx.AsyncClient(timeout=300.0) as client:
        tasks: list[asyncio.Task[Any]] = []

        # Global / section videos
        global_videos = [
            ("mc_stadium_command_centre_video", image_urls.get("mc_stadium_command_centre_bg"), "Slow push-in through a premium sports command centre, holographic match data glowing on screens, subtle camera drift, cinematic dark stadium atmosphere, no text"),
            ("mc_model_lab_video", image_urls.get("mc_model_lab_visual"), "Abstract prediction model data particles flowing between glowing nodes, probability bars rising and falling, dark navy technical aesthetic, no text"),
            ("mc_knockout_bracket_video", image_urls.get("mc_knockout_bracket_wall"), "Slow pan across a giant glowing knockout bracket wall, connection lines lighting up, dark stadium command centre, no text"),
        ]
        for name, img_url, prompt in global_videos:
            if not img_url:
                print(f"[skip] no source image for {name}")
                continue
            tasks.append(asyncio.create_task(generate_video(vid_sem, client, key_id, key_secret, budget, manifest, name, prompt, img_url, 5, "16:9", hash(name) % 10000)))

        # Per-match videos for upcoming fixtures, sorted by kickoff, until budget exhausted.
        for m in upcoming:
            n = m["n"]
            img_name = f"mc_match_{n:03d}_hero"
            img_url = image_urls.get(img_name)
            if not img_url:
                print(f"[skip] no source image for match {n}")
                continue
            prompt = (
                f"Slow cinematic camera move across a World Cup match broadcast graphic, "
                f"subtle light rays and data particles drifting, {m['home']} versus {m['away']}, "
                f"stadium atmosphere, premium sports opening, no text"
            )
            tasks.append(asyncio.create_task(generate_video(
                vid_sem, client, key_id, key_secret, budget, manifest,
                f"mc_match_{n:03d}_video", prompt, img_url, 5, "16:9", n % 10000,
            )))

        await asyncio.gather(*tasks, return_exceptions=True)

    print(f"\n[done] spent ~{budget.spent}/{budget.total} video credits")
    print(f"[done] manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
