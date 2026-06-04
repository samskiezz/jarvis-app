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

### 1.5 Full derivations & worked examples (CRPS, PSI, ECE, skill-score)

The summary formulas in §1.3 are the *contract*; the derivations below are the *justification* — they exist so the validation suite (`11_VALIDATION_AND_TEST_PLAN.md`) can unit-test each metric against a closed-form value, and so an on-call engineer reading a runbook can re-derive a number by hand.

#### 1.5.1 CRPS — derivation from the integral, energy form, and the CRPS→MAE limit

**Step 1 — the defining integral.** For a predictive CDF `F` and scalar truth `y`,
```
CRPS(F, y) = ∫_{-∞}^{∞} ( F(z) − 1{z ≥ y} )^2 dz
```
The integrand is the squared distance, at each level `z`, between the forecast CDF and the *ideal* CDF (a Heaviside step that jumps from 0 to 1 at `y`). CRPS is therefore the L²-distance between forecast and truth in CDF space — a **strictly proper** score: its expectation is uniquely minimized by the true generating distribution, so a forecaster cannot game it by hedging.

**Step 2 — the kernel (energy) identity.** A classical identity rewrites the integral as expectations over independent draws `X, X' ~ F`:
```
CRPS(F, y) = E|X − y|  −  ½ · E|X − X'|
```
*Why this holds (sketch):* expand `(F(z) − 1{z≥y})² = F(z)² − 2F(z)1{z≥y} + 1{z≥y}`. Integrate each term using `∫ F(z)(1−F(z)) dz = ½ E|X−X'|` (the mean-absolute-difference / Gini identity) and `∫ (1{z≥y} − F(z)·1{z≥y})… = E|X−y| − ½E|X−X'|`. Collecting terms yields the kernel form. The first term rewards **accuracy** (members near `y`); the second term *credits* **spread** (a sharp ensemble pays a smaller subtraction), which is exactly why CRPS jointly scores calibration and sharpness.

**Step 3 — the ensemble estimator we ship.** With `member_preds = {x_1..x_m}` we plug the empirical measure into the kernel form:
```
CRPS_ens = (1/m) Σ_k |x_k − y|  −  (1/(2 m²)) Σ_{k,l} |x_k − x_l|     # biased
CRPS_fair = (1/m) Σ_k |x_k − y|  −  (1/(2 m(m−1))) Σ_{k,l} |x_k − x_l|  # fair (unbiased)
```
The biased form underestimates spread for small `m`; the `1/(m(m−1))` denominator (Gneiting & Raftery 2007) corrects it. `fair=True` is the default below `m=20`.

**Step 4 — the deterministic limit (the unit test).** If the ensemble degenerates to a single value `x` repeated (or `m=1`), the second term is 0 and `CRPS = |x − y| = AE`. Hence **CRPS of a point forecast equals its absolute error** — the invariant asserted in §8.2.

**Worked example.** Ensemble `{x} = {2.0, 3.0, 4.0}`, truth `y = 3.5`, `m=3`.
- Accuracy term: `(|2−3.5| + |3−3.5| + |4−3.5|)/3 = (1.5 + 0.5 + 0.5)/3 = 2.5/3 = 0.8333`.
- Spread term, all pairwise `|x_k−x_l|`: the 9 ordered pairs give absolute gaps `{0,1,2, 1,0,1, 2,1,0}`, sum `= 8`.
  - Biased: `8 / (2·3²) = 8/18 = 0.4444` → `CRPS_ens = 0.8333 − 0.4444 = 0.3889`.
  - Fair: `8 / (2·3·2) = 8/12 = 0.6667` → `CRPS_fair = 0.8333 − 0.6667 = 0.1667`.
- Sanity: a *single*-member forecast `{3.0}` gives `CRPS = |3−3.5| = 0.5`, larger than the fair ensemble — the ensemble's honest spread earned it a better (lower) score. ✓

#### 1.5.2 PSI — derivation as a symmetrized KL divergence, with a worked table

`drift_detector` (ai_models.py:74–82) computes `PSI = Σ_b (c_b − r_b) · ln(c_b / r_b)`. This is **not** an arbitrary heuristic; it is the **symmetrized (Jeffreys) KL divergence** between the reference density `r` and current density `c`:
```
KL(c‖r) = Σ_b c_b ln(c_b/r_b)
KL(r‖c) = Σ_b r_b ln(r_b/c_b)
PSI     = KL(c‖r) + KL(r‖c) = Σ_b (c_b − r_b) ln(c_b/r_b)
```
(The last equality follows because `Σ_b c_b ln(c_b/r_b) − Σ_b r_b ln(c_b/r_b) = Σ_b (c_b−r_b)ln(c_b/r_b)`, and `KL(r‖c)= −Σ r_b ln(c_b/r_b)`.) PSI is therefore **symmetric** (`PSI(r,c)=PSI(c,r)`), always `≥ 0`, and `=0` iff the two histograms are identical bin-for-bin. The `1e-6` clip (ai_models.py:80) bounds `ln(c_b/r_b)` so an empty current bin cannot send a term to `±∞`.

**Threshold rationale.** The industry bands (`<0.1` stable, `0.1–0.2` moderate, `>0.2` significant) correspond to a Jeffreys divergence at which a ~10-bin histogram has visibly migrated mass between adjacent bins — empirically the level at which downstream model error begins to rise. The function hard-codes `>0.2 → drift=True` (ai_models.py:82).

**Worked example** (3-bin reduction for legibility; production uses `bins=10`). Reference shares `r = [0.50, 0.30, 0.20]`; current shares `c = [0.40, 0.30, 0.30]` (mass shifted from bin 1 into bin 3):

| bin | r_b | c_b | c_b − r_b | c_b/r_b | ln(c_b/r_b) | term = (c−r)·ln |
|---|---|---|---|---|---|---|
| 1 | 0.50 | 0.40 | −0.10 | 0.800 | −0.2231 | +0.02231 |
| 2 | 0.30 | 0.30 |  0.00 | 1.000 |  0.0000 |  0.00000 |
| 3 | 0.20 | 0.30 | +0.10 | 1.500 | +0.4055 | +0.04055 |

`PSI = 0.02231 + 0 + 0.04055 = 0.0629` → **stable** (`<0.1`), `drift=False`. Note each term is `≥0` (the `(c−r)` and `ln(c/r)` always share sign), confirming non-negativity term-by-term. To cross the `0.2` alarm you need substantially more migration, e.g. `c=[0.25,0.30,0.45]` gives `PSI≈0.30` → alarm.

#### 1.5.3 ECE — derivation as a binned calibration-gap expectation, with a worked table

`calibration_error` (ai_models.py:85–94) computes `ECE = Σ_b (|B_b|/n) · | conf(B_b) − acc(B_b) |`. **Derivation:** perfect calibration means `P(correct | confidence = p) = p` for all `p`. The *calibration gap* at confidence level `p` is `|p − P(correct|p)|`. ECE is the expectation of this gap under the distribution of predicted confidences, estimated by partitioning `[0,1]` into `bins` equal-width buckets and weighting each bucket's gap by its occupancy `|B_b|/n`:
```
ECE = E_p [ | p − P(correct|p) | ]  ≈  Σ_b (|B_b|/n) · | mean_conf(B_b) − empirical_acc(B_b) |
```
It is the **weighted L¹** gap of the reliability diagram (the per-bin scatter of confidence vs accuracy against the 45° line). Bins with no samples contribute 0 (the `if mask.sum()` guard, ai_models.py:92). The function flags `well_calibrated = ece < 0.1` (ai_models.py:94).

**Worked example** (5 bins for legibility). 100 forecasts:

| bin (conf range) | |B_b| | mean conf | # correct | acc | gap | weighted = (|B|/n)·gap |
|---|---|---|---|---|---|---|
| (0.0,0.2] | 10 | 0.15 | 2 | 0.20 | 0.05 | 0.0050 |
| (0.2,0.4] | 20 | 0.32 | 6 | 0.30 | 0.02 | 0.0040 |
| (0.4,0.6] | 30 | 0.51 | 18 | 0.60 | 0.09 | 0.0270 |
| (0.6,0.8] | 25 | 0.71 | 15 | 0.60 | 0.11 | 0.0275 |
| (0.8,1.0] | 15 | 0.92 | 12 | 0.80 | 0.12 | 0.0180 |

