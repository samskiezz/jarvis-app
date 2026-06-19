# Brain Seams & Providers — Map for Reuse

Goal: tell future-builder where the draft→critique→arbitrate seam, providers,
memory, feedback, and tool wiring already exist so we extend rather than reinvent.

Evidence date: 2026-06-19. All paths absolute under `/opt/jarvis-app-1`.

---

## A. draft → critique → arbitrate

**Canonical implementation:** `server/services/feedback_improver.py`

| Stage      | Function          | Tier called via `tiered_llm.complete` | Trigger severity |
|------------|-------------------|---------------------------------------|------------------|
| draft      | `_draft(issue)`   | `tier="base"` (llama3.1:8b on GPU box)| always           |
| critique   | `_critique(issue, draft)` | `tier="kimi"` (kimi-k2.6 Moonshot)  | warn/slow/err    |
| arbitrate  | `_arbitrate(issue, draft)` | `tier="claude"` (anthropic)        | error/exception  |

Public entrypoints:
- `improve_issue(issue: dict) -> {ok, module, tier, lesson}` — runs the ladder for one event.
- `run_once(limit=12) -> int` — pulls open events from `feedback_bus.open_issues`, dedupes by (module, kind), processes up to `limit`.
- `scout() -> {ok, lesson, tier}` — proactive: reads `tiered_llm.stats()` + `correlator.stats()`, drafts an improvement when no errors are queued.
- `run_forever(interval_s=45)` — daemon loop. Calls `run_once` then `scout` every ~7 passes.

Caller list (where the loop is actually invoked):
- **`__main__` only** — `python -m server.services.feedback_improver`.
- **NOT in `ecosystem.config.cjs`** (11 pm2 procs registered; improver not among them).
- **NOT triggered by `/chat`** or any FastAPI route.
- Bus side, however, IS wired live: `server/worker.py:46-48` calls `feedback_bus.install_global()` + `register_all_modules()` at startup, and `server/dashboard.py:4166-4167` does the same. So events stream IN; just nothing is consuming/arbitrating them on a schedule. Feedback DB has 635 events, 70 lessons (45 llama, 21 kimi, 4 lessons_distiller) — so the loop has run historically, just not as a daemon now.

**Gap to exploit:** the seam works end-to-end. It just needs a pm2 entry to be live.

---

## B. Provider matrix — `server/services/tiered_llm.py` (`_tiers()`)

| Tier   | Engine     | Endpoint                          | Model env / default                | Key env             | Reasoning | Live status |
|--------|------------|-----------------------------------|------------------------------------|---------------------|-----------|-------------|
| micro  | openai-compat | LOCAL_OLLAMA_HOST (127.0.0.1:11435) | OLLAMA_MICRO_MODEL=llama3.2:1b   | "ollama"            | no  | 5/5 ok (live) |
| base   | openai-compat | local CPU OR OLLAMA_HOST (gpu)    | OLLAMA_BASE_MODEL=llama3.1:8b      | "ollama"            | no  | 153,490 calls / 99.99% ok (HOT) |
| strong | openai-compat | OLLAMA_HOST (Vast 4090 tunnel)    | OLLAMA_STRONG_MODEL=qwen2.5:14b    | "ollama"            | no  | 64,273 / 99.4% ok (HOT) |
| heavy  | burst      | `gpu_orchestrator.resolve_endpoint_sync` | HEAVY_MODEL=llama3.3:70b   | "ollama"            | no  | off by default; gated by LLM_ENABLE_70B / ENABLE_70B_TIER. Recent log: 4 attempts → fallback strong |
| kimi   | openai-compat | https://api.moonshot.ai/v1       | KIMI_MOONSHOT_MODEL=kimi-k2.6      | KIMI_MOONSHOT_KEY   | yes | 125 calls / 56 ok (~45% — flaky) |
| openai | openai-compat | https://api.openai.com/v1        | OPENAI_MODEL=gpt-5.5               | OPENAI_API_KEY      | yes | 1/1 ok (rare use) |
| claude | anthropic  | https://api.anthropic.com/v1     | CLAUDE_MODEL=claude-sonnet-4-5     | ANTHROPIC_API_KEY   | yes | 25 calls / 3 ok (key may be down) |

