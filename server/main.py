import contextlib
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .routes import admin as admin_routes
from .routes import aip as aip_routes
from .routes import aip_tools as aip_tools_routes
from .routes import auth as auth_routes
from .routes import datasets as datasets_routes
from .routes import brain_crm as brain_crm_routes
from .routes import brain_extras as brain_extras_routes
from .routes import brain_research as brain_research_routes
from .routes import bridge as bridge_routes
from .routes import jarvis_os as jarvis_os_routes
from .routes import jarvis_ontology as jarvis_ontology_routes
from .routes import jarvis_er as jarvis_er_routes
from .routes import jarvis_policy as jarvis_policy_routes
from .routes import jarvis_platform as jarvis_platform_routes
from .routes import jarvis_state as jarvis_state_routes
from .routes import jarvis_db as jarvis_db_routes
from .routes import jarvis_taxonomy as jarvis_taxonomy_routes
from .routes import jarvis_research as jarvis_research_routes
from .routes import jarvis_agent as jarvis_agent_routes
from .routes import graph_stream as graph_stream_routes
from .routes import jarvis_scrape as jarvis_scrape_routes
from .routes import jarvis_assets as jarvis_assets_routes
from .routes import jarvis_ui as jarvis_ui_routes
from .routes import jarvis_world as jarvis_world_routes
from .routes import jarvis_system as jarvis_system_routes
from .routes import jarvis_documents as jarvis_documents_routes
from .routes import chat_predict as chat_predict_routes
from .routes import collab as collab_routes
from .routes import connectors as connectors_routes
from .routes import entities as entities_routes
from .routes import governance as governance_routes
from .routes import graph as graph_routes
from .routes import graph_time as graph_time_routes
from .routes import labs as labs_routes
from .routes import forge as forge_routes
from .routes import functions as functions_routes
from .routes import gateway as gateway_routes
from .routes import geo as geo_routes
from .routes import history as history_routes
from .routes import investigations as investigations_routes
from .routes import ontology as ontology_routes
from .routes import ontology_ext as ontology_ext_routes
from .routes import ops as ops_routes
from .routes import pipelines as pipelines_routes
from .routes import predict as predict_routes
from .routes import reports as reports_routes
from .routes import scenario as scenario_routes
from .routes import sci_domains as sci_domains_routes
from .routes import science as science_routes
from .routes import second_brain as second_brain_routes
from .routes import search as search_routes
from .routes import search_plus as search_plus_routes
from .routes import search_semantic as search_semantic_routes
from .routes import security as security_routes
from .routes import streams as streams_routes
from .routes import temporal as temporal_routes
from .routes import vault as vault_routes
from .routes import tenancy as tenancy_routes
from .routes import workshop as workshop_routes


def _ingest_enabled() -> bool:
    return os.environ.get("HISTORY_INGEST_ENABLED", "").lower() in ("1", "true", "yes")


def _autobuild_on_start() -> bool:
    return os.environ.get("AUTOBUILD_ON_START", "").lower() in ("1", "true", "yes")


async def _autobuild_loop():
    """Self-enrichment loop: build + GPU-embed + LLM-enrich the knowledge base on
    start-up and on an interval. Opt-in via AUTOBUILD_ON_START. Runs the (sync) build
    in a worker thread so the event loop keeps serving. Never crashes the app."""
    import asyncio

    from .services import jarvis_autobuild as ab

    delay = int(os.environ.get("AUTOBUILD_START_DELAY_S", "10"))
    interval = max(60, int(os.environ.get("AUTOBUILD_INTERVAL_S", "1800")))
    scrape_batches = int(os.environ.get("AUTOBUILD_SCRAPE_BATCHES", "1"))
    enrich_limit = int(os.environ.get("AUTOBUILD_ENRICH_LIMIT", "12"))
    await asyncio.sleep(delay)  # let the server come up before the heavy build
    while True:
        try:
            await asyncio.to_thread(
                ab.run_once, scrape_batches=scrape_batches, enrich_limit=enrich_limit
            )
        except Exception:  # noqa: BLE001 - a build failure must never kill the loop
            pass
        await asyncio.sleep(interval)


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

    # Opt-in self-enrichment build loop (scrape -> GPU embed -> LLM enrich). Disabled
    # by default; enable with AUTOBUILD_ON_START=true so the system builds + deepens
    # its knowledge base on every boot and on an interval.
    ab_task = None
    try:
        if _autobuild_on_start():
            ab_task = asyncio.create_task(_autobuild_loop())
    except Exception:  # noqa: BLE001 - startup must never break on an optional loop
        ab_task = None
    try:
        yield
    finally:
        for t in (task, ft_task, ab_task):
            if t is not None:
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await t


