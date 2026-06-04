# PATTERN ORACLE — 11 · Validation & Test Plan
**Document class:** Master Engineering Spec · ISO-execution depth
**Owner:** APEX / KGIK prediction program — QA & MLOps lead
**Scope:** the complete validation strategy that gates every build phase (`13_PHASED_BUILD_PLAN.md`) for the PATTERN ORACLE engine.
**Status:** living document. Cross-refs: requirements `01_MISSION_AND_SCOPE.md` (FR/NFR IDs), algorithms `06_ALGORITHMS.md`, API `07_API_CONTRACTS.md`, MLOps `08_SELF_IMPROVEMENT_AND_MLOPS.md`, orchestration `09_ORCHESTRATION_NL_ROUTING.md`, compute `10_COMPUTE_AND_GPU.md`.

---

## 0. PURPOSE, PRINCIPLES & DEFINITIONS

### 0.1 Purpose
This document specifies **how we prove the engine is correct, calibrated, and self-improving** — and how we prevent regressions. It is the single source of truth for: test levels, the backtesting methodology, calibration validation, the self-improvement acceptance criterion, deterministic/offline execution rules, the requirement→test traceability matrix, fixtures and golden files, CI gates, performance tests, and chaos/failure injection.

### 0.2 First principles (non-negotiable, inherited from `00_MASTER_INDEX.md`)
1. **Grounded, not invented.** A test asserts behaviour that traces to a cited algorithm (`06`) or audited code (`02`). No test asserts a capability we do not implement.
2. **Calibrated honesty over point accuracy.** A forecast that is wrong but *well-calibrated* (coverage ≈ nominal) passes calibration gates; a forecast that is confidently wrong fails. Calibration gates are first-class, not optional.
3. **Determinism by construction.** Every test runs **offline, seeded, and hermetic**. No network, no API key, no wall-clock dependence. Data is supplied via `params`. This mirrors the existing, passing pattern in `server/tests/test_prediction.py`.
4. **Skill is measured, not asserted.** "It improves" is an *empirical* claim proved by a rolling skill-score trend on a frozen backtest harness — see §5.
5. **No leakage, ever.** Any test that touches forecasting must demonstrate train/test temporal separation. Leakage is a P0 defect class.

### 0.3 Glossary of test terms
| Term | Definition |
|---|---|
| **Nominal coverage** `1-α` | Target probability that the realized value falls in the prediction interval (e.g. 0.90 for a 90% PI). |
| **Empirical coverage** | Realized hit-rate of intervals over a holdout set. |
| **CRPS** | Continuous Ranked Probability Score — proper score for the full predictive distribution (lower better). |
| **Skill score** `SS` | `1 − score_model / score_baseline`; >0 means better than baseline; 1 = perfect; <0 = worse than baseline. |
| **ECE** | Expected Calibration Error — `Σ_b (n_b/N)·\|acc_b − conf_b\|` over confidence bins. |
| **PIT** | Probability Integral Transform — `F̂(y)`; if calibrated, PIT values are Uniform(0,1). |
| **Walk-forward / rolling-origin** | Evaluation where the train window advances through time, re-fitting/re-forecasting at each origin. |
| **Golden file** | A checked-in expected-output artifact compared byte/tolerance-wise to current output. |
| **Hermetic test** | Reproducible from only checked-in inputs; no external state, no network, no clock. |

---

## 1. TEST LEVELS (the pyramid)

```
                 ┌─────────────────────────────┐
                 │  E2E / chaos / soak (few)    │  §8.4, §9
                 ├─────────────────────────────┤
                 │  Backtests (skill gates)     │  §3, §5
                 ├─────────────────────────────┤
                 │  Contract tests (API/schema) │  §2.3
                 ├─────────────────────────────┤
                 │  Integration (NL→…→response) │  §2.2
                 ├─────────────────────────────┤
                 │  Unit (algorithms in §06)    │  §2.1   ← bulk of tests
                 └─────────────────────────────┘
```

Target test counts at v1.0 (Phase exit gate): **≥120 unit, ≥25 integration, ≥18 contract, ≥8 backtest suites, ≥6 chaos scenarios.** Coverage gate: **≥85% line / ≥75% branch on `06`/`08` algorithm modules** (see §8.1).

### 1.1 Directory & module layout
```
server/tests/
  test_prediction.py              # EXISTS — offline GBM/seismic/trajectory/growth (the template)
  unit/
    test_gbm_montecarlo.py        # §2.1.A
    test_conformal_enbpi.py       # §2.1.B
    test_hdbscan_regimes.py       # §2.1.C
    test_pelt_bocpd.py            # §2.1.D
    test_enkf_update.py           # §2.1.E
    test_granger_ccm.py           # §2.1.F
    test_matrix_profile.py        # §2.1.G
    test_ensemble_weights.py      # §2.1.H
    test_foundation_ts_adapter.py # §2.1.I (mocked weights / offline stub)
    test_drift_psi_ece.py         # §2.1.J
  integration/
    test_nl_to_forecast.py        # §2.2
    test_orchestrator_route.py    # §2.2
    test_history_lake_roundtrip.py# §2.2
  contract/
    test_api_predict_schema.py    # §2.3
    test_api_backtest_schema.py
    test_api_error_taxonomy.py
  backtest/
    test_skill_gates.py           # §3 walk-forward gates
    test_calibration_holdout.py   # §4
    test_self_improvement_trend.py# §5 (acceptance: SS trend ≥ 0)
  fixtures/                       # §7 synthetic generators + golden files
    synth.py                      # seeded generators (single source)
    golden/                       # *.json golden artifacts
    datasets/                     # frozen real-data slices (USGS/concrete/FX)
  conftest.py                     # seeds, offline env, fixtures
```

A parallel frontend suite lives under `src/**/__tests__/*.test.{js,jsx}` (vitest) — see §8.2.

---

## 2. TEST LEVEL SPECIFICATIONS

### 2.1 UNIT TESTS — one per algorithm in `06_ALGORITHMS.md`

Each algorithm gets a unit suite that asserts **mathematical correctness against a known closed-form or recovery property**, not merely "doesn't crash". Every suite seeds its RNG and supplies data inline.

#### A. GBM Monte-Carlo (`geometric_brownian_motion_montecarlo`) — source: `server/services/prediction.py`
**Property under test:** the Monte-Carlo terminal-price distribution matches the analytic log-normal moments of GBM.
- For `S_T = S_0·exp((μ−σ²/2)t + σ√t·Z)`: `E[S_T] = S_0·e^{μt}`, `Var[S_T] = S_0²e^{2μt}(e^{σ²t}−1)`.
- **Assertions** (N=50k paths, seed=7):
  - `abs(mean(S_T) − S_0·e^{μt}) / (S_0·e^{μt}) < 0.02` (2% MC tolerance).
  - empirical p10/p50/p90 within ±3% of analytic log-normal quantiles.
  - `interval.low < point_estimate < interval.high`; `0 ≤ probability ≤ 1` (reuses the live invariants in `test_prediction.py::test_crypto_prediction_offline`).
  - **Drift/seed determinism:** two runs with identical seed return identical arrays (`np.array_equal`).

#### B. Conformal intervals — EnbPI (`enbpi_conformal`) — source: `06 §EnbPI`, building block `server/services/ai_models.py`
**Property under test:** marginal coverage on exchangeable holdout ≈ nominal.
- Generate y = f(x) + ε, ε ~ N(0,1), n=2000; split into proper-train / calibration / test.
- **Assertions** (nominal 1−α = 0.90):
  - `abs(empirical_coverage − 0.90) ≤ 0.05` (the ±X% gate; X=5% absolute — see §4).
  - interval **width is finite and > 0**; width shrinks (≥10%) when residual σ is halved (adaptivity).
  - under **distribution shift** (test ε scaled ×2) coverage degrades *gracefully* but EnbPI online-update recovers to within 0.07 within 100 steps (asserts the residual-recalibration loop).
  - **Symmetry sanity:** for symmetric residuals, `|q_hi| ≈ |q_lo|` within 5%.

#### C. HDBSCAN cluster recovery (`hdbscan_regimes`) — source: `06 §regime discovery`
**Property under test:** recovers known clusters from synthetic blobs and labels true noise as noise.
- 3 Gaussian blobs (well-separated, seed=42) + 5% uniform noise points.
- **Assertions:**
  - number of discovered clusters == 3.
  - **Adjusted Rand Index** vs ground-truth labels ≥ 0.90 (excluding noise).
  - ≥80% of injected noise points receive label −1.
  - **Stability:** re-run with seed-shuffled point order yields ARI ≥ 0.95 against first run (permutation invariance).

#### D. Change-point detection — PELT & BOCPD (`pelt_changepoint`, `bocpd`) — source: `06 §change-points`
**Property under test:** detects injected mean/variance breaks at known indices.
- Series with mean shift at t=300 and variance shift at t=700 (n=1000, seed=11).
- **Assertions:**
  - each detected change-point within **±5 samples** of truth.
  - **no spurious change-points** on a pure-stationary control series (≤1 false positive at the configured penalty).
  - penalty sensitivity monotone: higher penalty ⇒ fewer change-points (non-increasing count).
  - BOCPD run-length posterior mass collapses (>0.8) at the true break within 10 steps.

#### E. EnKF update (`enkf_assimilation`) — source: `06 §data assimilation`
**Property under test:** the analysis step reduces error variance and the Kalman gain matches the linear-Gaussian closed form.
- Linear-Gaussian toy: known state x, observation H, R, ensemble of M=200 members (seed=5).
- **Assertions:**
  - posterior ensemble variance **< prior** ensemble variance.
  - analysis mean lies between prior mean and observation (convex combination).
  - empirical Kalman gain `K̂` within 5% of analytic `K = P Hᵀ (H P Hᵀ + R)⁻¹`.
  - **conservation:** with R→∞ (no info) posterior ≈ prior (gain→0); with R→0 posterior ≈ observation (gain→1).

#### F. Granger / CCM causal screen (`granger_causality`, `ccm`) — source: `06 §causal screen`
**Property under test:** detects directional coupling in synthetic causal systems; rejects spurious links.
- **Granger:** `y_t = 0.5 y_{t−1} + 0.4 x_{t−1} + ε` (x→y true; y↛x). n=1000, seed=9.
  - assert `p(x→y) < 0.01` and `p(y→x) > 0.10`.
- **CCM:** coupled logistic map (x drives y). assert cross-map skill ρ(y→x reconstruction) rises with library length **and converges higher in the true causal direction**.
- **Null control:** two independent AR(1) series ⇒ Granger p-value uniform-ish, no link at α=0.05 after BH correction (false-positive rate ≤ α on 100 independent null pairs).

#### G. Matrix Profile motif/anomaly (`matrix_profile_stumpy`) — source: `06 §motifs`
- Inject a known repeated motif and a single discord into a random walk.
- **Assertions:** motif indices recovered (top-1 motif overlaps injected pattern ≥ 90%); discord = argmax(MP) within ±window of the injected anomaly.

#### H. Error-weighted ensemble (`error_weighted_ensemble`) — source: `06 §ensemble`, patent WO2014075108A2
- Three synthetic forecasters with known MAE (good/medium/bad).
- **Assertions:** weights are monotone in inverse error (good > medium > bad); weights sum to 1, all ≥0; ensemble RMSE ≤ best member RMSE on holdout (diversity benefit) within tolerance; degenerate case (one perfect member) ⇒ its weight → 1.

