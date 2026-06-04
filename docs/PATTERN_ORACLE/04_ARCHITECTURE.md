# PATTERN ORACLE — 04 · SYSTEM ARCHITECTURE
**Document class:** Master Engineering Spec · ISO-execution depth
**Scope of this file:** the complete component architecture of PATTERN ORACLE — every component's responsibilities, inputs/outputs, interfaces, repo location, and build-on-existing-vs-new disposition; a component diagram; representative sequence diagrams; the cross-backend integration strategy; deployment topology; data-flow; and a component-responsibility matrix.
**Companions:** `00_MASTER_INDEX.md` (spine + architecture-at-a-glance — this file expands §2 of that index), `05_DATA_MODEL_AND_SCHEMAS.md` (History Lake / KGIK schemas), `06_ALGORITHMS.md` (the math), `08_SELF_IMPROVEMENT_AND_MLOPS.md` (the loop), `09_ORCHESTRATION_NL_ROUTING.md` (router prompts), `10_COMPUTE_AND_GPU.md` (dispatch).

> **Grounding contract (carried from `00`/`02`):** Every component below is annotated **[EXISTS]**, **[EXTEND]**, or **[NEW]**. *EXISTS* = present and wired today. *EXTEND* = build on a named real file. *NEW* = does not exist; closes a named gap from `00 §1.2`. No component is described as built when it is not. The two backends (JARVIS `server/`, underworld `underworld/server/`) are, today, **two separate FastAPI applications** (`server/main.py:create_app` and `underworld/server/main.py:create_app`); this document does not pretend otherwise and §6 specifies exactly how they are bridged.

---

## 0. ARCHITECTURAL PRINCIPLES (binding constraints on every component)

1. **Never-raise on a normal question.** The public entrypoint `predict()` (`server/services/prediction.py:748`) already guarantees a structured `insufficient_data` result instead of a 500. Every new component inherits this: a failed motif search, a missing foundation-model GPU, or an unreachable underworld backend degrades the answer (wider intervals, fewer drivers, a caveat) — it does not fail the request.
2. **Graceful underworld dependency.** `prediction.py` imports underworld methods inside a `try/except` that sets `_UW_AVAILABLE` (`prediction.py:42-63`). Every cross-backend reach obeys the same rule: optional import or optional HTTP, never a hard dependency. The engine must run with `underworld/` absent.
3. **Calibrated honesty over precision.** Every forecast carries an interval and/or probability + assumptions + caveats. The conformal layer (EnbPI) is not optional polish — it is the contract.
4. **Grounded, not invented.** Each algorithm traces to `03_EVIDENCE_BASE.md` or to audited code in `02_CURRENT_STATE_AUDIT.md`.
5. **Self-improving by construction.** Every forecast is persisted with enough provenance (method, ensemble weights, inputs hash, horizon) that, when reality arrives, it can be scored and fed back. A forecast that cannot be scored later is a bug.

---

## 1. COMPONENT DIAGRAM (ASCII)

```
                          ┌──────────────────────────────────────────────────────────────────┐
                          │                          SURFACE  [§9]                             │
   browser ───────────►   │  PredictionOracle.jsx   TCIS.jsx        (src/pages/, React/Vite)   │
                          │        │                    ▲ timeline of forks/causal chains       │
                          └────────┼────────────────────┼──────────────────────────────────────┘
                                   │ POST /functions/predict           ▲ relational answer payload
                                   ▼                                   │
   ┌───────────────────────────────────────────────────────────────────────────────────────────┐
   │  JARVIS BACKEND  (server/, FastAPI app = server/main.py:create_app)                          │
   │                                                                                              │
   │   routes/predict.py ──► services/prediction.py : predict()  ◄── the spine                    │
   │                                       │                                                       │
   │   ┌──────────────────────────────────┴───────────────────────────────────────────────────┐ │
   │   │  ORCHESTRATOR [§1]   router → plan → specialist → verifier                              │ │
   │   │   classify() + _kimi_extract()  (Kimi K2 NL intent)   prediction.py:65 / :748          │ │
   │   └───┬───────────┬───────────────┬───────────────┬──────────────────┬────────────────────┘ │
   │       │           │               │               │                  │                       │
   │       ▼           ▼               ▼               ▼                  ▼                       │
   │  ┌─────────┐ ┌──────────┐ ┌───────────────┐ ┌──────────────┐ ┌───────────────────┐          │
   │  │INGESTION│ │ HISTORY  │ │   PATTERN-     │ │  RELATIONAL  │ │   FORECAST CORE   │          │
   │  │  LOOP   │►│  LAKE    │►│  DISCOVERY     │ │   LAYER      │ │  TimesFM/Chronos  │          │
   │  │ [§3]    │ │ [§2]NEW  │ │  [§4]NEW       │ │  [§5]EXTEND  │ │  +GBM/Holt/ARIMA  │          │
   │  │ USGS    │ │SQLite/   │ │  MatrixProfile │ │  KGIK graph  │ │  +EnKF →           │          │
   │  │CoinGecko│ │Parquet   │ │  HDBSCAN PELT  │ │  TGN/TGAT    │ │  ERROR-WTD ENSEMBLE│          │
   │  │ FX      │ │ +outcomes│ │  BOCPD lead-lag│ │  edge promote│ │  → EnbPI CONFORMAL │          │
   │  │EXTEND   │ │          │ │  Granger/CCM   │ │              │ │  [§6]EXTEND        │          │
   │  └─────────┘ └────┬─────┘ └───────┬────────┘ └──────┬───────┘ └─────────┬─────────┘          │
   │                   │               │                 │                   │                    │
   │                   │  ┌────────────┴─────────────────┴───────────────────┴──────────┐         │
   │                   └─►│  SELF-IMPROVEMENT LOOP [§7]NEW                                │         │
   │                      │  persist forecast → score (CRPS/RMSE/coverage) →             │         │
   │                      │  PSI/ECE drift → re-weight/retrain → update KGIK edges        │         │
   │                      │  reuses ai_models.drift_detector / calibration_error         │         │
   │                      └──────────────────────────────────────────────────────────────┘        │
   │                                                                                              │
   │   COMPUTE/DISPATCH [§8]:  gpu_backend.get_backend() (CuPy↔NumPy)                              │
   │                           + optional remote inference behind PREDICT_GPU_URL                  │
   └────────────────────────────────┬──────────────────────────────┬─────────────────────────────┘
                                     │ (A) optional direct import     │ (B) optional HTTP  PREDICT_GPU_URL
                                     │     underworld.server.services │     + underworld REST
                                     ▼                                ▼
   ┌───────────────────────────────────────────────────────────────────────────────────────────┐
   │  UNDERWORLD BACKEND (underworld/, SEPARATE FastAPI app = underworld/server/main.py)          │
   │   methods_registry.run(field)  ~464 methods / 58 domains   [EXISTS]                           │
   │   real_optimizer.bayes_optimize (GP/Matérn/EI/UCB)        [EXISTS, wired /optimize]          │
   │   knowledge_graph.py (KGIK typed graph) + temporal_nodes.py (TemporalNode/causal_chain)      │
   │   ai_models.py (PSI drift, ECE calibration, ensemble unc.)  gpu_backend.py  scale_bench.py   │
   │   db/models.py: PopulationSnapshot / Event / CausalBelief (history retained)                 │
   └───────────────────────────────────────────────────────────────────────────────────────────┘
```

