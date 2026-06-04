# 10 — COMPUTE & GPU STRATEGY

**Document class:** Master Engineering Spec — ISO-execution depth
**Parent:** `00_MASTER_INDEX.md` (§2 architecture footer: *"COMPUTE: gpu_backend (CuPy/NumPy) + optional remote inference (PREDICT_GPU_URL) [§10]"*)
**Scope:** how every PATTERN ORACLE computation actually runs today, how it accelerates when a GPU appears, and how it reaches a remote inference tier for foundation models — with **honest** accounting of what is installed versus aspirational.

> **Prime directive (non-negotiable):** Everything in PATTERN ORACLE MUST run, correctly, in **T0 (pure CPU, NumPy/SciPy/scikit-learn)** with no GPU and no remote endpoint. GPU (T1) and remote inference (T2) are *graceful upgrades* that improve latency/quality, never *requirements*. Any code path that hard-requires CuPy, torch, Ray, or `PREDICT_GPU_URL` is a defect.

---

## 10.0 HONESTY PREAMBLE — what is actually installed

This is the load-bearing honesty statement for the whole compute strategy. Do not let later sections imply more than this.

| Claim | Reality (verified against repo) |
|---|---|
| CuPy installed | **No.** `gpu_backend.get_backend()` *attempts* `import cupy` inside a `try/except` and **falls back to NumPy** on `ImportError`. CuPy is not in any `requirements.txt`. |
| PyTorch installed | **No.** `available_backends()` *probes* `import torch` in a `try/except` for reporting only; torch is not a dependency. |
| Ray / distributed workers | **No.** Referenced in design language only. The runtime is a **single-process asyncio** FastAPI app per backend. |
| NumPy / SciPy / scikit-learn | **Yes, on the underworld side.** `underworld/server/requirements.txt` pins `numpy>=1.26`, `scipy>=1.11`, `scikit-learn>=1.3`, plus `sympy`, `networkx`, `astropy`. |
| NumPy on the JARVIS side | **Yes, minimal.** `server/requirements.txt` pins only `numpy>=1.26`; **no scipy/sklearn** there. |
| `PREDICT_GPU_URL` env var | **Does not exist yet.** No code reads it today. This document specifies its contract for T2; until set, the system runs T0/T1. |
| GPU VPS | **Exists but occupied.** A vast.ai-class GPU host currently powers **UE5 pixel-streaming**, not ML inference. It is *not* free capacity for PATTERN ORACLE today. |

**Consequence:** the *current compute reality* of PATTERN ORACLE is **T0 only** — pure NumPy/SciPy/sklearn forecasters and pattern discovery, single-process asyncio. T1 and T2 are the upgrade ladder this document specifies.

---

## 10.1 CURRENT COMPUTE REALITY

### 10.1.1 The `gpu_backend` drop-in
`underworld/server/services/gpu_backend.py` is the single seam for CPU↔GPU portability. It binds one array namespace `xp` to **CuPy if a CUDA GPU + CuPy are present, else NumPy**, so the *identical* numeric code runs either place.

Public surface (verified):

```python
@dataclass(frozen=True)
class Backend:
    xp: Any        # the array module (cupy or numpy)
    name: str      # "cupy" | "numpy"
    device: str    # human-readable device label
    is_gpu: bool
    def asnumpy(self, a):  ...   # host transfer; no-op under numpy
    def synchronize(self): ...   # block on GPU queue (honest timing); no-op under numpy
    def rng(self, seed=0): ...   # device-correct Generator (default_rng)

def get_backend(prefer="auto") -> Backend   # 'auto'|'cupy'|'numpy'
def available_backends() -> dict            # {numpy, cupy, torch_cuda, gpus, devices}
```

Behavioural contract that PATTERN ORACLE relies on:
- `get_backend("auto")` returns a NumPy `Backend` on any dev box / CI / the current (GPU-occupied) state — **never raises** for missing CuPy. It only raises if `prefer="cupy"` is *explicitly* requested and unavailable (`RuntimeError("CuPy/GPU requested but unavailable")`).
- `available_backends()` is a **read-only probe** used before dispatch / capacity reporting; it never imports lazily-failing modules outside `try/except`. It also reports `torch_cuda` so a future torch-based remote server can be detected without making torch a hard dep.
- `asnumpy()` / `synchronize()` make GPU↔host transfer and timing explicit, so the same call site is correct on both backends.

### 10.1.2 The single-process scheduler
Both FastAPI backends (`server/`, the JARVIS predictor; `underworld/server/`, the 464-method engine) run as **single-process asyncio** apps. There is **no** task queue, worker pool, or Ray cluster. CPU-bound numeric work (NumPy/SciPy) blocks the event loop unless offloaded; PATTERN ORACLE MUST offload heavy synchronous numerics with `asyncio.to_thread` / a bounded `ThreadPoolExecutor` (see §10.3) to keep the loop responsive. This is the *only* concurrency primitive available in T0.

### 10.1.3 What runs in T0 today
- **Forecasters:** closed-form / classical only — GBM Monte-Carlo + Holt, ARIMA-class, exp/logistic, Gutenberg-Richter/Omori, ballistic/orbital (`server/services/prediction.py`), all NumPy.
- **Pattern discovery (planned T0 form):** Matrix-Profile motifs, HDBSCAN regimes, PELT/BOCPD change-points, Granger/CCM lead-lag — all have **pure-NumPy/SciPy/sklearn** implementations (see §10.7 for which libraries accelerate them).
- **Covariance / ensemble math:** EnKF covariance, correlation matrices, distance matrices — NumPy `einsum`/`@`/`cov`.
- **Reference workload:** `scale_bench.py` proves the *vectorised* style: one `rich_tick` runs the identical per-entity logic as batched array ops (`einsum`, `tanh`, `clip`, boolean masks) on `xp`, so it is GPU-ready without a second code path. PATTERN ORACLE's batched forecasting/discovery kernels follow the same discipline.

---

## 10.2 TIERED COMPUTE MODEL

PATTERN ORACLE defines three compute tiers. **Selection is automatic and degrades gracefully downward.**

