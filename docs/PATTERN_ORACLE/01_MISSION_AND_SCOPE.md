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

### 1.2.1 Persona journeys (end-to-end, grounded to the core loop §1.1.1)

Each journey below is a *normative narrative*: it walks one persona through the engine and binds every step to a requirement and an acceptance hook. Journeys exist so that UX, latency, and explainability obligations are testable as flows, not just as isolated requirements. No step asserts a capability not already grounded in §1.3 / §02 / §03.

#### Journey J-A — The Asker (P-A): "Will BTC be above 80k in 30 days?"
| Step | What happens | Persona experience | Requirement | Acceptance hook |
|------|--------------|--------------------|-------------|-----------------|
| J-A.1 | Free-text question submitted via UI/`/predict`. | Types a sentence, no form. | FR-1 | NL parse yields `(target=BTC/USD, horizon=30d, op=P(>80000))` vs labeled set. |
| J-A.2 | Intent routed to UC-1 (numeric series forecast) with probability operator. | Invisible. | FR-2 | Fixture routes to UC-1 numeric path. |
| J-A.3 | History-Lake series for BTC/USD retrieved; staleness checked. | Invisible. | FR-3, NFR-8 | Forecast references ≥1 lake series ID; stale flag if feed dead. |
| J-A.4 | Ensemble + conformal produce point, 80/90% interval, and P(>80k). | Sees probability + interval. | FR-8, FR-10 | PICP within ±5 pts (K-2). |
| J-A.5 | Answer rendered with drivers, assumptions, caveats, baseline name. | Reads "62% (80% PI 71k–93k), driver: ETH lead 2d, vs random-walk". | FR-9 | Schema-valid response, all fields present. |
| J-A.6 | If grounding/skill insufficient → calibrated refusal/hedge instead of a number. | Reads honest "cannot ground beyond 30d". | FR-18, P-2 | Out-of-grounding ask → refusal w/ reason (K-10). |
| **Latency contract** | Warm path end-to-end. | Answer in seconds. | NFR-1 | p95 ≤ 8 s warm / ≤ 2 s cached. |

#### Journey J-B — The Analyst (P-B): "Show drivers and lead-lag; CRPS vs climatology?"
| Step | What happens | Requirement | Acceptance hook |
|------|--------------|-------------|-----------------|
| J-B.1 | Asks for a forecast *with* driver attribution and baseline comparison. | FR-5, FR-14 | UC-8 scorecard returns FSS, CRPS, PICP, baseline name. |
| J-B.2 | Engine returns cross-series lead-lag drivers with lags + strengths. | FR-5 | Synthetic-lead fixture recovers correct driver+lag. |
| J-B.3 | Engine returns CRPS_model vs CRPS_climatology and the FSS. | FR-12, K-1, K-3 | Scoring job emits CRPS/FSS per feed. |
| J-B.4 | Analyst exports the detail (driver table, per-model weights). | FR-10, FR-14 | Per-model weights present and sum to 1. |
| J-B.5 | Wording uses "associated/leading", not "causes", unless a confirmed edge exists. | OS-4, FR-19 | Lexical guard: no "causes" without graph edge. |

#### Journey J-C — The Builder (P-C): `POST /predict` integration
| Step | What happens | Requirement | Acceptance hook |
|------|--------------|-------------|-----------------|
| J-C.1 | Sends structured `{target, horizon, op}`; receives the shared forecast object. | FR-9, §07 | Contract test validates response schema. |
| J-C.2 | Relies on a versioned, backward-compatible contract. | FR-20 | Contract tests pass across a minor bump. |
| J-C.3 | Re-issues an identical request and gets a reproducible result (fixed seed). | NFR-12 | Same inputs+version+seed ⇒ same output within tolerance. |
| J-C.4 | Depends on availability + latency SLOs. | NFR-1, NFR-7 | Monitor ≥99.0% success; p95 within budget. |
| J-C.5 | Receives `forecast_id` to later retrieve the realized scorecard. | FR-11, NFR-11 | Given `forecast_id`, full reproduction record retrievable. |

#### Journey J-D — The Steward (P-D): "Is skill degrading? Trigger retrain."
| Step | What happens | Requirement | Acceptance hook |
|------|--------------|-------------|-----------------|
| J-D.1 | Views rolling FSS trend per feed. | FR-12, K-6 | Trend queryable; slope computed over trailing window. |
| J-D.2 | Receives PSI/ECE drift alarm before FSS collapses. | FR-16, K-11 | Injected shift crosses threshold → alarm fires. |
| J-D.3 | Inspects per-model weights; sees which models lost weight. | FR-10, FR-13 | Weights shift toward lower-error model on controlled feed. |
| J-D.4 | Triggers/observes re-weight or retrain; skill recovers. | FR-13 | After N outcomes, weights/edges move error-reducing direction. |