Legend: `►` data/control flow · `[§n]` section in this doc · **NEW / EXTEND / EXISTS** = build disposition.

---

## 2. COMPONENT SPECIFICATIONS

Each component is specified as: **Responsibility · Inputs · Outputs · Interface · Lives in · Disposition · Build notes**.

### 2.1 ORCHESTRATOR — NL router → plan → specialist → verifier  **[EXTEND]**
- **Responsibility.** Turn a free-text question into a typed *plan*, dispatch the plan to the right specialist pipeline, and verify the assembled answer before return. Four stages:
  1. **Router** — extract intent: `{domain, target, horizon_hours, magnitude, lat, lng, ...}`.
  2. **Plan** — decide which components run (which loaders, whether pattern-discovery / relational layer are needed, which forecasters to ensemble).
  3. **Specialist** — execute the domain pipeline (crypto / seismic / trajectory / growth / generic / **relational** [NEW domain]).
  4. **Verifier** — assert the answer schema is complete (interval present, probability sane, assumptions+caveats non-empty, drivers populated) and downgrade to `insufficient_data` if not.
- **Inputs.** `question: str`, optional `params: dict` (may carry the series directly for offline/deterministic use).
- **Outputs.** The canonical prediction schema (see `prediction.py` `_insufficient()` at `:711` for the exact shape: `{question, domain, target, horizon, prediction{value,unit,point_estimate,interval{low,high,confidence},probability}, method{name,family,models_used,math}, drivers, data, assumptions, caveats, used_llm}`).
- **Interface.** Python: `predict(question, params)` (`prediction.py:748`); routing via `classify()` + `_kimi_extract()` (`prediction.py:65`). HTTP: `POST /functions/predict` (`server/routes/predict.py:30`).
- **Lives in.** `server/services/prediction.py`, `server/routes/predict.py`.
- **Build notes.** Today's `classify()` is a 3-tier router: Kimi K2 (`_kimi_extract`, `:65`) → explicit `params["domain"]` → regex/keyword fallback (`:651-705`). **EXTEND** to: (a) add a `relational` domain to the Kimi system prompt enum and to the keyword fallback (entity/relationship/"if X then Y"/"compared to" cues); (b) add an explicit **plan** object between classify and forecast that records which components will run (so the verifier and the self-improvement persistor know the provenance); (c) add the **verifier** stage as a post-assembly schema+sanity gate. Keep the never-raise + Kimi-optional contract intact (`_kimi_extract` already returns `None` on any failure so the regex fallback takes over).

### 2.2 HISTORY LAKE — persistent world-data + outcomes store  **[NEW]**
- **Responsibility.** Be the single durable store of (a) ingested world-data time-series and (b) every forecast + its later-realized outcome. Closes gap `00 §1.2.6` ("no persistent History Lake" — feeds are cached 60s–5min only) and `00 §1.2.3` ("predictions are stateless"). It is the substrate that makes the self-improvement loop possible.
- **Inputs.** Snapshots from the Ingestion Loop (`{series_id, t, value, source, as_of}`); forecast records from the Forecast Core / persistor (`{forecast_id, question_hash, domain, target, horizon, issued_at, target_time, point, interval, probability, method, ensemble_weights, inputs_hash}`); outcome records when reality lands (`{forecast_id, realized_value, observed_at}`).
- **Outputs.** Lookback windows for forecasters (`get_series(series_id, lookback)`), the cross-series panel for pattern-discovery, and matured forecast/outcome pairs for scoring.
- **Interface (new module `server/services/history_lake.py`).**
  `put_snapshot(series_id, points)` · `get_series(series_id, lookback) -> list[{t,v}]` · `panel(series_ids, window) -> dict[str, list]` · `persist_forecast(record) -> forecast_id` · `attach_outcome(forecast_id, realized_value, observed_at)` · `due_for_scoring(now) -> list[forecast_record]`.
