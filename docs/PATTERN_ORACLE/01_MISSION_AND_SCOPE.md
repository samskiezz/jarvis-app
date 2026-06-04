# 01 — MISSION & SCOPE
**Document:** PATTERN ORACLE — Section 01 of the Master Engineering Spec
**Parent:** `00_MASTER_INDEX.md`
**Document class:** Master Engineering Spec · military-grade · ISO-execution depth
**Status:** living document (v1 → v150). This section is normative: it fixes *why the system exists*, *who it serves*, *what it must and must not do*, and the *testable requirements* every downstream section is traced to.
**Owner:** APEX / KGIK prediction program.
**Normative language:** The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** are to be interpreted as in RFC 2119 / RFC 8174.

---

## 1.0 PURPOSE OF THIS SECTION
This section is the **charter** of PATTERN ORACLE. It states the mission, the personas and capabilities served, the success metrics by which the program is judged, the engineering principles that constrain every design decision, the explicit scope boundary, and the master **requirements register** (FR-* functional, NFR-* non-functional). Every requirement defined here is assigned a stable ID and an acceptance test hook so that `11_VALIDATION_AND_TEST_PLAN.md` and the end-to-end traceability matrix (v101–v150) can bind *requirement → component → test* with no orphans.

> **Reading order.** Read `00_MASTER_INDEX.md` first (architecture and grounding). This section depends on the two audits (`02_CURRENT_STATE_AUDIT.md`, `03_EVIDENCE_BASE.md`) for the *grounded-not-invented* claim: every capability asserted below is either already in the repo or traces to a cited model/paper/patent.

---

## 1.1 MISSION STATEMENT

> **PATTERN ORACLE is a world-scale, self-improving "ask-and-predict-anything" engine. A user asks any question in natural language; the engine pulls real, persisted world-model data, discovers the patterns linking the world to the requested target (and the historical patterns among those drivers), produces a calibrated probabilistic forecast with explicit assumptions and caveats, and then scores every forecast against reality to continuously improve its own predictive skill — never inventing capability it cannot ground, and never claiming precision beyond the information-theoretic limit of the data.**

### 1.1.1 The core loop (one sentence, expanded)
Natural-language question **→** intent/target/horizon extraction **→** retrieve grounded world-data history **→** discover patterns between candidate drivers and target + historical pattern stability **→** forecast with an error-weighted ensemble **→** conformal-calibrated interval + probability **→** answer with drivers/assumptions/caveats **→** persist forecast **→** score against realized outcome **→** re-weight / retrain / learn graph edges **→** (skill rises over time).

### 1.1.2 Mission decomposition (each clause is testable)
| ID | Mission clause | Operational meaning | Bound to |
|----|----------------|---------------------|----------|
| M-1 | "ask anything in natural language" | No fixed query DSL; free-text intake; the orchestrator extracts target/horizon/constraints. | FR-1, FR-2, §09 |
| M-2 | "real world-model data" | Forecasts are computed from persisted, sourced time-series in the History Lake — never from fabricated numbers. | FR-3, FR-10, §05 |
| M-3 | "find patterns between the world and the target" | Cross-series lead-lag, motif/regime discovery, causal screening identify candidate drivers. | FR-5, FR-6, §06 |
| M-4 | "+ historical patterns between those" | The relational/KGIK layer records and reuses confirmed driver↔target relationships over time. | FR-7, FR-13, §06 |
| M-5 | "calibrated forecast" | Every numeric/probabilistic answer carries an interval and/or probability with measured coverage. | FR-8, FR-9, NFR-3 |
| M-6 | "self-improves" | Forecasts are persisted, scored, and used to re-weight/retrain; skill trends upward and is auditable. | FR-11, FR-12, §08 |
| M-7 | "honest, never invented" | Capabilities cite a source or audited code; unknowns are reported as such; refusal over fabrication. | P-1, P-2, NFR-10 |

---

## 1.2 PRIMARY USERS & PERSONAS

