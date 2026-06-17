#!/usr/bin/env python3
"""Clean up the last round-3 gaps with the remaining ~20 Higgsfield credits."""

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
BUDGET_TOTAL = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_TOTAL", "20"))
BUDGET_SAFETY = int(os.environ.get("UNDERWORLD_HIGGSFIELD_CREDIT_SAFETY", "2"))
MAX_CONCURRENT = int(os.environ.get("UNDERWORLD_HIGGSFIELD_MAX_CONCURRENT", "2"))
POLL_INTERVAL_S = 8


def log(msg: str) -> None:
    print(msg, flush=True)


def _append_manifest(entry: dict) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["assets"].append(entry)
    manifest["completed"] = len(manifest["assets"])
    manifest["spent_estimated"] = manifest.get("spent_estimated", 0) + entry.get("credits_est", 0)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


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


async def submit_image(prompt: str, name: str, **kwargs) -> dict | None:
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
            "aspect_ratio": "16:9",
            "credits_est": 2,
            "render_round": 4,
        }
        _append_manifest(entry)
        return entry
    log(f"[FAIL] {name}: no url")
    return None


async def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    done = {a["name"] for a in manifest.get("assets", [])}
    spent = 0

    tasks = [
        ("cross_stone_volcanic", "a stone-era colony in a volcanic biome, establishing shot", {"era": "stone", "biome": "volcanic"}),
        ("cross_medieval_plains", "a medieval-era colony in the plains biome, establishing shot", {"era": "medieval", "biome": "plains"}),
        ("cross_industrial_plains", "an industrial-era colony in the plains biome, establishing shot", {"era": "industrial", "biome": "plains"}),
        ("cross_modern_volcanic", "a modern-era colony in a volcanic biome, establishing shot", {"era": "modern", "biome": "volcanic"}),
        ("biome_weather_plains_snow", "a modern Underworld district in the plains biome during snow, environmental study", {"biome": "plains", "weather": "snow"}),
        ("biome_weather_forest_snow", "a modern Underworld district in the forest biome during snow, environmental study", {"biome": "forest", "weather": "snow"}),
        ("biome_weather_tundra_rain", "a modern Underworld district in the tundra biome during rain, environmental study", {"biome": "tundra", "weather": "rain"}),
        ("landmark_medieval_market_dome", "the market dome of a medieval era Underworld colony, architectural hero shot", {"era": "medieval"}),
        ("guild_emotion_electrical_pride", "an electrical guild minion showing pride, close-up portrait", {"guild": "electrical"}),
    ]

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def run_one(item):
        nonlocal spent
        name, prompt, kwargs = item
        if name in done:
            log(f"[SKIP] {name}: already exists")
            return None
        if spent + 2 > budget - BUDGET_SAFETY:
            log(f"[SKIP] {name}: budget guard")
            return None
        async with semaphore:
            out = await submit_image(prompt, name, **kwargs)
            if out:
                spent += 2
            return out

    budget = BUDGET_TOTAL
    await asyncio.gather(*[run_one(t) for t in tasks])
    log(f"\nRound 4 cleanup spent {spent} credits")


if __name__ == "__main__":
    asyncio.run(main())
