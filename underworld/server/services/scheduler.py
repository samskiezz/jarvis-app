"""Background auto-advance loop for worlds.

Doc Section I.97: "The world is persistent – no save/load, it just keeps
running on cloud."

This is a single asyncio task started by the FastAPI lifespan. Every
~`tick_resolution_s` seconds it scans all worlds with `auto_advance=True`
whose `next_auto_tick_at` has elapsed, and advances them by one tick.

The simulation tick takes real time (LLM calls dominate); we advance worlds
sequentially in a single background coroutine to avoid hammering the LLM
API. For higher throughput, replace this with an asyncio.gather across
worlds, gated by a semaphore tied to the LLM rate limit.

Bus: every event written by `advance_world` is also pushed to an in-memory
asyncio.Queue per world so the SSE endpoint can stream live updates to
the UI without polling.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta
from typing import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, World
from ..db.session import session_scope
from ..logging_setup import get_logger
from .simulation import TickReport, advance_world

log = get_logger("scheduler")

_TICK_RESOLUTION_S = 1.0
_loop_task: asyncio.Task | None = None
_stop_event: asyncio.Event | None = None
_manual_tasks: set[asyncio.Task] = set()
_world_locks: dict[str, asyncio.Lock] = {}


def _get_stop_event() -> asyncio.Event:
    """Lazy create the event so it's bound to the running loop, not import-time."""
    global _stop_event
    if _stop_event is None:
        _stop_event = asyncio.Event()
    return _stop_event


def _lock_for(world_id: str) -> asyncio.Lock:
    lock = _world_locks.get(world_id)
    if lock is None:
        lock = asyncio.Lock()
        _world_locks[world_id] = lock
    return lock

# In-memory event bus — per-world queues for SSE subscribers. Bounded to
# prevent runaway memory if no client is consuming.
_bus: dict[str, list[asyncio.Queue[dict]]] = defaultdict(list)
_BUS_MAX = 256


def publish(world_id: str, event: dict) -> None:
    queues = _bus.get(world_id) or []
    for q in list(queues):
        if q.qsize() >= _BUS_MAX:
            # drop oldest
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
        # Drop new event if the queue is still full — the qsize check + get
        # race can leave us at maxsize, and a bare put_nowait would raise
        # QueueFull which cascades into the simulation tick.
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            log.debug("bus.dropped", world_id=world_id, kind=event.get("kind"))


async def subscribe(world_id: str) -> AsyncIterator[dict]:
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=_BUS_MAX)
    _bus[world_id].append(q)
    try:
        # Heartbeat every 15s so proxies don't kill the connection.
        while True:
            try:
                evt = await asyncio.wait_for(q.get(), timeout=15.0)
                yield evt
            except asyncio.TimeoutError:
                yield {"kind": "heartbeat"}
    finally:
        if q in _bus.get(world_id, []):
            _bus[world_id].remove(q)


async def _drain_new_events(session: AsyncSession, world_id: str, since_tick: int) -> None:
    stmt = (
        select(Event)
        .where(Event.world_id == world_id, Event.tick > since_tick)
        .order_by(Event.tick, Event.created_at)
    )
    res = await session.execute(stmt)
    for e in res.scalars().all():
        publish(world_id, {
            "kind": e.kind,
            "tick": e.tick,
            "actor_id": e.actor_id,
            "payload": e.payload or {},
            "at": e.created_at.isoformat(),
        })


async def _tick_one_world_locked(world_id: str, *, require_auto: bool = True) -> TickReport | None:
    async with session_scope() as session:
        world = await session.get(World, world_id)
        if not world or (require_auto and not world.auto_advance):
            return None
        previous_tick = world.tick
        reports = await advance_world(session, world, ticks=1)
        if reports:
            await _drain_new_events(session, world.id, previous_tick)
            world.next_auto_tick_at = datetime.utcnow() + timedelta(
                seconds=world.auto_advance_interval_s
            )
            publish(world.id, {
                "kind": "tick:complete",
                "tick": world.tick,
                "alive": reports[-1].alive,
                "births": reports[-1].births,
                "deaths": reports[-1].deaths,
                "forks": reports[-1].forks,
                "inventions_approved": reports[-1].inventions_approved,
            })
            return reports[-1]
    return None