```
┌── T2  REMOTE GPU INFERENCE ─────────────────────────────────────────┐
│  Foundation TS models (TimesFM/Chronos-Bolt/Lag-Llama), temporal     │
│  GNNs. Behind PREDICT_GPU_URL. HTTP to a Triton/vLLM/TorchServe-     │
│  style endpoint. UNSET ⇒ skip silently, fall to T0.                   │
├── T1  LOCAL CuPy ACCELERATION ──────────────────────────────────────┤
│  Heavy matrix ops via gpu_backend when a CUDA GPU + CuPy are present: │
│  correlation matrices, EnKF covariance, pairwise distance matrices,   │
│  batched Monte-Carlo. Same kernels as T0; xp = cupy. Absent ⇒ T0.    │
├── T0  IN-PROCESS PURE-NUMPY (ALWAYS AVAILABLE) ─────────────────────┤
│  Classical/closed-form forecasters + pattern discovery. NumPy/SciPy/  │
│  sklearn. Single-process asyncio. THE FLOOR — must always work.       │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.2.1 T0 — pure NumPy/SciPy (runs now)
Every forecaster and every pattern-discovery primitive has a T0 implementation. T0 is the correctness reference: T1/T2 results are validated against T0 within tolerance during backtesting (`08_*`, `11_*`).

### 10.2.2 T1 — CuPy acceleration via `gpu_backend`
When `get_backend("auto").is_gpu` is true, heavy linear algebra runs on the GPU **through the same kernel source**. Targets, in priority order of speedup-per-effort:

| Op | T0 (NumPy) | T1 (CuPy) | Why it accelerates |
|---|---|---|---|
| Cross-series correlation matrix | `np.corrcoef` / `einsum` | `cupy.corrcoef` / `einsum` | O(S²·L) over many series → GPU BLAS |
| EnKF ensemble covariance | `np.cov`, `X @ X.T` | `cupy.cov`, `@` | dense covariance of large ensembles |
| Pairwise distance matrices (regime/motif) | `scipy.spatial.distance` / `einsum` | `cupy` `einsum` + reductions | O(N²·d) embarrassingly parallel |
| Batched Monte-Carlo forecast paths | vectorised NumPy | vectorised CuPy | thousands of paths × horizons |
| Matrix-Profile distances (STUMP-style) | NumPy sliding dot | CuPy / STUMPY-cuda | sliding-window dot products |

Rule: a T1 kernel is **literally the T0 kernel** with `xp = get_backend().xp`. Results returned to async/HTTP land via `backend.asnumpy(...)`. No second algorithm, no divergence.

### 10.2.3 T2 — remote GPU inference (foundation models)
Foundation time-series transformers (TimesFM, Chronos-Bolt, Lag-Llama) and temporal GNNs are **not** array kernels — they need torch + GPU weights. PATTERN ORACLE does **not** load these in-process. Instead it calls a **remote inference server** behind:

```
PREDICT_GPU_URL   # e.g. http://gpu-host:8000   (UNSET by default ⇒ T2 disabled)
```

**Graceful fallback:** if `PREDICT_GPU_URL` is unset, unreachable, times out, or returns an error, the forecast core **silently drops the foundation-model member** from the ensemble and proceeds with T0/T1 classical members. The answer is still produced (with appropriately widened intervals); a `caveats[]` note records that the learned member was unavailable.

#### Inference-client contract (T2)
Target: a **Triton / vLLM / TorchServe-style** HTTP endpoint. The client lives in PATTERN ORACLE as a thin async wrapper over `httpx.AsyncClient` (already a dependency on both backends).

**Endpoint shape (canonical):**
```
POST {PREDICT_GPU_URL}/v1/forecast
GET  {PREDICT_GPU_URL}/v1/health        # readiness + loaded models + max_batch
```

**Request (JSON):**
```jsonc
{
  "model": "timesfm-2.5",          // or "chronos-bolt-base", "lag-llama"
  "series": [                       // BATCH of independent series
    {"id": "usgs.m5plus",  "context": [/* float[] history */], "freq": "D"},
    {"id": "coingecko.btc","context": [/* ... */],            "freq": "h"}
  ],
  "horizon": 24,                    // steps to predict
  "quantiles": [0.1, 0.5, 0.9],     // probabilistic output
  "num_samples": 100                // for sample-based models (Lag-Llama)
}
```

**Response (JSON):**
```jsonc
{
  "model": "timesfm-2.5",
  "predictions": [
    {"id": "usgs.m5plus",
     "mean":     [/* float[horizon] */],
     "quantiles": {"0.1": [...], "0.5": [...], "0.9": [...]}},
    {"id": "coingecko.btc", "mean": [...], "quantiles": {...}}
  ],
  "latency_ms": 142,
  "device": "NVIDIA A6000"
}
```

**Batching:** the client accumulates per-request series and submits them as **one batch array** (`series[]`). The server is expected to do **dynamic batching** (Triton's dynamic batcher / vLLM continuous batching). Client-side, PATTERN ORACLE also coalesces concurrent forecast calls within a short window (see §10.3) so one HTTP round-trip serves many series.

**Timeouts:** per-call `httpx.Timeout(connect=2s, read=T_read, write=2s, pool=2s)` where `T_read` is derived from the p95 budget of the calling pipeline (§10.4), capped at **8 s**. A hung endpoint MUST NOT exceed the pipeline budget — on timeout the client raises a typed `RemoteInferenceUnavailable`, caught by the ensemble assembler → T0 fallback.

**Retries:** at most **1 retry** on connection errors / 5xx / timeout, with ~150 ms jittered backoff, **only if** total elapsed stays inside the pipeline budget. No retry on 4xx (request bug). A **circuit breaker** trips after N consecutive failures (default 5) within a window and short-circuits to T0 for a cooldown (default 30 s) to avoid hammering a dead host — re-probed via `/v1/health`.

**Idempotency / safety:** requests carry no side effects; retries are safe. The client never blocks the event loop (pure async `httpx`).

---

## 10.2A REMOTE-INFERENCE-CLIENT — FULL SPEC

This section is the *complete* contract for the T2 client. It is normative: an implementation that diverges is a defect. The client is a single module (proposed `server/services/remote_inference.py`, mirrored read-only into `underworld/server/services/`) that depends **only** on `httpx` (already pinned on both backends) and stdlib. It MUST NOT import `torch`, `cupy`, or `tritonclient` — those live only on the inference host.

### 10.2A.1 Request schema (normative)

| Field | Type | Required | Default | Constraint / meaning |
|---|---|---|---|---|
| `model` | string | yes | — | one of `/v1/health.models[]`; rejected client-side if not advertised |
| `series` | array<Series> | yes | — | 1..`max_batch` independent series; client splits if larger |
| `series[].id` | string | yes | — | stable series key (`source.metric`), used to demux the response |
| `series[].context` | float[] | yes | — | history; length ≥ model `min_context`, ≤ `max_context` (truncate-left if longer) |
| `series[].freq` | string | yes | — | pandas-style offset (`D`,`h`,`min`,`W`) — informs positional encoding |
| `series[].mask` | bool[] | no | all-true | per-step validity; gaps → false (server imputes/ignores) |
| `horizon` | int | yes | — | 1..`max_horizon`; clipped to advertised cap |
| `quantiles` | float[] | no | `[0.1,0.5,0.9]` | strictly increasing in (0,1) |
| `num_samples` | int | no | `100` | sample-based models only (Lag-Llama); ignored by quantile-native models |
| `request_id` | string (uuid) | no | client-gen | echoed back; used for tracing/idempotency-dedup |
| `deadline_ms` | int | no | derived | server-side hint = remaining pipeline budget; lets server shed load early |

### 10.2A.2 Response schema (normative)

| Field | Type | Meaning |
|---|---|---|
| `model` | string | model that actually served (may differ if server aliased) |
| `predictions` | array<Pred> | one per input series, order **not** guaranteed → demux by `id` |
| `predictions[].id` | string | matches a request `series[].id` |
| `predictions[].mean` | float[horizon] | point forecast |
| `predictions[].quantiles` | map<str,float[horizon]> | keyed by quantile string (`"0.5"`) |
| `predictions[].status` | string | `ok` \| `degraded` \| `error`; per-series soft failure |
| `latency_ms` | int | server compute time (excl. network) |
| `device` | string | e.g. `NVIDIA A6000` — logged for capacity telemetry |
| `request_id` | string | echo |

**Per-series soft failure:** a single bad series returns `status:"error"` with empty arrays rather than failing the whole batch; the client drops that member and records a caveat for *that* series only. Batch-level failures (5xx, timeout) trip the fallback path in §10.2A.5.

### 10.2A.3 Client-side batching algorithm (normative)

```
coalesce(window_ms, max_batch, max_context):
  buf = []                                   # pending (request, future) pairs
  on submit(req):
      future = loop.create_future()
      buf.append((req, future))
      if len(flatten(buf).series) >= max_batch:   # batch full → flush now
          flush()
      elif timer not running:
          start_timer(window_ms)              # first item arms the window
      return future
  on timer_fire(): flush()
  flush():
      pending = drain(buf); cancel_timer()
      groups = group_by(pending, key=req.model) # one HTTP call per model
      for model, items in groups:
          for chunk in split(items.series, max_batch):   # respect server cap
              resp = await post_with_policy(model, chunk) # §10.2A.4/.5
              scatter(resp.predictions, items_by_id)      # resolve futures by id