`ECE = 0.0050+0.0040+0.0270+0.0275+0.0180 = 0.0815` → **well-calibrated** (`<0.1`) but close to the line; the two high-confidence bins (gaps 0.11, 0.12) are *over-confident* (conf > acc) and are what an ECE alarm would surface first.

#### 1.5.4 Skill score & CRPSS — derivation, interpretation, and a worked end-to-end

For any negatively-oriented score `S`, the skill score `SS = 1 − S_model/S_baseline` is the **fractional reduction in error relative to a reference forecaster**. Derivation of its anchors: at `S_model = 0` (perfect), `SS = 1`; at `S_model = S_baseline`, `SS = 0`; the ratio `S_model/S_baseline` is unitless so SS is comparable across series of wildly different scale (FX at 1e-3 vs seismicity rates at 1e0). The `< 0` region is unbounded below — a model can be arbitrarily worse than persistence — which is why §7.4 pages on `CRPSS < 0`.

**Worked end-to-end** for a 30-forecast window on `FX.EURUSD`, horizon `1d`:
- `mean CRPS_model = 0.0033`, `mean CRPS_persistence = 0.0041`, `mean CRPS_climatology = 0.0052`.
- `CRPSS_vs_persistence = 1 − 0.0033/0.0041 = 1 − 0.8049 = 0.1951` → ~19.5% better than carry-forward.
- `CRPSS_vs_climatology = 1 − 0.0033/0.0052 = 1 − 0.6346 = 0.3654` → ~36.5% better than the seasonal mean.
- Headline uses the **harder** baseline (the one with lower CRPS = persistence here), so `headline CRPSS = 0.195`. This clears `ACCEPT_SS = 0.05` (§6.4). ✓
- *Interpretation guard:* always quote the headline against the harder baseline; reporting only the easier (climatology) number would inflate apparent skill — a §0 "calibrated honesty" violation.

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

### 2.4 Assimilation: how a cycle uses the latest observations
NWP's "assimilate then integrate" maps onto our cycle as: **(1) ingest** the freshest observations for the target (and its KGIK drivers); **(2) update** each member's state — for the EnKF-assimilated member this is a literal Kalman update of the ensemble state given the new obs; for classical members (GBM/Holt/ARIMA) it is re-conditioning on the extended history; for the foundation TS model it is re-running inference with the new context window; **(3) integrate** forward to all horizons `h∈H`, emitting `member_preds`; **(4) combine** with the §12 weights into `ŷ_ens` and the mixture CDF `F_ens`. The cycle is *idempotent per (target, origin)*: re-running with identical inputs reproduces the forecast (needed for backtest reproducibility, §14.4).

### 2.5 Decomposing uncertainty: epistemic vs aleatoric (the honest interval)
The reported `[L,U]` must reflect **two** sources, or it will be over-confident:
```
σ²_total ≈ σ²_epistemic (member disagreement, from uncertainty_estimate.std)
         + σ²_aleatoric  (irreducible noise, from the EnbPI conformal residual buffer)
[L, U]  = conformal_interval(ŷ_ens, residual_buffer, α)   # EnbPI guarantees PICP≈1−α
         widened by σ_epistemic when members disagree
```
The two failure modes this guards against:
1. **Members agree but are jointly wrong** (low epistemic, high aleatoric) → conformal residual width keeps the interval honest; coverage error (§1.3.4) would otherwise blow out.
2. **Genuine ambiguity** (high epistemic, e.g. near a regime break) → member spread widens the band, so the system *says it doesn't know* rather than emitting a false-precision point.

This decomposition is why §1.3.4 tracks coverage error as a first-class calibration signal and why a regime break (§3.4) **shrinks the residual buffer** before re-forecasting — stale aleatoric estimates would otherwise under-cover right when uncertainty is highest.

### 2.6 Overlapping lead-times (the rolling-cycle picture)
Because each cycle emits a *new* forecast row while older ones stay `pending` until their own `due_at`, at any instant a target has **many overlapping forecasts in flight** — a 1h forecast issued 10 min ago, a 1d forecast issued 6h ago, a 7d forecast issued 2d ago, etc. This is the rolling-NWP picture: lead-time-stratified forecasts maturing on a conveyor. The matcher (§1.2) scores each as it comes due, and skill is always aggregated **per horizon bucket** (§6.2) because skill degrades with lead-time — collapsing horizons would average a sharp 1h forecast with a vague 7d one and hide both.

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

