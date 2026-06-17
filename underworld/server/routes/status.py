"""Service status board — uptime, world count, simulation tick lag, last error, known issues.

The Blizzard-level production plan asks for an always-on status banner so the player KNOWS the
sim is alive (or transparently knows when it isn't). This route is unauthenticated by design —
the status itself is non-sensitive (no minion data, no chat) and the UI surfaces it pre-login.

Tick-lag is the delta between `time.now()` and the latest world's `last_advanced_at` timestamp;
a stalled scheduler shows up here as growing lag.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import World
from ..db.session import get_session
from ..services import scheduler as scheduler_svc


router = APIRouter(prefix="/status", tags=["status"])

_PROCESS_STARTED_AT = time.time()
_LAST_ERROR_TS: float = 0.0
_LAST_ERROR_MSG: str = ""


def record_error(msg: str) -> None:
    """Other services call this so the status board can surface 'last error at hh:mm'."""
    global _LAST_ERROR_TS, _LAST_ERROR_MSG
    _LAST_ERROR_TS = time.time()
    _LAST_ERROR_MSG = (msg or "")[:200]


@router.get("")
async def read_status(session: AsyncSession = Depends(get_session)):
    """Live service health — uptime, world count, scheduler state, last error."""
    n = (await session.execute(select(func.count()).select_from(World))).scalar() or 0
    # most-recent world tick + the auto-advance schedule slip as a sim-lag proxy.
    rows = (await session.execute(
        select(World.id, World.tick, World.next_auto_tick_at, World.auto_advance_interval_s)
        .order_by(World.next_auto_tick_at.desc().nullslast()).limit(1)
    )).all()
    last_world_id, last_tick, next_at, interval = (rows[0] if rows else (None, 0, None, None))
    lag_s: float | None = None
    if next_at is not None:
        try:
            # if next_auto_tick_at is in the past, the scheduler is overdue by that much
            slip = time.time() - next_at.timestamp()
            lag_s = round(max(0.0, slip), 2) if slip > 0 else 0.0
        except Exception:  # noqa: BLE001
            lag_s = None
    loop_task = getattr(scheduler_svc, "_loop_task", None)
    scheduler_running = bool(loop_task and not loop_task.done())
    return {
        "ok": True,
        "service": "underworld",
        "version": "0.2.0",
        "uptime_s": round(time.time() - _PROCESS_STARTED_AT, 1),
        "worlds": int(n),
        "last_world_id": last_world_id,
        "last_tick": int(last_tick or 0),
        "tick_lag_s": lag_s,
        "scheduler_running": scheduler_running,
        "last_error_ts": _LAST_ERROR_TS or None,
        "last_error_msg": _LAST_ERROR_MSG or None,
    }


@router.get("/known-issues")
async def read_known_issues():
    """Markdown known-issues page so the player ALWAYS has a 'why is this acting up' answer."""
    p = Path(__file__).resolve().parent.parent.parent / "docs" / "KNOWN_ISSUES.md"
    if not p.is_file():
        return {"ok": True, "markdown": "All systems operational.", "found": False}
    try:
        return {"ok": True, "markdown": p.read_text()[:64000], "found": True,
                "mtime": p.stat().st_mtime}
    except Exception:  # noqa: BLE001
        return {"ok": True, "markdown": "All systems operational.", "found": False}
