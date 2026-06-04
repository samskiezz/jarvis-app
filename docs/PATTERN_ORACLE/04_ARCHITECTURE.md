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

## 8. PER-COMPONENT DETAILED DESIGN (internal sub-modules, interface sketches, state machines)

This section drops one level below §2. For each component it names the **internal sub-modules**, gives **class/interface sketches** (illustrative Python signatures — the *contract*, not the implementation), and, where the component is stateful or has a lifecycle, a **state machine**. Sketches are deliberately small and reuse the existing schema (`prediction.py:_insufficient` at `:711`) and the existing underworld primitives verified in §2.

### 8.1 ORCHESTRATOR — internal design  **[EXTEND `server/services/prediction.py`]**

**Sub-modules (four pipeline stages + a provenance object):**
- `router` — `classify()` (`prediction.py:651`) wrapping `_kimi_extract()` (`prediction.py:65`); 3-tier (Kimi → `params["domain"]` → regex). EXTEND: add `relational` to the Kimi enum + keyword fallback.
- `planner` — **NEW** inner object. Reads the classified intent and emits a `Plan` (which loaders, whether pattern-discovery / relational run, which forecast members, whether the GPU member is eligible). The Plan is the provenance spine for the verifier and the persistor.
- `dispatcher` — selects the specialist (`crypto | seismic | trajectory | growth | generic | relational`).
- `verifier` — **NEW** post-assembly gate; schema + sanity checks; downgrades to `insufficient_data`.

```python
# server/services/prediction.py  (EXTEND — illustrative)
@dataclass
class Plan:
    domain: str                       # crypto|seismic|trajectory|growth|generic|relational
    target: str | None
    horizon_hours: float | None
    loaders: list[str]                # ["load_crypto_series"] | ["history_lake.get_series"] ...
    run_patterns: bool                # invoke patterns.discover / discover_panel
    run_relational: bool              # invoke relational.* + KGIK bridge
    members: list[str]                # ["gbm_mc","holt","arima","foundation_ts"]
    gpu_member_eligible: bool         # foundation member only if a GPU/PREDICT_GPU_URL path exists
    caveats: list[str]                # accumulates "underworld absent", "no GPU", ...

def plan(intent: dict) -> Plan: ...          # NEW: classify() -> Plan
def verify(answer: dict, plan: Plan) -> dict: # NEW: returns answer or _insufficient(...)
    # asserts: interval present & low<=value<=high; 0<=probability<=1;
    #          assumptions and caveats non-empty; drivers populated.
```

**Router state machine (intent extraction):**
```
        ┌──────────┐  Kimi key set & 200      ┌─────────────┐
START ─►│ TRY_KIMI │ ───────────────────────► │ INTENT_OK   │──► PLAN
        └────┬─────┘                          └─────────────┘
             │ key absent / timeout / 5xx / bad-json
             ▼
        ┌──────────────┐ params["domain"]?  yes ┌─────────────┐
        │ TRY_PARAMS   │ ─────────────────────► │ INTENT_OK   │──► PLAN
        └──────┬───────┘                        └─────────────┘
               │ no
               ▼
        ┌──────────────┐  ticker/keyword hit    ┌─────────────┐
        │ REGEX_FALLBK │ ─────────────────────► │ INTENT_OK   │──► PLAN
        └──────┬───────┘                        └─────────────┘
               │ nothing matched
               ▼
        ┌──────────────┐
        │ INSUFFICIENT │──► return _insufficient("could not classify") (never raises)
        └──────────────┘
```
The Kimi→params→regex fall-through is exactly today's `_kimi_extract` returning `None` (`prediction.py:65`) so the regex path takes over. The only NEW transitions are PLAN and the verifier's ability to send a populated-but-unsound answer back to INSUFFICIENT.

### 8.2 HISTORY LAKE — internal design  **[NEW `server/services/history_lake.py` + `server/db/`]**

**Sub-modules:** `series_store` (Parquet, high-volume time-series), `forecast_store` (SQLite/SQLAlchemy, forecast+outcome rows), `panel_assembler` (joins N series on a common time grid), `maturity_index` (which forecasts are `due_for_scoring`). Mirrors `underworld/server/db/models.py` (`PopulationSnapshot`/`Event`/`CausalBelief`).

```python
# server/services/history_lake.py  (NEW — illustrative)
def put_snapshot(series_id: str, points: list[dict]) -> int: ...        # -> rows written
def get_series(series_id: str, lookback: str | int) -> list[dict]: ...   # [{t, v}]
def panel(series_ids: list[str], window: str) -> dict[str, list]: ...    # aligned grid
def persist_forecast(record: dict) -> str: ...                          # -> forecast_id
def attach_outcome(forecast_id: str, realized_value: float, observed_at: float) -> None: ...
def due_for_scoring(now: float) -> list[dict]: ...                      # matured (fc,outcome)
```