- **Storage.** SQLite (default, zero-ops, matches the existing underworld `db/models.py` SQLAlchemy pattern) for forecasts/outcomes + small series; **Parquet** files (partitioned by `series_id`/date) for high-volume time-series. Schemas defined in `05_DATA_MODEL_AND_SCHEMAS.md`.
- **Lives in.** `server/services/history_lake.py` (new) + `server/db/` (new, mirroring `underworld/server/db/`). Parquet under a configurable `HISTORY_LAKE_DIR`.
- **Build notes.** **NEW**, but deliberately mirrors the proven underworld persistence pattern (`underworld/server/db/models.py`: `PopulationSnapshot` is literally a per-tick time-series, `Event`, `CausalBelief`). Do not invent an ORM; reuse SQLAlchemy as underworld does. The History Lake is the *only* component that holds state across requests — everything else stays functional/stateless.

### 2.3 INGESTION LOOP — scheduled feed adapters → snapshots  **[EXTEND]**
- **Responsibility.** On a schedule, pull world-data from public feeds and append normalized snapshots into the History Lake, so forecasters read *persisted history* instead of a 60s cache.
- **Inputs.** Feed endpoints (already configured): USGS (`config.USGS_FEED`), CoinGecko `coins/{id}/market_chart` (already used by `load_crypto_series`, `prediction.py:730`), FX (`config.FX_FEED`, base AUD via open.er-api.com). KGIK/sim snapshots from underworld.
- **Outputs.** Rows written via `history_lake.put_snapshot()`.
- **Interface.** Reuse the existing async fetchers in `live_intel.py`: `_earthquakes()` (`:34`), `_crypto()` (`:67`), `_fx()` (`:98`), orchestrated by `_markets()`/`get_live_intel()` (`:119/:124`). Add a scheduler entry `ingest_tick()` that calls each adapter and routes results to the Lake; plus a `market_chart` historical adapter (already exists as `load_crypto_series` in `prediction.py:707-746` — reuse it for backfill).
- **Lives in.** `server/services/live_intel.py` (adapters — **EXTEND**), new `server/services/ingestion.py` (scheduler/`ingest_tick`), wired into the FastAPI `lifespan`/startup (mirroring `underworld/server/main.py:40 lifespan`).
- **Build notes.** **EXTEND** `live_intel.py` — its adapters, caching pattern (`_cache` at `:30`, TTL `LIVE_INTEL_TTL_SECONDS=60`), and httpx usage are exactly what the loop needs; we add scheduling + persistence, not new fetchers. Honor existing keyless/rate-limit-friendly cadence (snapshot interval ≥ feed TTL).

### 2.4 PATTERN-DISCOVERY — motifs, regimes, change-points, lead-lag, causal screen  **[NEW]**
- **Responsibility.** Given series from the History Lake, discover *training-free* structure used as forecast features and as candidate edges for the relational layer:
  - **Matrix Profile (STUMPY)** — motifs / discords / anomalies.
  - **HDBSCAN** — regime clustering over windowed features.
  - **PELT / BOCPD** — offline & online change-point detection.
  - **Cross-series lead-lag** — windowed cross-correlation / time-lagged alignment.
  - **Granger / CCM causal screen** — *screen* (not assert) candidate causal links; closes gap `00 §1.2.5` ("causal asserted, not discovered").
- **Inputs.** Single series (`get_series`) and the cross-series panel (`history_lake.panel(...)`).
- **Outputs.** `{motifs, discords, regimes, change_points, leadlag[{src,dst,lag,corr}], causal_candidates[{src,dst,stat,p}]}` — consumed by Forecast Core (as features/regime conditioning) and by the Relational Layer (as candidate edges to promote).
- **Interface (new module `server/services/patterns.py`).** `discover(series) -> dict` · `discover_panel(panel) -> dict` (lead-lag + causal screen).
- **Lives in.** `server/services/patterns.py` (new).
- **Build notes.** **NEW** capability (gap `00 §1.2.1/§1.2.5`), but leans on existing analytics where possible: underworld already has clustering (`methods_cs_ai.kmeans_clustering`, `disease_models.symptom_clustering`), PageRank (`graph_extras`), and `ai_models` drift math. STUMPY/HDBSCAN/ruptures are added deps (see `10_COMPUTE_AND_GPU.md` for install + GPU notes; STUMPY has a GPU path). Granger/CCM are *screens* feeding human/verifier-gated promotion — never auto-asserted as truth (honesty contract).

### 2.5 RELATIONAL LAYER — KGIK temporal graph + learned edges  **[EXTEND]**
- **Responsibility.** Hold entities and their time-stamped relationships; answer relational/cross-entity questions ("if XRP moves, what moves with it?", "what drove the change in X?"); and **promote confirmed patterns** (from Pattern-Discovery, after they survive scoring) into durable KGIK edges with confidence/lag metadata. TGN/TGAT-style *learned* temporal edges and xERTE-style link prediction are the deep target.
- **Inputs.** Entities + relations from `src/domain/ontology.js` (the live business graph: people/orgs/assets, `linked:[...]`) and from underworld `knowledge_graph.py`; candidate edges from Pattern-Discovery; outcome confirmations from the self-improvement loop.
- **Outputs.** Relational query results (neighborhoods, causal chains, counterfactual forks, lead-lag-typed edges) feeding the Orchestrator's `relational` specialist and the TCIS timeline.
- **Interface.** Reuse underworld graph primitives: `KnowledgeGraph` (`add_node/add_edge/edges_from/novelty/prerequisites`, `knowledge_graph.py:104-225`, `Node/Edge/NodeKind/EdgeKind` enums at `:55-104`); temporal primitives `TemporalNode.active_at` (`temporal_nodes.py:13`), `causal_chain` (`:67`), `counterfactual_fork` (`:82`), `competing_theory_clusters` (`:148`). New thin module `server/services/relational.py` adapts these for the prediction context and bridges to the JS ontology.
- **Lives in.** Graph engine: `underworld/server/services/knowledge_graph.py` + `temporal_nodes.py` (**EXTEND**, currently real-but-dormant per `00 §1.1`). Surface ontology: `src/domain/ontology.js` (**EXISTS**, business entities). Adapter: `server/services/relational.py` (**NEW**, thin).
- **Build notes.** The graph engine and temporal nodes already exist and are typed; the work is (a) wiring them into the prediction path via the bridge in §6, (b) a `promote_edge(candidate)` that writes a Pattern-Discovery candidate into KGIK with a `confidence` from the confidence ladder (`ConfidenceClass`, `knowledge_graph.py:28`), and (c) TGN/TGAT learned edges (deep, deferred — graded as the advanced tier in `06_ALGORITHMS.md`). Edge *strength* is later updated by the self-improvement loop (§2.7).