#### Journey J-E — The Auditor (P-E): "Prove grounding + coverage + license compliance."
| Step | What happens | Requirement | Acceptance hook |
|------|--------------|-------------|-----------------|
| J-E.1 | Picks any technique; asks for its source. | FR-19, P-1 | Method carries source tag resolvable to §02/§03. |
| J-E.2 | Picks any `forecast_id`; asks for the full reproduction record. | NFR-11 | Inputs, model, weights, version, timestamp retrievable. |
| J-E.3 | Asks for realized coverage vs nominal across feeds. | FR-12, NFR-3, K-2 | Rolling PICP per nominal level within band. |
| J-E.4 | Runs the license/patent audit. | NFR-10 | Each technique resolves to a compliant (Apache-2.0/expired/own) source. |
| J-E.5 | Confirms no PII-driven individual prediction occurred. | NFR-15, OS-7 | Governance test: PII inputs rejected; surfaces require authz. |

> **Journey acceptance rule (normative).** A persona journey is "passing" only when *every* step's acceptance hook passes in `11_VALIDATION_AND_TEST_PLAN.md`. A green individual requirement with a red journey indicates a wiring gap and **MUST** block the section gate (§1.11).

#### 1.2.2 Journey failure-mode notes (what each persona must *not* experience)

These are the negative obligations of the journeys — the experiences the engine must prevent. They are the persona-facing restatement of P-1/P-2 and feed the negative-control tests (§11 §8.3).

| Persona | Must-not experience | Prevented by |
|---------|---------------------|--------------|
| P-A | A confident number with no interval, or a fabricated answer on an ungrounded target. | NFR-13, FR-3, FR-18 |
| P-B | A driver labeled "causes" without a confirmed KGIK edge. | OS-4, FR-19 |
| P-C | A silent breaking change to the response contract. | FR-20, NFR-13 |
| P-D | Skill decline discovered only after FSS collapse (no early drift alarm). | FR-16, K-11 |
| P-E | A technique or forecast with no resolvable provenance/reproduction record. | FR-19, NFR-11 |

#### 1.2.3 Persona-to-KPI ownership

Each persona "feels" a subset of KPIs most directly; this fixes who the KPI is reported *to* and aligns the RACI (§1.10.4).

| Persona | Primary KPIs they consume | Why |
|---------|---------------------------|-----|
| P-A | K-2 (coverage), K-5 (latency), K-10 (refusal correctness) | They need a fast, honest, well-calibrated answer. |
| P-B | K-1 (FSS), K-3 (CRPS), K-8 (sharpness), K-9 (pinball) | They benchmark skill and interval quality vs baselines. |
| P-C | K-5 (latency), K-12 (availability) | They depend on the contract's SLOs. |
| P-D | K-1, K-6 (trend), K-11 (drift lead) | They keep skill rising and catch drift. |
| P-E | K-2, K-10, plus provenance/audit (NFR-10/11) | They prove honesty and compliance. |

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

### 1.3.1 Capability matrix (capability × data-source × model/algorithm × maturity)

This matrix is the *grounded inventory* of what the engine can do. Every row maps a capability to a concrete data source in the History Lake, the model/algorithm that realizes it (named in §03/§06 or audited in §02), and a **maturity tier**. No row asserts a capability beyond what §02 (audited code) or §03 (cited models) supports; speculative rows are explicitly tiered **Planned** and gated behind the build plan.

**Maturity legend.** `A` = Audited/exists-in-repo (§02). `G` = Grounded/cited-and-integrable (§03, integration task exists). `P` = Planned/build-plan-only (no code yet, gated by a T-task). `X` = Experimental/research-flagged (kept behind a flag; never the default path).

