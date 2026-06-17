"""Event-driven generative-media service for Underworld.

Turns simulation events into Higgsfield image/video prompts, submits them
asynchronously, caches results by (world, event_key, kind), and exposes the
finished assets through the scene-state contract.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from underworld.server.config import get_settings
from underworld.server.db.models import Event, MediaAsset, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.tools.safety import check_text as red_line_scan

from . import higgsfield, media_backup, media_style

log = structlog.get_logger(__name__)

# Event kinds that can produce media, mapped to default media kind and priority.
# Lower number = higher priority when the daily budget is tight.
EVENT_MEDIA_CONFIG: dict[str, dict[str, Any]] = {
    "era:promoted": {"kind": "image", "priority": 1, "model": None},
    "saga:begins": {"kind": "image", "priority": 2, "model": None},
    "invention:operator_approve": {"kind": "image", "priority": 3, "model": None},
    "project:approved": {"kind": "image", "priority": 3, "model": None},
    "discovery:tech": {"kind": "image", "priority": 4, "model": None},
    "art:created": {"kind": "image", "priority": 5, "model": None},
    "gateway:passed": {"kind": "image", "priority": 5, "model": None},
    # Rare video beats (only when explicitly enabled and budget allows).
    "director:god_beat": {"kind": "video", "priority": 1, "model": None},
}


def _event_key(event: Event) -> str:
    """Deterministic cache key for an event.

    Same event semantics + same world/era/tick should reuse the same asset.
    """
    payload = event.payload or {}
    # Use a stable subset of payload to avoid spurious re-generation.
    stable_parts = []
    for k in sorted(payload.keys()):
        if k in ("tick", "at", "created_at", "timestamp"):
            continue
        v = payload[k]
        if isinstance(v, (str, int, float, bool)):
            stable_parts.append(f"{k}={v}")
    payload_str = "|".join(stable_parts)
    raw = f"{event.world_id}:{event.kind}:{event.actor_id or ''}:{payload_str}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _credit_estimate(kind: str, model: str | None = None) -> int:
    """Rough credit estimate for budgeting. Tuned to Higgsfield/Pixazo 2026 pricing."""
    if kind == "video":
        # Kling 2.1 Pro ~22 credits for 5s; dop-lite ~15.
        return 22 if model and "kling" in model.lower() else 15
    # Images: Soul/Seedream ~1-5 credits.
    return 2


def _prompt_for_event(event: Event, world: World, minion: Minion | None) -> dict[str, Any]:
    """Build a design-brief prompt package from a simulation event."""
    cfg = EVENT_MEDIA_CONFIG.get(event.kind, {"kind": "image", "priority": 99})
    media_kind = cfg["kind"]

    # Derive time-of-day from the world tick for visual consistency.
    time_of_day = "day"
    tick_hour = event.tick % 24
    if tick_hour < 5 or tick_hour > 20:
        time_of_day = "night"
    elif tick_hour < 8:
        time_of_day = "dawn"
    elif tick_hour > 16:
        time_of_day = "dusk"

    # Weather is stored on the world record; fall back to clear.
    weather = getattr(world, "weather", "clear") or "clear"

    data = media_style.build_event_prompt(
        event, world, minion, time_of_day=time_of_day, weather=weather
    )
    # The config is authoritative for asset kind.
    data["kind"] = media_kind
    return data


def _sanitize_prompt(prompt: str) -> tuple[bool, str]:
    """Run the existing red-line scanner. Returns (ok, reason)."""
    try:
        result = red_line_scan(prompt)
        if result.blocked:
            return False, f"{result.rule}: {result.detail}"
    except Exception as exc:  # noqa: BLE001
        log.warning("media.safety_scan_failed", error=str(exc))
        # Fail closed for safety.
        return False, "safety scan unavailable"
    return True, ""


async def _daily_credit_usage(session: AsyncSession, world_id: str) -> int:
    """Sum estimated credits for this world in the last 24h."""
    since = datetime.utcnow() - timedelta(hours=24)
    result = await session.execute(
        select(MediaAsset.credits_estimated)
        .where(
            MediaAsset.world_id == world_id,
            MediaAsset.created_at >= since,
        )
    )
    return sum(v for v in result.scalars().all() if v) or 0


async def handle_new_events(session: AsyncSession, world_id: str, since_tick: int) -> list[MediaAsset]:
    """Inspect events newer than since_tick and enqueue media generation.

    Idempotent: the event_key unique constraint prevents duplicate jobs.
    """
    settings = get_settings()
    if not settings.higgsfield_enabled or not _has_higgsfield_credentials():
        return []

    world = await session.get(World, world_id)
    if not world:
        return []

    # Load new events we care about.
    stmt = (
        select(Event)
        .where(
            Event.world_id == world_id,
            Event.tick > since_tick,
            Event.kind.in_(list(EVENT_MEDIA_CONFIG.keys())),
        )
        .order_by(Event.tick, Event.created_at)
    )
    rows = await session.execute(stmt)
    events = rows.scalars().all()
    if not events:
        return []

    # Budget check.
    daily_used = await _daily_credit_usage(session, world_id)
    budget = settings.higgsfield_credit_budget_daily
    remaining = max(0, budget - daily_used)

    created: list[MediaAsset] = []
    max_per_tick = settings.higgsfield_max_jobs_per_world_per_tick
    for idx, event in enumerate(events):
        if idx >= max_per_tick:
            log.info(
                "media.max_per_tick_reached",
                world_id=world_id,
                since_tick=since_tick,
                max_per_tick=max_per_tick,
            )
            break
        cfg = EVENT_MEDIA_CONFIG[event.kind]
        est = _credit_estimate(cfg["kind"], cfg.get("model"))
        if est > remaining:
            log.info(
                "media.budget_exhausted",
                world_id=world_id,
                event_kind=event.kind,
                daily_used=daily_used,
                budget=budget,
            )
            break

        event_key = _event_key(event)
        # Check for existing asset.
        existing = await session.execute(
            select(MediaAsset).where(
                MediaAsset.world_id == world_id,
                MediaAsset.event_key == event_key,
                MediaAsset.kind == cfg["kind"],
            )
        )
        if existing.scalar_one_or_none():
            continue

        # Load optional minion for richer prompts.
        minion: Minion | None = None
        if event.actor_id:
            minion = await session.get(Minion, event.actor_id)

        prompt_data = _prompt_for_event(event, world, minion)
        prompt = prompt_data["prompt"]
        ok, reason = _sanitize_prompt(prompt)
        if not ok:
            asset = MediaAsset(
                world_id=world_id,
                minion_id=event.actor_id,
                event_kind=event.kind,
                event_key=event_key,
                kind=cfg["kind"],
                prompt=prompt,
                status="moderated",
                credits_estimated=0,
                tick=event.tick,
                payload={"reason": reason},
            )
            session.add(asset)
            created.append(asset)
            continue

        asset = MediaAsset(
            world_id=world_id,
            minion_id=event.actor_id,
            event_kind=event.kind,
            event_key=event_key,
            kind=cfg["kind"],
            prompt=prompt,
            status="pending",
            credits_estimated=est,
            tick=event.tick,
            payload=prompt_data,
        )
        session.add(asset)
        created.append(asset)
        remaining -= est

    await session.flush()
    return created


def _has_higgsfield_credentials() -> bool:
    settings = get_settings()
    return bool(
        settings.higgsfield_credential
        or (settings.higgsfield_key_id and settings.higgsfield_key_secret)
    )


async def submit_pending_jobs(limit: int = 10) -> list[MediaAsset]:
    """Background task: pick pending jobs and submit them to Higgsfield."""
    settings = get_settings()
    if not settings.higgsfield_enabled or not _has_higgsfield_credentials():
        return []

    submitted: list[MediaAsset] = []
    async with session_scope() as session:
        stmt = (
            select(MediaAsset)
            .where(MediaAsset.status == "pending")
            .order_by(
                # Higher priority events first, then oldest.
                MediaAsset.created_at.asc(),
            )
            .limit(limit)
        )
        rows = await session.execute(stmt.options(selectinload(MediaAsset.world)))
        jobs = rows.scalars().all()

        for job in jobs:
            job.status = "running"
            await session.flush()

            try:
                seed = abs(hash(job.event_key)) % 2_147_483_647
                payload = job.payload if isinstance(job.payload, dict) else {}
                payload_model = payload.get("model")
                image_url = payload.get("image_url")
                motion_id = payload.get("motion_id")
                motion_strength = payload.get("motion_strength")
                negative_prompt = payload.get("negative_prompt")
                style_id = payload.get("style_id")
                style_strength = payload.get("style_strength")
                aspect_ratio = payload.get("aspect_ratio")
                duration = payload.get("duration")
                width_and_height = payload.get("width_and_height")

                if job.kind == "video":
                    result = await higgsfield.submit_video(
                        job.prompt,
                        model=payload_model,
                        image_url=image_url,
                        seed=seed,
                        motion_id=motion_id,
                        motion_strength=motion_strength,
                        negative_prompt=negative_prompt,
                        duration=duration,
                        aspect_ratio=aspect_ratio,
                    )
                else:
                    result = await higgsfield.submit_image(
                        job.prompt,
                        model=payload_model,
                        image_url=image_url,
                        seed=seed,
                        negative_prompt=negative_prompt,
                        style_id=style_id,
                        style_strength=style_strength,
                        width_and_height=width_and_height,
                    )

                if not result.get("ok"):
                    job.status = "failed"
                    job.payload = {"error": result.get("error"), "detail": result.get("detail")}
                    log.warning(
                        "media.submit_failed",
                        asset_id=job.id,
                        error=result.get("error"),
                    )
                    continue

                request_id = higgsfield.request_id_from_response(result["data"])
                if not request_id:
                    job.status = "failed"
                    job.payload = {"error": "no request_id in response", "raw": result["data"]}
                    continue

                job.remote_request_id = request_id
                job.status = "running"
                submitted.append(job)
                log.info(
                    "media.submitted",
                    asset_id=job.id,
                    request_id=request_id,
                    kind=job.kind,
                )
            except Exception as exc:  # noqa: BLE001
                job.status = "failed"
                job.payload = {"error": str(exc)}
                log.warning("media.submit_exception", asset_id=job.id, error=str(exc))

    return submitted


async def poll_running_jobs(limit: int = 20) -> list[MediaAsset]:
    """Background task: poll Higgsfield for running jobs and update URLs.

    Also chains god-beat images into videos when v2 credentials are available.
    """
    settings = get_settings()
    if not settings.higgsfield_enabled or not _has_higgsfield_credentials():
        return []

    completed: list[MediaAsset] = []
    async with session_scope() as session:
        stmt = (
            select(MediaAsset)
            .where(MediaAsset.status == "running", MediaAsset.remote_request_id.isnot(None))
            .limit(limit)
        )
        rows = await session.execute(stmt)
        jobs = rows.scalars().all()

        for job in jobs:
            try:
                result = await higgsfield.get_status(job.remote_request_id)
                if not result.get("ok"):
                    # Don't mark failed on transient status errors; retry later.
                    log.warning(
                        "media.status_check_failed",
                        asset_id=job.id,
                        error=result.get("error"),
                    )
                    continue

                data = result.get("data", {})
                status = (data.get("status") or data.get("state") or "pending").lower()

                if higgsfield.is_terminal_status(status):
                    if status in ("failed", "error", "cancelled", "rejected"):
                        job.status = "failed"
                        job.payload = {
                            **(job.payload or {}),
                            "status": status,
                            "raw": data,
                        }
                    else:
                        url = higgsfield.extract_output_url(data)
                        if not url:
                            job.status = "failed"
                            job.payload = {
                                **(job.payload or {}),
                                "error": "completed but no output url",
                                "raw": data,
                            }
                        else:
                            job.status = "completed"
                            job.url = url
                            job.generated_at = datetime.utcnow()
                            completed.append(job)
                            log.info(
                                "media.completed",
                                asset_id=job.id,
                                kind=job.kind,
                                url=url[:80],
                            )
                            # Chain god-beat images into videos (v2 only; needs input image).
                            if (
                                job.kind == "image"
                                and job.event_kind == "director:god_beat"
                                and higgsfield.uses_v2()
                                and url
                            ):
                                await _enqueue_chained_video(session, job, url)

                            # Persist a local copy so creations survive CDN expiry.
                            try:
                                await media_backup.backup_asset(job)
                            except Exception as backup_exc:  # noqa: BLE001
                                log.warning(
                                    "media.backup_exception",
                                    asset_id=job.id,
                                    error=str(backup_exc),
                                )
            except Exception as exc:  # noqa: BLE001
                log.warning("media.poll_exception", asset_id=job.id, error=str(exc))

    return completed


async def _enqueue_chained_video(session, image_asset: MediaAsset, image_url: str) -> None:
    """Create a pending video asset using a completed image as input."""
    settings = get_settings()
    event_key = f"{image_asset.event_key}:video"
    existing = await session.execute(
        select(MediaAsset).where(
            MediaAsset.world_id == image_asset.world_id,
            MediaAsset.event_key == event_key,
            MediaAsset.kind == "video",
        )
    )
    if existing.scalar_one_or_none():
        return

    daily_used = await _daily_credit_usage(session, image_asset.world_id)
    budget = settings.higgsfield_credit_budget_daily
    est = _credit_estimate("video", None)
    if daily_used + est > budget:
        log.info(
            "media.chain_video_budget_exhausted",
            world_id=image_asset.world_id,
            image_asset_id=image_asset.id,
        )
        return

    video_prompt = (
        f"Cinematic motion: {image_asset.prompt}. "
        "Slow camera move, subtle parallax, futuristic-avatar palette."
    )
    video_asset = MediaAsset(
        world_id=image_asset.world_id,
        minion_id=image_asset.minion_id,
        event_kind=image_asset.event_kind,
        event_key=event_key,
        kind="video",
        prompt=video_prompt,
        status="pending",
        credits_estimated=est,
        tick=image_asset.tick,
        payload={
            **(image_asset.payload or {}),
            "image_url": image_url,
            "kind": "video",
            "chained_from": image_asset.id,
        },
    )
    session.add(video_asset)
    log.info(
        "media.chained_video_enqueued",
        image_asset_id=image_asset.id,
        video_asset_id=video_asset.id,
    )


async def get_media_for_scene_state(
    session,
    world_id: str,
    *,
    minion_id: str | None = None,
    limit_recent: int = 6,
) -> dict[str, Any]:
    """Return the media block attached to scene-state."""
    # Latest world-level poster (era / generic world).
    poster_stmt = (
        select(MediaAsset)
        .where(
            MediaAsset.world_id == world_id,
            MediaAsset.status == "completed",
        )
        .order_by(MediaAsset.generated_at.desc().nullslast(), MediaAsset.created_at.desc())
        .limit(1)
    )
    poster = (await session.execute(poster_stmt)).scalar_one_or_none()

    # Recent event cards (exclude the poster to avoid duplication).
    poster_id = poster.id if poster else None
    recent_stmt = (
        select(MediaAsset)
        .where(
            MediaAsset.world_id == world_id,
            MediaAsset.status == "completed",
            MediaAsset.id != poster_id if poster_id else True,
        )
        .order_by(MediaAsset.generated_at.desc().nullslast(), MediaAsset.created_at.desc())
        .limit(limit_recent)
    )
    recent_rows = await session.execute(recent_stmt)
    recent = [r.url for r in recent_rows.scalars().all() if r.url]

    # Selected minion portrait.
    minion_url: str | None = None
    if minion_id:
        minion_stmt = (
            select(MediaAsset)
            .where(
                MediaAsset.world_id == world_id,
                MediaAsset.minion_id == minion_id,
                MediaAsset.status == "completed",
            )
            .order_by(MediaAsset.generated_at.desc().nullslast(), MediaAsset.created_at.desc())
            .limit(1)
        )
        minion_asset = (await session.execute(minion_stmt)).scalar_one_or_none()
        minion_url = minion_asset.url if minion_asset else None

    pending_count = await session.scalar(
        select(func.count(MediaAsset.id)).where(
            MediaAsset.world_id == world_id,
            MediaAsset.status.in_(["pending", "running"]),
        )
    )

    return {
        "world_poster": poster.url if poster else None,
        "recent_event_cards": recent,
        "selected_minion_portrait": minion_url,
        "pending_count": pending_count or 0,
    }


async def list_world_media(
    session,
    world_id: str,
    *,
    status: str | None = None,
    kind: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[MediaAsset]:
    """Paginated list of media assets for a world."""
    stmt = select(MediaAsset).where(MediaAsset.world_id == world_id)
    if status:
        stmt = stmt.where(MediaAsset.status == status)
    if kind:
        stmt = stmt.where(MediaAsset.kind == kind)
    stmt = stmt.order_by(MediaAsset.created_at.desc()).offset(offset).limit(limit)
    rows = await session.execute(stmt)
    return list(rows.scalars().all())
