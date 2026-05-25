"""Underworld FastAPI application entry."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    await init_db()
    await seed_knowledge_base()
    scheduler.start()
    yield
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

    @app.get("/")
    async def root():
        return {"service": "underworld", "status": "ok", "version": app.version}

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    return app


app = create_app()