PATTERN ORACLE is a **capability surface**, not a vertical product. The same engine serves several user classes; the personas below drive UX, latency, and explainability requirements.

| Persona | Who | Goal | What they ask | Key needs | Drives |
|---------|-----|------|---------------|-----------|--------|
| **P-A · The Asker** | Non-expert APEX user | Get a defensible answer to a "what will happen / how likely" question | "Will BTC be above 80k in 30 days?"; "What's the quake risk near Tokyo this month?" | Plain-language answer, interval, why, caveats | FR-1, FR-9, NFR-1 |
| **P-B · The Analyst** | Domain power-user (markets, risk, ops) | Inspect drivers, horizons, scenarios; compare to a baseline | "Show the drivers and the lead-lag; what's the CRPS vs climatology?" | Driver attribution, baseline skill, exportable detail | FR-5, FR-8, FR-14 |
| **P-C · The Builder** | Engineer integrating via API | Programmatic forecasts for downstream apps | `POST /predict` with target+horizon, get structured forecast | Stable contracts, versioning, idempotency, SLOs | §07, NFR-1, NFR-7 |
| **P-D · The Steward** | MLOps / model owner | Keep skill rising, catch drift, manage retrains | "Is skill degrading? Which models lost weight? Trigger retrain." | Skill dashboards, drift alarms, model registry | FR-11, FR-12, §08 |
| **P-E · The Auditor** | Governance / legal / safety | Prove grounding, calibration, license/patent compliance | "Show source of every technique and the realized coverage." | Provenance, traceability, audit logs | P-1, NFR-9, NFR-10, §12 |

**Persona priority for v1–v50:** P-A and P-C (deliver answers + contracts), then P-B (explainability), then P-D and P-E (MLOps + governance hardening) in v51–v150.

---

## 1.3 TOP USE-CASES (framed as CAPABILITIES, not fixed domains)

> **Design stance.** PATTERN ORACLE has **no hard-coded domain list**. The items below are *capability archetypes* demonstrated on grounded data feeds present in the repo (USGS seismic, CoinGecko crypto, FX, simulation snapshots, KGIK graph). Adding a new domain = adding a History-Lake feed adapter (§05) + (optionally) a specialist (§09); the core engine is domain-agnostic.

| UC | Capability archetype | Example NL question | Grounded basis (repo / evidence) | Output shape |
|----|----------------------|---------------------|----------------------------------|--------------|
| **UC-1** | **Numeric series forecast** (markets / crypto / FX / any series) | "Where will ETH be in 7 days?" | `prediction.py` GBM-MC/Holt; TimesFM/Chronos (evidence §03); CoinGecko feed | point + interval + P(>x) |
| **UC-2** | **Rare-event / hazard risk** (seismic, failure, outage) | "Probability of M≥5 within 200 km of Tokyo in 30 days?" | Gutenberg-Richter/Omori in `prediction.py`; USGS feed | probability + interval |
| **UC-3** | **Trajectory / kinematics** (flight, orbit, ballistic) | "Where is this object in 10 minutes given its track?" | great-circle/orbital/ballistic in `prediction.py` | position + uncertainty cone |
| **UC-4** | **Generic exogenous-pattern forecast** | "Forecast metric X; use whatever world signals predict it." | Matrix-Profile motifs + cross-series lead-lag (evidence §03,§06) | forecast + driver list |
| **UC-5** | **Cross-entity relational forecast** | "If A spikes, what happens to B next week?" | KGIK temporal graph / TGN-TGAT-style edges (evidence §03,§06) | conditional forecast + edge |
| **UC-6** | **Anomaly / regime / change-point detection** | "Is this series in a new regime? When did it shift?" | HDBSCAN + PELT/BOCPD + Matrix Profile (evidence §03,§06) | regime label + change-points |
| **UC-7** | **Scenario / counterfactual** | "What if rate r doubled — how does the forecast move?" | `temporal_nodes.counterfactual_fork`, `causal_chain` | scenario deltas + caveat |
| **UC-8** | **Skill / calibration introspection** | "How good have your BTC forecasts been vs climatology?" | self-improvement store (§08), CRPS/RMSE/coverage | skill scorecard |

