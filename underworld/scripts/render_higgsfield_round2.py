#!/usr/bin/env python3
"""Second-pass render to burn remaining Higgsfield credits on more coverage."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT.parent))

from underworld.server.services import higgsfield, media_style

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "data" / "media_assets" / "higgsfield_master_manifest.json"
BUDGET_TOTAL = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_TOTAL", "214"))
BUDGET_SAFETY = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_SAFETY", "20"))
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


def _neg() -> str:
    return media_style.DEFAULT_NEGATIVE_PROMPT


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
    else:
        log(f"[FAIL] {name}: no url")
    return {"name": name, "kind": "image", "url": url, "request_id": rid, "prompt": spec["prompt"], **kwargs}


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
    else:
        log(f"[FAIL] {name}: no url")
    return {"name": name, "kind": "video", "url": url, "request_id": rid, "prompt": spec["prompt"], "model": model, **kwargs}


async def main():
    budget = BUDGET_TOTAL
    spent = 0
    completed: list[dict] = []

    # Load existing manifest keyframes for video re-use
    keyframes: dict[str, str] = {}
    if MANIFEST_PATH.exists():
        existing = json.loads(MANIFEST_PATH.read_text())
        for a in existing.get("assets", []):
            if a["kind"] == "image" and a.get("url"):
                keyframes[a["name"]] = a["url"]
        log(f"Loaded {len(keyframes)} existing keyframes")

    tasks: list[tuple] = []

    # 1. Era × biome cross shots (10 combos, 20 credits)
    cross = [
        ("stone", "forest"), ("bronze", "desert"), ("iron", "coast"),
        ("classical", "mountain"), ("medieval", "tundra"),
        ("industrial", "wetland"), ("modern", "plains"), ("future", "volcanic"),
        ("modern", "coast"), ("future", "forest"),
    ]
    for era, biome in cross:
        tasks.append(("image", f"cross_{era}_{biome}", 2, {
            "prompt": f"a colony in the {era} era within the {biome} biome, establishing shot",
            "aspect": "16:9", "era": era, "biome": biome,
        }))

    # 2. Guild group shots (11, 22 credits)
    guilds = ["physics", "mechanical", "electrical", "civil", "materials", "energy", "computing", "maths", "agriculture", "patent", "safety"]
    for guild in guilds:
        tasks.append(("image", f"guild_group_{guild}", 2, {
            "prompt": f"a group of minions from the {guild} guild working together, gameplay capture",
            "aspect": "16:9", "guild": guild,
        }))

    # 3. Building interiors (12, 24 credits)
    interiors = ["lab", "classroom", "factory floor", "hospital ward", "library reading room", "church nave",
                 "office open plan", "restaurant dining", "train station concourse", "power plant turbine hall",
                 "apartment living room", "police station bullpen"]
    for interior in interiors:
        safe_name = interior.replace(" ", "_")
        tasks.append(("image", f"interior_{safe_name}", 2, {
            "prompt": f"interior of a {interior} in Underworld, detailed environmental shot",
            "aspect": "16:9",
        }))

    # 4. More gameplay videos (14, ~140 credits)
    gameplay = [
        ("gameplay_mining", "minions operate drilling machinery in a mine shaft", "kling-v2-1", "situation_build"),
        ("gameplay_worship", "crowd of minions kneels before a glowing altar", "kling-v2-1", "situation_ritual"),
        ("gameplay_teach", "an elder minion teaches children at a holographic blackboard", "kling-v2-1", "situation_research"),
        ("gameplay_invent", "a minion celebrates as a new machine sparks to life", "kling-v2-1", "situation_discovery"),
        ("gameplay_flee", "minions run from a disaster, emergency lighting, handheld camera", "kling-v2-1", "situation_disaster"),
        ("gameplay_rest", "minions sleep in dormitory pods, soft night lighting", "kling-v2-1", "situation_rest"),
        ("gameplay_marriage", "two minions exchange vows under a neon arch", "dop-preview", "interaction_romance"),
        ("gameplay_riot", "angry minion crowd confronts a god-view beam", "kling-v2-1-master", "situation_conflict"),
        ("gameplay_resurrect", "a dissolved minion re-forms from particles, divine light", "kling-v2-1-master", "situation_birth"),
        ("gameup_speak", "giant words descend from the sky as minions look up", "kling-v2-1", "hero_world_poster"),
        ("gameplay_recruit", "a recruiter minion hands a badge to a new citizen", "kling-v2-1", "interaction_recruit"),
        ("gameplay_grieve", "minions gather around a memorial, slow pull back", "kling-v2-1", "interaction_grieve"),
        ("gameplay_awakening", "a minion's eyes glow as it gains awareness", "kling-v2-1-master", "situation_idle"),
        ("gameup_rebellion", "minions raise fists toward the sky, defiant", "kling-v2-1-master", "situation_conflict"),
    ]
    for name, desc, model, kf in gameplay:
        tasks.append(("video", name, _video_cost(model) + 1, {
            "prompt": desc + ", gameplay capture",
            "model": model, "needs_keyframe": kf, "duration": 5,
        }))

    # 5. Emotion × guild portraits (11, 22 credits)
    for guild in guilds:
        tasks.append(("image", f"emotion_pride_{guild}", 2, {
            "prompt": f"a proud minion of the {guild} guild, portrait",
            "aspect": "9:16", "guild": guild, "camera": "static_hero",
        }))

    log(f"Round 2 queued: {len(tasks)} tasks, estimated {sum(t[2] for t in tasks)} credits")

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
                    # generate a keyframe on the fly cheaply
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

    # Append to existing manifest
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text())
    else:
        manifest = {"assets": [], "failed": []}
    for c in completed:
        manifest["assets"].append({
            "name": c["name"],
            "kind": c["kind"],
            "url": c["url"],
            "request_id": c.get("request_id"),
            "status": "completed",
            "model": c.get("model", "seedream"),
            "era": c.get("era", "modern"),
            "biome": c.get("biome", "plains"),
            "guild": c.get("guild"),
            "aspect_ratio": c.get("aspect", "16:9"),
            "duration": c.get("duration"),
            "tod": c.get("tod", "dusk"),
            "weather": c.get("weather", "clear"),
            "credits_est": c.get("cost", 2),
        })
    manifest["completed"] = len(manifest["assets"])
    manifest["spent_estimated"] = manifest.get("spent_estimated", 0) + spent
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    log(f"\nRound 2 complete: {len(completed)} assets, {spent} credits spent")
    log(f"Total manifest now at {manifest['completed']} assets")


if __name__ == "__main__":
    asyncio.run(main())