```

Properties: (1) **window-bounded** — `window_ms` (default 10–25 ms, §10.3.2) is chosen so it never consumes more than ~1% of the pipeline p95 budget; (2) **batch-cap-aware** — never sends more than the advertised `max_batch`; oversize requests are split into sequential chunks under the same `Semaphore` slot budget; (3) **model-grouped** — series for different `model`s become separate HTTP calls; (4) **id-demuxed** — futures resolve by `id`, tolerant of server reordering; (5) **fair** — FIFO drain so no series starves.

### 10.2A.4 Timeout / retry budget (normative)

```
T_read   = min(8000ms, p95_pipeline_budget_ms - elapsed_ms - 200ms_demux_margin)
timeout  = httpx.Timeout(connect=2.0, read=T_read/1000, write=2.0, pool=2.0)
retries  = 1   on {ConnectError, ReadTimeout, 5xx}  iff (elapsed + est_next) < budget
backoff  = 150ms ± jitter(0..75ms)
no-retry on {4xx, 422 schema, circuit-open}
```

The single retry is the cap because a second failure inside a 1.5 s budget almost always means the host is unhealthy → cheaper to fall to T0 than to keep paying network RTT.

### 10.2A.5 Circuit-breaker state machine (normative)

States and transitions for the per-endpoint breaker (one instance per `PREDICT_GPU_URL`):

| State | Behavior | Transition trigger | → Next state |
|---|---|---|---|
| **CLOSED** | calls pass through; count consecutive failures | `failures ≥ fail_threshold` (default 5) within `window` (default 30 s) | OPEN |
| **CLOSED** | — | any success | reset failure count (stay CLOSED) |
| **OPEN** | short-circuit immediately → raise `RemoteInferenceUnavailable` → T0 | `cooldown` elapsed (default 30 s) | HALF_OPEN |
| **HALF_OPEN** | allow **1** trial call (or a `/v1/health` probe) | trial succeeds | CLOSED (reset) |
| **HALF_OPEN** | — | trial fails | OPEN (restart cooldown, optional exponential cap 5 min) |

```
            success
   ┌──────────────────────────┐
   ▼                          │
[CLOSED] ──fail≥N/window──▶ [OPEN] ──cooldown elapsed──▶ [HALF_OPEN]
   ▲                                                       │   │
   │                            trial ok                   │   │ trial fail
   └───────────────────────────────────────────────────────┘   │
   ▲                                                            │
   └──────────────────────── OPEN ◀──────────────────────────-─┘