#### I. Foundation TS adapter (`timesfm`/`chronos` wrapper) — source: `06 §foundation model`, `10_COMPUTE_AND_GPU.md`
Runs **offline** against a deterministic stub backend (no weights download, no GPU). Asserts the *adapter contract*, not model accuracy:
- input/output tensor shapes; horizon length honoured; NaN-free; quantile outputs monotone (`q10 ≤ q50 ≤ q90`); graceful fallback to classical forecaster when `PREDICT_GPU_URL` unset (asserts §10 fallback path).

#### J. Drift & calibration metrics (`psi`, `ece`) — source: `server/services/ai_models.py`
- **PSI:** identical distributions ⇒ PSI ≈ 0; shifted distribution ⇒ PSI > 0.2 (alert threshold).
- **ECE:** perfectly-calibrated synthetic probabilities ⇒ ECE < 0.02; deliberately over-confident set ⇒ ECE > 0.10.

### 2.2 INTEGRATION TESTS — NL → route → data → forecast → response

Exercises the full chain in `04_ARCHITECTURE.md` with the LLM **disabled** (regex fallback) so it is deterministic. Mirrors `test_prediction.py::test_crypto_via_endpoint_offline` and `::test_classify_regex_fallback_no_llm`.

| ID | Scenario | Path exercised | Key assertions |
|---|---|---|---|
| INT-01 | "forecast eth price in 48h" + inline series | classify → crypto route → GBM → conformal → response | `domain=crypto`, `target=eth`, `horizon_hours=48`, `used_llm=False`, valid interval, populated `assumptions`/`caveats` |
| INT-02 | "chance of M5 quake in 30d" + magnitudes | route → seismic → G-R/Poisson | `0≤probability≤1`, `0.7<b_value<1.4`, method math mentions "poisson" |
| INT-03 | History-Lake-backed forecast (data via fixture, not network) | route → lake read → discovery → forecast | series pulled from `fixtures/datasets`, no network call (asserted via socket guard §6) |
| INT-04 | Multi-stage: discovery (PELT regime) feeds forecast | discovery → regime-aware forecast | regime break detected → ensemble weights change vs no-regime baseline |
| INT-05 | Unanswerable question | full chain, insufficient data | `point_estimate is None`, non-empty `caveats`, HTTP 200 (never 500) — extends `test_insufficient_data_is_structured_not_error` |
| INT-06 | Self-improvement write-back | forecast → persist → (later) score vs realized | outcome row written to store; skill recomputed; KGIK edge strength updated |
| INT-07 | Verifier rejects implausible forecast | forecast → verifier guardrail | out-of-physical-range forecast (negative price) is clamped/flagged with caveat |

### 2.3 CONTRACT TESTS — API schemas from `07_API_CONTRACTS.md`

Schema-validate every request/response against the canonical JSON Schemas (stored in `fixtures/golden/schemas/`). Use `jsonschema` (Python) for response validation and `zod` parity on the frontend.

| ID | Endpoint | Asserts |
|---|---|---|
| CON-01 | `POST /functions/predict` (200) | response matches `PredictResponse` schema; `prediction.interval.{low,high,confidence}`, `method.models_used[]`, `drivers`, `assumptions[]`, `caveats[]` present & typed |
| CON-02 | `POST /functions/predict` (4xx) | malformed body ⇒ structured error matching `ErrorEnvelope` (code, message, hint); never 500 |
| CON-03 | `POST /predict/backtest` | request honours `{series, horizon, folds, baselines[]}`; response carries per-fold + aggregate `{mae,rmse,crps,coverage,skill_score}` |
| CON-04 | `GET /predict/skill` | returns rolling skill timeseries + trend slope + cycle count |
| CON-05 | Auth | missing/invalid bearer ⇒ 401 (mirrors `test_routes.py::test_auth_required`) |
| CON-06 | Versioning | unknown `api_version` ⇒ 400 with supported-versions list; additive fields are backward-compatible (old client ignores new optional fields) |

**Backward-compatibility rule:** contract tests fail the build if a **required** field is removed or a type changes (breaking change) without a version bump. Additive optional fields are allowed.

---

## 3. BACKTESTING METHODOLOGY

### 3.1 Evaluation protocol — walk-forward (rolling-origin)
For a series of length `T` with horizon `h`:
```
for origin o in [t_start, t_start+step, …, T−h]:
    train  = series[: o − gap]          # gap ≥ h enforces no-leakage embargo
    calib  = series[o − gap − c : o − gap]   # conformal calibration window
    truth  = series[o : o + h]
    yhat, interval = model.fit(train).forecast(h)   # calibrate on `calib`
    record(metrics(yhat, interval, truth))
aggregate across origins  (mean ± bootstrap 95% CI)
```
- **Expanding window** is default (train grows); **sliding window** variant tested for non-stationary feeds.
- **Step** chosen so ≥30 origins per series (statistical power for skill CIs).

### 3.2 Train / calibration / test splits
- **Proper-train** (model fit) · **calibration** (conformal residuals / weight fitting) · **test** (scoring) are **temporally ordered and disjoint**. Calibration always precedes test; train always precedes calibration.
- Default ratio per origin: train ≥ 60%, calibration ≈ 20%, test = horizon `h`.

### 3.3 Leakage guards (P0 defect class)
A dedicated test module `backtest/test_leakage.py` enforces:
1. **Embargo/gap** of ≥ `h` between train end and test start — assert no index overlap.
2. **No future statistics:** scalers/normalizers fit on train only. Test injects a future-spike into the *post-train* region and asserts the model output is **bit-identical** to a run without the spike (proves the future never leaks backward).
3. **Target not in features:** feature matrix at origin `o` contains no column derived from `series[≥o]`.
4. **Causal-screen embargo:** Granger/CCM lag windows never cross the origin.
Any violation → test fails with a leakage report (which index leaked).

### 3.4 Baselines (every forecast is scored *relative to* these)
| Baseline | Definition | Why |
|---|---|---|
| **Persistence (naïve)** | `ŷ_{t+h} = y_t` | floor for any model on trending/random-walk series |
| **Random walk + drift** | `ŷ_{t+h} = y_t + h·mean(Δy_train)` | standard financial floor |
| **Climatology** | `ŷ = mean(seasonal window)`; interval from historical residual quantiles | floor for seasonal/mean-reverting series |
| **Seasonal-naïve** | `ŷ_{t+h} = y_{t+h−m}` (period m) | floor for seasonal data |

### 3.5 Metrics & **pass thresholds**
| Metric | Definition | Pass gate (v1.0) |
|---|---|---|
| **MAE** | mean |ŷ − y| | reported; informational |
| **RMSE** | √mean(ŷ − y)² | reported; informational |
| **CRPS** | proper score over predictive dist | **CRPS_model ≤ CRPS_best_baseline** (must not be worse) |
| **Coverage** | hit-rate of nominal-(1−α) PI | **|coverage − (1−α)| ≤ 0.05** (see §4) |
| **Skill score (RMSE)** | `1 − RMSE_model/RMSE_persistence` | **SS ≥ 0.05** on aggregate (≥5% better than persistence) |
| **Skill score (CRPS)** | `1 − CRPS_model/CRPS_climatology` | **SS ≥ 0.0** (no worse than climatology) |
| **PIT uniformity** | KS test of PIT vs U(0,1) | **KS p-value ≥ 0.05** (fail = mis-calibrated) |

**Honesty clause:** for genuinely unpredictable series (e.g. efficient-market crypto at long horizons), the engine is **not required to beat persistence** — but it **must remain calibrated** (coverage gate) and must **declare** low skill in `caveats`. The skill gate is applied per-domain with documented exemptions in §6 traceability, consistent with `14_RISKS_AND_LIMITS.md`.

---

## 4. CALIBRATION VALIDATION

Calibration is the **primary correctness criterion** for uncertainty (principle 0.2.2).

### 4.1 Conformal interval coverage gate
- On a held-out test set, **empirical coverage of every nominal level must be within ±5% absolute** of nominal (the "±X%", X=5%).
  - 90% PI ⇒ empirical ∈ [0.85, 0.95].
  - 50% PI ⇒ empirical ∈ [0.45, 0.55].
- Tested at **multiple levels** {0.5, 0.8, 0.9, 0.95} to verify the *whole* predictive distribution, not one band.
- **Width sanity:** intervals must be informative (finite, and narrower than the climatology interval on average) — a trivially-wide interval that "achieves" coverage **fails** the width-vs-baseline check.

### 4.2 ECE / reliability gate (for probabilistic/binary outputs, e.g. seismic exceedance)
- **ECE ≤ 0.05** (15 equal-width bins) on holdout.
- **MCE (max calibration error) ≤ 0.15**.
- Reliability diagram golden file regenerated and diffed (tolerance on bin accuracies ≤ 0.03).

### 4.3 PIT / sharpness
- PIT histogram passes uniformity (KS p ≥ 0.05).
- Among models meeting coverage, prefer **sharpest** (narrowest mean width) — recorded, not gated, except the width-vs-baseline guard in §4.1.

### 4.4 Calibration test example (assertions)
```
def test_enbpi_coverage_holdout():
    rng = np.random.default_rng(0)
    n = 4000; x = np.linspace(0, 50, n)
    y = np.sin(x) + rng.normal(0, 1.0, n)            # heteroscedastic-free control
    tr, ca, te = split_temporal(y, 0.6, 0.2)          # ordered, disjoint
    model = ConformalForecaster(alpha=0.10).fit(tr, calib=ca)
    lo, hi = model.interval(te.X)
    cov = np.mean((te.y >= lo) & (te.y <= hi))
    assert abs(cov - 0.90) <= 0.05                     # ±5% gate
    assert np.all(hi > lo)                             # valid, positive width
    assert np.mean(hi - lo) < climatology_width(y)     # informative
```

---

## 5. SELF-IMPROVEMENT VALIDATION  (acceptance: "it improves")

**Claim to prove:** over N self-improvement cycles on a **frozen** backtest, the engine's **rolling skill score does not regress and trends non-negative**. This is the empirical acceptance criterion for the "self-improving" non-negotiable in `00_MASTER_INDEX.md` and the loop in `08_SELF_IMPROVEMENT_AND_MLOPS.md`.

### 5.1 Harness (`backtest/test_self_improvement_trend.py`)
1. **Freeze** a deterministic multi-series fixture (synthetic + frozen real slices, seeded) — this never changes across cycles, so improvement is attributable to the *engine*, not the data.
2. Run **N ≥ 20 cycles**. Each cycle: forecast → score vs realized (CRPS/RMSE/coverage) → drift check (PSI/ECE) → re-weight ensemble / retrain trigger → update KGIK edges → next cycle re-forecasts on the *same* held-out windows.
3. Record per-cycle aggregate skill score `SS_i`.

### 5.2 Acceptance criteria
- **Trend:** ordinary-least-squares slope of `SS_i` over cycles `≥ 0` AND the **Mann-Kendall** trend test rejects "decreasing" (p ≥ 0.05 for non-decreasing). i.e. **monotone-non-decreasing in distribution.**
- **No catastrophic regression:** `min_i SS_i ≥ SS_0 − 0.02` (no single cycle drops >2% below the starting skill — guards against destabilizing retrains).
- **Final ≥ initial:** `SS_N ≥ SS_0` (end no worse than start).
- **Calibration preserved:** coverage stays within the §4.1 band at **every** cycle (improvement must not be bought with broken calibration).
- **Determinism:** identical seed ⇒ identical `SS_i` sequence (reproducible improvement).

