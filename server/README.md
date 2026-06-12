# JARVIS Server Layout

This directory contains the JARVIS backend, live dashboard, agents, and service modules.
It is organised by responsibility so you can find the right file quickly without moving anything.

## Quick map

| Directory | Purpose |
|-----------|---------|
| `server/agent/` | Agent OS: planner, executor, tool catalog, memory, jobs, permissions. |
| `server/data/` | SQLite databases, corpus, ontology models, media, runtime state. |
| `server/llm/` | LLM provider shims (Kimi, etc.). |
| `server/ml/` | Forecasting and pattern modules. |
| `server/routes/` | FastAPI/HTTP route handlers (one file per domain). |
| `server/scrapers/` | Web crawlers and discovery scripts. |
| `server/scripts/` | Training, back-testing, ingestion, and live-prediction scripts. |
| `server/services/` | Core business logic: GPU, LLM routing, tasks, ingestion, debugger, optimiser. |
| `server/tests/` | Test suite mirrors `server/services/` and `server/routes/`. |

## Key entry points

- `server/dashboard.py` — standalone live UI server on port 8095 (the Iron-Man HUD).
- `server/main.py` — main API server entry point.
- `server/agent/core.py` — Agent OS planner/executor.
- `server/services/tiered_llm.py` — unified LLM router (Ollama → Kimi → OpenAI → Anthropic).
- `server/services/gpu_instances.py` — Vast.ai GPU lifecycle + brain tunnel keeper.
- `server/services/task_daemon.py` — long-running task orchestration.

## Shared helpers

- `server/services/_http.py` — stdlib JSON proxy helper used by dashboard mini-apps.
- `server/services/_registry.py` — read-only capability map for the Debugger/Optimiser.

## Adding a new service

1. Create `server/services/my_service.py`.
2. Add a matching test in `server/tests/test_my_service.py` if it has logic.
3. Register it in `_registry.py` under the right tag if the Debugger/Optimiser should know about it.