| Capability (UC) | Data source(s) in Lake | Primary model/algorithm | Calibration | Self-improve hook | Maturity | Grounded by | Build task(s) |
|-----------------|------------------------|-------------------------|-------------|-------------------|----------|-------------|---------------|
| UC-1 Numeric series forecast | CoinGecko crypto, FX (Frankfurter), any series feed | GBM-MC / Holt (audited) + Error-Weighted Ensemble + Foundation TS (TimesFM/Chronos) | EnbPI conformal | re-weight from realized error | A (classical) / G (foundation) | §02 prediction.py; §03 TimesFM/Chronos | T-014, T-015, T-039, T-040 |
| UC-2 Rare-event / hazard risk | USGS seismic catalog | Gutenberg-Richter + Omori (audited) | conformal/ECE on exceedance prob | re-score realized exceedances | A | §02 prediction.py seismic | T-008, T-024 |
| UC-3 Trajectory / kinematics | track/state snapshots | great-circle / orbital / ballistic (audited) | uncertainty cone from spread | n/a (deterministic-ish) | A | §02 prediction.py kinematics | (existing) |
| UC-4 Generic exogenous-pattern forecast | any 2+ Lake series | Matrix Profile motifs + cross-series lead-lag → ensemble | EnbPI | re-weight | G | §03/§06 STUMPY, lead-lag | T-018, T-021, T-015 |
| UC-5 Cross-entity relational forecast | KGIK graph + paired series | temporal link-prediction (TGN/TGAT-style, light) → KGIK edge | conditional interval | edge-strength update | P (light), X (heavy TGN) | §03/§06 relational | T-034, T-035 |
| UC-6 Anomaly / regime / change-point | any Lake series | HDBSCAN regimes + PELT/BOCPD + Matrix-Profile discords | label confidence | n/a | G | §03/§06 | T-018, T-019, T-020 |
| UC-7 Scenario / counterfactual | Lake series + intervention spec | counterfactual_fork / causal_chain (audited) + causal screen | scenario delta + caveat | n/a | A (fork) / G (screen) | §02 temporal_nodes; §06 causal | T-031, T-032, T-033 |
| UC-8 Skill / calibration introspection | outcome store | CRPS/RMSE/coverage/pinball metrics | n/a (reports calibration) | feeds the trend itself | P | §08; §06 skill | T-016, T-024, T-027, T-028 |
| (cross-cut) Drift / miscalibration alarm | input series + outcome store | PSI / ECE (audited in ai_models) | n/a | triggers retrain | A/G | §02 ai_models; §08 | T-025 |
| (cross-cut) Foundation-model acceleration | any series → remote inference | TimesFM 2.5 / Chronos-Bolt via remote endpoint | quantiles feed conformal | weight learned | G | §03; §10 | T-039, T-040, T-041 |

> **Matrix invariants (normative).** (i) Every `A`/`G` row **MUST** trace to a §02 or §03 reference and to ≥1 build task. (ii) No `P`/`X` row may be the *default* resolution path for any UC until promoted to `A`/`G`. (iii) Adding a column value (new data source, new model) is a feed-adapter/specialist change (FR-15, P-5) and **MUST NOT** edit core modules (NFR-14).

#### 1.3.1.1 Data-source × maturity coverage (second view)

The same inventory, pivoted by data source, shows which feeds are live and which capabilities they unlock today. This is the breadth (K-7) baseline.

| Data source (Lake feed) | Status | Unlocks UC | Maturity of path | Feed adapter (§05) |
|-------------------------|--------|-----------|------------------|--------------------|
| USGS seismic catalog | live (audited loader) | UC-2, UC-6 | A | `load_seismic_catalog` → ingestion |
| CoinGecko crypto | live (audited loader) | UC-1, UC-4, UC-6 | A | `load_crypto_series` → ingestion |
| FX (Frankfurter/exchangerate.host) | planned adapter | UC-1, UC-4 | P (T-005) | `fetch_fx` |
| Simulation / KGIK snapshots | present (graph) | UC-5, UC-7 | A/G | KG bridge |
| Outcome store (derived) | built in P0/P3 | UC-8, drift | P | history_lake outcome table |
| Remote foundation inference | planned endpoint | UC-1 (accel) | G (T-039) | `gpu_client` |

> **Breadth rule (normative).** K-7 counts only sources with `FSS > 0` on a forecastable target; a feed that is merely ingested does not increment breadth until it demonstrates skill.

#### 1.3.1.2 Model/algorithm × calibration compatibility

Every forecasting model **MUST** be wrappable by the conformal layer (FR-8); models that cannot emit a point or quantiles are not admissible to the default path.

| Model / algorithm | Output type | Conformal-compatible | Default path? | Source |
|-------------------|-------------|----------------------|---------------|--------|
| GBM Monte-Carlo | point + path spread | yes (EnbPI on residuals) | yes | §02 |
| Holt / exponential smoothing | point | yes | yes | §02 |
| Error-Weighted Ensemble | blended point + interval | yes (wraps members) | yes | §06, patent WO2014075108A2 (expired) |
| TimesFM / Chronos | point + native quantiles | yes (quantiles feed conformal) | yes when available | §03 |
| Gutenberg-Richter / Omori | exceedance probability | yes (ECE/coverage on prob) | yes (UC-2) | §02 |
| Matrix Profile | motif/discord (not a forecaster) | n/a (driver discovery only) | no (feeds drivers) | §03/§06 |
| Temporal link-prediction | edge score / conditional | yes (conditional interval) | no (UC-5, tier P/X) | §06 |

### 1.3.2 Edge-case scope clarifications (what each capability does at its boundary)

These clarify behavior at boundaries so testers and integrators do not infer un-grounded behavior. Each is normative and bound to a requirement.

