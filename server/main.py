import contextlib
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .routes import aip as aip_routes
from .routes import auth as auth_routes
from .routes import bridge as bridge_routes
from .routes import collab as collab_routes
from .routes import entities as entities_routes
from .routes import graph as graph_routes
from .routes import functions as functions_routes
from .routes import history as history_routes
from .routes import ontology as ontology_routes
from .routes import ops as ops_routes
from .routes import pipelines as pipelines_routes
from .routes import predict as predict_routes
from .routes import reports as reports_routes
from .routes import science as science_routes
from .routes import search as search_routes
from .routes import security as security_routes
from .routes import streams as streams_routes


def _ingest_enabled() -> bool:
    return os.environ.get("HISTORY_INGEST_ENABLED", "").lower() in ("1", "true", "yes")


@contextlib.asynccontextmanager
async def _lifespan(app: FastAPI):
    """Opt-in History Lake ingestion loop. Disabled by default so imports/tests
    never touch the network; enable with HISTORY_INGEST_ENABLED=true."""
    import asyncio

    task = None
    if _ingest_enabled():
        from .services.ingestion import ingestion_loop

        interval = int(os.environ.get("HISTORY_INGEST_INTERVAL_S", "900"))
        task = asyncio.create_task(ingestion_loop(interval_s=interval))

    # Opt-in live forward-test loop (issue -> resolve -> score). Disabled by
    # default; enable with FORWARD_TEST_ENABLE=true. Never auto-runs otherwise.
    ft_task = None
    try:
        from .services.forward_test import start_loop_if_enabled

        ft_task = start_loop_if_enabled()
    except Exception:  # noqa: BLE001 - startup must never break on an optional loop
        ft_task = None
    try:
        yield
    finally:
        for t in (task, ft_task):
            if t is not None:
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await t


def create_app() -> FastAPI:
    app = FastAPI(title="Jarvis Backend", version="0.1.0", lifespan=_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_routes.router)
    app.include_router(functions_routes.router)
    app.include_router(science_routes.router)
    app.include_router(predict_routes.router)
    app.include_router(entities_routes.router)
    app.include_router(streams_routes.router)
    app.include_router(history_routes.router)
    app.include_router(ontology_routes.router)
    app.include_router(search_routes.router)
    app.include_router(ops_routes.router)
    app.include_router(bridge_routes.router)
    app.include_router(pipelines_routes.router)
    app.include_router(aip_routes.router)
    app.include_router(security_routes.router)
    app.include_router(collab_routes.router)
    app.include_router(reports_routes.router)
    app.include_router(graph_routes.router)

    @app.get("/")
    async def root():
        return {"service": "jarvis-backend", "status": "ok"}

    return app


app = create_app()