```

The breaker is **per-process** (single-process asyncio, §10.1.2) — no shared state needed. It is asyncio-safe via a simple lock around the counter; transitions are O(1).

### 10.2A.6 Health-checking & warm-pool

- **Readiness probe:** `GET /v1/health` returns `{ready, models[], max_batch, max_context, max_horizon, max_queue_delay_ms, device, gpu_mem_free_mb}`. Polled at startup and on each HALF_OPEN transition. Advertised caps drive §10.2A.3 splitting and §10.2A.1 validation.
- **Liveness vs readiness:** `ready:false` (model still loading) is treated like OPEN — fall to T0 — but does **not** increment the failure counter (it is expected during cold start), so the breaker doesn't trip on a deploy.
- **Warm-pool:** the client maintains a single long-lived `httpx.AsyncClient` with HTTP/2 keep-alive (`limits=httpx.Limits(max_keepalive_connections=server_slots, keepalive_expiry=30s)`), so connections are reused — no per-call TLS/TCP handshake. The bounded `asyncio.Semaphore(server_slots)` (§10.3.4) caps in-flight calls to the advertised server concurrency.
- **Warm-up forecast:** on first reaching CLOSED/ready, the client may fire one tiny throwaway forecast (`horizon=1`, single dummy series) to force the server to JIT/compile CUDA kernels and page in weights, so the *first user-facing* call hits warm kernels. Failures here are swallowed (warm-up is best-effort).

---

## 10.3 DISPATCH & BATCHING

### 10.3.1 Today (T0/T1) — in-process offload
- Heavy synchronous NumPy/SciPy/CuPy kernels run via `await asyncio.to_thread(kernel, ...)` (or a bounded `ThreadPoolExecutor(max_workers = n_cores)`), so the asyncio loop stays responsive. CuPy GPU calls are queued and joined with `backend.synchronize()` before `asnumpy()`.
- **No external queue exists today.** Concurrency = asyncio tasks + a thread pool, single process.

### 10.3.2 Dynamic batching (T2)
- **Client micro-batch window:** a short coalescing window (default **10–25 ms**) collects all forecast sub-requests in flight and ships them as one `series[]` batch. Window length is bounded so it never eats the p95 budget.
- **Server dynamic batching:** delegated to Triton dynamic batcher / vLLM continuous batching, configured with a `max_batch_size` and `max_queue_delay_ms` reported by `/v1/health`. The client respects the advertised `max_batch` and splits oversized batches.

### 10.3.3 Job queue design (FUTURE — not built)
When workloads outgrow single-process (continuous re-forecasting loop §08, multi-tenant), introduce an explicit queue. Honest staging:
- **Stage A (near-term):** an in-process `asyncio.Queue` + a small pool of worker coroutines for the re-forecast loop; bounded size = backpressure.
- **Stage B (later):** an out-of-process broker (Redis/RQ or Celery) **only if** measured load requires it. **Ray is explicitly out of scope** until a real distributed need is proven — it is referenced in design language, not committed.

### 10.3.4 Backpressure
- Bounded queues (`asyncio.Queue(maxsize=K)`): producers `await put` and block when full → natural backpressure to ingestion.
- T2 client uses a bounded `asyncio.Semaphore` capping concurrent in-flight remote calls (default = advertised server slots) so a burst can't open thousands of sockets.
- Circuit breaker (§10.2.3) is backpressure against a failing remote tier.

### 10.3.5 Caching of model outputs
- **Forecast cache:** key = `hash(model, series_id, context_fingerprint, horizon, quantiles)`. TTL aligned to data cadence (USGS/FX/CoinGecko cache today is 60 s–5 min). A cache hit skips T2 entirely — the cheapest tier of all.
- **In-process LRU** (e.g. `functools.lru_cache` / a small TTL dict) in T0; promote to the History Lake / shared store (`05_*`) when persisted forecasts are needed for the self-improvement loop (§08).
- **Context fingerprint** = hash of the last-K context values + freq, so identical re-asks within a TTL are free and reproducible.

---

## 10.4 CAPACITY MODEL

### 10.4.1 Latency / throughput budgets (p95 targets)

| Pipeline | Tier | p95 latency budget | Notes |
|---|---|---|---|
| Classical forecast (GBM/Holt/ARIMA) | T0 CPU | **≤ 300 ms** | per single series, in-process NumPy |
| Pattern discovery (Matrix-Profile + HDBSCAN + change-point) | T0 CPU | **≤ 2 s** | per series of ≤ ~10⁴ points; offloaded to thread |
| Correlation / distance matrices (S series) | T0 | **≤ 1.5 s** | escalate to T1 above ~few-hundred series |
| Same matrices | T1 CuPy | **≤ 200 ms** | when GPU present |
| EnKF assimilation step | T0 / T1 | **≤ 500 ms / ≤ 100 ms** | covariance-dominated |
| Foundation TS inference (batch) | T2 remote | **≤ 1.5 s** incl. network | read-timeout cap 8 s; 1 retry inside budget |
| End-to-end NL→answer (no T2) | T0/T1 | **≤ 3 s** | orchestrator + discovery + ensemble |
| End-to-end NL→answer (with T2) | T2 | **≤ 5 s** | adds one remote round-trip |

These budgets set the per-call timeouts in §10.2.3 (T_read derived from the pipeline budget, capped 8 s).

### 10.4.2 Candidate foundation-model memory footprints

Sizes are the basis for choosing what colocates on a single-GPU VPS (§10.5). VRAM ≈ params × bytes/param (fp16 ≈ 2 B; int8/Bolt ≈ ~1 B) **plus** activation/KV overhead and runtime.

| Model | Params | Weights (fp16) | Practical VRAM incl. runtime | License | Role |
|---|---|---|---|---|---|
| **TimesFM 2.5** | ~200 M | ~0.4 GB | ~1–2 GB | Apache-2.0 | primary zero-shot TS forecaster |
| **Chronos-Bolt** (tiny→base→large) | 9 M / 21 M / 48 M / 205 M | ~0.02–0.4 GB | ~0.3–1.5 GB | Apache-2.0 | fast quantile forecaster; Bolt = distilled/fast |
| **Lag-Llama** | ~2.4 M (small) | ~0.01 GB | ~0.3–0.5 GB | Apache-2.0 | probabilistic sample-based baseline |
| **Temporal GNN (TGN/TGAT)** | task-specific (≈1–50 M) | ≪1 GB | ~0.5–2 GB | research code | learned KGIK edges (later) |

All candidates are **small** by LLM standards — the entire foundation-TS suite fits comfortably in a few GB, so a single 24–48 GB GPU can host **all of them at once** alongside dynamic batching (§10.5).

### 10.4.3 Applying `scale_bench.llm_capacity`-style projection

`scale_bench.llm_capacity(n_minions, deliberation_interval_ticks, gens_per_sec_per_gpu, gpus)` answers *"can a batched-inference fleet keep up with demand?"* by:

```
gens_needed_per_tick = n / interval
cluster_gps          = gens_per_sec_per_gpu * gpus
sustained_ticks_per_sec = cluster_gps / gens_needed_per_tick
feasible_realtime    = sustained_ticks_per_sec >= 1.0
```

**The identical algebra projects PATTERN ORACLE's T2 forecast capacity.** Re-map the variables:

| `llm_capacity` term | PATTERN ORACLE T2 analogue |
|---|---|
| `n_minions` | number of tracked series needing re-forecast |
| `deliberation_interval_ticks` | re-forecast cadence (ticks/seconds between updates) |
| `gens_per_sec_per_gpu` | **forecasts/sec/GPU** the foundation server sustains (batched) |
| `gpus` | inference GPUs available (1 on a single VPS) |
| `sustained_ticks_per_sec ≥ 1` | can the fleet re-forecast all series within one cadence? |

**Worked example (single A6000, conservative ~500 batched forecasts/sec/GPU for a 200 M model):**
`forecasts_needed_per_cycle = n_series / cadence`. For `n_series = 1,000`, `cadence = 60 s` ⇒ ~17 forecasts/s needed vs ~500/s available ⇒ **feasible with ~30× headroom**. The same call structure (one helper returning `{needed_per_cycle, cluster_per_sec, sustained_cycles_per_sec, feasible_realtime}`) belongs in the capacity endpoint, mirroring how `llm_capacity` is wired to `/worlds/scale-capacity`.

> Honest caveat: `gens_per_sec_per_gpu` is a **published-benchmark projection**, exactly as `scale_bench` notes for FLAME GPU 2 / vLLM. It MUST be replaced with a measured `benchmark()`-style number once a real inference server runs (see §10.7).

### 10.4.4 Per-pipeline FLOPs / memory / latency budgets (formulas)

The budgets in §10.4.1 are *targets*; this section gives the **formulas** that explain them and let an operator predict whether a given workload fits a given backend. Notation: `S` = number of series, `L` = context length (points), `H` = horizon, `d` = embedding/feature dim, `E` = EnKF ensemble members, `n` = state dimension, `P` = Monte-Carlo paths, `B` = batch size, `f` = sustained device FLOP/s (effective, not peak). All FLOP counts are leading-order (drop constants).

| Pipeline | FLOPs (leading order) | Peak working memory | Latency model |
|---|---|---|---|
| Classical forecast (GBM Monte-Carlo + Holt) | `≈ P·H` RNG+update per series; ARIMA fit `≈ L·p²` (p=order) | `O(P·H)` paths buffer (f32) | `t ≈ (P·H)/f_cpu + fit_const`; tune `P` to hold ≤300 ms |
| Cross-series correlation matrix | `≈ S²·L` (each pair dot over L) | `O(S²)` corr + `O(S·L)` input | `t ≈ S²·L / f`; T0→T1 crossover when `S²·L/f_cpu > budget` |
| Pairwise distance matrix (regime/motif) | `≈ S²·d` (or `N²·d` over N windows) | `O(S²)` distances | `t ≈ S²·d / f`; embarrassingly parallel → near-linear GPU speedup |
| EnKF assimilation step | covariance `≈ E·n²` + Kalman gain solve `≈ n³` (or `n·m²` obs-space) | `O(n² + E·n)` | `t ≈ (E·n² + n³)/f`; covariance-dominated for large `E` |
| Matrix-Profile (STUMP-style) | `≈ L²` naive sliding dot; `≈ L·log L` with FFT MASS | `O(L)` profile + `O(L)` index | `t ≈ L²/f` (naive) — the prime CuPy/STUMPY-cuda target |
| Batched Monte-Carlo (all series) | `≈ S·P·H` | `O(S·P·H)` f32 (chunk if > VRAM) | `t ≈ S·P·H / f` |
| Foundation TS transcript (transformer) | `≈ B·(L+H)·d² · n_layers` (attention+FFN) | weights + KV `O(B·(L+H)·d·n_layers)` | remote; `t ≈ compute/f_gpu + network_RTT` |

**Crossover rule (T0→T1):** escalate a kernel to CuPy when its modeled CPU time exceeds its pipeline budget, i.e. `FLOPs / f_cpu > budget_ms·1e-3`. With `f_cpu ≈ 50 GFLOP/s` (vectorised NumPy, single box) and `f_gpu ≈ 10–30 TFLOP/s` (A6000 f32, effective), the correlation/distance/EnKF kernels cross over around **a few hundred series** — exactly the §10.4.1 note. Memory crossover: if `peak_working_memory > VRAM_free` the kernel must **chunk** (tile the S×S or S·P·H array); the chunk size is `VRAM_free / bytes_per_element` rounded to a tile.

**f32 discipline (from `scale_bench.make_state`):** all device arrays are **float32** (`make_state` casts every array to `f32` "to halve VRAM and double GPU throughput"). This halves every memory figure above versus f64 and is the default for all T1 kernels and the `bytes_per_minion`-style accounting `benchmark()` returns.

**Effective-`f` calibration:** `f` in these formulas is **not** datasheet peak. The honest way to obtain it is the `scale_bench.benchmark()` pattern: time a warmed kernel with `backend.synchronize()` around the loop, then `f_effective = measured_FLOPs / seconds`. Until measured, use the conservative constants above and flag every derived budget as a projection (same caveat as `llm_capacity`).

### 10.4.5 Worked memory sizing — single-GPU colocation

Total VRAM demand = `Σ model_weights + Σ runtime/KV + peak T1 working set`. Using §10.4.2: TimesFM 2.5 (~1–2 GB) + Chronos-Bolt base (~1 GB) + Lag-Llama (~0.5 GB) + a temporal GNN (~1–2 GB) ≈ **4–6 GB of weights**. Dynamic-batching KV/activation at `max_batch=64`, `L+H≈1024`, `d≈1280` adds low single-digit GB. That leaves an A6000 (48 GB) or A100 (40/80 GB) with **tens of GB free** for T1 CuPy working sets — confirming §10.4.2/§10.5.2: the whole foundation-TS suite colocates on one GPU with room to spare.

---

## 10.5 DEPLOYMENT OPTIONS — GPU TIER

### 10.5.1 The hardware
A single **A6000 (48 GB) or A100 (40/80 GB)** VPS (vast.ai-class), matching the existing host. **Today that host is busy with UE5 pixel-streaming** — PATTERN ORACLE's GPU tier needs either (a) a second rented GPU instance, or (b) spare cycles/VRAM on the existing box once pixel-streaming load permits. This is a procurement/scheduling decision, not a code change.

### 10.5.2 Colocating an inference server
Because the whole foundation-TS suite is only a few GB (§10.4.2), one GPU hosts **all candidate models simultaneously**. Options (pick one):

| Server | Best for | Notes |
|---|---|---|
| **NVIDIA Triton** | multi-model, dynamic batching, mixed backends (ONNX/torch) | matches the request/response contract in §10.2.3; built-in dynamic batcher + `/v2/health` |
| **TorchServe** | torch-native foundation TS checkpoints | simple `.mar` packaging; manual batching config |
| **vLLM / SGLang** | if/when an LLM-style decoder TS model is used | continuous batching; overkill for encoder TS models |
| **Custom FastAPI + torch** | tiny footprint, full control | implement `/v1/forecast` directly; least infra |

Recommended: **Triton** (multi-model + dynamic batching out of the box) or a **custom FastAPI+torch** micro-server when minimalism matters. Either exposes the §10.2.3 contract.

### 10.5.3 How the two FastAPI backends reach it
- The JARVIS predictor (`server/`) and the underworld engine (`underworld/server/`) both already depend on `httpx` and reach the GPU tier **only** via the T2 client over `PREDICT_GPU_URL`. No torch/cupy is added to either FastAPI backend.
- Network: the inference server binds a private port on the GPU host; both backends connect over the VPN/private network (or an authenticated tunnel). The endpoint URL + auth token are config (`PREDICT_GPU_URL`, `PREDICT_GPU_TOKEN`), never hard-coded.
- **Colocation note:** if a backend *itself* runs on the GPU host, `PREDICT_GPU_URL=http://127.0.0.1:PORT` makes the call a loopback — same contract, near-zero network cost.
- `available_backends()` / `/v1/health` are used at startup to log which tiers are live, so operators see "T0 only" vs "T1 GPU present" vs "T2 endpoint reachable" explicitly.

