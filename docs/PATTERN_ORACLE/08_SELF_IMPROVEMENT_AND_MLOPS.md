# 08 · SELF-IMPROVEMENT & MLOPS
**PATTERN ORACLE — Master Engineering Spec, Section 08**
**Document class:** ISO-execution depth · self-improving prediction engine
**Owner:** APEX / KGIK prediction program
**Upstream deps:** `05_DATA_MODEL_AND_SCHEMAS.md` (prediction + outcome store, KGIK schema), `06_ALGORITHMS.md` (forecast core, EnbPI, change-point), `07_API_CONTRACTS.md` (`/predict`, `/predict/skill`)
**Reused code:** `underworld/server/services/ai_models.py` — `drift_detector` (PSI), `calibration_error` (ECE), `uncertainty_estimate` (ensemble mean/std); `underworld/server/services/reasoning.py` — Laplace `_confidence(confirmations, trials)`; `underworld/server/db/models.py` — `CausalBelief`.

---

## 0. PURPOSE — "improve its own prediction ability"

This section specifies the **self-improvement engine**: the closed loop that makes PATTERN ORACLE *measurably better at forecasting over time* rather than a static predictor. The contract is concrete and falsifiable:

> **The system measurably improves: the rolling skill-score trend is ≥ 0 over N cycles on held-out walk-forward backtests, and calibration (coverage error, ECE) does not regress beyond tolerance.**

The engine has six interlocking subsystems, each numbered to match the task brief:

1. **FORECAST→OUTCOME loop** — every forecast persisted, matched to realized truth when the horizon elapses, scored.
2. **CONTINUOUS RE-FORECASTING** — numerical-weather-style "cycling": re-run on a cadence + on triggers, carry ensemble spread as uncertainty.
3. **DRIFT DETECTION** — PSI on inputs (reused), ECE on calibration (reused), KS on residuals, BOCPD change-point on the error series.
4. **MODEL RE-WEIGHTING & RETRAIN** — Error-Weighted Ensemble updated online; retrain triggers; champion/challenger + canary; registry lifecycle.
5. **KGIK LEARNING** — confirmed discovered patterns promote/strengthen KGIK edges (Laplace-smoothed, mirroring `CausalBelief`); unconfirmed edges decay.
6. **BACKTESTING harness** — walk-forward / rolling-origin, leakage guards, baseline comparison, reported at `/predict/skill`.

Plus **OBSERVABILITY** (§7): metrics, dashboards, alerts, runbooks.

A guiding non-negotiable from `00_MASTER_INDEX.md` §0: *calibrated honesty* — improvement is judged against information-theoretic baselines (climatology / persistence), never against a strawman.

---

## 1. FORECAST → OUTCOME LOOP

### 1.1 Data contract (from §05)

Every call to `POST /predict` persists one **`forecast`** row *before* returning to the user. The relevant fields (full schema in `05_DATA_MODEL_AND_SCHEMAS.md`):

```
forecast(
  forecast_id        TEXT PK,
  issued_at          TIMESTAMP,        -- t0, decision time
  target_key         TEXT,             -- series identifier in History Lake
  horizon_seconds    INTEGER,          -- h; outcome due at issued_at + h
  due_at             TIMESTAMP,        -- issued_at + horizon_seconds (indexed)
  point              REAL,             -- ŷ  (ensemble point forecast)
  pi_low             REAL,             -- lower bound of (1-α) prediction interval
  pi_high            REAL,             -- upper bound
  alpha              REAL,             -- miscoverage target (e.g. 0.10 → 90% PI)
  prob               REAL,             -- P(event) for binary/threshold queries (nullable)
  quantiles          JSON,             -- {q: value} sparse predictive CDF for CRPS
  member_preds       JSON,             -- per-model ensemble members (for spread + re-weight)
  model_versions     JSON,             -- {model_id: version} that produced this forecast
  baseline_point     REAL,            -- climatology/persistence reference at issue time
  baseline_pi        JSON,             -- baseline interval (for skill-of-interval)
  status             TEXT,             -- 'pending' | 'scored' | 'unmatchable' | 'expired'
  scored_at          TIMESTAMP NULL
)

outcome(
  forecast_id    TEXT FK,
  realized_at    TIMESTAMP,
  y_true         REAL,
  match_lag_s    INTEGER,              -- |realized_at - due_at|, for audit
  source         TEXT                  -- which feed confirmed it
)

skill_record(                          -- one row per scored forecast (denormalized for /skill)
  forecast_id    TEXT FK,
  target_key     TEXT,
  model_id       TEXT,                 -- the ensemble OR a single member, see 1.4
  horizon_bucket TEXT,                 -- '1h','1d','7d' bucketing for aggregation
  abs_error      REAL,
  sq_error       REAL,
  crps           REAL,
  pinball_50     REAL,
  in_interval    INTEGER,              -- 0/1 coverage indicator
  interval_width REAL,
  skill_score    REAL,                 -- vs baseline (see 1.3.5)
  scored_at      TIMESTAMP
)
```

### 1.2 Outcome-matching scheduler

A scheduler (`self_improve.outcome_matcher`) runs on a fixed tick (default **every 5 min**, configurable). On each tick:

```
ON TICK now:
  due = SELECT * FROM forecast
        WHERE status='pending' AND due_at <= now
  FOR EACH f IN due:
      y = lookup_realized(f.target_key, f.due_at, tol=MATCH_TOLERANCE[f.target_key])
      IF y is None:
          IF now - f.due_at > GRACE_WINDOW[f.target_key]:
              f.status = 'unmatchable'      # outcome never arrived (feed gap)
          # else leave pending, retry next tick
      ELSE:
          insert outcome(f.forecast_id, y.realized_at, y.value,
                         match_lag_s=|y.realized_at - f.due_at|, source=y.source)
          rec = score_forecast(f, y.value)   # §1.3
          insert skill_record(rec)
          f.status='scored'; f.scored_at=now
          emit_metrics(rec)                  # §7
          update_ensemble_weights(rec)       # §4.1 (online)
          maybe_promote_kgik(f, y.value)     # §5
```

`MATCH_TOLERANCE` is the allowed slack between `due_at` and the nearest realized observation (e.g. 60 s for FX, 1 h for daily series). `GRACE_WINDOW` is how long we wait before declaring a forecast `unmatchable` (prevents pending rows accumulating forever during feed outages).

**Leakage guard at match time:** `lookup_realized` MUST only read observations with `observed_at >= f.issued_at` and reads the value *as it was at due_at* — never a later-revised value (revisions are tracked separately as a re-score with a `vintage` tag). This prevents scoring against data the model could not possibly have learned from.

### 1.3 Skill metrics — exact formulas

Let a forecast issue a point `ŷ`, a predictive interval `[L, U]` at miscoverage `α`, a predictive CDF `F` (from `quantiles`), and let the realized value be `y`. Aggregations below are over a scoring window of `n` matched forecasts.

#### 1.3.1 Absolute error & MAE
```
AE_i = |ŷ_i − y_i|
MAE  = (1/n) Σ_i AE_i
```

#### 1.3.2 Squared error, MSE, RMSE
```
SE_i = (ŷ_i − y_i)^2
MSE  = (1/n) Σ_i SE_i
RMSE = sqrt(MSE)
```

#### 1.3.3 CRPS (Continuous Ranked Probability Score)
The proper score for a *probabilistic* forecast with predictive CDF `F` against scalar truth `y`:
```
CRPS(F, y) = ∫_{-∞}^{∞} ( F(z) − 1{z ≥ y} )^2 dz
```
Lower is better; for a perfect deterministic forecast (`F` a step at `y`) CRPS = 0. CRPS reduces to MAE for a deterministic forecast, so it is directly comparable across deterministic and probabilistic members.

**Ensemble estimator (we store `member_preds` = {x_1..x_m}, so use the energy form):**
```
CRPS_ens = (1/m) Σ_k |x_k − y|  −  (1/(2 m^2)) Σ_{k,l} |x_k − x_l|
```
This is the unbiased-ish (use `1/(2m(m−1))` for the unbiased "fair" CRPS) estimator; both are implemented, `fair=True` default for small ensembles.

**Quantile (pinball) estimator** when only sparse quantiles are stored — CRPS ≈ twice the integral of the pinball loss over quantile levels:
```
PL_τ(ŷ_τ, y) = (y − ŷ_τ)·τ            if y ≥ ŷ_τ
             = (ŷ_τ − y)·(1 − τ)       otherwise
CRPS ≈ 2 · ∫_0^1 PL_τ dτ  ≈  2 · Σ_j w_j · PL_{τ_j}   (trapezoid over stored levels)
```

#### 1.3.4 Interval coverage & width
For each forecast the **coverage indicator** and **width**:
```
cov_i  = 1{ L_i ≤ y_i ≤ U_i }
PICP   = (1/n) Σ_i cov_i                  # Prediction Interval Coverage Probability
MPIW   = (1/n) Σ_i (U_i − L_i)            # Mean Prediction Interval Width
```
**Coverage error** vs the nominal target `1 − α`:
```
CE = PICP − (1 − α)        # ≈ 0 is calibrated; CE < 0 = overconfident (too narrow)
```
Acceptance band: `|CE| ≤ 0.05` for the production target horizon (see §6.4). EnbPI (§06) is the calibration mechanism that keeps `PICP ≈ 1 − α`; this loop *measures* whether it holds out-of-sample and feeds the conformal residual buffer.

#### 1.3.5 Skill score vs baseline
A **skill score** normalizes a forecast's error against a naive reference so improvement is meaningful (a forecast can have low RMSE simply because the series is easy). For any negatively-oriented score `S` (CRPS, MSE, MAE):
```
SS = 1 − S_model / S_baseline
```
- `SS = 1`  → perfect.
- `SS = 0`  → no better than baseline.
- `SS < 0`  → worse than baseline (a regression — alert).

**Baselines (per `target_key`, stored at issue time as `baseline_point`/`baseline_pi`):**
- **Persistence:** `ŷ_baseline = y(t0)` — last observed value carried forward (strong for random-walk-like series: FX, prices).
- **Climatology:** `ŷ_baseline = mean (or seasonal mean) of y over a trailing reference window` — strong for seasonal/mean-reverting series. The interval is the empirical reference-window quantiles.

We compute and report skill against **both**; the headline `skill_score` uses the harder baseline per target (configured in the target registry; default = persistence for high-frequency, climatology for seasonal).

**CRPS skill score (primary headline):**
```
CRPSS = 1 − mean(CRPS_model) / mean(CRPS_baseline)
```

