# 14 — RISKS, LIMITS & IRREDUCIBLE UNCERTAINTY
**Document:** PATTERN ORACLE — Section 14 of the Master Engineering Spec
**Parent:** `00_MASTER_INDEX.md`
**Document class:** Master Engineering Spec · military-grade · ISO-execution depth
**Status:** living document (v1 → v150). This section is **normative on honesty**: it fixes what the engine *cannot* do, why those limits are fundamental rather than fixable, and the failure modes that must be designed against.
**Owner:** APEX / KGIK prediction program. Risk register owners named per row in §14.7.
**Normative language:** **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** per RFC 2119 / RFC 8174.

---

## 14.0 PURPOSE OF THIS SECTION
This section is the **honesty backbone** of PATTERN ORACLE. It separates *irreducible* uncertainty (a property of the world and of information theory — no model removes it) from *reducible* technical risk (engineering defects we can mitigate). It then catalogues the engine's failure modes (FMEA), distinguishes techniques that genuinely raise accuracy from oversold claims, and maintains a residual-risk register with named owners.

> **Why this section is load-bearing.** The mission (§01, P-1/P-2/M-7) forbids invented capability and forbids precision beyond the information-theoretic limit of the data. This section is where that promise is made operational: it tells the orchestrator (§09) and the answer contract (§07) *when to return a wide interval, a probability, or an explicit refusal* instead of a falsely sharp number.

> **Grounded, not invented.** Every claimed accuracy gain in §14.6 cites a mechanism in the evidence base (`03_EVIDENCE_BASE.md`) or existing audited code (`02_CURRENT_STATE_AUDIT.md`). Every claimed *limit* cites the underlying principle (information theory, market microstructure efficiency, USGS hazard doctrine).

---

## 14.1 IRREDUCIBLE UNCERTAINTY (the honest core)

### 14.1.1 The information-theoretic bound on forecast skill
Forecast skill is **bounded from below in error** by the conditional entropy of the future given everything the engine can observe:

```
H(Y_future | X_available)  ≥  0
```

