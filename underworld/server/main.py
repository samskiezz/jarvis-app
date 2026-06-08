"""Underworld FastAPI application entry."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db.session import dispose, init_db
from .knowledge.seed import seed_knowledge_base
from .logging_setup import configure_logging
from .routes import auth as auth_routes
from .routes import god as god_routes
from .routes import guilds as guild_routes
from .routes import inventions as invention_routes
from .routes import knowledge as knowledge_routes
from .routes import minions as minion_routes
from .routes import patents as patent_routes
from .routes import physics as physics_routes
from .routes import projects as project_routes
from .routes import safety as safety_routes
from .routes import science as science_routes
from .routes import substrate as substrate_routes
from .routes import worlds as world_routes
from .services import scheduler
from .tools import llm as _llm

# When the React bundle is co-located (Docker build copies it to
# underworld/web/dist), serve it directly so a single port behind Caddy
# is enough — Caddy's /assets/* and /models/* handlers reverse-proxy
# here without a separate static server.
_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


async def _cognition_loop():
    """The running aliveness loop: every COGNITION_INTERVAL_S, run the Global-Workspace
    cognition + sentience pass over each world's hot minions (memory→reflection→self-
    model→awareness). Opt-out with COGNITION_LOOP=0. Never crashes the app."""
    import asyncio
    import os

    from sqlalchemy import select

    from .db.models import World
    from .db.session import session_scope
    from .services import cognition

    if os.environ.get("COGNITION_LOOP", "1").lower() in ("0", "false", "no"):
        return
    interval = max(8.0, float(os.environ.get("COGNITION_INTERVAL_S", "20")))
    hot_n = int(os.environ.get("COGNITION_HOT_N", "24"))
    await asyncio.sleep(float(os.environ.get("COGNITION_START_DELAY_S", "15")))
    while True:
        try:
            async with session_scope() as s:
                wids = (await s.execute(
                    select(World.id).where(World.auto_advance.is_(True)))).scalars().all()
            for wid in wids:
                async with session_scope() as s:
                    world = await s.get(World, wid)
                    if world is not None:
                        await cognition.cognition_cycle(s, world, hot_n=hot_n)
        except Exception:  # noqa: BLE001 - a cognition failure must never kill the loop
            pass
        await asyncio.sleep(interval)


async def _movement_loop():
    """THE KEYSTONE LOOP — ~1 Hz server-tracked movement. Every tick, each alive minion in an
    auto-advancing world steers toward the building its current action demands, so the world
    WALKS instead of teleporting. Positions persist in Minion.brain['kin']. Opt-out with
    MOVEMENT_LOOP=0. Never crashes the app."""
    import asyncio
    import os

    from sqlalchemy import select

    from .db.models import Minion, World
    from .db.session import session_scope
    from .services import movement, possession
    from .services.scene_state import _action_target

    if os.environ.get("MOVEMENT_LOOP", "1").lower() in ("0", "false", "no"):
        return
    dt = max(0.25, float(os.environ.get("MOVEMENT_INTERVAL_S", "1.0")))
    max_n = int(os.environ.get("MOVEMENT_MAX_PER_WORLD", "600"))
    town_radius = float(os.environ.get("TOWN_RADIUS", "60"))
    await asyncio.sleep(float(os.environ.get("MOVEMENT_START_DELAY_S", "6")))
    while True:
        try:
            async with session_scope() as s:
                worlds = (await s.execute(
                    select(World).where(World.auto_advance.is_(True)))).scalars().all()
            for world in worlds:
                seed_int = int(getattr(world, "seed_value", 0) or 0)
                async with session_scope() as s:
                    minions = (await s.execute(
                        select(Minion).where(
                            Minion.world_id == world.id, Minion.alive.is_(True))
                        .limit(max_n))).scalars().all()
                    for m in minions:
                        # the creator is wearing this body — the player drives it, the AI stands down
                        if possession.is_controlled(m):
                            continue
                        last_action = (m.brain or {}).get("last_action", "rest")
                        _, target_fn, _ = _action_target(last_action, "")
                        movement.step_minion(m, seed_int=seed_int, town_radius=town_radius,
                                             dt=dt, target_fn=target_fn)
        except Exception:  # noqa: BLE001 - a movement failure must never kill the loop
            pass
        await asyncio.sleep(dt)


async def _director_loop():
    """THE DIRECTOR LOOP — the colony thinks about itself + reacts to the watching creator.
    Every DIRECTOR_INTERVAL_S, refresh each world's Overmind read + ambient chatter and fire a
    God-beat on any irreversible turning point. Opt-out with DIRECTOR_LOOP=0. Never crashes."""
    import asyncio
    import os

    from sqlalchemy import select

    from .db.models import World
    from .db.session import session_scope
    from .services import director

    if director.loop_disabled():
        return
    interval = max(8.0, float(os.environ.get("DIRECTOR_INTERVAL_S", "15")))
    await asyncio.sleep(float(os.environ.get("DIRECTOR_START_DELAY_S", "18")))
    while True:
        try:
            async with session_scope() as s:
                wids = (await s.execute(
                    select(World.id).where(World.auto_advance.is_(True)))).scalars().all()
            for wid in wids:
                async with session_scope() as s:
                    world = await s.get(World, wid)
                    if world is not None:
                        await director.director_cycle(s, world)
        except Exception:  # noqa: BLE001 - a director failure must never kill the loop
            pass
        await asyncio.sleep(interval)


async def _feedback_loop():
    """THE CLAUDE↔KIMI↔LLAMA LOOP — the system observes itself and gets smarter. Every
    FEEDBACK_INTERVAL_S, Kimi diagnoses the Llama tiers' recent telemetry + open findings and
    proposes terse LESSONS that get injected into the tiers' prompts (Llama improves), plus
    CODE issues flagged for Claude. Opt-out FEEDBACK_LOOP=0. Never crashes the app."""
    import asyncio
    import logging
    import os

    from .db.session import session_scope
    from .services import feedback

    if feedback.loop_disabled():
        return
    interval = max(60.0, float(os.environ.get("FEEDBACK_INTERVAL_S", "300")))
    log = logging.getLogger("underworld.feedback")
    await asyncio.sleep(float(os.environ.get("FEEDBACK_START_DELAY_S", "45")))
    while True:
        try:
            async with session_scope() as s:
                summary = await feedback.observe_and_improve(s)
            if summary.get("lessons_added") or summary.get("code_issues_for_claude"):
                # the "alert me on good feedback loops" surface
                log.info("feedback.cycle", extra={"summary": summary})
                print(f"[feedback] {summary.get('summary','')} | +{summary.get('lessons_added',0)} "
                      f"lessons -> Llama, {summary.get('code_issues_for_claude',0)} for Claude "
                      f"| {summary.get('lessons',[])}", flush=True)
        except Exception:  # noqa: BLE001 - a feedback failure must never kill the loop
            pass
        await asyncio.sleep(interval)


async def _gpu_reaper_loop():
    """GPU ORCHESTRATION upkeep — refresh the base-box registry entry + reap idle disposable Vast
    burst workers (cost control; the VPS=truth recovery model). Opt-out GPU_REAPER_LOOP=0. Never
    crashes the app."""
    import asyncio
    import os

    from .services import gpu_orchestrator as gpu

    if gpu.reaper_disabled():
        return
    interval = max(30.0, float(os.environ.get("GPU_REAPER_INTERVAL_S", "120")))
    await asyncio.sleep(float(os.environ.get("GPU_REAPER_START_DELAY_S", "20")))
    while True:
        try:
            await gpu.register_base()
            await gpu.reap_idle()
        except Exception:  # noqa: BLE001 - orchestration upkeep must never kill the loop
            pass
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    configure_logging()
    _llm.warn_on_misconfig()
    await init_db()
    await seed_knowledge_base()
    try:
        from .services import gpu_orchestrator as _gpu
        await _gpu.register_base()                          # the always-on Vast Ollama base worker
    except Exception:  # noqa: BLE001
        pass
    tasks: list[asyncio.Task] = []
    if get_settings().scheduler_enabled:
        if get_settings().scheduler_autostart_all:
            await scheduler.autostart_all_worlds()
        scheduler.start()
        tasks.append(asyncio.create_task(_cognition_loop()))    # the sentience engine
        tasks.append(asyncio.create_task(_movement_loop()))     # the keystone — minions walk
        tasks.append(asyncio.create_task(_director_loop()))     # the colony's nervous system
        tasks.append(asyncio.create_task(_feedback_loop()))     # Kimi observes → Llama improves
        tasks.append(asyncio.create_task(_gpu_reaper_loop()))   # disposable Vast burst upkeep
    yield
    for t in tasks:
        t.cancel()
    if get_settings().scheduler_enabled:
        await scheduler.stop()
    await dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Underworld",
        version="0.2.0",
        description="AI-agent civilisation simulation over expired patents.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_routes.router)
    app.include_router(world_routes.router)
    app.include_router(god_routes.router)
    app.include_router(minion_routes.router)
    app.include_router(patent_routes.router)
    app.include_router(invention_routes.router)
    app.include_router(guild_routes.router)
    app.include_router(safety_routes.router)
    app.include_router(knowledge_routes.router)
    app.include_router(physics_routes.router)
    app.include_router(project_routes.router)
    app.include_router(substrate_routes.router)
    app.include_router(science_routes.router)

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    # When the built React bundle is present, mount its /assets and /models
    # directly + fall back to index.html on unknown paths so client-side
    # routing works. Without the bundle (the usual `npm run dev` + uvicorn
    # split), `/` returns the service descriptor as before.
    if (_WEB_DIST / "index.html").exists():
        if (_WEB_DIST / "assets").is_dir():
            app.mount(
                "/assets",
                StaticFiles(directory=str(_WEB_DIST / "assets")),
                name="web-assets",
            )
        if (_WEB_DIST / "models").is_dir():
            app.mount(
                "/models",
                StaticFiles(directory=str(_WEB_DIST / "models")),
                name="web-models",
            )

        @app.get("/", include_in_schema=False)
        async def index():
            return FileResponse(_WEB_DIST / "index.html")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            # Static file under dist? Serve it. Otherwise hand back
            # index.html so React Router can take over.
            candidate = _WEB_DIST / full_path
            if candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(_WEB_DIST / "index.html")
    else:
        @app.get("/")
        async def root():
            return {"service": "underworld", "status": "ok", "version": app.version}

    return app


app = create_app()