**Forecast-record lifecycle state machine** (the row that powers self-improvement):
```
   persist_forecast()         target_time passes & outcome lands       score_due()
ISSUED ───────────────► MATURING ──────────────────────────────────► SCORED ──► ARCHIVED
   │                       │  attach_outcome(realized)                   │
   │                       └──► (no outcome ever lands) ──► EXPIRED      │ (feeds weights/edges)
   └── inputs_hash + method + ensemble_weights captured at ISSUED so SCORED is reproducible.
```
Invariant from `00 §1.2.3`: an ISSUED row that can never reach SCORED (missing `target_time` / `inputs_hash`) is a **bug**, not a degraded state. `due_for_scoring` returns only MATURING rows whose `target_time <= now` and whose outcome is attached; EXPIRED rows (outcome never arrived within a grace window) are logged, not scored.

### 8.3 INGESTION LOOP — internal design  **[EXTEND `live_intel.py` + NEW `ingestion.py`]**

**Sub-modules:** `adapters` (reuse `live_intel._earthquakes :34`, `_crypto :67`, `_fx :98`; backfill via `prediction.load_crypto_series :707`), `scheduler` (`ingest_tick()`), `normalizer` (feed shape → `{series_id,t,value,source,as_of}`), `dedupe` (idempotent on `(series_id,t)`).

```python
# server/services/ingestion.py  (NEW — illustrative)
async def ingest_tick() -> dict:        # called by scheduler; returns per-source counts
    async with httpx.AsyncClient(timeout=...) as c:
        for fetch in (_earthquakes, _crypto, _fx):
            try:
                pts = normalize(await fetch(c))
                history_lake.put_snapshot(series_id_of(pts), pts)
            except Exception:           # per-source isolation: one bad feed never aborts the tick
                _record_feed_failure(fetch.__name__)   # surfaced as a caveat next forecast
    return _tick_report()
```

**Per-tick state machine:**
```
IDLE ──(scheduler fires)──► FETCHING ──ok──► NORMALIZE ──► DEDUPE ──► WRITE ──► IDLE
                                │ timeout/5xx (per source)
                                └──► STALE(source) ──(keep last good snapshot)──► IDLE
```
Cadence rule (carried from §2.3): snapshot interval ≥ feed TTL (`LIVE_INTEL_TTL_SECONDS=60`, `config.py:25`) to stay keyless/rate-limit-friendly. **Honest gap:** the scheduler needs a FastAPI `lifespan`; JARVIS `server/main.py:create_app()` (`:12`) currently has **no** `lifespan` (unlike underworld `:40`) — adding one is part of this EXTEND.

### 8.4 PATTERN-DISCOVERY — internal design  **[NEW `server/services/patterns.py`]**

**Sub-modules:** `motif` (Matrix Profile / STUMPY), `regime` (HDBSCAN over windowed features), `changepoint` (PELT offline + BOCPD online), `leadlag` (windowed cross-corr / time-lagged align), `causal_screen` (Granger + CCM — *screen only*).

```python
# server/services/patterns.py  (NEW — illustrative)
def discover(series: list[float]) -> dict:        # single-series
    return {"motifs": [...], "discords": [...], "regimes": [...], "change_points": [...]}
def discover_panel(panel: dict[str, list]) -> dict:  # cross-series
    return {"leadlag": [{"src","dst","lag","corr"}], "causal_candidates": [{"src","dst","stat","p"}]}
```

**Per-call state machine (degrade, never raise):**
```
START ─► STUMPY? ─yes─► motifs ┐
   │        └no (dep absent)──► skip+caveat
   ├─► HDBSCAN? ─yes─► regimes ┤──► change_points (ruptures? else numpy diff heuristic)
   ├─► leadlag (numpy, always available) ──┤
   └─► causal_screen ──► CANDIDATES (NOT asserted; flagged for verifier-gated promotion) ─► RETURN
```
Honesty contract (§2.4): Granger/CCM outputs are **candidates**, never edges. They only become KGIK edges via the verifier-gated `promote_edge` after surviving scoring (§8.7).

### 8.5 RELATIONAL LAYER — internal design  **[EXTEND KGIK + NEW `relational.py` adapter]**

**Sub-modules:** `kgik_adapter` (wraps `KnowledgeGraph` `knowledge_graph.py:104`: `add_node :119`, `add_edge :124`, `edges_from :143`, `prerequisites :147`, `novelty :192`), `temporal` (`TemporalNode.active_at :22`, `causal_chain :67`, `counterfactual_fork :82`, `competing_theory_clusters :148`), `ontology_bridge` (`src/domain/ontology.js` `linked:[...]` → graph nodes), `promoter` (`promote_edge`).

```python
# server/services/relational.py  (NEW thin adapter — illustrative)
def neighbors(entity: str) -> list[dict]: ...     # via KnowledgeGraph.edges_from + ontology linked[]
def chain(start: str) -> list[str]: ...           # via temporal_nodes.causal_chain
def fork(baseline: dict, intervention: dict) -> dict: ...  # via temporal_nodes.counterfactual_fork
def promote_edge(candidate: dict, confidence: "ConfidenceClass") -> None: ...  # writes KGIK edge
```

**Edge-strength state machine** (driven by §8.7; uses `ConfidenceClass` A–E ladder `knowledge_graph.py:28`):
```
CANDIDATE ──promote_edge (verifier-gated)──► PROVISIONAL(conf=D/E)
   │                                              │ scored correct repeatedly
   │                                              ▼
   │                                         CONFIRMED(conf↑ toward B/A)
   └── scored wrong repeatedly ──────────────────► WEAKENED(conf↓) ──► RETIRED (edge removed)
```
Only `update_kgik_edges` (§8.7) and `promote_edge` mutate edges — both originate from scored History-Lake outcomes (keeps the §6 evidence-driven invariant).