**Why residuals, not raw outputs:** if the model is valid, residuals `e_i = y_i − ŷ_i` are a *stationary, mean-zero* stream regardless of how the inputs move — the model has "explained away" the input variation. So a shift in the residual distribution is a direct signal that the *mapping* (not just the input mix) has degraded. PSI watches the inputs; KS watches whether the model still maps them correctly; together they triage **data drift vs model rot** (RB-DRIFT's first question).

**Worked KS example (intuition for the statistic).** Reference residuals `E_ref` centered at 0 with spread ~0.01; recent residuals `E_cur` have drifted to a mean of +0.03 (the model now systematically under-predicts). The empirical CDFs separate: at `x=0`, `F_ref(0)≈0.50` but `F_cur(0)≈0.10` (most recent residuals are now positive). The KS statistic `D = sup_x|F_ref−F_cur|` picks up this ~0.40 vertical gap; with `n_ref=n_cur=200` the asymptotic p-value `p ≈ 2·exp(−2·D²·n_eff)` is `≈ 2·exp(−2·0.16·100) ≈ 2·exp(−32) ≈ 0` ≪ 0.01 → **alarm**. A pure scale change (same mean, doubled spread) shows up as gaps in the *tails* of the CDF comparison, also caught — that's the "bias and scale" coverage PSI-on-inputs misses.

### 3.4 Regime break — change-point on the error series (BOCPD)
A KS/PSI alarm says *something shifted*; we also need **when** and whether it is a persistent regime break. Run **Bayesian Online Changepoint Detection (BOCPD)** on the rolling error series `{e_i}`:

```
# BOCPD core (Adams & MacKay 2007), run-length r_t posterior
P(r_t | e_{1:t}) ∝ Σ_{r_{t-1}} P(r_t | r_{t-1})·P(e_t | r_{t-1}, e^{(r)})·P(r_{t-1} | e_{1:t-1})
hazard H(r) = 1/λ           # constant-hazard prior, expected run length λ
predictive P(e_t | ·)       # Student-t (Normal-InvGamma conjugate on residuals)
```
A **changepoint** is declared when the MAP run-length `r_t` collapses to ~0 with posterior mass `> CP_THRESHOLD` (default 0.5). This integrates with PELT (offline, batch backtests) — PELT for retrospective segmentation, BOCPD for the online stream. On a confirmed changepoint: fire the `regime break` re-forecast trigger (§2.2), shrink the conformal residual buffer to the post-break segment (old residuals are stale), and flag affected models for the retrain evaluation (§4.2).

### 3.4.1 BOCPD — full recursion, conjugate predictive, and worked update
The §3.4 summary states the recursion; here it is derived to the level a validator can re-implement. BOCPD maintains a posterior over the **run length** `r_t` = "number of steps since the last changepoint." The joint recursion (Adams & MacKay 2007) factorizes into **growth** (run continues) and **changepoint** (run resets) messages:
```
γ_t(r_t) := P(r_t, e_{1:t})
# growth  (r_t = r_{t-1}+1): run continues, no changepoint
γ_t(r_{t-1}+1) = γ_{t-1}(r_{t-1}) · π(e_t | r_{t-1}) · (1 − H(r_{t-1}))
# changepoint (r_t = 0): a break happened at t
γ_t(0)         = Σ_{r_{t-1}} γ_{t-1}(r_{t-1}) · π(e_t | r_{t-1}) · H(r_{t-1})
# normalize → posterior
P(r_t | e_{1:t}) = γ_t(r_t) / Σ_{r} γ_t(r)
```
- **Hazard `H(r)=1/λ`** (constant-hazard prior): the per-step prior probability that the current run ends, with expected run length `λ` (default 250 ticks for high-freq, tuned per target). Constant hazard = geometric run-length prior, the memoryless default.
- **Predictive `π(e_t | r)`** is the posterior-predictive of the residual model conditioned on the last `r` observations. We use the **Normal–Inverse-Gamma** conjugate prior on `(μ, σ²)` of the residuals, whose posterior predictive is a **Student-t**:
```
e_t | e^{(r)} ~ Student-t( ν=2α_r,  loc=μ_r,  scale²=β_r(κ_r+1)/(α_r κ_r) )
# hyperparameter updates as each residual joins run r (standard NIG conjugacy):
κ_r ← κ_r + 1
μ_r ← (κ_r μ_r + e_t)/(κ_r+1)
α_r ← α_r + 1/2
β_r ← β_r + κ_r (e_t − μ_r)² / (2(κ_r+1))
```
- **Changepoint declaration:** the MAP run length `r̂_t = argmax_r P(r_t|·)`. A changepoint at `t` is declared when `P(r_t = 0 | e_{1:t}) > CP_THRESHOLD` (default 0.5) — i.e. the model now believes, with majority posterior mass, that the run reset. `oracle_drift_bocpd_cp_prob` emits `P(r_t=0|·)`.

**Worked single-step update (intuition).** Suppose a long run has predictive `Student-t(loc≈0, scale≈0.01)` (residuals tightly around 0). A new residual arrives at `e_t = 0.15` (15σ-ish). The growth message multiplies by the *tiny* predictive density of 0.15 under that t, while the changepoint message (`r_t=0`, broad prior predictive) assigns 0.15 a *much larger* density → mass floods to `r_t=0` → `P(r_t=0|·)` jumps above 0.5 → **changepoint**. That is BOCPD detecting that "the error structure just broke," firing the §2.2 regime-break trigger.

**Online vs offline split:** BOCPD runs on the live stream (one update per scored residual, `O(t)` run-length states, pruned to a window for `O(1)` amortized cost). **PELT** (Pruned Exact Linear Time) does the *retrospective* segmentation in batch backtests (§6.2) — it finds the globally-optimal set of changepoints minimizing a penalized cost over the whole series, used to report "skill in calm vs break regimes." The two agree on stable series; divergence (BOCPD flags a break PELT later un-segments) is itself a monitored signal (a transient vs a true regime).

### 3.5 Drift dashboard summary
The drift subsystem emits, per (target, model): `psi_max`, `psi_mean`, `ece`, `coverage_error`, `ks_pvalue`, `bocpd_cp_prob`, and a single rolled-up `drift_score ∈ [0,1]` (weighted max of normalized signals) for at-a-glance alerting.

### 3.6 Rolled-up `drift_score` — exact composition and a worked value
The four surfaces have incomparable scales (PSI unbounded≥0, KS p∈[0,1] inverted, ECE∈[0,1], cp_prob∈[0,1]). `drift_score` normalizes each to `[0,1]` "alarm-ness" then takes a **weighted max** (max so any single blown surface dominates; weighted so we can de-emphasize a noisy one):
```
n_psi  = clip(psi_max / 0.2, 0, 1)            # 1.0 at the 0.2 alarm
n_ks   = clip(1 − ks_pvalue / 0.01, 0, 1)     # 1.0 when p≤0.01 alarm
n_ece  = clip(ece / 0.1, 0, 1)                # 1.0 at the 0.1 alarm
n_cp   = clip(bocpd_cp_prob / 0.5, 0, 1)      # 1.0 at the 0.5 threshold
n_cov  = clip(|coverage_error| / 0.05, 0, 1)  # 1.0 at the ±0.05 band edge
drift_score = max(w_psi·n_psi, w_ks·n_ks, w_ece·n_ece, w_cp·n_cp, w_cov·n_cov)
# default weights all 1.0; A-DRIFT pages at drift_score > 0.5
```
**Worked value.** `psi_max=0.12` → n_psi=0.60; `ks_pvalue=0.20` → n_ks=0 (well above 0.01); `ece=0.04` → n_ece=0.40; `cp_prob=0.10` → n_cp=0.20; `|CE|=0.01` → n_cov=0.20. `drift_score = max(0.60, 0, 0.40, 0.20, 0.20) = 0.60` → **A-DRIFT pages** (>0.5), driven by PSI even though no single hard alarm (PSI 0.12 < 0.2) tripped on its own — the rolled-up score is *more sensitive* to a co-occurrence of moderate signals, which is exactly its job as an early warning.

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

### 7.6 Full metrics catalogue (names · types · labels · alert binding)

The table below is the **authoritative emission contract** — exact metric names, Prometheus-style types, the label set, and which alert (§7.7) each binds to. All metrics share the base label set `{target_key, horizon_bucket, model_id, version, env}` unless noted; additional labels are listed in the Labels column. Types: `gauge` (point-in-time), `counter` (monotonic), `histogram` (latency/distribution), `rate` (derived per-second).

| Metric name | Type | Extra labels | Unit | Source | Binds to alert |
|---|---|---|---|---|---|
| `oracle_skill_mae` | gauge | window | abs-error units | §1.3.1 | — |
| `oracle_skill_rmse` | gauge | window | abs-error units | §1.3.2 | — |
| `oracle_skill_crps` | gauge | window | score units | §1.3.3 | — |
| `oracle_skill_crpss` | gauge | baseline | unitless | §1.3.5 | A-SKILL |
| `oracle_cov_picp` | gauge | window | fraction | §1.3.4 | A-CAL |
| `oracle_cov_coverage_error` | gauge | window | fraction | §1.3.4 | A-CAL |
| `oracle_cov_mpiw` | gauge | window | interval units | §1.3.4 | — |
| `oracle_cal_ece` | gauge | window | fraction | ai_models ECE | A-CAL |
| `oracle_drift_psi_max` | gauge | feature | unitless | ai_models PSI | A-DRIFT |
| `oracle_drift_psi_mean` | gauge | — | unitless | ai_models PSI | A-DRIFT |
| `oracle_drift_ks_pvalue` | gauge | — | probability | §3.3 | A-DRIFT |
| `oracle_drift_bocpd_cp_prob` | gauge | — | probability | §3.4 | A-REGIME |
| `oracle_drift_score` | gauge | — | [0,1] | §3.5 | A-DRIFT |
| `oracle_ensemble_weight` | gauge | member | [0,1] | §4.1/§12 | — |
| `oracle_ensemble_ewma_error` | gauge | member | score units | §12.1 | — |
| `oracle_kgik_learned_edges` | gauge | relation | count | §5/§13 | — |
| `oracle_kgik_promotions_total` | counter | relation | count | §13.3 | — |
| `oracle_kgik_decays_total` | counter | relation | count | §13.5 | — |
| `oracle_loop_matched_total` | counter | — | count | §1.2 | — |
| `oracle_loop_unmatchable_total` | counter | cause | count | §1.2 | A-FEEDGAP |
| `oracle_loop_pending_age_seconds` | gauge | quantile=p95 | seconds | §1.2 | A-LOOP |
| `oracle_loop_matcher_lag_seconds` | gauge | — | seconds | §1.2 | A-LOOP |
| `oracle_predict_latency_seconds` | histogram | quantile | seconds | serving | A-SLO |
| `oracle_predict_error_rate` | rate | code | errors/s | serving | A-SLO |
| `oracle_registry_transition_total` | counter | from,to | count | §4.5/§10 | — |
| `oracle_canary_stage` | gauge | challenger | {0,5,25,50,100} | §11.2 | A-CANARY |
| `oracle_trend_crpss_slope` | gauge | — | slope | §6.5 | A-SKILL |
| `oracle_trend_improving` | gauge | — | {0,1} | §6.5 | A-SKILL |

**Cardinality control:** `feature` and `member` labels are bounded (≤ feature count, ≤ ensemble size); `target_key` is the highest-cardinality dimension and is the natural sharding key for the metrics store. Histograms (`latency`) export pre-computed `p50/p95/p99` buckets to keep query cost flat.

### 7.7 Alert rules (exact thresholds, for, severity, route)

Each rule is `expr` (PromQL-style) · `for` (sustain window, prevents flapping) · severity · route. Thresholds match the source sections so there is one number, not two.

| Alert id | Expr (threshold) | for | Severity | Route | Runbook |
|---|---|---|---|---|---|
| A-SKILL | `oracle_trend_crpss_slope < 0` (95%-CI upper<0) **OR** `oracle_skill_crpss < 0` | 3 cycles | page | on-call | RB-SKILL-REGRESSION |
| A-DRIFT | `oracle_drift_psi_max > 0.2` **OR** `oracle_drift_score > 0.5` | 2 windows | ticket→page | ML owner | RB-DRIFT |
| A-CAL | `oracle_cal_ece > 0.1` **OR** `abs(oracle_cov_coverage_error) > 0.05` | sustained (calib window) | ticket | ML owner | RB-CALIBRATION |
| A-REGIME | `oracle_drift_bocpd_cp_prob > 0.5` (confirmed 2 ticks) | 2 ticks | info→ticket | ML owner | RB-DRIFT (regime path) |
| A-CANARY | challenger live-slice trips R1–R6 (§10.4) | 1 dwell tick | auto-rollback + page | on-call | RB-CANARY-ROLLBACK |
| A-LOOP | `oracle_loop_pending_age_seconds{p95} > GRACE_WINDOW` **OR** `oracle_loop_matcher_lag_seconds > 2·tick` | 2 ticks | page | on-call | RB-LOOP-STALLED |
| A-FEEDGAP | `rate(oracle_loop_unmatchable_total[1h]) > FEEDGAP_RATE` | 1 h | ticket | data owner | RB-FEEDGAP |
| A-SLO | `oracle_predict_latency_seconds{p99} > SLO_latency` **OR** `oracle_predict_error_rate > SLO_error_rate` | 2 min | page | on-call | RB-SLO |

`for` windows are deliberate: paging alerts (A-SKILL, A-LOOP, A-SLO) require multi-cycle/multi-minute persistence so a single noisy point doesn't wake on-call; `A-CANARY` fires on a *single* dwell tick because protecting live traffic outweighs flap-avoidance (the cost of a false rollback is low — challenger returns to shadow).

### 7.8 Runbooks per alert (additions to §7.5)

- **RB-FEEDGAP (A-FEEDGAP):** check the upstream feed's last-write timestamp and ingestion health (§04). If feed down → declare incident, stop counting affected forecasts as model failures (they're `unmatchable`, not wrong), optionally move the target to `FROZEN` (§10) so canaries don't promote on a starved sample. When feed recovers, backfill outcomes and re-run the matcher over the gap window. Do **not** retrain on a feed-gap-induced "drift" — RB-DRIFT's data-vs-model triage must classify it as data first.
- **RB-SLO (A-SLO):** verify it's the model path (not infra). If latency: check ensemble size / member timeout config; consider shedding the slowest member (it keeps being scored, just not awaited). If error_rate: check the serving deploy; if a recent canary correlates, A-CANARY's R4/R5 should already be rolling it back — confirm rollback completed.
- **RB-REGIME (A-REGIME path of RB-DRIFT):** confirm the BOCPD changepoint with PELT offline segmentation (§3.4); if persistent, shrink the conformal buffer to the post-break segment **before** the next re-forecast (FSM invariant §10.2.4), queue T4 retrain on post-break data only, and annotate the skill dashboard with the changepoint marker so the §6.5 trend is read per-segment, not across the break.