| EC | Boundary situation | Required behavior | Requirement |
|----|--------------------|-------------------|-------------|
| EC-1 | Target has **no Lake series** (cold target). | Refuse with reason ("no grounded data"); never synthesize a series. | FR-3, FR-18 |
| EC-2 | Series exists but is **stale** (feed dead). | Forecast may proceed on last-good data **only** with an explicit stale-data caveat + reduced-confidence flag; or refuse if staleness exceeds horizon. | NFR-8, FR-18 |
| EC-3 | Horizon **beyond information limit** (chaotic regime, e.g. price at 5y). | Hedge: widen interval to honest width or refuse; never narrow to imply false precision. | P-2, OS-1, NFR-4 |
| EC-4 | **Too few outcomes** to score skill yet. | Report forecast as issued but mark skill "insufficient sample"; exclude from FSS aggregates (pending). | FR-11, §1.4.3 |
| EC-5 | Driver detected but **only association**, no confirmed edge. | Use "associated/leading" wording; do not claim causation. | OS-4, FR-19 |
| EC-6 | NL ask is **not a forecast question** (chit-chat). | Route to "not a forecast question"; do not fabricate an answer. | FR-2, OS-8 |
| EC-7 | Foundation model / GPU **unavailable**. | Silent fallback to classical ensemble on CPU; result still calibrated. | NFR-6, A-7 |
| EC-8 | Conflicting drivers / **multimodal** outcome. | Represent with an honest wide/multimodal interval; never collapse to a single misleading point silently. | P-2, FR-8 |
| EC-9 | Ask implies **OOS action** (advice/transaction). | Forecast only; decline the action with an OS-2 caveat. | OS-2 |
| EC-10 | Ask requires **PII / individual-level** prediction. | Refuse on governance grounds. | OS-7, NFR-15 |

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

### 1.4.4 Measurable KPI definitions (formula + threshold + cadence)

Each KPI is restated as a **computable formula** with an explicit pass/alarm threshold and a **measurement cadence**. Thresholds are split into a v1 acceptance gate and a mature target. All formulas reuse the scoring definitions in `11_VALIDATION_AND_TEST_PLAN.md` §3.5 so there is one source of truth. Notation: `y` realized, `ŷ` forecast, `F` predictive CDF, `N` resolved-forecast count over the window, `1{·}` indicator.

| KPI | Formula | v1 gate | Mature target | Alarm condition | Cadence | Owner / source |
|-----|---------|---------|---------------|-----------------|---------|----------------|
| **K-1 FSS** | `FSS = 1 − score_model/score_baseline`, `score ∈ {CRPS, RMSE}` | `FSS > 0` on ≥1 active feed | median `FSS ≥ 0.15` across active feeds | `FSS < 0` on a previously-positive feed | per scoring run (post-resolution) + daily rollup | P-D · §08 self_improve.py |
| **K-2 Coverage (PICP)** | `PICP = (1/N)·Σ 1{lo ≤ y ≤ hi}` per nominal level `1−α` | `|PICP − (1−α)| ≤ 0.05` at ≥1 level | within ±0.05 at 50/80/90/95% | `|PICP − (1−α)| > 0.05` for 2 consecutive windows | rolling window, daily | P-E · NFR-3, conformal.py |
| **K-3 CRPS** | `CRPS = ∫ (F(z) − 1{z ≥ y})² dz` (ensemble form per §06) | `CRPS_model ≤ CRPS_climatology` | strictly below baseline + downward trend | CRPS rises above baseline | per scoring run | P-D · skill.py |
| **K-4 RMSE/MAE** | `RMSE = √((1/N)Σ(ŷ−y)²)`; `MAE = (1/N)Σ|ŷ−y|` | `RMSE_model < RMSE_persistence` | sustained below persistence | RMSE ≥ persistence | per scoring run | P-D · skill.py |
| **K-5 Latency p95** | `p95` of end-to-end `answer_ts − request_ts` over the window | warm `p95 ≤ 8 s`; cached `≤ 2 s` | warm `p95 ≤ 5 s` | `p95 > 8 s` warm | continuous (per request) + hourly p95 | P-C/SRE · NFR-1, observability.py |
| **K-6 Self-improvement trend** | OLS slope `β` of rolling `FSS_t` over trailing window | `β ≥ 0` (non-negative) | `β > 0` and statistically clear | sustained `β < 0` (decline) | weekly trailing window | P-D · §08, FR-12 |
| **K-7 Breadth** | `#{ feeds f : FSS_f > 0 }` | ≥1 | monotonically growing | drops vs prior period | per release + monthly | PL · FR-15 |
| **K-8 Sharpness** | mean interval width `(1/N)Σ(hi−lo)` reported *with* PICP | report-only | minimize s.t. K-2 holds | width grows while PICP unchanged (coverage-gaming) | per scoring run | P-D · NFR-4 |
| **K-9 Pinball loss** | `(1/N)Σ_q Σ ρ_q(y−ŷ_q)`, `ρ_q(u)=max(qu,(q−1)u)` | below baseline pinball | downward trend | above baseline | per scoring run | P-D · skill.py |
| **K-10 Refusal correctness** | `correct_refusals / total_out_of_grounding` | `≥ 0.99` | `≥ 0.999` | `< 0.99` (fabrication leak) | per release (eval set) + spot-checks | P-E · FR-18, P-1/P-2 |
| **K-11 Drift detection lead** | `t(FSS_collapse) − t(PSI/ECE_alarm)` (want positive) | alarm before FSS collapse on injected shift | larger lead | alarm fires after collapse | per drift-eval run | P-D · FR-16 |
| **K-12 Availability** | `successful_predict / total_predict` | `≥ 0.990` | `≥ 0.995` | `< 0.990` over window | rolling, daily | SRE · NFR-7 |

