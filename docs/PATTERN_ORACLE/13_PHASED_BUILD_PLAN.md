# PATTERN ORACLE — 13. PHASED BUILD PLAN (ISO / Military Work-Breakdown)

**Document class:** Execution-ready Work-Breakdown Structure (WBS) · ISO/IEC/IEEE 12207-aligned · military-grade traceability
**Scope of this file:** the *how-to-build* spine. It turns the architecture in `00_MASTER_INDEX.md` §2 and the "replicate-first" ranking in §1.3 into a phased, task-level execution plan with owners, dependencies, effort, and testable acceptance gates that reference `11_VALIDATION_AND_TEST_PLAN.md`.
**Reads-with:** `04_ARCHITECTURE.md` (components), `05_DATA_MODEL_AND_SCHEMAS.md` (schemas), `06_ALGORITHMS.md` (math), `07_API_CONTRACTS.md` (endpoints), `08_SELF_IMPROVEMENT_AND_MLOPS.md` (loop), `10_COMPUTE_AND_GPU.md` (GPU), `11_VALIDATION_AND_TEST_PLAN.md` (AC IDs), `12_SECURITY_GOVERNANCE_LEGAL.md`.

> **Build doctrine.** Real infra only. NumPy in-process *now*; CuPy / remote-GPU *later* behind `PREDICT_GPU_URL`. Two FastAPI backends exist today — **JARVIS** (`server/`, the live predictor at `POST /functions/predict`) and **UNDERWORLD** (`underworld/server/`, the 464-method registry, GPU backend, temporal nodes, KG, DB). The plan builds the engine inside JARVIS, persists to a new History Lake, and **bridges** to UNDERWORLD's `methods_registry.py` / `temporal_nodes.py` / `knowledge_graph.py` / `gpu_backend.py` rather than duplicating them.

---

## 0. CONVENTIONS, IDS, AND GROUND TRUTH

### 0.1 Identifier scheme
- **Phase:** `Pn` (P0…P6).
- **Work Package:** `WP-n.m` (m within phase n).
- **Task:** `T-NNN` (globally unique, monotonically increasing; an engineer can start `T-001` today).
- **Acceptance Criterion:** `AC-Pn-x`, each mapped to a test ID in `11_VALIDATION_AND_TEST_PLAN.md` (referenced as `[§11 TC-…]`).
- **Requirement:** `FR-nn` / `NFR-nn` (functional / non-functional, defined in `01_MISSION_AND_SCOPE.md`; the mapping table is §11 of *this* file).

### 0.2 Owner roles (RACI legend)
| Code | Role | Primary remit |
|------|------|---------------|
| **BE** | Backend Engineer (Python/FastAPI) | services, routes, ingestion, bridges |
| **DS** | Data Scientist / Forecasting | conformal, ensemble, pattern algos, skill scoring |
| **MLE** | ML Engineer / MLOps | drift, backtesting harness, model registry, GPU tier |
| **DE** | Data Engineer | History Lake schema, Parquet/SQLite, retention |
| **PL** | Tech Lead / Architect | design sign-off, cross-backend contract, critical-path |
| **QA** | Test / Validation Engineer | test suites, AC verification, coverage gates |
| **SRE** | Reliability / Observability | SLOs, metrics, runbooks, deploy |
| **GOV** | Governance / Legal | license/patent compliance, data governance, sign-off |

### 0.3 Effort unit
Effort is in **ideal engineer-days (ed)** for one owner of the named role. Phase totals assume the WBS can partly parallelize across roles (see milestone schedule §8).

### 0.4 Real target paths (single source of truth)
| Symbol used below | Real path |
|---|---|
| `prediction.py` | `server/services/prediction.py` (live, 1147 lines) |
| `predict.py` route | `server/routes/predict.py` |
| `functions.py` route | `server/routes/functions.py` |
| `main.py` (JARVIS) | `server/main.py` |
| `config.py` (JARVIS) | `server/config.py` |
| **NEW** `history_lake.py` | `server/services/history_lake.py` |
| **NEW** `ingestion.py` | `server/services/ingestion.py` |
| **NEW** `conformal.py` | `server/services/conformal.py` |
| **NEW** `ensemble.py` | `server/services/ensemble.py` |
| **NEW** `skill.py` | `server/services/skill.py` |
| **NEW** `pattern_engine.py` | `server/services/pattern_engine.py` |
| **NEW** `self_improve.py` | `server/services/self_improve.py` |
| **NEW** `causal.py` | `server/services/causal.py` |
| **NEW** `relational.py` | `server/services/relational.py` |
| **NEW** `gpu_client.py` | `server/services/gpu_client.py` |
| **NEW** `underworld_bridge.py` | `server/services/underworld_bridge.py` |
| **NEW** routes | `server/routes/patterns.py`, `server/routes/skill.py` |
| UNDERWORLD registry | `underworld/server/services/methods_registry.py` (`lookup`, `run`) |
| UNDERWORLD GPU | `underworld/server/services/gpu_backend.py` (`get_backend`, `available_backends`) |
| UNDERWORLD temporal | `underworld/server/services/temporal_nodes.py` |
| UNDERWORLD KG | `underworld/server/services/knowledge_graph.py` (`KnowledgeGraph`, `Node`, `Edge`, `EdgeKind`) |
| UNDERWORLD drift/cal blocks | `underworld/server/services/ai_models.py` (`drift_detector`/PSI, `calibration_error`/ECE, `uncertainty_estimate`) |
| DB models | `underworld/server/db/models.py` (`PopulationSnapshot`, `Event`, `CausalBelief`, `MLModel`) |
| Tests (JARVIS) | `server/tests/` (`test_prediction.py`, `test_routes.py`) |

---

## 1. PHASE OVERVIEW & ORDER (grounded in §1.3 "replicate-first")

| Phase | Name | Replicate-first driver (§1.3) | Outcome |
|---|---|---|---|
| **P0** | Foundations: History Lake + ingestion + outcome store | enables (5) supercomputer loop; prerequisite to all | Real world-data persisted; forecasts/outcomes stored |
| **P1** | Calibration & Ensemble | (2) EnbPI conformal, (7) Error-Weighted Ensemble | Every forecast carries calibrated intervals + ensemble weighting |
| **P2** | Pattern Discovery | (3) Matrix Profile + HDBSCAN, (6) PELT/BOCPD | Motifs / regimes / change-points / lead-lag via `/patterns/scan` |
| **P3** | Self-Improvement Loop | (5) skill backtesting; PSI/ECE drift | Forecast→outcome scoring, re-weighting, `/predict/skill` |
| **P4** | Relational / KGIK learning | (8) TGN/TGAT, causal discovery | Learned graph edges, promoted patterns, Granger/CCM |
| **P5** | Foundation-model & GPU tier | (1) TimesFM/Chronos, CuPy | Remote inference behind `PREDICT_GPU_URL`; 464-method bridge |
| **P6** | Hardening | NFRs | Observability, SLOs, governance sign-off, traceability matrix |

