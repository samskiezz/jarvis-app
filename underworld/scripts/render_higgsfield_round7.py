#!/usr/bin/env python3
"""Seventh (final-coverage) Higgsfield pass using ~300 credits to fill the last
optional gaps: cloudy weather matrix, guild situation portraits, more Soul IDs,
hero variants, and extra gameplay videos."""

from __future__ import annotations

import asyncio
import json
import os
import random
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT.parent))

from underworld.server.services import higgsfield, media_style

MANIFEST_PATH = REPO_ROOT / "data" / "media_assets" / "higgsfield_master_manifest.json"
BUDGET_TOTAL = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_TOTAL", "300"))
BUDGET_SAFETY = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_SAFETY", "5"))
MAX_CONCURRENT = int(os.environ.get("UNDERWORLD_HIGGSFIELD_MAX_CONCURRENT", "2"))
POLL_INTERVAL_S = 8


def log(msg: str) -> None:
    print(msg, flush=True)


CREDIT_COST = {
    "seedream_image_basic": 1,
    "seedream_image_high": 2,
    "kling_v21_video": 8,
    "kling_v21_master_video": 15,
    "dop_preview_video": 8,
}


def _image_cost(quality: str = "high") -> int:
    return CREDIT_COST["seedream_image_high"] if quality == "high" else CREDIT_COST["seedream_image_basic"]


def _video_cost(model: str) -> int:
    return CREDIT_COST.get(model, 8)


def _append_manifest(entry: dict) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["assets"].append(entry)
    manifest["completed"] = len(manifest["assets"])
    manifest["spent_estimated"] = manifest.get("spent_estimated", 0) + entry.get("credits_est", 0)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


async def _poll_for_url(request_id: str, max_attempts: int = 50) -> str | None:
    for i in range(max_attempts):
        status = await higgsfield.get_status(request_id)
        data = status.get("data", {}) or {}
        url = higgsfield.extract_output_url(data)
        if url:
            return url
        if data.get("status") in ("failed", "error", "cancelled", "rejected", "nsfw"):
            return None
        await asyncio.sleep(POLL_INTERVAL_S)
    return None


async def submit_image(prompt: str, name: str, aspect: str = "16:9", quality: str = "high", **kwargs) -> dict | None:
    spec = media_style.build_manual_prompt(
        prompt=prompt,
        kind="image",
        world_name="Underworld",
        time_of_day=kwargs.get("tod", "dusk"),
        weather=kwargs.get("weather", "clear"),
        era=kwargs.get("era", "modern"),
        biome=kwargs.get("biome", "plains"),
        guild=kwargs.get("guild"),
    )
    result = await higgsfield.submit_image(
        spec["prompt"],
        model=spec["model"],
        quality=quality,
        width_and_height=spec["width_and_height"],
        negative_prompt=spec["negative_prompt"],
        seed=random.randint(1, 1000000),
    )
    if not result.get("ok"):
        log(f"[FAIL] {name}: {result.get('error')}")
        return None
    rid = higgsfield.request_id_from_response(result["data"])
    url = await _poll_for_url(rid)
    if url:
        log(f"[DONE] {name}: {url}")
        entry = {
            "name": name,
            "kind": "image",
            "url": url,
            "request_id": rid,
            "status": "completed",
            "model": spec["model"],
            "era": kwargs.get("era", "modern"),
            "biome": kwargs.get("biome", "plains"),
            "guild": kwargs.get("guild"),
            "situation": kwargs.get("situation"),
            "aspect_ratio": aspect,
            "credits_est": _image_cost(quality),
            "render_round": 7,
        }
        _append_manifest(entry)
        return entry
    log(f"[FAIL] {name}: no url")
    return None


async def submit_video(prompt: str, name: str, image_url: str, model: str = "kling-v2-1", **kwargs) -> dict | None:
    spec = media_style.build_manual_prompt(
        prompt=prompt,
        kind="video",
        world_name="Underworld",
        time_of_day=kwargs.get("tod", "dusk"),
        weather=kwargs.get("weather", "clear"),
        era=kwargs.get("era", "modern"),
        biome=kwargs.get("biome", "plains"),
        guild=kwargs.get("guild"),
    )
    result = await higgsfield.submit_video(
        spec["prompt"],
        image_url=image_url,
        model=model,
        duration=kwargs.get("duration", 5),
        aspect_ratio=kwargs.get("aspect", "16:9"),
        negative_prompt=spec["negative_prompt"],
    )
    if not result.get("ok"):
        log(f"[FAIL] {name}: {result.get('error')}")
        return None
    rid = higgsfield.request_id_from_response(result["data"])
    url = await _poll_for_url(rid)
    if url:
        log(f"[DONE] {name}: {url}")
        entry = {
            "name": name,
            "kind": "video",
            "url": url,
            "request_id": rid,
            "status": "completed",
            "model": model,
            "era": kwargs.get("era", "modern"),
            "biome": kwargs.get("biome", "plains"),
            "guild": kwargs.get("guild"),
            "aspect_ratio": kwargs.get("aspect", "16:9"),
            "duration": kwargs.get("duration", 5),
            "credits_est": _video_cost(model),
            "render_round": 7,
        }
        _append_manifest(entry)
        return entry
    log(f"[FAIL] {name}: no url")
    return None