**KPI computation rules (normative).** (i) Every KPI **MUST** be computed only over **resolved** forecasts (K-1…K-4, K-6, K-8, K-9) except latency/availability/refusal which are request-time. (ii) Every reported skill KPI **MUST** name its baseline inline. (iii) A KPI with `N` below the minimum-sample floor (defined in §08) is reported as "insufficient sample", not as a pass or fail. (iv) Thresholds here are the *charter* targets; §11 §3.5 holds the executable assertions and any per-feed tightening.

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

#### 1.10.1.1 Functional sub-requirements (FR-x.y)

Sub-requirements decompose the parent FR into independently testable obligations. Each inherits its parent's priority unless overridden and carries its own acceptance hook. These exist so the traceability stub (§1.12) can bind at fine grain and no parent FR is "passed" while a sub-obligation is unbuilt.

| ID | Sub-requirement (the system **MUST** …) | Parent | Verify (acceptance hook) |
|----|------------------------------------------|--------|--------------------------|
| **FR-1.1** | Extract the **target** entity/series from free text. | FR-1 | Labeled-set target accuracy ≥95%. |
| **FR-1.2** | Extract the **horizon** (and units) or apply a documented default. | FR-1 | Horizon parse correct or default applied + flagged. |
| **FR-1.3** | Extract the **operator** (point vs `P(>x)` vs risk vs regime vs scenario). | FR-1 | Operator routed to correct UC archetype. |
| **FR-1.4** | Return a structured "could not parse" signal (not a guess) on ambiguous input. | FR-1, FR-18 | Ambiguous fixture → clarify/refuse, never fabricate. |
| **FR-3.1** | Attach the contributing **lake series ID(s)** to every forecast record. | FR-3 | Each forecast row references ≥1 series_id. |
| **FR-3.2** | Block emission of any number when no grounded series resolves. | FR-3, FR-18 | No-source ask → refusal, not a number. |
| **FR-4.1** | Normalize every feed to the shared `series` row shape `(source,symbol,ts,value,meta)`. | FR-4 | Schema validation on ingest. |
| **FR-4.2** | Isolate per-feed ingestion errors (one failed feed cannot abort others). | FR-4, NFR-8 | Kill one feed → others still write rows. |
| **FR-4.3** | Idempotent upsert keyed on `(source,symbol,ts)`. | FR-4 | Re-ingest same window → no duplicate rows. |
| **FR-5.1** | Compute cross-series lead-lag (lag + strength) between candidate driver and target. | FR-5 | Synthetic lead recovered within tolerance. |
| **FR-5.2** | Attach the discovered driver list (with lags) to the answer object. | FR-5, FR-9 | Drivers present in response. |
| **FR-8.1** | Produce a conformal interval at each requested nominal level. | FR-8 | Interval present per level. |
| **FR-8.2** | Use realized residuals from the outcome store when available, else cold-start residuals with a caveat. | FR-8 | Cold-start path emits caveat; warm path uses Lake residuals. |
| **FR-9.1** | Validate the response against the §07 schema before emission. | FR-9 | Response validator rejects malformed objects. |
| **FR-9.2** | Populate `baseline` with the named reference used for skill. | FR-9, K-1 | `baseline` field non-empty + matches scorer. |
| **FR-11.1** | Write a forecast row at issue time with all reproduction fields. | FR-11, NFR-11 | Row written; fields complete. |
| **FR-11.2** | Link the realized outcome when observable; keep "pending" until then. | FR-11 | Pending honored; outcome linked on maturity. |
| **FR-12.1** | Compute CRPS, RMSE, PICP, FSS per (feed, method) on resolution. | FR-12 | Scoring job emits all four per feed/method. |
| **FR-12.2** | Expose the skill **trend** (slope over trailing window) per feed. | FR-12, K-6 | Trend queryable; slope computed. |
| **FR-16.1** | Compute PSI on input-series distribution (reference vs recent). | FR-16 | Injected shift → PSI crosses threshold. |
| **FR-16.2** | Compute ECE on forecast confidence vs realized hits. | FR-16 | Miscalibration → ECE crosses threshold. |
| **FR-16.3** | Fire an alarm/retrain trigger when either crosses its threshold. | FR-16, K-11 | Threshold crossing → trigger fires before FSS collapse. |
| **FR-18.1** | Refuse when grounding is absent (EC-1/EC-2). | FR-18 | Out-of-grounding → refusal w/ reason. |
| **FR-18.2** | Hedge (widen/decline) when horizon exceeds the information limit (EC-3). | FR-18, P-2 | Over-horizon ask → honest width or decline. |
| **FR-19.1** | Tag every emitted method with a source reference resolvable to §02/§03. | FR-19 | Source tag resolves; no untagged method. |

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