### 10.5.4 Model-hosting deployment guide

This is the operator-facing recipe for standing up the T2 inference host. It is **out-of-band** from the two FastAPI backends — they only learn its URL.

**Server choice matrix (decision):**

| Need | Pick | Why |
|---|---|---|
| Multiple TS models, dynamic batching, mixed ONNX/torch, zero glue | **Triton** | model repository + dynamic batcher + `/v2/health` for free; closest to §10.2.3 contract |
| One torch checkpoint, simple ops, `.mar` packaging | **TorchServe** | lightweight, torch-native handlers; batching configured per-model |
| LLM-style decoder TS model, very high concurrency | **vLLM / SGLang** | continuous batching; **overkill** for encoder TS — only if a decoder model is adopted |
| Minimal footprint, full control of `/v1/forecast` shape | **Custom FastAPI + torch** | implement the §10.2.3 contract directly; fewest moving parts |

**Recommended default: Triton** (multi-model + dynamic batcher) for the full suite, or **Custom FastAPI+torch** for a single-model minimal start. Either exposes the §10.2.3 / §10.2A contract; an adapter route maps Triton's `/v2/...` to the `/v1/forecast`+`/v1/health` shape the client expects.

**Container layout (Triton example):**
```
inference-host/
├── Dockerfile                # FROM nvcr.io/nvidia/tritonserver:<ver>-py3
├── model_repository/
│   ├── timesfm_2_5/
│   │   ├── config.pbtxt      # platform, max_batch_size, dynamic_batching{max_queue_delay_microseconds}
│   │   └── 1/model.pt        # (or model.onnx)
│   ├── chronos_bolt_base/
│   │   ├── config.pbtxt
│   │   └── 1/model.onnx
│   └── lag_llama/
│       ├── config.pbtxt
│       └── 1/model.pt
├── adapter/                  # thin FastAPI mapping /v1/forecast → triton infer; /v1/health → /v2/health
│   ├── app.py
│   └── requirements.txt      # fastapi, httpx (NO torch)
└── compose.yaml              # triton + adapter; GPU reservation (--gpus all)
```
For the **custom FastAPI+torch** option the layout collapses to `app.py` (the `/v1/forecast` handler), `models/` (checkpoints), `requirements-gpu.txt` (torch + model libs), and a CUDA-base `Dockerfile`.