- `Y_future` is the quantity asked about (price, magnitude, position, link).
- `X_available` is the *total* information the engine can condition on (History Lake feeds, KGIK edges, drivers).
- The **irreducible error floor** of any predictor of `Y_future` is set by `H(Y_future | X_available)`. No amount of model capacity, parameters, or compute can drive predictive error below this floor, because the floor measures information that is *not present in the data at all* (Cover & Thomas, *Elements of Information Theory*; Fano's inequality relates this entropy to a hard lower bound on error probability).
- Two consequences the engine MUST respect:
  1. **More parameters cannot manufacture missing information.** A 10B-parameter model and a 10M-parameter model face the *same* floor; capacity only helps approach it, never breach it (see §14.6 anti-claim "more params = better").
  2. **The floor is the right target.** A *well-calibrated* model that reports `H(Y|X)`-sized uncertainty is operating correctly; a model that reports *less* uncertainty than `H(Y|X)` is **miscalibrated and dishonest**, not "more accurate."

### 14.1.2 Uncertainty grows with horizon
For chaotic / stochastic systems, conditional entropy is **non-decreasing in the forecast horizon** `h`:

```
H(Y_{t+h} | X_t)   is non-decreasing in h
```

Drivers:
- **Sensitive dependence on initial conditions** (chaos): small state errors amplify; the practical horizon is bounded by the system's largest Lyapunov exponent (the "predictability horizon" — cf. numerical-weather-prediction doctrine, the basis for the ensemble loop cited in §03).
- **Accumulating innovation variance**: in any stochastic process with i.i.d. shocks (e.g. a random walk / GBM as used in `prediction.py`), the variance of the forecast grows ~linearly with `h`, so the interval **must** widen with horizon.

**Requirement (FR-8 / NFR-3 binding):** the answer contract (§07) MUST widen the reported interval monotonically with horizon. An interval that does *not* widen with horizon is a calibration bug (detected per §14.5 FM-7).

### 14.1.3 Fundamentally stochastic questions — examples we MUST NOT fake
Some questions ask for a *single realized value of a stochastic process at a distant time* or *the exact timing of a point event*. These have large, often dominant, `H(Y|X)`. For them the engine returns **calibrated distributions / probabilities, never fake точность** (never fake precision):

| Question archetype | Example | Why it is irreducibly uncertain | Honest output |
|--------------------|---------|---------------------------------|---------------|
| Distant single-value of a near-efficient series | "Exact XRP price on a given day in 2029" | Long horizon × weak-form efficiency ⇒ `H` ≈ full unconditional variance; point value is essentially unpredictable | A wide predictive **distribution** (quantiles) + explicit "dominated by uncertainty" caveat — **no point claim** |
| Exact timing of a point event | "The exact minute of the next M≥6 quake near a city" | Earthquake nucleation timing is not deterministically predictable with current science (USGS) | A **hazard probability** over a window (e.g. P(M≥6 in 30 d within 200 km)) — never a timestamp |
| Single draw of a high-entropy process | "Exact lottery / single coin flip outcome" | Outcome entropy = process entropy; data carries ~zero conditioning information | Probability only (e.g. 0.5) — refuse a deterministic claim |

**Doctrine:** for these, the engine MUST surface a distribution/probability + assumptions + caveats, and SHOULD state plainly that the residual uncertainty is **fundamental, not a model flaw**. This is the single most important honesty rule in the spec.

---

## 14.2 LIMITS BY DOMAIN — what is genuinely predictable vs not

> The engine is domain-agnostic (§01.3), but the *shape and ceiling* of achievable skill differs sharply by domain because the underlying `H(Y|X)` differs. The orchestrator (§09) MUST select the honest output shape per domain.

| Domain | Genuinely predictable | NOT predictable | Honest output shape | Grounding |
|--------|-----------------------|-----------------|---------------------|-----------|
| **Markets / crypto / FX** | Short-horizon **volatility & distribution** (volatility clusters; GARCH-style persistence); relative/conditional moves | The **direction/level** of a near-efficient price at meaningful horizon (weak-form efficiency ⇒ returns ≈ a martingale difference; signal decays fast) | Short-horizon predictive **distribution** + P(>x); widen fast with h; FSS measured vs random-walk baseline (§08) | `prediction.py` GBM-MC/Holt; EMH (Fama) weak form; §03 |
| **Seismic / geophysical hazard** | **Hazard probabilities** over space-time windows (Gutenberg–Richter rate, Omori aftershock decay) | **Deterministic timing** of a specific event ("the exact day/minute") — explicitly per **USGS**: earthquakes cannot be predicted, only their probability characterized | **Probability + interval** over a window; never a timestamp | `prediction.py` G–R/Omori; USGS hazard doctrine |
| **Trajectory / kinematics** | **Good short-horizon prediction given a clean state vector** (position+velocity) — near-deterministic for ballistic/orbital arcs | Long arcs under unmodeled forces (drag, maneuvers, perturbations) where state error compounds | Position + **uncertainty cone** widening with time | great-circle / orbital / ballistic in `prediction.py` |
| **Relational / cross-entity** | **Link likelihoods** and conditional "if A then B" tendencies from observed co-movement / graph edges | Asserted **causation** without identification; novel links with no history (cold edges) | Edge/link **probability** + conditional forecast + caveat that it is association unless a causal screen passed | KGIK graph; TGN/TGAT, xERTE (§03,§06) |
| **Rare / cold-start entities** | Little to nothing until ≥ a minimum observation count accrues | Anything sharp under <100 obs | Fall back to climatology/prior + **wide** interval; flag low-confidence | §14.3 R-2 cold-start |

**Rule:** A domain's honest ceiling is its `H(Y|X)`. The engine MUST NOT present a market level forecast with the same confidence shape as a ballistic trajectory; the contract's `confidence`/`caveats` fields encode the difference.

---

## 14.3 TECHNICAL RISKS (reducible — engineering defects to design against)

These are *not* irreducible; they are risks we own and mitigate. IDs `R-*` are referenced by the residual register (§14.7) and the test plan (§11).

| ID | Risk | Description | Primary mitigation | Detection |
|----|------|-------------|--------------------|-----------|
| **R-1** | **Feed outage / ToS / rate-limit** | USGS, CoinGecko, FX feeds go down, change terms, or throttle; ingestion (§05) stalls or gets blocked | Cache last-good in History Lake; backoff + jitter; multi-source per signal; ToS-compliant cadence; serve from lake when live feed is dead with staleness flag | Feed-age monitor; HTTP 429/4xx/5xx alarms |
| **R-2** | **Cold-start (new entity, <100 obs)** | Insufficient history ⇒ unstable fits, false-sharp intervals | Minimum-obs gate; fall back to climatology/prior + wide interval; pooled/hierarchical priors from similar entities (KGIK neighbours) | Obs-count check at request time |
| **R-3** | **Data poisoning** | Adversarial or corrupt feed values bias models / KGIK edges | Robust ingest validation (range/units/dedup), outlier screens, change-point sanity, source trust weights; quarantine suspicious batches | Anomaly + PSI spike on ingest; source-reputation drop |
| **R-4** | **Miscalibration of foundation models** | Zero-shot foundation TS models (TimesFM/Chronos) produce **uncalibrated** native intervals | **MUST wrap every foundation/ensemble output in conformal calibration** (EnbPI, §06) — calibration is a *separate guaranteed-coverage layer*, never trusted from the base model | Empirical coverage vs nominal in backtest (§08) |
| **R-5** | **Concept drift** | The data-generating process shifts; stale model loses skill | Continuous backtest (§08); PSI/ECE drift alarms (`ai_models.py` building blocks); retrain/re-weight triggers; change-point detection (PELT/BOCPD) | PSI > threshold; FSS decline; ECE rise |
| **R-6** | **Leakage in backtests** | Look-ahead / target leakage inflates offline skill, collapses live | Strict point-in-time splits; walk-forward only; feature timestamps ≤ forecast origin; leakage lint in test harness (§11) | Offline-vs-live skill gap monitor |
| **R-7** | **GPU not installed** | CuPy/torch/Ray referenced but absent (audit §1.2 gap 7); foundation model can't run on GPU path | **Degrade gracefully**: `gpu_backend.py` CuPy↔NumPy drop-in; CPU/classical ensemble path; optional remote inference (`PREDICT_GPU_URL`); never hard-fail an answer for lack of GPU | Capability probe at startup; path-used telemetry |
| **R-8** | **Two-backend integration fragility** | JARVIS predictor and the 464-method registry / optimizer / temporal_nodes are disjoint (audit §1.2 gap 4); cross-backend calls flaky | Versioned internal contracts (§07); timeouts + circuit breakers; feature flags per backend; integration test matrix (§11) | Cross-backend error-rate + latency SLO breach |
| **R-9** | **Self-improvement feedback corruption** | Mis-scored outcomes re-weight models the wrong way (garbage-in to the learning loop) | Outcome validation before scoring; immutable forecast records; human-review gate on large weight swings | Skill-trend regression alarm |

---

## 14.4 (reserved — see §14.5 FMEA, §14.6 hype-vs-reality, §14.7 residual register)

---

## 14.5 FAILURE MODES & EFFECTS ANALYSIS (FMEA)

Severity **S**, Likelihood **L**, Detection difficulty **D** each on 1–5 (5 = worst / hardest to detect). **RPN = S × L × D** (higher = prioritize). Owners per row map to §14.7.

| ID | Component | Failure | Effect | S | L | D | RPN | Detection | Mitigation |
|----|-----------|---------|--------|---|---|---|-----|-----------|------------|
| **FM-1** | History Lake ingestion (§05) | Feed outage / stale data served as fresh | Forecast on stale world-state; silent skill loss | 4 | 4 | 3 | 48 | Feed-age + freshness watermark alarm | Staleness flag in answer; cache last-good; multi-source (R-1) |
| **FM-2** | Foundation TS model (§06) | Uncalibrated native interval taken at face value | Over-confident interval; coverage < nominal | 5 | 4 | 4 | 80 | Empirical coverage backtest (§08) | Mandatory EnbPI conformal wrap (R-4) |
| **FM-3** | Conformal layer (§06) | Calibration set non-exchangeable / drifted | Coverage guarantee voided | 5 | 3 | 4 | 60 | Rolling coverage vs nominal; drift alarm | Re-fit on recent window; drift-aware conformal; widen on alarm |
| **FM-4** | Compute path (§10) | GPU absent / remote inference unreachable | Foundation path unavailable | 3 | 4 | 1 | 12 | Startup capability probe | Graceful CPU/classical fallback (R-7) |
| **FM-5** | Causal/relational screen (§06) | Spurious "driver" (correlation as cause) | Misleading attribution; bad scenario | 4 | 4 | 4 | 64 | Out-of-sample driver stability; Granger/CCM screen | Label as association unless screen passes; caveat in answer |
| **FM-6** | Backtest harness (§11) | Look-ahead leakage | Inflated offline skill; live collapse | 5 | 3 | 4 | 60 | Offline-vs-live gap; leakage lint | Point-in-time walk-forward only (R-6) |
| **FM-7** | Answer contract (§07) | Interval does not widen with horizon | False precision at long h; honesty breach | 5 | 3 | 3 | 45 | Horizon-monotonicity check (§14.1.2) | Enforce monotonic widening; reject non-widening forecast |
| **FM-8** | Self-improvement loop (§08) | Mis-scored outcome re-weights models wrongly | Skill *degrades* over time | 5 | 2 | 4 | 40 | Skill-trend regression alarm | Outcome validation; human gate on large swings (R-9) |
| **FM-9** | Orchestrator (§09) | Wrong intent/target/horizon extraction | Answers the wrong question confidently | 4 | 3 | 3 | 36 | Verifier echo of parsed intent; user confirm | Verifier step; return parsed intent in answer for confirmation |
| **FM-10** | Two-backend bridge (§07/§10) | Cross-backend call timeout/contract drift | Partial degradation or 5xx | 3 | 4 | 2 | 24 | Cross-backend SLO + circuit-breaker state | Timeouts, circuit breaker, versioned contract (R-8) |
| **FM-11** | Ingestion validation (§05) | Poisoned/corrupt values accepted | Biased models + corrupted KGIK edges | 5 | 2 | 4 | 40 | PSI spike on ingest; reputation drop | Robust validation + quarantine (R-3) |

> **Process:** RPN ≥ 50 rows are **must-mitigate before promotion to a maturity milestone**; the v51–v100 ladder pass (§00 §4) is where this table is fully populated and gated against the test matrix.

---

## 14.6 HYPE vs REALITY — what genuinely improves accuracy

> Doctrine: the engine adopts a technique **only if it has a grounded mechanism for raising skill or calibration**, and it labels honestly *which* it does. **Calibration ≠ accuracy.** Several heavily-marketed claims do not survive the information-theoretic bound (§14.1) and are explicitly rejected as guarantees.

### 14.6.1 Genuinely helps (adopt — with honest magnitude)
| Technique | What it actually buys | Typical realistic gain | What it does NOT do | Grounding |
|-----------|-----------------------|------------------------|---------------------|-----------|
| **Ensembling** (error-weighted) | Variance reduction across diverse models | **~+2–5%** error reduction (diminishing with correlation) | Cannot beat `H(Y|X)`; correlated members add little | Error-Weighted Ensemble (WO2014075108A2, §03) |
| **Retrieval / TS-RAG** (analog/motif retrieval) | Conditions forecast on similar historical regimes | **~+3–7%** when good analogs exist | Useless when no analog exists (novel regime) | Matrix Profile / motif retrieval (§03,§06) |
| **Conformal calibration** (EnbPI) | **Coverage guarantee** — intervals that mean what they say | **Calibration, NOT accuracy** — sharpens honesty, not the point estimate | Does not lower point error; only fixes interval coverage | EnbPI (§03,§06); R-4 |
| **Test-time training / adaptation** | Local adaptation to the most recent regime | **~+1–2%** | Marginal; can hurt under noise/drift if unregularized | §03 deep methods |

### 14.6.2 Oversold — reject as guarantees (use with skepticism, never as marketing)
| Hype claim | Reality |
|------------|---------|
| **"Zero-shot beats fine-tuned"** | Generally false on in-domain data with adequate history; zero-shot is a strong *cold-start prior*, not a universal winner. Fine-tuning/local fit usually wins where data exists. Treat foundation zero-shot as a baseline, not a ceiling. |
| **"More parameters = better"** | Bounded by `H(Y|X)` (§14.1.1). Past the point of approaching the floor, extra capacity adds cost and overfitting risk, not skill. |
| **"World models predict anything"** | A world/latent model (JEPA/Dreamer-style, §03) improves *representation*, not the irreducible entropy of genuinely stochastic targets. It cannot forecast a high-`H` single draw (§14.1.3). |
| **"AI removes uncertainty"** | No. The honest engine *quantifies* uncertainty; it never removes the irreducible part. A sharper-looking interval with worse coverage is a regression, not progress. |

> **Reporting rule:** any accuracy gain the engine claims internally or to users MUST be expressed as **FSS vs a named baseline** (§08), measured on point-in-time backtests (R-6 guarded), not as a vendor-style percentage in isolation.

---

## 14.7 RESIDUAL-RISK REGISTER (post-mitigation, with owners)

After mitigations, **residual** risk remains. This register is **append-only-corrected** (changes logged in `VERSION_LOG.md`). Residual severity uses Low/Med/High; "Accepted?" records the program's explicit decision.

| ID | Residual risk (after mitigation) | Residual sev. | Owner (role) | Accepted? | Review cadence |
|----|----------------------------------|---------------|--------------|-----------|----------------|
| **RR-1** | Irreducible forecast uncertainty at long horizon / high-`H` targets | **High (by nature)** | Program Lead (APEX) | **Accepted** — fundamental, surfaced honestly (§14.1) | n/a (doctrine) |
| **RR-2** | Residual feed unavailability despite caching/multi-source | Med | Data/Ingestion Owner (P-* steward) | Accepted w/ staleness flag | Monthly |
| **RR-3** | Cold-start entities below min-obs still answered with wide priors | Med | MLOps Steward (P-D) | Accepted w/ low-confidence flag | Per new feed |
| **RR-4** | Subtle calibration drift between conformal re-fits | Med | Forecast-Core Owner | Accepted w/ rolling coverage monitor | Weekly |
| **RR-5** | Undetected backtest leakage in a new feature | Med→High | Validation Owner (§11) | **Not accepted** — gate before release | Per feature |
| **RR-6** | Spurious causal driver passes screen by chance | Med | Pattern/Relational Owner | Accepted w/ association caveat | Quarterly |
| **RR-7** | Two-backend contract drift after independent deploys | Med | Platform/Integration Owner | Accepted w/ versioned contracts + CI | Per release |
| **RR-8** | GPU-absent degraded mode lowers foundation-path skill | Low | Compute Owner (§10) | Accepted — classical fallback documented | Per environment |
| **RR-9** | Self-improvement loop re-weights on a mis-scored outcome | Med | MLOps Steward (P-D) | Accepted w/ human gate on large swings | Continuous |
| **RR-10** | Adversarial data poisoning evades validation | Med | Security/Governance Owner (§12) | Accepted w/ quarantine + reputation | Quarterly |

> **Governance binding:** RR rows marked "Not accepted" are **release blockers** until mitigated to "Accepted." The v101–v150 hardening pass (§00 §4) binds each RR to an SLO/observability signal and a governance sign-off (§12), closing the requirement→component→test→risk traceability loop.

---

## 14.8 SECTION REQUIREMENTS (traceable)
| ID | Requirement | Bound to |
|----|-------------|----------|
| **RL-1** | The engine MUST report calibrated distributions/probabilities for high-`H` targets and MUST NOT emit a point claim it cannot ground. | §14.1.3, FR-8, P-2 |
| **RL-2** | Reported intervals MUST widen monotonically with horizon. | §14.1.2, FM-7 |
| **RL-3** | Every foundation/ensemble output MUST be wrapped in conformal calibration before reporting. | §14.3 R-4, FM-2 |
| **RL-4** | The engine MUST degrade gracefully without GPU and without any single feed. | R-1, R-7, FM-1, FM-4 |
| **RL-5** | Accuracy claims MUST be expressed as FSS vs a named baseline on point-in-time backtests. | §14.6, R-6, §08 |
| **RL-6** | Every RR row MUST have a named owner and review cadence; "Not accepted" rows are release blockers. | §14.7, §12 |
```