Each UC **MUST** be expressible through the single NL intake (FR-1) and resolve to the shared forecast contract (§07). No UC may bypass calibration (FR-8) or grounding (FR-3).

---

## 1.4 SUCCESS METRICS & KPIs

Success is measured against a **climatology / naïve baseline** — the engine must demonstrate *skill*, not just produce numbers. All metrics are computed by the self-improvement subsystem (§08) over the persisted forecast↔outcome store and surfaced to P-D/P-E.

### 1.4.1 Primary KPIs
| KPI | Definition | Target (v1 → mature) | Baseline | Measured in |
|-----|-----------|----------------------|----------|-------------|
| **K-1 Forecast Skill Score (FSS)** | `1 − (score_model / score_baseline)` using CRPS (probabilistic) or RMSE (point). >0 = beats baseline. | v1: >0 on ≥1 feed; mature: median FSS ≥ 0.15 across active feeds | climatology / persistence / random-walk | §08, FR-12 |
| **K-2 Calibration Coverage** | Empirical coverage of nominal X% prediction interval (PICP). | within ±5 pts of nominal (e.g. 90% PI covers 85–95%) | uncalibrated model | NFR-3, FR-8 |
| **K-3 CRPS (probabilistic accuracy)** | Continuous Ranked Probability Score on probabilistic forecasts; lower better. | strictly below baseline CRPS; downward trend | climatology CRPS | §08 |
| **K-4 RMSE / MAE (point accuracy)** | Point error on deterministic forecasts. | below persistence RMSE | persistence | §08 |
| **K-5 Latency p95** | End-to-end NL-question → answer, warm cache. | p95 ≤ 8 s (interactive); cached/short-horizon p95 ≤ 2 s | n/a | NFR-1 |
| **K-6 Self-Improvement Trend** | Sign + slope of rolling FSS over time per feed. | non-negative slope over a trailing window; alarm on sustained decline | flat | FR-11, FR-12 |
| **K-7 Breadth of Answerable Questions** | Count of distinct grounded targets/feeds the engine can forecast with FSS>0. | grows monotonically as feeds/specialists are added | n/a | FR-15 |

### 1.4.2 Secondary / guardrail KPIs
| KPI | Definition | Guardrail |
|-----|-----------|-----------|
| K-8 Sharpness | Mean interval width given coverage held. | minimize subject to K-2 (no widening to cheat coverage) |
| K-9 Pinball loss (quantile) | Quantile-loss across forecast quantiles. | below baseline |
| K-10 Refusal correctness | Fraction of out-of-grounding asks correctly refused vs fabricated. | ≥99% correct refusal (no fabrication) — P-1/P-2 |
| K-11 Drift detection lead | Time from true distribution shift to PSI/ECE alarm. | shorter is better; alarm before FSS collapses |
| K-12 Availability | Successful-answer rate of `/predict`. | ≥99.0% (NFR-7) |

### 1.4.3 Scoring rules (normative)
- Probabilistic forecasts are scored with **CRPS** (and pinball loss per quantile); point forecasts with **RMSE/MAE**. Skill (K-1) is always reported **relative to an explicit baseline** named in the answer.
- Coverage (K-2) is computed per nominal level (e.g. 50/80/90/95%) and must be reported, not assumed.
- A forecast with no realized outcome yet is **pending** and excluded from skill aggregates until resolved.

---

## 1.5 ENGINEERING PRINCIPLES (binding constraints)

These principles are **non-negotiable** and constrain every later section. Each maps to enforcement requirements.

