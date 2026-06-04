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

---

## 10.8 ACCEPTANCE INVARIANTS (for `11_VALIDATION`)
1. With CuPy/torch/Ray uninstalled and `PREDICT_GPU_URL` unset, **all forecast + discovery pipelines pass** (T0 floor).
2. `get_backend("auto")` returns NumPy and never raises in CI.
3. T1 kernels produce results matching T0 within numerical tolerance.
4. With `PREDICT_GPU_URL` set to an unreachable host, every pipeline still returns an answer (T2 → T0 fallback) within the p95 budget, with a caveat recorded.
5. No `import torch` / `import cupy` outside `try/except` anywhere in the two FastAPI backends.
6. Capacity endpoint reports the live tier set via `available_backends()` + `/v1/health`.
