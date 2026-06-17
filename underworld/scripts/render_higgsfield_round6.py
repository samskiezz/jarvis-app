#!/usr/bin/env python3
"""Sixth (final) Higgsfield pass using ~500 credits to fill coverage gaps,
retry Round 5 failures, and add final gameplay/hero videos."""

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
BUDGET_TOTAL = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_TOTAL", "500"))
BUDGET_SAFETY = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_SAFETY", "10"))
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
            "emotion": kwargs.get("emotion"),
            "aspect_ratio": aspect,
            "credits_est": _image_cost(quality),
            "render_round": 6,
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
            "render_round": 6,
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

    # 1. Retry Round 5 failures (2 videos, ~34 credits)
    retries = [
        ("gameplay_funeral_procession", "minions carry a coffin through rain", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_famine", "minions queue for rations in a grim plaza", "kling-v2-1-master", "hero_world_poster"),
    ]
    for name, desc, model, kf in retries:
        tasks.append(("video", name, _video_cost(model), {
            "prompt": desc + ", gameplay capture",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # 2. Complete the 18-emotion portrait set (4 images, 8 credits)
    for emo in ["anticipation", "love", "guilt", "determination"]:
        tasks.append(("image", f"emotion_{emo}", 2, {
            "prompt": f"close-up portrait of a minion expressing {emo}, dramatic lighting",
            "aspect": "9:16", "emotion": emo,
        }))

    # 3. Complete the 7-stage life cycle (2 images, 4 credits)
    for stage in ["toddler", "teen"]:
        tasks.append(("image", f"lifestage_{stage}", 2, {
            "prompt": f"a {stage} minion in Underworld, full of life, cinematic portrait",
            "aspect": "9:16",
        }))

    # 4. Complete the TOD × weather hero matrix (14 images, 28 credits)
    tods = ["dawn", "day", "dusk", "night"]
    weathers = ["clear", "rain", "storm", "fog", "snow"]
    for tod in tods:
        for weather in weathers:
            name = f"matrix_tod_{tod}_weather_{weather}"
            tasks.append(("image", name, 2, {
                "prompt": f"hero establishing shot of Underworld city at {tod} with {weather} weather",
                "aspect": "21:9", "tod": tod, "weather": weather,
            }))

    # 5. Final gameplay videos (10 videos, ~110 credits)
    gameplay = [
        ("gameplay_coronation", "a minion crowned in a grand plaza", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_revolution", "minions tear down a statue in revolt", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_plague", "minions in masks tend to the sick", "kling-v2-1", "hero_world_poster"),
        ("gameplay_drought", "minions dig for water in cracked earth", "kling-v2-1", "hero_world_poster"),
        ("gameplay_earthquake", "minions flee as buildings shake", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_volcano", "minions evacuate beneath an erupting volcano", "kling-v2-1-master", "hero_world_poster"),
        ("gameplay_cure", "a scientist minion holds a glowing cure", "kling-v2-1", "situation_discovery"),
        ("gameplay_rescue", "rescuers pull a minion from rubble", "kling-v2-1", "situation_conflict"),
        ("gameplay_inquisition", "minions judge a heretic in a torch-lit hall", "kling-v2-1-master", "situation_conflict"),
        ("gameplay_exploration", "minions venture into an uncharted biome", "kling-v2-1-master", "situation_discovery"),
    ]
    for name, desc, model, kf in gameplay:
        tasks.append(("video", name, _video_cost(model), {
            "prompt": desc + ", gameplay capture",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # 6. Soul IDs — recurring hero minion portraits (10 images, 20 credits)
    soul_ids = ["kael", "lina", "orin", "sora", "mira", "jax", "elara", "naveen", "yuki", "dante"]
    for soul in soul_ids:
        tasks.append(("image", f"soul_id_{soul}", 2, {
            "prompt": f"consistent hero minion portrait of {soul}, neutral expression, front-facing, clean background",
            "aspect": "1:1",
        }))

    # 7. Final hero still variants (4 images, 8 credits)
    hero_variants = [
        ("hero_world_poster_winter", "wide hero shot of Underworld city in winter snow"),
        ("hero_world_poster_festival", "wide hero shot of Underworld city during a grand festival"),
        ("hero_world_poster_rain", "wide hero shot of Underworld city in a rainy neon night"),
        ("hero_world_poster_dawn", "wide hero shot of Underworld city at first light"),
    ]
    for name, prompt in hero_variants:
        tasks.append(("image", name, 2, {
            "prompt": prompt, "aspect": "21:9",
        }))

    random.seed(42)
    random.shuffle(tasks)

    est = sum(t[2] for t in tasks)
    log(f"Round 6 queued: {len(tasks)} tasks, estimated {est} credits (budget guard will cut at {budget - BUDGET_SAFETY})")

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
    log(f"\nRound 6 complete: spent {spent} credits")
    log(f"Total manifest now at {manifest['completed']} assets")


if __name__ == "__main__":
    asyncio.run(main())