### 2.6 FORECAST CORE — foundation TS + classical + EnKF → ensemble → conformal  **[EXTEND]**
- **Responsibility.** Produce the numeric forecast with calibrated uncertainty:
  1. **Foundation TS model** (TimesFM 2.5 / Chronos-Bolt, zero-shot) via the GPU tier.
  2. **Classical** forecasters: GBM Monte-Carlo + Holt (already in `prediction.py`), ARIMA (new), Gutenberg-Richter/Omori/great-circle/exp-logistic (already present, `prediction.py` docstring `:14-26`).
  3. **EnKF assimilation** to nudge model state toward latest observations.
  4. **Error-Weighted Ensemble** (expired patent WO2014075108A2) combining members by recent skill.
  5. **EnbPI conformal calibration** → final prediction interval / probability.
- **Inputs.** Series from History Lake; regime/change-point/motif features from Pattern-Discovery; route/plan from Orchestrator; recent member errors from the self-improvement loop (for the weights).
- **Outputs.** `prediction{value,unit,point_estimate,interval{low,high,confidence},probability}` + `method{name,family,models_used,math}` + `drivers` — exactly the existing schema.
- **Interface.** Extend `prediction.py` forecasters; new helpers `foundation_forecast(series, horizon)`, `arima_forecast(...)`, `enkf_assimilate(...)`, `error_weighted_ensemble(members, weights)`, `enbpi_intervals(members, alpha)`.
- **Lives in.** `server/services/prediction.py` (**EXTEND** — it is the flagship 1147-line predictor) + foundation-model call via Compute/Dispatch (§2.8).
- **Build notes.** **EXTEND**: the closed-form forecasters (GBM/Holt/GR/Omori/great-circle/exp-logistic) are real and stay as ensemble members; we add the *learned* member (foundation TS, the big gap `00 §1.2.1`), EnKF, the ensemble weighting, and EnbPI on top. Foundation inference runs on the GPU tier or remote (`PREDICT_GPU_URL`); if neither is available, the ensemble falls back to classical members with *wider* conformal intervals + a caveat (never-raise contract).

### 2.7 SELF-IMPROVEMENT LOOP — persist → score → drift → re-weight/retrain → update KGIK  **[NEW]**
- **Responsibility.** Make the engine actually improve. Nightly (and on demand): persist every issued forecast; when target times pass, score forecasts against realized outcomes (CRPS / RMSE / interval coverage vs climatology); run drift detection; re-weight ensemble members and trigger retrains; update KGIK edge strengths for relationships that *predicted correctly*. Closes gap `00 §1.2.3`.
- **Inputs.** From History Lake: matured `(forecast, outcome)` pairs (`due_for_scoring`), reference vs current feature distributions.
- **Outputs.** Skill scores per method/domain (persisted), updated **ensemble weights** (read by Forecast Core), retrain triggers, and **KGIK edge-strength updates** (read by Relational Layer).
- **Interface (new module `server/services/improvement.py`).** `score_due(now)` · `update_weights(domain)` · `check_drift(series_id)` · `update_kgik_edges(confirmed)` · nightly `run_cycle()`.
- **Lives in.** `server/services/improvement.py` (new); skill scores + weights stored in History Lake; scheduled like Ingestion (§2.3, FastAPI lifespan).
- **Build notes.** **NEW** loop, but **reuses** ai_models building blocks: `drift_detector` (PSI, `ai_models.py:74`, PSI>0.2 ⇒ drift) and `calibration_error` (ECE, `:85`, ECE<0.1 ⇒ well-calibrated). CRPS/RMSE/coverage are added scoring functions (specified in `08_SELF_IMPROVEMENT_AND_MLOPS.md`). The loop is the consumer that justifies the History Lake's forecast/outcome tables.

### 2.8 COMPUTE / DISPATCH — gpu_backend + optional remote inference  **[EXTEND]**
- **Responsibility.** Provide the array backend (CuPy on GPU, NumPy on CPU — same code path) for Monte-Carlo / EnKF / Matrix-Profile, and dispatch heavy *foundation-model* inference either locally (GPU present) or to a remote inference endpoint.
- **Inputs.** Array workloads from Forecast Core / Pattern-Discovery; foundation-inference requests `{series, horizon}`.
- **Outputs.** Arrays (host or device) and foundation-model forecasts.
- **Interface.** `gpu_backend.get_backend(prefer="auto") -> Backend{xp,name,device,is_gpu}` with `.asnumpy()/.synchronize()/.rng()` (`underworld/server/services/gpu_backend.py:23-62`). Remote path: HTTP POST to `PREDICT_GPU_URL` (new env var, currently absent from `server/config.py` — see §6) when set; else local GPU; else CPU fallback.
- **Lives in.** `underworld/server/services/gpu_backend.py` (**EXISTS**, CuPy↔NumPy drop-in) reached via the §6 bridge; remote dispatch helper new in `server/services/compute.py`.
- **Build notes.** **EXTEND.** `gpu_backend` already auto-selects CuPy only when a CUDA device is present (`:46-62`), so the identical code runs CPU-only in dev. CuPy/torch are referenced but **not installed** today (gap `00 §1.2.7`); `PREDICT_GPU_URL` is the honest escape hatch — point it at a GPU box that hosts the foundation model. Full detail in `10_COMPUTE_AND_GPU.md`.

