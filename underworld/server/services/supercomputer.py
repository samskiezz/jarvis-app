"""Higgsfield Supercomputer-style research campaigns for Underworld.

A campaign turns a research query into a persistent, multi-step media plan:
concept image → detail shots → explainer video. Each step becomes a
``MediaAsset`` row, so the scheduler's existing submit/poll/backup pipeline
executes the plan durably.
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import MediaAsset, MediaCampaign, World
from ..tools.safety import check_text as red_line_scan
from . import media_generator, media_style

log = structlog.get_logger(__name__)


def _plan_for_query(query: str, world: World | None = None) -> dict[str, Any]:
    """Build a design-brief driven research campaign plan for a query.

    Uses the GTA 5 × Sims 5 × Higgsfield visual thesis for concept,
    detail, and explainer video prompts.
    """
    era = getattr(world, "era", "iron") if world else "iron"
    world_name = getattr(world, "name", "Underworld") if world else "Underworld"
    biome = getattr(world, "weather", "plains") or "plains"
    era_desc = media_style.ERA_VISUALS.get(era, media_style.ERA_VISUALS["iron"])
    biome_desc = media_style.BIOME_VISUALS.get(biome, media_style.BIOME_VISUALS["plains"])
    negative = media_style.negative_prompt()

    base_prompt = (
        f"Cinematic wide shot of {world_name} in the {era} era, {biome_desc}, "
        f"dusk, light rain. Research breakthrough: '{query}'. {era_desc}. "
        "NaturalVision Evolved GTA 5 photorealism, volumetric clouds, "
        "screen-space puddle reflections, Unreal Engine 5 Lumen lighting, 16:9."
    )
    detail_prompt = (
        f"Photoreal close-up of a minion examining '{query}' technology in {world_name}. "
        f"{era_desc}, {biome_desc}, golden-hour light. Shallow depth of field, "
        "MetaHuman-grade detail, 35mm lens, cinematic colour grading."
    )
    video_prompt = (
        f"Slow dolly-in over the '{query}' prototype in {world_name}. "
        f"{era_desc}, {biome_desc}, dusk. Subtle parallax, holographic UI glow, "
        "photoreal gameplay capture, 16:9."
    )
    return {
        "query": query,
        "negative_prompt": negative,
        "steps": [
            {
                "kind": "image",
                "prompt": base_prompt,
                "model": media_style.MODEL_WORLD,
                "style_id": "Nature Light",
                "aspect_ratio": "16:9",
                "depends_on": None,
            },
            {
                "kind": "image",
                "prompt": detail_prompt,
                "model": media_style.MODEL_IMAGE,
                "style_id": "Warm Ambient",
                "aspect_ratio": "16:9",
                "depends_on": None,
            },
            {
                "kind": "video",
                "prompt": video_prompt,
                "model": media_style.MODEL_VIDEO_CINEMATIC,
                "motion_id": "dolly_in",
                "motion_strength": 0.6,
                "aspect_ratio": "16:9",
                "duration": 5,
                "depends_on": 0,
            },
        ],
    }


def _sanitize(prompt: str) -> tuple[bool, str]:
    try:
        result = red_line_scan(prompt)
        if result.blocked:
            return False, f"{result.rule}: {result.detail}"
    except Exception as exc:  # noqa: BLE001
        log.warning("supercomputer.safety_scan_failed", error=str(exc))
        return False, "safety scan unavailable"
    return True, ""


async def create_campaign(
    session: AsyncSession,
    world_id: str,
    query: str,
    name: str | None = None,
) -> MediaCampaign:
    """Create a pending research campaign from a query."""
    world = await session.get(World, world_id)
    if not world:
        raise ValueError("world not found")

    plan = _plan_for_query(query, world)
    ok, reason = _sanitize(query)
    if not ok:
        campaign = MediaCampaign(
            world_id=world_id,
            name=name or f"Research: {query[:60]}",
            query=query,
            status="failed",
            plan={**plan, "error": reason},
        )
        session.add(campaign)
        await session.flush()
        return campaign

    campaign = MediaCampaign(
        world_id=world_id,
        name=name or f"Research: {query[:60]}",
        query=query,
        status="pending",
        plan=plan,
    )
    session.add(campaign)
    await session.flush()

    # Pre-create asset rows for every step so they survive restarts.
    for idx, step in enumerate(plan["steps"]):
        asset = MediaAsset(
            world_id=world_id,
            event_kind="supercomputer:research",
            event_key=f"campaign:{campaign.id}:step:{idx}",
            kind=step["kind"],
            prompt=step["prompt"],
            status="pending",
            credits_estimated=media_generator._credit_estimate(
                step["kind"], step.get("model")
            ),
            tick=world.tick,
            payload={
                "campaign_id": campaign.id,
                "step_index": idx,
                "trigger": "supercomputer",
                "model": step.get("model"),
                "motion_id": step.get("motion_id"),
                "motion_strength": step.get("motion_strength"),
                "negative_prompt": plan.get("negative_prompt"),
                "style_id": step.get("style_id"),
                "style_strength": 0.7,
                "aspect_ratio": step.get("aspect_ratio"),
                "duration": step.get("duration"),
            },
        )
        session.add(asset)

    await session.flush()
    log.info("supercomputer.campaign_created", campaign_id=campaign.id, query=query)
    return campaign


async def advance_campaign(session: AsyncSession, campaign_id: str) -> MediaCampaign:
    """Submit the next runnable step(s) of a campaign.

    Steps with ``depends_on`` wait until the referenced step's asset has a URL.
    """
    campaign = await session.get(MediaCampaign, campaign_id)
    if not campaign or campaign.status in ("completed", "failed"):
        return campaign

    settings = get_settings()
    if not settings.higgsfield_enabled or not (
        settings.higgsfield_credential
        or (settings.higgsfield_key_id and settings.higgsfield_key_secret)
    ):
        campaign.status = "failed"
        campaign.plan = {**campaign.plan, "error": "higgsfield not enabled"}
        await session.flush()
        return campaign

    plan = campaign.plan
    steps = plan.get("steps", [])
    if not steps:
        campaign.status = "completed"
        await session.flush()
        return campaign

    all_completed = True
    any_running = False

    for idx, step in enumerate(steps):
        event_key = f"campaign:{campaign.id}:step:{idx}"
        asset = await session.scalar(
            select(MediaAsset).where(
                MediaAsset.world_id == campaign.world_id,
                MediaAsset.event_key == event_key,
            )
        )
        if not asset:
            continue

        if asset.status in ("running", "pending"):
            any_running = True
            all_completed = False
            continue
        if asset.status in ("completed", "failed", "moderated"):
            continue

        # Check dependency.
        dep = step.get("depends_on")
        if dep is not None:
            dep_key = f"campaign:{campaign.id}:step:{dep}"
            dep_asset = await session.scalar(
                select(MediaAsset).where(
                    MediaAsset.world_id == campaign.world_id,
                    MediaAsset.event_key == dep_key,
                )
            )
            if not dep_asset or dep_asset.status != "completed" or not dep_asset.url:
                all_completed = False
                continue
            asset.payload = {
                **(asset.payload or {}),
                "image_url": dep_asset.url,
            }

        # Budget check.
        daily_used = await media_generator._daily_credit_usage(
            session, campaign.world_id
        )
        budget = settings.higgsfield_credit_budget_daily
        est = asset.credits_estimated or media_generator._credit_estimate(
            asset.kind, step.get("model")
        )
        if daily_used + est > budget:
            all_completed = False
            log.info(
                "supercomputer.budget_deferred",
                campaign_id=campaign.id,
                step=idx,
                daily_used=daily_used,
                budget=budget,
            )
            continue

        asset.status = "pending"
        await session.flush()
        any_running = True
        all_completed = False

    if all_completed:
        campaign.status = "completed"
    elif any_running:
        campaign.status = "running"
    # If nothing is runnable and not all completed, leave status as-is.

    await session.flush()
    return campaign


async def campaign_progress(session: AsyncSession, campaign_id: str) -> dict[str, Any]:
    """Return a campaign with per-step asset status."""
    campaign = await session.get(MediaCampaign, campaign_id)
    if not campaign:
        raise ValueError("campaign not found")

    steps_out = []
    for idx, step in enumerate(campaign.plan.get("steps", [])):
        event_key = f"campaign:{campaign.id}:step:{idx}"
        asset = await session.scalar(
            select(MediaAsset).where(
                MediaAsset.world_id == campaign.world_id,
                MediaAsset.event_key == event_key,
            )
        )
        steps_out.append(
            {
                "index": idx,
                "kind": step.get("kind"),
                "prompt": step.get("prompt"),
                "asset_id": asset.id if asset else None,
                "status": asset.status if asset else "missing",
                "url": asset.url if asset else None,
                "local_path": asset.local_path if asset else None,
            }
        )

    return {
        "id": campaign.id,
        "world_id": campaign.world_id,
        "name": campaign.name,
        "query": campaign.query,
        "status": campaign.status,
        "created_at": campaign.created_at,
        "updated_at": campaign.updated_at,
        "steps": steps_out,
    }