#### 1.10.2.1 Non-functional sub-requirements (NFR-x.y)

| ID | Sub-requirement (the system **MUST** …) | Parent | Verify (acceptance hook) |
|----|------------------------------------------|--------|--------------------------|
| **NFR-1.1** | Meet warm `p95 ≤ 8 s` end-to-end. | NFR-1 | Load test p95 within budget. |
| **NFR-1.2** | Meet cached/short-horizon `p95 ≤ 2 s`. | NFR-1 | Cached-path load test within budget. |
| **NFR-3.1** | Keep `|PICP − (1−α)| ≤ 0.05` at each active nominal level. | NFR-3 | Rolling PICP per level within band. |
| **NFR-6.1** | Produce forecasts on CPU/NumPy when GPU/remote inference is absent. | NFR-6 | Disable GPU → forecasts still produced. |
| **NFR-6.2** | Yield identical-within-tolerance results on CPU vs GPU paths. | NFR-6, NFR-12 | Forced-NumPy path matches GPU path within tolerance. |
| **NFR-8.1** | Mark answers built on stale data with a stale flag. | NFR-8 | Stale feed → stale flag set. |
| **NFR-8.2** | Keep unrelated forecasts unaffected by a dead feed. | NFR-8 | Kill one feed → others succeed. |
| **NFR-9.1** | Maintain zero unmapped FR/NFR in the traceability matrix. | NFR-9 | Matrix has 0 orphans. |
| **NFR-9.2** | Maintain zero untested requirements. | NFR-9 | Every requirement → ≥1 test ID. |
| **NFR-11.1** | Persist inputs, model, weights, version, timestamp per forecast. | NFR-11 | Reproduction record retrievable by `forecast_id`. |
| **NFR-13.1** | Reject any response missing an interval/probability. | NFR-13 | Validator rejects uncertainty-less response. |
| **NFR-13.2** | Reject any response missing a caveat field. | NFR-13 | Validator rejects caveat-less response. |
| **NFR-14.1** | Confine new-domain changes to adapters/specialists (no core edits). | NFR-14 | Static check: new-domain PR touches only adapters/specialists. |

### 1.10.3 Requirement priority key
- **P0** — must ship in v1 / hard acceptance gate. **P1** — must ship within the v2–v50 expansion. **P2** — hardening (v51–v150).

### 1.10.4 RACI for requirements ownership

Ownership of each requirement family is fixed so that authorship, implementation, verification, and sign-off never fall between roles. **R** = Responsible (does the work), **A** = Accountable (single owner, signs off), **C** = Consulted, **I** = Informed. Roles map to the §13 build-plan owners (PL, DE, BE, DS, MLE, QA, SRE, GOV) plus the personas they serve.

| Requirement family | R | A | C | I |
|--------------------|---|---|---|---|
| FR-1, FR-2 (NL intake & routing) | BE | PL | DS, P-A | QA, P-C |
| FR-3, FR-4 (grounding & ingestion) | DE/BE | PL | GOV (provenance) | QA, P-E |
| FR-5, FR-6 (pattern discovery) | DS | PL | MLE | QA, P-B |
| FR-7, FR-13 (relational/KGIK + edge learning) | DS/MLE | PL | BE | QA |
| FR-8, FR-10 (calibration & ensemble) | DS | PL | MLE | QA, P-B |
| FR-9, FR-20 (answer object & contract) | BE | PL | P-C | QA, P-A |
| FR-11, FR-12, FR-14 (persist, score, scorecard) | DS/MLE | PL | BE | P-D, P-E |
| FR-15 (domain extensibility) | BE | PL | DS | QA |
| FR-16 (drift/calibration alarms) | MLE | PL | DS, SRE | P-D |
| FR-17 (scenario/counterfactual) | DS | PL | BE | P-B |
| FR-18, FR-19 (refusal & provenance) | BE/GOV | PL | DS | P-E |
| NFR-1, NFR-5, NFR-7 (latency/scale/availability) | SRE | PL | BE, MLE | P-C |
| NFR-2, NFR-3, NFR-4 (skill/coverage/sharpness) | DS | PL | MLE | P-D |
| NFR-6, NFR-12 (CPU fallback & reproducibility) | MLE | PL | BE | QA |
| NFR-8 (feed-failure tolerance) | BE/SRE | PL | DE | QA |
| NFR-9 (traceability) | QA/PL | PL | all | all |
| NFR-10, NFR-15 (license/patent & governance) | GOV | PL | DS, BE | P-E |
| NFR-11, NFR-13, NFR-14 (auditability, honesty gate, core-isolation) | BE | PL | GOV | P-E, QA |

