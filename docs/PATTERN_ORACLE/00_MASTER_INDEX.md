# PATTERN ORACLE — Master Design & Execution Specification
**Codename:** PATTERN ORACLE (the "ask-and-predict-anything" engine inside APEX)
**Document class:** Master Engineering Spec · military-grade · ISO-level execution detail
**Status:** living document, expanded iteratively (v1 → v150). This index is the spine; each section file is expanded to execution depth by its author pass.
**Owner:** APEX / KGIK prediction program.

---

## 0. WHAT THIS IS
A single, grounded, execution-ready specification for a **world-scale, self-improving prediction engine**: the user asks *anything* in natural language; the system pulls **real world-model data**, **discovers patterns** between the world and the requested target (and the historical patterns between those), forecasts with **calibrated uncertainty**, and **continuously improves its own predictive skill** by scoring every forecast against reality. It replicates the *behaviour* of the most advanced systems in the world (foundation time-series transformers, temporal graph networks, ensemble + conformal calibration, numerical-weather-style data-assimilation/ensemble loops) — at the scale our real infrastructure supports, with honest uncertainty and no invented capability.

**Non-negotiables**
- **Grounded, not invented.** Every technique traces to a cited model/paper/patent (see `03_EVIDENCE_BASE.md`) or to existing audited code (see `02_CURRENT_STATE_AUDIT.md`).
- **Calibrated honesty.** Every answer carries a confidence interval and/or probability + assumptions + caveats. Forecast skill is bounded by information theory; we quantify uncertainty, never fake precision.
- **Self-improving.** Predictions and realized outcomes are persisted; skill is back-tested continuously; models are re-weighted/retrained; the KGIK graph learns new edges from confirmed patterns.

---

## 1. GROUNDING SUMMARY (the two audits this spec is built on)

### 1.1 What ALREADY exists in this repo (from the exhaustive code audit — `02_CURRENT_STATE_AUDIT.md`)
- **Flagship predictor:** `server/services/prediction.py` (1147 lines) — GBM Monte-Carlo + Holt, Gutenberg-Richter/Omori, great-circle/orbital/ballistic, exp/logistic; live at `POST /functions/predict` → `src/pages/PredictionOracle.jsx`.
- **Temporal networks (real, dormant):** `underworld/server/services/temporal_nodes.py` — `TemporalNode`, `causal_chain`, `counterfactual_fork`, `competing_theory_clusters`. **TCIS** UI (`src/pages/TCIS.jsx`) timeline. `epidemic_network.py` — Watts-Strogatz temporal graph + agent-SIR + ensemble.
- **Clusters / graph analytics:** `methods_cs_ai.kmeans_clustering`, `disease_models.symptom_clustering`, `sim_methods.upgma`, `graph_extras` (PageRank), `knowledge_graph.py` (typed graph, prerequisites/novelty, confidence ladder, wired to `/worlds/{id}/knowledge-graph`).
- **Learning / optimization:** `ai_model.py` (sklearn RF/GB/MLP on the real 1030-row Yeh concrete dataset), `real_optimizer.py` (Bayesian GP, Matérn-5/2, EI/UCB; wired to `/optimize`), `ai_models.py` (**PSI drift, ECE calibration, ensemble uncertainty — ready-made building blocks**), `neural.py` (per-Minion MLP).
- **Method library:** `methods_registry.py` → **~464 verified methods across 58 domains**; `field_science.simulate()` + `sim_methods.py` (35 named simulations).
- **Compute:** `gpu_backend.py` (CuPy↔NumPy drop-in), `scale_bench.py` (1M–10M-minion GPU throughput projections; wired to `/worlds/scale-capacity`).
- **Persistence (history retained):** `underworld/server/db/models.py` — `PopulationSnapshot` (per-tick time series), `Event`, `CausalBelief` (Laplace-smoothed cause→effect), `MLModel`, etc. Real datasets: `concrete.csv`, `knowledge_base.json`.
- **LLM routing:** Kimi K2 (`_kimi_extract` in prediction.py; `oracle.py`).

### 1.2 Honest gaps the engine must close
1. No **learned** time-series / temporal-DL / GNN models (only closed-form forecasters). 
2. No **embeddings / vector store / similarity** substrate.
3. No prediction→outcome **self-improvement loop** on the JARVIS side (predictions are stateless; 5-min cache, no DB).
4. The two backends are **disjoint** — the JARVIS predictor can't reach the 464-method registry / optimizer / temporal_nodes.
5. **"Causal" is asserted, not discovered** (hand-authored ontology, no Granger/PC/NOTEARS).
6. No persistent **world-data History Lake** (USGS/CoinGecko/FX cached 60s–5min only).
7. CuPy/torch/Ray referenced but **not installed**; no distributed workers.

