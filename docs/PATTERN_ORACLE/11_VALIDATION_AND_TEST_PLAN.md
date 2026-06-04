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