Each alert's runbook ends with a **resolution check**: the alert auto-resolves only after the bound metric is back within threshold for the same `for` window (no manual "ack-and-forget").

---

## 10. CONTINUAL-LEARNING STATE MACHINE (complete)

§§1–5 describe the *mechanisms*; this section is the **single authoritative finite-state machine (FSM)** that sequences them, so the self-improvement loop is deterministic, auditable, and replayable. There are two coupled FSMs: a **per-target learning FSM** (the macro loop) and a **per-model-version registry FSM** (§4.5, restated here with full transitions/guards). Every transition is logged to `learning_audit(target_key, model_id, from_state, to_state, trigger, guard_snapshot, at)`.

### 10.1 Per-target learning FSM — states

| State | Meaning | Active subsystems |
|---|---|---|
| `STEADY` | nominal; cycling + matching + online re-weight running | §1.2 matcher, §2 cycler, §4.1 re-weight |
| `WATCH` | a soft signal tripped (moderate PSI, single bad cycle); heightened monitoring, no action yet | + tighter cycler cadence |
| `DRIFTING` | a hard drift surface alarmed (PSI>0.2 / ECE>0.1 / KS p<0.01) | + §7.4 runbook opened |
| `REGIME_BREAK` | BOCPD changepoint confirmed; pre-break data declared stale | + conformal buffer shrunk, re-forecast trigger |
| `RETRAINING` | one or more challengers building under leakage guards | + §6 backtest harness |
| `EVALUATING` | challenger(s) in shadow, accumulating ≥M scored forecasts | + per-member shadow scoring |
| `CANARY` | eligible challenger ramping 5→25→50→100% on live traffic | + canary controller §4.4 |
| `ROLLBACK` | canary regressed; reverting to champion | + auto-rollback path |
| `FROZEN` | manual hold (incident, data-feed outage) — no promotions, serve last-good champion | matcher only (best-effort) |

### 10.2 Per-target FSM — transition table (state × trigger → next, guard)

| From | Trigger | Guard (must hold) | To | Side-effects |
|---|---|---|---|---|
| STEADY | PSI∈[0.1,0.2] **or** 1 cycle CRPSS<median−X% | — | WATCH | tighten cadence; emit `state_change` |
| STEADY | PSI>0.2 / ECE>0.1 / KS p<0.01 sustained | signal sustained ≥2 windows | DRIFTING | open RB-DRIFT/RB-CALIBRATION |
| STEADY | BOCPD cp_prob>0.5 | confirmed on 2 consecutive ticks | REGIME_BREAK | shrink conformal buffer, re-forecast |
| WATCH | signal clears (PSI<0.1, CRPSS recovers) | 3 consecutive clean cycles | STEADY | restore cadence |
| WATCH | signal escalates to hard alarm | — | DRIFTING | open runbook |
| DRIFTING | retrain trigger T2/T3/T4 fires | data-vs-model triage done (RB-DRIFT) | RETRAINING | queue challenger(s) |
| DRIFTING | drift is *data-side* and fixed (feed restored, ref refreshed) | next 30 forecasts clean | STEADY | close runbook |
| REGIME_BREAK | retrain on post-break segment queued | post-break n ≥ N_min(target) | RETRAINING | drop pre-break from train set |
| REGIME_BREAK | insufficient post-break data | n < N_min | WATCH | wait, widen intervals defensively |
| RETRAINING | challenger built + backtest accept (§6.4) | leakage assertions pass | EVALUATING | registry: staging→shadow |
| RETRAINING | challenger fails backtest | — | STEADY | registry: staging→rejected |
| EVALUATING | eligible_for_promotion (§4.3) | M≥30, δ-margin, cal OK | CANARY | start ramp at 5% |
| EVALUATING | not eligible after eval window | window elapsed | STEADY | hold challenger in shadow or reject |
| CANARY | stage dwell passes criteria | live-slice CRPSS≥champion+δ, no SLO breach | CANARY (next %) | advance ramp |
| CANARY | reached 100% and held | full-traffic criteria hold for dwell | STEADY | challenger→champion (promote) |
| CANARY | regression / SLO breach | any rollback criterion (§10.4) | ROLLBACK | revert traffic to champion |
| ROLLBACK | champion restored | traffic 100% champion, metrics nominal | STEADY | challenger→shadow, file ticket |
| any | operator hold / incident | manual | FROZEN | freeze promotions |
| FROZEN | operator release | incident closed | STEADY | resume |

**Invariants (asserted in the FSM driver):**
1. A target is in **exactly one** state at a time (single-writer lock per `target_key`).
2. You may **only** serve a `production` model; `CANARY` serves a *blend* (champion + challenger by traffic %), never an unscored version.
3. No transition into `CANARY` without a prior `EVALUATING` pass — promotion-on-noise is structurally impossible.
4. `REGIME_BREAK` always shrinks the conformal residual buffer **before** any re-forecast, so the very next interval reflects post-break uncertainty.
5. Every transition writes `learning_audit` with the full `guard_snapshot` (the metric values that justified it) — this is the replay/audit trail for §6.5 disputes.

### 10.3 Guards in detail (the predicates above, made precise)

