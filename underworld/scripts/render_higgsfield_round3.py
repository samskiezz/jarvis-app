#!/usr/bin/env python3
"""Third-pass render to burn 500 additional Higgsfield credits on deeper coverage."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT.parent))

from underworld.server.services import higgsfield, media_style

MANIFEST_PATH = REPO_ROOT / "data" / "media_assets" / "higgsfield_master_manifest.json"
BUDGET_TOTAL = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_TOTAL", "500"))
BUDGET_SAFETY = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_SAFETY", "30"))
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


async def _poll_for_url(request_id: str, max_attempts: int = 45) -> str | None:
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


def _append_manifest(entry: dict) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["assets"].append(entry)
    manifest["completed"] = len(manifest["assets"])
    manifest["spent_estimated"] = manifest.get("spent_estimated", 0) + entry.get("credits_est", 0)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


async def submit_image(prompt: str, name: str, aspect: str = "16:9", **kwargs) -> dict | None:
    spec = media_style.build_manual_prompt(
        prompt=prompt,
        kind="image",
        world_name="Underworld",
        time_of_day=kwargs.get("tod", "dusk"),
        weather=kwargs.get("weather", "clear"),
        era=kwargs.get("era", "modern"),
        biome=kwargs.get("biome", "plains"),
        guild=kwargs.get("guild"),
        camera_preset=kwargs.get("camera"),
    )
    result = await higgsfield.submit_image(
        spec["prompt"],
        model=spec["model"],
        quality="high",
        width_and_height=spec["width_and_height"],
        negative_prompt=spec["negative_prompt"],
        seed=42,
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
            "credits_est": kwargs.get("cost", 2),
            "render_round": 3,
        }
        _append_manifest(entry)
    else:
        log(f"[FAIL] {name}: no url")
    return {"name": name, "kind": "image", "url": url, "request_id": rid, "prompt": spec["prompt"], "aspect": aspect, **kwargs}


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
        camera_preset=kwargs.get("camera"),
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
            "credits_est": kwargs.get("cost", 9),
            "render_round": 3,
        }
        _append_manifest(entry)
    else:
        log(f"[FAIL] {name}: no url")
    return {"name": name, "kind": "video", "url": url, "request_id": rid, "prompt": spec["prompt"], "model": model, "aspect": kwargs.get("aspect", "16:9"), **kwargs}


async def main():
    budget = BUDGET_TOTAL
    spent = 0
    completed: list[dict] = []

    keyframes: dict[str, str] = {}
    if MANIFEST_PATH.exists():
        existing = json.loads(MANIFEST_PATH.read_text())
        for a in existing.get("assets", []):
            if a["kind"] == "image" and a.get("url"):
                keyframes[a["name"]] = a["url"]
        log(f"Loaded {len(keyframes)} existing keyframes")

    tasks: list[tuple] = []

    er = ["stone", "bronze", "iron", "classical", "medieval", "industrial", "modern", "future"]
    bm = ["plains", "forest", "desert", "tundra", "coast", "mountain", "wetland", "volcanic"]
    gl = ["physics", "mechanical", "electrical", "civil", "materials", "energy", "computing", "maths", "agriculture", "patent", "safety"]
    wx = ["clear", "rain", "storm", "snow", "fog"]
    td = ["dawn", "day", "dusk", "night"]

    # 1. Complete era×biome matrix (remaining 54 combos, ~108 credits)
    done_cross = set(keyframes.keys())
    for era in er:
        for biome in bm:
            name = f"cross_{era}_{biome}"
            if name in done_cross:
                continue
            tasks.append(("image", name, 2, {
                "prompt": f"a colony in the {era} era within the {biome} biome, establishing shot",
                "aspect": "16:9", "era": era, "biome": biome,
            }))

    # 2. Biome weather/TOD studies per biome (8 biomes × 5 weather at dusk = 40, 80 credits)
    for biome in bm:
        for weather in wx:
            tasks.append(("image", f"biome_weather_{biome}_{weather}", 2, {
                "prompt": f"a modern Underworld district in the {biome} biome during {weather}, environmental study",
                "aspect": "16:9", "biome": biome, "weather": weather, "tod": "dusk",
            }))

    # 3. Guild-specific situations (11 guilds × 5 situations = 55, 110 credits)
    guild_sits = ["research", "build", "trade", "conflict", "festival"]
    for guild in gl:
        for sit in guild_sits:
            tasks.append(("image", f"guild_{guild}_{sit}", 2, {
                "prompt": f"minions of the {guild} guild in a {sit} situation, gameplay capture",
                "aspect": "16:9", "guild": guild,
            }))

    # 4. Era-specific landmark buildings (8 eras × 3 = 24, 48 credits)
    landmarks = ["capitol", "research spire", "market dome"]
    for era in er:
        for lm in landmarks:
            safe = lm.replace(" ", "_")
            tasks.append(("image", f"landmark_{era}_{safe}", 2, {
                "prompt": f"the {lm} of a {era} era Underworld colony, architectural hero shot",
                "aspect": "16:9", "era": era,
            }))

    # 5. More gameplay videos (12, ~110 credits)
    gameplay = [
        ("gameplay_farm", "minions tend glowing crops in vertical farms", "kling-v2-1", "situation_harvest"),
        ("gameplay_forge", "sparks fly as a minion hammers metal at a forge", "kling-v2-1", "situation_build"),
        ("gameup_schism", "two factions of minions face off in a plaza", "kling-v2-1-master", "situation_conflict"),
        ("gameplay_march", "a column of minions walks along a highway at dawn", "kling-v2-1", "situation_travel"),
        ("gameplay_storm", "minions shelter as a storm lashes the city", "kling-v2-1", "situation_disaster"),
        ("gameplay_market", "a bustling market with stalls and holographic prices", "kling-v2-1", "situation_trade"),
        ("gameplay_lab", "minions in lab coats operate futuristic equipment", "kling-v2-1", "situation_research"),
        ("gameplay_funeral", "minions carry a coffin through torchlit streets", "kling-v2-1", "situation_death"),
        ("gameplay_wedding", "minions exchange rings under a neon arch", "dop-preview", "interaction_romance"),
        ("gameplay_riot", "crowd of minions shakes fists at a god beam", "kling-v2-1-master", "situation_conflict"),
        ("gameplay_resurrect", "a minion reforms from golden particles", "kling-v2-1-master", "situation_birth"),
        ("gameplay_gift", "a glowing present descends from the sky to a minion", "kling-v2-1", "hero_world_poster"),
    ]
    for name, desc, model, kf in gameplay:
        tasks.append(("video", name, _video_cost(model) + 1, {
            "prompt": desc + ", gameplay capture",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # 6. Emotion close-ups per guild (11, 22 credits)
    emotions = ["joy", "fear", "anger", "grief", "awe", "curiosity", "dread"]
    for guild in gl:
        for emo in ["pride", "determination"]:
            tasks.append(("image", f"guild_emotion_{guild}_{emo}", 2, {
                "prompt": f"a {guild} guild minion showing {emo}, close-up portrait",
                "aspect": "9:16", "guild": guild,
            }))

    # 7. More civic interior rooms (10, 20 credits)
    rooms = ["courtroom", "classroom close-up", "hospital surgery", "bank vault", "factory assembly line",
             "server room", "greenhouse", "kitchen", "dormitory", "observatory"]
    for room in rooms:
        safe = room.replace(" ", "_")
        tasks.append(("image", f"interior2_{safe}", 2, {
            "prompt": f"interior of a {room} in Underworld, detailed shot",
            "aspect": "16:9",
        }))

    # Shuffle to spread categories
    import random
    random.seed(42)
    random.shuffle(tasks)

    log(f"Round 3 queued: {len(tasks)} tasks, estimated {sum(t[2] for t in tasks)} credits")

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def run_one(item):
        nonlocal spent
        kind, name, cost, kwargs = item
        if spent + cost > budget - BUDGET_SAFETY:
            log(f"[SKIP] {name}: budget guard")
            return None
        async with semaphore:
            if kind == "image":
                out = await submit_image(kwargs.pop("prompt"), name, **kwargs)
            else:
                kf_name = kwargs.pop("needs_keyframe", None)
                kf_url = keyframes.get(kf_name) if kf_name else None
                if not kf_url:
                    kf_prompt = kwargs.pop("prompt", "")
                    kf_spec = media_style.build_manual_prompt(
                        prompt=kf_prompt,
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
                out = await submit_video(kwargs.pop("prompt"), name, kf_url, **kwargs)
            if out and out.get("url"):
                spent += cost
                completed.append(out)
                if out["kind"] == "image":
                    keyframes[out["name"]] = out["url"]
                return out
            return None

    await asyncio.gather(*[run_one(t) for t in tasks])

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    log(f"\nRound 3 complete: {len(completed)} assets, {spent} credits spent")
    log(f"Total manifest now at {manifest['completed']} assets")


if __name__ == "__main__":
    asyncio.run(main())