| ID | Principle | Statement | Enforced by |
|----|-----------|-----------|-------------|
| **P-1** | **Grounded, not invented** | Every technique traces to a cited model/paper/patent (`03_EVIDENCE_BASE.md`) or existing audited code (`02_CURRENT_STATE_AUDIT.md`). No capability is asserted that cannot be sourced. Forecasts use only persisted, sourced data. | FR-3, NFR-9, NFR-10 |
| **P-2** | **Calibrated honesty** | Every answer carries an interval and/or probability + assumptions + caveats. Skill is bounded by information theory; the engine quantifies uncertainty and **refuses or hedges rather than fabricating precision**. When the data cannot support a forecast, it says so. | FR-8, FR-9, K-2, K-10 |
| **P-3** | **Self-improving** | Predictions and realized outcomes are persisted; skill is back-tested continuously; models are re-weighted/retrained; the KGIK graph learns new edges from confirmed patterns. The system is measurably better next month than this. | FR-11, FR-12, FR-13, K-1, K-6 |
| **P-4** | **Replicate the best** | The engine replicates the *behaviour* of state-of-the-art systems — foundation time-series transformers (TimesFM/Chronos), temporal graph networks (TGN/TGAT/xERTE), conformal prediction (EnbPI), and numerical-weather-style data-assimilation/ensemble loops (EnKF) — **at the scale our real infrastructure supports**, with honest uncertainty and no invented capability. | §03, §06, P-1 |
| **P-5** | **Domain-agnostic core** | The core (intake → lake → pattern → forecast → calibrate → self-improve) is domain-independent; domains enter only as feed adapters and optional specialists. | FR-15, §05, §09 |
| **P-6** | **Everything is testable & traceable** | Every requirement has an ID and an acceptance test; the traceability matrix binds requirement → component → test with zero orphans. | §11, this section |

**Information-theoretic limit (P-2 detail).** The program acknowledges that predictive skill is upper-bounded by the signal present in the data (irreducible noise, chaotic horizons, regime breaks). The engine's job is to **approach that bound and to quantify the residual uncertainty truthfully**, never to exceed it by fabrication. The honest-limits treatment lives in `14_RISKS_AND_LIMITS.md`.

---

## 1.6 SCOPE BOUNDARY

### 1.6.1 IN SCOPE (v1 → v150)
| # | In-scope capability |
|---|---------------------|
| IS-1 | Single natural-language intake for forecast/probability/risk/regime/scenario questions (UC-1…UC-8). |
| IS-2 | Persisted **History Lake** of real world-data time-series + outcomes (USGS, CoinGecko, FX, simulation/KGIK snapshots), with feed-adapter extensibility. |
| IS-3 | **Pattern discovery**: motifs (Matrix Profile), regimes (HDBSCAN), change-points (PELT/BOCPD), cross-series lead-lag, causal *screening* (Granger/CCM) as **screening, not proof**. |
| IS-4 | **Relational layer** over KGIK: learned/confirmed driver↔target edges, link-prediction-style relational forecasts. |
| IS-5 | **Forecast core**: error-weighted ensemble of foundation TS model + classical forecasters + (where applicable) assimilation, with **EnbPI conformal calibration**. |
| IS-6 | **Self-improvement loop**: persist forecast → score (CRPS/RMSE/coverage) vs baseline → drift (PSI/ECE) → re-weight/retrain → update graph edges. |
| IS-7 | Structured forecast **API + UI** answer object (value, interval, probability, method, drivers, assumptions, caveats). |
| IS-8 | Compute via existing `gpu_backend` (CuPy↔NumPy) and optional remote inference endpoint; graceful CPU fallback. |
| IS-9 | Skill/calibration **introspection** (UC-8) and MLOps surfaces for P-D/P-E. |
| IS-10 | Governance hooks: provenance of techniques, license/patent compliance, audit logging (detailed in §12). |