### 1.3 What to replicate first (from the cited evidence base — `03_EVIDENCE_BASE.md`)
Ranked capability-per-effort: (1) Apache-2.0 foundation TS model (TimesFM 2.5 / Chronos-Bolt) for zero-shot forecasting; (2) **EnbPI conformal intervals** around every forecast; (3) **Matrix Profile (STUMPY) + HDBSCAN** for training-free motif/anomaly/regime discovery; (4) NL→prediction **orchestrator** (router→specialist→verifier); (5) **supercomputer loop**: continuous re-forecasting + ensemble spread + skill-score backtesting (CRPS/RMSE vs climatology); (6) **PELT/BOCPD** change-point detection; (7) **Error-Weighted Ensemble** (expired patent WO2014075108A2); (8) deep: **TGN/TGAT/xERTE** temporal graphs, **EnKF** data assimilation, **JEPA/DreamerV3** latent world-modelling.

---

## 2. ARCHITECTURE AT A GLANCE
```
NL question ─► ORCHESTRATOR (Kimi router → intent/domain/target/horizon → plan)
                     │
                     ├─► HISTORY LAKE  ◄── ingestion loop (USGS, CoinGecko, FX, sim, KGIK snapshots)  [§04,§05]
                     │        persisted world-data time-series + outcomes  (SQLite/Parquet)
                     │
                     ├─► PATTERN-DISCOVERY  [§06] Matrix-Profile motifs · HDBSCAN regimes ·
                     │        PELT/BOCPD change-points · cross-series lead-lag · Granger/CCM causal screen
                     │
                     ├─► RELATIONAL LAYER  [§06] KGIK temporal graph (TGN/TGAT-style) → learned edges;
                     │        promote confirmed patterns into KGIK; link-prediction (xERTE-style)
                     │
                     ├─► FORECAST CORE  [§06] foundation TS model (TimesFM/Chronos, GPU) +
                     │        classical (GBM/Holt/ARIMA) + EnKF assimilation → ERROR-WEIGHTED ENSEMBLE
                     │        └─► EnbPI CONFORMAL calibration → interval + probability
                     │
                     ├─► SELF-IMPROVEMENT  [§08] persist forecast → score vs realized (CRPS/RMSE/coverage)
                     │        → PSI/ECE drift → re-weight/retrain → update KGIK edge strengths
                     │
                     └─► VERIFIER → answer {value, interval, probability, method, drivers, assumptions, caveats}
            COMPUTE: gpu_backend (CuPy/NumPy) + optional remote inference (PREDICT_GPU_URL)  [§10]
```

---

## 3. DOCUMENT MAP (section files — each expanded to ISO-execution depth)
| # | File | Contents |
|---|---|---|
| 01 | `01_MISSION_AND_SCOPE.md` | mission, users, use-cases, success metrics, out-of-scope |
| 02 | `02_CURRENT_STATE_AUDIT.md` | full code inventory, signatures, wiring, gaps (from audit) |
| 03 | `03_EVIDENCE_BASE.md` | cited models, patents, supercomputer behaviours, algorithm menu |
| 04 | `04_ARCHITECTURE.md` | components, dataflow, sequence diagrams, deployment topology |
| 05 | `05_DATA_MODEL_AND_SCHEMAS.md` | History Lake schema, feed adapters, outcome store, KGIK schema |
| 06 | `06_ALGORITHMS.md` | every algorithm: math, pseudocode, params, complexity, source |
| 07 | `07_API_CONTRACTS.md` | endpoints, request/response schemas, errors, versioning |
| 08 | `08_SELF_IMPROVEMENT_AND_MLOPS.md` | backtesting, skill scores, drift, model registry, retrain triggers |
| 09 | `09_ORCHESTRATION_NL_ROUTING.md` | router→specialist→verifier, intent schema, prompts, guardrails |
| 10 | `10_COMPUTE_AND_GPU.md` | gpu_backend, remote dispatch, batching, capacity, fallbacks |
| 11 | `11_VALIDATION_AND_TEST_PLAN.md` | unit/integration/backtest suites, acceptance criteria |
| 12 | `12_SECURITY_GOVERNANCE_LEGAL.md` | authz, data governance, patent/license compliance |
| 13 | `13_PHASED_BUILD_PLAN.md` | ISO work-breakdown: tasks, owners, deps, acceptance gates |
| 14 | `14_RISKS_AND_LIMITS.md` | irreducible uncertainty, failure modes, honest limits |

---

## 4. VERSIONING LADDER (v1 → v150)
This spec is expanded in iterative passes; each pass deepens every section toward execution-grade. The ladder records the depth target per milestone so progress is auditable.

- **v1** — spine + grounding summary + architecture (this index) + section skeletons.
- **v2–v15** — each section filled with first-pass execution detail (schemas, pseudocode, API contracts).
- **v16–v50** — exact data schemas, per-algorithm math + complexity + parameter tables, sequence diagrams, error taxonomies.
- **v51–v100** — full test matrices, acceptance criteria per task, runbooks, failure-mode/effects analysis (FMEA), capacity models.
- **v101–v150** — hardening: SLOs, observability, rollback, governance/legal sign-off, end-to-end traceability matrix (requirement → component → test).

> Version state is tracked in `VERSION_LOG.md`. Each expansion pass appends an entry (date, sections touched, depth added) so the document's growth to v150 is fully traceable.
