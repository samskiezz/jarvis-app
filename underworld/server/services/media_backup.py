"""Durable local backup for completed Higgsfield media assets.

Guarantees creations are never lost if the remote CDN link expires or the
upstream account changes. Completed images/videos are downloaded into a
per-world directory under ``MEDIA_BACKUP_DIR``. The local path is stored on the
``MediaAsset`` row so renderers and exporters can find it without re-fetching.
"""

from __future__ import annotations

import asyncio
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import MediaAsset
from ..db.session import session_scope

log = structlog.get_logger(__name__)


_INVALID_PATH_CHARS = re.compile(r"[^\w\-_.]")


def _backup_dir() -> Path:
    settings = get_settings()
    path = Path(settings.media_local_dir).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _extension_from_url(url: str, kind: str) -> str:
    parsed = urlparse(url)
    guess, _ = mimetypes.guess_type(parsed.path)
    if guess:
        ext = mimetypes.guess_extension(guess) or ""
        if ext:
            return ext
    # Fallbacks based on kind and common CDN patterns.
    lower = url.lower()
    if kind == "video" or ".mp4" in lower:
        return ".mp4"
    if ".webp" in lower:
        return ".webp"
    if ".png" in lower:
        return ".png"
    if ".jpg" in lower or ".jpeg" in lower:
        return ".jpg"
    if kind == "image":
        return ".png"
    return ".bin"


def _safe_filename(asset: MediaAsset) -> str:
    kind = asset.kind or "asset"
    ext = _extension_from_url(asset.url or "", kind)
    base = f"{asset.id}_{kind}"
    return _INVALID_PATH_CHARS.sub("_", base) + ext


def _world_backup_dir(world_id: str) -> Path:
    base = _backup_dir()
    world_dir = base / _INVALID_PATH_CHARS.sub("_", world_id)
    world_dir.mkdir(parents=True, exist_ok=True)
    return world_dir


async def backup_asset(asset: MediaAsset) -> str | None:
    """Download ``asset.url`` to local disk and return the absolute path.

    Idempotent: if ``asset.local_path`` already points to an existing file,
    the existing path is returned without re-downloading.
    """
    if not asset.url:
        return None

    world_id = asset.world_id
    if not world_id:
        return None

    if asset.local_path:
        existing = Path(asset.local_path)
        if existing.exists() and existing.stat().st_size > 0:
            return str(existing)

    target_dir = _world_backup_dir(world_id)
    filename = _safe_filename(asset)
    target = target_dir / filename

    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            resp = await client.get(asset.url)
            resp.raise_for_status()
            target.write_bytes(resp.content)
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "media_backup.failed",
            asset_id=asset.id,
            url=asset.url[:120],
            error=str(exc),
        )
        return None

    asset.local_path = str(target)
    log.info(
        "media_backup.saved",
        asset_id=asset.id,
        path=str(target),
        bytes=target.stat().st_size,
    )
    return str(target)


async def backup_completed_assets(limit: int = 50) -> list[tuple[str, str | None]]:
    """Find recently completed assets without a local backup and back them up."""
    results: list[tuple[str, str | None]] = []
    async with session_scope() as session:
        stmt = (
            select(MediaAsset)
            .where(
                MediaAsset.status == "completed",
                MediaAsset.url.isnot(None),
            )
            .where(
                (MediaAsset.local_path.is_(None))
                | (MediaAsset.local_path == "")
            )
            .order_by(MediaAsset.generated_at.desc())
            .limit(limit)
        )
        rows = await session.execute(stmt)
        assets = list(rows.scalars().all())

    # Download outside the DB transaction so long downloads don't hold locks.
    for asset in assets:
        path = await backup_asset(asset)
        results.append((asset.id, path))
        # Small yield to avoid monopolising the event loop.
        await asyncio.sleep(0)

    return results


async def get_backup_status(session: AsyncSession, world_id: str) -> dict:
    """Return counts of completed assets and how many are backed up locally."""
    from sqlalchemy import func

    total = await session.scalar(
        select(func.count(MediaAsset.id)).where(
            MediaAsset.world_id == world_id,
            MediaAsset.status == "completed",
        )
    )
    backed_up = await session.scalar(
        select(func.count(MediaAsset.id)).where(
            MediaAsset.world_id == world_id,
            MediaAsset.status == "completed",
            MediaAsset.local_path.isnot(None),
            MediaAsset.local_path != "",
        )
    )
    total_bytes = 0
    for local_path in await session.scalars(
        select(MediaAsset.local_path).where(
            MediaAsset.world_id == world_id,
            MediaAsset.status == "completed",
            MediaAsset.local_path.isnot(None),
            MediaAsset.local_path != "",
        )
    ):
        try:
            total_bytes += Path(local_path).stat().st_size
        except OSError:
            pass

    return {
        "world_id": world_id,
        "completed": total or 0,
        "backed_up": backed_up or 0,
        "pending_backup": (total or 0) - (backed_up or 0),
        "total_bytes": total_bytes,
        "backup_dir": str(_backup_dir()),
    }


async def export_world_media(world_id: str, output_path: Path | None = None) -> tuple[Path, int]:
    """Zip all backed-up media for a world into a single archive.

    Returns (path, asset_count).
    """
    import zipfile

    target = output_path or (_backup_dir() / f"{world_id}_export.zip")
    async with session_scope() as session:
        stmt = (
            select(MediaAsset)
            .where(
                MediaAsset.world_id == world_id,
                MediaAsset.status == "completed",
                MediaAsset.local_path.isnot(None),
                MediaAsset.local_path != "",
            )
            .order_by(MediaAsset.created_at.desc())
        )
        rows = await session.execute(stmt)
        assets = list(rows.scalars().all())

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for asset in assets:
            src = Path(asset.local_path)
            if not src.exists():
                continue
            arcname = f"{asset.kind}/{asset.id}_{asset.event_kind}{src.suffix}"
            zf.write(src, arcname)

    log.info("media_backup.exported", world_id=world_id, assets=len(assets), zip=str(target))
    return target, len(assets)