### 1.4 Per-member vs ensemble scoring
`score_forecast` writes **one** `skill_record` for the ensemble (`model_id='ensemble'`) **and** one per member listed in `member_preds`. The per-member records drive the Error-Weighted Ensemble (§4.1); the ensemble record drives `/predict/skill` and the acceptance criteria.

---

## 2. CONTINUOUS RE-FORECASTING (numerical-weather "cycling")

NWP supercomputers don't forecast once; they **cycle**: assimilate the latest observations, integrate forward, emit an ensemble, repeat at fixed analysis times (00/06/12/18Z). PATTERN ORACLE mirrors this behaviour at the scale our infra supports.

### 2.1 Cadence (cycling schedule)
Each active `target_key` has a **forecast cycle** with a cadence tied to its data velocity:

| Target class | Cadence | Rationale |
|---|---|---|
| High-frequency (FX, crypto) | every 5–15 min | feed updates ~60 s; spread changes fast |
| Daily series (seismicity rates, macro) | hourly or on new obs | daily resolution, hourly refresh suffices |
| Slow / sim-driven (KGIK snapshots) | per simulation tick / nightly | data arrives on tick boundaries |

A scheduler (`self_improve.cycler`) enqueues a re-forecast job per (target, horizon) when its cadence elapses **or** a trigger fires (§2.2). Each cycle produces a *new* `forecast` row (the old one stays pending until its own `due_at`) — so multiple overlapping lead-times are always in flight, exactly like rolling NWP cycles.

### 2.2 Triggers (event-driven re-forecast on top of the clock)
| Trigger | Condition | Action |
|---|---|---|
| New observation | fresh point for `target_key` lands in History Lake | re-forecast (assimilate) all horizons |
| Regime break | BOCPD changepoint on inputs/errors (§3.4) | re-forecast + flag prior cycle suspect |
| Drift alarm | PSI > 0.2 on inputs (§3.1) | re-forecast + open drift runbook (§7.4) |
| Upstream KGIK edge change | a driver edge promoted/decayed (§5) | re-forecast dependents |
| Manual / canary | operator or canary rollout (§4.4) | re-forecast subset |

### 2.3 Ensemble spread as uncertainty
Each cycle runs all enabled models (foundation TS, classical GBM/Holt/ARIMA, EnKF-assimilated — see §06) producing `member_preds = {x_1..x_m}`. Uncertainty is the **ensemble spread**, computed with the reused estimator:

```python
from underworld.server.services.ai_models import uncertainty_estimate
spread = uncertainty_estimate(member_preds)   # {mean, std, confident}
```
`uncertainty_estimate` (ai_models.py:103–107) returns predictive `mean` and `std` over the members; `std` is the raw model-disagreement component of uncertainty. The reported interval combines this **epistemic spread** with the **EnbPI conformal residual** (aleatoric, from §06) so the final `[L,U]` is honest even when members agree but are jointly wrong. The conformal residual buffer is refreshed each cycle from the latest scored residuals (§1) — this is the feedback that makes intervals self-correct.

---

## 3. DRIFT DETECTION

Drift is monitored on **three surfaces** — inputs, calibration, and residuals — plus a **regime-break** detector on the error series. Each has an explicit alarm threshold and a runbook (§7.4).

### 3.1 Input drift — PSI (reused)
Population Stability Index on each model input feature, reference = training/last-stable window, current = recent window. Reuse the audited implementation verbatim:

```python
from underworld.server.services.ai_models import drift_detector
res = drift_detector(reference_window, current_window, bins=10)
#   -> {"psi": float, "drift": psi > 0.2}
```
`drift_detector` (ai_models.py:74–82) computes
```
PSI = Σ_b (c_b − r_b) · ln(c_b / r_b)
```
over `bins` histogram buckets (clipped to 1e-6 to avoid log(0)), where `r_b`,`c_b` are reference/current bin densities. **Alarm at PSI > 0.2** (the function's own `drift` flag). Convention: `0.1–0.2` = moderate (watch), `>0.2` = significant (act). PSI is evaluated per feature and aggregated (max + mean) per target.

### 3.2 Calibration drift — ECE (reused)
Track calibration of probabilistic outputs over time with Expected Calibration Error:

```python
from underworld.server.services.ai_models import calibration_error
cal = calibration_error(confidences, correct, bins=10)
#   -> {"ece": float, "well_calibrated": ece < 0.1}
```
`calibration_error` (ai_models.py:85–94) computes
```
ECE = Σ_b (|B_b|/n) · | conf(B_b) − acc(B_b) |
```
binning forecasts by predicted confidence, comparing per-bin mean confidence to per-bin empirical accuracy. For binary/threshold queries we feed `prob` as `confidences` and the realized event indicator as `correct`. For interval forecasts we additionally track **coverage error** `CE` (§1.3.4) as the calibration signal. **Alarm at ECE > 0.1** (the function's `well_calibrated` flag) **or** `|CE| > 0.05` sustained over the calibration window.

### 3.3 Residual drift — Kolmogorov–Smirnov test
The signed residuals `e_i = y_i − ŷ_i` should be stationary if the model stays valid. Run a two-sample **KS test** between a reference residual sample `E_ref` and the recent residual sample `E_cur`:
```
D = sup_x | F_ref(x) − F_cur(x) |        # KS statistic (empirical CDF gap)
p = KS_pvalue(D, n_ref, n_cur)
```
Implemented via `scipy.stats.ks_2samp`. **Alarm when p < 0.01** (residual distribution has shifted — the model's error structure changed). KS catches shifts in *bias and scale* that PSI on raw inputs can miss (e.g. inputs unchanged but the mapping degraded).

### 3.4 Regime break — change-point on the error series (BOCPD)
A KS/PSI alarm says *something shifted*; we also need **when** and whether it is a persistent regime break. Run **Bayesian Online Changepoint Detection (BOCPD)** on the rolling error series `{e_i}`:

```
# BOCPD core (Adams & MacKay 2007), run-length r_t posterior
P(r_t | e_{1:t}) ∝ Σ_{r_{t-1}} P(r_t | r_{t-1})·P(e_t | r_{t-1}, e^{(r)})·P(r_{t-1} | e_{1:t-1})
hazard H(r) = 1/λ           # constant-hazard prior, expected run length λ
predictive P(e_t | ·)       # Student-t (Normal-InvGamma conjugate on residuals)
```
A **changepoint** is declared when the MAP run-length `r_t` collapses to ~0 with posterior mass `> CP_THRESHOLD` (default 0.5). This integrates with PELT (offline, batch backtests) — PELT for retrospective segmentation, BOCPD for the online stream. On a confirmed changepoint: fire the `regime break` re-forecast trigger (§2.2), shrink the conformal residual buffer to the post-break segment (old residuals are stale), and flag affected models for the retrain evaluation (§4.2).

### 3.5 Drift dashboard summary
The drift subsystem emits, per (target, model): `psi_max`, `psi_mean`, `ece`, `coverage_error`, `ks_pvalue`, `bocpd_cp_prob`, and a single rolled-up `drift_score ∈ [0,1]` (weighted max of normalized signals) for at-a-glance alerting.

---

## 4. MODEL RE-WEIGHTING & RETRAIN

### 4.1 Error-Weighted Ensemble (online)
Inspired by the expired patent **WO2014075108A2** (cited in `03_EVIDENCE_BASE.md` §41). Each member's weight is **inversely proportional to its recent error**, updated online from the per-member `skill_record`s (§1.4).

**Recent error** is an exponentially-weighted moving average of a chosen score `S` (default CRPS) per member `k`:
```
Ē_k(t) = β · Ē_k(t−1) + (1 − β) · S_k(t)        # EWMA, β ≈ 0.9 (effective window ~10)
```
**Weights** (inverse-error, normalized; ε guards divide-by-zero):
```
w_k = (1 / (Ē_k + ε))^γ  /  Σ_j (1 / (Ē_j + ε))^γ
```
- `γ` (sharpness, default 1.0): `γ→0` → equal weights; larger `γ` concentrates on the best member.
- Weights are floored at `w_min` (default 0.01) so a temporarily-bad model isn't permanently zeroed and can recover.

**Ensemble point & CDF:**
```
ŷ_ens = Σ_k w_k · x_k
F_ens  = Σ_k w_k · F_k        # weighted mixture for CRPS / quantiles
```
`update_ensemble_weights(rec)` (called from the matcher, §1.2) updates `Ē_k` and recomputes `w_k`; weights are persisted in `ensemble_weights(target_key, model_id, weight, ewma_error, updated_at)`. This makes re-weighting **continuous and cheap** — no retraining needed to react to a member degrading.

### 4.2 Retrain triggers
Re-weighting handles *relative* member quality online. **Retraining** (or refitting) a model is heavier and gated by explicit triggers, evaluated nightly (§ pseudocode) and on alarms:

| # | Trigger | Threshold (default, per-target tunable) | Action |
|---|---|---|---|
| T1 | **Skill drop** | rolling `CRPSS` falls by `> X%` (X=15) vs trailing 30-cycle median, OR `CRPSS < 0` for ≥ 3 consecutive cycles | queue retrain of worst member(s) |
| T2 | **Input drift** | `PSI > 0.2` sustained over ≥ 2 windows (§3.1) | queue retrain + refresh reference window |
| T3 | **Calibration drift** | `ECE > 0.1` or `|CE| > 0.05` sustained (§3.2) | recalibrate (refit conformal/quantiles) ± retrain |
| T4 | **Residual / regime break** | KS `p < 0.01` (§3.3) or BOCPD changepoint (§3.4) | retrain on post-break data, drop pre-break |
| T5 | **New data volume** | `≥ N_new` new labeled outcomes since last fit (N_new per target, e.g. 500) | scheduled refit to incorporate new signal |
| T6 | **Staleness** | `now − last_trained_at > MAX_AGE` (e.g. 30 d) | scheduled refit |

A trigger queues a **challenger** build; it does NOT auto-replace production (see §4.3–4.4).

### 4.3 Champion / Challenger
- **Champion** = the model/version currently serving production for a target.
- **Challenger** = a newly retrained/reconfigured candidate.

Both are scored **on the same forecasts** (shadow mode): the challenger predicts every cycle, its forecasts are persisted and scored by the same loop (§1), but its outputs are **not** served to users. A challenger is **eligible for promotion** only when, over an evaluation window of `≥ M` scored forecasts (M ≥ 30, per-horizon):
```
CRPSS(challenger) ≥ CRPSS(champion) + δ        # δ = min improvement, default 0.02
AND coverage_error(challenger) within ±0.05
AND no calibration regression (ECE not worse by > 0.02)
```
The `δ` margin and minimum-sample gate prevent promoting on noise.

### 4.4 Canary rollout
An eligible challenger is **not** flipped to 100% immediately. Canary stages:
```
0% (shadow) → 5% → 25% → 50% → 100%
```
At each stage the challenger serves that fraction of live traffic for a dwell window; promotion to the next stage requires the §4.3 criteria to hold **on the live-served slice** and no SLO breach (latency, error rate — §7). **Automatic rollback** to champion if at any stage: `CRPSS` regresses below champion, coverage error exceeds ±0.08, latency p99 breaches SLO, or error rate spikes. Rollback is one registry transition (§4.5) and is logged with the triggering metric snapshot.

### 4.5 Model registry lifecycle
Mirrors the existing `MLModel` row + `ai_models.model_registry` (ai_models.py:17–21). Each model version moves through a state machine:

```
            retrain/build
   ┌──────────────────────────┐
   ▼                          │
[staging] ──eval pass──► [shadow] ──canary──► [production] ──superseded──► [retired]
   │                        │                     │
   └── eval fail ──► [rejected]                   └── rollback ──► [shadow]/[retired]
```

| State | Meaning | Serves traffic? |
|---|---|---|
| `staging` | built, smoke-tested, not yet evaluated on live cycles | no |
| `shadow` | scored on live forecasts, output not served | no |
| `production` (champion) | serving (or in canary ramp) | yes |
| `retired` | superseded; kept for lineage/audit + backtest reproducibility | no |
| `rejected` | failed eval; kept for audit | no |

Registry row (extends §05 `MLModel`):
```
model_version(
  model_id, version, target_key, algo, params_hash,
  state, trained_at, trained_on_through,   -- data vintage (leakage audit)
  dataset_lineage_id,                       -- -> ai_models.dataset_lineage chain
  champion_since, retired_at,
  metrics_snapshot JSON                     -- skill at promotion
)
```
`trained_on_through` (the latest `issued_at`/observation the model saw) is **load-bearing for leakage guards in backtests** (§6.3): a backtest fold may only use a model version whose `trained_on_through < fold.test_start`.

---

## 5. KGIK LEARNING (graph self-improvement)

When PATTERN-DISCOVERY (§06) proposes a relationship — a **lead-lag**, a **causal screen hit** (Granger/CCM), or a recurring **motif** (Matrix Profile) — that proposal is a *hypothesis*, not a fact. The self-improvement loop **confirms or refutes** hypotheses against realized outcomes and writes the result back into the KGIK graph. This is the graph analogue of the forecast loop, and it deliberately **mirrors `CausalBelief`** (`underworld/server/db/models.py:475`) and its update rule in `reasoning.py`.

### 5.1 KGIK edge schema (learned edges)
```
kgik_edge(
  edge_id, src, dst, relation,            -- e.g. ('FX.EURUSD','SEISM.rate','lead_lag@+3d')
  learned        BOOLEAN DEFAULT FALSE,   -- discovered (TRUE) vs hand-authored ontology (FALSE)
  trials         INTEGER DEFAULT 0,       -- times the edge's prediction was testable
  confirmations  INTEGER DEFAULT 0,       -- times realized outcome confirmed it
  confidence     REAL    DEFAULT 0.5,     -- Laplace-smoothed (see 5.3)
  evidence_count INTEGER DEFAULT 0,       -- == confirmations (kept for brief parity)
  effect_size    REAL,                    -- discovery-time stat (corr / Granger F / CCM ρ)
  last_seen_at   TIMESTAMP,               -- for decay
  updated_at     TIMESTAMP
)
```

### 5.2 Promotion / strengthening on confirmation
`maybe_promote_kgik(forecast, y_true)` (called from the matcher, §1.2) runs when a forecast that **used** a discovered edge as a driver is scored:

```
ON scored forecast f that relied on discovered edge E:
    predicted_direction = sign(driver_contribution of E to ŷ)
    realized_direction  = sign(y_true − baseline_point)
    confirmed = (predicted_direction == realized_direction)     # directional check
                AND (f was skillful: SS_f > 0)                    # and beat baseline

    E.trials        += 1
    E.confirmations += 1 if confirmed else 0
    E.evidence_count = E.confirmations
    E.confidence     = laplace(E.confirmations, E.trials)         # 5.3
    E.last_seen_at   = now
    IF (not E.learned) AND E.confirmations >= PROMOTE_MIN (e.g. 3) AND E.confidence >= 0.66:
        E.learned = True           # promote hypothesis -> learned edge
```
This is the same trial/confirmation/confidence bookkeeping as `reasoning.record` (reasoning.py:35–56), applied to graph edges.

### 5.3 Confidence update — Laplace smoothing (mirrors CausalBelief)
We reuse the **exact** rule from `reasoning._confidence` (reasoning.py:31–32), a Laplace (add-one) rule of succession with a 0.5 prior:
```
confidence = (confirmations + 1) / (trials + 2)
```
- Starts at `1/2 = 0.5` with zero evidence (uninformative prior — matches `CausalBelief.confidence` default 0.5).
- Converges to the empirical confirmation rate as `trials → ∞`.
- Never hits exactly 0 or 1, so an edge is always recoverable/refutable (same robustness rationale as the supply-chain Wilson/Laplace estimator at supply_chain.py:153).

### 5.4 Decay of unconfirmed edges
Edges that are not re-confirmed go stale and must not keep masquerading as strong evidence. On a periodic sweep (nightly):
```
ON nightly decay sweep, for each learned edge E:
    age_days = (now − E.last_seen_at) / 1 day
    E.confidence *= exp(−age_days / TAU)          # exponential time-decay, TAU≈30d
    IF E.confidence < PRUNE_THRESHOLD (e.g. 0.4) AND E.trials_since_confirm > K:
        E.learned = False        # demote back to hypothesis
        IF E.confidence < HARD_PRUNE (e.g. 0.2):
            archive(E)            # remove from active graph, keep for audit/lineage
```
Decay ensures the graph tracks the *current* world: a once-real lead-lag that stops working fades out automatically, while continually-confirmed edges stay strong. Hand-authored ontology edges (`learned=False` from birth) are **not** decayed — only their *discovered* status is governed by this loop.

---

## 6. BACKTESTING HARNESS

Backtesting is how we *prove* the acceptance criterion (§0) before and during production. It is the offline counterpart of the live loop and shares its scoring code (§1.3) so live and backtest skill are on the same scale.

### 6.1 Walk-forward (expanding/rolling window) validation
The dataset is split chronologically into folds; the model trains on the past and is tested on the immediate future, then the window advances:
```
ORIGIN o_1 < o_2 < ... < o_K     (rolling forecast origins)
FOR each origin o:
    train on data with issued_at/observed_at ≤ o            # past only
    forecast horizons h ∈ H from o
    test against realized y at o + h
    advance o by step                                        # expanding: keep all past
                                                             # rolling: fixed-length window
```
Both **expanding** (anchored) and **rolling** (fixed-length) windows are supported; default expanding for stable series, rolling for regime-prone series (so the model isn't anchored to a dead regime).

### 6.2 Rolling-origin evaluation
For each origin and each horizon we record a `skill_record` exactly as the live loop does. Aggregation is **per horizon** (skill degrades with lead-time; a single number hides this) and **per regime segment** (PELT segmentation, §3.4) so we can report "skill in calm vs break regimes."

### 6.3 Leakage guards (mandatory)
A backtest that leaks future information is worse than none — it manufactures fake improvement. Enforced guards:
- **Temporal cutoff:** training and feature computation for origin `o` may use only data with timestamp `≤ o`. Feature pipelines are run *inside* the fold, not precomputed on the full series.
- **Model-vintage check:** a fold may only evaluate a `model_version` whose `trained_on_through < fold.test_start` (§4.5). Enforced by an assertion in the harness; violation fails the run.
- **No target-revision peeking:** use the value *as known at `o+h`* (vintaged outcomes, §1.2), not later revisions.
- **No normalization across the boundary:** scalers/quantile transforms are fit on train only.
- **Embargo/gap:** an optional embargo gap between train end and test start (default = max feature lookback) prevents windowed-feature bleed.

### 6.4 Baseline comparison & acceptance
Every backtest computes model skill **and** baseline (persistence + climatology) on the identical folds, then the skill score (§1.3.5). A model build is **accepted** only if, on the held-out walk-forward folds:
```
mean CRPSS(model vs harder-baseline) ≥ ACCEPT_SS          (default 0.05, i.e. ≥5% better)
AND |coverage_error| ≤ 0.05  at the target horizon
AND ECE ≤ 0.1
```

### 6.5 The continuous-improvement acceptance test
The system-level claim — *"measurably improves"* — is a **trend** test, not a point test. Over the last `N` backtest cycles (default N=20), fit the rolling headline `CRPSS` series and require a **non-negative slope** with the regression accounting for noise:
```
slope = OLS_slope( CRPSS_1..CRPSS_N  vs  cycle_index )
ACCEPT  iff  slope ≥ 0  (95% CI lower bound ≥ −ε, ε small)
        AND  mean(CRPSS_last_k) ≥ mean(CRPSS_first_k)     # later ≥ earlier
        AND  no calibration regression over the window
```
This is the operational form of the §0 contract and is asserted by the validation suite in `11_VALIDATION_AND_TEST_PLAN.md`.

### 6.6 Reporting at `/predict/skill`
`GET /predict/skill` (contract in `07_API_CONTRACTS.md`) aggregates `skill_record` (live) and the latest backtest run, returning per `(target_key, horizon_bucket, model_id)`:
```json
{
  "target_key": "FX.EURUSD",
  "horizon_bucket": "1d",
  "model_id": "ensemble",
  "n_scored": 412,
  "window": "rolling_30d",
  "mae": 0.0041, "rmse": 0.0058, "crps": 0.0033,
  "picp": 0.91, "coverage_error": 0.01, "mpiw": 0.014,
  "skill_vs_persistence": 0.12,
  "skill_vs_climatology": 0.27,
  "crps_skill_score": 0.12,
  "ece": 0.06,
  "drift": {"psi_max": 0.08, "ks_pvalue": 0.31, "bocpd_cp_prob": 0.04, "drift_score": 0.12},
  "trend": {"cycles": 20, "crpss_slope": 0.004, "improving": true},
  "champion": {"model_id": "tsfm", "version": "2.5.1", "champion_since": "2026-05-20T00:00:00Z"},
  "challenger": {"model_id": "tsfm", "version": "2.6.0-rc1", "state": "shadow", "crpss": 0.14}
}
```
Filterable by `target_key`, `horizon`, `model_id`, and `window`. The `trend.improving` flag is the user-facing proof of §6.5.

---

## 7. NIGHTLY LOOP — PSEUDOCODE

The matcher (§1.2) and cycler (§2) run continuously through the day. A heavier **nightly orchestrator** consolidates drift, retrain, registry, KGIK decay, and backtest:

```
# self_improve.nightly()  — runs once per day (cron), plus the intraday matcher/cycler loops above.

def nightly():
    targets = registry.active_targets()
    for tk in targets:
        # ---- 1. aggregate the day's live skill -------------------------------
        recs = skill_records(tk, window="rolling_30d")
        live = aggregate_skill(recs)            # MAE/RMSE/CRPS/PICP/CE/CRPSS  (§1.3)
        emit_metrics(tk, live)                  # §7.2

        # ---- 2. drift surfaces ----------------------------------------------
        psi  = drift_detector(ref_inputs(tk), cur_inputs(tk))          # ai_models PSI
        ece  = calibration_error(confidences(tk), correct(tk))         # ai_models ECE
        ks_p = ks_2samp(ref_resid(tk), cur_resid(tk)).pvalue           # §3.3
        cp   = bocpd(error_series(tk))                                  # §3.4
        drift = roll_up(psi, ece, ks_p, cp, live["coverage_error"])    # drift_score
        if drift.alarm: open_runbook(tk, drift)                        # §7.4

        # ---- 3. online re-weight already happened intraday; recompute snapshot
        weights = ensemble_weights(tk)          # from EWMA errors (§4.1)

        # ---- 4. retrain triggers --------------------------------------------
        triggers = eval_triggers(tk, live, psi, ece, ks_p, cp, new_data_count(tk))  # T1..T6
        for member in triggers.queued:
            challenger = retrain(member, data=lake.through(now), leakage_guarded=True)
            registry.register(challenger, state="staging")
            bt = backtest(challenger, walk_forward, baselines=[persistence, climatology]) # §6
            if bt.accept:                                              # §6.4
                registry.transition(challenger, "shadow")             # start shadow scoring

        # ---- 5. champion/challenger promotion + canary ----------------------
        for ch in registry.shadow(tk):
            if eligible_for_promotion(ch, champion(tk)):              # §4.3
                canary.advance(ch)                                    # 0→5→25→50→100 (§4.4)
            if canary.regressed(ch): registry.rollback(ch)           # auto-rollback

        # ---- 6. KGIK decay sweep --------------------------------------------
        for edge in kgik.learned_edges_touching(tk):
            decay_edge(edge)                     # §5.4 exp decay + prune/demote

    # ---- 7. system-level improvement assertion -----------------------------
    trend = improvement_trend(window=20)         # §6.5
    assert trend.slope >= 0, "REGRESSION: rolling skill trend negative — page on-call"
    emit_metrics("system", trend)
    publish_skill_report()                        # backs GET /predict/skill (§6.6)
```

---

## 7. OBSERVABILITY

### 7.1 Principles
Every metric in §1.3 and §3 is **emitted, not just stored**, so degradation is visible *before* a user complains. All metrics are tagged `target_key`, `horizon_bucket`, `model_id`, `version`.

### 7.2 Metrics to emit
| Metric | Type | Source | Purpose |
|---|---|---|---|
| `oracle.skill.mae` / `.rmse` / `.crps` | gauge | §1.3 | accuracy tracking |
| `oracle.skill.crpss` (vs baseline) | gauge | §1.3.5 | the headline improvement signal |
| `oracle.cov.picp` / `.coverage_error` / `.mpiw` | gauge | §1.3.4 | interval calibration |
| `oracle.cal.ece` | gauge | ai_models ECE | probabilistic calibration |
| `oracle.drift.psi_max` / `.psi_mean` | gauge | ai_models PSI | input drift |
| `oracle.drift.ks_pvalue` | gauge | §3.3 | residual drift |
| `oracle.drift.bocpd_cp_prob` | gauge | §3.4 | regime break |
| `oracle.drift.score` | gauge | §3.5 | rolled-up alarm |
| `oracle.ensemble.weight{model}` | gauge | §4.1 | which member is trusted |
| `oracle.kgik.learned_edges` / `.promotions` / `.decays` | counter/gauge | §5 | graph learning health |
| `oracle.loop.matched` / `.unmatchable` / `.pending_age_p95` | counter/gauge | §1.2 | loop health |
| `oracle.predict.latency_p50/p99` | histogram | serving | SLO |
| `oracle.predict.error_rate` | rate | serving | SLO |
| `oracle.registry.transition{from,to}` | counter | §4.5 | promotions/rollbacks |
| `oracle.trend.crpss_slope` / `.improving` | gauge | §6.5 | system-level proof |

### 7.3 Dashboards
- **Skill dashboard:** CRPSS / RMSE / CRPS per target × horizon, with baseline overlays and the 20-cycle trend line (§6.5). The hero panel is `crpss_slope` with the `improving` flag.
- **Calibration dashboard:** PICP vs nominal, coverage_error band (±0.05), ECE reliability diagram, MPIW.
- **Drift dashboard:** PSI heatmap (feature × time), KS p-value, BOCPD changepoint markers, rolled `drift_score`.
- **MLOps dashboard:** registry state per model, ensemble weights over time, canary ramp progress, challenger-vs-champion CRPSS, retrain/rollback event log.
- **Loop-health dashboard:** matched vs unmatchable rate, pending-forecast age p95, scheduler lag.

### 7.4 Alerts
| Alert | Condition | Severity | Routes to |
|---|---|---|---|
| Skill regression | `crpss_slope < 0` 95%-CI, OR `CRPSS < 0` 3 cycles | page | on-call |
| Drift significant | `PSI > 0.2` sustained, OR `drift_score > 0.5` | ticket→page | ML owner |
| Calibration breach | `ECE > 0.1` OR `|coverage_error| > 0.05` sustained | ticket | ML owner |
| Regime break | BOCPD changepoint confirmed | info→ticket | ML owner |
| Canary regression | challenger worse than champion on live slice | auto-rollback + page | on-call |
| Loop stalled | `pending_age_p95 > GRACE_WINDOW` OR matcher lag | page | on-call |
| Feed gap | `unmatchable` rate spikes | ticket | data owner |
| SLO breach | latency p99 / error_rate over SLO | page | on-call |

### 7.5 Runbooks
- **RB-DRIFT (PSI/KS/BOCPD alarm):** confirm with §3 surfaces → check feed health (is it data or model?) → if data: refresh reference window, validate ingestion (§04); if model: trigger T2/T4 retrain, shrink conformal buffer to post-break, re-forecast affected horizons (§2.2).
- **RB-CALIBRATION (ECE/coverage):** recalibrate first (refit EnbPI/quantiles on recent residuals) before retraining; verify intervals on the next 30 scored forecasts; if unresolved → T3 retrain.
- **RB-SKILL-REGRESSION:** inspect per-member skill_records → is one member dragging? lower its `γ`-weight floor or disable; check for regime break; if ensemble-wide → roll back last promoted version (§4.4/4.5); confirm trend recovers.
- **RB-CANARY-ROLLBACK:** automatic; verify champion restored, capture challenger metrics snapshot, file regression ticket, hold challenger in `shadow` for diagnosis.
- **RB-LOOP-STALLED:** check scheduler liveness, DB write path, feed availability; replay `due_at<=now & status='pending'` once recovered; backfill missed cycles.

---

## 8. ACCEPTANCE CRITERIA (this section's exit gate)

This section is **done / validated** when:

1. **Loop closes:** every `POST /predict` persists a `forecast`; the matcher scores ≥ 99% of due forecasts within `GRACE_WINDOW` (rest classified `unmatchable` with cause).
2. **Metrics correct:** CRPS, RMSE, PICP, coverage_error, CRPSS computed per §1.3 and unit-tested against known closed-form cases (e.g. CRPS of a deterministic forecast == MAE; PICP of a perfectly-calibrated synthetic == `1−α` within MC noise).
3. **Drift reuses audited code:** PSI via `ai_models.drift_detector` (alarm at >0.2), ECE via `ai_models.calibration_error` (alarm at >0.1), plus KS (`p<0.01`) and BOCPD changepoint — all emitting to the drift dashboard.
4. **Re-weighting works:** Error-Weighted Ensemble weights move inversely with EWMA member error online; a deliberately-degraded member is down-weighted within ~10 cycles and recovers when fixed.
5. **Registry lifecycle enforced:** champion/challenger shadow scoring + canary ramp with auto-rollback; leakage guard (`trained_on_through < test_start`) asserted in the harness.
6. **KGIK learns honestly:** a confirmed discovered edge gains confidence via Laplace `(confirmations+1)/(trials+2)` (mirroring `reasoning._confidence` / `CausalBelief`), promotes at `learned=true` after `PROMOTE_MIN` confirmations, and unconfirmed edges decay/prune.
7. **Backtests are leakage-free** and report skill vs both baselines at `/predict/skill`, per horizon.
8. **The system measurably improves:** on the standing walk-forward backtest suite, **the rolling headline CRPS skill-score trend is ≥ 0 over N=20 cycles** (95%-CI lower bound ≥ −ε) **with no calibration regression** — the §0 / §6.5 contract, asserted in `11_VALIDATION_AND_TEST_PLAN.md`.

---

## 9. TRACEABILITY (reused code & cited behaviour)

| Capability here | Backed by |
|---|---|
| PSI input drift (>0.2) | `ai_models.drift_detector` (ai_models.py:74–82) |
| ECE calibration (>0.1) | `ai_models.calibration_error` (ai_models.py:85–94) |
| Ensemble spread uncertainty | `ai_models.uncertainty_estimate` (ai_models.py:103–107) |
| Model registry / lineage | `ai_models.model_registry` (ai_models.py:17–21), `ai_models.dataset_lineage` (24–27) |
| Laplace confidence update (KGIK) | `reasoning._confidence` (reasoning.py:31–32), `CausalBelief` (models.py:475) |
| Error-Weighted Ensemble | expired patent WO2014075108A2 (`03_EVIDENCE_BASE.md` §41) |
| Continuous cycling + CRPS-vs-climatology backtesting | NWP supercomputer loop (`03_EVIDENCE_BASE.md` §1.3 item 5) |
| BOCPD / PELT change-point | `03_EVIDENCE_BASE.md` §1.3 item 6 |
| EnbPI conformal intervals (calibration feedback) | `06_ALGORITHMS.md`, `03_EVIDENCE_BASE.md` §1.3 item 2 |
| Forecast/outcome/skill schema | `05_DATA_MODEL_AND_SCHEMAS.md` |
| `/predict`, `/predict/skill` contracts | `07_API_CONTRACTS.md` |
| Backtest acceptance assertions | `11_VALIDATION_AND_TEST_PLAN.md` |