### 1.6.2 OUT OF SCOPE (explicit non-goals)
| # | Out-of-scope | Rationale |
|---|--------------|-----------|
| OS-1 | **Guaranteed / deterministic predictions of inherently chaotic or adversarial outcomes** (exact lottery numbers, exact future prices). | Violates P-2; physically/informationally impossible. The engine gives calibrated probabilities, not certainties. |
| OS-2 | **Financial / medical / legal advice or autonomous action** on forecasts. | The engine forecasts; it does not advise, transact, or actuate. Acting on output is the caller's responsibility (§12). |
| OS-3 | **Fabricated data sources** or web-scraping beyond audited feeds. | Violates P-1 grounding. New data enters only via vetted feed adapters (§05). |
| OS-4 | **Causal "truth" claims.** The engine performs causal *screening* only; it does not assert proven causation. | Honest limits (P-2); see §06/§14. Wording in answers must say "associated/leading", not "causes", unless a confirmed graph edge supports it. |
| OS-5 | **Real-time HFT / sub-second trading loops.** | Latency budget is interactive (K-5), not microsecond; not the target use. |
| OS-6 | **Training of giant new foundation models from scratch.** | We *replicate behaviour* by integrating pretrained Apache-2.0 models (P-4); we fine-tune/ensemble/calibrate, not pretrain at frontier scale. |
| OS-7 | **PII-driven individual-level prediction.** | Governance/privacy (§12); engine operates on world-data aggregates and grounded series. |
| OS-8 | **General chit-chat / non-forecast Q&A.** | Out-of-charter; such asks are routed away or answered as "not a forecast question". |

---

## 1.7 ASSUMPTIONS

| ID | Assumption | If false → impact |
|----|-----------|-------------------|
| A-1 | The audited repo capabilities (`02_CURRENT_STATE_AUDIT.md`) exist and run (prediction.py, temporal_nodes, optimizer, gpu_backend, KGIK). | Re-baseline scope; some IS-* slip to "build". |
| A-2 | External feeds (USGS, CoinGecko, FX) remain reachable and roughly stable in schema. | Feed adapters degrade gracefully; affected feeds go stale, others unaffected (NFR-8). |
| A-3 | At least one Apache-2.0 foundation TS model (TimesFM 2.5 / Chronos-Bolt) is licensable and runnable on available compute. | Fall back to classical + conformal core; FSS targets adjusted. |
| A-4 | Persistence (SQLite/Parquet per §05) is available for the History Lake and outcome store. | Self-improvement (P-3) cannot function; this is a hard dependency. |
| A-5 | Kimi K2 (or equivalent) LLM routing is available for NL intake. | Intake falls back to a constrained parser; breadth (K-7) reduced. |
| A-6 | Realized outcomes for forecasted targets become observable within the relevant horizon. | Forecasts stay "pending"; skill aggregates sparse for that target. |
| A-7 | GPU (CuPy/remote) may be absent; CPU/NumPy fallback is acceptable for v1. | Latency (K-5) and throughput reduced, not blocked (NFR-6). |

---

## 1.8 DEPENDENCIES

| ID | Dependency | Type | Owner section |
|----|-----------|------|---------------|
| D-1 | `02_CURRENT_STATE_AUDIT.md` — existing code inventory & wiring | internal grounding | §02 |
| D-2 | `03_EVIDENCE_BASE.md` — cited models/patents/algorithms | internal grounding | §03 |
| D-3 | History Lake + schemas (persistence) | internal build | §05 |
| D-4 | Pattern-discovery + relational + forecast-core algorithms | internal build | §06 |
| D-5 | API contracts (forecast answer object) | internal interface | §07 |
| D-6 | Self-improvement / MLOps subsystem | internal build | §08 |
| D-7 | NL orchestration (Kimi router → specialist → verifier) | internal build | §09 |
| D-8 | Compute (gpu_backend, remote inference) | internal infra | §10 |
| D-9 | External feeds: USGS, CoinGecko, FX | external | §05 |
| D-10 | Pretrained foundation TS model weights (TimesFM/Chronos) | external (Apache-2.0) | §03/§06 |
| D-11 | Conformal lib / Matrix-Profile (STUMPY) / HDBSCAN / PELT/BOCPD | external libs | §06 |
| D-12 | LLM provider (Kimi K2) for routing | external | §09 |

---

