"""Video command service — sticky imperative cues for in-world media screens.

UE5 consumes these via the scene-state contract. Commands remain active until
cleared so reconnects and late-joining renderers replay the current cue.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import WorldCommand


def _command_to_dict(cmd: WorldCommand) -> dict:
    return {
        "id": cmd.command_id,
        "kind": cmd.kind,
        "target": cmd.target,
        "media_key": cmd.media_key,
        "loop": cmd.loop,
        "priority": cmd.priority,
        "started_tick": cmd.started_tick,
    }


async def get_active_commands(session: AsyncSession, world_id: str) -> list[dict]:
    """Return all active commands for a world, newest first."""
    res = await session.execute(
        select(WorldCommand)
        .where(WorldCommand.world_id == world_id, WorldCommand.active.is_(True))
        .order_by(WorldCommand.created_at.desc())
    )
    return [_command_to_dict(c) for c in res.scalars().all()]


async def issue_command(
    session: AsyncSession,
    world_id: str,
    *,
    command_id: str,
    kind: str,
    target: str = "world_screen",
    media_key: str | None = None,
    loop: bool = False,
    priority: int = 0,
    started_tick: int = 0,
) -> dict:
    """Upsert a command.  Re-issuing the same command_id updates the existing row."""
    existing = await session.scalar(
        select(WorldCommand).where(
            WorldCommand.world_id == world_id,
            WorldCommand.command_id == command_id,
        )
    )
    if existing:
        existing.kind = kind
        existing.target = target
        existing.media_key = media_key
        existing.loop = loop
        existing.priority = priority
        existing.started_tick = started_tick
        existing.active = True
        session.add(existing)
        return _command_to_dict(existing)

    cmd = WorldCommand(
        world_id=world_id,
        command_id=command_id,
        kind=kind,
        target=target,
        media_key=media_key,
        loop=loop,
        priority=priority,
        started_tick=started_tick,
    )
    session.add(cmd)
    await session.flush()
    return _command_to_dict(cmd)


async def clear_command(session: AsyncSession, world_id: str, command_id: str) -> bool:
    """Deactivate a single command."""
    cmd = await session.scalar(
        select(WorldCommand).where(
            WorldCommand.world_id == world_id,
            WorldCommand.command_id == command_id,
        )
    )
    if cmd is None:
        return False
    cmd.active = False
    session.add(cmd)
    return True


async def clear_all_commands(session: AsyncSession, world_id: str) -> int:
    """Deactivate every active command for a world."""
    res = await session.execute(
        select(WorldCommand).where(
            WorldCommand.world_id == world_id, WorldCommand.active.is_(True)
        )
    )
    count = 0
    for cmd in res.scalars().all():
        cmd.active = False
        session.add(cmd)
        count += 1
    return count