### 8.6 FORECAST CORE — internal design  **[EXTEND `server/services/prediction.py`]**

**Sub-modules (pipeline of members → assimilation → ensemble → conformal):**
- `members` — `gbm_mc` (exists), `holt` (exists), `arima` (NEW), `foundation_ts` (NEW, via Compute §8.8), plus the closed-form event/trajectory/growth members (exist).
- `assimilator` — `enkf_assimilate` (NEW; nudges member state to latest obs).
- `ensembler` — `error_weighted_ensemble` (NEW; weights from §8.7).
- `calibrator` — `enbpi_intervals` (NEW; EnbPI conformal band).

```python
# server/services/prediction.py  (EXTEND — illustrative)
def foundation_forecast(series, horizon) -> dict: ...   # GPU/PREDICT_GPU_URL; else raises -> dropped
def arima_forecast(series, horizon) -> dict: ...
def enkf_assimilate(members, latest_obs) -> list: ...
def error_weighted_ensemble(members, weights) -> dict: ...  # weights default uniform if §7 empty
def enbpi_intervals(members, alpha=0.1) -> dict:   # {low, high, confidence}
```

**Member-availability state machine (per forecast):**
```
PLAN.members ─► for each member: AVAILABLE? ──yes──► RUN ──► collected
                                     │ no (dep/GPU absent)
                                     └──► DROP + add caveat
collected ─► ASSIMILATE(EnKF) ─► ENSEMBLE(error-wtd) ─► CONFORMAL(EnbPI)
   │ zero members survived (e.g. empty series)
   └────────────────────────────────────────────► _insufficient(...)   (never raises)
```
Fallback contract (§2.6): if `foundation_ts` is dropped (no GPU, no `PREDICT_GPU_URL`), the ensemble runs on classical members with **wider** EnbPI intervals + an explicit caveat.

### 8.7 SELF-IMPROVEMENT LOOP — internal design  **[NEW `server/services/improvement.py`]**

**Sub-modules:** `scorer` (CRPS/RMSE/coverage vs climatology), `drift` (reuse `ai_models.drift_detector` PSI `:74`, `calibration_error` ECE `:85`), `weighter` (`update_weights`), `edge_updater` (`update_kgik_edges` + promote survivors), `scheduler` (`run_cycle`).

```python
# server/services/improvement.py  (NEW — illustrative)
def score_due(now: float) -> list[dict]: ...        # reads history_lake.due_for_scoring
def update_weights(domain: str) -> dict: ...        # error-weighted; read by ForecastCore
def check_drift(series_id: str) -> dict: ...        # PSI>0.2 -> drift; ECE>0.1 -> miscalibrated
def update_kgik_edges(confirmed: list[dict]) -> None: ...
def run_cycle() -> dict: ...                        # nightly orchestration; returns cycle report
```

**Nightly cycle state machine:**
```
SLEEP ─(nightly tick)─► SCORE ─► DRIFT ─► REWEIGHT ─┬─(drift flagged)─► RETRAIN_TRIGGER ─► EDGE_UPDATE ─► REPORT ─► SLEEP
                                                     └─(no drift)──────────────────────────► EDGE_UPDATE ─► REPORT ─► SLEEP
any stage error ─► PARTIAL_REPORT (log + persist what completed) ─► SLEEP   (loop is resumable, idempotent per forecast_id)
```

### 8.8 COMPUTE / DISPATCH — internal design  **[EXTEND gpu_backend (via bridge) + NEW `server/services/compute.py`]**

**Sub-modules:** `backend_binder` (reuse `gpu_backend.get_backend()` `:46`, returns `Backend{xp,name,device,is_gpu}` `:23` with `.asnumpy() :29`, `.synchronize() :35`, `.rng() :40`), `dispatcher` (local-GPU vs `PREDICT_GPU_URL` vs CPU), `remote_client` (httpx POST to the GPU service).

```python
# server/services/compute.py  (NEW — illustrative)
def array_backend(prefer="auto"):                 # thin reuse of gpu_backend.get_backend
    return uw_bridge.gpu_backend().get_backend(prefer)   # via §6 bridge; CPU numpy if absent
async def foundation_infer(series, horizon) -> dict:
    if PREDICT_GPU_URL: return await _remote(series, horizon)   # Mode B
    b = array_backend("auto")
    if b.is_gpu:       return _local_gpu(series, horizon, b)    # local CuPy
    raise ComputeUnavailable("no GPU and no PREDICT_GPU_URL")   # -> member dropped + caveat
```

**Dispatch decision state machine:**
```
REQUEST ─► PREDICT_GPU_URL set? ─yes─► REMOTE ─ok─► result
   │                                     │ timeout/5xx/conn-refused
   │                                     └──► LOCAL? 
   ├─no──────────────────────────────────────┘
   ▼
LOCAL_GPU? (gpu_backend.is_gpu) ─yes─► CuPy paths ─► result
   │ no
   ▼
CPU_FALLBACK (numpy, wider intervals + caveat)   # foundation member dropped; classical ensemble proceeds
```

---

## 9. ADDITIONAL SEQUENCE DIAGRAMS (with failure / timeout / retry paths)

