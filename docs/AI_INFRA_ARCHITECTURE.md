# JARVIS / Underworld — AI Infrastructure Architecture (design for review)

**Status:** DESIGN — no execution until approved. Author: Claude. Goal: every CPU core, GPU,
VRAM GB, TFLOP and TB of storage *earning its keep, autonomously, all the time* — and the whole
backend "smashing it" instead of an 8-core VPS choking while a 2×4090 monster idles.

---

## 0. The honest current state (why "nothing is auto-running like we needed")

| Thing | Reality today |
|---|---|
| Heavy work location | **Wrong machine.** Scrape/parse/OCR/enrich run on the **Hostinger VPS (~8 cores) → pinned at 95%**, while the **Vast box (56 cores, 2×4090, 128 GB) sits at ~0.5% GPU / 0.9% CPU.** |
| Llama tier ladder | **Not real.** Box has only `llama3.1:8b` + `llama3.2:3b` pulled. No `32b` (qwen removed), no `70b`. JARVIS uses 8b for *everything* — there is no autonomous tier routing. |
| Inference engine | **Ollama** — web-confirmed ~40 tok/s ceiling, uses **one** GPU per model (your 2nd 4090 is idle by design). The box's real engine, **SGLang** (continuous batching, both GPUs, ~20×), is **disabled**. |
| Autonomy | Partial. `jarvis-worker` runs autobuild/enrich/autopilot, but web/CPU-bound + on the wrong box, so the GPU only bursts. The grounded research is slow (≈75 min/2k topics). |
| Network | Every inference round-trips **VPS → box → VPS** over SSH/HTTP — latency tax on every call. |
| Self-improvement | The **Forge** agent exists (`forge_scheduler.py`, dry-run, never touches main) but isn't wired into an evolve→PR→test→version loop. |
| Cross-app | Underworld↔JARVIS LLM "chat"/feedback loop: built for **Underworld only**; not bridged to JARVIS. |

**Root cause in one line:** work isn't placed by resource. The fix is *placement + the right engine + real tier routing + a queue*, not "send more jobs."

---

## 1. Resource inventory (what we're actually optimising)

- **Hostinger VPS** — ~8 cores, the durable control plane + truth store. *Should idle.*
- **Vast box `39732156`** — AMD EPYC **56 cores** / **128 GB RAM** / **2× RTX 4090 (48 GB VRAM, 162 TFLOPS, 878 GB/s)** / 64 GB disk. *The workhorse.* (Vast credit ~$36 — burn rate matters.)
- **Cloud LLMs** — gpt-5.5 / gpt-4o(-mini) (OpenAI), kimi-k2.6 / moonshot-v1 (Moonshot $98), Claude (me, orchestrator). *Elastic burst + the smart tiers.*
- **Object/VPS storage** — canonical DB (Postgres/SQLite), job snapshots, outputs, model cache.

---

## 2. Target architecture — "VPS = brain, box = body" (your infra doc, realised)

```
        Hostinger VPS (BRAIN — light, always-on)
        ├─ API (jarvis-backend)  — serves UI, never does heavy work
        ├─ Postgres/SQLite       — canonical truth (world/agents/notes/jobs/versions)
        ├─ Redis job queue       — realtime / batch / research / embed / ocr lanes
        ├─ Router + Job Classifier — tier + worker selection, health, cost cap
        └─ Version ticker        — every accepted change bumps + records semver
                     │  (jobs in / results out — NOT raw compute)
                     ▼
        Vast box (BODY — 56 cores + 2×4090, runs EVERYTHING heavy LOCALLY)
        ├─ box-worker (NEW)      — pulls jobs from the VPS queue; runs on the 56 cores
        │   ├─ scrape / parse / OCR  → 56-core process pool (not 8)
        │   ├─ embeddings            → local GPU (nomic-embed), zero network hop
        │   └─ enrich / research     → local LLM, zero network hop
        ├─ SGLang  (re-enabled)  — continuous batching across BOTH 4090s (~20× Ollama)
        └─ tiered models (below)
```

**Why this kills the inefficiency:** scraping uses 56 cores not 8; inference is local (no VPS↔box hop); both 4090s work (SGLang); the VPS CPU is freed to just serve.

---

## 3. The autonomous Llama tier ladder (the part that "isn't running")

VRAM budget = 48 GB. Concrete, fits, and **all tiers auto-resident**:

| Tier | Model | VRAM | Engine | Auto-use |
|---|---|---|---|---|
| L0 micro | `llama3.2:3b` | ~3 GB | Ollama | routing, JSON-repair, classification |
| L1 base | `llama3.1:8b` | ~6 GB | **SGLang** (batched) | bulk research/enrich/chatter — the workhorse |
| L2 strong | `qwen2.5:14b` or `32b` (re-pull) | ~10–20 GB | SGLang | planning, harder summaries |
| embed | `nomic-embed-text` | ~0.5 GB | Ollama | all embeddings |
| L3 heavy 70B | `llama3.3:70b` Q4 | ~40 GB | **disposable Vast burst** (separate instance) | rare big reasoning — spun on demand, destroyed after idle (the gpu_orchestrator I already built) |

