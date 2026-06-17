"""Media asset routes for the Underworld-Higgsfield pipeline.

Exposes generated image/video assets, manual trigger, budget, status polling,
motion presets, and request cancellation. All routes are protected by bearer token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..config import get_settings
from ..db.models import MediaAsset, MediaCampaign, World
from ..db.session import get_session
from ..services import higgsfield, media_generator, media_style, supercomputer
from .schemas import (
    MediaAssetOut,
    MediaBackupStatusOut,
    MediaBudgetOut,
    MediaCampaignCreate,
    MediaCampaignOut,
    MediaCancelOut,
    MediaExportOut,
    MediaListOut,
    MediaMotionOut,
    MediaMotionsOut,
    MediaTriggerOut,
    MediaTriggerRequest,
)

router = APIRouter(prefix="/worlds/{world_id}/media", tags=["media"])


async def _world_or_404(session: AsyncSession, world_id: str) -> World:
    world = await session.get(World, world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world not found")
    return world


def _asset_out(asset: MediaAsset) -> MediaAssetOut:
    return MediaAssetOut(
        id=asset.id,
        world_id=asset.world_id,
        minion_id=asset.minion_id,
        event_kind=asset.event_kind,
        event_key=asset.event_key,
        kind=asset.kind,
        prompt=asset.prompt,
        status=asset.status,
        remote_request_id=asset.remote_request_id,
        url=asset.url,
        local_path=asset.local_path,
        credits_estimated=asset.credits_estimated,
        tick=asset.tick,
        created_at=asset.created_at,
        generated_at=asset.generated_at,
    )


def _ensure_higgsfield_enabled() -> None:
    settings = get_settings()
    if not settings.higgsfield_enabled:
        raise HTTPException(status_code=503, detail="higgsfield media generation is disabled")
    if not (
        settings.higgsfield_credential
        or (settings.higgsfield_key_id and settings.higgsfield_key_secret)
    ):
        raise HTTPException(status_code=503, detail="higgsfield credentials not configured")


@router.get("", response_model=MediaListOut)
async def list_media(
    world_id: str,
    status: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """List media assets for a world, newest first."""
    await _world_or_404(session, world_id)
    assets = await media_generator.list_world_media(
        session, world_id, status=status, kind=kind, limit=limit, offset=offset
    )
    return MediaListOut(world_id=world_id, assets=[_asset_out(a) for a in assets])


@router.post("/trigger", response_model=MediaTriggerOut, status_code=201)
async def trigger_media(
    world_id: str,
    body: MediaTriggerRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Manually enqueue a media generation job for a world."""
    world = await _world_or_404(session, world_id)
    _ensure_higgsfield_enabled()

    daily_used = await media_generator._daily_credit_usage(session, world_id)
    budget = get_settings().higgsfield_credit_budget_daily
    est = media_generator._credit_estimate(body.kind, body.model)
    if daily_used + est > budget:
        raise HTTPException(
            status_code=429,
            detail=f"daily credit budget exhausted: {daily_used}/{budget}",
        )

    # Apply the design-brief visual language to manual prompts unless the user
    # explicitly supplied a fully-formed prompt longer than 120 characters.
    prompt = body.prompt
    prompt_data = {
        "trigger": "manual",
        "kind": body.kind,
        "model": body.model,
        "image_url": body.image_url,
        "motion_id": body.motion_id or body.camera_preset,
        "motion_strength": body.motion_strength,
        "style_id": body.style_id,
        "style_strength": body.style_strength,
        "negative_prompt": body.negative_prompt,
        "aspect_ratio": body.aspect_ratio,
        "duration": body.duration,
    }
    if len(body.prompt) <= 120:
        styled = media_style.build_manual_prompt(
            prompt=body.prompt,
            kind=body.kind,
            world_name=world.name,
            era=world.era,
            biome=getattr(world, "weather", "plains") or "plains",
            camera_preset=body.camera_preset,
            style_id=body.style_id,
        )
        prompt = styled["prompt"]
        for key in ("negative_prompt", "model", "aspect_ratio", "duration",
                    "style_id", "style_strength", "width_and_height",
                    "motion_id", "motion_strength"):
            if prompt_data.get(key) is None and styled.get(key) is not None:
                prompt_data[key] = styled[key]

    ok, reason = media_generator._sanitize_prompt(prompt)
    if not ok:
        asset = MediaAsset(
            world_id=world_id,
            minion_id=body.minion_id,
            event_kind=body.event_kind,
            event_key=f"manual:{body.kind}:{hash(prompt + body.event_kind) & 0xFFFFFFFF}",
            kind=body.kind,
            prompt=prompt,
            status="moderated",
            credits_estimated=0,
            tick=world.tick,
            payload={"reason": reason, **prompt_data},
        )
        session.add(asset)
        await session.flush()
        return MediaTriggerOut(asset_id=asset.id, status=asset.status)

    asset = MediaAsset(
        world_id=world_id,
        minion_id=body.minion_id,
        event_kind=body.event_kind,
        event_key=f"manual:{body.kind}:{hash(prompt + body.event_kind) & 0xFFFFFFFF}",
        kind=body.kind,
        prompt=prompt,
        status="pending",
        credits_estimated=est,
        tick=world.tick,
        payload=prompt_data,
    )
    session.add(asset)
    await session.flush()
    return MediaTriggerOut(asset_id=asset.id, status=asset.status)