These complement §3 (Flows A/B/C). Each call site annotates its **failure/timeout/retry** branch; all terminate in a *degraded answer*, never a 500 (Principle 1).

### 9.1 Flow D — anomaly / regime-scan (Pattern-Discovery dominant)

```
User  Oracle.jsx  /predict  predict()   HistoryLake     PatternDiscovery(patterns.py)        RelationalLayer
 ├──────►│ POST {q="is BTC behaving abnormally?"}        │                                       │
 │       ├────────►│ predict(q)          │               │                                       │
 │       │         ├─ classify(): domain=generic, intent=anomaly-scan                            │
 │       │         ├─ get_series("crypto:bitcoin",90d) ─►│ (miss → load_crypto_series backfill)  │
 │       │         │     ▲ FAIL: Lake empty & feed 5xx ──┤ retry x2 (200ms,400ms backoff)        │
 │       │         │     └─ still empty → _insufficient("no series; widen later") ◄── RETURN      │
 │       │         ├─ discover(series) ───────────────────────────►│ STUMPY motif/discord        │
 │       │         │     ▲ FAIL: STUMPY not installed ─────────────┤ skip motif + caveat;        │
 │       │         │                                                │ fall to numpy z-score discord
 │       │         ├─ change_points (ruptures? else diff heuristic)│                              │
 │       │         │◄─ {discords, regimes, change_points} ─────────┤                              │
 │       │         ├─ if anomaly near a known entity → relational.neighbors() (optional) ───────►│
 │       │         ├─ persist_forecast({type:anomaly,...}) ──► HistoryLake (scored later)        │
 │       │         │ VERIFIER: discord magnitude sane, caveats non-empty                         │
 │       │◄────────┤ {anomaly:true/false, score, regime, change_points, caveats}                 │
 │◄ render anomaly band + flagged windows ─┤                                                     │
```
Failure ladder: feed 5xx → 2 retries w/ exponential backoff → if still empty, `_insufficient`; STUMPY absent → numpy z-score discord + caveat; ruptures absent → diff-based change-point heuristic + caveat.

### 9.2 Flow E — backtest (offline, deterministic, no live feed)

```
Caller(test/CLI)  predict()/backtest harness   HistoryLake(read-only)   ForecastCore   Scorer(§7)
   ├─ params carry series directly (offline contract, prediction.py docstring) ─────────────────►
   ├─ for each cutoff t in walk-forward grid:                                                    │
   │     ├─ get_series(series_id, lookback ending at t) ─► (deterministic slice; no network)     │
   │     ├─ ForecastCore.run(slice, horizon)  [foundation member DISABLED in pure backtest]      │
   │     │     ▲ FAIL: member raises → DROP member, continue (never aborts the sweep)            │
   │     ├─ compare forecast vs known value at t+horizon                                         │
   │     └─ Scorer: CRPS / RMSE / interval coverage accumulate                                   │
   ├─ emit backtest report {per-method skill, coverage, calibration} ─► (optionally persist)     │
```
Determinism contract: backtest passes the series via `params` so the network is never touched (matches `prediction.py` docstring "params may carry the data series directly"); RNG seeded via `gpu_backend.rng(seed)` (`:40`) so GBM-MC paths reproduce. A member that raises is dropped, not fatal — the sweep continues so partial skill numbers are still produced.

### 9.3 Flow F — GPU-dispatch (foundation inference, all three paths)

```
ForecastCore   compute.foundation_infer()   Remote GPU svc (PREDICT_GPU_URL)   local gpu_backend   CPU
   ├─ need foundation_ts member ─►│                                            │                   │
   │                              ├─ PREDICT_GPU_URL set? yes ─► POST /infer ──►│ (httpx, timeout=Ts)
   │                              │     ▲ TIMEOUT/conn-refused/5xx ─ retry x1 ──┤                   │
   │                              │     └─ still failing → fall through ────────┘                   │
   │                              ├─ local is_gpu? (gpu_backend.get_backend :46) yes ─► CuPy infer  │
   │                              │     ▲ CuPy import/device error → fall through                   │
   │                              └─ CPU fallback: DROP foundation member ─────────────────────────►│ widen EnbPI + caveat
   │◄─ forecast member OR "dropped" sentinel ─┤                                                     │
```
Retry policy: remote gets **1** retry (idempotent inference, short backoff) then falls through — we never block a user request behind a flaky GPU box. Local GPU errors fall straight to CPU. The dropped member becomes a caveat, never an error.

### 9.4 Flow G — feed-ingestion (scheduled, no user; per-source isolation)

```
Scheduler(lifespan)  ingestion.ingest_tick()  Adapters(live_intel)  Normalizer  HistoryLake
   ├─ tick fires ─►│                            │                    │            │
   │               ├─ for fetch in (_earthquakes,_crypto,_fx):       │            │
   │               │     ├─ await fetch(client)  (httpx, per-source timeout)      │
   │               │     │     ▲ TIMEOUT/5xx/429 → record_feed_failure(name);     │
   │               │     │     └─ keep last good snapshot (STALE marker) ─ continue (isolation)
   │               │     ├─ normalize → {series_id,t,value,source,as_of}          │
   │               │     ├─ dedupe on (series_id,t)                               │
   │               │     └─ put_snapshot(...) ──────────────────────────────────►│ (idempotent)
   │               └─ emit tick_report{written, stale_sources, failures}          │
```
Isolation contract: a single feed's failure marks that source STALE and is surfaced as a forecast-time caveat ("crypto feed stale 14m") — it never aborts the tick or the other sources. 429 (rate-limit) is treated like a timeout: skip this tick, keep last good.