### 5.3 Example assertions
```
def test_rolling_skill_trend_nonnegative():
    seq = run_self_improvement(cycles=24, seed=2026, fixture="frozen_multiseries")
    ss  = np.array([c.skill_score for c in seq])
    slope = np.polyfit(np.arange(len(ss)), ss, 1)[0]
    assert slope >= 0.0
    assert mann_kendall(ss).trend != "decreasing"
    assert ss.min() >= ss[0] - 0.02
    assert ss[-1] >= ss[0]
    assert all(abs(c.coverage_90 - 0.90) <= 0.05 for c in seq)
```
> **Negative-control:** a deliberately broken re-weighter (random weights) must **fail** this suite — proving the test has teeth (mutation-style guard, see §8.3).

---

## 6. DETERMINISM & OFFLINE EXECUTION (hard rule)

**Every test in this plan runs with NO network, NO API key, seeded RNG, supplied data.** This is the existing, passing convention in `server/tests/test_prediction.py` (lines 1–34): `JARVIS_API_KEY` set to a dummy, `KIMI_API_KEY` popped to force the regex router, data built by `_synthetic_prices(... seed=7)`, and `np.random.default_rng(seed)` everywhere.

### 6.1 Mandatory `conftest.py` enforcement
```python
# server/tests/conftest.py
import os, socket, random, numpy as np, pytest

os.environ["JARVIS_API_KEY"] = "test-key"      # auth works
os.environ.pop("KIMI_API_KEY", None)           # force regex fallback (no LLM)
os.environ["PATTERN_ORACLE_OFFLINE"] = "1"      # feeds read fixtures, not HTTP

@pytest.fixture(autouse=True)
def _seed_all():
    random.seed(2026); np.random.seed(2026)
    yield

@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def _guard(*a, **k):
        raise RuntimeError("network access is forbidden in tests")
    monkeypatch.setattr(socket.socket, "connect", _guard)   # hard socket guard
    yield
```
- The **socket guard** turns any accidental network call into an immediate failure, so "offline" is *enforced*, not merely *intended*.
- LLM is disabled ⇒ assert `used_llm is False` on routed responses (mirrors `test_classify_regex_fallback_no_llm`).
- Foundation-TS model (§2.1.I) uses an **offline stub** backend; remote inference (`PREDICT_GPU_URL`) is never contacted in CI.

### 6.2 Determinism checklist (every PR)
- [ ] RNG seeded (numpy + python `random` + any torch/cupy stub).
- [ ] No `datetime.now()`/`time.time()` in scored paths — inject a clock or use fixture timestamps (`t0 = 1_700_000_000_000`).
- [ ] No reliance on dict/set iteration order for numeric output.
- [ ] Re-run twice ⇒ identical output (a `--count=2` determinism job in CI, §8.1).

---

## 7. TEST DATA, FIXTURES, GENERATORS & GOLDEN FILES

### 7.1 Synthetic-series generators (single source: `fixtures/synth.py`)
| Generator | Signature | Used by |
|---|---|---|
| `gbm(n, p0, mu, sigma, seed)` | seeded GBM price path (generalizes `_synthetic_prices`) | GBM, conformal, ensemble, backtest |
| `logistic_adoption(n, K, r, x0, noise, seed)` | S-curve + noise | growth forecast, foundation-TS |
| `seasonal(n, period, amp, trend, noise, seed)` | trend+seasonal+noise | climatology/seasonal-naïve, PIT |
| `regime_switch(segments, seed)` | piecewise mean/var with known breakpoints | PELT/BOCPD, regime integration |
| `gr_catalog(n, b, Mc, seed)` | Gutenberg-Richter magnitudes (exp tail) | seismic (matches existing test) |
| `granger_pair(n, coupling, seed)` | x→y VAR system + null pair | Granger/CCM |
| `blobs(centers, n, noise_frac, seed)` | labeled Gaussian clusters | HDBSCAN |
| `motif_series(n, motif, n_repeats, discord, seed)` | injected motif+discord | Matrix Profile |
| `linear_gaussian_state(M, H, R, seed)` | ensemble + truth + obs | EnKF |

All generators return both the data **and** ground-truth metadata (true b, true breakpoints, true labels, true K) so unit tests assert *recovery*, not just shape.

### 7.2 Frozen real-data slices (`fixtures/datasets/`)
Small, checked-in, license-clean slices for realism without network:
- `usgs_quakes_2019_slice.json` (seismic) · `concrete.csv` (already in repo, Yeh 1030-row) · `fx_eurusd_2020_slice.json` · `coingecko_btc_2021_slice.json`.
- Each carries a `SOURCE.md` with provenance + license (governance per `12_SECURITY_GOVERNANCE_LEGAL.md`).

### 7.3 Golden files (`fixtures/golden/`)
- **API schemas** (`schemas/*.json`) — canonical JSON Schema per `07`.
- **Forecast goldens** (`forecasts/*.json`) — expected `{point, interval, method}` for fixed seed/inputs; compared with **numeric tolerance** (rtol=1e-6 for deterministic closed-form, 2% for MC paths).
- **Reliability diagrams / skill curves** (`calibration/*.json`) — bin accuracies & SS sequences.
- **Regeneration:** `pytest --update-golden` rewrites goldens; PR diff must be reviewed (golden changes are a reviewable signal, never silent).

---

## 8. CI GATES

### 8.1 Backend (Python / pytest)
| Job | Command | Gate |
|---|---|---|
| Unit+integration+contract | `python3 -m pytest server/tests -q` | all pass |
| Coverage | `pytest --cov=server/services --cov-report=term --cov-fail-under=85` | ≥85% line on §06/§08 modules |
| Determinism | `pytest server/tests -p no:randomly --count=2` (pytest-repeat) | identical pass twice |
| Backtest skill gates | `pytest server/tests/backtest -q` | §3.5 thresholds met |
| Self-improvement | `pytest backtest/test_self_improvement_trend.py` | §5.2 met |
| Network guard audit | grep for raw `requests.`/`httpx.` in test paths | none outside fixtures/adapters |

### 8.2 Frontend (TypeScript / vitest)
| Job | Command | Gate |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc -p ./jsconfig.json`) | 0 errors |
| Lint | `npm run lint` (`eslint . --quiet`) | 0 errors |
| Unit | `npm run test` (`vitest run`) | all pass — `PredictionOracle.jsx` render + zod schema parity vs §07 |
| Build | `npm run build` (`vite build`) | succeeds; bundle emitted |

### 8.3 Mutation / negative-control gate (teeth check)
- A small mutation suite flips key invariants (e.g. break the ensemble re-weighter, widen intervals to ±∞, leak future into features) and asserts the corresponding test **fails**. Run nightly; protects against vacuous tests.

### 8.4 Pipeline order & merge policy
```
lint+typecheck ─┐
                ├─► unit ─► integration ─► contract ─► backtest ─► self-improvement ─► perf(§8.5) ─► (nightly) chaos+mutation
build ──────────┘
```
- **PR merge requires:** lint, typecheck, build, unit, integration, contract, backtest skill gates green. Self-improvement + perf + chaos run on `main`/nightly but **block release tags**.
- No `--no-verify`, no skipped tests merged without an owner-approved `xfail(reason=…)`.

### 8.5 Performance tests (latency / throughput) — NFR gates
| Metric | Target (v1.0) | Method |
|---|---|---|
| `/functions/predict` **p95 latency** (classical path, warm) | ≤ 800 ms | `pytest-benchmark` over 200 reps on fixtures |
| `/functions/predict` p99 | ≤ 1500 ms | same |
| Conformal calibration overhead | ≤ 15% over point forecast | A/B benchmark |
| Backtest throughput | ≥ 30 origins/s on the synth GBM fixture | benchmark |
| Foundation-TS stub adapter | ≤ 200 ms (stub) | benchmark |
- Perf is measured on fixtures (no network) for stability; a **regression budget** of +20% over the rolling baseline fails the job.

---

## 9. CHAOS / FAILURE INJECTION

Validates graceful degradation (NFR resilience). Each scenario asserts **the engine returns a structured, calibrated-or-abstaining answer — never a 500, never a fabricated number.**

| ID | Injected failure | Expected behaviour | Assertion |
|---|---|---|---|
| CHAOS-01 | **Feed down** (History Lake read raises) | fall back to supplied `params` / cached slice; degrade with caveat | HTTP 200; `caveats` cites stale/unavailable data; `data_freshness` flagged |
| CHAOS-02 | **Foundation model unavailable** (`PREDICT_GPU_URL` times out) | fall back to classical GBM/Holt ensemble (§10 fallback) | response still has interval; `method.models_used` excludes foundation model; latency within budget |
| CHAOS-03 | **LLM router down** | regex fallback classifier | `used_llm is False`; routing still correct on canonical questions |
| CHAOS-04 | **Empty / too-short series** | abstain | `point_estimate is None`; explanatory `caveats` (extends `test_insufficient_data_is_structured_not_error`) |
| CHAOS-05 | **Corrupt input** (NaN/Inf, non-monotone timestamps) | sanitize/reject cleanly | structured 4xx or sanitized run with caveat; never NaN in output |
| CHAOS-06 | **Persistence/store write fails** (self-improve path) | forecast still returns; write-back retried/queued | response unaffected; error logged; no data loss assertion via retry queue |
| CHAOS-07 | **Partial ensemble member crash** | drop member, renormalize weights | weights re-sum to 1; result within tolerance of full ensemble |

Chaos scenarios use monkeypatched fault injectors (no real infra needed) so they remain hermetic.

---

## 10. CONCRETE TEST MATRIX  (component × test type × tool × acceptance)

| Component (src) | Unit | Integration | Contract | Backtest | Perf | Chaos | Primary tool | Acceptance gate |
|---|---|---|---|---|---|---|---|---|
| GBM Monte-Carlo (`prediction.py`) | ✅ A | INT-01 | CON-01 | skill | ✅ | — | pytest+numpy | MC moments ±2%; SS≥0.05 vs persistence |
| Conformal/EnbPI (`ai_models.py`) | ✅ B | INT-04 | — | calib | ✅ | — | pytest | coverage \|Δ\|≤0.05 @4 levels |
| HDBSCAN regimes | ✅ C | INT-04 | — | — | — | — | pytest+hdbscan | ARI≥0.90; clusters==truth |
| PELT/BOCPD | ✅ D | INT-04 | — | — | — | — | pytest+ruptures | break ±5 samples; 0 spurious on control |
| EnKF | ✅ E | — | — | — | — | — | pytest+numpy | gain within 5% of analytic; var↓ |
| Granger/CCM | ✅ F | INT-04 | — | — | — | — | pytest+statsmodels | x→y p<0.01; null FPR≤α |
| Matrix Profile | ✅ G | — | — | — | ✅ | — | pytest+stumpy | motif overlap≥90%; discord found |
| Error-weighted ensemble | ✅ H | INT-04 | — | skill | — | CHAOS-07 | pytest | weights monotone; RMSE≤best member |
| Foundation TS adapter | ✅ I | INT-01 | CON-01 | skill | ✅ | CHAOS-02 | pytest (stub) | shapes/quantile-monotone; fallback works |
| Drift PSI/ECE (`ai_models.py`) | ✅ J | INT-06 | — | calib | — | — | pytest | PSI≈0 same dist; ECE<0.02 calibrated |
| Orchestrator/router (`prediction.py::classify`) | — | INT-01,02 | — | — | — | CHAOS-03 | pytest+TestClient | regex route correct; `used_llm=False` |
| History Lake (`05`) | — | INT-03 | — | — | — | CHAOS-01 | pytest | roundtrip; no network (socket guard) |
| Self-improve loop (`08`) | — | INT-06 | CON-04 | ✅ §5 | — | CHAOS-06 | pytest | SS trend slope≥0; coverage held |
| API surface (`07`) | — | INT-01,05 | CON-01..06 | — | ✅ §8.5 | CHAOS-04,05 | pytest+jsonschema | schema valid; never 500; p95≤800ms |
| Frontend `PredictionOracle.jsx` | vitest | — | zod parity | — | — | — | vitest+tsc+eslint | typecheck/lint/build green; renders |

---

## 11. EXAMPLE TEST CASES (expected assertions, copy-ready)

### 11.1 Unit — conformal coverage (EnbPI)
See §4.4 — asserts `abs(cov − 0.90) ≤ 0.05`, positive finite width, informative vs climatology.

### 11.2 Unit — PELT change-point recovery
```python
def test_pelt_recovers_known_breaks():
    y, truth = regime_switch(segments=[(0,300,0.0,1.0),(300,700,5.0,1.0),(700,1000,5.0,3.0)], seed=11)
    cps = pelt(y, penalty="bic")
    assert any(abs(c - 300) <= 5 for c in cps)   # mean break
    assert any(abs(c - 700) <= 5 for c in cps)   # variance break
    ctrl, _ = seasonal(1000, period=0, amp=0, trend=0, noise=1.0, seed=12)  # stationary
    assert len(pelt(ctrl, penalty="bic")) <= 1   # ≤1 false positive
