#!/usr/bin/env python3
"""Burn the Higgsfield budget on a fully custom Jarvis Match Centre media package.

This script generates original images and short videos for every match, team,
stage, group and UI surface of the WC2026 dashboard. Nothing is borrowed from
Underworld. Assets are written to repo-root/jarvis_assets/ and served via the
/asset/<basename> route in dashboard.py.

Image endpoint: POST /v1/text2image/soul (quality 720p -> 1 credit)
Video endpoint: POST /v1/image2video/kling 5s 16:9 -> 8 credits
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = REPO_ROOT / "jarvis_assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)
ENV_PATH = REPO_ROOT / "underworld" / ".env"
MANIFEST_PATH = ASSET_DIR / "matchcentre_manifest.json"

BASE_URL = "https://platform.higgsfield.ai"
POLL_INTERVAL = 6.0
MAX_POLL_ATTEMPTS = 60

# Approximate per-job credit costs for budget tracking.
CREDITS = {"image_720p": 1, "image_1080p": 2, "video_kling_5s": 8, "video_kling_master_5s": 15}
BUDGET_TOTAL = int(os.environ.get("MATCHCENTRE_MEDIA_BUDGET", "1700"))

NEGATIVE_PROMPT = (
    "cartoon, anime, oil painting, watercolor, sketch, plastic skin, "
    "oversaturated colors, seven fingers, crossed eyes, blurry faces, "
    "smudged details, text, logos, watermarks, distorted anatomy, "
    "cheap casino, neon clutter, crypto dashboard, meaningless holograms, "
    "underworld, minions, medieval fantasy, science-fiction city"
)


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


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:50]


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
    images = data.get("images")
    if isinstance(images, list) and images:
        return str(images[0].get("url", ""))
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


async def _poll(
    client: httpx.AsyncClient,
    key_id: str,
    key_secret: str,
    request_id: str,
) -> dict[str, Any]:
    headers = {"Authorization": f"Key {key_id}:{key_secret}"}
    for attempt in range(MAX_POLL_ATTEMPTS):
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


async def submit_image(
    client: httpx.AsyncClient,
    key_id: str,
    key_secret: str,
    prompt: str,
    width_and_height: str = "1536x1536",
    quality: str = "720p",
    seed: int = 42,
) -> dict[str, Any]:
    payload = {
        "model": "soul",
        "params": {
            "prompt": prompt,
            "width_and_height": width_and_height,
            "seed": seed,
            "quality": quality,
            "input_images": [],
            "negative_prompt": NEGATIVE_PROMPT,
        },
    }
    r = await client.post(
        f"{BASE_URL}/v1/text2image/soul",
        headers=_headers(key_id, key_secret),
        json=payload,
    )
    r.raise_for_status()
    return r.json()


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
        self.entries: list[dict[str, Any]] = []
        self.lock = asyncio.Lock()

    async def append(self, entry: dict[str, Any]) -> None:
        async with self.lock:
            self.entries.append(entry)
            self._save()

    def _save(self) -> None:
        self.path.write_text(json.dumps(self.entries, indent=2), encoding="utf-8")


async def generate_image(
    sem: asyncio.Semaphore,
    client: httpx.AsyncClient,
    key_id: str,
    key_secret: str,
    budget: Budget,
    manifest: Manifest,
    name: str,
    prompt: str,
    width_and_height: str = "1536x1536",
    quality: str = "720p",
    seed: int = 42,
) -> str | None:
    cost = CREDITS["image_1080p"] if quality == "1080p" else CREDITS["image_720p"]
    if not await budget.charge(cost, f"image {name}"):
        return None
    async with sem:
        print(f"[img submit] {name}")
        try:
            sub = await submit_image(client, key_id, key_secret, prompt, width_and_height, quality, seed)
            rid = _request_id(sub)
            if not rid:
                raise RuntimeError("no request id")
            status = await _poll(client, key_id, key_secret, rid)
            url = _extract_url(status)
            if not url:
                raise RuntimeError("no url")
            path = ASSET_DIR / f"{name}.png"
            await download(client, url, path)
            print(f"[img saved] {path} ({path.stat().st_size} bytes)")
            await manifest.append({
                "name": name,
                "kind": "image",
                "path": str(path),
                "url": url,
                "request_id": rid,
                "credits": cost,
                "prompt": prompt,
            })
            return url
        except Exception as exc:
            print(f"[img fail] {name}: {exc}")
            await manifest.append({"name": name, "kind": "image", "error": str(exc), "credits": cost})
            return None


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
    cost = CREDITS["video_kling_5s"]
    if not await budget.charge(cost, f"video {name}"):
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
                "credits": cost,
                "prompt": prompt,
            })
        except Exception as exc:
            print(f"[vid fail] {name}: {exc}")
            await manifest.append({"name": name, "kind": "video", "error": str(exc), "credits": cost})


def load_fixtures() -> dict[str, Any]:
    path = REPO_ROOT / "server" / "data" / "wc2026_fixtures_all.json"
    return json.loads(path.read_text(encoding="utf-8"))


def load_predictions() -> dict[str, Any]:
    path = REPO_ROOT / "server" / "data" / "wc2026_model_predictions.json"
    return json.loads(path.read_text(encoding="utf-8"))


def load_news() -> dict[str, Any]:
    path = REPO_ROOT / "server" / "data" / "wc2026_late_news.json"
    return json.loads(path.read_text(encoding="utf-8"))


async def main() -> None:
    key_id, key_secret = _load_creds()
    budget = Budget(BUDGET_TOTAL)
    manifest = Manifest(MANIFEST_PATH)
    img_sem = asyncio.Semaphore(4)
    vid_sem = asyncio.Semaphore(2)

    fixtures = load_fixtures()
    predictions = load_predictions()
    news = load_news()
    pred_map = predictions.get("all_fixture_predictions", {})

    tasks: list[asyncio.Task[Any]] = []
    image_urls: dict[str, str] = {}

    def schedule_image(name: str, prompt: str, size: str = "1536x1536", seed: int = 42) -> None:
        task = asyncio.create_task(
            generate_image(img_sem, client, key_id, key_secret, budget, manifest, name, prompt, size, "720p", seed)
        )
        tasks.append(task)

        def on_done(t: asyncio.Task[Any], n=name):
            try:
                url = t.result()
                if url:
                    image_urls[n] = url
            except Exception:
                pass

        task.add_done_callback(on_done)

    async with httpx.AsyncClient(timeout=300.0) as client:
        # ── Global / section surfaces ─────────────────────────────────────────
        schedule_image(
            "mc_stadium_command_centre_bg",
            "Dark premium sports command centre interior inside a football stadium at night, floor-to-ceiling screens showing match data, glowing blue and cyan holographic data overlays, rows of analyst workstations, subtle stadium lights through glass, deep navy and black palette, cinematic wide shot, photorealistic, high-end broadcast control room, no text",
            "2048x1152",
            1,
        )
        schedule_image(
            "mc_pitch_grid_overlay",
            "Top-down view of a pristine football pitch at night under stadium floodlights, dark green grass with subtle tactical grid lines and glowing cyan markings, premium sports analytics overlay, empty pitch, dramatic lighting, photorealistic, no players, no text",
            "2048x1152",
            2,
        )
        schedule_image(
            "mc_match_arena_hero",
            "Cinematic 3D sports broadcast graphic for a football match, two national team crest silhouettes facing each other across a glowing football pitch, large predicted score floating in the centre, confidence ring around the favoured side, dark stadium background, cyan and blue light rays, premium broadcast aesthetic, no readable text, no logos",
            "2048x1152",
            3,
        )
        schedule_image(
            "mc_knockout_bracket_wall",
            "Dark 3D tournament knockout bracket wall floating in a stadium command centre, glowing connection lines linking round of 32 to final, glass panels with team slots, cyan and blue accent lighting, premium sports broadcast graphic, subtle depth, no text, no logos",
            "2048x1152",
            4,
        )
        schedule_image(
            "mc_model_lab_visual",
            "Abstract data engine visualisation for a football prediction model, glowing nodes and probability distributions, score probability bars, team strength clusters, dark navy background, cyan and blue data streams, clean technical aesthetic, no text, no generic AI robot",
            "1536x1536",
            5,
        )
        schedule_image(
            "mc_player_intelligence_wall",
            "Premium sports scouting dashboard wall showing floating player profile cards with heatmaps and availability status, dark command centre background, cyan and amber accent lights, football analytics terminal, photorealistic, no faces, no text",
            "2048x1152",
            6,
        )
        schedule_image(
            "mc_late_news_impact",
            "Dynamic sports news impact visual, glowing alert lines connecting a breaking news headline to a match prediction graphic, dark stadium analytics room, amber and cyan highlights, sense of real-time update, no text, no logos",
            "1536x1536",
            7,
        )
        schedule_image(
            "mc_empty_state_illustration",
            "Minimal dark illustration of an empty football prediction dashboard, faint stadium outline, soft cyan glow, calm and informative mood, no text",
            "1536x1536",
            8,
        )
        schedule_image(
            "mc_error_state_illustration",
            "Dark moody illustration of a disconnected sports data terminal, faint warning amber glow, empty stadium seats in background, technical but not scary, no text",
            "1536x1536",
            9,
        )
        schedule_image(
            "mc_prediction_card_share_bg",
            "Vertical dark premium sports graphic for a social share card, glowing confidence score, abstract football pitch, cyan and blue flares, cinematic portrait composition, no text, no logos",
            "1152x2048",
            10,
        )
        schedule_image(
            "mc_model_accuracy_visual",
            "Clean dark data dashboard showing prediction accuracy curves, calibration dots and confidence intervals, navy background, cyan and green accent charts, technical and trustworthy, no text",
            "1536x1536",
            11,
        )

        # ── Per stage cinematic surfaces ──────────────────────────────────────
        stage_prompts = {
            "GROUP": "Group stage match day atmosphere, colourful national fans, stadium exterior at dusk, broadcast opening shot, dark cinematic grade, no text",
            "R32": "Round of 32 knockout tension, two teams lining up in tunnel before match, dramatic stadium lighting, dark premium sports broadcast, no text, no logos",
            "R16": "Round of 16 knockout football graphic, tense one-on-one duel silhouette, dark stadium, cyan light rays, no text",
            "QF": "Quarter final stage, giant stadium screens, single spotlight on centre circle, dark cinematic, no text",
            "SF": "Semi final stage, confetti and floodlights, epic wide stadium shot, dark premium broadcast, no text",
            "3P": "Third place match, respectful pre-match handshake line, dark stadium, subtle bronze accents, no text",
            "FINAL": "World Cup final stadium, golden trophy silhouette under spotlights, dark cinematic, epic scale, no text, no logos",
        }
        for stage, prompt in stage_prompts.items():
            schedule_image(f"mc_stage_{stage.lower()}", prompt, "2048x1152", hash(stage) % 10000)

        # ── Teams & groups ────────────────────────────────────────────────────
        teams = sorted({m["home"] for m in fixtures["matches"]} | {m["away"] for m in fixtures["matches"]})
        for team in teams:
            slug = _slug(team)
            schedule_image(
                f"mc_team_{slug}_hero",
                f"Epic national team hero graphic for {team}, dramatic stadium tunnel walk, players in {team} colours, cinematic floodlights, dark premium sports broadcast opening, no readable text, no logos",
                "2048x1152",
                hash(team) % 10000,
            )
            schedule_image(
                f"mc_team_{slug}_squad",
                f"Premium sports squad intelligence wall for {team}, floating player profile cards, dark command centre, cyan and amber data overlays, football analytics terminal, no faces, no text",
                "2048x1152",
                (hash(team) + 1) % 10000,
            )

        groups: set[str] = set()
        for m in fixtures["matches"]:
            if m.get("group"):
                groups.add(m["group"])
        for g in sorted(groups):
            schedule_image(
                f"mc_group_{g.lower()}",
                f"Group {g} World Cup standings graphic, abstract country flag colour ribbons, dark stadium analytics room, glowing table rows, cyan and blue light, no text",
                "2048x1152",
                hash(g) % 10000,
            )

        # ── Per match hero images ─────────────────────────────────────────────
        for m in fixtures["matches"]:
            n = m["n"]
            pred = pred_map.get(str(n), {})
            score = pred.get("predicted_score") or "TBD"
            stage = m.get("stage", "GROUP")
            group = f"Group {m['group']}" if m.get("group") else stage
            venue = m.get("venue", "World Cup 2026 stadium")
            prompt = (
                f"Custom cinematic match broadcast graphic for {m['home']} versus {m['away']} at {venue}, "
                f"{group}, predicted score {score}, two national team colour themes clashing, "
                f"glowing football pitch centre, dark stadium floodlights, cyan data overlays, "
                f"premium World Cup broadcast aesthetic, no readable text, no official logos"
            )
            schedule_image(f"mc_match_{n:03d}_hero", prompt, "2048x1152", n % 10000)

        # Wait for all images so videos can use their URLs.
        await asyncio.gather(*tasks, return_exceptions=True)
        tasks.clear()

        # ── Per match short cinematic videos from hero stills ─────────────────
        for m in fixtures["matches"]:
            n = m["n"]
            img_name = f"mc_match_{n:03d}_hero"
            img_url = image_urls.get(img_name)
            if not img_url:
                continue
            prompt = (
                f"Slow cinematic camera move across a World Cup match broadcast graphic, "
                f"subtle light rays and data particles drifting, {m['home']} versus {m['away']}, "
                f"stadium atmosphere, premium sports opening, no text"
            )
            task = asyncio.create_task(
                generate_video(
                    vid_sem, client, key_id, key_secret, budget, manifest,
                    f"mc_match_{n:03d}_video", prompt, img_url, 5, "16:9", n % 10000,
                )
            )
            tasks.append(task)

        # ── Per news item impact visual ───────────────────────────────────────
        for i, item in enumerate(news.get("items", [])[:12]):
            prompt = (
                f"Late news impact visual for football story about {item.get('player','a player')}, "
                f"dark stadium analytics room, amber alert pulse, breaking-news energy, "
                f"cyan match data streams, no readable text, no logos"
            )
            schedule_image(f"mc_news_{i:02d}", prompt, "1536x1536", (i + 100) % 10000)

        # ── Fallback global videos if budget remains ──────────────────────────
        if await budget.charge(CREDITS["video_kling_5s"], "video hero command centre"):
            if "mc_stadium_command_centre_bg" in image_urls:
                task = asyncio.create_task(
                    generate_video(
                        vid_sem, client, key_id, key_secret, budget, manifest,
                        "mc_stadium_command_centre_video",
                        "Slow push-in through a premium sports command centre, holographic match data glowing on screens, subtle camera drift, cinematic dark stadium atmosphere, no text",
                        image_urls["mc_stadium_command_centre_bg"], 5, "16:9", 101,
                    )
                )
                tasks.append(task)

        if await budget.charge(CREDITS["video_kling_5s"], "video model lab"):
            if "mc_model_lab_visual" in image_urls:
                task = asyncio.create_task(
                    generate_video(
                        vid_sem, client, key_id, key_secret, budget, manifest,
                        "mc_model_lab_video",
                        "Abstract prediction model data particles flowing between glowing nodes, probability bars rising and falling, dark navy technical aesthetic, no text",
                        image_urls["mc_model_lab_visual"], 5, "16:9", 102,
                    )
                )
                tasks.append(task)

        if await budget.charge(CREDITS["video_kling_5s"], "video bracket wall"):
            if "mc_knockout_bracket_wall" in image_urls:
                task = asyncio.create_task(
                    generate_video(
                        vid_sem, client, key_id, key_secret, budget, manifest,
                        "mc_knockout_bracket_video",
                        "Slow pan across a giant glowing knockout bracket wall, connection lines lighting up, dark stadium command centre, no text",
                        image_urls["mc_knockout_bracket_wall"], 5, "16:9", 103,
                    )
                )
                tasks.append(task)

        await asyncio.gather(*tasks, return_exceptions=True)

    print(f"\n[done] spent ~{budget.spent}/{budget.total} credits")
    print(f"[done] manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