### 9.5 Flow H — cold-start (empty Lake, first ever request)

```
User  predict()  HistoryLake(EMPTY)  Ingestion(on-demand)  Feed   ForecastCore
 ├────►│ predict("XRP in 48h") on a fresh deploy                    │
 │     ├─ get_series → EMPTY ─► trigger on-demand backfill (load_crypto_series market_chart)
 │     │     ▲ FAIL: feed unreachable → _insufficient("cold start, no history; try later")
 │     ├─ backfill writes 90d into Lake ──► put_snapshot                          │
 │     ├─ ForecastCore.run on freshly-backfilled slice                            │
 │     │     ▲ foundation member: §7 weights table EMPTY → uniform weights default │
 │     │     ▲ no scored history → EnbPI uses residual-bootstrap prior (wider band)│
 │     ├─ persist_forecast (this becomes the FIRST scorable row) ──► HistoryLake   │
 │     └─ answer with explicit "cold-start: intervals conservative until calibrated" caveat
```
Cold-start contract: with no scored history, ensemble weights default to **uniform**, EnbPI widens via a residual-bootstrap prior, and the answer carries a cold-start caveat. The first forecast is still persisted so the system can begin calibrating immediately (closes the bootstrap problem in `00 §1.2.3`).

---

## 10. DATA-FLOW CONTRACTS BETWEEN COMPONENTS

Each edge in the §1 diagram is a typed contract. "Producer → Consumer" with the **payload shape**, the **degrade rule**, and the **idempotency/ordering** note. All shapes reuse the canonical schema (`prediction.py:_insufficient` `:711`) where applicable.

| Producer → Consumer | Payload shape | Degrade rule | Idempotency / ordering |
|---|---|---|---|
| Ingestion → History Lake | `{series_id, t, value, source, as_of}` | source STALE marker if feed fails | idempotent on `(series_id,t)`; out-of-order `t` allowed (sorted on read) |
| History Lake → Forecast Core | `get_series → [{t,v}]` (sorted asc) | empty → caller `_insufficient` | read-only; deterministic slice for backtest |
| History Lake → Pattern-Discovery | `panel → {series_id: [v...]}` aligned grid | missing series → dropped from panel + caveat | aligned on common time grid; NaN-filled gaps flagged |
| Pattern-Discovery → Forecast Core | `{regimes, change_points, motifs}` as features | absent → forecast runs feature-free + caveat | per-request, stateless |
| Pattern-Discovery → Relational | `causal_candidates[{src,dst,stat,p}]` | absent → no new edges proposed | candidates only; never auto-asserted |
| Relational → Orchestrator | `{neighbors, chain, fork, edges[{...,confidence}]}` | KGIK absent (bridge) → drop relational step + caveat | each edge carries `ConfidenceClass` (`:28`) |
| Forecast Core → Orchestrator | `prediction{value,unit,point_estimate,interval{low,high,confidence},probability}` + `method` + `drivers` | zero members → `_insufficient` | matches existing schema exactly |
| Orchestrator(verifier) → History Lake | `persist_forecast(record{forecast_id,question_hash,...,inputs_hash})` | persist failure → log + answer still returns (best-effort) | `forecast_id` unique; ISSUED state |
| History Lake → Self-Improvement | `due_for_scoring → [(forecast, outcome)]` | none mature → empty cycle (no-op) | only MATURING rows with attached outcome |
| Self-Improvement → Forecast Core | `weights{member: w}` per domain | empty → uniform weights | read at forecast time; last-write-wins per domain |
| Self-Improvement → Relational | `edge updates{edge_id, Δstrength, new_confidence}` | none → edges unchanged | monotone per scored outcome; evidence-driven only |
| Compute → Forecast Core | `foundation forecast{path, horizon}` or `dropped` sentinel | unavailable → dropped + caveat | stateless; remote idempotent (1 retry) |

**Three cross-cutting invariants** (carried from §6):
1. Every payload that crosses a component boundary has a **degrade form** — never an exception across the boundary.
2. The only write-backs that change future behavior are `update_weights`, retrain triggers, and `update_kgik_edges`/`promote_edge` — all sourced from **scored** outcomes.
3. Every persisted forecast carries `inputs_hash` + `method` + `ensemble_weights` so SCORED is reproducible (else it is a bug, §8.2).

---

## 11. CROSS-BACKEND BRIDGE — FULL DETAIL (Mode A direct-import & Mode B HTTP)

This expands §6 to code-level. The bridge lives in **one** new module `server/services/uw_bridge.py` that every PATTERN-ORACLE component calls; nothing else imports underworld directly. It generalizes the existing `_UW_AVAILABLE` guard (`prediction.py:42-63`).

### 11.1 The honest two-FastAPI-app caveat (restated, expanded)