> **RACI rule (normative).** Exactly one **A** per family. Any requirement lacking an **A** **MUST NOT** pass the section gate (§1.11). The **A** signs the requirement's acceptance hook as green before release.

### 1.10.5 Explicit acceptance hooks per requirement (consolidated)

The `Verify` columns above state each hook inline. This consolidated view pins each FR/NFR (and its sub-requirements) to the **test level** that owns it in `11_VALIDATION_AND_TEST_PLAN.md`, so the section is "execution-ready" with no requirement lacking a home test level. (Test-level taxonomy and the executable assertions live in §11; this is the binding stub.)

| Requirement(s) | Owning test level (§11) | Representative test artifact |
|----------------|-------------------------|------------------------------|
| FR-1.*, FR-2 | Integration (§11 §2.2) | `test_routes.py` NL→route fixtures |
| FR-3.*, FR-4.* | Unit + Integration (§2.1, §2.2) | `test_history_lake.py`, `test_ingestion.py` |
| FR-5.*, FR-6 | Unit (§2.1 C/D/G) | `test_pattern_engine.py` |
| FR-7, FR-13 | Unit (§2.1) | `test_relational.py`, `test_self_improve.py` |
| FR-8.*, FR-10 | Unit + Calibration (§2.1 B, §4) | `test_conformal.py`, `test_ensemble.py` |
| FR-9.*, FR-20, NFR-13.* | Contract (§2.3) | `07_API_CONTRACTS.md` contract tests |
| FR-11.*, FR-12.*, FR-14 | Self-improvement (§5) + Backtest (§3) | `test_self_improve.py`, `backtest/` |
| FR-15, NFR-14.* | Static/architecture check (§8) | new-domain PR scope check |
| FR-16.* | Self-improvement (§5) + Chaos (§9) | drift-injection test |
| FR-17 | Unit (§2.1) | counterfactual fixture |
| FR-18.*, K-10 | Integration + negative-control (§2.2, §8.3) | refusal fixtures |
| FR-19.* | Contract/audit (§2.3, §12) | provenance-tag resolution test |
| NFR-1.*, NFR-7 | Performance (§8.5) | latency/availability load test |
| NFR-2/3/4 | Backtest + Calibration (§3.5, §4) | skill/coverage gates |
| NFR-6.*, NFR-12 | Determinism (§6) | forced-NumPy + fixed-seed reproduction |
| NFR-8.* | Chaos (§9) | feed-kill injection |
| NFR-9.* | CI gate (§8) | traceability-matrix check |
| NFR-10, NFR-15 | Governance (§12) | license/patent audit, PII rejection |
| NFR-11.* | Audit (§12) | reproduction-record retrieval |

---

## 1.11 ACCEPTANCE GATE FOR THIS SECTION
This section is "execution-ready" when: (a) every mission clause M-1…M-7 maps to ≥1 requirement; (b) every UC and persona maps to ≥1 requirement; (c) every FR/NFR has a unique ID, a priority, a trace, and a verify hook; (d) every principle P-1…P-6 is enforced by ≥1 requirement; and (e) scope is fully partitioned into IN/OUT with no overlap. The traceability obligations stated here are discharged in `11_VALIDATION_AND_TEST_PLAN.md` and the end-to-end traceability matrix (v101–v150).

Additional gate clauses added at this depth milestone: (f) every persona has a journey (J-A…J-E) whose every step binds to a requirement; (g) every capability-matrix row (§1.3.1) is tiered and traces to §02/§03 + ≥1 build task; (h) every KPI (K-1…K-12) has a formula, threshold, and cadence (§1.4.4); (i) every requirement family has exactly one **A** owner (§1.10.4); and (j) every FR/NFR appears in the traceability stub (§1.12) with a build-task and test binding.

---

## 1.12 REQUIREMENTS-TRACEABILITY STUB (requirement → build task → test)

