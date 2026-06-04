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
