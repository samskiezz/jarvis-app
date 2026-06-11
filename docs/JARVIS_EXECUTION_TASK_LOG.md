# JARVIS Execution Task Log

Working rule from Sam: preserve every feature, function, integration, UI design, colour, and visual identity unless explicitly instructed otherwise. Optimise by wrapping, gating, batching, testing, and documenting.

## Current Review Build

- Local review URL: `http://127.0.0.1:5173/`
- Branch/write state: working tree only. No commit and no push.
- Verification already green: frontend lint, production build, Vitest, targeted Python tier-policy tests, Python compile for touched files, GPU shell syntax.
- Known Python test gap: Underworld pytest needs optional scientific packages such as `rdkit` and `Bio`; broad route/simulation subsets also timed out in this sandbox.

## LLM Tier System Findings

1. `config/llm_router.json` defines the intended 6-tier policy, but enforcement is not yet universal.
2. `server/services/llm_gate.py` implements the best policy layer: tier 0 short-circuit, worker max tier, VRAM gates, one-step escalation, and routing telemetry.
3. `server/services/tiered_llm.py` is now guarded so 70B/heavy falls back to strong unless `LLM_ENABLE_70B=1` or `ENABLE_70B_TIER=1`.
4. `server/services/llm_research.py` was still able to use a persisted or env-set `OLLAMA_MODEL=...70b`; it now blocks that by default.
5. `underworld/server/tools/llm.py` was still defaulting overmind/god-brain/high-major to 70B; it now defaults those layers to `qwen2.5:32b` unless 70B is explicitly enabled.
6. Direct bypasses remain and need consolidation: `server/services/multi_research.py`, `server/services/reports.py`, `server/services/prediction.py`, `server/services/agent_studio.py`, `server/services/tripo_client.py`, `server/services/proactive_loop.py`, `server/services/aip_logic.py`, `server/services/aip_evals.py`, and `server/services/llm_router.py`.
7. `llm_gate.py` now parses `5_extreme` as `extreme` instead of accidentally treating it as an unknown tier.
8. `llm_gate.py` no longer jumps `strong -> claude` as the default validation escalation. Escalation follows the policy ladder and will not enter heavy/70B unless `LLM_ENABLE_70B=1`.
9. `server/services/llm_runtime.py` now provides the shared 70B guard and local/Ollama-family concurrency throttle.

## Backlog: LLM And GPU

1. Make `llm_gate.gated_complete()` the only default completion entrypoint for Jarvis research, enrich, autopilot, agent studio, reports, AIP, and batch loaders.
2. Keep compatibility wrappers for old imports, but route them through `llm_gate` with worker names and max-tier policy.
3. Add tests proving `OLLAMA_MODEL=llama3.3:70b` cannot make base/strong/background jobs use 70B.
4. Add tests proving Underworld `overmind`, `god_brain`, and `high_major` resolve to `qwen2.5:32b` until `UNDERWORLD_ENABLE_70B=1`.
5. Done first pass: shared local/Ollama-family runtime throttle. Defaults to `LLM_LOCAL_PARALLEL` or `OLLAMA_NUM_PARALLEL`, with fail-fast `LLM_LOCAL_QUEUE_TIMEOUT_S`.
6. Next pass: add one model-load lock and drain batches per model before switching tiers.
7. Add routing telemetry to every LLM call: worker, requested tier, resolved tier, model, fallback, latency, tokens, vram gate, validation result.
8. Make 70B disposable GPU instance creation future-only and manually enabled; keep the code path present but cold.
9. Split Hostinger/Vast deployment roles: API, worker, scheduler, GPU registry, and burst GPU worker.
10. 2026 research note: keep client call sites conservative and let inference servers do dynamic/continuous batching. NVIDIA Triton documents dynamic batching, queue delay, priority, queue policy, and continuous/inflight batching for LLM-style variable-length requests. vLLM/PagedAttention and SGLang/RadixAttention are the target-class engines to evaluate later for KV-cache reuse and higher throughput when Ollama is no longer enough.

## Backlog: Underworld Batching

1. Replace in-process manual tick tasks with durable DB jobs before multi-process deployment.
2. Replace in-memory SSE bus with a durable event outbox and cursor-based streaming.
3. Add per-world DB leases or optimistic tick versioning so two processes cannot advance the same world.
4. Commit each simulation tick as an atomic unit; move expensive cognition/LLM side effects to queued phases.
5. Add worker heartbeats and visible loop error counters; silent broad `except: pass` blocks must become telemetry.

## Backlog: Responsive And Visual QA

1. Run `scripts/responsive-audit.mjs` before every UI push.
2. Add screenshots for desktop, laptop, tablet, and mobile for critical routes first.
3. Fail the audit on console errors, page crashes, empty body text, horizontal overflow, and obvious invisible/blank screens.
4. Add a second pass for interaction flows: first-run modal, sidebar navigation, command palette, gateway proxy request, setup GPU URL form, terminal panels.
5. Add visual baselines only after the layout is stable; first use smoke screenshots to avoid freezing bad layouts as truth.
6. Responsive audit now has two modes: deterministic fixture mode by default for visual QA, and live integration mode via `JARVIS_AUDIT_FIXTURE_API=0 npm run audit:responsive`.
7. First full fixture-backed run result: 40 hard checks passed across home, portal, cinematic, setup, terminal, gateway, reports, plane graph, command, and dashboard at desktop/laptop/tablet/mobile.
8. Done first pass: cinematic loader no longer tries unmuted autoplay before browser user activation; it starts muted when required and restores audio on gesture.
9. Add screenshot review workflow: inspect `/tmp/jarvis-responsive-audit/*.png`, log asymmetry/spacing/button-position issues, then patch one page at a time without changing colour/design language.
10. Screenshot-confirmed mobile polish fixed: `GatewayConsole` action cards now stack single-column on narrow viewports.
11. Screenshot-confirmed mobile polish: `JarvisTerminal` is a desktop command wall clipped into a phone viewport; needs a dedicated mobile panel carousel/drawer mode instead of showing all workspace panels at once.
12. Screenshot-confirmed mobile polish: `Setup` core/WebGL panel has washed-out header text over the bright scene and the floating JARVIS orb can overlap lower-right content; tune after mobile panel mode lands.
13. Current full responsive audit result after loader fix: 40 hard checks passed, 0 page errors, 0 failed requests, 4 non-fatal Setup/WebGL console warnings, 299 tiny touch-target findings across the matrix. Most touch-target debt is `JarvisTerminal`.