**Single-GPU sizing (A6000 48 GB / A100 40/80 GB):**

| Resource | Budget on A6000 (48 GB) | Source / formula |
|---|---|---|
| Model weights (full suite) | ~4–6 GB | §10.4.5 |
| Dynamic-batch KV/activations | low single-digit GB at `max_batch=64` | §10.4.5 |
| Headroom for fragmentation / spikes | keep ≥ 20% (~10 GB) free | ops rule of thumb |
| Net free for T1 CuPy working sets (if colocated) | tens of GB | §10.4.5 |

**Concurrency math (how to set `max_batch` / slots):** the server's sustainable concurrency is bounded by both compute and the latency budget. Given measured `forecasts/sec/GPU = R` (the `gens_per_sec_per_gpu` analogue, §10.4.3) and a per-batch service time `t_batch`, **Little's Law** gives in-flight = `R · t_batch`; set the advertised `max_batch` so `t_batch ≤` the foundation-inference budget (≤1.5 s, §10.4.1) and set client `server_slots` = advertised concurrency so the §10.3.4 Semaphore matches. Worked: at `R≈500/s` and `t_batch≈100 ms`, in-flight ≈ 50 series → `max_batch≈64` with one slot is ample; the §10.4.3 example (1,000 series / 60 s ⇒ ~17/s needed) leaves ~30× headroom.

**Deploy checklist:** (1) `--gpus all` + pin CUDA matching the `cupy-cuda12x` line (§10.7); (2) bind a **private** port, reach via VPN/tunnel, set `PREDICT_GPU_URL` + `PREDICT_GPU_TOKEN`; (3) verify `/v1/health` reports `ready:true` and advertised caps; (4) confirm the client logs the tier as "T2 endpoint reachable"; (5) run a warm-up forecast (§10.2A.6) before announcing readiness.

---

## 10.6 FALLBACK MATRIX

Columns = available compute. Rows = capability. Cell = *what runs / what degrades.*

| Capability | **No GPU (T0)** — current default | **CuPy GPU (T1)** | **Remote endpoint (T2)** |
|---|---|---|---|
| Classical forecast (GBM/Holt/ARIMA) | ✅ full, NumPy, ≤300 ms | ✅ same result, Monte-Carlo paths faster | ✅ unchanged (stays local) |
| Correlation / distance matrices | ✅ NumPy/SciPy, slower at scale | ✅ CuPy BLAS, ~10× faster | ✅ stays T1/T0 (not a remote job) |
| EnKF covariance / assimilation | ✅ NumPy | ✅ CuPy, faster covariance | ✅ stays local |
| Matrix-Profile / HDBSCAN / change-point | ✅ pure-NumPy/SciPy/sklearn (slower) | ⚙️ STUMPY-cuda path if added | ✅ stays local |
| **Foundation TS (TimesFM/Chronos/Lag-Llama)** | ⚠️ **unavailable → omit member**, widen intervals, add caveat | ⚠️ same (no in-proc torch) | ✅ full learned zero-shot member |
| **Temporal GNN edges (TGN/TGAT)** | ⚠️ unavailable → KGIK uses heuristic edges only | ⚠️ same | ✅ learned edges via remote |
| Error-weighted ensemble | ✅ runs on whatever members exist | ✅ | ✅ best (most members) |
| EnbPI conformal intervals | ✅ always (wraps any member) | ✅ | ✅ |
| Self-improvement / backtest loop | ✅ CPU | ✅ faster scoring | ✅ scores remote members too |

Legend: ✅ full · ⚙️ available if optional dep added · ⚠️ degrades gracefully (answer still produced, intervals widen, caveat recorded).

**Degradation principle:** dropping a tier removes *members from the ensemble and speed*, never the *answer*. Missing learned members are surfaced as honest, wider uncertainty — consistent with the master spec's "calibrated honesty, no invented capability."

### 10.6.1 Full fallback matrix — capability × backend → behavior + degradation

The §10.6 table summarises; this is the exhaustive grid. For every capability and every backend column `{no-GPU (T0), CuPy (T1), Remote (T2)}` it states the *exact runtime behavior* and the *degradation* when that backend is the best available. "Degradation" = what the user loses relative to the richest tier that capability can reach.

| Capability | no-GPU (T0) — behavior | CuPy (T1) — behavior | Remote (T2) — behavior | Degradation when only T0 |
|---|---|---|---|---|
| GBM/Holt/ARIMA forecast | full result, NumPy, ≤300 ms | identical result; MC paths faster (`S·P·H/f_gpu`) | unchanged (stays local — never a remote job) | none (T0 is full) |
| Cross-series correlation matrix | `np.corrcoef`/`einsum`, slows as `S²·L` | `cupy.corrcoef`, ~10× (BLAS) | stays T1/T0 | latency only at large `S`; result identical |
| Pairwise distance matrix | `scipy`/`einsum`, `S²·d` | CuPy einsum+reductions, near-linear speedup | stays T1/T0 | latency only at scale |
| EnKF covariance / assimilation | `np.cov`, `X@X.T`, ≤500 ms | CuPy `cov`/`@`, ≤100 ms | stays local | latency only; result identical within tol |
| Batched Monte-Carlo paths | vectorised NumPy, chunked | vectorised CuPy, thousands of paths fast | stays local | fewer paths to hold budget → slightly wider MC bands |
| Matrix-Profile (motifs/anomalies) | pure NumPy/`stumpy` (CPU), `L²` | STUMPY-cuda path **if** added (⚙️) | stays local | latency only; may cap `L` on slow CPU |
| HDBSCAN regime clustering | sklearn/`hdbscan` CPU | CPU (no native CuPy) — stays T0 | stays local | latency only at large N |
| Change-point (PELT/BOCPD) | pure NumPy/SciPy | mostly CPU; vector ops may use xp | stays local | latency only |
| **Foundation TS (TimesFM/Chronos/Lag-Llama)** | ⚠️ **omit member**, widen intervals, caveat | ⚠️ same (no in-proc torch by design) | ✅ full learned zero-shot member | **loses the learned member entirely** → wider intervals + caveat |
| **Temporal GNN edges (TGN/TGAT)** | ⚠️ KGIK uses heuristic edges only | ⚠️ same | ✅ learned edges via remote | loses learned edges → heuristic graph only |
| Error-weighted ensemble | runs over whatever members exist | same | best (most members present) | fewer members → weights over a smaller set |
| EnbPI conformal intervals | always (wraps any member set) | always | always | none — intervals just reflect available members |
| Self-improvement / backtest loop | CPU scoring | faster scoring (T1 kernels) | also scores remote members | slower scoring; can't backtest learned members |
| Capacity / tier reporting | reports "T0 only" | reports "T1 GPU present" | reports "T2 reachable" | accurate either way (no degradation, just honesty) |

