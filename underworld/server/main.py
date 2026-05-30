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
from .routes import guilds as guild_routes
from .routes import inventions as invention_routes
from .routes import knowledge as knowledge_routes
from .routes import minions as minion_routes
from .routes import patents as patent_routes
from .routes import projects as project_routes
from .routes import safety as safety_routes
from .routes import worlds as world_routes
from .services import scheduler
from .tools import llm as _llm

# When the React bundle is co-located (Docker build copies it to
# underworld/web/dist), serve it directly so a single port behind Caddy
# is enough — Caddy's /assets/* and /models/* handlers reverse-proxy
# here without a separate static server.
_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    _llm.warn_on_misconfig()
    await init_db()
    await seed_knowledge_base()
    if get_settings().scheduler_enabled:
        scheduler.start()
    yield
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
    app.include_router(minion_routes.router)
    app.include_router(patent_routes.router)
    app.include_router(invention_routes.router)
    app.include_router(guild_routes.router)
    app.include_router(safety_routes.router)
    app.include_router(knowledge_routes.router)
    app.include_router(project_routes.router)

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