async def main():
    budget = BUDGET_TOTAL
    spent = 0

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    existing_names = {a["name"] for a in manifest.get("assets", [])}
    keyframes: dict[str, str] = {}
    for a in manifest.get("assets", []):
        if a["kind"] == "image" and a.get("url"):
            keyframes[a["name"]] = a["url"]
    log(f"Loaded {len(keyframes)} existing keyframes; budget={budget}")

    tasks: list[tuple] = []

    # 1. Complete cloudy weather matrix (4 images, 8 credits)
    for tod in ["dawn", "day", "dusk", "night"]:
        name = f"matrix_tod_{tod}_weather_cloudy"
        tasks.append(("image", name, 2, {
            "prompt": f"hero establishing shot of Underworld city at {tod} with cloudy overcast weather",
            "aspect": "21:9", "tod": tod, "weather": "cloudy",
        }))

    # 2. Fill guild × situation portraits (missing combos only)
    guilds = ["physics", "mechanical", "electrical", "civil", "materials",
              "energy", "computing", "maths", "agriculture", "patent", "safety"]
    situations = ["birth", "breed", "build", "conflict", "death", "disaster",
                  "discovery", "festival", "harvest", "idle", "research", "rest",
                  "ritual", "trade", "travel"]
    for guild in guilds:
        for sit in situations:
            name = f"guild_{guild}_{sit}"
            tasks.append(("image", name, 2, {
                "prompt": f"{guild} guild minions during {sit}, cinematic scene",
                "aspect": "16:9", "guild": guild, "situation": sit,
            }))

    # 3. More Soul IDs (10 images, 20 credits)
    for soul in ["ava", "caleb", "nora", "marcus", "jing", "sofia", "leo", "priya", "tariq", "hana"]:
        tasks.append(("image", f"soul_id_{soul}", 2, {
            "prompt": f"consistent hero minion portrait of {soul}, neutral expression, front-facing, clean background",
            "aspect": "1:1",
        }))

    # 4. More hero variants (5 images, 10 credits)
    for suffix, desc in [
        ("night", "wide hero shot of Underworld city at deep night with neon rain"),
        ("storm", "wide hero shot of Underworld city during a lightning storm"),
        ("snow", "wide hero shot of Underworld city blanketed in snow"),
        ("fog", "wide hero shot of Underworld city in thick morning fog"),
        ("sunset", "wide hero shot of Underworld city at golden sunset"),
    ]:
        tasks.append(("image", f"hero_world_poster_{suffix}", 2, {
            "prompt": desc, "aspect": "21:9",
        }))

    # 5. Final gameplay videos (7 videos, ~56 credits)
    gameplay = [
        ("gameplay_landslide", "minions flee a collapsing hillside", "kling-v2-1", "hero_world_poster"),
        ("gameplay_tornado", "a tornado tears through a district", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_meteor", "a meteor streaks toward a colony", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_ufo", "minions watch a UFO descend", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_miracle", "a golden miracle heals a wounded minion", "kling-v2-1", "situation_discovery"),
        ("gameplay_sacrifice", "a minion gives their life to save others", "kling-v2-1-master", "situation_death"),
        ("gameplay_coronation_crowd", "a massive crowd cheers a new ruler", "kling-v2-1", "situation_festival"),
    ]
    for name, desc, model, kf in gameplay:
        tasks.append(("video", name, _video_cost(model), {
            "prompt": desc + ", gameplay capture",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # Shuffle to spread load
    random.seed(42)
    random.shuffle(tasks)

    est = sum(t[2] for t in tasks)
    log(f"Round 7 queued: {len(tasks)} tasks, estimated {est} credits (budget guard cuts at {budget - BUDGET_SAFETY})")

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def run_one(item):
        nonlocal spent
        kind, name, cost, kwargs = item
        if name in existing_names:
            log(f"[SKIP] {name}: already rendered")
            return None
        kf_name = kwargs.get("needs_keyframe")
        kf_missing = kind == "video" and not (keyframes.get(kf_name) if kf_name else False)
        guard_cost = cost + (1 if kf_missing else 0)
        if spent + guard_cost > budget - BUDGET_SAFETY:
            log(f"[SKIP] {name}: budget guard")
            return None
        async with semaphore:
            if kind == "image":
                out = await submit_image(kwargs.pop("prompt"), name, **kwargs)
            else:
                prompt = kwargs.pop("prompt", "")
                kf_url = keyframes.get(kf_name) if kf_name else None
                if not kf_url:
                    kf_spec = media_style.build_manual_prompt(
                        prompt=prompt,
                        kind="image",
                        world_name="Underworld",
                        time_of_day=kwargs.get("tod", "dusk"),
                        weather=kwargs.get("weather", "clear"),
                        era=kwargs.get("era", "modern"),
                        biome=kwargs.get("biome", "plains"),
                    )
                    kf_result = await higgsfield.submit_image(
                        kf_spec["prompt"],
                        model=kf_spec["model"],
                        quality="basic",
                        width_and_height=kf_spec["width_and_height"],
                        negative_prompt=kf_spec["negative_prompt"],
                        seed=42,
                    )
                    if kf_result.get("ok"):
                        kf_rid = higgsfield.request_id_from_response(kf_result["data"])
                        kf_url = await _poll_for_url(kf_rid)
                        if kf_url:
                            spent += 1
                if not kf_url:
                    log(f"[FAIL] {name}: no keyframe")
                    return None
                out = await submit_video(prompt, name, kf_url, **kwargs)
            if out and out.get("url"):
                spent += cost
                if out["kind"] == "image":
                    keyframes[out["name"]] = out["url"]
                return out
            return None

    await asyncio.gather(*[run_one(t) for t in tasks])

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    log(f"\nRound 7 complete: spent {spent} credits")
    log(f"Total manifest now at {manifest['completed']} assets")


if __name__ == "__main__":
    asyncio.run(main())