**Transition semantics:** the *only* rows that change the **answer's content** (not just speed) are the two ⚠️ learned rows — losing T2 removes the foundation/GNN members, which the ensemble surfaces as wider, calibrated intervals plus a `caveats[]` note. Every other row degrades **latency only**; results match T0 within numerical tolerance (acceptance invariant §10.8.3).

---

## 10.6A CuPy ACCELERATION PLAN (T1)

Concrete plan for which exact operations move to the GPU through `gpu_backend.get_backend().xp`, in priority order of **speedup-per-effort**. Each item is *literally the T0 kernel with `xp` rebound* (§10.2.2) — no second algorithm. Speedups are projections to be replaced by `benchmark()`-measured numbers (§10.4.4 caveat).

| # | Operation | Where today (T0) | T1 form (CuPy) | Why it accelerates | Expected speedup (A6000 vs 1 CPU box, f32) | Effort |
|---|---|---|---|---|---|---|
| 1 | **Cross-series correlation matrix** | `np.corrcoef`/`einsum` over S series × L | `cupy.corrcoef`/`einsum`; `backend.asnumpy()` on return | `O(S²·L)` maps to GPU BLAS (GEMM); dense, regular | ~8–15× at S≈10³ | trivial (rebind `xp`) |
| 2 | **EnKF ensemble covariance** | `np.cov`, `X @ X.T` | `cupy.cov`, `@`; gain solve via `cupysolve` | dense covariance of large ensembles → GEMM; `E·n²+n³` | ~10–20× for large `E`,`n` | trivial |
| 3 | **Pairwise distance matrices** (regime/motif) | `scipy.spatial.distance` / `einsum` | CuPy `einsum` + reductions (squared-norm expansion) | `O(N²·d)` embarrassingly parallel, no data deps | ~10–25× at N≈10³ | low |
| 4 | **Batched Monte-Carlo forecast paths** | vectorised NumPy `S·P·H` | vectorised CuPy; `backend.rng(seed)` device RNG | thousands of paths × horizons; pure elementwise+reduce (mirrors `rich_tick`'s `einsum`/`tanh`/`clip`) | ~10–30× (throughput-bound) | low |
| 5 | **Matrix-Profile distances** (STUMP-style) | NumPy sliding dot / FFT MASS | CuPy FFT/`einsum`, or `stumpy.gpu_stump` | sliding-window dot products → batched GEMM/FFT | ~5–15× (kernel-dependent) | medium (optional dep) |

**Non-targets (stay CPU):** HDBSCAN and PELT/BOCPD have control-flow-heavy, pointer-chasing structure with no mature CuPy path — they stay T0; trying to GPU them is negative ROI. This is reflected as "stays T0" in §10.6.1.

**Validation gate (ties to §10.8.3):** every T1 kernel is diffed against its T0 output within numerical tolerance before it is allowed to serve — the GPU path may *never* diverge from the CPU reference. The `scale_bench` discipline (one warm-up tick, `backend.synchronize()` before timing, f32 arrays) is the template for both correctness diff and honest speedup measurement.

**Activation:** all five light up automatically the instant `get_backend("auto").is_gpu` is true (i.e. `cupy-cuda12x` installed on a CUDA box) — **zero application-code change**, per §10.7 Step 2.

---

## 10.6B COST MODEL (credits / $ per 1k predictions)

Cost is dominated by GPU-hour rental for T2; T0/T1 ride existing CPU/GPU the system already pays for. Model: `$ per 1k predictions = (gpu_$_per_hour / 3600) · (1000 / R) / utilization`, where `R` = sustained forecasts/sec/GPU (§10.4.3) and `utilization` = fraction of the rented hour actually serving. Tiers below assume vast.ai-class spot pricing (illustrative, 2026; **projection** until billed).

| Tier | Backend | GPU | $/GPU-hr (illustrative) | Sustained R (fcst/s) | $ / 1k predictions @ 100% util | @ 30% util | Notes |
|---|---|---|---|---|---|---|---|
| **T0** | CPU in-process | none | $0 marginal | n/a (≤300 ms/series CPU) | ~$0 marginal | ~$0 | rides existing FastAPI host; cost = already-paid CPU |
| **T1** | CuPy, colocated | shared A6000 | $0 marginal* | kernel-bound | ~$0 marginal | ~$0 | *if sharing the existing UE5 box; else = T2 rental |
| **T2 small** | Chronos-Bolt base | A6000 (48 GB) | ~$0.50 | ~500 | ~$0.0003 | ~$0.0009 | distilled/fast; cheapest learned member |
| **T2 primary** | TimesFM 2.5 (200 M) | A6000 (48 GB) | ~$0.50 | ~300 | ~$0.0005 | ~$0.0015 | primary zero-shot forecaster |
| **T2 large/A100** | full suite + GNN | A100 (80 GB) | ~$1.50 | ~600 (bigger batch) | ~$0.0007 | ~$0.0021 | higher R amortises higher hourly rate |

**Credits mapping:** if PATTERN ORACLE bills internal "credits," set `credits_per_1k = ceil(($_per_1k / $_per_credit))` with a per-tier floor of 1 credit so cache hits (which cost nothing, §10.3.5) and T0 answers stay free or near-free. **Cache leverage:** every cache hit (§10.3.5) is **$0** — the forecast cache is the single biggest cost lever; at a modest 50% hit rate the effective $/1k halves across all T2 rows.

**Honest caveat:** all $ figures and `R` are projections (same status as `gens_per_sec_per_gpu`). Replace with billed GPU-hours × `benchmark()`-measured `R` once a real server runs.

---

## 10.7 INSTALL PLAN — deps, sequencing, cost/benefit

Order = capability-per-effort. **Nothing here is required for T0; each step is an opt-in upgrade.** Keep heavy deps in a separate `requirements-gpu.txt` / extras group so the default install stays light and CI stays CPU-only.

| When | Dependency | Tier | Enables | Cost | Benefit |
|---|---|---|---|---|---|
| **Step 1 (now, CPU)** | `stumpy` | T0 | Matrix-Profile motifs/anomalies (vs hand-rolled NumPy) | small pure-Python/Numba dep | training-free motif/anomaly discovery, faster & tested |
| **Step 1** | `hdbscan` | T0 | density regime clustering | small C-ext build | robust regime/cluster discovery (vs k-means) |
| **Step 1** | `statsforecast` | T0 | fast classical models (AutoARIMA/ETS/Theta) | moderate (numba) | strong classical ensemble members, fast |
| **Step 2 (GPU box)** | `cupy-cuda12x` | T1 | activates `gpu_backend` GPU path | needs CUDA toolkit + GPU | ~10× on correlation/EnKF/distance kernels — **zero code change** |
| **Step 3 (inference host only)** | `torch` (+ model libs: `timesfm`, `chronos-forecasting`, `lag-llama`) | T2 | foundation TS + temporal GNN serving | large (GB), GPU-only — **install ONLY on the inference server, never in the FastAPI backends** | zero-shot learned forecasting, learned KGIK edges |
| **Step 3** | inference server (`tritonclient` or just `httpx`) | T2 | client side of §10.2.3 | tiny (`httpx` already present) | reach remote models with graceful fallback |
| **Deferred / only if proven** | `ray` (or Redis/Celery) | scale-out | distributed re-forecast workers | heavy operational cost | **do not install until single-process is measurably the bottleneck** |

**Placement rule (critical):** `torch`/`cupy` go on the **GPU/inference host**, *not* into `server/requirements.txt` or `underworld/server/requirements.txt`. The two FastAPI apps stay torch-free and reach GPU work only via `gpu_backend` (T1, optional) and the T2 HTTP client. This preserves the prime directive: `pip install` of the default requirements yields a fully-working T0 system on any laptop or CI runner.

### 10.7.1 Staged dependency-install plan — pinned versions, rationale, risk

Each stage is independently revertible. Versions are **pinned with a compatible-release floor** (`>=x,<x+1`) so security patches flow but no major-version surprise lands; they target the existing `numpy>=1.26 / scipy>=1.11 / sklearn>=1.3` base. CI stays CPU-only — Stages 2–3 install **only** on their respective hosts.

**Stage 0 — baseline (already pinned, do nothing):**

| Package | Pin | Where | Rationale |
|---|---|---|---|
| `numpy` | `>=1.26,<3` | both backends | T0 array floor; already present |
| `scipy` | `>=1.11,<2` | underworld only | distance/stats kernels |
| `scikit-learn` | `>=1.3,<2` | underworld only | clustering / metrics |
| `httpx` | (existing) | both backends | T2 client transport; **no new dep needed for the client** |

**Stage 1 — CPU discovery upgrades (`requirements-discovery.txt`, optional extra):**

| Package | Pin | Tier | Rationale | Risk |
|---|---|---|---|---|
| `stumpy` | `>=1.13,<2` | T0 | tested Matrix-Profile vs hand-rolled NumPy; Numba-accelerated | Numba/LLVM build can lag newest Python; **mitigate** by pinning `<2` and testing on the target Python first |
| `hdbscan` | `>=0.8.33,<0.9` | T0 | robust density regimes vs k-means | C-extension build; wheel availability varies — **mitigate** prefer wheels, fall back to `scikit-learn` `HDBSCAN` if build fails |
| `statsforecast` | `>=1.7,<2` | T0 | fast AutoARIMA/ETS/Theta members | Numba warm-up cost on first call; **mitigate** warm at startup |

**Stage 2 — local GPU acceleration (`requirements-gpu.txt`, GPU box only):**

| Package | Pin | Tier | Rationale | Risk |
|---|---|---|---|---|
| `cupy-cuda12x` | `>=13,<14` | T1 | activates `gpu_backend` GPU path; **zero app-code change** (§10.6A) | **CUDA-version coupling** — `cuda12x` wheel requires CUDA 12.x driver/toolkit on host; **mitigate** match the Triton CUDA base (§10.5.4) and verify `cupy.cuda.runtime.getDeviceCount()>0` before relying on T1; auto-falls-back to NumPy if absent (§10.1.1) |

**Stage 3 — remote inference host (inference server ONLY, never the FastAPI backends):**

| Package | Pin | Tier | Rationale | Risk |
|---|---|---|---|---|
| `torch` | `>=2.3,<3` (CUDA build) | T2 | runs foundation TS + temporal GNN weights | large (GB), GPU-coupled; **isolate** on inference host image only |
| `timesfm` | `>=1.2,<2` | T2 | primary zero-shot forecaster | weights download + license check; pin to Apache-2.0 release |
| `chronos-forecasting` | `>=1.4,<2` | T2 | fast quantile member | torch-version coupling — keep in lockstep with `torch` pin |
| `lag-llama` | (git tag/commit pin) | T2 | probabilistic sample baseline | research code, no PyPI release → **pin an exact commit**, vendor if unstable |
| `tritonserver` (container) | image tag `<ver>-py3` | T2 | hosts the suite; dynamic batching | container, not pip; pin the image tag to the CUDA line above |

**Stage 4 — scale-out (DEFERRED, do not install until proven):**

| Package | Pin | Rationale | Risk |
|---|---|---|---|
| `ray` *or* `redis`+`rq`/`celery` | — | distributed re-forecast workers | **heavy operational cost**; **explicitly out of scope** until single-process is *measured* as the bottleneck (§10.3.3). Premature install = ops burden with no payoff |

**Install ordering & verification gates:** Stage 1 → run T0 acceptance suite (§10.8.1) green. Stage 2 → `available_backends()` must report `cupy:true, gpus>0`, then T1 kernels must pass the T0-diff tolerance gate (§10.8.3). Stage 3 → `/v1/health` returns `ready:true` + caps, then the unreachable-host fallback test (§10.8.4) must still pass with the host *up*. Each stage gates the next; a failed gate reverts that stage with no impact on lower tiers.

**Cross-cutting risk register:**

| Risk | Affected stage | Mitigation |
|---|---|---|
| CUDA/driver mismatch | 2, 3 | pin CuPy `cuda12x` + Triton image to one CUDA major; verify at startup |
| Heavy dep leaks into FastAPI backends | 2, 3 | keep `torch`/`cupy` out of `server/` & `underworld/server/` requirements; CI lint = no `import torch/cupy` outside `try/except` (§10.8.5) |
| Numba/LLVM build failure on new Python | 1 | upper-bound pins, prefer wheels, sklearn fallback for HDBSCAN |
| Research-code drift (Lag-Llama) | 3 | exact-commit pin or vendoring |
| Silent over-spend on rented GPU | 3 | cost model (§10.6B) + cache (§10.3.5) + circuit breaker (§10.2A.5) cap waste |

---

## 10.8 ACCEPTANCE INVARIANTS (for `11_VALIDATION`)
1. With CuPy/torch/Ray uninstalled and `PREDICT_GPU_URL` unset, **all forecast + discovery pipelines pass** (T0 floor).
2. `get_backend("auto")` returns NumPy and never raises in CI.
3. T1 kernels produce results matching T0 within numerical tolerance.
4. With `PREDICT_GPU_URL` set to an unreachable host, every pipeline still returns an answer (T2 → T0 fallback) within the p95 budget, with a caveat recorded.
5. No `import torch` / `import cupy` outside `try/except` anywhere in the two FastAPI backends.
6. Capacity endpoint reports the live tier set via `available_backends()` + `/v1/health`.