This stub is the **charter-level seed** of the full matrix that `T-048` produces alongside `11_VALIDATION_AND_TEST_PLAN.md`. It binds each FR/NFR to the build-plan task ID(s) from `13_PHASED_BUILD_PLAN.md` (`T-###`) and to the owning test artifact/level in `11_VALIDATION_AND_TEST_PLAN.md`. It is intentionally a **stub**: it proves zero-orphan coverage at section scope; the fine-grained per-component matrix is discharged downstream (NFR-9). Where a requirement is satisfied by already-audited code, the build task is marked `(existing §02)`.

| Requirement | Build task(s) (§13) | Test artifact / level (§11) | Test ref |
|-------------|---------------------|------------------------------|----------|
| FR-1 (+1.1–1.4) | T-038 (routing), intake in §09 | Integration §2.2 | `test_routes.py` |
| FR-2 | T-038 | Integration §2.2 | `test_routes.py` |
| FR-3 (+3.1–3.2) | T-001, T-003, T-008 | Unit+Integration §2.1/§2.2 | `test_history_lake.py` |
| FR-4 (+4.1–4.3) | T-004, T-005, T-006, T-007 | Unit+Integration §2.2 | `test_ingestion.py` |
| FR-5 (+5.1–5.2) | T-021, T-018, T-015 | Unit §2.1 G | `test_pattern_engine.py` |
| FR-6 | T-018, T-019, T-020 | Unit §2.1 C/D | `test_pattern_engine.py` |
| FR-7 | T-034, T-035 | Unit §2.1 | `test_relational.py` |
| FR-8 (+8.1–8.2) | T-011, T-012, T-013 | Unit+Calibration §2.1 B/§4 | `test_conformal.py` |
| FR-9 (+9.1–9.2) | T-008, §07 contract | Contract §2.3 | `07_API_CONTRACTS.md` tests |
| FR-10 | T-014, T-015, T-040 | Unit §2.1 H | `test_ensemble.py` |
| FR-11 (+11.1–11.2) | T-008, T-009 | Self-improve §5 | `test_self_improve.py` |
| FR-12 (+12.1–12.2) | T-024, T-027, T-028 | Backtest §3 + §5 | `test_backtest.py` |
| FR-13 | T-026, T-035 | Self-improve §5 | `test_self_improve.py` |
| FR-14 | T-016, T-028 | Self-improve §5 / Contract §2.3 | `test_skill.py`, `skill` route |
| FR-15 | T-005 (adapter pattern), NFR-14 check | Static/CI §8 | new-domain scope check |
| FR-16 (+16.1–16.3) | T-025 | Self-improve §5 + Chaos §9 | `test_self_improve.py` |
| FR-17 | T-031, T-032, T-033 | Unit §2.1 | `test_causal.py` |
| FR-18 (+18.1–18.2) | T-038, T-013 (caveat) | Integration + negative-control §2.2/§8.3 | refusal fixtures |
| FR-19 (+19.1) | T-042, provenance tagging | Contract/audit §2.3/§12 | provenance test |
| FR-20 | T-008, §07 versioning | Contract §2.3 | contract tests |
| NFR-1 (+1.1–1.2) | T-044, T-045 | Performance §8.5 | latency load test |
| NFR-2 | T-027 | Backtest §3.5 | skill gate |
| NFR-3 (+3.1) | T-011, T-024 | Calibration §4 | coverage gate |
| NFR-4 | T-016, T-024 | Calibration §4 | sharpness check |
| NFR-5 | T-041, scale projections §10 | Performance §8.5 | capacity test |
| NFR-6 (+6.1–6.2) | T-039, T-041 | Determinism §6 | `test_gpu_client.py` |
| NFR-7 | T-044, T-045 | Performance/monitor §8.5 | availability monitor |
| NFR-8 (+8.1–8.2) | T-006 (error isolation), T-046 | Chaos §9 | feed-kill injection |
| NFR-9 (+9.1–9.2) | T-048 | CI gate §8 | traceability check |
| NFR-10 | T-042 | Governance §12 | license/patent audit |
| NFR-11 (+11.1) | T-008, T-009 | Audit §12 | reproduction-record retrieval |
| NFR-12 | T-043, conftest seeds | Determinism §6 | fixed-seed reproduction |
| NFR-13 (+13.1–13.2) | T-013, §07 validator | Contract §2.3 | response validator |
| NFR-14 (+14.1) | T-047, FR-15 check | Static/CI §8 | core-isolation check |
| NFR-15 | T-047 | Governance §12 | PII rejection / authz |

> **Stub completeness check (normative).** Every FR-1…FR-20 and NFR-1…NFR-15 appears exactly once above with a non-empty build-task and a test ref ⇒ **zero orphans at charter scope** (discharges NFR-9 at this level). Any future requirement added to §1.10 **MUST** add a row here in the same change, or the section gate (§1.11) fails.

---
*End of Section 01 — MISSION & SCOPE. Next: `02_CURRENT_STATE_AUDIT.md` (the grounded code inventory this charter rests on).*