Today there are **two independent FastAPI applications**, each with its own `create_app()`:
- JARVIS: `server/main.py:create_app()` (`:12`) — `title="Jarvis Backend"`, mounts auth/functions/predict/entities/streams, **and has no `lifespan`** (no startup hook today).
- Underworld: `underworld/server/main.py:create_app()` (`:55`) — mounts world/minion/patent/… routers and **does** define a `lifespan` (`:40`).

They share **no process and no database**. Two consequences the bridge must respect honestly:
1. There is no shared in-memory KGIK or registry — Mode A only works if the *underworld package* is importable on the JARVIS `PYTHONPATH` (same container), and even then it is a **separate object graph**, not the running underworld app's state.
2. The ingestion + nightly schedulers need a JARVIS `lifespan` that **does not exist yet** (`server/main.py:12` has none) — adding it is in-scope EXTEND work, not an existing capability.

### 11.2 Mode A — direct in-process import (illustrative interface)

```python
# server/services/uw_bridge.py  (NEW — Mode A path, generalizing prediction.py:42-63)
_UW_OK = False
_UW: dict[str, Any] = {}
try:
    from underworld.server.services import methods_registry as _REG
    from underworld.server.services import knowledge_graph as _KG
    from underworld.server.services import temporal_nodes as _TN
    from underworld.server.services import ai_models as _AI
    from underworld.server.services import real_optimizer as _OPT
    from underworld.server.services import gpu_backend as _GPU
    _UW = {"reg": _REG, "kg": _KG, "tn": _TN, "ai": _AI, "opt": _OPT, "gpu": _GPU}
    _UW_OK = True
except Exception:            # any failure -> degrade; never a hard dependency
    _UW_OK = False

def registry_run(field: str, *, seed: int = 0) -> dict | None:
    if _UW_OK: 
        try: return _UW["reg"].run(field, seed=seed)   # methods_registry.run :561
        except Exception: return None
    return None              # caller drops the step + adds caveat

def kg():       return _UW["kg"].KnowledgeGraph() if _UW_OK else None   # :104
def ai_models(): return _UW["ai"] if _UW_OK else None                  # drift :74 / ece :85
def gpu_backend(): return _UW["gpu"] if _UW_OK else None               # get_backend :46
```
- **Pros:** zero network latency, no serialization, one deploy, reuses the tested guard.
- **Cons:** requires underworld on the path & import-clean; couples deploys; cannot offload to a GPU host.
- **When:** dev / single-box; the pure-Python registry/KGIK/ai_models reaches.

### 11.3 Mode B — HTTP to the underworld REST app and/or GPU service

```python
# server/services/uw_bridge.py  (NEW — Mode B path, httpx like live_intel.py)
async def registry_run_http(field: str) -> dict | None:
    if not UNDERWORLD_URL: return None
    try:
        async with httpx.AsyncClient(timeout=UW_TIMEOUT) as c:
            r = await c.post(f"{UNDERWORLD_URL}/methods/run", json={"field": field})  # NEW route
            r.raise_for_status(); return r.json()
    except Exception:        # timeout/5xx/conn-refused -> degrade
        return None
```
- **Existing reachable routes:** knowledge-graph `/worlds/{id}/knowledge-graph`, optimizer `/optimize`, scale `/worlds/scale-capacity`.
- **NEW route required:** a thin `/methods/run` in the underworld app so the 464-method registry is reachable without import.
- **GPU inference:** `PREDICT_GPU_URL` (NEW env, absent from `server/config.py` today — add beside `KIMI_*`/`USGS_FEED`/`FX_FEED`).
- **Pros:** independent scale/deploy, GPU isolation, underworld can crash without taking JARVIS down.
- **Cons:** network latency + serialization, needs `/methods/run`, two services to operate.

### 11.4 Selection rule + degrade ladder (state machine)

```
                ┌─────────────────────┐
 need UW asset ►│ import underworld OK?│─yes─► MODE_A (in-proc) ─ok─► result
                └─────────┬───────────┘
                          │ no
                          ▼
                ┌─────────────────────┐
                │ relevant URL env set?│─yes─► MODE_B (HTTP) ─ok─► result
                │ (UNDERWORLD_URL /    │         │ timeout/5xx
                │  PREDICT_GPU_URL)    │         └─► DEGRADE
                └─────────┬───────────┘
                          │ no
                          ▼
                       DEGRADE: drop the underworld-backed step, widen intervals, add caveat
```
This keeps never-raise + underworld-optional intact end to end. **Honest status:** until `uw_bridge.py` and `/methods/run` exist, JARVIS reaches underworld *only* via the three already-imported method modules (`prediction.py:44-46`: `methods_seismology`, `methods_robotics`, `aerospace`); full registry/optimizer/KGIK/gpu access over either mode is the NEW work this spec authorizes.

---

## 12. CAPACITY & SCALING NOTES (per component)

Order-of-magnitude planning, not SLAs. "Hot path" = inside a user request; "Background" = scheduler.