**Autonomy = a single always-on `box-worker` loop** (supervisor/pm2 on the box) that never sleeps:
continuously pulls the next job from the VPS queue → classifies → routes to the right tier → runs
it locally → writes the result back → logs cost/latency. The 70B/120B tier auto-provisions a Vast
burst worker only when a job's classifier says "ultra" (then drains + destroys — the dormant
`gpu_orchestrator.py` does this). **Nothing waits for a human; the queue is never empty because the
autobuild + topic backlog feed it.**

---

## 4. Inference engine decision: SGLang for throughput, Ollama for convenience

- **SGLang** (the box's own template) on **both 4090s** with continuous batching → the only way to
  actually saturate 2×4090 (~hundreds of tok/s vs Ollama's ~40). Serve L1/L2 here.
- **Ollama** kept for the small/embed/vision models (`3b`, `nomic-embed`, `minicpm-v`) where its
  convenience > its throughput cost.
- The Router treats both as OpenAI-compatible backends; health-checked; SGLang preferred for bulk.

---

## 5. The job queue + classifier (so the box is never idle and never overloaded)

- **Redis (or SQLite-backed) queue on the VPS**, lanes: `realtime`, `research`, `enrich`, `embed`,
  `ocr`, `ultra`. Each job carries an input snapshot (replayable) + `safe_to_retry`.
- **Classifier** picks lane + tier (micro/base/strong/ultra) by size/urgency.
- **box-worker** pulls with per-lane concurrency tuned to the box (scrape ≈ 40 of 56 cores; LLM ≈
  SGLang's batch; embed ≈ GPU). Backpressure: stop pulling a lane when its resource is saturated.
- **Cost governor:** local (box) jobs free → preferred; cloud (gpt-5.5/kimi) for burst with the
  $-cap; the 70B burst only on `ultra`.

---

## 6. The self-improvement loop (evolve → self-code → PR → test → version) — the billion-$ part

Leverages the **existing Forge** (`forge_scheduler.py`), kept SAFE (it already defaults dry-run,
never touches main):

```
observe (telemetry: slow calls, errors, cost)        ← Kimi "scout" summarises what's weak
   → propose improvement (LLM: Claude plan / Kimi/gpt-5.5 drafts)
   → Forge writes change on a NEW branch  (never main)
   → SCRUTINY GATE: tests + lint + the existing /code-review + a red-team pass
   → open PR  (human-merge by default; auto-merge only behind an explicit allowlist + green CI)
   → measure: is it faster / cheaper / higher-value than baseline? keep:reject
   → on keep → VERSION TICKER bumps (semver + changelog row) ; on reject → discard branch
```

**Safety (non-negotiable for a billion-$ system):** AI opens PRs, **humans (or a strict CI gate)
merge**. No autonomous merge to `main` without green tests + the review pass + an explicit opt-in
flag. Every change is a reversible branch.

---

## 7. Cross-app: Underworld ↔ JARVIS feedback bus

A shared message bus (Redis pub/sub or a `cross_app_events` table) so the two "30B-class" brains
exchange state: Underworld's Director surfaces emergent patterns; JARVIS's research surfaces facts;
both feed the evolution loop's "observe" stage. Kimi is the **translator/feedback courier** between
them (its proven role), writing validated lessons where each Llama reads them (the `UwLesson`
pattern already built in Underworld → mirror for JARVIS).

---

## 8. Version ticker

`version` table on the VPS: `{semver, ts, change_summary, perf_delta, cost_delta, commit_sha,
kept:bool}`. Bumped by the self-improvement loop on every accepted change; exposed at
`GET /v1/system/version`; shown in the UI. Patch = optimisation, minor = new capability, major =
architecture shift.

---

## 9. Storage plan

- **VPS:** canonical DB (truth), job snapshots, version history, outputs index. Backed up.
- **Box:** model cache (GGUF/SGLang weights), scratch, render/embedding cache — *rebuildable*, not
  truth.
- **Object store (future):** large assets (the 12 GB GLBs) + cold archives → off git/VPS.

---

## 10. Phased execution (each phase independently shippable + reversible)

1. **P1 — Placement (the big win):** deploy `box-worker` on the Vast box (56 cores + local GPU);
   move scrape/parse/OCR/embed/enrich there; VPS becomes light API+DB. *Frees the VPS CPU, uses the
   box.* (Needs box deploy access.)
2. **P2 — Engine:** re-enable SGLang on both 4090s for L1/L2; Router prefers it. *Saturates the GPU.*
3. **P3 — Queue + classifier + tier routing:** the never-idle autonomous loop; re-pull 14b/32b.
4. **P4 — Burst:** wire the dormant `gpu_orchestrator` for on-demand 70B (Vast disposable).
5. **P5 — Self-improvement loop + version ticker** (Forge + scrutiny gate + PR).
6. **P6 — Cross-app bus + Kimi courier.**

## 11. Open decisions for you
- **Box deploy access** (SSH vs you-run-my-script) — gates P1/P2.
- **SGLang model** for L1 (8b for speed vs 14b for quality on continuous batching).
- **Auto-merge** ever, or always human-merge? (I strongly recommend human-merge for a billion-$ sim.)
- **Vast spend**: keep the base box always-on (~$0.30/hr idle) + burst, vs scale-to-zero.