### 2.9 SURFACE — endpoint + UI + TCIS  **[EXISTS / EXTEND]**
- **Responsibility.** User-facing entry and rendering.
- **Inputs.** User question (UI). **Outputs.** Rendered prediction (value, interval, probability, drivers, assumptions, caveats) and, for relational answers, a TCIS timeline of causal chains / counterfactual forks.
- **Interface.** `POST /functions/predict` (`server/routes/predict.py:30`, `PredictRequest{question, params?}`). UI: `src/pages/PredictionOracle.jsx`; relational/temporal viz: `src/pages/TCIS.jsx`.
- **Lives in.** `server/routes/predict.py`, `src/pages/PredictionOracle.jsx`, `src/pages/TCIS.jsx`.
- **Build notes.** Endpoint + Oracle page **EXIST**. **EXTEND** the UI to render the conformal interval band, ensemble member breakdown, and (for relational answers) feed TCIS with the KGIK causal-chain/fork payloads.

---

## 3. SEQUENCE DIAGRAMS

### 3.1 Flow A — a price question ("Where will XRP be in 48h?")

```
User    PredictionOracle.jsx   /functions/predict   prediction.predict()      live_intel/load_crypto_series   HistoryLake   PatternDiscovery   ForecastCore           Compute(gpu_backend/PREDICT_GPU_URL)
 │            │                       │                     │                          │                          │              │                 │                          │
 │ ask "XRP   │                       │                     │                          │                          │              │                 │                          │
 │ in 48h?"   │                       │                     │                          │                          │              │                 │                          │
 ├───────────►│  POST {question}      │                     │                          │                          │              │                 │                          │
 │            ├──────────────────────►│  predict(q)         │                          │                          │              │                 │                          │
 │            │                       ├────────────────────►│ classify(): Kimi         │                          │              │                 │                          │
 │            │                       │                     │ _kimi_extract→domain=crypto, target=ripple, hz=48    │              │                 │                          │
 │            │                       │                     │ (Kimi down? → regex fallback _find_ticker)           │              │                 │                          │
 │            │                       │                     ├─ get_series("crypto:ripple", 90d) ──────────────────►│              │                 │                          │
 │            │                       │                     │   (Lake miss → load_crypto_series market_chart) ─────┤ put_snapshot │                 │                          │
 │            │                       │                     ├─ discover(series) ──────────────────────────────────┼─────────────►│ regimes,        │                          │
 │            │                       │                     │   motifs/regime/change-points                        │              │ change-pts ◄────┤                          │
 │            │                       │                     ├─ ForecastCore.run(series, hz=48, regime) ────────────┼──────────────┼────────────────►│                          │
 │            │                       │                     │     members: GBM-MC + Holt + ARIMA + foundationTS    │              │                 ├─ foundation_forecast ───►│ local GPU? else
 │            │                       │                     │                                                       │              │                 │   (CuPy MC paths)        │ PREDICT_GPU_URL? else CPU+caveat
 │            │                       │                     │     EnKF assimilate latest obs                       │              │                 │◄─ member forecasts ──────┤
 │            │                       │                     │     error-weighted ensemble (weights from §7)        │              │                 │                          │
 │            │                       │                     │     EnbPI conformal → interval{low,high,conf}        │              │                 │                          │
 │            │                       │                     ├─ persist_forecast(record) ───────────────────────────────────────►│ (HistoryLake)   │                          │
 │            │                       │                     │ VERIFIER: schema+sanity ok → assemble               │              │                 │                          │
 │            │                       │◄────────────────────┤ {value, interval, probability, drivers, caveats}    │              │                 │                          │
 │            │◄──────────────────────┤  JSON               │                          │                          │              │                 │                          │
 │◄ render band + drivers + caveats ──┤                       │                     │                          │                          │              │                 │                          │
```

### 3.2 Flow B — a relational / cross-entity question ("If XRP drops 10%, what in my world moves with it?")

```
User   PredictionOracle.jsx   /functions/predict   predict()         RelationalLayer (server/relational.py)     KGIK bridge (§6)               PatternDiscovery       TCIS.jsx
 │           │                      │                  │                       │                                       │ direct import OR HTTP        │                      │
 ├──────────►│  POST {question}     │                  │                       │                                       │                              │                      │
 │           ├─────────────────────►│ predict(q)       │                       │                                       │                              │                      │
 │           │                      ├─────────────────►│ classify(): domain=relational (new), anchor=ripple/crypto    │                              │                      │
 │           │                      │                  ├─ relational.neighbors("crypto") ─────────────────────────────►│ KnowledgeGraph.edges_from   │                      │
 │           │                      │                  │   + ontology.js linked:[...] (sam,target,...)                 │ + TemporalNode.active_at     │                      │
 │           │                      │                  │◄─ entities + typed edges ────────────────────────────────────┤                              │                      │
 │           │                      │                  ├─ discover_panel(panel[crypto,fx,...]) ──────────────────────────────────────────────────────►│ lead-lag + Granger/CCM screen
 │           │                      │                  │◄─ leadlag[{src,dst,lag,corr}] + causal_candidates ───────────────────────────────────────────┤
 │           │                      │                  ├─ counterfactual_fork(baseline, {XRP:-10%}) ─────────────────►│ temporal_nodes.counterfactual_fork
 │           │                      │                  │◄─ fork {affected entities, magnitudes, lag} ─────────────────┤                              │                      │
 │           │                      │                  ├─ per-affected: ForecastCore.run(...) → calibrated deltas      │                              │                      │
 │           │                      │                  ├─ persist_forecast(each) → HistoryLake (scored later in §7)    │                              │                      │
 │           │                      │                  │ VERIFIER: every edge carries confidence + caveat             │                              │                      │
 │           │                      │◄─────────────────┤ {affected:[{entity,delta,interval,lag,confidence}], chain}   │                              │                      │
 │           │◄─────────────────────┤ JSON                                                                            │                              │                      │
 │           ├─ hand relational payload to TCIS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────►│ render causal chain + fork timeline
 │◄ timeline + ranked affected entities + intervals ──┤                                                                                                                     │
```