## 1.9 DEFINITIONS / GLOSSARY
| Term | Definition |
|------|-----------|
| **APEX** | The host application that PATTERN ORACLE lives inside. |
| **KGIK** | The typed knowledge-graph substrate; the relational layer learns/promotes confirmed driver↔target edges into it. |
| **History Lake** | The persisted store of real world-data time-series and feed snapshots used as the only forecasting input (§05). |
| **Outcome store** | Persisted realized outcomes paired with prior forecasts, enabling skill scoring (§08). |
| **Forecast skill score (FSS)** | `1 − score_model/score_baseline`; >0 means the model beats the baseline (K-1). |
| **Climatology baseline** | A naïve reference forecast (historical distribution / persistence / random-walk) skill is measured against. |
| **CRPS** | Continuous Ranked Probability Score; proper score for probabilistic forecasts. |
| **RMSE / MAE** | Root-mean-square / mean-absolute error for point forecasts. |
| **PICP / Coverage** | Prediction-Interval Coverage Probability; empirical fraction of outcomes inside the nominal interval. |
| **Sharpness** | Average interval width; narrower is better *only if* coverage holds. |
| **EnbPI** | Ensemble batch prediction-intervals; a conformal method giving distribution-free coverage. |
| **Conformal prediction** | Framework producing intervals with finite-sample coverage guarantees under exchangeability. |
| **Matrix Profile** | Training-free technique (STUMPY) for motif/anomaly/discord discovery in series. |
| **HDBSCAN** | Density-based clustering used for regime discovery. |
| **PELT / BOCPD** | Pruned Exact Linear Time / Bayesian Online Change-Point Detection — change-point methods. |
| **Granger / CCM** | Granger causality / Convergent Cross Mapping — *screening* methods for lead-lag association (not proof of cause). |
| **Foundation TS model** | Pretrained zero-shot time-series transformer (e.g. TimesFM 2.5, Chronos-Bolt) used for forecasting. |
| **TGN / TGAT / xERTE** | Temporal graph network / temporal graph attention / explainable temporal reasoning — relational-forecasting techniques. |
| **EnKF** | Ensemble Kalman Filter — data-assimilation method blending model and observations. |
| **Error-weighted ensemble** | Combining forecasters weighted by recent realized error (cf. expired patent WO2014075108A2). |
| **PSI / ECE** | Population Stability Index / Expected Calibration Error — drift & calibration diagnostics. |
| **Regime** | A persistent statistical state of a series; transitions are change-points. |
| **Pending forecast** | A persisted forecast whose realized outcome is not yet observable; excluded from skill aggregates. |
| **Specialist** | A domain-specific handler invoked by the orchestrator for a class of targets (§09). |

---

## 1.10 REQUIREMENTS REGISTER

All requirements below are **normative, ID-stable, and testable**. The `Verify` column names the acceptance hook that `11_VALIDATION_AND_TEST_PLAN.md` will implement and the traceability matrix will bind.