@router.get("/budget", response_model=MediaBudgetOut)
async def get_media_budget(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Return today's estimated credit usage vs the daily budget."""
    await _world_or_404(session, world_id)
    settings = get_settings()
    daily_used = await media_generator._daily_credit_usage(session, world_id)
    return MediaBudgetOut(
        world_id=world_id,
        daily_budget=settings.higgsfield_credit_budget_daily,
        daily_used=daily_used,
        remaining=max(0, settings.higgsfield_credit_budget_daily - daily_used),
    )


@router.post("/poll", response_model=MediaListOut)
async def poll_media(
    world_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Poll Higgsfield for running jobs and return updated assets."""
    await _world_or_404(session, world_id)
    _ensure_higgsfield_enabled()

    completed = await media_generator.poll_running_jobs(limit=limit)
    world_assets = [a for a in completed if a.world_id == world_id]
    return MediaListOut(world_id=world_id, assets=[_asset_out(a) for a in world_assets])


@router.get("/motions", response_model=MediaMotionsOut)
async def list_motions(_token: str = Depends(require_bearer)):
    """List available Higgsfield motion presets (v2 only)."""
    _ensure_higgsfield_enabled()
    result = await higgsfield.list_motions()
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=result.get("error") or "motion list failed")
    motions = result.get("data", [])
    return MediaMotionsOut(
        motions=[
            MediaMotionOut(
                id=m.get("id"),
                name=m.get("name"),
                description=m.get("description"),
                preview_url=m.get("preview_url"),
            )
            for m in motions
            if isinstance(m, dict)
        ]
    )


@router.post("/cancel/{request_id}", response_model=MediaCancelOut)
async def cancel_media_request(
    world_id: str,
    request_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Cancel a queued Higgsfield request and mark the local asset failed."""
    await _world_or_404(session, world_id)
    _ensure_higgsfield_enabled()

    result = await higgsfield.cancel_request(request_id)
    # Also mark local asset cancelled/failed if found.
    stmt = select(MediaAsset).where(
        MediaAsset.world_id == world_id,
        MediaAsset.remote_request_id == request_id,
    )
    rows = await session.execute(stmt)
    asset = rows.scalar_one_or_none()
    if asset:
        asset.status = "failed"
        asset.payload = {
            **(asset.payload or {}),
            "cancelled": True,
            "cancel_result": result,
        }
        await session.flush()
    return MediaCancelOut(request_id=request_id, cancelled=result.get("ok", False), detail=result)


@router.get("/backup-status", response_model=MediaBackupStatusOut)
async def get_backup_status(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Return how many completed assets are backed up locally vs total."""
    await _world_or_404(session, world_id)
    from ..services import media_backup

    status = await media_backup.get_backup_status(session, world_id)
    return MediaBackupStatusOut(**status)


@router.post("/export", response_model=MediaExportOut)
async def export_world_media(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Zip all locally backed-up media for a world and return the archive path."""
    await _world_or_404(session, world_id)
    from ..services import media_backup

    zip_path, asset_count = await media_backup.export_world_media(world_id)
    stat = zip_path.stat()
    return MediaExportOut(
        world_id=world_id,
        zip_path=str(zip_path),
        asset_count=asset_count,
        size_bytes=stat.st_size,
    )


@router.get("/export/download")
async def download_world_media_export(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Create and stream the world's media export zip."""
    await _world_or_404(session, world_id)
    from ..services import media_backup

    zip_path, _ = await media_backup.export_world_media(world_id)
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{world_id}_media_export.zip",
    )


@router.post("/campaigns", response_model=MediaCampaignOut, status_code=201)
async def create_campaign(
    world_id: str,
    body: MediaCampaignCreate,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Create a Supercomputer research campaign from a query."""
    await _world_or_404(session, world_id)
    _ensure_higgsfield_enabled()
    campaign = await supercomputer.create_campaign(
        session, world_id, body.query, name=body.name
    )
    return MediaCampaignOut(**await supercomputer.campaign_progress(session, campaign.id))


@router.get("/campaigns", response_model=list[MediaCampaignOut])
async def list_campaigns(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """List research campaigns for a world."""
    await _world_or_404(session, world_id)
    stmt = (
        select(MediaCampaign)
        .where(MediaCampaign.world_id == world_id)
        .order_by(MediaCampaign.created_at.desc())
    )
    rows = await session.execute(stmt)
    campaigns = rows.scalars().all()
    result = []
    for c in campaigns:
        result.append(
            MediaCampaignOut(**await supercomputer.campaign_progress(session, c.id))
        )
    return result


@router.get("/campaigns/{campaign_id}", response_model=MediaCampaignOut)
async def get_campaign(
    world_id: str,
    campaign_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Get a single campaign with step-by-step progress."""
    await _world_or_404(session, world_id)
    campaign = await session.get(MediaCampaign, campaign_id)
    if not campaign or campaign.world_id != world_id:
        raise HTTPException(status_code=404, detail="campaign not found")
    return MediaCampaignOut(**await supercomputer.campaign_progress(session, campaign.id))


@router.post("/campaigns/{campaign_id}/advance", response_model=MediaCampaignOut)
async def advance_campaign(
    world_id: str,
    campaign_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Manually advance a campaign (submit next runnable steps)."""
    await _world_or_404(session, world_id)
    _ensure_higgsfield_enabled()
    campaign = await session.get(MediaCampaign, campaign_id)
    if not campaign or campaign.world_id != world_id:
        raise HTTPException(status_code=404, detail="campaign not found")
    await supercomputer.advance_campaign(session, campaign.id)
    return MediaCampaignOut(**await supercomputer.campaign_progress(session, campaign.id))