### 3.3 Flow C — the nightly self-improvement cycle (scheduled, no user)

```
Scheduler (FastAPI lifespan)   improvement.run_cycle()   HistoryLake          Scorer (CRPS/RMSE/cov)   ai_models (PSI/ECE)   ForecastCore weights   RelationalLayer/KGIK
       │                              │                       │                       │                       │                      │                       │
   nightly tick ──────────────────►  │                       │                       │                       │                      │                       │
       │                              ├─ score_due(now) ─────►│ due_for_scoring()     │                       │                      │                       │
       │                              │◄─ matured (forecast,outcome) pairs ───────────┤                       │                      │                       │
       │                              ├─ per pair: CRPS / RMSE / interval coverage vs climatology ───────────►│                      │                       │
       │                              │◄─ skill scores per method/domain ─────────────────────────────────────┤                      │                       │
       │                              ├─ persist skill scores ───────────────────────►│                       │                      │                       │
       │                              ├─ check_drift(series): drift_detector PSI, calibration_error ECE ──────►│ PSI>0.2? ECE>0.1?    │                       │
       │                              │◄─ drift / miscalibration flags ──────────────────────────────────────┤                      │                       │
       │                              ├─ update_weights(domain): error-weighted member weights ──────────────────────────────────────►│ (read next forecast)  │
       │                              ├─ retrain trigger if drift → schedule foundation/ARIMA refit (Compute tier)                     │                       │
       │                              ├─ update_kgik_edges(confirmed): edges that predicted correctly → ↑strength; wrong → ↓ ─────────────────────────────────►│ KnowledgeGraph edges + ConfidenceClass
       │                              ├─ promote surviving PatternDiscovery candidates → KGIK (verifier-gated) ───────────────────────────────────────────────►│
       │◄─ cycle report (scores, drift, weight deltas, edge updates) persisted to HistoryLake ────────────────┤                      │                       │
```

---

## 4. CROSS-BACKEND INTEGRATION STRATEGY

**The honest baseline.** There are **two separate FastAPI applications** today:
- JARVIS: `server/main.py:create_app()` (`Jarvis Backend`, mounts `auth/functions/predict/entities/streams` routers).
- Underworld: `underworld/server/main.py:create_app()` (mounts `world/minion/patent/invention/guild/safety/knowledge/physics/project/substrate/science` routers).

They do **not** share a process or a database. PATTERN ORACLE lives in the JARVIS app but needs the underworld assets: the **~464-method registry** (`methods_registry.run(field, seed)`, `methods_registry.py:561`), the **Bayesian optimizer** (`real_optimizer.bayes_optimize`, wired to `/optimize`), the **KGIK graph + temporal nodes**, **ai_models** (PSI/ECE), and **gpu_backend**. This is gap `00 §1.2.4` ("the two backends are disjoint"). Two bridge modes, both optional, mirroring the existing `_UW_AVAILABLE` guard (`prediction.py:42-63`):

### Mode A — Direct in-process import (preferred when co-located)
`prediction.py` already does this for seismology/robotics/aerospace methods inside a `try/except` that degrades to native math on failure. **Extend the same pattern** to import `methods_registry`, `knowledge_graph`, `temporal_nodes`, `ai_models`, `real_optimizer`, `gpu_backend` *only when the `underworld` package is importable on the JARVIS `PYTHONPATH`*.
- **Pros.** Zero network latency; no serialization; one deploy; reuses the existing, tested guard.
- **Cons.** Requires the underworld package to be on the path and import-clean; couples deploys; cannot use a different (GPU) host for those services.
- **When.** Dev, single-box deploy, and the registry/KGIK/ai_models reaches (pure-Python, fast).
- **Contract.** Wrapped by a single helper (`server/services/uw_bridge.py`, new) exposing `registry_run(field)`, `kg()`, `ai_models()`, etc., each returning `None`/raising-never when underworld is absent — so the Orchestrator's plan simply drops the underworld-backed step and adds a caveat.

### Mode B — HTTP to the underworld REST app and/or a GPU inference service
When underworld runs as its **own** service (different host, GPU box, independent scaling), the bridge calls it over HTTP using the same `httpx` pattern already in `live_intel.py`/`prediction.py`.
- **Endpoints.** Existing underworld routes (e.g. knowledge-graph at `/worlds/{id}/knowledge-graph`, optimizer at `/optimize`, scale at `/worlds/scale-capacity`). For the registry, expose a thin `/methods/run` route in the underworld app (small **NEW** route) so it is reachable without import.
- **Foundation-model GPU inference.** Dispatched to **`PREDICT_GPU_URL`** — a **new** env var (not yet in `server/config.py`; add alongside `KIMI_*`/`USGS_FEED`/`FX_FEED`). When unset, Compute uses local CuPy if a GPU exists, else CPU with wider intervals + caveat.
- **Pros.** Independent scale/deploy; GPU isolation; backend can crash without taking JARVIS down.
- **Cons.** Network latency + serialization; needs the small `/methods/run` route; two services to operate.
- **When.** Production with a GPU tier, or when underworld must scale independently.

**Selection rule (in `uw_bridge.py`).** Prefer Mode A if `import underworld...` succeeds; else Mode B if the relevant URL env var is set; else degrade (drop the step, widen intervals, add a caveat). This keeps the never-raise + underworld-optional contract intact end-to-end. **Honest note:** until `uw_bridge.py` and the `/methods/run` route exist, the JARVIS predictor reaches underworld *only* via the three already-imported method modules (`prediction.py:44-46`); full registry/optimizer/KGIK access is the EXTEND/NEW work this spec authorizes.