```

### 11.3 Unit — Granger directionality + null control
```python
def test_granger_direction_and_null():
    x, y = granger_pair(n=1000, coupling=0.4, seed=9)     # x → y
    assert granger_pvalue(x, y, maxlag=2) < 0.01          # x Granger-causes y
    assert granger_pvalue(y, x, maxlag=2) > 0.10          # y does not
    fpr = mean(granger_pvalue(*independent_pair(seed=s)) < 0.05 for s in range(100))
    assert fpr <= 0.07                                     # ≈ α, no over-detection
```

### 11.4 Integration — NL→forecast (offline, no LLM)
```python
def test_nl_to_forecast_eth_offline():
    series = gbm(n=120, p0=2.0, mu=0.001, sigma=0.02, seed=7)
    r = client.post("/functions/predict", headers=HEADERS,
        json={"question": "forecast eth price in 48h",
              "params": {"domain":"crypto","target":"eth","series":series}})
    assert r.status_code == 200
    b = r.json()
    assert b["used_llm"] is False
    p = b["prediction"]
    assert p["interval"]["low"] < p["point_estimate"] < p["interval"]["high"]
    assert b["assumptions"] and b["caveats"]
```

### 11.5 Backtest — skill gate vs baselines
```python
def test_walkforward_beats_persistence():
    series = seasonal(800, period=24, amp=10, trend=0.01, noise=1.0, seed=3)
    res = walk_forward(series, h=12, model=oracle_forecaster,
                       baselines=["persistence","climatology"], min_origins=30)
    assert res.coverage_within(0.90, tol=0.05)
    assert res.skill_score("persistence", metric="rmse") >= 0.05
    assert res.crps <= res.baseline_crps("climatology")
    assert res.pit_ks_pvalue >= 0.05
```

### 11.6 Self-improvement — see §5.3.

### 11.7 Chaos — model unavailable fallback
```python
def test_foundation_model_down_falls_back(monkeypatch):
    monkeypatch.setattr(foundation_adapter, "infer", lambda *a, **k: (_ for _ in ()).throw(TimeoutError()))
    series = gbm(120, 2.0, 0.001, 0.02, seed=7)
    res = P.predict("forecast btc 24h", {"domain":"crypto","target":"btc","series":series})
    assert res["prediction"]["interval"]["low"] < res["prediction"]["interval"]["high"]
    assert "geometric_brownian_motion_montecarlo" in res["method"]["models_used"]
    assert "foundation" not in str(res["method"]["models_used"]).lower()