### 1.10.1 Functional Requirements (FR)
| ID | Requirement (the system **MUST** …) | Priority | Traces to | Verify (acceptance hook) |
|----|--------------------------------------|----------|-----------|--------------------------|
| **FR-1** | Accept a free-text natural-language question and extract intent, target, horizon, and constraints. | P0 | M-1, P-A | Submit ≥20 varied NL asks; ≥95% yield a correct (target,horizon) parse vs labeled set. |
| **FR-2** | Map an extracted intent to exactly one resolution path (UC-1…UC-8) or to a defined "unsupported/refuse" path. | P0 | M-1, OS-8 | Each UC fixture routes to its archetype; out-of-charter asks route to refuse. |
| **FR-3** | Compute every forecast solely from persisted, sourced History-Lake data — never from fabricated values. | P0 | M-2, P-1 | Provenance assertion: each forecast references ≥1 lake series ID; no-source ⇒ refusal, not a number. |
| **FR-4** | Ingest and persist external feeds (USGS, CoinGecko, FX, sim/KGIK snapshots) as time-series in the History Lake. | P0 | IS-2, D-9 | Ingestion run writes rows; row counts/timestamps advance; schema validated. |
| **FR-5** | Discover candidate drivers via cross-series lead-lag and pattern/motif analysis and attach them to the answer. | P0 | M-3, P-B | Synthetic series with known lead ⇒ correct driver+lag recovered; answer lists drivers. |
| **FR-6** | Detect regimes/change-points/anomalies for a series on request (UC-6). | P1 | M-3, UC-6 | Series with injected change-point ⇒ detected within tolerance window. |
| **FR-7** | Maintain a relational layer that records confirmed driver↔target relationships and supports cross-entity conditional forecasts (UC-5). | P1 | M-4, IS-4 | Confirmed pattern creates/strengthens a KGIK edge; conditional query returns edge-backed forecast. |
| **FR-8** | Attach a calibrated prediction interval and/or probability (conformal/ensemble) to every forecast. | P0 | M-5, P-2 | Backtest PICP within ±5 pts of nominal at ≥1 nominal level (K-2). |
| **FR-9** | Return a structured answer object: {value, interval, probability, method, drivers, assumptions, caveats, baseline}. | P0 | M-5, IS-7 | Schema-validate every `/predict` response; all required fields present. |
| **FR-10** | Combine multiple forecasters via an error-weighted ensemble; record per-model weights. | P1 | P-4, IS-5 | Weights sum to 1, shift toward lower-error model on a controlled feed. |
| **FR-11** | Persist every issued forecast and later pair it with its realized outcome. | P0 | M-6, P-3 | Forecast row written at issue; outcome row linked when observable; pending state honored. |
| **FR-12** | Continuously score forecasts against a named baseline (CRPS/RMSE/coverage) and expose the skill trend. | P0 | M-6, K-1, K-6 | Scoring job produces FSS, CRPS, RMSE, PICP per feed; trend queryable. |
| **FR-13** | Use scored outcomes to re-weight/retrain models and update relational edge strengths. | P1 | M-6, P-3 | After N resolved outcomes, weights/edges change in the error-reducing direction. |
| **FR-14** | Provide driver attribution and a skill/calibration scorecard for inspection (UC-8, P-B/P-D). | P1 | K-1, P-B | UC-8 query returns scorecard with FSS, CRPS, PICP, baseline name. |
| **FR-15** | Support adding a new domain by registering a feed adapter (+optional specialist) without core changes. | P1 | P-5, K-7 | Add a mock feed adapter ⇒ new target forecastable; no edits to core modules. |
| **FR-16** | Detect distribution drift (PSI) and miscalibration (ECE) and raise an alarm/trigger. | P1 | P-3, K-11 | Inject shift ⇒ PSI/ECE crosses threshold ⇒ alarm/retrain trigger fires. |
| **FR-17** | Surface scenario/counterfactual deltas for a requested intervention (UC-7) with an explicit caveat. | P2 | M-3, UC-7 | Counterfactual query returns baseline vs scenario forecast + "screening-only" caveat. |
| **FR-18** | Refuse or hedge when grounding/skill is insufficient, stating why, instead of fabricating. | P0 | P-2, OS-1, K-10 | Out-of-grounding/low-skill asks return refusal/hedge with reason; ≥99% no-fabrication (K-10). |
| **FR-19** | Record provenance for every technique used (cited source or audited-code reference) in the answer/audit log. | P1 | P-1, P-E | Each method emitted carries a source tag resolvable to §02/§03. |
| **FR-20** | Version the forecast API contract and preserve backward compatibility within a major version. | P1 | P-C, §07 | Contract tests pass across a minor version bump; breaking change ⇒ major bump. |