---

## 5. DEPLOYMENT TOPOLOGY

```
                         ┌───────────────────────────────────────────────┐
   Browser ──HTTPS──►     │  CDN / Static host (Vite build)               │   src/ → dist/ (Netlify/Vercel; see netlify.toml/vercel.json)
                         │  PredictionOracle.jsx, TCIS.jsx                │
                         └───────────────────────┬───────────────────────┘
                                                 │ XHR /functions/predict
                                                 ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │  JARVIS API service  (uvicorn server.main:app)                                │
   │   routes: predict / functions / entities / streams / auth                    │
   │   PATTERN ORACLE: prediction.py, history_lake.py, ingestion.py,              │
   │                   patterns.py, relational.py, improvement.py, compute.py     │
   │   state: History Lake → SQLite (server/db/) + Parquet (HISTORY_LAKE_DIR)     │
   │   scheduler: FastAPI lifespan → ingest_tick (§3 cadence) + nightly run_cycle │
   └───────┬───────────────────────────────┬───────────────────────────┬─────────┘
           │ Mode A (in-proc import,        │ Mode B (HTTP, optional)    │ outbound HTTPS
           │ if underworld on PYTHONPATH)   │                            │ (keyless feeds + Kimi)
           ▼                                ▼                            ▼
   ┌─────────────────────────┐   ┌────────────────────────────┐   ┌──────────────────────────────┐
   │ underworld package      │   │ Underworld API service     │   │ EXTERNAL FEEDS / LLM          │
   │ (same container)        │   │ (uvicorn underworld.       │   │  USGS_FEED  CoinGecko         │
   │ methods_registry/KGIK/  │   │  server.main:app)          │   │  FX_FEED(open.er-api)         │
   │ ai_models/gpu_backend   │   │ /worlds /optimize /methods  │   │  Kimi K2 (KIMI_BASE_URL)      │
   └─────────────────────────┘   └─────────────┬──────────────┘   └──────────────────────────────┘
                                                │ optional
                                                ▼
                                  ┌──────────────────────────────┐
                                  │ GPU INFERENCE service        │  ◄── PREDICT_GPU_URL (new env)
                                  │ foundation TS (TimesFM/      │      hosts CuPy + TimesFM/Chronos
                                  │ Chronos) + heavy CuPy MC     │
                                  └──────────────────────────────┘
```

- **Dev (single box):** JARVIS API only; underworld via Mode A in-process; no GPU → CuPy auto-falls-back to NumPy (`gpu_backend.py:46`), foundation member off, classical ensemble + wider conformal intervals.
- **Prod (separated):** JARVIS API + Underworld API + GPU inference service; bridge via Mode B; History Lake on persistent volume.
- **Config knobs (`server/config.py` + `.env.example`):** `KIMI_*` [exists], `USGS_FEED`/`FX_FEED` [exists], `LIVE_INTEL_TTL_SECONDS` [exists], **`PREDICT_GPU_URL`** [new], **`HISTORY_LAKE_DIR`** [new], **`UNDERWORLD_URL`** [new, Mode B].

---

## 6. DATA-FLOW (end to end)

```
EXTERNAL FEEDS ──(ingest_tick, scheduled)──► INGESTION LOOP ──put_snapshot──► HISTORY LAKE (series, durable)
   USGS / CoinGecko market_chart / FX                                            │
                                                                                  │ get_series / panel
                                              ┌───────────────────────────────────┴───────────────────┐
USER QUESTION ─► ORCHESTRATOR(classify/plan) ─┤                                                         │
                                              ▼                                                         ▼
                                    PATTERN-DISCOVERY ──candidates──► RELATIONAL LAYER (KGIK)   FORECAST CORE
                                    (motifs/regimes/CP/lead-lag/causal)        │ promote (verifier-gated)   │ members:
                                              │ features/regime ───────────────┼────────────────────────────► foundation+GBM+Holt+ARIMA
                                              │                                 │                            │ → EnKF → error-wtd ensemble
                                              │                                 │                            │ → EnbPI conformal
                                              ▼                                 ▼                            ▼
                                          VERIFIER ◄────── relational edges + intervals ◄──────────── prediction{value,interval,prob}
                                              │
                                              ├──► persist_forecast(record) ──► HISTORY LAKE (forecast table)
                                              ▼
                                          ANSWER → SURFACE (Oracle UI / TCIS)

                  ... later, when reality arrives ...
EXTERNAL FEEDS ──► INGESTION ──► HISTORY LAKE (realized) ──attach_outcome──► SELF-IMPROVEMENT LOOP
   run_cycle: score (CRPS/RMSE/coverage) → PSI/ECE drift → update ensemble weights (→ ForecastCore)
            → retrain triggers (→ Compute) → update KGIK edge strengths (→ Relational Layer)
```

Key invariant: the **only** write-back paths that change future behavior are (1) `update_weights` → Forecast Core ensemble, (2) retrain triggers → Compute, (3) `update_kgik_edges`/`promote_edge` → Relational Layer. All three originate from scored outcomes in the History Lake, so improvement is always evidence-driven.

---

## 7. COMPONENT-RESPONSIBILITY TABLE