| Component | Hot/Bg | Dominant cost | Scaling lever | Bottleneck / ceiling |
|---|---|---|---|---|
| ORCHESTRATOR | Hot | Kimi round-trip (~0.3–1s) when key set | cache intents by `question_hash`; regex path is ~µs | Kimi latency/rate-limit → regex fallback bounds worst case |
| HISTORY LAKE (series) | Hot read / Bg write | Parquet scan per `get_series` | partition by `series_id`/date; lookback caps row count | disk IO on very wide panels; mitigate via column pruning |
| HISTORY LAKE (forecasts) | Bg | SQLite row inserts/scans | index `(target_time, scored)`; archive SCORED rows | SQLite single-writer → batch nightly writes; Postgres if multi-writer |
| INGESTION | Bg | N feed fetches per tick | per-source concurrency; cadence ≥ feed TTL (60s) | external rate limits (429) → STALE+skip, never hammer |
| PATTERN-DISCOVERY | Hot | STUMPY motif = O(n·m); HDBSCAN | window-cap series; STUMPY GPU path; precompute regimes in Bg | matrix-profile on long series → cap lookback or offload to GPU |
| RELATIONAL (KGIK) | Hot | graph traversal `edges_from`/`causal_chain` | bounded BFS depth; in-memory graph | very dense graphs → cap neighborhood radius |
| FORECAST CORE | Hot | GBM-MC 10k paths; foundation infer | CuPy paths (gpu_backend); reduce paths on CPU; remote GPU | CPU MC dominates without GPU → fewer paths + wider CI |
| SELF-IMPROVEMENT | Bg | score N matured forecasts/night | batch by domain; idempotent per `forecast_id` | grows with forecast volume → archive + sample old rows |
| COMPUTE/DISPATCH | Hot | remote infer latency / device transfer | `PREDICT_GPU_URL` autoscale; CPU fallback | flaky GPU → 1 retry then drop member (no head-of-line blocking) |
| SURFACE | Hot | render payload | static CDN for assets; payload is small JSON | none material |

**Scaling stances:**
- **Dev / single box:** one JARVIS process, Mode A, SQLite + local Parquet, no GPU → classical ensemble, wider intervals. Throughput bounded by GBM-MC on CPU.
- **Prod / separated:** JARVIS API (horizontally scalable, stateless except the Lake which moves to a shared volume / Postgres), Underworld API (independent scale), GPU inference service behind `PREDICT_GPU_URL` (autoscaled). The Lake's SQLite single-writer is the first thing to graduate to Postgres when multiple JARVIS replicas write forecasts.
- **Hot-path latency budget:** classify (≤1s w/ Kimi, µs w/ regex) + get_series (Parquet, tens of ms) + patterns (cap-bounded) + forecast (GPU ms / CPU hundreds of ms) + persist (async, off the response path) — the persistor is fire-and-forget so a slow Lake write never delays the answer.

---

## 13. ARCHITECTURE DECISION RECORDS (ADRs)

Each ADR: **Decision · Rationale · Alternatives rejected · Consequences.** Grounded in the real codebase.

**ADR-01 — Build PATTERN ORACLE inside the JARVIS app (`server/`), not as a new service.**
- *Decision.* The orchestrator/forecast core live in `server/services/prediction.py`; underworld is reached as an optional dependency.
- *Rationale.* `predict()` (`:748`), the schema (`_insufficient :711`), the route (`POST /functions/predict`), and the UI (`PredictionOracle.jsx`) already exist here. Building elsewhere would duplicate them.
- *Alternatives rejected.* (a) New standalone "oracle" service — rejected: re-implements the existing spine + endpoint. (b) Build inside underworld — rejected: underworld is the asset library, not the NL-prediction surface; would invert the dependency.
- *Consequences.* Cross-backend bridge (§11) is required to reach underworld assets.

**ADR-02 — Two FastAPI apps stay separate; bridge them, do not merge.**
- *Decision.* Keep `server/main.py:create_app` and `underworld/server/main.py:create_app` as distinct apps; integrate via `uw_bridge.py` (Mode A import or Mode B HTTP).
- *Rationale.* Merging two large router sets risks import-time coupling and a single blast radius; the existing `_UW_AVAILABLE` guard already proves the optional-dependency pattern works (`prediction.py:42`).
- *Alternatives rejected.* (a) Single merged FastAPI app — rejected: couples deploys, defeats independent GPU/underworld scaling, large refactor. (b) Message queue between them — rejected: over-engineered for current call volume; HTTP+import covers both co-located and separated topologies.
- *Consequences.* The honest two-app caveat (§11.1); a small NEW `/methods/run` route in underworld for Mode B.

**ADR-03 — Never-raise contract is binding on every new component.**
- *Decision.* Every component has a degrade form; nothing throws across a boundary on a normal question.
- *Rationale.* `predict()` already guarantees `insufficient_data` over a 500 (Principle 1); calibrated honesty is the product.
- *Alternatives rejected.* Fail-fast/500 on missing data — rejected: breaks the core promise and the conformal-honesty contract.
- *Consequences.* Every sequence (§3, §9) terminates in a degraded answer; verifier (§8.1) can downgrade a populated-but-unsound answer.

**ADR-04 — History Lake = SQLite (forecasts) + Parquet (series), mirroring underworld persistence.**
- *Decision.* Reuse the SQLAlchemy pattern from `underworld/server/db/models.py`; Parquet for high-volume series under `HISTORY_LAKE_DIR`.
- *Rationale.* Zero-ops, proven in-repo (`PopulationSnapshot` is already a per-tick series), no new infra for dev.
- *Alternatives rejected.* (a) Time-series DB (InfluxDB/Timescale) — rejected: ops burden, not justified at current scale. (b) In-memory only — rejected: defeats the entire self-improvement loop (`00 §1.2.3`).
- *Consequences.* SQLite single-writer becomes the first scaling graduation point to Postgres (§12).