Provider intelligence:
- Single function `_post` (urllib, JSON, fail-fast).
- Local Ollama: hard 15s timeout (so a dead GPU box can't hang chat). Cloud (kimi/openai/claude): `LLM_CLOUD_TIMEOUT` default 120s.
- Slot accounting via `llm_runtime.sync_llm_slot` (concurrency control).
- Telemetry: EVERY call insert-into `server/data/tiered_llm.db.tiered_llm_calls` (tier, model, engine, ok, latency_ms, prompt/completion tokens). Verifiable: `python -m server.services.tiered_llm stats`.
- `_budget_guard` exists but is not used by the public `complete()` (no streaming surface).
- **No tool-calling, no caching, no retries.** `complete()` returns `{ok, content, ...}` on first attempt or `{ok: False}`.

`complete()` signature (the seam everything composes on top of):
```python
complete(prompt: str, *, system: str = "", tier: str = "base",
         max_tokens: int = 1024, fmt: str | None = None,
         module: str = "", temperature: float | None = None) -> dict
```
When `module=` is passed, it auto-primes `system` with `feedback_bus.get_lessons_preamble(module)` and routes failures back to `feedback_bus.record`. **This is the self-improvement closure on the call side.**

---

## C. Memory / context contract

Two parallel stores, both wired into live chat:

1. **`server/services/user_memory.py`** — durable facts about the OWNER.
   - SQLite at `server/data/user_memory.db` (table `memories`).
   - Public API: `remember(text, *, user="owner", kind="fact", weight=1.0) -> bool`, `recall(query, *, user="owner", limit=6) -> list[str]`, `recent(...)`, plus `preamble(query)` (used downstream).
   - Recall is keyword overlap + recency decay + hit count — no embedding.

2. **`server/services/feedback_bus.py`** — lessons about CODE MODULES (the "code memory").
   - SQLite at `server/data/feedback.db` (tables `modules`, `events`, `lessons`).
   - `lesson(module, text, *, trigger, source_tier)` writes. `lessons_for(module, limit=5)` reads. `get_lessons_preamble(module)` returns formatted block.
   - Already prepended by `tiered_llm.complete(..., module=…)`.

3. **Live aggregator: `server/services/context_router.py:build_preamble(query)`** — the seam that already pulls FIVE sources into one capped preamble (`CONTEXT_ROUTER_MAX_CHARS=6000`):
   - `user_memory.preamble(query)` — owner facts
   - `feedback_bus.lessons_for("chat")` — chat lessons
   - `rag.retrieve(query, k=5)` — 200K-row cosine over `vectors.db`
   - `aip.retrieve(query, k=3)` — TF-IDF over 174K ontology objects
   - `decision_ledger.recent(limit=3)` — last committed decisions

Wired in `dashboard.py:_jarvis_chat` (lines 1626–1638). Sysmsg = persona + user_mem + context_router preamble.

4. **`server/agent/memory.py`** — separate `agent_memory.db` for the planner/executor flow (`write(kind, key, value, tags)`, `search(query, limit)`). Distinct from the chat path.

---

## D. Feedback loop wiring (does good output get rewarded?)

- **Errors / slow runs**: caught by `feedback_bus.install_global()` → `events` table → consumed by `feedback_improver` (when running) → distilled into `lessons`.
- **LLM errors**: `tiered_llm.complete(module=...)` writes `feedback_bus.record(module, "llm_error", ...)` on failure.
- **Good output**: NOT rewarded. There is no thumbs-up/-down on chat replies, no reply-quality scoring, no preference store. `forecast_evaluations` / `model_scores` in `self_improvement.py` exist for FORECAST quality (CRPS/RMSE/PSI/ECE) but only `server/services/forecaster*.py` and `server/services/scenario.py` feed it — chat output is invisible to it.
- `audit/auto_improve.log.jsonl` and `viability_model.json` track CODE-CHANGE outcomes (auto_improve.py orchestrator), not chat outcomes.

**Gap:** the feedback DB schema would need ONE column (`outcome: good|bad|null`) or a new `chat_judgements` table for chat critique to ratchet.

---

## E. Tool-calling contract

Two distinct surfaces; neither is wired into `/chat`:

1. **`server/agent/catalog.py` + `server/agent/tools.py`** — REAL handlers (df, du, pm2 logs, docker, file.search, etc.), risk-tagged (`safe_read`, `safe_write`, `system_change`, `destructive`). Permission engine in `server/agent/permission.py`. Planner in `server/agent/core.py` asks `qwen2.5:32b` for a JSON plan whose `tool` ids are constrained to the catalog, then `jobs.run` executes each step. **This is reachable via the Agent OS API, NOT the user-facing /chat.**

2. **`server/services/jarvis_agent.py` + `server/routes/jarvis_agent.py`** — separate `POST /v1/jarvis/agent/chat` that uses `llm_research.llm_complete` / `llm_router` (NOT `tiered_llm`) in JSON fmt for plan synth. Distinct ladder. Up to 6 steps.

`tiered_llm.complete()` has **no `tools=` parameter** — function-calling at the API level is unused.

---

## F. Top 5 places to inject ensemble/critique into live `/chat`

Ranked by "smallest diff for biggest quality win":

1. **`dashboard.py:_jarvis_chat` line 1641-1648** — currently a single `tier="strong"` call. Wrap with `improve_issue`-style ladder: strong drafts → kimi critiques → claude arbitrates ONLY for `severity==error` (heuristic: short reply, hallucinated fact, low confidence). Reuse `feedback_improver._critique`/`_arbitrate` directly. **Highest leverage.**

2. **`server/services/feedback_improver.py` daemonization** — add to `ecosystem.config.cjs` as `jarvis-improver` running `run_forever(45)`. 635 events already queued, 0 being consumed. Zero new code needed.

3. **`server/services/context_router.py:build_preamble`** — append a sixth block: `tiered_llm.complete(query, tier="micro", system="Rewrite this user question into 3 search variants, JSON")` and union into the RAG / ontology retrieval (query expansion). Cheap (micro tier ~free) and addresses the brain-still-missing-context problem.

4. **`server/services/tiered_llm.py:complete`** — add an optional `judge_tier=` param. When set, run primary at `tier`, then run a one-shot `tier=judge_tier` on the output with a critique prompt; if the judge returns "REVISE: X" splice X back. Lets ANY caller opt into a 2-tier critique without rewriting their call site (e.g. `T.complete(p, tier="strong", judge_tier="kimi")`).

5. **New `server/services/chat_judge.py`** — capture `(prompt, reply, latency, model)` into `feedback.db` with a nullable `outcome` column; `route /chat/rate` writes user 👍/👎; nightly job runs `kimi` over each unrated turn ("did this answer the user?") and writes synthetic outcomes. This closes the loop section D currently lacks — the ladder gets real reward signal instead of only error signal.

---

## Quick reference — verifiable commands

```bash
# Tier traffic (the proof the ladder ticks):
python -m server.services.tiered_llm stats

# Lessons + events state:
sqlite3 server/data/feedback.db "SELECT source_tier, COUNT(*) FROM lessons GROUP BY source_tier"

# Improver one-pass (drains queue, no daemon):
python -m server.services.feedback_improver 0   # interval=0 still loops; use run_once interactively
```