```
guard.sustained(signal, k_windows):      signal true in each of the last k drift windows
guard.eligible_for_promotion(ch, champ): n_scored(ch) ≥ M
                                         AND CRPSS(ch) ≥ CRPSS(champ) + δ          (δ=0.02)
                                         AND |coverage_error(ch)| ≤ 0.05
                                         AND ECE(ch) ≤ ECE(champ) + 0.02           (no cal regression)
guard.canary_stage_pass(ch, stage):      live-slice metrics over dwell window satisfy
                                         CRPSS(ch_live) ≥ CRPSS(champ_live)         (>= , not +δ on live)
                                         AND |coverage_error| ≤ 0.05
                                         AND latency_p99 ≤ SLO AND error_rate ≤ SLO
guard.post_break_data(tk):               count(scored forecasts with issued_at > break_at) ≥ N_min(tk)
guard.clean(tk, n):                      last n forecasts: no drift alarm, |CE|≤0.05, CRPSS≥0
```

### 10.4 Rollback criteria (CANARY → ROLLBACK) — the kill switch

Rollback fires if **any** of these hold at **any** canary stage (evaluated each dwell tick on the live-served slice):
```
R1  CRPSS(challenger_live) < CRPSS(champion_live)            # outright skill regression
R2  |coverage_error(challenger_live)| > 0.08                 # interval calibration blown (wider band than promo gate)
R3  ECE(challenger_live) > champion ECE + 0.05               # probabilistic miscalibration
R4  latency_p99 > SLO_latency  for ≥ 2 consecutive minutes   # serving SLO breach
R5  error_rate > SLO_error_rate                              # serving health breach
R6  any DRIFTING/REGIME_BREAK alarm attributable to the challenger
```
On rollback: (a) flip 100% of traffic back to champion in **one** registry transition; (b) snapshot the triggering metrics into `learning_audit.guard_snapshot`; (c) demote challenger `production→shadow` (kept scored for diagnosis, never auto-retried without a code/data change); (d) page on-call (RB-CANARY-ROLLBACK). Rollback is **idempotent** and must complete within the canary dwell tick so a bad challenger never serves a full window of degraded traffic.

---

## 11. CHAMPION / CHALLENGER + CANARY ROLLOUT — full protocol

This expands §§4.3–4.4 into an operational protocol with the exact ramp, dwell windows, traffic-routing mechanics, statistical gates, and rollback wiring.

### 11.1 Roles and routing
- **Champion `C`** — current `production` version; serves `100 − p`% of live `/predict` traffic during a canary at fraction `p`.
- **Challenger `H`** — `shadow` then `production`-canary candidate; serves `p`% of live traffic.
- **Routing key:** deterministic hash of `(target_key, forecast_id_seed)` → bucket in `[0,100)`; a forecast with bucket `< p` is served by `H`, else by `C`. Deterministic hashing means a given series/request is *stable* across the dwell (no flapping between models within a stage), which keeps per-slice metrics interpretable.
- **Shadow (p=0):** `H` predicts **every** cycle and is scored, but **0%** of traffic is *served* its output. This is how `EVALUATING` accumulates the M≥30 sample at zero user risk.

### 11.2 Ramp schedule and dwell windows
```
stage:    SHADOW → 5% → 25% → 50% → 100%
dwell:      (eval)  D1     D2     D3     D4
```
| Stage | Traffic to H | Default dwell | Min scored on live slice | Advance guard |
|---|---|---|---|---|
| SHADOW | 0% | until M≥30 (per horizon) | 30 | §10.3 eligible_for_promotion |
| 5% | 5% | D1 = 24 h or ≥ 20 served-and-scored | 20 | canary_stage_pass |
| 25% | 25% | D2 = 24 h or ≥ 50 | 50 | canary_stage_pass |
| 50% | 50% | D3 = 24 h or ≥ 100 | 100 | canary_stage_pass |
| 100% | 100% | D4 = 48 h soak | 200 | canary_stage_pass → **promote** |