**Why this order:** P0 is the irreducible prerequisite — no persisted series ⇒ no conformal residuals, no skill scoring, no drift, no pattern history (closes gap §1.2-#6 and #3). P1 delivers the highest capability-per-effort items (EnbPI #2, EWE #7) on the *existing* forecasters with zero new heavy deps. P2 adds training-free discovery (#3, #6) that depends only on the Lake. P3 closes the self-improvement loop (#3) and needs P0+P1. P4 (#8, causal) needs pattern history from P2/P3. P5 (#1, GPU) is deferrable behind a flag and bridges the two-backend gap (#4, #7-infra). P6 hardens for production.

---

## 2. PHASE P0 — FOUNDATIONS: HISTORY LAKE + INGESTION + OUTCOME STORE

**Objective.** Stand up a persistent **History Lake** that stores real world-data time-series (USGS, CoinGecko, FX) and an **outcome store** (forecast issued → realized value), replacing the current 60s–5min in-process cache (closes §1.2 #6, #3). Everything downstream consumes the Lake.

**Scope.** SQLite (dev) + Parquet (cold/columnar) store; ingestion loop reusing the existing loaders in `prediction.py` (`load_crypto_series`, `load_seismic_catalog`) plus a new FX adapter; forecast & outcome tables; idempotent upserts; retention; full unit tests. **Out of scope:** GPU, conformal, patterns (later phases).

**Requirements satisfied:** FR-01 (persist world data), FR-02 (persist forecasts+outcomes), NFR-01 (durability), NFR-05 (idempotent ingest), NFR-08 (no external write deps in dev).

### WP-0.1 — Lake schema & storage engine
| Task | Description | Files (create ⊕ / modify ✎) | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-001** | Define Lake schema: tables `series(series_id, source, symbol, ts, value, meta_json)`, `forecast(forecast_id, question, domain, target, issued_at, horizon_h, point, lo, hi, prob, method, models_json, params_json)`, `outcome(forecast_id, realized_at, realized_value, error, abs_error, in_interval, crps, status)`. Document DDL in `05_DATA_MODEL_AND_SCHEMAS.md`. | ⊕ `server/services/history_lake.py`; ✎ `05_DATA_MODEL_AND_SCHEMAS.md` | — | 1.5 | DE |
| **T-002** | Implement storage engine: SQLite via stdlib `sqlite3` (no new dep) with WAL mode; Parquet cold export via `pyarrow` (add to `server/requirements.txt`). DB path from `config.py` (`HISTORY_LAKE_PATH`, default `server/data/history_lake.db`). Connection helper, schema bootstrap on import, migration guard. | ⊕ `server/services/history_lake.py`; ✎ `server/config.py`, `server/requirements.txt` | T-001 | 2.0 | DE |
| **T-003** | CRUD + idempotent upsert API: `put_series(rows)`, `get_series(source, symbol, start, end)`, `put_forecast(rec)->forecast_id`, `get_open_forecasts(now)`, `put_outcome(rec)`. Upsert keyed on `(source,symbol,ts)`; unique forecast_id (uuid4). | ⊕ `server/services/history_lake.py` | T-002 | 2.0 | DE |

### WP-0.2 — Ingestion loop
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-004** | Refactor existing loaders so ingestion can reuse them without duplicating HTTP: extract `load_crypto_series` / `load_seismic_catalog` network bodies into pure fetch functions importable by ingestion. Keep the 5-min cache for live `/predict` reads. | ✎ `server/services/prediction.py` | — | 1.5 | BE |
| **T-005** | New FX adapter `fetch_fx(pair, days)` (e.g. exchangerate.host / Frankfurter — free, no key) returning the same row shape as crypto. | ⊕ `server/services/ingestion.py` | T-004 | 1.0 | BE |
| **T-006** | Ingestion orchestrator `ingest_once(sources)` that pulls USGS (seismic), CoinGecko (crypto), FX, normalizes to `series` rows, and `put_series`. Structured logging; per-source error isolation (one feed failing must not abort others). | ⊕ `server/services/ingestion.py` | T-003,T-005 | 2.0 | BE |
| **T-007** | Scheduler: FastAPI `lifespan` background task on JARVIS `main.py` calling `ingest_once` on an interval (`INGEST_INTERVAL_S`, default 300). Disabled in tests via `INGEST_ENABLED=false`. Mirror the UNDERWORLD `lifespan` pattern in `underworld/server/main.py`. | ✎ `server/main.py`, `server/config.py` | T-006 | 1.5 | BE |

### WP-0.3 — Forecast/outcome wiring + tests
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-008** | Hook `predict()` to persist every forecast to `forecast` table (fire-and-forget; never break the response path). Add `forecast_id` to the response schema. | ✎ `server/services/prediction.py`, `server/routes/predict.py` | T-003 | 1.5 | BE |
| **T-009** | Outcome resolver `resolve_outcomes(now)`: for matured open forecasts, fetch realized value from the Lake `series`, compute error/abs_error/in_interval, `put_outcome`. (Scoring math = P3; here store raw fields only.) | ⊕ `server/services/history_lake.py` (or `self_improve.py` stub) | T-003,T-006 | 1.5 | BE/DS |
| **T-010** | Unit + integration tests: in-memory SQLite fixture; upsert idempotency; loader→Lake roundtrip with mocked HTTP; lifespan ingest smoke; forecast persistence on `/functions/predict`. | ⊕ `server/tests/test_history_lake.py`, `server/tests/test_ingestion.py`; ✎ `server/tests/test_routes.py` | T-007,T-008,T-009 | 2.0 | QA |

**P0 dependencies:** T-001→T-002→T-003 (storage); T-004→T-005→T-006→T-007 (ingest); T-003+T-006→T-008/T-009; all→T-010.
**P0 effort:** ~18 ed.

**Acceptance criteria (P0)** — *all testable, mapped to §11*:
- **AC-P0-1** A 7-day run (or simulated clock) persists ≥1 row/source/interval with no gaps > 2× interval. `[§11 TC-LAKE-INGEST-01]`
- **AC-P0-2** Re-ingesting an overlapping window produces **zero duplicate** `(source,symbol,ts)` rows (idempotency). `[§11 TC-LAKE-IDEMP-02]`
- **AC-P0-3** Every `/functions/predict` call writes exactly one `forecast` row and returns its `forecast_id`. `[§11 TC-FCAST-PERSIST-03]`
- **AC-P0-4** `resolve_outcomes` populates `outcome.realized_value`/`error`/`in_interval` for forecasts whose horizon has elapsed and whose realized series exists. `[§11 TC-OUTCOME-04]`
- **AC-P0-5** One feed raising still ingests the others (fault isolation). `[§11 TC-INGEST-ISOLATION-05]`
- **DoD-P0:** schema documented in §05; ingest runs under lifespan; predict persists; outcome resolver passes; coverage ≥ 85% on `history_lake.py`/`ingestion.py`; PL design sign-off.

---

## 3. PHASE P1 — CALIBRATION & ENSEMBLE

**Objective.** Wrap the existing forecasters in `prediction.py` with **EnbPI conformal intervals** (§1.3 #2) and an **Error-Weighted Ensemble** (§1.3 #7, WO2014075108A2-style), plus a skill-scoring primitive. Replace asserted intervals with calibrated, residual-derived ones.

**Scope.** `conformal.py` (EnbPI), `ensemble.py` (error-weighted blend), `skill.py` (CRPS/RMSE/coverage/pinball primitives). Reuse UNDERWORLD `ai_models.uncertainty_estimate` as a building block. **Out of scope:** the closed self-improvement loop (P3), patterns (P2).

**Requirements:** FR-03 (calibrated intervals on every forecast), FR-04 (multi-model ensemble), FR-05 (skill metrics), NFR-02 (coverage within tolerance), NFR-03 (determinism given seed).

### WP-1.1 — Conformal calibration (EnbPI)
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-011** | Implement EnbPI: bootstrap ensemble of base forecasters, leave-one-out residuals, sliding-window residual quantiles → prediction interval at level α. Pure NumPy. Math + params (B, window, α) per `06_ALGORITHMS.md`. | ⊕ `server/services/conformal.py`; ✎ `06_ALGORITHMS.md` | P0:T-003 | 2.5 | DS |
| **T-012** | Residual source: prefer realized residuals from the Lake `outcome` table when available; else in-sample bootstrap residuals (cold-start). Graceful degradation noted in response `caveats`. | ✎ `server/services/conformal.py` | T-011, P0:T-009 | 1.5 | DS |
| **T-013** | Integrate conformal into `predict()` output: replace/augment `interval` with EnbPI `[lo,hi]` + nominal coverage; keep backward-compatible response keys. | ✎ `server/services/prediction.py` | T-011 | 1.5 | BE/DS |

### WP-1.2 — Error-Weighted Ensemble
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-014** | Implement Error-Weighted Ensemble: combine candidate forecasters (GBM-MC, Holt, growth, etc. already in `prediction.py`) with weights ∝ inverse recent error (softmax over −error). Default to equal weights at cold start. | ⊕ `server/services/ensemble.py`; ✎ `06_ALGORITHMS.md` | T-011 | 2.0 | DS |
| **T-015** | Wire ensemble into the domain predictors (`_predict_crypto`, `_predict_growth`, `_predict_generic`) so multiple models contribute one blended point + interval; expose per-model contributions in `models_json`. | ✎ `server/services/prediction.py` | T-014 | 2.0 | BE/DS |

### WP-1.3 — Skill scoring primitives + tests
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-016** | Skill metrics library: `rmse`, `mae`, `crps_ensemble`, `pinball_loss`, `coverage`, `skill_vs_climatology` (CRPS skill score). Pure NumPy; reuse `ai_models.uncertainty_estimate` for spread. | ⊕ `server/services/skill.py`; ✎ `06_ALGORITHMS.md` | — | 2.0 | DS |
| **T-017** | Tests: EnbPI empirical coverage on synthetic series (≈ nominal ±tol); ensemble weight monotonicity vs error; CRPS/pinball against hand-computed values; determinism with fixed seed. | ⊕ `server/tests/test_conformal.py`, `server/tests/test_ensemble.py`, `server/tests/test_skill.py` | T-013,T-015,T-016 | 2.5 | QA |

**P1 deps:** T-011→T-012/T-013; T-011→T-014→T-015; T-016 ∥; all→T-017.
**P1 effort:** ~16.5 ed.

**Acceptance criteria (P1):**
- **AC-P1-1** On synthetic AR(1)/GBM benchmarks, EnbPI 90% intervals achieve empirical coverage in **[0.85, 0.95]**. `[§11 TC-CONF-COVERAGE-01]`
- **AC-P1-2** Error-Weighted Ensemble ≤ best single member's RMSE on held-out backtest windows (no worse than equal-weight at cold start). `[§11 TC-ENS-SKILL-02]`
- **AC-P1-3** `crps_ensemble` and `pinball_loss` match reference values to 1e-6. `[§11 TC-SKILL-NUM-03]`
- **AC-P1-4** Every `/functions/predict` response now contains EnbPI `lo/hi`, nominal coverage, and per-model contributions. `[§11 TC-FCAST-SCHEMA-04]`
- **AC-P1-5** Fixed seed ⇒ byte-identical numeric output (determinism). `[§11 TC-DETERMINISM-05]`
- **DoD-P1:** conformal+ensemble live in `predict()`; skill lib tested; coverage gate met; §06 math updated; PL sign-off.

---

## 4. PHASE P2 — PATTERN DISCOVERY

**Objective.** Training-free pattern discovery over the Lake: **Matrix Profile (STUMPY) motifs/anomalies** (§1.3 #3), **HDBSCAN regimes** (#3), **PELT / BOCPD change-points** (#6), and **cross-series lead-lag**. Surface via new `GET/POST /patterns/scan`.

**Scope.** `pattern_engine.py` + `patterns.py` route. New deps: `stumpy`, `hdbscan`, `ruptures` (PELT), all in `server/requirements.txt`; BOCPD via lightweight in-house Bayesian online change-point. **Out of scope:** causal discovery (P4), graph promotion (P4).

**Requirements:** FR-06 (motif/anomaly discovery), FR-07 (regime detection), FR-08 (change-point detection), FR-09 (lead-lag), FR-10 (`/patterns/scan` API), NFR-04 (scan latency budget).

### WP-2.1 — Discovery primitives
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-018** | Matrix Profile motif/anomaly (discord) detection over a Lake series using STUMPY; return top-k motifs, discords, with timestamps. Fallback to NumPy sliding-window if STUMPY absent. | ⊕ `server/services/pattern_engine.py`; ✎ `server/requirements.txt`, `06_ALGORITHMS.md` | P0:T-003 | 2.5 | DS |
| **T-019** | HDBSCAN regime clustering over windowed feature vectors (returns/vol/MP) → labeled regimes with stability scores. | ✎ `server/services/pattern_engine.py`; ✎ `server/requirements.txt` | T-018 | 2.0 | DS |
| **T-020** | Change-point detection: PELT via `ruptures` + a lightweight BOCPD implementation; reconcile and return change-point set with confidence. | ✎ `server/services/pattern_engine.py`; ✎ `server/requirements.txt` | P0:T-003 | 2.5 | DS |
| **T-021** | Cross-series lead-lag: normalized cross-correlation / time-lagged mutual information between two Lake series → best lag + strength. | ✎ `server/services/pattern_engine.py` | P0:T-003 | 1.5 | DS |

### WP-2.2 — API surface + tests
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-022** | `/patterns/scan` route: request `{series|source+symbol, methods[], params}`, dispatch to engine, return unified pattern report. Register router in `main.py`. Contract in `07_API_CONTRACTS.md`. | ⊕ `server/routes/patterns.py`; ✎ `server/main.py`, `07_API_CONTRACTS.md` | T-018..T-021 | 2.0 | BE |
| **T-023** | Tests: planted motif recovered; injected regime shift detected; known change-points localized within tolerance; lead-lag recovers a synthetic lag; `/patterns/scan` schema + latency. | ⊕ `server/tests/test_pattern_engine.py`, `server/tests/test_patterns_route.py` | T-022 | 2.5 | QA |

**P2 deps:** T-018→T-019; T-018/T-020/T-021 ∥; all→T-022→T-023.
**P2 effort:** ~15.5 ed.

**Acceptance criteria (P2):**
- **AC-P2-1** A planted repeating motif is recovered in top-3 with timestamp error ≤ window/2. `[§11 TC-MP-MOTIF-01]`
- **AC-P2-2** An injected regime change yields ≥2 distinct HDBSCAN labels around the boundary. `[§11 TC-HDBSCAN-REGIME-02]`
- **AC-P2-3** PELT/BOCPD localize known change-points within ±5% of series length; F1 ≥ 0.8 on the synthetic suite. `[§11 TC-CPD-03]`
- **AC-P2-4** Lead-lag recovers a synthetic lag of k within ±1 step. `[§11 TC-LEADLAG-04]`
- **AC-P2-5** `/patterns/scan` returns a valid report < latency budget (NFR-04) on a 5k-point series. `[§11 TC-PATTERNS-API-05]`
- **DoD-P2:** all four primitives implemented with NumPy fallbacks; route registered; §06/§07 updated; tests green; PL sign-off.

---

## 5. PHASE P3 — SELF-IMPROVEMENT LOOP

**Objective.** Close the loop: score every matured forecast against realized outcomes, detect drift (**PSI/ECE** via `ai_models`), **online re-weight** the ensemble, run a **backtesting harness**, and expose `GET /predict/skill` (§1.3 #5; closes §1.2 #3).

**Scope.** `self_improve.py` (scoring + re-weight + drift), backtesting harness, `skill.py` route. Reuse UNDERWORLD `ai_models.drift_detector` (PSI) and `ai_models.calibration_error` (ECE). **Out of scope:** KG promotion (P4), retraining heavy models (P5).

**Requirements:** FR-11 (continuous scoring), FR-12 (drift detection), FR-13 (online re-weighting), FR-14 (backtesting), FR-15 (`/predict/skill` API), NFR-06 (re-weight bounded/stable).

### WP-3.1 — Scoring & drift
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-024** | Outcome scoring service: extend P0 resolver to compute CRPS/RMSE/coverage/pinball per forecast via `skill.py`, write into `outcome`; roll up per (domain, method) skill aggregates. | ⊕ `server/services/self_improve.py`; ✎ `server/services/history_lake.py` | P1:T-016, P0:T-009 | 2.5 | DS/MLE |
| **T-025** | Drift monitors: PSI on input-series distribution (reference vs recent) via `ai_models.drift_detector`; ECE on forecast confidence vs realized hits via `ai_models.calibration_error`. Emit drift flags. | ✎ `server/services/self_improve.py`; bridge to `underworld/server/services/ai_models.py` | T-024, P5:T-035(bridge) or direct import | 2.0 | MLE |
| **T-026** | Online re-weighting: update Error-Weighted Ensemble weights from rolling realized errors (exponential forgetting); clamp weights; persist current weights. | ✎ `server/services/ensemble.py`, `server/services/self_improve.py` | T-024, P1:T-014 | 2.0 | DS |

### WP-3.2 — Backtesting harness & API
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-027** | Walk-forward backtesting harness over Lake history: rolling-origin evaluation, per-method skill vs climatology baseline, reproducible report. CLI/function entry. | ⊕ `server/services/self_improve.py` (or `server/tools/backtest.py`) | T-024, P1 | 3.0 | MLE |
| **T-028** | `/predict/skill` route: return current per-domain/method skill, coverage, drift flags, ensemble weights. Register in `main.py`; contract in §07. | ⊕ `server/routes/skill.py`; ✎ `server/main.py`, `07_API_CONTRACTS.md` | T-024..T-026 | 1.5 | BE |
| **T-029** | Scheduled scoring: add resolver+scoring to the JARVIS lifespan loop (after ingest), so the loop runs continuously. | ✎ `server/main.py` | T-024,P0:T-007 | 1.0 | BE |
| **T-030** | Tests: synthetic forecast/outcome stream → correct CRPS/RMSE rollups; PSI flags an injected distribution shift; re-weighting demotes a deliberately bad model; backtest reproducibility (same seed/window ⇒ same report). | ⊕ `server/tests/test_self_improve.py`, `server/tests/test_backtest.py` | T-027,T-028,T-029 | 2.5 | QA |

**P3 deps:** T-024→{T-025,T-026,T-027}; →T-028; →T-029; all→T-030.
**P3 effort:** ~16.5 ed.

**Acceptance criteria (P3):**
- **AC-P3-1** Matured forecasts are scored (CRPS/RMSE/coverage) and aggregated per domain/method within one loop cycle. `[§11 TC-SCORE-01]`
- **AC-P3-2** Injecting a distribution shift raises PSI > 0.2 (drift=true) and ECE reflects mis-calibration. `[§11 TC-DRIFT-02]`
- **AC-P3-3** After N scored windows, a deliberately bad model's ensemble weight strictly decreases and remains within clamp bounds. `[§11 TC-REWEIGHT-03]`
- **AC-P3-4** Walk-forward backtest is reproducible bit-for-bit given fixed seed/window and reports skill vs climatology. `[§11 TC-BACKTEST-04]`
- **AC-P3-5** `/predict/skill` returns live skill/coverage/drift/weights. `[§11 TC-SKILL-API-05]`
- **DoD-P3:** loop runs scoring+drift+re-weight continuously; backtest reproducible; `/predict/skill` live; tests green; PL+MLE sign-off.

---

## 6. PHASE P4 — RELATIONAL / KGIK LEARNING

**Objective.** Learn relational structure: a **temporal-graph link-predictor** (TGN/TGAT-style or a lightweight time-decayed embedding fallback, §1.3 #8), **promote confirmed patterns into KGIK edges** (`knowledge_graph.py`), and run **causal discovery** (Granger / CCM) over Lake series (closes §1.2 #5).

**Scope.** `relational.py`, `causal.py`, bridge to UNDERWORLD `temporal_nodes.py` + `knowledge_graph.py`. **Out of scope:** heavy GNN training (kept lightweight/optional GPU in P5).

**Requirements:** FR-16 (temporal link-prediction), FR-17 (pattern→KG promotion), FR-18 (Granger causal screen), FR-19 (CCM nonlinear causality), FR-20 (causal results in answers), NFR-07 (graph ops bounded).

### WP-4.1 — Causal discovery
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-031** | Granger causality screen between Lake series pairs (VAR-based F-test, multiple-lag, BH-corrected). Pure statsmodels/NumPy. | ⊕ `server/services/causal.py`; ✎ `06_ALGORITHMS.md`, `server/requirements.txt` (statsmodels) | P2:T-021 | 2.5 | DS |
| **T-032** | Convergent Cross Mapping (CCM) for nonlinear/state-space causality; report skill-vs-library-size convergence. | ✎ `server/services/causal.py` | T-031 | 2.5 | DS |
| **T-033** | Surface causal screen in predictions (drivers/assumptions) and write candidate cause→effect into DB `CausalBelief` (Laplace-smoothed) via bridge. | ✎ `server/services/prediction.py`, `server/services/causal.py`; bridge to `underworld/server/db/models.py:CausalBelief` | T-031,T-032 | 2.0 | BE/DS |

### WP-4.2 — Temporal graph + KG promotion
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-034** | Lightweight temporal link-prediction: time-decayed co-occurrence / node-embedding scorer over confirmed patterns (TGN/TGAT-*style* behavior without heavy training); ranks likely future edges. GPU path deferred to P5. | ⊕ `server/services/relational.py`; ✎ `06_ALGORITHMS.md` | P3:T-024 | 3.0 | DS/MLE |
| **T-035** | Pattern→KGIK promotion: confirmed patterns (high skill, P3) become typed `Edge`s via UNDERWORLD `knowledge_graph.py` (`Node`/`Edge`/`EdgeKind`), stamped with `ConfidenceClass`; update edge strengths from realized skill. Reuse `temporal_nodes.causal_chain` for chains. | ⊕ `server/services/relational.py`; bridge to `underworld/server/services/knowledge_graph.py`, `temporal_nodes.py` | T-034, P3 | 2.5 | BE |
| **T-036** | Tests: Granger recovers a known driver→target lag; CCM detects coupling in a coupled-logistic system and rejects an independent pair; promotion creates valid typed KG edges with confidence; link-predictor ranks the planted future edge top-k. | ⊕ `server/tests/test_causal.py`, `server/tests/test_relational.py` | T-033,T-035 | 3.0 | QA |

**P4 deps:** T-031→T-032→T-033; T-034→T-035; all→T-036.
**P4 effort:** ~17.5 ed.

**Acceptance criteria (P4):**
- **AC-P4-1** Granger screen recovers a known driver→target relationship (p<0.05 after BH) and rejects an independent pair (FPR controlled). `[§11 TC-GRANGER-01]`
- **AC-P4-2** CCM shows convergence (skill rises with library size) for a coupled system; flat for an independent pair. `[§11 TC-CCM-02]`
- **AC-P4-3** A confirmed high-skill pattern is promoted to a typed KGIK `Edge` with a valid `ConfidenceClass`. `[§11 TC-KG-PROMOTE-03]`
- **AC-P4-4** Link-predictor ranks a planted future edge in top-k on a synthetic temporal graph. `[§11 TC-LINKPRED-04]`
- **AC-P4-5** Causal drivers appear in `/functions/predict` `drivers`/`assumptions`. `[§11 TC-CAUSAL-ANSWER-05]`
- **DoD-P4:** causal screen + CCM + promotion + link-predictor implemented and bridged to UNDERWORLD KG/DB; tests green; PL sign-off.

---

## 7. PHASE P5 — FOUNDATION-MODEL & GPU TIER

**Objective.** Add a foundation time-series tier (**TimesFM 2.5 / Chronos-Bolt**, §1.3 #1) and GPU acceleration behind `PREDICT_GPU_URL`, plus the **cross-backend bridge** to UNDERWORLD's 464-method registry (closes §1.2 #4, #7). All optional and flag-gated; NumPy in-process remains the default.

**Scope.** `gpu_client.py` (remote inference client), `underworld_bridge.py` (HTTP client to UNDERWORLD), CuPy acceleration via UNDERWORLD `gpu_backend.py`. **Out of scope:** training foundation models (we *use* them zero-shot, per §1.3 #1).

**Requirements:** FR-21 (foundation-model forecasts), FR-22 (registry bridge / 464 methods), FR-23 (GPU acceleration), NFR-09 (graceful CPU fallback), NFR-10 (remote timeout/circuit-breaker), NFR-11 (license/patent compliance — see §12).

### WP-5.1 — Cross-backend bridge
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-037** | UNDERWORLD bridge client: HTTP client (base URL from `config.py` `UNDERWORLD_URL`) to call `methods_registry` (`lookup`/`run`), `gpu_backend.available_backends`, KG endpoints. Timeout + circuit-breaker + cache. **Prereq:** add/confirm an UNDERWORLD route exposing `methods_registry.run(field, seed)`. | ⊕ `server/services/underworld_bridge.py`; ✎ `server/config.py`; ✎ `underworld/server/routes/science.py` (expose registry run) | P0 | 2.5 | BE/PL |
| **T-038** | Method-selection: orchestrator can route a sub-task to a registry method (one of ~464) via the bridge and fold the result into the answer. | ✎ `server/services/prediction.py`, `server/services/underworld_bridge.py` | T-037 | 2.0 | BE |

### WP-5.2 — Foundation model + GPU
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-039** | Remote inference client behind `PREDICT_GPU_URL`: POST a series → TimesFM/Chronos forecast (point + quantiles). Disabled when env unset ⇒ silent CPU fallback. Circuit-breaker + timeout (NFR-10). | ⊕ `server/services/gpu_client.py`; ✎ `server/config.py` | — | 2.5 | MLE |
| **T-040** | Add the foundation forecaster as an ensemble member (weight learned by P3 re-weighting); its quantiles feed conformal/ensemble. | ✎ `server/services/ensemble.py`, `server/services/prediction.py` | T-039, P1:T-014, P3:T-026 | 2.0 | DS/MLE |
| **T-041** | CuPy acceleration: route heavy array ops (GBM-MC paths, Matrix Profile feature math) through UNDERWORLD `gpu_backend.get_backend()` `xp`; auto-fallback to NumPy when no GPU. Bench via `scale_bench`. | ✎ `server/services/prediction.py`, `server/services/pattern_engine.py`; bridge to `underworld/server/services/gpu_backend.py` | T-037 | 2.5 | MLE |
| **T-042** | License/patent compliance gate: confirm Apache-2.0 for TimesFM/Chronos, STUMPY/HDBSCAN/ruptures licenses, EWE patent expiry (WO2014075108A2) — record in `12_SECURITY_GOVERNANCE_LEGAL.md`. | ✎ `12_SECURITY_GOVERNANCE_LEGAL.md` | — | 1.0 | GOV |
| **T-043** | Tests: mocked `PREDICT_GPU_URL` returns quantiles → enters ensemble; env unset ⇒ identical CPU result (fallback); bridge timeout trips breaker; CuPy path equals NumPy path within tolerance (forced numpy backend). | ⊕ `server/tests/test_gpu_client.py`, `server/tests/test_bridge.py` | T-038,T-040,T-041 | 2.5 | QA |

**P5 deps:** T-037→{T-038,T-041}; T-039→T-040; T-042 ∥; all→T-043.
**P5 effort:** ~17.5 ed.

**Acceptance criteria (P5):**
- **AC-P5-1** With `PREDICT_GPU_URL` set (mock), the foundation forecast enters the ensemble and influences the blended output. `[§11 TC-FM-ENSEMBLE-01]`
- **AC-P5-2** With `PREDICT_GPU_URL` unset, behavior is identical to P1–P4 CPU path (no crash, no latency cliff) — graceful fallback. `[§11 TC-FALLBACK-02]`
- **AC-P5-3** Bridge call to UNDERWORLD `methods_registry.run` returns a method result; timeout trips the circuit-breaker and the engine degrades gracefully. `[§11 TC-BRIDGE-03]`
- **AC-P5-4** CuPy path (where available) yields results equal to NumPy within 1e-6 (forced-numpy parity test). `[§11 TC-GPU-PARITY-04]`
- **AC-P5-5** License/patent register completed and signed by GOV. `[§11 TC-LICENSE-05]`
- **DoD-P5:** remote tier + bridge + GPU path all flag-gated with fallback; parity verified; §12 updated; PL+GOV sign-off.

---

## 8. PHASE P6 — HARDENING

**Objective.** Production-grade: observability, SLOs, governance sign-off, end-to-end traceability matrix (closes the v101–v150 ladder, §4 of index).

**Scope.** Metrics/logging/tracing, SLO definitions + alerts, runbooks, FMEA closure, requirement→component→test traceability matrix.

**Requirements (NFR-class):** NFR-12 (observability), NFR-13 (SLOs/availability), NFR-14 (governance sign-off), NFR-15 (traceability), NFR-16 (rollback/runbook).

### WP-6.1 — Observability & SLOs
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-044** | Structured metrics: per-stage latency, ingest success rate, coverage, CRPS, drift flags, bridge/breaker state. Expose `/metrics` (Prometheus-style) on JARVIS. | ⊕ `server/services/observability.py`; ✎ `server/main.py` | P3,P5 | 2.5 | SRE |
| **T-045** | SLOs + alerts: define availability, predict-latency p95, ingest-freshness, coverage-floor; alert rules + dashboards. Document in §11/§12. | ✎ `11_VALIDATION_AND_TEST_PLAN.md`, `12_SECURITY_GOVERNANCE_LEGAL.md` | T-044 | 1.5 | SRE |
| **T-046** | Runbooks + rollback: feed outage, breaker open, drift alarm, bad-deploy rollback; flag-kill switches for GPU/bridge/ingest. | ✎ `12_SECURITY_GOVERNANCE_LEGAL.md` (+ runbook section) | T-044 | 1.5 | SRE |

### WP-6.2 — Governance & traceability
| Task | Description | Files | Deps | Effort | Owner |
|---|---|---|---|---|---|
| **T-047** | Governance sign-off: authz on new routes (`/patterns/scan`, `/predict/skill`, `/metrics`), data governance/retention for the Lake, PII review (none expected). | ✎ `12_SECURITY_GOVERNANCE_LEGAL.md`; ✎ `server/routes/patterns.py`, `server/routes/skill.py` | P2,P3 | 2.0 | GOV |
| **T-048** | Traceability matrix: requirement (FR/NFR) → component (file) → task (T-ID) → test (§11 TC-ID), proving full coverage. | ✎ `13_PHASED_BUILD_PLAN.md` (§11 below) + `11_VALIDATION_AND_TEST_PLAN.md` | all | 2.0 | PL/QA |
| **T-049** | FMEA closure + end-to-end acceptance run: execute the full §11 suite across all phases; sign the gate. | ✎ `14_RISKS_AND_LIMITS.md`, `11_VALIDATION_AND_TEST_PLAN.md` | T-044..T-048 | 2.0 | QA/PL |

**P6 deps:** T-044→T-045→T-046; T-047 ∥; T-048→T-049.
**P6 effort:** ~14 ed.

**Acceptance criteria (P6):**
- **AC-P6-1** `/metrics` exposes ingest/coverage/CRPS/drift/breaker metrics; dashboards render. `[§11 TC-OBS-01]`
- **AC-P6-2** SLOs defined with alert rules; a synthetic breach fires an alert. `[§11 TC-SLO-02]`
- **AC-P6-3** Each runbook has a tested kill-switch / rollback path. `[§11 TC-RUNBOOK-03]`
- **AC-P6-4** Traceability matrix shows every FR/NFR → ≥1 component → ≥1 task → ≥1 passing test (100% coverage). `[§11 TC-TRACE-04]`
- **AC-P6-5** Full §11 suite passes end-to-end; FMEA top risks have mitigations. `[§11 TC-E2E-05]`
- **DoD-P6:** observability live; SLOs+alerts; runbooks; 100% traceability; full suite green; PL+GOV+SRE sign-off.

**Total program effort:** ≈ **115.5 ed** (single-owner-per-task ideal; calendar shrinks via role parallelism, §9).

---

## 9. DEPENDENCY GRAPH (ASCII)

```
                         ┌──────────────────────────────────────────────┐
                         │  P0 FOUNDATIONS (History Lake + ingestion)     │
                         │  T-001→T-002→T-003 ┐                           │
                         │  T-004→T-005→T-006→T-007                       │
                         │  T-003,T-006 → T-008,T-009 → T-010 (tests)     │
                         └───────┬───────────────┬───────────┬───────────┘
                                 │               │           │
              ┌──────────────────┘               │           └─────────────────┐
              ▼                                   ▼                             ▼
  ┌───────────────────────┐         ┌──────────────────────────┐   ┌──────────────────────┐
  │ P1 CALIBRATION+ENSEMBLE│         │ P2 PATTERN DISCOVERY      │   │ P5 GPU/FM BRIDGE       │
  │ T-011→T-012,T-013      │         │ T-018→T-019              │   │ T-037→T-038,T-041      │
  │ T-011→T-014→T-015      │         │ T-018/T-020/T-021→T-022  │   │ T-039→T-040(needs P1,P3)│
  │ T-016 → T-017 (tests)  │         │ → T-023 (tests)          │   │ T-042 ∥  → T-043       │
  └─────────┬──────────────┘         └─────────────┬────────────┘   └───────────┬──────────┘
            │                                       │                            │
            └───────────────┬───────────────────────┘                           │
                            ▼                                                    │
                ┌──────────────────────────────┐                                │
                │ P3 SELF-IMPROVEMENT LOOP       │◄───── needs P0 outcomes + P1   │
                │ T-024→{T-025,T-026,T-027}      │       skill lib                │
                │ →T-028,T-029 → T-030 (tests)   │                                │
                └───────────────┬────────────────┘                               │
                                ▼                                                 │
                ┌──────────────────────────────┐                                 │
                │ P4 RELATIONAL / KGIK / CAUSAL  │◄── needs P2 lead-lag, P3 skill │
                │ T-031→T-032→T-033              │                                │
                │ T-034→T-035 → T-036 (tests)    │                                │
                └───────────────┬────────────────┘                               │
                                │                                                 │
                                ▼                                                 ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │ P6 HARDENING (obs, SLO, governance, traceability)         │
                         │ T-044→T-045→T-046 ; T-047 ∥ ; T-048→T-049 (E2E gate)      │
                         └─────────────────────────────────────────────────────────┘

Legend: → sequential dep ; ∥ parallel ; ◄── cross-phase input.
Note: P5 may begin its bridge/FM/GPU work early (only depends on P0); its ensemble
member (T-040) gates on P1+P3. P2 can run fully in parallel with P1.
```

---

## 10. MILESTONE SCHEDULE (role-parallel, indicative)

Assumes ~2 BE, 2 DS, 1 MLE, 1 DE, 1 QA, plus fractional PL/SRE/GOV. Calendar weeks (W), 5 working days each.

| Milestone | Weeks | Phases active | Exit gate |
|---|---|---|---|
| **M1 — Lake live** | W1–W2 | P0 | AC-P0-1..5 pass; ingest under lifespan |
| **M2 — Calibrated forecasts** | W3–W4 | P1 (∥ P2 starts) | AC-P1-1..5 pass; coverage gate met |
| **M3 — Discovery online** | W4–W6 | P2 | AC-P2-1..5; `/patterns/scan` live |
| **M4 — Loop closed** | W6–W8 | P3 | AC-P3-1..5; `/predict/skill` live |
| **M5 — Relational + causal** | W8–W10 | P4 | AC-P4-1..5; KG promotion verified |
| **M6 — GPU/FM tier** | W7–W11 (∥ from W7) | P5 | AC-P5-1..5; fallback verified |
| **M7 — Production hardened** | W11–W13 | P6 | AC-P6-1..5; 100% traceability; E2E gate |

**Calendar critical path:** P0 → P1 → P3 → P4 → P6 ≈ **13 weeks**. P2 overlaps P1; P5 overlaps from W7.

---

## 11. REQUIREMENT → PHASE TRACEABILITY (FR/NFR map)

| Phase | Functional (FR) | Non-functional (NFR) | Closes gap (§1.2) | Replicate-first (§1.3) |
|---|---|---|---|---|
| **P0** | FR-01, FR-02 | NFR-01, NFR-05, NFR-08 | #6, #3 | enables (5) |
| **P1** | FR-03, FR-04, FR-05 | NFR-02, NFR-03 | #1(partial) | (2) EnbPI, (7) EWE |
| **P2** | FR-06, FR-07, FR-08, FR-09, FR-10 | NFR-04 | #2(via patterns) | (3) MP+HDBSCAN, (6) PELT/BOCPD |
| **P3** | FR-11, FR-12, FR-13, FR-14, FR-15 | NFR-06 | #3 | (5) skill backtest, drift |
| **P4** | FR-16, FR-17, FR-18, FR-19, FR-20 | NFR-07 | #5 | (8) TGN/TGAT, causal |
| **P5** | FR-21, FR-22, FR-23 | NFR-09, NFR-10, NFR-11 | #4, #7 | (1) TimesFM/Chronos |
| **P6** | — | NFR-12, NFR-13, NFR-14, NFR-15, NFR-16 | hardening | productionize all |

> The fine-grained **requirement → component → task → test** matrix is produced by **T-048** and lives alongside `11_VALIDATION_AND_TEST_PLAN.md`. The table above is the phase-level rollup.

---

## 12. RACI OWNERSHIP TABLE (per work package)

R = Responsible · A = Accountable · C = Consulted · I = Informed.

| WP | Summary | R | A | C | I |
|---|---|---|---|---|---|
| WP-0.1 | Lake schema/storage | DE | PL | BE, DS | QA, SRE |
| WP-0.2 | Ingestion loop | BE | PL | DE | QA, SRE |
| WP-0.3 | Forecast/outcome wiring+tests | BE, QA | PL | DS | SRE |
| WP-1.1 | EnbPI conformal | DS | PL | BE | QA |
| WP-1.2 | Error-weighted ensemble | DS | PL | BE | MLE |
| WP-1.3 | Skill primitives+tests | DS, QA | PL | MLE | BE |
| WP-2.1 | Discovery primitives | DS | PL | MLE | BE |
| WP-2.2 | `/patterns/scan`+tests | BE, QA | PL | DS | SRE |
| WP-3.1 | Scoring + drift | DS, MLE | PL | DE | QA |
| WP-3.2 | Backtest + `/predict/skill` | MLE, BE, QA | PL | DS | SRE |
| WP-4.1 | Causal discovery | DS | PL | MLE | BE |
| WP-4.2 | Temporal graph + KG promotion | BE, DS | PL | MLE | GOV |
| WP-5.1 | Cross-backend bridge | BE | PL | MLE | SRE, GOV |
| WP-5.2 | FM + GPU tier | MLE, DS | PL | BE | GOV, SRE |
| WP-6.1 | Observability + SLOs | SRE | PL | MLE, BE | GOV |
| WP-6.2 | Governance + traceability | GOV, PL, QA | PL | all | all |

---

## 13. RISK-ADJUSTED CRITICAL PATH

**Nominal critical path:** `T-001→T-002→T-003 → T-008/T-009 → T-011→T-013 → T-024→T-026 → T-034→T-035 → T-048→T-049` (Lake core → forecast persist → conformal → scoring/re-weight → relational → traceability gate).

| Risk on path | Likelihood | Impact | Risk-adjusted action | Buffer (ed) |
|---|---|---|---|---|
| External feeds (USGS/CoinGecko/FX) flaky or rate-limited (T-006) | Med | High | Per-source isolation (T-006) + replay fixtures; cache layer stays | +2 |
| EnbPI coverage off-nominal at cold start (T-011/T-012) | Med | High | Cold-start bootstrap residuals + caveat; widen until outcomes accrue | +2 |
| Re-weighting instability (T-026) | Med | Med | Weight clamps + exponential forgetting + monotonicity test (AC-P3-3) | +1 |
| New heavy deps (stumpy/hdbscan/ruptures) install/version issues (P2) | Med | Med | NumPy fallbacks for every primitive (T-018/T-020); pin versions | +2 |
| Cross-backend bridge requires new UNDERWORLD route (T-037) | High | Med | Pull `T-037` UNDERWORLD-route prereq forward into P0 slack; PL owns contract | +2 |
| Remote GPU endpoint unavailable (T-039) | High | Low | Flag-gated with silent CPU fallback (AC-P5-2); not on calendar critical path | +0 |
| Causal false positives (T-031/T-032) | Med | Med | BH correction + CCM convergence gate + report-only into drivers | +1 |

**Risk-adjusted critical path length:** nominal ~13 weeks **+ ~2 weeks aggregated buffer ⇒ ~15 weeks** to M7. Mitigation: start `T-001` and the `T-037` UNDERWORLD-route contract design *today* (both depend on nothing).

---

## 14. PER-PHASE DEFINITION OF DONE (rollup)

| Phase | Definition of Done |
|---|---|
| **P0** | Lake schema in §05; ingest under lifespan with fault isolation; predict persists forecast_id; outcome resolver works; AC-P0-1..5 green; coverage ≥85%; PL sign-off. |
| **P1** | EnbPI + Error-Weighted Ensemble live in `predict()`; skill primitives tested; coverage gate [0.85,0.95]; §06 updated; AC-P1-1..5 green; PL sign-off. |
| **P2** | Four discovery primitives with NumPy fallbacks; `/patterns/scan` registered; §06/§07 updated; AC-P2-1..5 green; PL sign-off. |
| **P3** | Continuous scoring+drift+online re-weight; reproducible backtest; `/predict/skill` live; AC-P3-1..5 green; PL+MLE sign-off. |
| **P4** | Granger+CCM+link-prediction+KG promotion bridged to UNDERWORLD; causal drivers in answers; AC-P4-1..5 green; PL sign-off. |
| **P5** | FM tier + bridge + CuPy path all flag-gated with verified fallback; GPU/numpy parity; §12 license register; AC-P5-1..5 green; PL+GOV sign-off. |
| **P6** | Observability + SLOs + alerts + runbooks; 100% requirement→test traceability (T-048); full §11 suite green; FMEA closed; AC-P6-1..5 green; PL+GOV+SRE sign-off. |

---

## 15. START-NOW CHECKLIST (T-001 ready today)

1. `T-001` (DE): write the Lake DDL (`series`, `forecast`, `outcome`) into `05_DATA_MODEL_AND_SCHEMAS.md` and stub `server/services/history_lake.py`. **No upstream deps.**
2. In parallel `T-016` (DS): implement `server/services/skill.py` metrics (pure NumPy). **No upstream deps.**
3. In parallel `T-037` design (PL/BE): draft the UNDERWORLD route contract exposing `methods_registry.run(field, seed)` in `underworld/server/routes/science.py`. **No upstream deps.**
4. `T-042` (GOV): begin the license/patent register (TimesFM/Chronos Apache-2.0, STUMPY/HDBSCAN/ruptures, EWE patent expiry). **No upstream deps.**

> These four tasks have zero dependencies and can begin immediately, de-risking the critical path before P0 storage lands.

---
---

# PART B — DEPTH MILESTONE (EXECUTION DOSSIER)

> **What this part adds.** Part A (above, §0–§15) is the WBS skeleton. Part B is the *execution dossier*: for **every** task `T-001…T-049` it adds sub-tasks, exact file diffs/interfaces, a Definition-of-Done checklist, gating test cases, effort + skill, risk + mitigation, and rollback. It then adds a Gantt schedule (§17), critical-path slack analysis (§18), resourcing/staffing plan (§19), inter-phase integration test plan (§20), environment/infra provisioning (§21), cutover/launch runbook (§22), post-launch operations (§23), and a full FR/NFR → component → task → test matrix (§24). Everything is grounded in the *real* two-backend layout verified against the repo: JARVIS `server/` (live predictor, `server/main.py` has no lifespan yet, `server/config.py` already defines `USGS_FEED` and `FX_FEED=https://open.er-api.com/v6/latest/AUD`, `server/requirements.txt` currently pins only `fastapi/uvicorn/httpx/pydantic/python-multipart/sse-starlette/numpy/pytest`) and UNDERWORLD `underworld/server/` (registry `methods_registry.py:lookup`/`run(field,*,seed)`, `gpu_backend.py:get_backend`/`available_backends`, `ai_models.py:drift_detector`/`calibration_error`/`uncertainty_estimate`, `knowledge_graph.py:ConfidenceClass`/`NodeKind`/`EdgeKind`/`Node`/`Edge`/`KnowledgeGraph`, `db/models.py:CausalBelief`/`Event`/`PopulationSnapshot`/`MLModel`, `routes/science.py` guarded by `require_bearer`, and an `asynccontextmanager lifespan` already wired in `underworld/server/main.py`).

> **Reality corrections folded in here.** (a) The FX adapter should target the *already-configured* `open.er-api.com` feed (`config.FX_FEED`), not `exchangerate.host`/Frankfurter. (b) JARVIS `server/main.py` uses `create_app()` with **no** `lifespan=` argument today — adding one is itself a sub-task (see T-007.0). (c) The new UNDERWORLD registry route (T-037 prereq) must adopt the existing `Depends(require_bearer)` auth pattern used by every endpoint in `routes/science.py`.

---

## 16. PER-TASK EXECUTION DOSSIER

**Legend for every card below.**
- **Sub-tasks:** the ordered `.0/.1/.2…` decomposition an engineer executes.
- **Interface / diff:** the concrete signature(s) or DDL the task lands. Pseudocode/contracts, not final code.
- **DoD checklist:** binary, reviewable items; PR cannot merge until all are ticked.
- **Gating tests:** the `[§11 TC-…]` and local `pytest` nodes that must be green.
- **Effort / skill:** ideal engineer-days + the *minimum competency* required.
- **Risk → mitigation:** the dominant failure mode and its control.
- **Rollback:** how to revert this task in isolation without breaking shipped phases.

### 16.0 Skill-level rubric (referenced by every card)
| Skill tag | Means |
|---|---|
| **S1** | Junior — guided, well-specified CRUD/wiring/tests |
| **S2** | Mid — owns a module, designs interfaces, writes its tests |
| **S3** | Senior — owns cross-module contracts, numerics, perf |
| **S4** | Staff/Lead — owns cross-backend contract, critical-path, sign-off |

---

### PHASE P0 — FOUNDATIONS

#### T-001 — Lake schema definition  ·  Owner DE  ·  Effort 1.5 ed  ·  Skill S2
**Sub-tasks**
- T-001.0 Draft DDL for `series`, `forecast`, `outcome` (column types, PK/UNIQUE).
- T-001.1 Choose key strategy: `series` UNIQUE`(source,symbol,ts)`; `forecast.forecast_id` uuid4 PK; `outcome.forecast_id` FK→`forecast`.
- T-001.2 Document the DDL block + an ER sketch in `05_DATA_MODEL_AND_SCHEMAS.md`.
- T-001.3 Stub `server/services/history_lake.py` with module docstring + `SCHEMA_SQL` constant only.

**Interface / DDL (lands as `SCHEMA_SQL` in `history_lake.py`)**
```sql
CREATE TABLE IF NOT EXISTS series(
  series_id INTEGER PRIMARY KEY, source TEXT NOT NULL, symbol TEXT NOT NULL,
  ts INTEGER NOT NULL, value REAL NOT NULL, meta_json TEXT,
  UNIQUE(source,symbol,ts));
CREATE TABLE IF NOT EXISTS forecast(
  forecast_id TEXT PRIMARY KEY, question TEXT, domain TEXT, target TEXT,
  issued_at INTEGER, horizon_h REAL, point REAL, lo REAL, hi REAL, prob REAL,
  method TEXT, models_json TEXT, params_json TEXT);
CREATE TABLE IF NOT EXISTS outcome(
  forecast_id TEXT PRIMARY KEY REFERENCES forecast(forecast_id),
  realized_at INTEGER, realized_value REAL, error REAL, abs_error REAL,
  in_interval INTEGER, crps REAL, status TEXT);
CREATE INDEX IF NOT EXISTS ix_series_lookup ON series(source,symbol,ts);
CREATE INDEX IF NOT EXISTS ix_forecast_open ON forecast(issued_at,horizon_h);
```
**DoD checklist**
- [ ] DDL covers all 3 tables with stated PK/UNIQUE/index.
- [ ] §05 contains the DDL block + ER sketch, cross-linked to this file.
- [ ] `history_lake.py` imports cleanly (`python -c "import server.services.history_lake"`).
- [ ] No behavior change to live `/functions/predict`.

**Gating tests** `[§11 TC-LAKE-INGEST-01]` (schema-load portion) · local `test_history_lake.py::test_schema_loads`.
**Risk → mitigation** Schema churn later forces migrations → keep `meta_json/models_json/params_json` as TEXT/JSON escape hatches so additive fields need no DDL change.
**Rollback** Delete `history_lake.py` stub + revert §05 edit; nothing imports it yet.

#### T-002 — Storage engine (SQLite WAL + Parquet export)  ·  DE  ·  2.0 ed  ·  S2
**Sub-tasks**
- T-002.0 `_connect()` helper: `sqlite3.connect(path)`, `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL`, `check_same_thread=False`.
- T-002.1 `_bootstrap()` runs `SCHEMA_SQL` idempotently on first import.
- T-002.2 Add `HISTORY_LAKE_PATH=os.environ.get("HISTORY_LAKE_PATH","server/data/history_lake.db")` to `server/config.py` (the `server/data/` dir already exists).
- T-002.3 Add `pyarrow>=15` to `server/requirements.txt`; implement `export_parquet(table, path)`.
- T-002.4 Migration guard: `PRAGMA user_version`; refuse downgrade.

**Interface**
```python
def _connect() -> sqlite3.Connection: ...
def _bootstrap(conn: sqlite3.Connection) -> None: ...
def export_parquet(table: str, out_path: str) -> int: ...  # returns rows written
```
**DoD checklist**
- [ ] WAL mode confirmed via `PRAGMA journal_mode` returning `wal`.
- [ ] `HISTORY_LAKE_PATH` read from `config.py`; default under `server/data/`.
- [ ] `pyarrow` pinned in `requirements.txt`; `export_parquet` round-trips a known frame.
- [ ] Bootstrap is idempotent (second import does not error).

**Gating tests** `[§11 TC-LAKE-IDEMP-02]` (bootstrap idempotency) · `test_history_lake.py::test_wal_and_bootstrap`, `::test_parquet_export`.
**Risk → mitigation** `pyarrow` wheel size/version friction → Parquet export is *optional cold path*; SQLite is the source of truth, so a `pyarrow` import failure degrades to "no cold export" not "no Lake".
**Rollback** Revert `requirements.txt` + `config.py` line; guard `export_parquet` import behind try/except so removal is non-breaking.

#### T-003 — CRUD + idempotent upsert API  ·  DE  ·  2.0 ed  ·  S2
**Sub-tasks**
- T-003.0 `put_series(rows)` → `INSERT ... ON CONFLICT(source,symbol,ts) DO UPDATE SET value=excluded.value`.
- T-003.1 `get_series(source,symbol,start,end)` → ordered list of dict rows.
- T-003.2 `put_forecast(rec)->forecast_id` (uuid4 if absent), `get_open_forecasts(now)` (issued_at+horizon ≤ now, no outcome row).
- T-003.3 `put_outcome(rec)` upsert on `forecast_id`.
- T-003.4 Thread-safety note: single connection + short transactions.

**Interface**
```python
def put_series(rows: list[dict]) -> int
def get_series(source: str, symbol: str, start: int, end: int) -> list[dict]
def put_forecast(rec: dict) -> str          # forecast_id
def get_open_forecasts(now: int) -> list[dict]
def put_outcome(rec: dict) -> None
```
**DoD checklist**
- [ ] Re-`put_series` of an overlapping window leaves row count unchanged.
- [ ] `get_open_forecasts` excludes already-resolved forecasts.
- [ ] `put_forecast` returns a stable uuid4.
- [ ] All functions covered by unit tests; coverage ≥85% on module.

**Gating tests** `[§11 TC-LAKE-IDEMP-02]` · `test_history_lake.py::{test_upsert_idempotent,test_open_forecasts,test_forecast_id}`.
**Risk → mitigation** Concurrent writers from lifespan loop + request path → keep writes tiny + WAL; if contention seen, add a module-level `threading.Lock` around writes.
**Rollback** Pure-additive module; deleting it only breaks tests written against it (also new). No live path depends on it until T-008.

#### T-004 — Refactor loaders into reusable fetchers  ·  BE  ·  1.5 ed  ·  S2
**Sub-tasks**
- T-004.0 Extract HTTP body of `load_crypto_series` (`server/services/prediction.py:147`) into `fetch_crypto(asset,days)->list[dict]`.
- T-004.1 Extract `load_seismic_catalog` (`:173`) network body into `fetch_seismic(...)`.
- T-004.2 Keep the existing 5-min cache wrapping the *live read* path unchanged.
- T-004.3 Ensure row shape is identical between live and ingest consumers.

**Interface (added to `prediction.py`, no signature change to existing callers)**
```python
def fetch_crypto(asset: str, days: int = 90) -> list[dict]   # pure HTTP, no cache
def fetch_seismic(...) -> list[dict]
# load_crypto_series/load_seismic_catalog now call these + cache
```
**DoD checklist**
- [ ] Existing `test_prediction.py` still green (no behavior change to live predict).
- [ ] `fetch_*` importable by `ingestion.py` with no cache side-effects.
- [ ] Row dict keys documented and identical across live/ingest.

**Gating tests** `test_prediction.py` (regression) · `test_ingestion.py::test_fetch_shapes`.
**Risk → mitigation** Refactor regresses live predict → land as pure extraction with the old functions delegating; rely on existing `test_prediction.py` as the guard.
**Rollback** `git revert` the single `prediction.py` commit; loaders return to inline HTTP.

#### T-005 — FX adapter  ·  BE  ·  1.0 ed  ·  S1
**Sub-tasks**
- T-005.0 `fetch_fx(pair, days)` hitting the **already-configured** `config.FX_FEED` (`open.er-api.com/v6/latest/AUD`); derive cross-rates for the requested pair.
- T-005.1 Normalize to the crypto/seismic row shape (`source='fx'`, `symbol=pair`, `ts`, `value`).
- T-005.2 Handle the er-api `result:"success"` envelope + `rates` map.

**Interface (in `server/services/ingestion.py`)**
```python
def fetch_fx(pair: str = "USD", days: int = 30) -> list[dict]
```
**DoD checklist**
- [ ] Uses `config.FX_FEED` (no new hard-coded URL).
- [ ] Returns rows matching the shared shape.
- [ ] Handles non-success envelope by raising a typed error (caught upstream by T-006 isolation).

**Gating tests** `test_ingestion.py::test_fx_shape` (mocked HTTP) · contributes to `[§11 TC-LAKE-INGEST-01]`.
**Risk → mitigation** er-api gives daily (not intraday) granularity → document FX as a daily series; conformal/skill treat horizon in the series' native cadence.
**Rollback** Remove `fetch_fx`; ingestion source list (T-006) drops `fx`.

#### T-006 — Ingestion orchestrator  ·  BE  ·  2.0 ed  ·  S2
**Sub-tasks**
- T-006.0 `ingest_once(sources)` loops sources, calls the matching `fetch_*`, normalizes, `put_series`.
- T-006.1 **Per-source try/except isolation** — one feed raising logs + continues (AC-P0-5).
- T-006.2 Structured logging: `{source, rows, ms, ok|err}`.
- T-006.3 Return a per-source summary dict for the scheduler/metrics.

**Interface**
```python
def ingest_once(sources: list[str] = ("seismic","crypto","fx")) -> dict[str,dict]
```
**DoD checklist**
- [ ] Forcing one source to raise still ingests the others.
- [ ] Summary dict reports rows + status per source.
- [ ] Logs are structured (parseable).

**Gating tests** `[§11 TC-INGEST-ISOLATION-05]`, `[§11 TC-LAKE-INGEST-01]` · `test_ingestion.py::{test_isolation,test_ingest_once}`.
**Risk → mitigation** Rate-limit/flaky feeds → replay fixtures in tests; backoff + the existing live cache cushions live reads.
**Rollback** `ingest_once` is only invoked by the scheduler (T-007); disabling the scheduler neutralizes it.

#### T-007 — Lifespan scheduler  ·  BE  ·  1.5 ed  ·  S2
**Sub-tasks**
- T-007.0 **Add a `lifespan` to JARVIS** — `server/main.py` currently calls `FastAPI(...)` with no `lifespan`; wrap an `@asynccontextmanager` mirroring `underworld/server/main.py:39`.
- T-007.1 Background `asyncio.Task` calling `ingest_once` every `INGEST_INTERVAL_S` (default 300).
- T-007.2 Add `INGEST_INTERVAL_S` + `INGEST_ENABLED` to `config.py`; default disabled under pytest.
- T-007.3 Clean cancellation on shutdown.

**Diff sketch (`server/main.py`)**
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_ingest_loop()) if config.INGEST_ENABLED else None
    try: yield
    finally:
        if task: task.cancel()
app = FastAPI(title="Jarvis Backend", version="0.1.0", lifespan=lifespan)
```
**DoD checklist**
- [ ] `INGEST_ENABLED=false` (pytest default) ⇒ no background task spawned.
- [ ] Loop runs at the configured interval when enabled (verified with a short interval in a smoke test).
- [ ] Shutdown cancels the task cleanly (no warnings).

**Gating tests** `[§11 TC-LAKE-INGEST-01]` (lifespan smoke) · `test_routes.py::test_lifespan_smoke`.
**Risk → mitigation** Background task crashes silently → wrap loop body in try/except + structured error log + metric (P6 hook).
**Rollback** Remove `lifespan=` arg → app reverts to current static behavior; ingestion dormant.

#### T-008 — Persist forecasts from `predict()`  ·  BE  ·  1.5 ed  ·  S2
**Sub-tasks**
- T-008.0 In `predict()` (`prediction.py:748`), after building the response, `put_forecast(rec)` **fire-and-forget** (try/except; never break the response).
- T-008.1 Add `forecast_id` to the response dict and to the route schema in `server/routes/predict.py`.
- T-008.2 Map domain/method/models into the `forecast` columns.

**DoD checklist**
- [ ] Every `/functions/predict` response includes `forecast_id`.
- [ ] A persistence failure logs but returns a normal forecast (resilience).
- [ ] Exactly one `forecast` row per call.

**Gating tests** `[§11 TC-FCAST-PERSIST-03]` · `test_routes.py::test_predict_persists_forecast`.
**Risk → mitigation** Write latency on the hot path → fire-and-forget + tiny insert; if measurable, move to a queue drained by the lifespan loop.
**Rollback** Guard the `put_forecast` call behind `config.LAKE_PERSIST` (default on); flip off to restore pre-Lake response (minus `forecast_id`).

#### T-009 — Outcome resolver (raw fields)  ·  BE/DS  ·  1.5 ed  ·  S2
**Sub-tasks**
- T-009.0 `resolve_outcomes(now)`: `get_open_forecasts(now)`, for each fetch realized value via `get_series`.
- T-009.1 Compute `error/abs_error/in_interval` (raw only; CRPS/scoring math deferred to P3 T-024).
- T-009.2 `put_outcome`; set `status` (`resolved|nodata`).

**Interface** `def resolve_outcomes(now: int) -> dict` (counts by status).
**DoD checklist**
- [ ] Matured forecasts with realized series get `realized_value/error/in_interval`.
- [ ] Forecasts lacking realized data are marked `nodata`, not errored.
- [ ] No double-resolution (idempotent via `outcome` PK).

**Gating tests** `[§11 TC-OUTCOME-04]` · `test_history_lake.py::test_resolve_outcomes`.
**Risk → mitigation** Realized series cadence ≠ forecast horizon → nearest-bar matching with tolerance; record matched ts in `outcome` for audit.
**Rollback** Resolver is invoked only by the loop (T-029) / tests; not calling it leaves outcomes empty without breaking predict.

#### T-010 — P0 test suite  ·  QA  ·  2.0 ed  ·  S2
**Sub-tasks** in-memory `sqlite3(":memory:")` fixture; upsert idempotency; loader→Lake roundtrip with mocked `httpx`; lifespan ingest smoke; `/functions/predict` persistence assertion.
**DoD checklist**
- [ ] New files `test_history_lake.py`, `test_ingestion.py`; `test_routes.py` extended.
- [ ] Coverage ≥85% on `history_lake.py` + `ingestion.py`.
- [ ] All AC-P0-1..5 mapped to a green test node.

**Gating tests** all `[§11 TC-LAKE-*/INGEST-*/FCAST-PERSIST-03/OUTCOME-04]`.
**Risk → mitigation** Network in CI → all HTTP mocked; `INGEST_ENABLED=false` by default.
**Rollback** Tests are additive; deleting them lowers coverage but breaks nothing shipped.

---

### PHASE P1 — CALIBRATION & ENSEMBLE

#### T-011 — EnbPI conformal  ·  DS  ·  2.5 ed  ·  S3
**Sub-tasks**
- T-011.0 Bootstrap B base-forecaster fits; leave-one-out residual aggregation.
- T-011.1 Sliding-window residual quantile → interval at level α.
- T-011.2 Params `(B, window, alpha)` from `params` dict; defaults in `06_ALGORITHMS.md`.
- T-011.3 Seed plumbing for determinism (NFR-03).

**Interface (`server/services/conformal.py`)**
```python
def enbpi_interval(series: np.ndarray, point: float, *,
                   B: int = 25, window: int = 100, alpha: float = 0.1,
                   seed: int = 0, residuals: np.ndarray | None = None) -> tuple[float,float,float]
# returns (lo, hi, nominal_coverage)
```
**DoD checklist**
- [ ] Pure NumPy; no new heavy dep.
- [ ] Empirical coverage ∈ [0.85,0.95] on synthetic AR(1)/GBM at α=0.1.
- [ ] Fixed seed ⇒ identical output.
- [ ] §06 documents the math + defaults.

**Gating tests** `[§11 TC-CONF-COVERAGE-01]`, `[§11 TC-DETERMINISM-05]` · `test_conformal.py::{test_coverage,test_determinism}`.
**Risk → mitigation** Cold-start over/under-coverage → T-012 residual source switch + caveats.
**Rollback** `predict()` keeps its current asserted interval behind `config.CONFORMAL_ENABLED`; flip off to revert.

#### T-012 — Residual source (Lake vs bootstrap)  ·  DS  ·  1.5 ed  ·  S3
**Sub-tasks** prefer realized residuals from `outcome` (via T-009); fall back to in-sample bootstrap; annotate `caveats` when degraded.
**DoD checklist**
- [ ] Uses Lake residuals when ≥N available; bootstrap otherwise.
- [ ] Response `caveats` flags cold-start.
- [ ] Switch covered by a test that toggles available outcomes.

**Gating tests** `[§11 TC-CONF-COVERAGE-01]` (warm path) · `test_conformal.py::test_residual_source_switch`.
**Risk → mitigation** Sparse outcomes early → bootstrap default keeps intervals valid.
**Rollback** Force bootstrap-only via flag.

#### T-013 — Integrate conformal into `predict()`  ·  BE/DS  ·  1.5 ed  ·  S2
**Sub-tasks** replace/augment `interval` with EnbPI `[lo,hi]`+coverage; keep legacy keys for backward-compat; populate `forecast.lo/hi/prob`.
**DoD checklist**
- [ ] Every response carries EnbPI `lo/hi` + nominal coverage.
- [ ] Legacy response keys still present (no breaking change).
- [ ] `forecast` row stores `lo/hi/prob`.

**Gating tests** `[§11 TC-FCAST-SCHEMA-04]` · `test_routes.py::test_predict_has_conformal`.
**Risk → mitigation** Frontend depends on old interval keys → additive, dual-write keys.
**Rollback** `CONFORMAL_ENABLED=false`.

#### T-014 — Error-Weighted Ensemble  ·  DS  ·  2.0 ed  ·  S3
**Interface (`server/services/ensemble.py`)**
```python
def ew_weights(recent_errors: dict[str,float], *, temp: float = 1.0,
               clamp: tuple[float,float]=(0.02,0.8)) -> dict[str,float]   # softmax(-error)
def blend(members: dict[str,dict], weights: dict[str,float]) -> dict      # point+interval
```
**Sub-tasks** softmax over −recent error; equal weights at cold start; clamp; expose contributions.
**DoD checklist**
- [ ] Equal weights when no errors known.
- [ ] Higher error ⇒ lower weight (monotonic).
- [ ] Weights clamped + normalized.

**Gating tests** `[§11 TC-ENS-SKILL-02]` · `test_ensemble.py::{test_cold_start_equal,test_monotonic_weights}`.
**Risk → mitigation** Degenerate single-member dominance → clamp upper bound.
**Rollback** `ENSEMBLE_ENABLED=false` ⇒ single-model path (current behavior).

#### T-015 — Wire ensemble into domain predictors  ·  BE/DS  ·  2.0 ed  ·  S2
**Sub-tasks** route `_predict_crypto/_predict_growth/_predict_generic` (`prediction.py:794/1076/1134`) through `blend`; emit per-model `models_json`.
**DoD checklist**
- [ ] Each domain predictor returns one blended point+interval.
- [ ] `models_json` lists per-model contribution + weight.
- [ ] Ensemble never worse than best single member on backtest (AC-P1-2).

**Gating tests** `[§11 TC-ENS-SKILL-02]`, `[§11 TC-FCAST-SCHEMA-04]` · `test_prediction.py::test_ensemble_wired`.
**Risk → mitigation** One member errors → drop it from the blend, renormalize, log.
**Rollback** Flag to single-member per domain.

#### T-016 — Skill metrics library  ·  DS  ·  2.0 ed  ·  S3
**Interface (`server/services/skill.py`)**
```python
def rmse(y,yhat)->float; def mae(y,yhat)->float
def crps_ensemble(samples, y)->float; def pinball_loss(y,q,tau)->float
def coverage(y,lo,hi)->float; def skill_vs_climatology(score,clim_score)->float
```
**DoD checklist**
- [ ] Pure NumPy; reuses `ai_models.uncertainty_estimate` for spread.
- [ ] `crps_ensemble`/`pinball_loss` match hand-computed refs to 1e-6.
- [ ] No upstream deps (start-now task).

**Gating tests** `[§11 TC-SKILL-NUM-03]` · `test_skill.py::test_numeric_refs`.
**Risk → mitigation** Numeric edge cases (ties, single sample) → explicit guards + tests.
**Rollback** Standalone library; safe to delete (only P1/P3 consume).

#### T-017 — P1 test suite  ·  QA  ·  2.5 ed  ·  S2
DoD: coverage gate met on conformal/ensemble/skill; AC-P1-1..5 each map to a green node; determinism asserted byte-for-byte.
**Gating tests** all `[§11 TC-CONF-*/ENS-*/SKILL-*/FCAST-SCHEMA-04/DETERMINISM-05]`.
**Rollback** Additive.

---

### PHASE P2 — PATTERN DISCOVERY

#### T-018 — Matrix Profile motifs/discords  ·  DS  ·  2.5 ed  ·  S3
**Sub-tasks** STUMPY MP over a Lake series; top-k motifs+discords with ts; **NumPy sliding-window fallback** when STUMPY absent.
**Interface (`server/services/pattern_engine.py`)**
```python
def matrix_profile(series, m: int, k: int = 3) -> dict   # {motifs:[...], discords:[...]}
```
**DoD checklist**
- [ ] STUMPY path + NumPy fallback both return same schema.
- [ ] `stumpy` pinned in `requirements.txt`.
- [ ] Planted motif recovered in top-3.

**Gating tests** `[§11 TC-MP-MOTIF-01]` · `test_pattern_engine.py::test_motif_recovery`.
**Risk → mitigation** STUMPY install friction → fallback guarantees functionality (NFR-09 spirit).
**Rollback** Remove dep; fallback remains.

#### T-019 — HDBSCAN regimes  ·  DS  ·  2.0 ed  ·  S3
**Sub-tasks** windowed features (returns/vol/MP) → HDBSCAN labels + stability; NumPy KMeans-ish fallback.
**DoD** ≥2 labels around an injected regime boundary; `hdbscan` pinned; fallback schema-equal.
**Gating tests** `[§11 TC-HDBSCAN-REGIME-02]` · `test_pattern_engine.py::test_regime_split`.
**Risk → mitigation** Param sensitivity → expose `min_cluster_size`; defaults in §06.
**Rollback** Dep removal → fallback clustering.

#### T-020 — Change-points (PELT + BOCPD)  ·  DS  ·  2.5 ed  ·  S3
**Sub-tasks** `ruptures` PELT + in-house BOCPD; reconcile; confidence per change-point.
**DoD** F1≥0.8 on synthetic suite; within ±5% series length; `ruptures` pinned; BOCPD pure NumPy fallback.
**Gating tests** `[§11 TC-CPD-03]` · `test_pattern_engine.py::test_changepoints`.
**Risk → mitigation** PELT penalty tuning → BIC-based default + override.
**Rollback** Disable PELT; BOCPD-only.

#### T-021 — Lead-lag  ·  DS  ·  1.5 ed  ·  S2
**Sub-tasks** normalized cross-correlation / time-lagged MI between two series → best lag+strength.
**DoD** recovers synthetic lag within ±1 step.
**Gating tests** `[§11 TC-LEADLAG-04]` · `test_pattern_engine.py::test_leadlag`.
**Risk → mitigation** Spurious lag on short series → min-length guard + significance threshold.
**Rollback** Standalone function.

#### T-022 — `/patterns/scan` route  ·  BE  ·  2.0 ed  ·  S2
**Sub-tasks** request `{series|source+symbol, methods[], params}`; dispatch to engine; unified report; register router in `server/main.py`; contract in `07_API_CONTRACTS.md`. Auth: follow JARVIS route conventions (public-read unless `REQUIRE_AUTH`).
**DoD** route registered; schema validated; latency < NFR-04 on 5k points.
**Gating tests** `[§11 TC-PATTERNS-API-05]` · `test_patterns_route.py::{test_schema,test_latency}`.
**Risk → mitigation** Large series blow latency → cap series length + downsample param.
**Rollback** Remove `include_router(patterns_routes.router)` from `main.py`.

#### T-023 — P2 test suite  ·  QA  ·  2.5 ed  ·  S2
DoD: all four primitives + route covered; AC-P2-1..5 green; fallbacks exercised with deps force-disabled.
**Gating tests** all `[§11 TC-MP-*/HDBSCAN-*/CPD-*/LEADLAG-*/PATTERNS-API-05]`. **Rollback** additive.

---

### PHASE P3 — SELF-IMPROVEMENT LOOP

#### T-024 — Outcome scoring service  ·  DS/MLE  ·  2.5 ed  ·  S3
**Sub-tasks** extend T-009 resolver to compute CRPS/RMSE/coverage/pinball via `skill.py`; write into `outcome`; roll up per `(domain,method)`.
**Interface (`server/services/self_improve.py`)** `def score_outcomes(now)->dict`, `def skill_rollup()->dict`.
**DoD** matured forecasts scored + aggregated within one loop cycle.
**Gating tests** `[§11 TC-SCORE-01]` · `test_self_improve.py::test_scoring_rollup`.
**Risk → mitigation** Missing realized data skews rollups → exclude `nodata` outcomes from aggregates.
**Rollback** Loop step gated by `SCORING_ENABLED`.

#### T-025 — Drift monitors (PSI/ECE)  ·  MLE  ·  2.0 ed  ·  S3
**Sub-tasks** PSI on input distribution via `ai_models.drift_detector`; ECE via `ai_models.calibration_error`; emit drift flags. Import directly from UNDERWORLD (or via T-037 bridge if cross-process).
**DoD** injected shift ⇒ PSI>0.2 (drift=true); ECE reflects miscalibration.
**Gating tests** `[§11 TC-DRIFT-02]` · `test_self_improve.py::test_drift_flags`.
**Risk → mitigation** Cross-backend import coupling → prefer bridge (T-037) when JARVIS/UNDERWORLD run as separate processes; document both.
**Rollback** Drift flags are advisory; disabling leaves scoring intact.

#### T-026 — Online re-weighting  ·  DS  ·  2.0 ed  ·  S3
**Sub-tasks** update EW weights from rolling realized errors (exponential forgetting); clamp; persist current weights (table or `meta_json`).
**DoD** bad model's weight strictly decreases over N windows, within clamps (AC-P3-3).
**Gating tests** `[§11 TC-REWEIGHT-03]` · `test_self_improve.py::test_reweight_demotes_bad`.
**Risk → mitigation** Oscillation → forgetting factor + clamps + monotonicity test.
**Rollback** Freeze weights (`REWEIGHT_ENABLED=false`) ⇒ static EW.

#### T-027 — Walk-forward backtest harness  ·  MLE  ·  3.0 ed  ·  S3
**Sub-tasks** rolling-origin eval over Lake history; per-method skill vs climatology; reproducible report; CLI/function entry (`server/tools/backtest.py` acceptable).
**DoD** bit-for-bit reproducible given seed/window; reports skill vs climatology.
**Gating tests** `[§11 TC-BACKTEST-04]` · `test_backtest.py::test_reproducible`.
**Risk → mitigation** Lookahead leakage → strict origin cutoff + a leakage assertion test.
**Rollback** Offline tool; no live dependency.

#### T-028 — `/predict/skill` route  ·  BE  ·  1.5 ed  ·  S2
**Sub-tasks** return per-domain/method skill, coverage, drift flags, ensemble weights; register in `main.py`; §07 contract.
**DoD** route live; schema validated.
**Gating tests** `[§11 TC-SKILL-API-05]` · `test_self_improve.py::test_skill_route`.
**Rollback** Remove router include.

#### T-029 — Scheduled scoring in lifespan  ·  BE  ·  1.0 ed  ·  S2
**Sub-tasks** append resolve+score to the JARVIS lifespan loop after ingest (extends T-007).
**DoD** loop runs ingest→resolve→score→reweight continuously when enabled.
**Gating tests** `[§11 TC-SCORE-01]` (loop integration) · `test_self_improve.py::test_loop_step`.
**Risk → mitigation** Long scoring blocks loop → cap batch size per cycle.
**Rollback** Drop the scoring step from the loop body.

#### T-030 — P3 test suite  ·  QA  ·  2.5 ed  ·  S2
DoD: scoring/drift/reweight/backtest all covered; AC-P3-1..5 green. **Rollback** additive.

---

### PHASE P4 — RELATIONAL / KGIK / CAUSAL

#### T-031 — Granger screen  ·  DS  ·  2.5 ed  ·  S3
**Sub-tasks** VAR-based multi-lag F-test between Lake pairs; BH multiple-comparison correction; `statsmodels` pinned.
**DoD** recovers known driver→target (p<0.05 post-BH); rejects independent pair (FPR controlled).
**Gating tests** `[§11 TC-GRANGER-01]` · `test_causal.py::test_granger`.
**Risk → mitigation** Nonstationarity → difference/ADF pre-check before VAR.
**Rollback** `causal.py` standalone; report-only.

#### T-032 — CCM  ·  DS  ·  2.5 ed  ·  S3
**Sub-tasks** convergent cross mapping; skill-vs-library-size convergence; reject independent pair.
**DoD** convergence for coupled system; flat for independent.
**Gating tests** `[§11 TC-CCM-02]` · `test_causal.py::test_ccm`.
**Risk → mitigation** Short series → min-length guard + convergence requirement (not single point).
**Rollback** Standalone.

#### T-033 — Surface causal results + persist beliefs  ·  BE/DS  ·  2.0 ed  ·  S2
**Sub-tasks** add drivers/assumptions to predict output; write cause→effect to DB `CausalBelief` (Laplace-smoothed) via bridge to `underworld/server/db/models.py:CausalBelief`.
**DoD** causal drivers appear in `/functions/predict`; beliefs persisted.
**Gating tests** `[§11 TC-CAUSAL-ANSWER-05]` · `test_causal.py::test_drivers_in_answer`.
**Risk → mitigation** False positives leak into answers → only screen results passing BH+CCM convergence; mark as "screen, not proof".
**Rollback** Drop the drivers block from response; skip belief write.

#### T-034 — Temporal link-prediction (lightweight)  ·  DS/MLE  ·  3.0 ed  ·  S3
**Sub-tasks** time-decayed co-occurrence / embedding scorer over confirmed patterns; rank likely future edges; GPU path deferred to P5 (T-041).
**DoD** ranks planted future edge in top-k on synthetic temporal graph.
**Gating tests** `[§11 TC-LINKPRED-04]` · `test_relational.py::test_linkpred_topk`.
**Risk → mitigation** Heavy GNN scope creep → explicitly bounded to time-decayed scorer, no training.
**Rollback** Standalone scorer.

#### T-035 — Pattern→KGIK promotion  ·  BE  ·  2.5 ed  ·  S3
**Sub-tasks** high-skill confirmed patterns → typed `Edge`s via `knowledge_graph.py` (`Node/Edge/EdgeKind`), stamped `ConfidenceClass`; update edge strengths from realized skill; reuse `temporal_nodes.causal_chain` for chains.
**DoD** confirmed pattern becomes a valid typed KG edge with a valid `ConfidenceClass`.
**Gating tests** `[§11 TC-KG-PROMOTE-03]` · `test_relational.py::test_kg_promotion`.
**Risk → mitigation** KG schema drift in UNDERWORLD → bridge through public `KnowledgeGraph` API only, not internals.
**Rollback** Promotion is write-only to KG; skip the write to revert (no read-path dependency in P4 answers).

#### T-036 — P4 test suite  ·  QA  ·  3.0 ed  ·  S2
DoD: Granger/CCM/promotion/linkpred all covered; AC-P4-1..5 green. **Rollback** additive.

---

### PHASE P5 — FOUNDATION-MODEL & GPU TIER

#### T-037 — UNDERWORLD bridge client (+ new UW route)  ·  BE/PL  ·  2.5 ed  ·  S4
**Sub-tasks**
- T-037.0 **New UW route** `POST /science/method-run` in `underworld/server/routes/science.py`, guarded by the existing `Depends(require_bearer)`, calling `methods_registry.run(field, seed=...)`.
- T-037.1 JARVIS `underworld_bridge.py`: httpx client, base URL `config.UNDERWORLD_URL`, timeout + circuit-breaker + small TTL cache.
- T-037.2 Methods: `run_method(field,seed)`, `available_backends()`, KG helpers.

**Interface**
```python
# UNDERWORLD routes/science.py
@router.post("/method-run")
async def method_run(body: MethodRunRequest, _t=Depends(require_bearer)): ...
# JARVIS services/underworld_bridge.py
def run_method(field: str, seed: int = 0) -> dict | None
def available_backends() -> dict
```
**DoD checklist**
- [ ] New UW route returns `methods_registry.run(...)` and uses `require_bearer`.
- [ ] Bridge has timeout + breaker + cache; breaker opens on repeated failure.
- [ ] `UNDERWORLD_URL` configurable; unset ⇒ bridge disabled gracefully.

**Gating tests** `[§11 TC-BRIDGE-03]` · `test_bridge.py::{test_run_method,test_breaker}`.
**Risk → mitigation** Two processes / network between backends → breaker + cache + graceful degrade (engine works without bridge).
**Rollback** Remove the new UW route + delete bridge client; no JARVIS feature hard-depends on it (drift can import `ai_models` directly).

#### T-038 — Method routing into answers  ·  BE  ·  2.0 ed  ·  S2
**Sub-tasks** orchestrator routes a sub-task to a registry method via bridge; folds result into the answer.
**DoD** a registry method result appears in an answer when bridge available; absent gracefully when not.
**Gating tests** `[§11 TC-BRIDGE-03]` (routing) · `test_bridge.py::test_method_routing`.
**Risk → mitigation** Latency from cross-backend call → cache + only route when value-adding.
**Rollback** Disable routing flag.

#### T-039 — Remote FM inference client  ·  MLE  ·  2.5 ed  ·  S3
**Sub-tasks** POST series → TimesFM/Chronos (point+quantiles) behind `PREDICT_GPU_URL`; unset ⇒ silent CPU fallback; breaker+timeout (NFR-10).
**DoD** mock URL returns quantiles; unset ⇒ identical CPU path (no crash/latency cliff).
**Gating tests** `[§11 TC-FM-ENSEMBLE-01]`, `[§11 TC-FALLBACK-02]` · `test_gpu_client.py::{test_remote,test_fallback}`.
**Risk → mitigation** Endpoint down → breaker + fallback (AC-P5-2).
**Rollback** Unset `PREDICT_GPU_URL`.

#### T-040 — FM as ensemble member  ·  DS/MLE  ·  2.0 ed  ·  S3
**Sub-tasks** add FM forecaster as ensemble member (weight learned by P3 reweighting); quantiles feed conformal/ensemble.
**DoD** FM influences blended output when enabled.
**Gating tests** `[§11 TC-FM-ENSEMBLE-01]` · `test_gpu_client.py::test_fm_in_ensemble`.
**Risk → mitigation** FM dominates/destabilizes → clamp via T-014 bounds + reweighting.
**Rollback** Remove FM from member set.

#### T-041 — CuPy acceleration  ·  MLE  ·  2.5 ed  ·  S3
**Sub-tasks** route heavy ops (GBM-MC paths, MP feature math) through `gpu_backend.get_backend().xp`; auto-fallback to NumPy; bench via `scale_bench`.
**DoD** CuPy path == NumPy within 1e-6 (forced-numpy parity); no GPU ⇒ NumPy.
**Gating tests** `[§11 TC-GPU-PARITY-04]` · `test_gpu_client.py::test_numpy_parity`.
**Risk → mitigation** No GPU in CI → forced-numpy backend parity test is the gate.
**Rollback** Force `prefer="numpy"`.

#### T-042 — License/patent register  ·  GOV  ·  1.0 ed  ·  S2
**Sub-tasks** confirm Apache-2.0 (TimesFM/Chronos), STUMPY/HDBSCAN/ruptures/statsmodels licenses, EWE patent (WO2014075108A2) expiry; record in `12_SECURITY_GOVERNANCE_LEGAL.md`.
**DoD** register complete + GOV-signed.
**Gating tests** `[§11 TC-LICENSE-05]` (doc gate).
**Rollback** Doc-only.

#### T-043 — P5 test suite  ·  QA  ·  2.5 ed  ·  S2
DoD: remote/fallback/breaker/parity all covered; AC-P5-1..5 green. **Rollback** additive.

---

### PHASE P6 — HARDENING

#### T-044 — Metrics + `/metrics`  ·  SRE  ·  2.5 ed  ·  S3
**Sub-tasks** per-stage latency, ingest success rate, coverage, CRPS, drift flags, breaker state; expose Prometheus-style `/metrics` on JARVIS.
**DoD** `/metrics` renders; dashboards consume it.
**Gating tests** `[§11 TC-OBS-01]` · `test_routes.py::test_metrics_endpoint`.
**Rollback** Remove `/metrics` include.

#### T-045 — SLOs + alerts  ·  SRE  ·  1.5 ed  ·  S3
**Sub-tasks** availability, predict p95, ingest-freshness, coverage-floor; alert rules + dashboards; document §11/§12.
**DoD** SLOs defined; synthetic breach fires alert.
**Gating tests** `[§11 TC-SLO-02]`. **Rollback** doc/config.

#### T-046 — Runbooks + rollback switches  ·  SRE  ·  1.5 ed  ·  S2
**Sub-tasks** runbooks for feed outage, breaker open, drift alarm, bad deploy; kill-switches for GPU/bridge/ingest (the `*_ENABLED`/`PREDICT_GPU_URL`/`UNDERWORLD_URL` flags from earlier tasks).
**DoD** each runbook has a tested kill-switch/rollback path.
**Gating tests** `[§11 TC-RUNBOOK-03]`. **Rollback** doc.

#### T-047 — Governance sign-off  ·  GOV  ·  2.0 ed  ·  S3
**Sub-tasks** authz on `/patterns/scan`, `/predict/skill`, `/metrics`; Lake data governance/retention; PII review (none expected).
**DoD** routes' authz reviewed; retention documented; GOV-signed.
**Gating tests** part of `[§11 TC-TRACE-04]`. **Rollback** tighten flags.

#### T-048 — Traceability matrix  ·  PL/QA  ·  2.0 ed  ·  S3
**Sub-tasks** FR/NFR → file → T-ID → §11 TC-ID matrix proving 100% coverage (see §24 of this file as the canonical instance).
**DoD** every FR/NFR maps to ≥1 component, ≥1 task, ≥1 passing test.
**Gating tests** `[§11 TC-TRACE-04]`. **Rollback** doc.

#### T-049 — FMEA closure + E2E acceptance  ·  QA/PL  ·  2.0 ed  ·  S4
**Sub-tasks** run full §11 suite across all phases; close FMEA top risks; sign the gate.
**DoD** full suite green E2E; FMEA mitigations recorded.
**Gating tests** `[§11 TC-E2E-05]`. **Rollback** N/A (final gate).

---

## 17. GANTT-STYLE MILESTONE SCHEDULE (ASCII)

13-week nominal calendar (W1–W13), Mon-start weeks; `█`=active, `▒`=buffer/slack, `◆`=milestone exit gate. Role-parallel per §10 staffing (2 BE, 2 DS, 1 MLE, 1 DE, 1 QA; fractional PL/SRE/GOV).

```
TASK / WEEK      W1  W2  W3  W4  W5  W6  W7  W8  W9  W10 W11 W12 W13
P0 T001-003(DE)  ██  ██   .   .   .   .   .   .   .   .   .   .   .
P0 T004-007(BE)  ██  ██   .   .   .   .   .   .   .   .   .   .   .
P0 T008-010(BE/QA) .  ██   .   .   .   .   .   .   .   .   .   .   .
   ◆ M1 Lake live      ◆
P1 T011-013(DS)   .   .  ██  ██   .   .   .   .   .   .   .   .   .
P1 T014-015(DS/BE).   .  ██  ██   .   .   .   .   .   .   .   .   .
P1 T016(DS,start) ██  ..  ..   .   .   .   .   .   .   .   .   .   .
P1 T017(QA)       .   .   .  ██   .   .   .   .   .   .   .   .   .
   ◆ M2 Calibrated            ◆
P2 T018-021(DS)   .   .   .  ██  ██  ██   .   .   .   .   .   .   .
P2 T022-023(BE/QA).   .   .   .  ██  ██   .   .   .   .   .   .   .
   ◆ M3 Discovery                     ◆
P3 T024-027(DS/MLE).  .   .   .   .  ██  ██  ██   .   .   .   .   .
P3 T028-030(BE/QA).   .   .   .   .   .  ██  ██   .   .   .   .   .
   ◆ M4 Loop closed                           ◆
P4 T031-033(DS)   .   .   .   .   .   .   .  ██  ██  ██   .   .   .
P4 T034-036(DS/QA).   .   .   .   .   .   .   .  ██  ██   .   .   .
   ◆ M5 Relational                                    ◆
P5 T037 contract  ██  ..   .   .   .   .   .   .   .   .   .   .   .   (start-now design)
P5 T037-038(BE)   .   .   .   .   .   .  ██  ██   .   .   .   .   .
P5 T039-041(MLE)  .   .   .   .   .   .  ██  ██  ██  ██  ██   .   .
P5 T042(GOV)      ██  ..   .   .   .   .   .   .   .   .   .   .   .
P5 T043(QA)       .   .   .   .   .   .   .   .   .   .  ██   .   .
   ◆ M6 GPU/FM tier                                            ◆
P6 T044-046(SRE)  .   .   .   .   .   .   .   .   .   .  ██  ██   .
P6 T047(GOV)      .   .   .   .   .   .   .   .  ██  ██   .   .   .
P6 T048-049(PL/QA).   .   .   .   .   .   .   .   .   .   .  ██  ██
   ◆ M7 Hardened                                                       ◆
BUFFER (risk §13) .   .   .   .   .   .   .   .   .   .   .  ▒▒  ▒▒  ▒▒  (+~2wk → ~W15)
```

**Reading notes.** Start-now tasks (T-016, T-037-contract, T-042) consume W1 idle capacity off the critical path. P2 overlaps P1 (W4–W6). P5 engineering starts W7 in parallel and is the longest single track (T-039→T-041, 5 weeks) but is *not* on the calendar critical path because it gates only its own milestone M6, not P6's traceability gate. The risk buffer (§13, ~2 wk) pushes worst-case M7 to ~W15.

---

## 18. CRITICAL-PATH ANALYSIS WITH SLACK

**Critical path (CP):** `T-001→T-002→T-003 → T-008 → T-011→T-013 → T-024→T-026 → T-034→T-035 → T-048→T-049`. This is the longest dependent chain; any slip propagates 1:1 to M7.

| CP node | Earliest start (day) | Duration (ed) | Earliest finish | Latest finish | Slack (ed) |
|---|---|---|---|---|---|
| T-001 | 0 | 1.5 | 1.5 | 1.5 | 0 |
| T-002 | 1.5 | 2.0 | 3.5 | 3.5 | 0 |
| T-003 | 3.5 | 2.0 | 5.5 | 5.5 | 0 |
| T-008 | 5.5 | 1.5 | 7.0 | 7.0 | 0 |
| T-011 | 7.0 | 2.5 | 9.5 | 9.5 | 0 |
| T-013 | 9.5 | 1.5 | 11.0 | 11.0 | 0 |
| T-024 | 11.0 | 2.5 | 13.5 | 13.5 | 0 |
| T-026 | 13.5 | 2.0 | 15.5 | 15.5 | 0 |
| T-034 | 15.5 | 3.0 | 18.5 | 18.5 | 0 |
| T-035 | 18.5 | 2.5 | 21.0 | 21.0 | 0 |
| T-048 | 21.0 | 2.0 | 23.0 | 23.0 | 0 |
| T-049 | 23.0 | 2.0 | 25.0 | 25.0 | 0 |

**Near-critical (low-slack) chains.**
| Chain | Total slack (ed) | Note |
|---|---|---|
| P2: T-018→T-022→T-023 | ~5 | Overlaps P1; becomes critical if P1 finishes early. |
| P5 eng: T-039→T-040→T-041→T-043 | ~3 | Longest single track; protected by flag-gating + fallback. |
| P3: T-024→T-027 (backtest) | ~4 | Off-CP (CP uses T-026), but feeds AC-P3-4. |
| P4 causal: T-031→T-032→T-033 | ~2 | Parallel to T-034→T-035 (the CP branch). |

**Float-consuming risks (from §13).** Cold-start coverage (T-011/T-012, +2 ed buffer), feed flakiness (T-006, +2), bridge UW-route prereq (T-037, +2 — *mitigated by start-now*), reweight instability (T-026, +1). Because T-011 and T-026 are *on* the CP, their buffers directly extend M7; T-037's buffer does **not** (off-CP) — hence the start-now mandate.

**Recommended CP protection.** (1) Begin T-001 and T-016 day 0. (2) Land T-037's UW route in W1 (start-now) to keep P5 off the CP. (3) Gate-review at M2 and M4 (both CP milestones) before committing downstream capacity.

---

## 19. RESOURCING / STAFFING PLAN

**Team (8.6 FTE peak).**
| Role | Count | Loaded across | Peak weeks |
|---|---|---|---|
| BE (backend) | 2 | P0,P1-wire,P2-route,P3-route,P5-bridge | W1–W8 |
| DS (forecast/algos) | 2 | P1,P2,P3,P4 numerics | W3–W10 |
| MLE (MLOps/GPU) | 1 | P3 drift/backtest, P5 FM/GPU | W6–W11 |
| DE (data eng) | 1 | P0 only (then 0.2 advisory) | W1–W2 |
| QA | 1 | every phase test suite | W2–W13 |
| PL (lead) | 0.5 | contracts, CP, sign-offs | continuous |
| SRE | 0.5 | P6 obs/SLO/runbooks | W9–W13 |
| GOV | 0.3 | T-042, T-047 | W1, W9–W10 |

**Loading curve (FTE active by week).**
```
FTE  W1  W2  W3  W4  W5  W6  W7  W8  W9  W10 W11 W12 W13
 9         x   x   x   x   x
 8     x       x   x   x   x   x   x
 6 x               x   x   x   x   x   x   x
 4 x                                       x   x   x
```
**Staffing notes.** DE is front-loaded (P0) then drops to advisory — reassign to QA-pairing in mid-program. MLE joins at W6 (P3) so onboarding overlaps low-CP work. PL/GOV/SRE are fractional and shared; protect PL's 0.5 FTE for CP gate reviews at M1/M2/M4/M7. Single points of failure: **DE** (only P0 owner) and **MLE** (only GPU/FM owner) — cross-train one BE on the Lake and one DS on the GPU client to remove bus-factor-1.

**Onboarding ramp.** New engineers start on a start-now task (T-016 skill lib or T-042 license register) to learn the codebase before touching the CP.

---

## 20. INTER-PHASE INTEGRATION TEST PLAN

Beyond per-task unit/AC tests, these **seam tests** verify phase boundaries. They live in `server/tests/test_integration_*.py` and run in CI after each phase merges.

| Integration ID | Seam | Scenario | Pass criterion | Tests after |
|---|---|---|---|---|
| **IT-P0×P1** | Lake → conformal | Persisted outcomes feed EnbPI residuals (T-012) | Warm-path coverage ≥ cold-path; residuals sourced from `outcome` | P1 |
| **IT-P0×P2** | Lake → patterns | `/patterns/scan` reads a real Lake series end-to-end | Report returns motifs/regimes on ingested data | P2 |
| **IT-P1×P3** | Ensemble ↔ reweight | Realized errors update EW weights; bad member demoted | Weight delta matches scored errors (AC-P3-3) | P3 |
| **IT-P0×P3 loop** | Full lifespan loop | ingest→resolve→score→reweight in one lifespan cycle | All four steps observable in one cycle (no deadlock) | P3 |
| **IT-P2×P4** | Lead-lag → causal/KG | Lead-lag pair → Granger/CCM → KG promotion | Confirmed pair promoted to typed KG edge | P4 |
| **IT-P3×P4** | Skill → KG strength | Realized skill updates promoted edge strengths | Edge strength tracks skill rollup | P4 |
| **IT-P1×P5** | FM → ensemble/conformal | Mock FM quantiles enter blend + conformal | Blended output shifts; coverage still in-band | P5 |
| **IT-JARVIS×UW bridge** | Cross-backend | Bridge calls UW `/science/method-run`; breaker on outage | Result folded in when up; graceful degrade when down (AC-P5-3) | P5 |
| **IT-E2E** | All phases | One question → predict→persist→resolve→score→pattern→causal→metrics | Full chain green; `/metrics` reflects activity (AC-P6-5) | P6 |

**Two-backend integration harness.** A `docker-compose`/process pair starts JARVIS (`uvicorn server.main:app`) and UNDERWORLD (`uvicorn underworld.server.main:app`) with `UNDERWORLD_URL` pointed at the latter; `IT-JARVIS×UW` runs against the live pair, and a "UW down" variant kills UNDERWORLD to assert breaker behavior.

---

## 21. ENVIRONMENT / INFRASTRUCTURE PROVISIONING

**Environments.** `dev` (laptop), `ci` (GitHub Actions), `staging` (single VM, both backends), `prod` (both backends + remote GPU optional).

### 21.1 Provisioning steps (staging/prod, both backends)
1. **Host prep** — Python 3.11+, `python -m venv`, install `server/requirements.txt` (now incl. `pyarrow`, `stumpy`, `hdbscan`, `ruptures`, `statsmodels`) and UNDERWORLD requirements.
2. **Lake storage** — create `server/data/` (exists in repo); set `HISTORY_LAKE_PATH` to a persistent volume; enable nightly Parquet cold export (T-002) + offsite copy.
3. **Config/env** — set `JARVIS_API_KEY`, `JARVIS_REQUIRE_AUTH` (true in prod), `INGEST_ENABLED=true`, `INGEST_INTERVAL_S`, `UNDERWORLD_URL`, optionally `PREDICT_GPU_URL`, `KIMI_*`.
4. **Process mgmt** — run JARVIS `uvicorn server.main:app` and UNDERWORLD `uvicorn underworld.server.main:app` under systemd/supervisor; JARVIS lifespan (T-007) drives ingest+scoring.
5. **Network** — JARVIS→UNDERWORLD reachable on `UNDERWORLD_URL`; JARVIS→USGS/CoinGecko/er-api egress allowed; optional JARVIS→`PREDICT_GPU_URL`.
6. **GPU tier (optional)** — provision the remote FM/CuPy host; UNDERWORLD `gpu_backend` reports availability via `available_backends()`; leave unset to stay CPU.
7. **Observability** — scrape JARVIS `/metrics` (T-044); wire alert rules (T-045).
8. **Secrets** — API keys via env/secret store, never committed.

### 21.2 CI provisioning (GitHub Actions)
- Matrix: install full requirements; run `pytest server/tests` with `INGEST_ENABLED=false` and **all external HTTP mocked**.
- Force-disable optional deps in a second job to exercise NumPy fallbacks (T-018/T-019/T-020) and CPU fallback (T-039/T-041).
- Two-backend job (P5+) spins both apps for `IT-JARVIS×UW`.

### 21.3 Infra acceptance checklist
- [ ] Persistent Lake volume survives restart (durability NFR-01).
- [ ] Both backends start under process manager; JARVIS lifespan loop active.
- [ ] No external write deps in dev/CI (NFR-08); all feeds mockable.
- [ ] Kill-switch flags settable without redeploy (`*_ENABLED`, URLs).

---

## 22. CUTOVER / LAUNCH RUNBOOK

**Goal.** Promote staging→prod with zero data loss and instant rollback. Sequenced, each step has a verify + abort.

| Step | Action | Verify | Abort/rollback |
|---|---|---|---|
| C0 | Freeze: tag release, snapshot Lake DB + Parquet | snapshot checksum recorded | n/a |
| C1 | Deploy UNDERWORLD (incl. new `/science/method-run`, T-037) | `/healthz` 200; `/science/method-run` returns a result under `require_bearer` | redeploy prior tag |
| C2 | Deploy JARVIS with `INGEST_ENABLED=false`, `CONFORMAL/ENSEMBLE` on, GPU/bridge **off** | `/` ok; `/functions/predict` returns `forecast_id` | redeploy prior tag |
| C3 | Smoke: one predict → confirm `forecast` row persisted | row in `forecast` table | flip `LAKE_PERSIST=false`; investigate |
| C4 | Enable ingest (`INGEST_ENABLED=true`) | first `ingest_once` summary logged; series rows grow | set `INGEST_ENABLED=false` |
| C5 | Enable scoring loop (T-029) | outcomes resolved+scored in a cycle | drop scoring step / flag off |
| C6 | Enable bridge (`UNDERWORLD_URL` set) | `IT-JARVIS×UW` green; breaker closed | unset `UNDERWORLD_URL` |
| C7 | (Optional) Enable GPU/FM (`PREDICT_GPU_URL`) | FM enters ensemble; fallback verified by toggling | unset `PREDICT_GPU_URL` (silent CPU) |
| C8 | Enable `/metrics`, `/patterns/scan`, `/predict/skill` authz | endpoints respond per `JARVIS_REQUIRE_AUTH` | remove router includes |
| C9 | Run full §11 E2E suite against prod-shadow | AC-P6-5 green | hold launch; rollback to C0 snapshot |
| C10 | Announce GA; start 72h heightened watch | dashboards nominal | progressive flag-off per §23 |

**Cutover principles.** Feature-flag everything (every risky capability has an env switch from its task). Lake DB is append/upsert-only and snapshotted at C0, so rollback never loses persisted history. Bridge/GPU are last and independently revertible because nothing hard-depends on them.

---

## 23. POST-LAUNCH OPERATIONS PLAN

**Operating rhythm.** Continuous lifespan loop (ingest→resolve→score→reweight) + scheduled backtests + on-call SRE.

### 23.1 SLOs & alerts (from T-045)
| SLO | Target | Alert |
|---|---|---|
| Availability (`/functions/predict`) | ≥99.5% | page on 2 consecutive failed health checks |
| Predict latency p95 | < budget (NFR-04 sibling) | warn at p95×1.5 |
| Ingest freshness | gap ≤ 2× interval/source | warn on stale feed (links to T-006 isolation) |
| Coverage floor | empirical ∈ [0.85,0.95] | page if coverage < 0.80 over rolling window |
| Drift | PSI ≤ 0.2 | warn on PSI>0.2 (T-025), auto widen intervals |
| Bridge/breaker | closed | warn on breaker open (T-037) |

### 23.2 Runbooks (from T-046)
- **Feed outage** → per-source isolation already keeps others alive (AC-P0-5); if persistent, fall back to last-good cache; alert if all feeds stale.
- **Breaker open (bridge/GPU)** → engine degrades to CPU/in-process; confirm fallback path; investigate UW/GPU host; re-close breaker.
- **Drift alarm** → widen conformal intervals + flag affected domain/method; trigger off-cycle backtest; consider reweight reset.
- **Coverage breach** → switch conformal to bootstrap residuals; widen α; open incident.
- **Bad deploy** → flag-off new capability; redeploy prior tag; restore C0 Lake snapshot only if corruption (rare; upsert-only design).

### 23.3 Maintenance cadence
| Cadence | Activity | Owner |
|---|---|---|
| Continuous | lifespan loop (ingest/score/reweight) | system |
| Daily | Parquet cold export + offsite copy; metric review | SRE |
| Weekly | walk-forward backtest report (T-027); skill review | MLE/DS |
| Monthly | drift/calibration audit (PSI/ECE); KG edge-strength review | MLE/DS |
| Quarterly | license/patent re-check (T-042); dependency upgrade; DR restore drill | GOV/SRE |

### 23.4 Capacity & retention
- Lake retention: hot SQLite rolling window + Parquet cold archive (T-002); prune `series` beyond retention after archive.
- Scale: when SQLite contention appears, promote to Postgres/Timescale (UNDERWORLD already uses SQLAlchemy models — reuse the DB layer pattern in `underworld/server/db/`).

### 23.5 Continuous improvement loop (ties P3↔P4)
Realized skill → reweighting (T-026) → confirmed patterns → KG promotion + edge-strength updates (T-035) → better drivers in answers (T-033). Reviewed monthly; regressions roll back via flags, never via data deletion.

---

## 24. FR/NFR → COMPONENT → TASK → TEST MATRIX (canonical instance of T-048)

> Full bidirectional traceability. Every FR/NFR maps to ≥1 component (real file), ≥1 task, ≥1 §11 test. This is the artifact T-048 maintains and T-049/AC-P6-4 verifies.

| Req | Description | Component (real path) | Task(s) | Test ID(s) |
|---|---|---|---|---|
| FR-01 | Persist world data | `server/services/history_lake.py`, `ingestion.py` | T-001..T-007 | TC-LAKE-INGEST-01, TC-INGEST-ISOLATION-05 |
| FR-02 | Persist forecasts+outcomes | `history_lake.py`, `routes/predict.py` | T-003,T-008,T-009 | TC-FCAST-PERSIST-03, TC-OUTCOME-04 |
| FR-03 | Calibrated intervals | `services/conformal.py` | T-011,T-012,T-013 | TC-CONF-COVERAGE-01, TC-FCAST-SCHEMA-04 |
| FR-04 | Multi-model ensemble | `services/ensemble.py`, `prediction.py` | T-014,T-015 | TC-ENS-SKILL-02 |
| FR-05 | Skill metrics | `services/skill.py` | T-016 | TC-SKILL-NUM-03 |
| FR-06 | Motif/anomaly | `services/pattern_engine.py` | T-018 | TC-MP-MOTIF-01 |
| FR-07 | Regime detection | `pattern_engine.py` | T-019 | TC-HDBSCAN-REGIME-02 |
| FR-08 | Change-points | `pattern_engine.py` | T-020 | TC-CPD-03 |
| FR-09 | Lead-lag | `pattern_engine.py` | T-021 | TC-LEADLAG-04 |
| FR-10 | `/patterns/scan` API | `routes/patterns.py` | T-022 | TC-PATTERNS-API-05 |
| FR-11 | Continuous scoring | `services/self_improve.py` | T-024,T-029 | TC-SCORE-01 |
| FR-12 | Drift detection | `self_improve.py` + UW `ai_models.py` | T-025 | TC-DRIFT-02 |
| FR-13 | Online re-weighting | `ensemble.py`,`self_improve.py` | T-026 | TC-REWEIGHT-03 |
| FR-14 | Backtesting | `self_improve.py`/`tools/backtest.py` | T-027 | TC-BACKTEST-04 |
| FR-15 | `/predict/skill` API | `routes/skill.py` | T-028 | TC-SKILL-API-05 |
| FR-16 | Temporal link-pred | `services/relational.py` | T-034 | TC-LINKPRED-04 |
| FR-17 | Pattern→KG promotion | `relational.py` + UW `knowledge_graph.py` | T-035 | TC-KG-PROMOTE-03 |
| FR-18 | Granger screen | `services/causal.py` | T-031 | TC-GRANGER-01 |
| FR-19 | CCM | `causal.py` | T-032 | TC-CCM-02 |
| FR-20 | Causal in answers | `prediction.py`,`causal.py` + UW `CausalBelief` | T-033 | TC-CAUSAL-ANSWER-05 |
| FR-21 | FM forecasts | `services/gpu_client.py` | T-039,T-040 | TC-FM-ENSEMBLE-01 |
| FR-22 | Registry bridge (464) | `services/underworld_bridge.py` + UW `routes/science.py` | T-037,T-038 | TC-BRIDGE-03 |
| FR-23 | GPU acceleration | `prediction.py`,`pattern_engine.py` + UW `gpu_backend.py` | T-041 | TC-GPU-PARITY-04 |
| NFR-01 | Durability | `history_lake.py` (WAL+Parquet) | T-002 | TC-LAKE-IDEMP-02 |
| NFR-02 | Coverage tolerance | `conformal.py` | T-011 | TC-CONF-COVERAGE-01 |
| NFR-03 | Determinism | `conformal.py`,`ensemble.py` | T-011,T-014 | TC-DETERMINISM-05 |
| NFR-04 | Scan latency | `pattern_engine.py`,`routes/patterns.py` | T-022 | TC-PATTERNS-API-05 |
| NFR-05 | Idempotent ingest | `history_lake.py` | T-003 | TC-LAKE-IDEMP-02 |
| NFR-06 | Bounded re-weight | `self_improve.py` | T-026 | TC-REWEIGHT-03 |
| NFR-07 | Bounded graph ops | `relational.py` | T-034,T-035 | TC-LINKPRED-04, TC-KG-PROMOTE-03 |
| NFR-08 | No external write deps (dev) | tests/config | T-007,T-010 | TC-LAKE-INGEST-01 |
| NFR-09 | CPU fallback | `gpu_client.py`,`pattern_engine.py` | T-039,T-041 | TC-FALLBACK-02 |
| NFR-10 | Timeout/breaker | `underworld_bridge.py`,`gpu_client.py` | T-037,T-039 | TC-BRIDGE-03 |
| NFR-11 | License/patent | `12_SECURITY_GOVERNANCE_LEGAL.md` | T-042 | TC-LICENSE-05 |
| NFR-12 | Observability | `services/observability.py` | T-044 | TC-OBS-01 |
| NFR-13 | SLOs/availability | §11/§12 | T-045 | TC-SLO-02 |
| NFR-14 | Governance sign-off | `12_SECURITY_GOVERNANCE_LEGAL.md` | T-047 | TC-TRACE-04 |
| NFR-15 | Traceability | this §24 | T-048 | TC-TRACE-04 |
| NFR-16 | Rollback/runbook | §22, §23, `12_...` | T-046 | TC-RUNBOOK-03 |

**Coverage assertion (AC-P6-4 / TC-TRACE-04):** every row above resolves to a real or NEW-marked component path, a defined task, and a §11 test ID — 23 FR + 16 NFR = 39 requirements, 49 tasks, 1:1+ test coverage. T-049 executes the union of all TC-IDs as the E2E gate (TC-E2E-05).

---

## 25. EXPANSION CHANGE-LOG

- **v2 (depth milestone):** Added Part B — per-task execution dossier (T-001…T-049 cards with sub-tasks, interfaces/DDL, DoD, gating tests, effort+skill, risk+mitigation, rollback), ASCII Gantt (§17), critical-path slack table (§18), staffing/loading plan (§19), inter-phase integration test plan (§20), infra provisioning (§21), cutover runbook (§22), post-launch ops (§23), full FR/NFR→component→task→test matrix (§24). Folded in repo-verified reality corrections (FX feed = `open.er-api.com`; JARVIS `main.py` has no lifespan yet; new UW route must use `require_bearer`). Part A (§0–§15) preserved verbatim.