### 1.10.2 Non-Functional Requirements (NFR)
| ID | Requirement (the system **MUST** …) | Priority | Traces to | Verify (acceptance hook) |
|----|--------------------------------------|----------|-----------|--------------------------|
| **NFR-1** | Answer interactive NL questions with end-to-end p95 ≤ 8 s warm (≤ 2 s cached/short-horizon). | P0 | K-5, P-A/P-C | Load test reports p95 within budget. |
| **NFR-2** | Beat the climatology/naïve baseline (FSS > 0) on ≥1 active feed at v1; sustain non-negative skill trend. | P0 | K-1, K-6 | Backtest reports FSS>0; trend slope ≥0 over trailing window. |
| **NFR-3** | Keep calibration coverage within ±5 percentage points of nominal across active feeds. | P0 | K-2, P-2 | Rolling PICP per nominal level within band. |
| **NFR-4** | Maintain sharpness: do not widen intervals beyond what coverage requires (no coverage-gaming). | P1 | K-8 | Sharpness tracked; flag if width grows without coverage need. |
| **NFR-5** | Scale to the configured world-model size using existing gpu_backend / scale projections without redesign. | P2 | §10, IS-8 | Capacity test at target series count meets latency budget or documented degrade. |
| **NFR-6** | Degrade gracefully to CPU/NumPy when GPU/remote inference is unavailable. | P0 | A-7, IS-8 | Disable GPU ⇒ forecasts still produced (slower), no errors. |
| **NFR-7** | Achieve ≥99.0% successful-answer availability for `/predict`. | P1 | K-12 | Synthetic monitor over window reports ≥99.0%. |
| **NFR-8** | Tolerate a failed/stale external feed without failing unrelated forecasts; mark stale data as such. | P0 | A-2, OS-3 | Kill one feed ⇒ others unaffected; stale flag set on the dead feed's answers. |
| **NFR-9** | Be fully traceable: every requirement → component → test, zero orphans. | P0 | P-6, §11 | Traceability matrix has 0 unmapped FR/NFR and 0 untested requirements. |
| **NFR-10** | Comply with cited licenses/patents (Apache-2.0 models; only expired/own patents); log technique provenance. | P0 | P-1, §12 | License/patent audit passes; each technique resolves to a compliant source. |
| **NFR-11** | Make all forecasts auditable: persist inputs, model, weights, version, and timestamp per forecast. | P1 | P-E, §08/§12 | Given a forecast ID, full reproduction record is retrievable. |
| **NFR-12** | Be reproducible: same inputs + model version + seed ⇒ same forecast (within documented stochastic tolerance). | P1 | P-E | Re-run with fixed seed reproduces output within tolerance. |
| **NFR-13** | Enforce that no answer is emitted without an interval/probability and a caveat field (calibrated-honesty gate). | P0 | P-2, FR-8/FR-9 | Response validator rejects any forecast missing uncertainty/caveat. |
| **NFR-14** | Keep the core domain-agnostic: adding a domain must not modify intake/pattern/forecast/self-improve core code. | P1 | P-5, FR-15 | Static check: new-domain PR touches only adapters/specialists. |
| **NFR-15** | Protect privacy/governance: no PII-driven individual prediction; access-controlled MLOps/audit surfaces. | P1 | OS-7, §12 | Governance test: PII inputs rejected; audit/MLOps endpoints require authz. |

### 1.10.3 Requirement priority key
- **P0** — must ship in v1 / hard acceptance gate. **P1** — must ship within the v2–v50 expansion. **P2** — hardening (v51–v150).

---

## 1.11 ACCEPTANCE GATE FOR THIS SECTION
This section is "execution-ready" when: (a) every mission clause M-1…M-7 maps to ≥1 requirement; (b) every UC and persona maps to ≥1 requirement; (c) every FR/NFR has a unique ID, a priority, a trace, and a verify hook; (d) every principle P-1…P-6 is enforced by ≥1 requirement; and (e) scope is fully partitioned into IN/OUT with no overlap. The traceability obligations stated here are discharged in `11_VALIDATION_AND_TEST_PLAN.md` and the end-to-end traceability matrix (v101–v150).

---
*End of Section 01 — MISSION & SCOPE. Next: `02_CURRENT_STATE_AUDIT.md` (the grounded code inventory this charter rests on).*