def create_app() -> FastAPI:
    app = FastAPI(title="Jarvis Backend", version="0.1.0", lifespan=_lifespan)
    # Unless JARVIS_CORS_ORIGINS is explicitly set, allow any origin (this is a
    # self-hosted, bearer-token-gated app; a deployed UI on http://<server>:5173
    # was being CORS-blocked from its own backend, causing all-zeros). When the env
    # IS set, lock to that exact list.
    _cors_explicit = bool(os.environ.get("JARVIS_CORS_ORIGINS"))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS if _cors_explicit else [],
        allow_origin_regex=None if _cors_explicit else r"https?://.*",
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
    # datasets (Wave-7 rich catalog) before pipelines so it wins the shared
    # /v1/datasets paths; pipelines keeps its connector-kinds/transform/pipeline
    # endpoints (distinct paths).
    app.include_router(datasets_routes.router)
    app.include_router(pipelines_routes.router)
    app.include_router(aip_routes.router)
    app.include_router(security_routes.router)
    app.include_router(collab_routes.router)
    app.include_router(reports_routes.router)
    app.include_router(graph_routes.router)
    app.include_router(labs_routes.router)
    app.include_router(workshop_routes.router)
    app.include_router(admin_routes.router)
    app.include_router(temporal_routes.router)
    app.include_router(geo_routes.router)
    app.include_router(scenario_routes.router)
    app.include_router(search_semantic_routes.router)
    app.include_router(aip_tools_routes.router)
    app.include_router(jarvis_agent_routes.router)
    app.include_router(graph_stream_routes.router)
    app.include_router(jarvis_scrape_routes.router)
    app.include_router(jarvis_assets_routes.router)
    app.include_router(jarvis_ui_routes.router)
    app.include_router(tenancy_routes.router)
    app.include_router(gateway_routes.router)
    app.include_router(search_plus_routes.router)
    app.include_router(ontology_ext_routes.router)
    app.include_router(connectors_routes.router)
    app.include_router(sci_domains_routes.router)
    app.include_router(graph_time_routes.router)
    app.include_router(investigations_routes.router)
    app.include_router(chat_predict_routes.router)
    app.include_router(governance_routes.router)
    app.include_router(vault_routes.router)
    app.include_router(second_brain_routes.router)
    app.include_router(brain_research_routes.router)
    app.include_router(brain_crm_routes.router)
    app.include_router(brain_extras_routes.router)
    app.include_router(forge_routes.router)
    app.include_router(jarvis_os_routes.router)
    app.include_router(jarvis_ontology_routes.router)
    app.include_router(jarvis_er_routes.router)
    app.include_router(jarvis_policy_routes.router)
    app.include_router(jarvis_platform_routes.router)
    app.include_router(jarvis_state_routes.router)
    app.include_router(jarvis_db_routes.router)
    app.include_router(jarvis_taxonomy_routes.router)
    app.include_router(jarvis_research_routes.router)
    app.include_router(jarvis_world_routes.router)
    app.include_router(jarvis_system_routes.router)
    app.include_router(jarvis_documents_routes.router)

    @app.get("/")
    async def root():
        return {"service": "jarvis-backend", "status": "ok"}

    return app


app = create_app()