**ADR-05 — Causal links are screened (Granger/CCM), promoted only after scoring — never auto-asserted.**
- *Decision.* Pattern-Discovery emits `causal_candidates`; only verifier-gated `promote_edge` after surviving scoring writes a KGIK edge.
- *Rationale.* Closes `00 §1.2.5` ("causal asserted, not discovered") honestly; respects the A–E `ConfidenceClass` ladder (`knowledge_graph.py:28`).
- *Alternatives rejected.* Auto-asserting Granger results as causal edges — rejected: statistically unsound, violates honesty contract.
- *Consequences.* Edge-strength state machine (§8.5) is driven exclusively by scored outcomes.

**ADR-06 — Foundation TS model dispatched via `PREDICT_GPU_URL`, with classical fallback.**
- *Decision.* The learned member runs on local CuPy or a remote GPU service; absent both, it is dropped and the classical ensemble proceeds with wider EnbPI intervals.
- *Rationale.* CuPy/torch are not installed today (`00 §1.2.7`); `PREDICT_GPU_URL` is the honest escape hatch; `gpu_backend` already CPU-falls-back (`:46`).
- *Alternatives rejected.* (a) Hard GPU dependency — rejected: breaks dev + never-raise. (b) CPU-only foundation inference — rejected: too slow for hot path; classical members cover the CPU case.
- *Consequences.* Dispatch state machine (§8.8); foundation member always optional in the ensemble.

**ADR-07 — One bridge module (`uw_bridge.py`); no other file imports underworld directly (after migration).**
- *Decision.* Centralize all underworld reach behind `uw_bridge.py`.
- *Rationale.* Single place to switch Mode A/B and to enforce the degrade ladder; avoids scattering try/except guards.
- *Alternatives rejected.* Per-call inline guards (today's `prediction.py:42-63`) repeated everywhere — rejected: duplication, inconsistent degrade behavior.
- *Consequences.* The three existing inline imports in `prediction.py:44-46` migrate behind the bridge over time (honest transitional state in §11.4).

**ADR-08 — Schedulers run in a JARVIS FastAPI `lifespan` (to be added).**
- *Decision.* Ingestion `ingest_tick` and nightly `run_cycle` are driven by a JARVIS `lifespan`, mirroring underworld's (`:40`).
- *Rationale.* In-process scheduling needs no external cron for dev; matches the proven underworld pattern.
- *Alternatives rejected.* (a) External cron/Airflow — rejected: ops burden for dev; reconsider at prod scale. (b) Request-triggered ingestion only — rejected: leaves the Lake stale between requests.
- *Consequences.* JARVIS `create_app` (`server/main.py:12`) gains a `lifespan` it does not have today — explicitly in-scope EXTEND.

**ADR-09 — Forecast persistence is fire-and-forget on the hot path.**
- *Decision.* `persist_forecast` runs off the response path; a slow/failed Lake write logs but never delays or fails the answer.
- *Rationale.* Latency budget (§12) + never-raise; the forecast row matters for §7 but the user answer matters more.
- *Alternatives rejected.* Synchronous persist-then-respond — rejected: couples user latency to disk IO; a Lake hiccup would 500 the request.
- *Consequences.* A rare lost forecast row is tolerated (logged); idempotency on `forecast_id` allows safe retry by the scheduler.

---

## 14. TRACEABILITY (architecture → spec sections → real files)

- ORCHESTRATOR → `09_ORCHESTRATION_NL_ROUTING.md`; code `server/services/prediction.py:65,651,748`, `server/routes/predict.py`.
- HISTORY LAKE / INGESTION → `05_DATA_MODEL_AND_SCHEMAS.md`; code `server/services/live_intel.py`, pattern `underworld/server/db/models.py`.
- PATTERN-DISCOVERY / FORECAST CORE / RELATIONAL → `06_ALGORITHMS.md`; code `prediction.py`, `underworld/.../knowledge_graph.py`, `temporal_nodes.py`, `src/domain/ontology.js`.
- SELF-IMPROVEMENT → `08_SELF_IMPROVEMENT_AND_MLOPS.md`; code `underworld/.../ai_models.py:74,85`.
- COMPUTE → `10_COMPUTE_AND_GPU.md`; code `underworld/.../gpu_backend.py:46`.
- API/SURFACE → `07_API_CONTRACTS.md`; code `server/routes/predict.py`, `src/pages/PredictionOracle.jsx`, `src/pages/TCIS.jsx`.
- Build sequencing of every NEW/EXTEND item → `13_PHASED_BUILD_PLAN.md`.

> **Honest status line.** Today: ORCHESTRATOR, FORECAST CORE (classical members), SURFACE, COMPUTE (gpu_backend), and the three already-imported underworld method modules **exist and are wired**. HISTORY LAKE, INGESTION scheduler, PATTERN-DISCOVERY, SELF-IMPROVEMENT loop, the cross-backend bridge, the foundation-model member, and the learned KGIK edges are **NEW/EXTEND** work authorized by this spec — each closing a specifically named gap from `00 §1.2`.