```

---

## 12. TRACEABILITY MATRIX (requirement → component → test)  — SKELETON

IDs reference `01_MISSION_AND_SCOPE.md` (FR-* functional, NFR-* non-functional). This skeleton is completed as `01` finalizes its IDs; the test IDs already exist in this plan. **Every FR/NFR must map to ≥1 test; every test maps to ≥1 requirement (bidirectional coverage).**

| Req ID | Requirement (summary) | Source `01` | Component(s) | Algorithm `06` | API `07` | Test ID(s) | Acceptance gate | Status |
|---|---|---|---|---|---|---|---|---|
| FR-01 | NL question → routed intent | §use-cases | orchestrator | router | `POST /predict` | INT-01, CON-01, CHAOS-03 | route correct, `used_llm=False` | ☐ |
| FR-02 | Forecast with point + interval | §success | GBM, foundation, ensemble | GBM/EnbPI/ensemble | `POST /predict` | A,B,H,I, INT-01 | low<point<high; coverage gate | ☐ |
| FR-03 | Calibrated uncertainty | §non-neg | conformal | EnbPI | — | B, §4 calib backtest | \|cov−nom\|≤0.05; ECE≤0.05 | ☐ |
| FR-04 | Pattern discovery (motif/regime/CP) | §arch | discovery | MP/HDBSCAN/PELT/BOCPD | `GET /patterns` | C,D,G, INT-04 | recovery thresholds | ☐ |
| FR-05 | Causal screen (Granger/CCM) | §gaps#5 | relational | Granger/CCM | — | F | direction + null FPR≤α | ☐ |
| FR-06 | Data assimilation | §arch | EnKF | EnKF | — | E | gain≈analytic; var↓ | ☐ |
| FR-07 | History Lake persistence | §gaps#6 | lake | — | `GET /history` | INT-03, CON-03 | roundtrip; offline | ☐ |
| FR-08 | Self-improvement loop | §non-neg | mlops | drift/skill | `GET /predict/skill` | INT-06, §5, CON-04 | SS slope≥0; coverage held | ☐ |
| FR-09 | Honest abstention | §non-neg | verifier | — | `POST /predict` | INT-05, CHAOS-04 | point=None + caveats; 200 | ☐ |
| FR-10 | Answer carries assumptions/caveats/drivers | §non-neg | verifier | — | `POST /predict` | CON-01, INT-01 | fields present & non-empty | ☐ |
| NFR-01 | Latency p95 ≤ 800 ms | §success | API | — | `POST /predict` | §8.5 perf | p95 met | ☐ |
| NFR-02 | Determinism / reproducibility | §non-neg | all | — | — | §6, determinism CI | identical re-runs | ☐ |
| NFR-03 | Offline / no-secret tests | §non-neg | all | — | — | §6 socket guard | no network in CI | ☐ |
| NFR-04 | Resilience / graceful degradation | §arch | all | — | — | CHAOS-01..07 | no 500; degrade w/ caveat | ☐ |
| NFR-05 | Auth required | `12` | API | — | all secured | CON-05 | 401 on bad/missing token | ☐ |
| NFR-06 | API backward-compat / versioning | `07` | API | — | versioning | CON-06 | no silent breaking change | ☐ |
| NFR-07 | License/provenance of test data | `12` | fixtures | — | — | §7.2 `SOURCE.md` audit | provenance present | ☐ |
| NFR-08 | Code coverage ≥85% on core | this doc | §06/§08 | — | — | §8.1 cov job | gate met | ☐ |

**Status legend:** ☐ pending · ◑ in progress · ☑ passing on `main`. The matrix is regenerated each release and stored alongside the v-log entry per `00_MASTER_INDEX.md §4`.

---

## 13. EXIT CRITERIA (release gate for PATTERN ORACLE v1.0)
A release tag is allowed only when **all** hold:
1. Every FR/NFR in §12 maps to ≥1 **passing** test (no ☐).
2. CI green: lint, typecheck, build, unit, integration, contract, backtest skill gates, calibration gates.
3. Self-improvement suite (§5) passes: rolling SS slope ≥ 0, no >2% regression, calibration held every cycle.
4. Perf gates (§8.5) and chaos scenarios (§9) pass on `main`.
5. Mutation/negative-control suite (§8.3) confirms tests have teeth.
6. Determinism job passes (identical output across two runs, no network).
7. Traceability matrix and golden files reviewed and committed for the release.

---

## 14. EXHAUSTIVE TEST-CASE CATALOGUE (TC-IDs)

> **Convention.** Every test case has a stable ID `TC-<AREA>-<NNN>`. Each is written **given / when / then** with **exact expected values + tolerances** so the test is mechanically derivable. `seed` columns make every case reproducible; tolerances are absolute unless suffixed `rtol` (relative). All cases inherit the offline/seeded harness of §6 (`JARVIS_API_KEY=test-key`, `KIMI_API_KEY` popped, `np.random.default_rng(seed)`), mirroring `server/tests/test_prediction.py`. Areas: `GBM`, `CNF` (conformal), `CLU` (clustering), `CPD` (change-point), `ENKF`, `CAU` (causal), `MP` (matrix profile), `ENS` (ensemble), `FTS` (foundation TS), `DRF` (drift/calib metrics), `SEIS`, `TRAJ`, `GROW`, `API`, `INT`, `SELF`, `CHAOS`.

### 14.1 GBM Monte-Carlo (`server/services/prediction.py::geometric_brownian_motion_montecarlo`)

| TC-ID | Given | When | Then (expected value) | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-GBM-001 | `S0=2.0, mu=0.001/step, sigma=0.02, t=7 steps, N=50000` | run MC | `mean(S_T) == S0·e^{mu·t}` = `2.0·e^{0.007}` = `2.01405` | rtol 0.02 | 7 |
| TC-GBM-002 | same as 001 | run MC | `Var(S_T) == S0²·e^{2mu·t}·(e^{sigma²·t}−1)` = `4·e^{0.014}·(e^{0.0028}−1)` = `0.011376` | rtol 0.05 | 7 |
| TC-GBM-003 | same as 001 | empirical p10 | analytic logn quantile `S0·exp(mu·t−σ√t·1.2816)` = `1.9067` | ±3% | 7 |
| TC-GBM-004 | same as 001 | empirical p50 | `S0·exp((mu−σ²/2)t)` = `2.0128` | ±3% | 7 |
| TC-GBM-005 | same as 001 | empirical p90 | `S0·exp(mu·t+σ√t·1.2816)` = `2.1243` | ±3% | 7 |
| TC-GBM-006 | predict response object | inspect interval | `interval.low < point_estimate < interval.high` | strict | 7 |
| TC-GBM-007 | predict response object | inspect probability | `0.0 ≤ probability ≤ 1.0` AND `0.0 ≤ interval.confidence ≤ 1.0` | strict | 7 |
| TC-GBM-008 | two runs, identical seed=7 | `np.array_equal(paths_a, paths_b)` | `True` | exact | 7 |
| TC-GBM-009 | `sigma=0` (degenerate, deterministic) | run MC | `S_T == S0·e^{mu·t}` for **every** path; `interval.high−interval.low → 0` | rtol 1e-9 | 7 |
| TC-GBM-010 | `N=1` (single path) | run MC | no crash; point estimate finite; interval may be degenerate but `low ≤ point ≤ high` | strict | 7 |
| TC-GBM-011 | response `method.models_used` | inspect | contains `"geometric_brownian_motion_montecarlo"` | exact | 7 |
| TC-GBM-012 | response `assumptions`, `caveats` | inspect | both non-empty lists | strict | 7 |

### 14.2 Conformal / EnbPI (`server/services/ai_models.py`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-CNF-001 | `y=f(x)+N(0,1)`, n=2000, split 60/20/h, `1−α=0.90` | compute empirical coverage on test | `cov == 0.90` | ±0.05 abs | 0 |
| TC-CNF-002 | same | inspect width | `mean(hi−lo) > 0` and finite | strict | 0 |
| TC-CNF-003 | residual σ halved | recompute width | width shrinks `≥10%` vs baseline | ≥0.10 rel | 0 |
| TC-CNF-004 | test ε scaled ×2 (shift) | initial coverage | coverage degrades but EnbPI online-update recovers `|cov−0.90|≤0.07` within 100 steps | ±0.07 abs | 0 |
| TC-CNF-005 | symmetric residuals | compare quantiles | `||q_hi|−|q_lo|| / |q_hi| ≤ 0.05` | ≤0.05 rel | 0 |
| TC-CNF-006 | nominal levels {0.5,0.8,0.9,0.95} | coverage at each | each within ±0.05 of nominal | ±0.05 abs | 0 |
| TC-CNF-007 | nominal 0.5 specifically | coverage | `cov == 0.50` ∈ [0.45,0.55] | ±0.05 abs | 0 |
| TC-CNF-008 | nominal 0.95 specifically | coverage | `cov == 0.95` ∈ [0.90,1.00] | ±0.05 abs | 0 |
| TC-CNF-009 | width vs climatology | compare means | `mean_width_conformal < climatology_width` | strict | 0 |
| TC-CNF-010 | identical seed twice | recompute (lo,hi) | bit-identical arrays | exact | 0 |

### 14.3 HDBSCAN regimes (`hdbscan_regimes`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-CLU-001 | 3 well-separated Gaussian blobs + 5% uniform noise | cluster count (excl. −1) | `== 3` | exact | 42 |
| TC-CLU-002 | same | ARI vs truth (excl. noise) | `≥ 0.90` | ≥0.90 | 42 |
| TC-CLU-003 | same | fraction of injected noise labelled −1 | `≥ 0.80` | ≥0.80 | 42 |
| TC-CLU-004 | seed-shuffled point order | ARI vs first run | `≥ 0.95` (permutation invariance) | ≥0.95 | 42/43 |
| TC-CLU-005 | single blob, no structure | cluster count | `≤ 1`; no spurious split | strict | 42 |
| TC-CLU-006 | all points identical | run | no crash; deterministic single label or all-noise | strict | 42 |

### 14.4 Change-point — PELT & BOCPD (`pelt_changepoint`, `bocpd`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-CPD-001 | mean shift @300, var shift @700, n=1000 | PELT(bic) | a cp within `±5` of 300 | ±5 idx | 11 |
| TC-CPD-002 | same | PELT(bic) | a cp within `±5` of 700 | ±5 idx | 11 |
| TC-CPD-003 | stationary control n=1000 | PELT(bic) | `count ≤ 1` false positive | ≤1 | 12 |
| TC-CPD-004 | penalties {bic, 2·bic, 4·bic} | cp counts | non-increasing in penalty | monotone | 11 |
| TC-CPD-005 | break @300 | BOCPD run-length posterior | mass `>0.8` at true break within 10 steps | >0.8 | 11 |
| TC-CPD-006 | flat constant series | PELT | `count == 0` | exact | 13 |
| TC-CPD-007 | break at index 0 (degenerate) | PELT | no crash; no out-of-range cp index | strict | 11 |

### 14.5 EnKF (`enkf_assimilation`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-ENKF-001 | linear-Gaussian toy, M=200 | posterior vs prior var | `var_post < var_prior` | strict | 5 |
| TC-ENKF-002 | same | analysis mean | between prior mean and obs (convex) | strict | 5 |
| TC-ENKF-003 | same | empirical gain `K̂` | within 5% of `K=PHᵀ(HPHᵀ+R)⁻¹` | rtol 0.05 | 5 |
| TC-ENKF-004 | `R→∞` (1e12) | gain | `K̂ → 0`; posterior ≈ prior | rtol 1e-3 | 5 |
| TC-ENKF-005 | `R→0` (1e-12) | gain | `K̂ → 1`; posterior ≈ obs | rtol 1e-3 | 5 |
| TC-ENKF-006 | M=2 (minimal ensemble) | run | no singular-matrix crash; finite output | strict | 5 |

### 14.6 Causal — Granger / CCM (`granger_causality`, `ccm`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-CAU-001 | `y=0.5y₋₁+0.4x₋₁+ε`, n=1000 | `p(x→y)` | `< 0.01` | <0.01 | 9 |
| TC-CAU-002 | same | `p(y→x)` | `> 0.10` | >0.10 | 9 |
| TC-CAU-003 | coupled logistic map (x drives y) | CCM cross-map ρ vs library length | rises with L; converges higher in true direction | monotone | 9 |
| TC-CAU-004 | 100 independent AR(1) null pairs | FPR at α=0.05 after BH | `≤ 0.07` | ≤0.07 | 0..99 |
| TC-CAU-005 | constant series (zero variance) | Granger | graceful: returns `nan`/abstain, no crash | strict | 9 |

### 14.7 Matrix Profile (`matrix_profile_stumpy`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-MP-001 | random walk + injected repeated motif | top-1 motif index | overlaps injected pattern `≥90%` | ≥0.90 | 7 |
| TC-MP-002 | same + single discord | `argmax(MP)` | within ±window of injected anomaly | ±window | 7 |
| TC-MP-003 | pure random walk, no motif | MP | no degenerate near-zero false motif (MP min not anomalously low) | strict | 7 |
| TC-MP-004 | window > series length | run | structured error / abstain, no crash | strict | 7 |

### 14.8 Error-weighted ensemble (`error_weighted_ensemble`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-ENS-001 | 3 forecasters MAE good<med<bad | weights | `w_good > w_med > w_bad` | strict | 4 |
| TC-ENS-002 | same | weight constraints | `Σw == 1.0` and all `≥0` | rtol 1e-9 | 4 |
| TC-ENS-003 | holdout | ensemble RMSE | `≤ best_member_RMSE` (within tol) | rtol 0.02 | 4 |
| TC-ENS-004 | one perfect member (MAE=0) | its weight | `→ 1.0` | rtol 1e-6 | 4 |
| TC-ENS-005 | all members equal error | weights | uniform `1/k` each | rtol 1e-6 | 4 |
| TC-ENS-006 | member dropped (CHAOS-07) | renormalized weights | `Σw == 1.0` | rtol 1e-9 | 4 |

### 14.9 Foundation TS adapter (`timesfm`/`chronos` wrapper, offline stub)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-FTS-001 | input series len L, horizon h | output shape | `len(forecast) == h` | exact | 7 |
| TC-FTS-002 | same | output values | NaN-free, all finite | strict | 7 |
| TC-FTS-003 | quantile outputs | ordering | `q10 ≤ q50 ≤ q90` elementwise | strict | 7 |
| TC-FTS-004 | `PREDICT_GPU_URL` unset | fallback | classical forecaster used; no network (socket guard) | strict | 7 |
| TC-FTS-005 | stub backend, deterministic | two runs | identical output | exact | 7 |

### 14.10 Drift / calibration metrics (`psi`, `ece` in `ai_models.py`)

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-DRF-001 | identical distributions | PSI | `≈ 0` (`< 0.01`) | <0.01 | 0 |
| TC-DRF-002 | shifted distribution | PSI | `> 0.2` (alert) | >0.2 | 0 |
| TC-DRF-003 | perfectly calibrated probs | ECE (15 bins) | `< 0.02` | <0.02 | 0 |
| TC-DRF-004 | deliberately over-confident set | ECE | `> 0.10` | >0.10 | 0 |
| TC-DRF-005 | perfectly calibrated | MCE | `≤ 0.05` | ≤0.05 | 0 |
| TC-DRF-006 | empty input | PSI/ECE | graceful nan/abstain, no div-by-zero crash | strict | 0 |

### 14.11 Seismic (`prediction.py` seismic route) — grounded in existing `test_seismic_*`

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-SEIS-001 | 800 mags, Mc=2.5, true b=1.0 | b-value estimate | `0.7 < b < 1.4` | range | 3 |
| TC-SEIS-002 | same, M=5 target, 30d | probability | `0.0 ≤ p ≤ 1.0` | strict | 3 |
| TC-SEIS-003 | same | `method.math` | contains `"poisson"` (case-insensitive) | substring | 3 |
| TC-SEIS-004 | Omori `K=200,c=0.05,p=1.1`, 1d since mainshock | aftershock probability | `0.0 ≤ p ≤ 1.0`; `method.name` contains `"Omori"` | strict | — |
| TC-SEIS-005 | <10 magnitudes (too few) | run | abstain or wide caveat; no crash | strict | 3 |
| TC-SEIS-006 | target M below Mc | run | structured caveat (extrapolation) | strict | 3 |

### 14.12 Trajectory (`prediction.py` trajectory route) — grounded in existing `test_trajectory_*`

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-TRAJ-001 | lat0=0,lng0=0,speed=250 m/s,heading=90°,1h | result lat | `abs(lat) < 0.5` | <0.5 deg | — |
| TC-TRAJ-002 | same | result lng | `7.0 < lng < 9.5` (≈8.09°) | range | — |
| TC-TRAJ-003 | semi-major axis 6678 km | orbital period | `80 < T < 100` min (≈90 LEO) | range | — |
| TC-TRAJ-004 | heading=0° (north), 1h | result | lng ≈ unchanged, lat increases | strict | — |
| TC-TRAJ-005 | missing state vector fields | run | structured caveat, no crash | strict | — |

### 14.13 Growth (`prediction.py` growth route) — grounded in existing `test_growth_forecast_with_ci`

| TC-ID | Given | When | Then | Tolerance | Seed |
|---|---|---|---|---|---|
| TC-GROW-001 | logistic adoption, horizon_steps=5 | forecast length | `== 5` | exact | 1 |
| TC-GROW-002 | same | each forecast point | `low ≤ v ≤ high` | strict | 1 |
| TC-GROW-003 | same | `interval.confidence` | `== 0.95` | exact | 1 |
| TC-GROW-004 | same | `prediction` band | `low ≤ point_estimate ≤ high` | strict | 1 |
| TC-GROW-005 | flat/no-growth series | forecast | finite, near-constant, valid band | strict | 1 |

### 14.14 API endpoints (`07_API_CONTRACTS.md`) — given/when/then per endpoint

| TC-ID | Endpoint | Given | When | Then | Status code |
|---|---|---|---|---|---|
| TC-API-001 | `POST /functions/predict` | valid crypto body + series | POST with bearer | body matches `PredictResponse`; `low<point<high` | 200 |
| TC-API-002 | `POST /functions/predict` | malformed body (missing question) | POST | `ErrorEnvelope{code,message,hint}`; never 500 | 422/400 |
| TC-API-003 | `POST /functions/predict` | unanswerable ("moon made of cheese") | POST | `point_estimate is None`, non-empty caveats | 200 |
| TC-API-004 | `POST /functions/predict` | no auth header | POST | 401 unauthorized | 401 |
| TC-API-005 | `POST /functions/predict` | bad bearer token | POST | 401 | 401 |
| TC-API-006 | `POST /predict/backtest` | `{series,horizon,folds,baselines[]}` | POST | per-fold + aggregate `{mae,rmse,crps,coverage,skill_score}` | 200 |
| TC-API-007 | `GET /predict/skill` | history present | GET | rolling SS timeseries + slope + cycle count | 200 |
| TC-API-008 | `POST /functions/predict` | unknown `api_version` | POST | 400 + supported-versions list | 400 |
| TC-API-009 | `POST /functions/predict` | old client ignores new optional field | POST | backward compatible, 200 | 200 |
| TC-API-010 | `POST /functions/predict` | NaN/Inf in series | POST | sanitized run w/ caveat OR structured 4xx; never NaN out | 200/400 |

### 14.15 Cross-reference: existing passing tests → TC-IDs

These already pass today in `server/tests/test_prediction.py` and **anchor** the catalogue (no new code needed to verify them):

| Existing test fn | Anchors TC-IDs |
|---|---|
| `test_crypto_prediction_offline` | TC-GBM-006/007/011/012, TC-API-001 |
| `test_crypto_via_endpoint_offline` | TC-API-001 |
| `test_seismic_probability_offline` | TC-SEIS-001/002/003 |
| `test_seismic_omori_aftershock` | TC-SEIS-004 |
| `test_trajectory_great_circle` | TC-TRAJ-001/002 |
| `test_trajectory_orbital_reuse` | TC-TRAJ-003 |
| `test_growth_forecast_with_ci` | TC-GROW-001/002/003/004 |
| `test_insufficient_data_is_structured_not_error` | TC-API-003, CHAOS-04 |
| `test_classify_regex_fallback_no_llm` | INT-01 routing, CHAOS-03 |

---

## 15. FULL TRACEABILITY MATRIX (FR/NFR → component → TC-ID)

> Expands §12's skeleton into a **bidirectional** matrix at TC-granularity. Every FR/NFR maps to ≥1 TC-ID; every TC-ID maps to ≥1 requirement. The reverse index (§15.2) guarantees no orphan tests.

### 15.1 Forward: requirement → tests

| Req ID | Requirement | Component | Algorithm `06` | API `07` | TC-IDs | Acceptance gate | Status |
|---|---|---|---|---|---|---|---|
| FR-01 | NL → routed intent | orchestrator | router | `POST /predict` | INT-01, TC-API-001, CHAOS-03 | route correct; `used_llm=False` | ◑ |
| FR-02 | Forecast point + interval | GBM/foundation/ensemble | GBM/EnbPI/ensemble | `POST /predict` | TC-GBM-001..012, TC-ENS-001..006, TC-FTS-001..005, INT-01 | `low<point<high`; coverage gate | ◑ |
| FR-03 | Calibrated uncertainty | conformal | EnbPI | — | TC-CNF-001..010, §4 | `|cov−nom|≤0.05`; ECE≤0.05 | ☐ |
| FR-04 | Pattern discovery | discovery | MP/HDBSCAN/PELT/BOCPD | `GET /patterns` | TC-CLU-001..006, TC-CPD-001..007, TC-MP-001..004, INT-04 | recovery thresholds | ☐ |
| FR-05 | Causal screen | relational | Granger/CCM | — | TC-CAU-001..005 | direction + null FPR≤α | ☐ |
| FR-06 | Data assimilation | EnKF | EnKF | — | TC-ENKF-001..006 | gain≈analytic; var↓ | ☐ |
| FR-07 | History Lake persistence | lake | — | `GET /history` | INT-03, TC-API-006 | roundtrip; offline | ☐ |
| FR-08 | Self-improvement loop | mlops | drift/skill | `GET /predict/skill` | INT-06, SELF-001..006, TC-API-007 | SS slope≥0; coverage held | ☐ |
| FR-09 | Honest abstention | verifier | — | `POST /predict` | TC-API-003, INT-05, CHAOS-04 | point=None + caveats; 200 | ☑ |
| FR-10 | Assumptions/caveats/drivers carried | verifier | — | `POST /predict` | TC-GBM-012, TC-API-001, INT-01 | fields present & non-empty | ☑ |
| FR-11 | Seismic G-R / Omori | seismic | G-R/Poisson/Omori | `POST /predict` | TC-SEIS-001..006 | b∈(0.7,1.4); 0≤p≤1 | ☑ |
| FR-12 | Trajectory great-circle/orbital | trajectory | great-circle/Kepler | `POST /predict` | TC-TRAJ-001..005 | lng≈8.09°; T≈90min | ☑ |
| FR-13 | Growth/logistic forecast | growth | logistic+CI | `POST /predict` | TC-GROW-001..005 | band valid; conf=0.95 | ☑ |
| FR-14 | Drift detection | mlops | PSI/ECE | `GET /predict/skill` | TC-DRF-001..006, INT-06 | PSI≈0 same; >0.2 shift | ☐ |
| NFR-01 | Latency p95 ≤ 800 ms | API | — | `POST /predict` | PERF-001..006 (§17) | p95 met | ☐ |
| NFR-02 | Determinism | all | — | — | TC-GBM-008, TC-CNF-010, TC-FTS-005, §6 | identical re-runs | ◑ |
| NFR-03 | Offline / no-secret | all | — | — | §6 socket guard, TC-FTS-004 | no network | ☑ |
| NFR-04 | Resilience / graceful degradation | all | — | — | CHAOS-01..09 | no 500; degrade w/ caveat | ◑ |
| NFR-05 | Auth required | API | — | secured | TC-API-004/005 | 401 on bad/missing | ☑ |
| NFR-06 | Backward-compat / versioning | API | — | versioning | TC-API-008/009 | no silent break | ☐ |
| NFR-07 | License/provenance of data | fixtures | — | — | §7.2 + §20 audit | provenance present | ☐ |
| NFR-08 | Coverage ≥85% core | §06/§08 | — | — | §8.1 cov job | gate met | ☐ |
| NFR-09 | Input validation / sanitization | API | — | `POST /predict` | TC-API-010, CHAOS-05, §16.3 fuzz | never NaN out | ☐ |
| NFR-10 | Throughput / load | API | — | `POST /predict` | LOAD-001..004 (§17) | RPS + p99 targets | ☐ |

### 15.2 Reverse: test → requirement (orphan guard)

| TC-ID range / suite | Maps to Req | Orphan? |
|---|---|---|
| TC-GBM-* | FR-02, NFR-02 | no |
| TC-CNF-* | FR-03, NFR-02 | no |
| TC-CLU-* | FR-04 | no |
| TC-CPD-* | FR-04 | no |
| TC-ENKF-* | FR-06 | no |
| TC-CAU-* | FR-05 | no |
| TC-MP-* | FR-04 | no |
| TC-ENS-* | FR-02, NFR-04 (CHAOS-07) | no |
| TC-FTS-* | FR-02, NFR-02/03 | no |
| TC-DRF-* | FR-14 | no |
| TC-SEIS-* | FR-11 | no |
| TC-TRAJ-* | FR-12 | no |
| TC-GROW-* | FR-13 | no |
| TC-API-* | FR-01/02/07/08/09/10, NFR-05/06/09 | no |
| INT-01..07 | FR-01/02/04/07/08/09 | no |
| SELF-001..006 | FR-08 | no |
| CHAOS-01..09 | NFR-04/09 | no |
| PERF/LOAD-* | NFR-01/10 | no |
| PROP-* (§16) | FR-02/03/05/06, NFR-02 | no |

**CI enforcement:** a `traceability_audit.py` test parses this matrix and **fails** if any FR/NFR has zero TC-IDs OR any declared TC-ID is absent from the test suite (bidirectional completeness gate, run in §22 stage `traceability`).

---

## 16. PROPERTY-BASED & FUZZING SPECIFICATIONS

### 16.1 Property-based tests (Hypothesis, Python)

Property tests assert **invariants that must hold for all valid inputs**, not single examples. Tool: `hypothesis` with `@settings(deadline=None, max_examples=200, derandomize=True)` so runs are deterministic in CI (§6).

| PROP-ID | Strategy (input domain) | Invariant (property) | Maps to |
|---|---|---|---|
| PROP-001 | `floats(0.01, 1e6)` S0, `floats(-0.1,0.1)` mu, `floats(1e-4,1.0)` sigma, `ints(1,365)` h | GBM: `interval.low < point_estimate < interval.high` always | FR-02 |
| PROP-002 | same | GBM output `point_estimate` finite, `>0` (price never negative) | FR-02, NFR-09 |
| PROP-003 | any monotone-increasing residual scale | conformal interval width is **non-decreasing** in residual scale | FR-03 |
| PROP-004 | nominal α ∈ `floats(0.01,0.5)` | coverage is **monotone non-decreasing** as `1−α` increases | FR-03 |
| PROP-005 | ensemble of k members, random MAEs | weights sum to 1, all ≥0, monotone in inverse error | FR-02 |
| PROP-006 | any permutation of input series order (for order-invariant ops) | clustering ARI invariant to permutation | FR-04 |
| PROP-007 | EnKF with random PD covariances | posterior variance `≤` prior variance | FR-06 |
| PROP-008 | quantile levels q1<q2 | foundation-TS `forecast(q1) ≤ forecast(q2)` (no crossing) | FR-02 |
| PROP-009 | any seed | identical seed ⇒ identical output (determinism) | NFR-02 |
| PROP-010 | shifted vs identical distributions | `PSI(p,p)==0 ≤ PSI(p,q_shift)` | FR-14 |
| PROP-011 | any valid series, any horizon | predict() **never raises**; returns dict with required keys | FR-09, NFR-04 |
| PROP-012 | Granger on x⊥y independent strategies | p-value distribution stochastically ≥ that of coupled pair | FR-05 |

**Shrinking:** on failure, Hypothesis shrinks to the minimal counterexample; the seed and minimal input are printed and **checked into** `fixtures/golden/hypothesis_examples/` as a regression case (so the once-failing case becomes a permanent example-based test).

### 16.2 Fuzzing inputs (structured + unstructured)

Fuzz the `POST /functions/predict` boundary and the `predict()` core. Tool: `atheris` (libFuzzer for Python) for the core; a schema-aware request fuzzer for the API.

| FUZZ-ID | Target | Input class | Expected (no-crash / graceful) |
|---|---|---|---|
| FUZZ-001 | `predict()` | random JSON blobs (arbitrary keys/types) | returns structured dict or raises a *handled* error; never uncaught traceback |
| FUZZ-002 | series array | `[]`, `[NaN]`, `[Inf]`, `[-Inf]`, mixed types | sanitized or structured caveat; never NaN/Inf in output |
| FUZZ-003 | series timestamps | non-monotone, duplicate, negative, huge (`1e18`) | sorted/deduped or rejected with hint; no overflow |
| FUZZ-004 | numeric params | `sigma<0`, `horizon=0`, `horizon=1e9`, `mu=NaN` | clamped to valid domain or 4xx; documented bounds |
| FUZZ-005 | `question` string | empty, 1 MB string, unicode, control chars, SQL/NoSQL/`{{}}` injection | safe parse; no injection; bounded latency |
| FUZZ-006 | API body | truncated JSON, deeply nested (1000-level), huge arrays (1e6 elems) | 400/413 with `ErrorEnvelope`; memory bounded; no 500 |
| FUZZ-007 | encoding | invalid UTF-8, BOM, null bytes | rejected cleanly; no decode crash |
| FUZZ-008 | `domain` field | unknown domain, empty, integer | falls to abstain/`insufficient_data`; never KeyError |

**Fuzzing corpus & gate:** seed corpus stored in `fixtures/fuzz_corpus/`; nightly fuzz job runs `≥ 5 min/target` (§22). Any crash, hang (>2 s), or NaN/Inf-in-output is a **P0** and is auto-minimized and filed. A discovered crasher is added as a deterministic regression TC.

### 16.3 Sanitization contract (asserted by FUZZ + TC-API-010, CHAOS-05)

- Input series passed through `sanitize_series()`: drop NaN/Inf, sort by `t`, dedupe timestamps (keep last), require `≥ MIN_POINTS` else abstain.
- Output guard: a final `assert_finite(response)` strips/flags any non-finite numeric before serialization (output NaN is a P0 defect).

---

## 17. PERFORMANCE / LOAD TEST PLAN

### 17.1 Single-request latency (micro-benchmark, `pytest-benchmark`, on fixtures, no network)

| PERF-ID | Path | Metric | Target (v1.0) | Method | Maps to |
|---|---|---|---|---|---|
| PERF-001 | `/functions/predict` classical, warm | p50 | ≤ 350 ms | 200 reps | NFR-01 |
| PERF-002 | same | p95 | ≤ 800 ms | 200 reps | NFR-01 |
| PERF-003 | same | p99 | ≤ 1500 ms | 200 reps | NFR-01 |
| PERF-004 | conformal calibration overhead | Δ vs point forecast | ≤ +15% | A/B benchmark | NFR-01 |
| PERF-005 | backtest throughput (synth GBM) | origins/s | ≥ 30 | benchmark | NFR-10 |
| PERF-006 | foundation-TS stub adapter | latency | ≤ 200 ms | benchmark | NFR-01 |
| PERF-007 | cold-start (first request, lazy imports) | latency | ≤ 3000 ms | single run | NFR-01 |

### 17.2 Load / concurrency (`locust` or `k6`, against a local server with fixtures)

| LOAD-ID | Scenario | Load profile | p50 / p95 / p99 | Throughput target | Error budget |
|---|---|---|---|---|---|
| LOAD-001 | Steady classical predict | ramp to **50 RPS**, hold 5 min | 300 / 800 / 1500 ms | ≥ 48 RPS sustained | < 0.1% 5xx |
| LOAD-002 | Burst | spike 5→**200 RPS** in 10 s, hold 60 s | p95 ≤ 1500 ms during burst | recover p95≤800 ms within 30 s of burst end | < 0.5% 5xx |
| LOAD-003 | Mixed domains (crypto/seismic/trajectory/growth 40/20/20/20) | 30 RPS, 10 min | 350 / 900 / 1600 ms | ≥ 29 RPS | < 0.1% 5xx |
| LOAD-004 | Backtest endpoint (heavy) | 5 RPS, 5 min | 1500 / 4000 / 6000 ms | ≥ 4.8 RPS | < 0.1% 5xx |

### 17.3 Soak / endurance

| SOAK-ID | Scenario | Duration | Pass criteria |
|---|---|---|---|
| SOAK-001 | 20 RPS steady mixed load | **8 h** | RSS growth < 5% over the window (no memory leak); p95 drift < 10%; 0 unhandled exceptions; no FD leak |
| SOAK-002 | Self-improvement loop continuous (50 cycles back-to-back) | until 50 cycles | per-cycle wall time non-increasing trend; no unbounded store growth (compaction works) |

### 17.4 Regression budget & measurement hygiene

- Baselines stored in `fixtures/golden/perf_baseline.json`; a run **fails** if any latency metric regresses **> +20%** vs rolling baseline.
- All perf runs: warm-up of 20 reps discarded; report median of 5 trials; pin CPU governor / disable turbo variance where possible; tag the runner spec in the artifact.
- Latency measured server-side (handler enter→exit) AND client-side (round-trip) to separate handler cost from transport.

---

## 18. CHAOS-ENGINEERING SCENARIOS (expanded)

> Extends §9. Each scenario lists the **fault injector**, **blast radius**, **expected graceful behaviour**, and **steady-state hypothesis** (what "healthy" looks like, asserted before and after). All injectors are monkeypatched — hermetic, no real infra. Principle: **structured, calibrated-or-abstaining answer; never a 500; never a fabricated number.**

| ID | Injected fault | Injector | Steady-state hypothesis | Expected graceful behaviour | Assertions |
|---|---|---|---|---|---|
| CHAOS-01 | History Lake read raises | monkeypatch `lake.read → IOError` | predicts from supplied params normally | fall back to `params`/cached slice; degrade with caveat | 200; `caveats` cite stale/unavailable; `data_freshness` flagged |
| CHAOS-02 | Foundation model timeout | `foundation.infer → TimeoutError` | foundation contributes when up | fall back to classical GBM/Holt ensemble | interval present; `models_used` excludes foundation; latency ≤ budget |
| CHAOS-03 | LLM router down | `KIMI_API_KEY` popped (already default) | LLM routes when key present | regex fallback classifier | `used_llm is False`; routing correct on canonical Qs |
| CHAOS-04 | Empty / too-short series | pass `series=[]` | normal forecast on adequate data | abstain | `point_estimate is None`; explanatory caveats; 200 |
| CHAOS-05 | Corrupt input (NaN/Inf, non-monotone ts) | inject `[NaN, Inf]`, shuffled ts | clean numeric input | sanitize/reject cleanly | structured 4xx OR sanitized + caveat; never NaN out |
| CHAOS-06 | Store write fails (self-improve) | `store.write → DiskFull` | write-back persists outcomes | forecast still returns; write retried/queued | response unaffected; error logged; retry-queue depth asserted |
| CHAOS-07 | Partial ensemble member crash | one member raises | all members contribute | drop member, renormalize | `Σweights==1`; result within tol of full ensemble |
| CHAOS-08 | High latency dependency (slow feed) | inject 5 s sleep in feed read | feed responsive | timeout + fallback within budget; no thread starvation | total latency ≤ budget+timeout; 200; caveat about timeout |
| CHAOS-09 | Concurrent contention / partial failure under load | 100 concurrent requests, 10% inject CHAOS-02 | all succeed | degraded subset still returns valid intervals | 0 × 5xx; ≥90% full path; ≤10% degraded-but-valid |

**Chaos exit gate:** all scenarios pass on `main`/nightly. A scenario that yields a 500, an uncaught exception, a fabricated finite number where abstention is correct, or NaN output is a release blocker (§23).

---

## 19. CALIBRATION VALIDATION PROTOCOL (deep)

> Extends §4 with the **operational protocol**: how PIT histograms, reliability diagrams, and coverage tables are generated, what golden artifacts they produce, and the exact pass thresholds.

### 19.1 PIT histogram protocol
1. On each backtest holdout, compute `PIT_i = F̂_i(y_i)` (predictive CDF evaluated at realized value) for all i.
2. Bin into **20 equal-width bins** over [0,1]; expected count per bin `N/20`.
3. **Tests:**
   - **KS test** vs U(0,1): pass if `p ≥ 0.05`.
   - **χ² uniformity**: pass if `p ≥ 0.05`.
   - **Shape diagnostics** (recorded, not gated): U-shape ⇒ over-confident (intervals too narrow); ∩-shape ⇒ under-confident; slope ⇒ biased.
4. Golden: `fixtures/golden/calibration/pit_<domain>.json` = `{bin_edges, counts, ks_p, chi2_p}`; diffed with bin-count tolerance ±5% of `N/20`.

### 19.2 Reliability diagram protocol (binary/probabilistic outputs, e.g. seismic exceedance)
1. Bin predicted probabilities into **15 equal-width bins**.
2. For each bin compute mean predicted prob `conf_b` and empirical frequency `acc_b`.
3. **Metrics & gates:**
   - **ECE** = `Σ_b (n_b/N)|acc_b − conf_b| ≤ 0.05`.
   - **MCE** = `max_b |acc_b − conf_b| ≤ 0.15`.
   - **Brier score** recorded; **Brier skill score** vs base-rate climatology `≥ 0`.
4. Golden: `fixtures/golden/calibration/reliability_<domain>.json` = `{bin_centers, conf, acc, n, ece, mce, brier}`; bin-accuracy tolerance ≤ 0.03.

### 19.3 Coverage table protocol (interval forecasts)
Produce a coverage table across **multiple nominal levels** and horizons. Pass iff every cell within ±0.05 of nominal.

| Nominal | Empirical (target cell) | Pass band | Mean width | Width-vs-climatology |
|---|---|---|---|---|
| 0.50 | computed | [0.45, 0.55] | recorded | must be `<` climatology |
| 0.80 | computed | [0.75, 0.85] | recorded | `<` climatology |
| 0.90 | computed | [0.85, 0.95] | recorded | `<` climatology |
| 0.95 | computed | [0.90, 1.00] | recorded | `<` climatology |

Per-horizon variant: rows ×{h=1, h=h_max/2, h=h_max}. Golden: `fixtures/golden/calibration/coverage_table_<domain>.json`.

### 19.4 Sharpness (secondary, among calibrated models)
Among models passing coverage, rank by **mean interval width** (sharper = better) and **CRPS**. Recorded in the calibration golden; not gated except the width-vs-baseline guard (§4.1).

### 19.5 Calibration acceptance summary (gate)
A domain passes calibration iff: PIT KS p≥0.05 **and** χ² p≥0.05 **and** every coverage cell within ±0.05 **and** (for probabilistic outputs) ECE≤0.05 & MCE≤0.15 **and** all interval widths informative (< climatology). Failure of any ⇒ calibration gate red (blocks merge per §22).

---

## 20. DATA-LEAKAGE AUDIT CHECKLIST

> Leakage is a **P0 defect class** (principle 0.2.5). This checklist is executed by `backtest/test_leakage.py` AND reviewed manually each release. Every box must be ☑ to tag a release.

### 20.1 Temporal separation
- [ ] **Embargo/gap ≥ h** between train end and test start; assert **no index overlap** between train/calib/test sets.
- [ ] Calibration window strictly precedes test window; train strictly precedes calibration.
- [ ] Walk-forward origins never reuse future data for a past origin.

### 20.2 No future statistics
- [ ] Scalers/normalizers/standardizers fit on **train only**, applied to test (no global fit).
- [ ] Future-spike test: inject a large spike into the post-train region; assert model output is **bit-identical** to a run without the spike (future cannot leak backward).
- [ ] Imputation / interpolation uses only past-and-present values (no forward-fill from future).
- [ ] Rolling features computed causally (window ends at or before `t`, never centered across `t`).

### 20.3 Target leakage
- [ ] Feature matrix at origin `o` contains **no column derived from `series[≥o]`** (including lags, diffs, targets).
- [ ] No target encoding / leakage via aggregate statistics computed over the full series.
- [ ] Label not duplicated (under a renamed column) into features.

### 20.4 Causal-screen embargo
- [ ] Granger/CCM lag windows never cross the evaluation origin.
- [ ] Cross-validation folds for hyperparameter search are **time-series CV** (no random k-fold on temporal data).

### 20.5 Calibration/conformal hygiene
- [ ] Conformal residuals computed on the calibration split only (disjoint from test).
- [ ] EnbPI online update uses only realized past residuals (no peeking ahead).

### 20.6 Pipeline-wide
- [ ] No data normalization/feature selection performed **before** the train/test split (must be inside the fold).
- [ ] Golden fixtures carry the split metadata so the audit is reproducible.
- [ ] Each leakage check failure emits **which index leaked** in the report.

**Audit gate:** `test_leakage.py` runs in the `backtest` CI stage; any unchecked/failing box blocks the backtest gate and therefore the release.

---

## 21. CI PIPELINE DEFINITION (stages, gates, artifacts)

> Grounds the abstract §8 into an explicit pipeline. Backend commands mirror the existing convention (`python3 -m pytest server/tests -q`). Frontend commands mirror the **actual** root `package.json` scripts: `npm run lint` (`eslint . --quiet`), `npm run typecheck` (`tsc -p ./jsconfig.json`), `npm run test` (`vitest run`), `npm run build` (`vite build`).

### 21.1 Pipeline stages (DAG order)

| # | Stage | Command(s) | Gate (must hold) | Artifacts produced | Blocking on PR? |
|---|---|---|---|---|---|
| 1 | `lint` | `npm run lint` | 0 eslint errors | eslint report | yes |
| 1 | `typecheck` | `npm run typecheck` | 0 tsc errors | tsc log | yes |
| 1 | `build` | `npm run build` | bundle emitted | `dist/` bundle, size report | yes |
| 2 | `unit` | `python3 -m pytest server/tests/unit -q` | all pass | junit.xml | yes |
| 2 | `frontend-unit` | `npm run test` | all vitest pass | vitest junit | yes |
| 3 | `integration` | `python3 -m pytest server/tests/integration -q` | all pass | junit.xml | yes |
| 4 | `contract` | `python3 -m pytest server/tests/contract -q` | schema valid; no breaking change | schema-diff report | yes |
| 5 | `coverage` | `pytest --cov=server/services --cov-fail-under=85` | ≥85% line / ≥75% branch on §06/§08 | `coverage.xml`, HTML | yes |
| 6 | `determinism` | `pytest server/tests -p no:randomly --count=2` | identical pass twice | dual-run diff | yes |
| 7 | `backtest` | `python3 -m pytest server/tests/backtest -q` | §3.5 skill + §4 calib + §20 leakage | skill curves, coverage tables, PIT/reliability goldens | yes |
| 8 | `traceability` | `python3 -m pytest server/tests/test_traceability_audit.py` | every FR/NFR↔TC bidirectional (§15) | traceability report | yes |
| 9 | `self-improve` | `pytest server/tests/backtest/test_self_improvement_trend.py` | §5.2 (slope≥0, no >2% regress, calib held) | SS sequence golden | release-only |
| 10 | `perf` | `pytest --benchmark-only server/tests/perf` | §17.1 targets; ≤+20% regress budget | `perf_baseline.json`, flamegraph | release-only |
| 11 | `load` | `k6 run load/*.js` | §17.2 RPS + p50/p95/p99 + error budget | load report (HTML/JSON) | release-only |
| 12 | `soak` | `k6 run --duration 8h load/soak.js` | §17.3 (RSS<5%, p95 drift<10%) | soak report, mem/FD graphs | nightly |
| 13 | `chaos` | `pytest server/tests/chaos -q` | §18 all scenarios graceful | chaos report | nightly + release |
| 14 | `fuzz` | `atheris ... ≥5min/target` + API fuzzer | 0 crashes/hangs/NaN-out (§16.2) | crashers, minimized corpus | nightly |
| 15 | `mutation` | mutation suite (§8.3) | killed mutants ≥ threshold (tests have teeth) | mutation report | nightly |

### 21.2 Pipeline DAG

```
        ┌ lint ┐
        ├ typecheck ┤
        └ build ┘
            │
        unit + frontend-unit
            │
        integration
            │
        contract
            │
        coverage ─ determinism
            │
        backtest (skill + calib + leakage)
            │
        traceability
            │
   ── PR MERGE GATE (stages 1–8 green) ──
            │
  release-only: self-improve ─ perf ─ load
            │
   nightly: soak ─ chaos ─ fuzz ─ mutation
```

### 21.3 Gate policy
- **PR merge requires:** stages 1–8 green. No `--no-verify`; no skipped tests merged without owner-approved `xfail(reason=…)`.
- **Release tag requires:** all PR gates **plus** self-improve, perf, load, and the latest nightly chaos/fuzz/mutation green (§23).
- **Artifact retention:** junit, coverage, goldens, perf/load/soak/chaos/fuzz/mutation reports retained ≥ 90 days and attached to the release.
- **Flake policy:** a test that fails non-deterministically is quarantined (tagged `@flaky`, tracked) and must be fixed within one sprint; flakes do not silently retry in merge gates.

### 21.4 Required environment (hermetic)
`JARVIS_API_KEY=test-key`, `KIMI_API_KEY` unset, `PATTERN_ORACLE_OFFLINE=1`, `PREDICT_GPU_URL` unset, seeds pinned (`PYTHONHASHSEED=0`, `np`/`random` seeded by `conftest.py`), socket guard active (§6.1). No network egress in any merge-gating stage.

---

## 22. RELEASE ACCEPTANCE SIGN-OFF CHECKLIST

> Final human + machine gate before tagging PATTERN ORACLE **v1.0** (or any release). All boxes ☑ required. Sign-off recorded in `VERSION_LOG.md` with names/dates.

### 22.1 Functional completeness
- [ ] Every FR (FR-01..FR-14) maps to ≥1 **passing** TC (§15.1 status all ☑).
- [ ] Every NFR (NFR-01..NFR-10) maps to ≥1 **passing** TC.
- [ ] Traceability audit (stage 8) green; zero orphan tests, zero unmapped requirements (§15.2).

### 22.2 Quality gates
- [ ] CI stages 1–8 green on the release commit.
- [ ] Coverage ≥85% line / ≥75% branch on §06/§08 modules.
- [ ] Determinism job: identical output across two runs, no network.
- [ ] Mutation/negative-control suite confirms tests have teeth (killed-mutant threshold met).

### 22.3 Forecasting correctness
- [ ] Backtest skill gates (§3.5) met (or documented per-domain exemption per honesty clause §3.5).
- [ ] Calibration protocol (§19) passes: PIT KS & χ² p≥0.05; coverage table within ±0.05 all levels; ECE≤0.05, MCE≤0.15 for probabilistic outputs.
- [ ] Self-improvement suite (§5.2): SS slope ≥ 0, no single-cycle regression >2%, calibration held every cycle, `SS_N ≥ SS_0`.

### 22.4 Robustness & resilience
- [ ] All chaos scenarios (CHAOS-01..09) graceful: no 500, no fabricated number, no NaN output.
- [ ] Fuzzing nightly: 0 crashes / hangs / NaN-in-output; new crashers (if any) fixed + regression-cased.
- [ ] Input sanitization contract (§16.3) verified.

### 22.5 Performance & scale
- [ ] Perf gates (§17.1): p50≤350 ms, p95≤800 ms, p99≤1500 ms (classical warm); ≤+20% regression budget.
- [ ] Load gates (§17.2): RPS + p50/p95/p99 + error budget met for LOAD-001..004.
- [ ] Soak (§17.3): 8 h steady — RSS growth <5%, p95 drift <10%, 0 unhandled exceptions, no FD leak.

### 22.6 Data, leakage & governance
- [ ] Data-leakage audit checklist (§20) fully ☑; `test_leakage.py` green.
- [ ] Fixture provenance/licensing present (`SOURCE.md` per dataset, NFR-07).
- [ ] Golden files reviewed and committed; any golden diff explained in the PR.

### 22.7 API & compatibility
- [ ] Contract tests (TC-API-001..010) green; no breaking change without version bump (NFR-06).
- [ ] Auth enforced (401 on missing/bad token).
- [ ] Error taxonomy: every error path returns `ErrorEnvelope`, never a raw 500.

### 22.8 Sign-off
| Role | Name | Verdict (PASS/FAIL) | Date | Notes |
|---|---|---|---|---|
| QA / MLOps lead | | | | |
| Algorithms owner (§06) | | | | |
| API owner (§07) | | | | |
| Security/Governance (§12) | | | | |
| Release manager | | | | |

**Release is tagged only when every box above is ☑ and all five roles record PASS.** The completed checklist + traceability matrix + golden set are committed alongside the v-log entry per `00_MASTER_INDEX.md §4`.

---

## 23. APPENDIX — TC-ID ↔ FILE MAP & QUICK COMMANDS

### 23.1 Where each TC lives
| TC-ID area | Test file | Anchored by existing |
|---|---|---|
| TC-GBM-* | `server/tests/unit/test_gbm_montecarlo.py` | `test_prediction.py::test_crypto_prediction_offline` |
| TC-CNF-* | `unit/test_conformal_enbpi.py` | §4.4 example |
| TC-CLU-* | `unit/test_hdbscan_regimes.py` | — |
| TC-CPD-* | `unit/test_pelt_bocpd.py` | §11.2 example |
| TC-ENKF-* | `unit/test_enkf_update.py` | — |
| TC-CAU-* | `unit/test_granger_ccm.py` | §11.3 example |
| TC-MP-* | `unit/test_matrix_profile.py` | — |
| TC-ENS-* | `unit/test_ensemble_weights.py` | — |
| TC-FTS-* | `unit/test_foundation_ts_adapter.py` | — |
| TC-DRF-* | `unit/test_drift_psi_ece.py` | — |
| TC-SEIS-* | `test_prediction.py` (+`unit`) | `test_seismic_*` |
| TC-TRAJ-* | `test_prediction.py` (+`unit`) | `test_trajectory_*` |
| TC-GROW-* | `test_prediction.py` (+`unit`) | `test_growth_forecast_with_ci` |
| TC-API-* | `contract/test_api_*.py` | `test_routes.py::test_auth_required` |
| INT-* | `integration/test_*.py` | `test_crypto_via_endpoint_offline` |
| SELF-* | `backtest/test_self_improvement_trend.py` | §5.3 example |
| CHAOS-* | `chaos/test_*.py` | §11.7 example |
| PROP-* | `unit/test_properties.py` (Hypothesis) | — |
| FUZZ-* | `fuzz/fuzz_predict.py` (atheris) | — |
| PERF/LOAD/SOAK-* | `perf/`, `load/` (pytest-benchmark / k6) | — |

### 23.2 Quick local commands
```bash
# fast inner loop (offline, deterministic) — mirrors existing convention
python3 -m pytest server/tests/test_prediction.py -q

# full PR-gating set
python3 -m pytest server/tests/{unit,integration,contract} -q
pytest --cov=server/services --cov-fail-under=85
pytest server/tests -p no:randomly --count=2          # determinism

# release-only
pytest server/tests/backtest -q                        # skill+calib+leakage
pytest server/tests/backtest/test_self_improvement_trend.py
pytest --benchmark-only server/tests/perf

# frontend (root package.json)
npm run lint && npm run typecheck && npm run test && npm run build
```