async def _tick_one_world(world_id: str, *, require_auto: bool = True) -> TickReport | None:
    """Advance a single world by one tick. Per-world locked; skips if disabled/missing."""
    async with _lock_for(world_id):
        return await _tick_one_world_locked(world_id, require_auto=require_auto)


async def _run_manual_ticks(world_id: str, ticks: int) -> None:
    await run_manual_ticks(world_id, ticks)


async def run_manual_ticks(world_id: str, ticks: int) -> list[TickReport]:
    reports: list[TickReport] = []
    async with _lock_for(world_id):
        for _ in range(max(0, ticks)):
            try:
                report = await _tick_one_world_locked(world_id, require_auto=False)
                if report:
                    reports.append(report)
            except Exception as exc:  # noqa: BLE001
                log.warning("scheduler.manual_tick_failed", world_id=world_id, error=repr(exc))
                break
    return reports


def enqueue_manual_ticks(world_id: str, ticks: int) -> dict:
    """Queue manual ticks after an HTTP request has done its small inline slice."""
    total = max(0, int(ticks or 0))
    if total <= 0:
        return {"queued": False, "queued_ticks": 0}
    task = asyncio.create_task(_run_manual_ticks(world_id, total), name=f"underworld-manual-{world_id}")
    _manual_tasks.add(task)
    task.add_done_callback(_manual_tasks.discard)
    return {"queued": True, "queued_ticks": total}


async def _scheduler_loop() -> None:
    log.info("scheduler.start")
    stop_event = _get_stop_event()
    try:
        while not stop_event.is_set():
            try:
                async with session_scope() as session:
                    stmt = select(World).where(World.auto_advance.is_(True))
                    res = await session.execute(stmt)
                    candidates = list(res.scalars().all())
                now = datetime.utcnow()
                due = [
                    w for w in candidates
                    if w.next_auto_tick_at is None or w.next_auto_tick_at <= now
                ]
                for w in due:
                    try:
                        await _tick_one_world(w.id)
                    except Exception as exc:  # noqa: BLE001
                        log.warning("scheduler.tick_failed", world_id=w.id, error=repr(exc))
            except Exception as exc:  # noqa: BLE001
                log.warning("scheduler.iteration_failed", error=repr(exc))
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=_TICK_RESOLUTION_S)
            except asyncio.TimeoutError:
                pass
    finally:
        log.info("scheduler.stop")


async def autostart_all_worlds() -> int:
    """Flip every world to auto-advance so the whole system runs hands-free.
    Returns the number of worlds switched on."""
    from sqlalchemy import update

    async with session_scope() as session:
        result = await session.execute(
            update(World).where(World.auto_advance.is_(False)).values(auto_advance=True)
        )
    log.info("scheduler.autostart_all", switched_on=result.rowcount or 0)
    return result.rowcount or 0


def start() -> None:
    global _loop_task, _stop_event
    if _loop_task and not _loop_task.done():
        return
    # Reset stop event so a fresh start in a new loop has a fresh event.
    _stop_event = None
    _get_stop_event().clear()
    _loop_task = asyncio.create_task(_scheduler_loop(), name="underworld-scheduler")


async def stop() -> None:
    global _loop_task, _stop_event
    if _stop_event is not None:
        _stop_event.set()
    if _loop_task:
        try:
            await asyncio.wait_for(_loop_task, timeout=5.0)
        except asyncio.TimeoutError:
            _loop_task.cancel()
        except RuntimeError:
            # Loop was already closed (test teardown). Best-effort cancel.
            _loop_task.cancel()
        _loop_task = None
    for task in list(_manual_tasks):
        task.cancel()
    _manual_tasks.clear()
    _stop_event = None


__all__ = ["start", "stop", "publish", "subscribe", "enqueue_manual_ticks", "run_manual_ticks"]
