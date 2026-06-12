"""Service registry — a read-only map that helps the Debugger and Speed Optimiser
find components without hard-coding file names. Nothing imports this at runtime
unless those tools are explicitly invoked, so it cannot break the app."""
from __future__ import annotations

# Service modules grouped by capability. Used by diagnostic/optimiser mini-apps.
SERVICES: dict[str, list[str]] = {
    "gpu": ["gpu_instances", "gpu_client", "gpu_compute", "voice_clone_gpu"],
    "llm": ["tiered_llm", "llm_router", "llm_autopilot", "llm_enrich", "llm_research", "llm_runtime", "llm_gate"],
    "storage": ["document_store", "pg_store", "pg_pool", "pg_embeddings", "history_lake", "corpus"],
    "ingest": ["ingestion", "jarvis_ingest", "feed_scraper", "jarvis_scrape", "doc_seeds"],
    "ui": ["jarvis_ui_builder", "ui_bus", "theme_generator"],
    "system": ["task_daemon", "orchestrator_daemon", "jarvis_watchdog", "scheduler_svc", "self_improvement"],
}

# PM2 services that the Optimiser is allowed to pause/resume. Core lifelines are excluded.
PAUSABLE_SERVICES: list[str] = [
    "jarvis-ingestor",
    "jarvis-orchestrator",
    "jarvis-worker",
    "jarvis-batch-loader",
    "jarvis-correlator",
    "jarvis-feedback",
    "jarvis-tasks",
    "jarvis-glb-loader",
]

# Core services that must never be paused/stopped by an automatic optimisation pass.
LIFELINE_SERVICES: list[str] = [
    "jarvis-backend",
    "jarvis-dashboard",
    "jarvis-watchdog",
]


def modules_by_tag(tag: str) -> list[str]:
    return SERVICES.get(tag, [])


def is_pausable(name: str) -> bool:
    return name in PAUSABLE_SERVICES


def is_lifeline(name: str) -> bool:
    return name in LIFELINE_SERVICES