| # | Component | Primary responsibility | Inputs | Outputs | Interface (entry) | Lives in | Disposition | Closes gap |
|---|-----------|------------------------|--------|---------|-------------------|----------|-------------|-----------|
| 1 | **ORCHESTRATOR** | NL → typed plan; route to specialist; verify answer | `question`, `params` | prediction schema | `predict()` `prediction.py:748`; `_kimi_extract` `:65`; `POST /functions/predict` `routes/predict.py:30` | `server/services/prediction.py`, `server/routes/predict.py` | EXTEND | — (add `relational` domain, plan, verifier) |
| 2 | **HISTORY LAKE** | durable world-data + forecast/outcome store | snapshots, forecast/outcome records | series windows, panels, due pairs | `history_lake.py` (`put_snapshot/get_series/panel/persist_forecast/attach_outcome/due_for_scoring`) | `server/services/history_lake.py`, `server/db/` (Parquet `HISTORY_LAKE_DIR`) | NEW (mirrors `underworld/server/db/models.py`) | §1.2.3, §1.2.6 |
| 3 | **INGESTION LOOP** | scheduled feed snapshots → Lake | USGS/CoinGecko/FX/KGIK | persisted snapshots | `ingestion.ingest_tick()`; adapters `live_intel._earthquakes/_crypto/_fx` `:34/:67/:98`; `load_crypto_series` `prediction.py:707` | `server/services/live_intel.py` (EXTEND) + `server/services/ingestion.py` (NEW) | EXTEND | §1.2.6 |
| 4 | **PATTERN-DISCOVERY** | training-free structure (motifs/regimes/CP/lead-lag/causal screen) | series, panel | features + candidate edges | `patterns.discover()/discover_panel()` | `server/services/patterns.py` | NEW (uses STUMPY/HDBSCAN/ruptures) | §1.2.1, §1.2.5 |
| 5 | **RELATIONAL LAYER** | KGIK temporal graph; promote confirmed patterns; relational answers | ontology, KGIK, candidate edges, confirmations | neighborhoods, causal chains, forks, typed edges | `KnowledgeGraph` `knowledge_graph.py:104`; `causal_chain/counterfactual_fork` `temporal_nodes.py:67/:82`; `relational.py` adapter | `underworld/.../knowledge_graph.py` + `temporal_nodes.py` (EXTEND), `src/domain/ontology.js` (EXISTS), `server/services/relational.py` (NEW) | EXTEND | §1.2.5 (assert→discover) |
| 6 | **FORECAST CORE** | calibrated forecast: foundation+classical+EnKF→ensemble→conformal | series, regime features, member errors | `prediction{value,interval,prob}` + method+drivers | `predict()` forecasters + `foundation_forecast/arima/enkf/error_weighted_ensemble/enbpi_intervals` | `server/services/prediction.py` (EXTEND) | EXTEND | §1.2.1 |
| 7 | **SELF-IMPROVEMENT** | persist→score→drift→re-weight/retrain→update edges | matured forecast/outcome pairs | skill scores, weights, retrain triggers, edge updates | `improvement.run_cycle()/score_due/update_weights/check_drift/update_kgik_edges` | `server/services/improvement.py` (NEW) — reuses `ai_models.drift_detector` `:74` / `calibration_error` `:85` | NEW | §1.2.3 |
| 8 | **COMPUTE/DISPATCH** | array backend + foundation inference dispatch | array workloads, inference requests | arrays, foundation forecasts | `get_backend()` `gpu_backend.py:46`; remote `PREDICT_GPU_URL` | `underworld/.../gpu_backend.py` (EXISTS, via bridge) + `server/services/compute.py` (NEW) | EXTEND | §1.2.7 |
| 9 | **SURFACE** | endpoint + UI + temporal viz | user question | rendered answer + TCIS timeline | `POST /functions/predict` `routes/predict.py:30`; `PredictionOracle.jsx`; `TCIS.jsx` | `server/routes/predict.py`, `src/pages/PredictionOracle.jsx`, `src/pages/TCIS.jsx` | EXISTS / EXTEND | — |
| — | **CROSS-BACKEND BRIDGE** | reach underworld registry/optimizer/KGIK/ai_models/gpu | field/query | results or `None` (degrade) | Mode A import-guard (`prediction.py:42` pattern) / Mode B HTTP (`UNDERWORLD_URL`, `/methods/run`) | `server/services/uw_bridge.py` (NEW) + small underworld `/methods/run` route | NEW | §1.2.4 |

---

## 8. TRACEABILITY (architecture → spec sections → real files)

- ORCHESTRATOR → `09_ORCHESTRATION_NL_ROUTING.md`; code `server/services/prediction.py:65,651,748`, `server/routes/predict.py`.
- HISTORY LAKE / INGESTION → `05_DATA_MODEL_AND_SCHEMAS.md`; code `server/services/live_intel.py`, pattern `underworld/server/db/models.py`.
- PATTERN-DISCOVERY / FORECAST CORE / RELATIONAL → `06_ALGORITHMS.md`; code `prediction.py`, `underworld/.../knowledge_graph.py`, `temporal_nodes.py`, `src/domain/ontology.js`.
- SELF-IMPROVEMENT → `08_SELF_IMPROVEMENT_AND_MLOPS.md`; code `underworld/.../ai_models.py:74,85`.
- COMPUTE → `10_COMPUTE_AND_GPU.md`; code `underworld/.../gpu_backend.py:46`.
- API/SURFACE → `07_API_CONTRACTS.md`; code `server/routes/predict.py`, `src/pages/PredictionOracle.jsx`, `src/pages/TCIS.jsx`.
- Build sequencing of every NEW/EXTEND item → `13_PHASED_BUILD_PLAN.md`.

> **Honest status line.** Today: ORCHESTRATOR, FORECAST CORE (classical members), SURFACE, COMPUTE (gpu_backend), and the three already-imported underworld method modules **exist and are wired**. HISTORY LAKE, INGESTION scheduler, PATTERN-DISCOVERY, SELF-IMPROVEMENT loop, the cross-backend bridge, the foundation-model member, and the learned KGIK edges are **NEW/EXTEND** work authorized by this spec — each closing a specifically named gap from `00 §1.2`.