Dwell is `max(wall-clock, min-sample)` so a low-traffic target ramps on *evidence*, not just time. The 100% stage is a **soak** (longer dwell, larger sample) before the challenger is finally written as champion — the soak catches slow-burn regressions (e.g. a weekly seasonality the shorter stages didn't span).

### 11.3 Promotion (CANARY 100% → champion)
On a passing 100% soak: `registry.transition(H, champion)`; set `H.champion_since = now`; set old champion `C → retired` with `retired_at = now` (kept for lineage/backtest reproducibility, §4.5); write `metrics_snapshot` (the soak skill) onto `H`. Emit `oracle.registry.transition{from=production-canary,to=champion}`.

### 11.4 Rollback wiring (operational)
The canary controller runs a **watchdog** each dwell tick that evaluates R1–R6 (§10.4). On any trip it calls `registry.rollback(H)`:
```
def rollback(H):
    route.set_fraction(target_key, H, 0)        # all traffic → champion C, atomically
    registry.transition(H, "shadow")
    audit.write(from="production-canary", to="shadow", trigger=tripped_rule, snapshot=metrics)
    page("RB-CANARY-ROLLBACK", H, tripped_rule)
    canary.lock(H, cooldown=COOLDOWN)           # don't auto-re-ramp same artifact
```
`COOLDOWN` (default 7 d) prevents an oscillating challenger from thrashing traffic; re-entry to canary requires a *new* `version` (a real change), enforced by the registry (the same `params_hash` cannot re-enter canary within cooldown).

### 11.5 Why staged + statistical (not just "flip and watch")
A single flip exposes 100% of users to an unvetted model and gives a *biased* comparison (champion and challenger never scored on the same conditions). Staged canary with deterministic routing gives a **paired, same-period** comparison at each stage and bounds blast radius to `p`% until the evidence (M-sample, δ-margin, calibration, SLO) clears. The δ-margin at the SHADOW gate and the `≥` (no-margin) gate on live slices is deliberate: we demand a *demonstrated* edge before any exposure, then only require *non-inferiority* to keep ramping.

---

## 12. ONLINE ERROR-WEIGHTED ENSEMBLE — update math & decay schedule

This expands §4.1 with the full update derivation, the decay schedule, the cold-start handling, and a worked recovery trace.

### 12.1 The EWMA error estimator (derivation of the effective window)
Each member's recent error is an exponentially-weighted moving average of its per-forecast score `S_k(t)` (default CRPS from the per-member `skill_record`, §1.4):
```
Ē_k(t) = β · Ē_k(t−1) + (1 − β) · S_k(t)
```
Unrolling, `Ē_k(t) = (1−β) Σ_{j≥0} β^j S_k(t−j)` — a geometric kernel. The **effective window** (sum of weights / max weight, equivalently the kernel's "center of mass") is `1/(1−β)`; at `β=0.9` that is **~10 cycles**, the number quoted in §4.1 and §8.4. Larger `β` = longer memory (smoother, slower to react); smaller `β` = faster reaction (noisier). `β` is per-target tunable: high-frequency, regime-prone targets use `β≈0.8` (window ~5); slow seasonal targets use `β≈0.95` (window ~20).

**Bias-corrected init.** A raw EWMA initialized at `Ē_k(0)=0` is biased low for the first few cycles. We apply the standard correction `Ê_k(t) = Ē_k(t) / (1 − β^t)` for `t ≤ t_warm` (default 10), so weights are trustworthy from cycle ~3 rather than ~10.

### 12.2 The weight map (derivation of inverse-error normalization)
```
w_k = (1/(Ē_k + ε))^γ  /  Σ_j (1/(Ē_j + ε))^γ
```
This is a **softmax over log-inverse-error** with temperature `1/γ`: `w_k ∝ exp(γ · ( −ln(Ē_k+ε) ))`. Hence:
- `γ → 0`: all exponents → equal → **uniform weights** (the safe prior; we never concentrate without evidence).
- `γ = 1`: weight ∝ `1/error` (harmonic emphasis — the patent's inverse-error rule, WO2014075108A2).
- `γ → ∞`: winner-take-all (only the current-best member). We cap `γ ≤ γ_max` (default 3) to avoid over-concentration on a member that's merely lucky this window.
- `ε` (default 1e-9 on CRPS scale): prevents divide-by-zero when a member is briefly perfect.

**The recovery floor.** Weights are floored at `w_min` (default 0.01) and renormalized: `w_k ← max(w_k, w_min)`, then `w ← w/Σw`. A floored member still contributes 0.01 of the mixture and **keeps being scored**, so when it recovers its `Ē_k` falls and its weight climbs back — a zeroed-out member could never earn its way back (it would stop affecting `ŷ_ens` but is still scored individually, so the floor is about *mixture* participation, not scoring).

### 12.3 Update procedure (called online from the matcher, §1.2)
```
def update_ensemble_weights(rec):            # rec = a scored per-member skill_record
    k  = rec.model_id
    s  = rec.crps                            # chosen score S_k(t)
    Ē  = load(tk, k).ewma_error
    Ē' = BETA*Ē + (1-BETA)*s                 # §12.1
    if t <= WARM: Ē' /= (1 - BETA**t)        # bias correction
    persist ewma_error=Ē', updated_at=now
    # recompute the whole weight vector for the target (cheap: m members)
    raw = { j: (1.0/(E_j + EPS))**GAMMA for j in members(tk) }
    w   = normalize(raw)
    w   = { j: max(wj, W_MIN) for j,wj in w.items() }; w = normalize(w)
    persist ensemble_weights(tk, j, w[j]) for j in members(tk)
```
Cost is `O(m)` per scored forecast — continuous and cheap (§4.1), no retraining to react to a member degrading.

### 12.4 Decay schedule (when a member goes silent)
If a member produces **no** forecast for a cycle (model down, feed gap), its `Ē_k` is not updated by new evidence but its *trust* should not stay frozen forever. A **staleness decay** nudges a silent member's weight toward the floor:
```
ON cycle with no fresh score for member k:
    gap_cycles = cycles since last score for k
    w_k ← w_k · ρ^gap_cycles           # ρ = 0.95 per missed cycle
    renormalize; floor at w_min
```
This is distinct from the KGIK edge decay (§5.4, time-based on confidence); here it is *participation* decay so a dead member doesn't keep a stale high weight. When the member returns, normal §12.3 updates resume from its last `Ē_k`.

### 12.5 Worked recovery trace (the §8.4 acceptance scenario)
Three members A, B, C; `β=0.9`, `γ=1`, `w_min=0.01`. At t0 all have `Ē=0.10`, so `w=[0.333,0.333,0.333]`. Now **B degrades** — its CRPS jumps to 0.50 each cycle while A,C stay at 0.10:

| cycle | Ē_B (EWMA) | raw_B=1/Ē_B | w_B (norm, floored) |
|---|---|---|---|
| 0 | 0.100 | 10.0 | 0.333 |
| 1 | 0.140 | 7.14 | 0.263 |
| 3 | 0.211 | 4.74 | 0.191 |
| 5 | 0.272 | 3.68 | 0.155 |
| 8 | 0.343 | 2.92 | 0.127 |
| 10 | 0.380 | 2.63 | 0.116 |

B's weight roughly **halves within ~10 cycles** (the effective window) — satisfying §8.4 "down-weighted within ~10 cycles." When B is fixed (CRPS back to 0.10), the EWMA decays back toward 0.10 over another ~10 cycles and `w_B` climbs back toward 0.33 — the floor guaranteed it never hit 0, so recovery is automatic. ✓

---

## 13. KGIK EDGE-LEARNING ALGORITHM — full specification

This is the complete algorithm behind §5: add (create a learned edge), strengthen (Laplace update on confirmation), and decay (time-based + pruning), with every threshold made explicit. It mirrors `reasoning.record`/`_confidence` (reasoning.py:31–56) and `CausalBelief` (models.py:475–494) — the **same** Laplace add-one rule with a 0.5 prior, applied to graph edges instead of per-Minion cause→effect beliefs.

### 13.1 Constants (single source of truth)
```
PRIOR_CONF        = 0.5     # CausalBelief.confidence default (models.py:493)
PROMOTE_MIN       = 3       # confirmations to promote hypothesis→learned (mirrors MIN_TRIALS_TO_ACT=3, reasoning.py:19)
PROMOTE_CONF      = 0.66    # confidence gate to promote (≈ reasoning ACT_CONFIDENCE=0.6, raised for graph)
TAU_DAYS          = 30.0    # exponential decay time-constant (§5.4)
PRUNE_THRESHOLD   = 0.40    # demote learned→hypothesis below this (mirrors reasoning.py:83 confidence<0.4)
HARD_PRUNE        = 0.20    # archive (remove from active graph) below this
K_STALE_TRIALS    = 5       # trials_since_confirm before demotion is allowed
```
Note the deliberate parity: `PROMOTE_MIN = MIN_TRIALS_TO_ACT = 3` and `PRUNE_THRESHOLD = 0.40` exactly matches the "bad belief" bar in `reasoning.reflect` (reasoning.py:83, `confidence < 0.4`). KGIK learning *is* CausalBelief revision lifted to the graph.

### 13.2 ADD — creating a learned edge from a discovery
PATTERN-DISCOVERY (§06) proposes an edge `(src, dst, relation, effect_size)` (a lead-lag, Granger/CCM screen hit, or Matrix-Profile motif). On first proposal:
```
def add_edge(src, dst, relation, effect_size):
    if exists(src,dst,relation): return strengthen-path        # idempotent
    insert kgik_edge(
        edge_id=uuid(), src=src, dst=dst, relation=relation,
        learned=False,                       # hypothesis until PROMOTE_MIN confirmations
        trials=0, confirmations=0,
        confidence=PRIOR_CONF,               # 0.5 uninformative prior
        evidence_count=0, effect_size=effect_size,
        last_seen_at=now, updated_at=now)
```
The edge enters as a **hypothesis** (`learned=False`) at confidence 0.5 — it can influence forecasts only weakly (gated by confidence downstream) until it earns promotion.

### 13.3 STRENGTHEN — Laplace update on a scored forecast that used the edge
Called from the matcher (§1.2) via `maybe_promote_kgik` when a scored forecast `f` relied on edge `E` as a driver:
```
def strengthen(E, f, y_true):
    pred_dir = sign(driver_contribution(E, f.point))      # direction E pushed ŷ
    real_dir = sign(y_true − f.baseline_point)            # realized direction vs baseline
    confirmed = (pred_dir == real_dir) and (skill_score(f) > 0)   # directional AND beat baseline

    E.trials        += 1
    E.confirmations += 1 if confirmed else 0
    E.evidence_count = E.confirmations
    E.confidence     = laplace(E.confirmations, E.trials)         # §13.4
    E.last_seen_at   = now ; E.updated_at = now

    if (not E.learned) and E.confirmations >= PROMOTE_MIN and E.confidence >= PROMOTE_CONF:
        E.learned = True                                          # PROMOTE
        emit("oracle.kgik.promotions", +1)
```
The **double condition** for `confirmed` (correct direction *and* the forecast beat baseline) is the calibrated-honesty guard: an edge gets no credit for being "right" on a forecast that was worse than persistence — that would reward spurious correlation. This is stricter than `reasoning.record`'s single `confirmed` boolean, by design (graph edges feed many downstream forecasts, so the bar is higher).

### 13.4 The Laplace formula (verbatim reuse, with the convergence proof)
```
laplace(confirmations, trials) = (confirmations + 1) / (trials + 2)      # reasoning.py:32, round to 4dp
```
- **Prior:** `(0+1)/(0+2) = 0.5` — exactly `CausalBelief.confidence` default and `PRIOR_CONF`.
- **Convergence:** as `trials → ∞` with empirical confirmation rate `r = confirmations/trials`, `(r·t + 1)/(t + 2) → r`. So confidence is a *shrinkage estimator* — pulled toward 0.5 when evidence is thin, converging to the true rate as evidence accrues.
- **Bounded:** strictly in `(0,1)` for all finite `trials` — never exactly 0 or 1, so an edge is **always recoverable and always refutable** (same robustness rationale as the supply-chain Wilson/Laplace estimator, supply_chain.py:153).

**Worked promotion trace.** New edge `FX.EURUSD →(lead_lag@+3d) SEISM.rate`, starts hypothesis at conf 0.5:

| event | confirmed? | trials | confirmations | confidence=(c+1)/(t+2) | learned? |
|---|---|---|---|---|---|
| add | — | 0 | 0 | 1/2 = 0.5000 | no |
| score 1 | yes | 1 | 1 | 2/3 = 0.6667 | no (conf≥0.66 but conf<PROMOTE_MIN trials) |
| score 2 | yes | 2 | 2 | 3/4 = 0.7500 | no (confirmations<3) |
| score 3 | yes | 3 | 3 | 4/5 = 0.8000 | **YES** (≥3 conf, ≥0.66) → promote |
| score 4 | no | 4 | 3 | 4/6 = 0.6667 | stays learned |
| score 5 | no | 5 | 3 | 4/7 = 0.5714 | stays learned (above PRUNE 0.40) |

### 13.5 DECAY — time-based confidence erosion + demotion/prune (nightly sweep)
```
def decay_edge(E):                              # §5.4, run nightly per learned edge
    if not E.learned: return                    # ontology edges (learned=False from birth) are never decayed
    age_days = (now − E.last_seen_at) / 86400
    E.confidence *= exp(−age_days / TAU_DAYS)   # exponential time-decay, half-life = TAU·ln2 ≈ 20.8 d
    E.updated_at = now

    if E.confidence < PRUNE_THRESHOLD and E.trials_since_confirm > K_STALE_TRIALS:
        E.learned = False                        # DEMOTE learned→hypothesis
        emit("oracle.kgik.decays", +1)
    if E.confidence < HARD_PRUNE:
        archive(E)                               # remove from active graph; keep row for audit/lineage
```
- **Half-life:** `exp(−age/TAU)` reaches 0.5 at `age = TAU·ln2 ≈ 20.8 d` — an edge unconfirmed for ~3 weeks loses half its confidence.
- **Demotion** requires *both* low confidence (<0.40, mirroring reasoning.py:83) and staleness (`trials_since_confirm > 5`) so a still-active but currently-unlucky edge isn't demoted prematurely.
- **Archive** at <0.20 removes it from the *active* graph (no longer influences forecasts) but the row persists for lineage/audit and backtest reproducibility.
- **Re-confirmation resets the clock:** any new confirmation updates `last_seen_at` (§13.3), so a continually-confirmed edge never decays — only edges that *stop working* fade. This is the graph tracking the *current* world.

**Worked decay trace.** A learned edge at confidence 0.80, no confirmations, `trials_since_confirm` accumulating, swept nightly (`age_days` measured from `last_seen_at`):

| nightly sweep (days since last_seen) | factor exp(−age/30) | confidence | action |
|---|---|---|---|
| 7 | 0.7919 | 0.80·0.792 = 0.634 | learned |
| 14 | 0.6273 | 0.502 | learned (still > 0.40) |
| 21 | 0.4966 | 0.397 | **demote** (conf<0.40 AND trials_since_confirm>5) → hypothesis |
| 35 | 0.3114 | 0.249 | hypothesis |
| 49 | 0.1954 | 0.156 | **archive** (conf<0.20) |

---

## 14. BACKTESTING HARNESS — design (rolling-origin, purged/embargoed CV)

This expands §6 into a full harness design: the rolling-origin engine, **purged** and **embargoed** cross-validation to prevent the subtle leakage that vanilla k-fold and even naive walk-forward miss, and the harness API.

### 14.1 Why time-series needs more than k-fold
Vanilla k-fold shuffles rows → trains on the future to predict the past = catastrophic leakage. Naive walk-forward fixes the *ordering* but two leaks remain when **features and labels span time**:
1. **Label horizon overlap (need purging):** a training forecast issued at `t` has its *label* realized at `t+h`. If a test fold starts at `t+δ` with `δ<h`, the training label was observed *inside* the test period → the model "saw" test-era information through its own label. **Purge:** drop training samples whose label window `[t, t+h]` overlaps the test window.
2. **Feature lookback bleed (need embargo):** a test sample at `t'` uses features with lookback `L`, i.e. data on `[t'−L, t']`. A training sample just *before* the test fold shares that window. **Embargo:** insert a gap of `L` (the max feature lookback) between train-end and test-start. (López de Prado's purged & embargoed CV.)

### 14.2 Rolling-origin engine (the loop, with purge + embargo)
```
def rolling_origin(series, horizons H, step, mode="expanding",
                   purge=True, embargo=L_max):
    origins = [o_1 < o_2 < ... < o_K]                  # forecast origins along time
    for o in origins:
        train_end  = o
        # PURGE: remove training labels whose realization window overlaps test
        train = series.filter(issued_at <= train_end
                              AND label_realized_at <= train_end)   # label fully in the past
        if mode == "rolling": train = train.window(length=W)        # fixed-length window
        # EMBARGO: gap between train and test so windowed features don't bleed
        test_start = o + embargo
        for h in H:
            assert model.trained_on_through < test_start            # §6.3 model-vintage guard
            ŷ = model.forecast(target, origin=o, horizon=h)         # features computed INSIDE fold (≤o)
            y = realized(target, at=o+h, vintage=as_of(o+h))        # no-revision-peek (§1.2)
            rec = score_forecast(ŷ, y)                              # SAME scoring as live (§1.3)
            emit_backtest_record(rec, origin=o, horizon=h)
```
- **Expanding** (anchored, keeps all past) vs **rolling** (fixed length, drops dead regimes) — default per §6.1.
- **Purge** drops training rows whose label realization crosses `train_end`; **embargo** spaces train/test by `L_max`. Together they guarantee no train sample shares either a *label window* or a *feature window* with any test sample.
- Every `assert` is a hard fail: a fold that would evaluate a model trained past `test_start`, or read a revised outcome, aborts the run (§6.3) — a leaked backtest manufactures fake improvement and is worse than none.

### 14.3 Combinatorial purged CV (optional, for tighter variance estimates)
For acceptance decisions where a single walk-forward path is noisy, the harness supports **CPCV**: partition the timeline into `N` groups, test on every `k`-subset of groups (purging+embargoing the rest), yielding `C(N,k)` backtest *paths* instead of one. The distribution of CRPSS across paths gives a confidence interval on skill (used to set the 95%-CI bound in §6.4/§6.5) rather than a point estimate that might be a lucky split.

### 14.4 Harness API & determinism
```
BacktestRun(
  run_id, target_key, model_version, mode, horizons, step,
  purge, embargo, seed,                       # seed → reproducible member sampling/CRPS-fair
  folds[], records[] (skill_record schema),   # records share the LIVE schema → same scale
  aggregates{per_horizon, per_regime},        # per-horizon + per-PELT-segment (§6.2)
  baselines{persistence, climatology},        # computed on identical folds (§6.4)
  accept: bool, accept_reason, leakage_assertions_passed: bool
)
```
Determinism: a `(model_version, data_vintage, seed)` triple must reproduce identical `aggregates` bit-for-bit — this is what makes a `retired` model version reproducible for audit (§4.5) and what the validation suite re-runs to detect silent metric drift in the harness itself.

---

## 15. EXPERIMENT TRACKING & MODEL REGISTRY — lifecycle

This unifies §4.5 (registry FSM) with an experiment-tracking layer so every challenger is traceable from *idea → built artifact → evaluation → production → retirement*, and any production number can be reproduced.

### 15.1 Experiment record (the "idea + run" unit)
```
experiment(
  experiment_id, target_key, hypothesis,        -- "GBM with regime feature beats champion on break regimes"
  trigger,                                       -- which T1..T6 or manual reason spawned it (§4.2)
  algo, params, params_hash,                     -- config; params_hash dedupes identical configs
  dataset_lineage_id,                            -- -> ai_models.dataset_lineage chain (ai_models.py:24)
  data_vintage (trained_on_through),             -- latest obs the run was allowed to see (leakage audit)
  seed, code_commit,                             -- full reproducibility tuple
  status,                                        -- queued|running|done|failed
  backtest_run_id,                               -- -> §14 BacktestRun
  metrics{crpss, coverage_error, ece, per_horizon}, 
  created_at, finished_at
)
```
Every `RETRAINING` transition (§10) creates an `experiment`; its `params_hash + data_vintage + seed + code_commit` is the **reproducibility key** — re-running that tuple must reproduce `metrics` (ties to §14.4 determinism).

### 15.2 Registry lifecycle (states restated as the model-version FSM, with guards)
```
[experiment done] ─register→ [staging] ─smoke ok→ (eval)
   staging ─backtest accept (§6.4)→ [shadow]
   staging ─backtest fail→ [rejected]
   shadow  ─eligible_for_promotion (§10.3)→ [production:canary 5%]
   shadow  ─eval window elapsed, not eligible→ stays shadow OR [rejected]
   production:canary ─stage pass (§11.2)→ next % … → [champion]
   production:canary ─rollback (§10.4)→ [shadow] (+cooldown §11.4)
   champion ─superseded by new champion→ [retired]
   any ─manual quarantine→ [rejected]
```
| State | Serves? | Scored? | Kept for audit? |
|---|---|---|---|
| staging | no | no | yes |
| shadow | no | yes (every cycle) | yes |
| production (canary/champion) | yes | yes | yes |
| retired | no | no | yes (lineage + backtest repro) |
| rejected | no | no | yes (audit) |

### 15.3 Registry row (full, extends §4.5 / ai_models.model_registry)
```
model_version(
  model_id, version, target_key, algo, params_hash,
  state, trained_at, trained_on_through,        -- data vintage (leakage audit, load-bearing §6.3)
  dataset_lineage_id,                            -- -> ai_models.dataset_lineage (ai_models.py:24-27)
  experiment_id,                                 -- -> §15.1 (idea→artifact link)
  code_commit, seed,                             -- reproducibility
  champion_since, retired_at, superseded_by,     -- lineage chain
  canary_stage, canary_started_at, cooldown_until,
  metrics_snapshot JSON                          -- skill at each transition (promotion/rollback)
)
```
`model_registry`/`dataset_lineage` (ai_models.py:17–27) provide the indexing + provenance-chain primitives this table builds on; `superseded_by` + `retired_at` form the **champion lineage** so "what was serving on date D?" is answerable for any past forecast (audit + dispute resolution).

### 15.4 Lifecycle invariants
1. **One champion per (target_key, horizon)** at any instant; the canary blend is the only multi-version serving state.
2. A `production` version's `trained_on_through` **must predate** every live forecast it serves (it cannot have trained on the future it's predicting).
3. `retired`/`rejected` rows are **immutable** — never deleted (lineage + reproducibility for §6.5 trend disputes).
4. Re-entry to canary requires a **new** `version`/`params_hash` (no re-ramping the same rejected artifact within cooldown, §11.4).
5. Every state transition writes `learning_audit` (§10) with the `metrics_snapshot` that justified it.

---

## 8. ACCEPTANCE CRITERIA (this section's exit gate)

This section is **done / validated** when:

1. **Loop closes:** every `POST /predict` persists a `forecast`; the matcher scores ≥ 99% of due forecasts within `GRACE_WINDOW` (rest classified `unmatchable` with cause).
2. **Metrics correct:** CRPS, RMSE, PICP, coverage_error, CRPSS computed per §1.3 and unit-tested against known closed-form cases (e.g. CRPS of a deterministic forecast == MAE; PICP of a perfectly-calibrated synthetic == `1−α` within MC noise).
3. **Drift reuses audited code:** PSI via `ai_models.drift_detector` (alarm at >0.2), ECE via `ai_models.calibration_error` (alarm at >0.1), plus KS (`p<0.01`) and BOCPD changepoint — all emitting to the drift dashboard.
4. **Re-weighting works:** Error-Weighted Ensemble weights move inversely with EWMA member error online; a deliberately-degraded member is down-weighted within ~10 cycles and recovers when fixed.
5. **Registry lifecycle enforced:** champion/challenger shadow scoring + canary ramp with auto-rollback; leakage guard (`trained_on_through < test_start`) asserted in the harness.
6. **KGIK learns honestly:** a confirmed discovered edge gains confidence via Laplace `(confirmations+1)/(trials+2)` (mirroring `reasoning._confidence` / `CausalBelief`), promotes at `learned=true` after `PROMOTE_MIN` confirmations, and unconfirmed edges decay/prune.
7. **Backtests are leakage-free** and report skill vs both baselines at `/predict/skill`, per horizon. Purge + embargo (§14.1–14.2) are enforced; CPCV (§14.3) yields the CI used for the trend gate; the harness is bit-reproducible for `(model_version, data_vintage, seed)` (§14.4).
8. **The system measurably improves:** on the standing walk-forward backtest suite, **the rolling headline CRPS skill-score trend is ≥ 0 over N=20 cycles** (95%-CI lower bound ≥ −ε) **with no calibration regression** — the §0 / §6.5 contract, asserted in `11_VALIDATION_AND_TEST_PLAN.md`.
9. **State machine is deterministic & auditable:** every target sits in exactly one §10 state; every transition writes `learning_audit` with a guard snapshot; promotion-on-noise is structurally impossible (no `CANARY` without a passing `EVALUATING`).
10. **Canary protects traffic:** staged ramp 5→25→50→100 with deterministic routing (§11.1), per-stage dwell = max(wall-clock, min-sample) (§11.2), and a single-tick watchdog enforcing rollback rules R1–R6 (§10.4) with cooldown on re-entry (§11.4).
11. **Online re-weight math verified:** EWMA effective window `1/(1−β)≈10` at β=0.9 (§12.1), softmax-over-log-inverse-error weight map with floor `w_min` (§12.2), participation decay for silent members (§12.4); the §12.5 recovery trace reproduces in tests.
12. **KGIK constants match CausalBelief:** `PROMOTE_MIN=MIN_TRIALS_TO_ACT=3`, `PRUNE_THRESHOLD=0.40` (reasoning.py:83), Laplace `(c+1)/(t+2)` (reasoning.py:32); add/strengthen/decay traces (§13.4–13.5) reproduce, half-life `TAU·ln2≈20.8d`.
13. **Observability is a contract:** every §7.6 metric (exact name/type/labels) is emitted; every §7.7 alert binds to a metric with the stated threshold + `for` window; every alert has a runbook (§7.5/§7.8) with an auto-resolution check.
14. **Registry/experiment lifecycle traceable:** each challenger has an `experiment` row keyed by `(params_hash, data_vintage, seed, code_commit)` (§15.1); champion lineage (`superseded_by`/`retired_at`) answers "what served on date D?"; retired/rejected rows immutable (§15.4).

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
| KGIK promote/prune constants | `reasoning.MIN_TRIALS_TO_ACT=3` / `ACT_CONFIDENCE=0.6` (reasoning.py:19–20), `reasoning.reflect` `<0.4` bar (reasoning.py:83) |
| CausalBelief trial/confirmation/confidence schema | `CausalBelief` (models.py:475–494): `trials`/`confirmations`/`confidence default 0.5` |
| Laplace add-one update (verbatim) | `reasoning._confidence` `(c+1)/(t+2)` (reasoning.py:31–32), `reasoning.record` bookkeeping (reasoning.py:52–54) |
| CRPS energy form / fair estimator | Gneiting & Raftery 2007 (`03_EVIDENCE_BASE.md`) |
| PSI = symmetrized (Jeffreys) KL | derivation §1.5.2 over `drift_detector` (ai_models.py:74–82) |
| ECE = weighted L¹ reliability gap | derivation §1.5.3 over `calibration_error` (ai_models.py:85–94) |
| Purged & embargoed / combinatorial-purged CV | López de Prado (financial ML CV), §14 |
| Champion lineage / experiment reproducibility | `ai_models.dataset_lineage` (ai_models.py:24–27) + §15 `experiment`/`model_version` |

---

## 16. CROSS-REFERENCE MAP (new deep-dive sections)

This document grew two layers: the **contract layer** (§§0–9, the falsifiable spec) and the **depth layer** (§§10–16, full derivations/protocols/specs). The depth sections expand specific contract clauses:

| Depth section | Expands contract | Grounded in |
|---|---|---|
| §1.5 Derivations & worked examples | §1.3 metric formulas | ai_models PSI/ECE; CRPS energy form |
| §10 Continual-learning FSM | §§2,4 cycling + retrain sequencing | `learning_audit` |
| §11 Champion/challenger + canary | §§4.3–4.4 | registry FSM §4.5 |
| §12 Online EWE update & decay | §4.1 | patent WO2014075108A2 |
| §13 KGIK edge-learning algorithm | §5 | `reasoning._confidence`, `CausalBelief` |
| §14 Backtesting harness | §6 | purged/embargoed CV |
| §15 Experiment tracking & registry | §4.5 | `ai_models.model_registry`/`dataset_lineage` |
| §7.6–7.8 Observability spec | §7 (metrics/dashboards/alerts) | §1.3, §3 surfaces |

Reading order for a new engineer: contract layer first (what must be true), then the depth section matching the subsystem they're building. Every depth section ends with a worked example or trace that the validation suite (§8, `11_VALIDATION_AND_TEST_PLAN.md`) can assert against, so the math is not just described but **checkable**.
