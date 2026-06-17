#!/usr/bin/env python3
"""Fifth-pass render using 410 additional Higgsfield credits for hero alternates,
extra gameplay/saga/guild videos, and detail stills."""

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
BUDGET_TOTAL = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_TOTAL", "410"))
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
            "aspect_ratio": aspect,
            "credits_est": _image_cost(quality),
            "render_round": 5,
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
            "render_round": 5,
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
    log(f"Loaded {len(keyframes)} existing keyframes")

    tasks: list[tuple] = []

    er = ["stone", "bronze", "iron", "classical", "medieval", "industrial", "modern", "future"]
    bm = ["plains", "forest", "desert", "tundra", "coast", "mountain", "wetland", "volcanic"]
    gl = ["physics", "mechanical", "electrical", "civil", "materials", "energy", "computing", "maths", "agriculture", "patent", "safety"]

    # 1. Alternate hero establishing shots per era×biome (16 images, 32 credits)
    for era in er:
        for biome in bm[era == "modern" and 0 or 0:]:
            name = f"alt_cross_{era}_{biome}"
            if name not in keyframes:
                tasks.append(("image", name, 2, {
                    "prompt": f"wide establishing shot of a thriving {era} era colony in the {biome} biome at golden hour",
                    "aspect": "21:9", "era": era, "biome": biome,
                }))

    # 2. Detail shots: era-specific technology (8 images, 16 credits)
    techs = {
        "stone": "stone tools and fire pits",
        "bronze": "bronze forges and pottery wheels",
        "iron": "iron weapons and ploughs",
        "classical": "marble columns and aqueducts",
        "medieval": "cathedral spires and mills",
        "industrial": "steam engines and smokestacks",
        "modern": "neon signs and highways",
        "future": "holographic displays and arcologies",
    }
    for era, tech in techs.items():
        tasks.append(("image", f"detail_tech_{era}", 2, {
            "prompt": f"close-up detail shot of {tech} in a {era} era Underworld district",
            "aspect": "16:9", "era": era,
        }))

    # 3. Alternate building detail shots (22 images, 44 credits)
    buildings = ["school", "hospital", "clinic", "hotel", "factory", "gym", "store", "office", "skyscraper",
                 "bank", "apartment", "police", "fire_station", "restaurant", "library", "train_station",
                 "bus_station", "subway", "power_plant", "park", "church", "water_works"]
    for b in buildings:
        tasks.append(("image", f"detail_building_{b}", 2, {
            "prompt": f"cinematic detail shot of a {b} in Underworld, signage and entrance",
            "aspect": "16:9",
        }))

    # 4. More interaction moments (12 images, 24 credits)
    interactions = ["mentor", "rival", "collab", "romance", "betray", "debate", "console", "inspire",
                    "challenge", "gossip", "forgive", "recruit"]
    for inter in interactions:
        tasks.append(("image", f"alt_interaction_{inter}", 2, {
            "prompt": f"two minions in a {inter} interaction, cinematic close-up",
            "aspect": "16:9",
        }))

    # 5. More saga beat images (11 images, 22 credits)
    sagas = ["mentorship", "great_discovery", "plague_trial", "rivalry", "lost_knowledge",
             "legacy", "first_of_kind", "renaissance", "wanderer", "reconciliation", "prodigy"]
    for saga in sagas:
        tasks.append(("image", f"alt_saga_{saga}", 2, {
            "prompt": f"a pivotal moment from the saga of {saga.replace('_', ' ')}, dramatic composition",
            "aspect": "16:9",
        }))

    # 6. More gameplay videos (15 videos, ~150 credits)
    gameplay = [
        ("gameplay_arrest", "police minions escort a prisoner", "kling-v2-1", "situation_conflict"),
        ("gameplay_concert", "minions play instruments in a plaza concert", "kling-v2-1", "situation_festival"),
        ("gameplay_surgery", "surgeons operate in a futuristic hospital", "kling-v2-1", "situation_research"),
        ("gameplay_trial", "a minion stands before judges in a courtroom", "kling-v2-1", "situation_conflict"),
        ("gameplay_graduation", "minions toss caps in the air", "kling-v2-1", "situation_festival"),
        ("gameplay_fire", "firefighter minions battle a blaze", "kling-v2-1", "situation_disaster"),
        ("gameplay_flood", "minions sandbag a street against rising water", "kling-v2-1", "situation_disaster"),
        ("gameplay_famine", "minions queue for rations in a grim plaza", "kling-v2-1-master", "situation_death"),
        ("gameplay_election", "minions vote at holographic booths", "kling-v2-1", "situation_festival"),
        ("gameplay_protest", "minions wave signs outside a capitol", "kling-v2-1-master", "situation_conflict"),
        ("gameplay_wedding_dance", "minions dance at a wedding reception", "dop-preview", "interaction_romance"),
        ("gameplay_funeral_procession", "minions carry a coffin through rain", "kling-v2-1-master", "situation_death"),
        ("gameplay_space_launch", "a rocket launches from a future colony", "kling-v2-1-master", "situation_discovery"),
        ("gameplay_ai_awakening", "a minion's eyes glow as AI awakens", "kling-v2-1-master", "situation_discovery"),
        ("gameplay_time_warp", "a district shifts from medieval to future in a flash", "kling-v2-1-master", "hero_world_poster"),
    ]
    for name, desc, model, kf in gameplay:
        cost = _video_cost(model)
        tasks.append(("video", name, cost, {
            "prompt": desc + ", gameplay capture",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # 7. Guild-specific videos (5 videos, ~60 credits)
    guild_videos = [
        ("guild_video_physics", "physics guild minions conduct a particle experiment", "kling-v2-1-master", "guild_physics"),
        ("guild_video_mechanical", "mechanical guild minions assemble a giant engine", "kling-v2-1", "guild_mechanical"),
        ("guild_video_energy", "energy guild minions tend a fusion reactor", "kling-v2-1-master", "guild_energy"),
        ("guild_video_computing", "computing guild minions work in a server farm", "kling-v2-1", "guild_computing"),
        ("guild_video_agriculture", "agriculture guild minions harvest glowing crops", "kling-v2-1", "guild_agriculture"),
    ]
    for name, desc, model, kf in guild_videos:
        cost = _video_cost(model)
        tasks.append(("video", name, cost, {
            "prompt": desc + ", gameplay capture",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # 8. More saga videos (5 videos, ~55 credits)
    saga_videos = [
        ("saga_video_mentorship", "an elder minion teaches a child minion", "kling-v2-1", "saga_mentorship"),
        ("saga_video_rivalry", "two rival minions face each other across a table", "kling-v2-1-master", "saga_rivalry"),
        ("saga_video_lost_knowledge", "minions discover a hidden archive", "kling-v2-1-master", "saga_lost_knowledge"),
        ("saga_video_renaissance", "a colony bursts into artistic revival", "kling-v2-1", "saga_renaissance"),
        ("saga_video_prodigy", "a young minion invents a glowing device", "kling-v2-1", "saga_prodigy"),
    ]
    for name, desc, model, kf in saga_videos:
        cost = _video_cost(model)
        tasks.append(("video", name, cost, {
            "prompt": desc + ", cinematic saga moment",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # 9. More emotion close-ups with different lighting (10 images, 20 credits)
    emotions = ["joy", "fear", "anger", "grief", "awe", "curiosity", "dread", "purpose", "resentment", "trust"]
    for emo in emotions:
        tasks.append(("image", f"alt_emotion_{emo}", 2, {
            "prompt": f"close-up portrait of a minion expressing {emo}, dramatic lighting",
            "aspect": "9:16",
        }))

    # 10. Night cityscapes per biome (8 images, 16 credits)
    for biome in bm:
        tasks.append(("image", f"night_city_{biome}", 2, {
            "prompt": f"a futuristic Underworld city in the {biome} biome at night, neon skyline",
            "aspect": "21:9", "biome": biome, "tod": "night",
        }))

    # Shuffle to spread categories
    random.seed(42)
    random.shuffle(tasks)

    log(f"Round 5 queued: {len(tasks)} tasks, estimated {sum(t[2] for t in tasks)} credits")

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def run_one(item):
        nonlocal spent
        kind, name, cost, kwargs = item
        if name in existing_names:
            log(f"[SKIP] {name}: already rendered")
            return None
        if spent + cost > budget - BUDGET_SAFETY:
            log(f"[SKIP] {name}: budget guard")
            return None
        async with semaphore:
            if kind == "image":
                out = await submit_image(kwargs.pop("prompt"), name, **kwargs)
            else:
                prompt = kwargs.pop("prompt", "")
                kf_name = kwargs.pop("needs_keyframe", None)
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
    log(f"\nRound 5 complete: spent {spent} credits")
    log(f"Total manifest now at {manifest['completed']} assets")


if __name__ == "__main__":
    asyncio.run(main())
