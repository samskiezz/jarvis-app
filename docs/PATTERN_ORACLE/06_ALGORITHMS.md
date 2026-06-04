# 06 — ALGORITHMS (the implementation menu)

**Document class:** Master Engineering Spec · ISO-execution depth · companion to `00_MASTER_INDEX.md`
**Scope:** Every algorithm PATTERN ORACLE uses or will use, specified to be *implementation-ready*: a competent engineer can code each entry from this page alone. For each: **purpose · math/equations · pseudocode · parameters (with defaults) · inputs/outputs · complexity · numerical-stability notes · pipeline integration · existing repo code to reuse · source URL.**

**Conventions**
- Notation: `P_t` = price/level at time `t`; `x_{1:T}` = observed series of length `T`; `h` = forecast horizon (steps); `Z ~ N(0,1)`; `θ` = parameters; `q_α` = empirical α-quantile.
- "Reuse target" cites a concrete file/symbol in this repo (paths absolute). Where nothing pre-exists, the entry says **NEW** and names the closest scaffold.
- Pipeline stages referenced from `00_MASTER_INDEX.md §2`: HISTORY LAKE → PATTERN-DISCOVERY → RELATIONAL LAYER → FORECAST CORE → SELF-IMPROVEMENT → VERIFIER.
- All entries must obey the non-negotiables: grounded (cited), calibrated (interval/probability), self-improving (scored against realized outcomes).

---

## GROUP A — TIME-SERIES FORECAST

These produce a forecast distribution (point + interval, ideally full predictive quantiles) over horizon `h`. They feed the FORECAST CORE and are combined by the Error-Weighted Ensemble (§18), then calibrated by EnbPI (§19), then scored (§20).

---

### A1. GBM Monte-Carlo (Geometric Brownian Motion) — **ALREADY IMPLEMENTED**

**Purpose.** Closed-form-distribution + Monte-Carlo forecaster for strictly-positive series (prices, multiplicative growth). Produces terminal-value percentiles and P(up). This is PATTERN ORACLE's incumbent crypto/price forecaster.

**Math (exact, as implemented).** From log-returns `r_i = ln(P_i / P_{i-1})`:
- per-step drift `μ = mean(r)`, per-step volatility `σ = std(r, ddof=1)`.
- GBM terminal value at horizon `h`:

  **`P_h = P_0 · exp( (μ − ½σ²)·h + σ·Z·√h )`**, `Z ~ N(0,1)`.

  The `−½σ²` term is the Itô correction converting the arithmetic drift of `ln P` (which is `μ−½σ²`) so that `E[P_h] = P_0 e^{μh}`. Equivalently `ln P_h ~ N(ln P_0 + (μ−½σ²)h, σ²h)` — the terminal distribution is exactly lognormal, so Monte-Carlo here is a variance-reduced one-shot draw of `h`-summed increments (no path stepping needed).
- Annualization (for reporting only): `σ_ann = σ/√dt_yr`, `μ_ann = μ/dt_yr`, where `dt_yr` is the median sampling interval in years.
- Holt blend: deterministic level+trend `L_t, b_t` (see A2) gives `holt = max(0, L_T + b_T·h)`; final point `= 0.5·median(GBM) + 0.5·holt`.

**Pseudocode.**
```
p   = positive,finite(values);  assert len(p) >= 3
p0  = p[-1]
r   = diff(log(p))
mu  = mean(r);  sigma = max(std(r, ddof=1), 1e-9)
drift     = (mu - 0.5*sigma^2) * h
diffusion = sigma * sqrt(h)
Z         = rng.standard_normal(n_paths)         # seeded
terminal  = p0 * exp(drift + diffusion * Z)
pct       = percentile(terminal, [5,25,50,75,95])
p_up      = mean(terminal > p0)
point     = 0.5*pct[50] + 0.5*holt_point(p, h)   # Holt = A2
return {point, interval=[pct5,pct95]@0.90, percentiles, p_up}
```

**Parameters (defaults).** `n_paths=10000`; `seed=42`; `alpha=0.3, beta=0.1` (Holt blend); interval confidence `0.90` (P5–P95). Horizon `h` derived from question horizon ÷ inferred sampling interval.

**Inputs / Outputs.** In: `values: list[float]>0` (≥3), optional `timestamps`. Out: `point_estimate, gbm_median, holt_estimate, interval{low,high,confidence}, percentiles{5,25,50,75,95}, probability_up, drivers, math`.

**Complexity.** `O(N + n_paths)` time (N = series length), `O(n_paths)` memory. Sub-millisecond at defaults.

**Numerical stability.** `σ` floored at `1e-9` to avoid degenerate zero-vol; only positive finite prices admitted; Holt floored at 0 (prices non-negative); exact lognormal draw avoids per-step error accumulation.

**Pipeline integration.** FORECAST CORE classical leg; one of the ensemble members (§18). Already wired: `POST /functions/predict` → `PredictionOracle.jsx`. To upgrade: return full quantile grid (not just 5/25/50/75/95) so EnbPI/CRPS can consume it.

**Reuse target.** `/home/user/jarvis-app/server/services/prediction.py` → `gbm_montecarlo_forecast()` (lines 243–325). Already production. Holt within it is the seed for A2.

**Source.** Hull, *Options, Futures, and Other Derivatives* — GBM / lognormal model; https://en.wikipedia.org/wiki/Geometric_Brownian_motion

#### A1.+ DEPTH MILESTONE

**Full derivation.** Start from the SDE `dP_t = μ_a P_t dt + σ P_t dW_t` (`W_t` Wiener, `μ_a` arithmetic drift). Apply Itô's lemma to `f(P)=ln P` with `f'=1/P`, `f''=−1/P²`:
```
d ln P_t = (1/P)dP + ½(−1/P²)(dP)²
         = (μ_a dt + σ dW) − ½(−1/P²)(σ²P² dt)      since (dW)²=dt, (dt)²=0
         = (μ_a − ½σ²) dt + σ dW.
```
So `ln P_t − ln P_0 = (μ_a−½σ²)t + σ W_t`, i.e. `ln P_h ~ N(ln P_0 + (μ_a−½σ²)h, σ²h)`. Taking `E[P_h] = P_0 exp((μ_a−½σ²)h + ½σ²h) = P_0 e^{μ_a h}` recovers the arithmetic mean (verifies the Itô correction). In discrete estimation we set `μ ≡ μ_a = mean(r)` (sample mean of log-returns is an unbiased estimator of the per-step *log* drift `μ_a−½σ²` PLUS ½σ²… **important subtlety**): the sample mean of `r_i=ln(P_i/P_{i−1})` estimates `μ_a−½σ²` directly (it is the mean of the log-increments). The code uses `mu=mean(r)` as the log-drift and then *adds* `−½σ²` again — this is the documented convention in the repo (treats `mu` as the arithmetic drift). The unbiased variance `σ²=Σ(r_i−r̄)²/(n−1)` (ddof=1) is the MLE-corrected estimator; using ddof=0 underestimates volatility by factor `√((n−1)/n)`.

**Runnable-quality pseudocode.**
```python
def gbm_montecarlo_forecast(values, horizon, *, n_paths=10000, seed=42,
                            alpha=0.3, beta=0.1, confidence=0.90):
    import numpy as np
    p = np.asarray([v for v in values if np.isfinite(v) and v > 0], float)
    if p.size < 3:
        raise ValueError("need >=3 positive finite prices")
    p0 = p[-1]
    r  = np.diff(np.log(p))
    mu = float(r.mean())
    sigma = max(float(r.std(ddof=1)), 1e-9)
    h = max(int(horizon), 1)
    drift = (mu - 0.5*sigma*sigma) * h
    diffusion = sigma * np.sqrt(h)
    rng = np.random.default_rng(seed)
    Z = rng.standard_normal(n_paths)
    terminal = p0 * np.exp(drift + diffusion * Z)
    qs = [ (1-confidence)/2*100, 25, 50, 75, (1+confidence)/2*100 ]
    pct = np.percentile(terminal, qs)
    p_up = float((terminal > p0).mean())
    # Holt deterministic anchor (A2)
    L, b = p[0], (p[1]-p[0]) if p.size > 1 else 0.0
    for x in p[1:]:
        L_new = alpha*x + (1-alpha)*(L+b)
        b     = beta*(L_new-L) + (1-beta)*b
        L     = L_new
    holt = max(0.0, L + b*h)
    point = 0.5*pct[2] + 0.5*holt
    return {"point_estimate": point, "gbm_median": pct[2], "holt_estimate": holt,
            "interval": {"low": pct[0], "high": pct[4], "confidence": confidence},
            "percentiles": dict(zip([5,25,50,75,95], pct.tolist())),
            "probability_up": p_up, "mu": mu, "sigma": sigma}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `n_paths` | int | 10000 | 1e3–1e6 | MC sample count; SE of percentile ∝ `1/√n_paths` | ↑ until percentile noise < reporting precision (≈1e4 gives ~1% SE) |
| `seed` | int | 42 | any | Reproducibility | Fix in prod; vary only for SE estimation |
| `alpha` | float | 0.3 | (0,1) | Holt level smoothing | ↑ for fast-moving level; fit by SSE when ≥10 pts |
| `beta` | float | 0.1 | (0,1) | Holt trend smoothing | ↓ for stable trend |
| `confidence` | float | 0.90 | (0,1) | Interval coverage P-low/P-high | Match downstream calibration target |
| `horizon h` | int | derived | ≥1 | Forecast steps; band widens ∝ `√h` | Set from question horizon ÷ sampling interval |

**Worked numeric example.** Inputs `values=[100,101,102,101,103,104]`, `h=1`, `seed=42`, `n_paths=10000`.
- `r = [0.00995, 0.00985, −0.00985, 0.01961, 0.00966]`; `mu = 0.005844`; `σ = 0.01183` (ddof=1).
- `drift = (0.005844 − 0.5·0.0001400)·1 = 0.005774`; `diffusion = 0.01183`.
- Terminal median `≈ p0·exp(0.005774) = 104·1.005791 = 104.60`; P5 `≈ 104·exp(0.005774 − 1.645·0.01183) = 102.62`; P95 `≈ 106.62`.
- Holt: walking the recursion gives `L≈103.2, b≈0.34 → holt≈103.5`; `point = 0.5·104.60 + 0.5·103.5 ≈ 104.05`; `p_up ≈ 0.69`.

**Complexity (derivation).** Cleaning + `diff/log` = `O(N)`. Drawing `Z` and computing `terminal` = `O(n_paths)`. `np.percentile` sorts → `O(n_paths log n_paths)` but for fixed levels uses partition `O(n_paths)`. Holt loop = `O(N)`. Total **time** `O(N + n_paths log n_paths)`, dominated by `n_paths`. **Space** `O(n_paths)` for the terminal array.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Zero/near-constant series | `σ→0`, degenerate point mass | `σ` floored at `1e-9`; report flat band + caveat |
| Non-positive prices | `log` of ≤0 → NaN | filter to `>0 & finite` before `diff` |
| `n<3` | undefined returns/variance | raise; caller falls back to last value |
| Fat tails (crypto) | Gaussian `Z` underestimates extreme quantiles | downstream Lag-Llama (A5) Student-t leg; EnbPI (F19) recalibrates |
| `n_paths` too low | jittery P5/P95 between runs | fix seed; raise `n_paths`; or use closed-form lognormal quantiles (exact, no MC) |

**Unit-test oracle.** With `values=[100]*10` (constant), `r=[0]*9`, `mu=0`, `σ=1e-9` → terminal ≈ `100` for all paths → `median≈100.000`, `interval≈[100,100]`, `p_up≈0` (strictly `>p0` is false for the flat draw). Closed-form check: for `values=[1, e]` is invalid (n<3); for the example above, the lognormal median must equal `p0·exp(drift)=104.6034±0.05` regardless of seed (MC must converge to the analytic median).

**Integration code-points.** Called by `POST /functions/predict` handler → `prediction.gbm_montecarlo_forecast()` (`/home/user/jarvis-app/server/services/prediction.py:243`). Returns the standard forecast dict into the API response consumed by `PredictionOracle.jsx`. In the new pipeline it becomes ensemble member `k="gbm"` whose `percentiles` dict is read by the Error-Weighted Ensemble (F18) `combine()` and whose residuals feed EnbPI (F19). Uses `_infer_dt_years()` (`prediction.py:232`) to convert horizon to steps.

---

### A2. Holt / Holt-Winters Triple Exponential Smoothing

**Purpose.** Deterministic level+trend (Holt) and level+trend+seasonality (Holt-Winters) smoother. Cheap, robust baseline for trended/seasonal series; the per-step Holt is already embedded in A1.

**Math.** Holt (additive trend), smoothing constants `α, β ∈ (0,1)`:
```
L_t = α·x_t + (1−α)·(L_{t−1} + b_{t−1})        # level
b_t = β·(L_t − L_{t−1}) + (1−β)·b_{t−1}         # trend
ŷ_{t+h} = L_t + h·b_t
```
Holt-Winters adds seasonal component `s_t` with period `m`:
- Additive: `L_t = α(x_t − s_{t−m}) + (1−α)(L_{t−1}+b_{t−1})`; `s_t = γ(x_t − L_t) + (1−γ)s_{t−m}`; `ŷ_{t+h} = L_t + h b_t + s_{t−m+((h−1) mod m)+1}`.
- Multiplicative: `L_t = α(x_t / s_{t−m}) + …`; `ŷ_{t+h} = (L_t + h b_t)·s_{…}`.

Prediction interval: `ŷ_{t+h} ± z_{1−α/2}·σ̂·√h` where `σ̂` = residual std (one-step errors); for HW use the state-space (ETS) variance recursion for exact bands.

**Pseudocode (Holt-Winters additive).**
```
init L = mean(x[0:m]); b = (mean(x[m:2m]) - mean(x[0:m]))/m
     s[i] = x[i] - L  for i in 0..m-1
for t in m..T-1:
    L_new = α*(x[t]-s[t-m]) + (1-α)*(L+b)
    b     = β*(L_new-L) + (1-β)*b
    s[t]  = γ*(x[t]-L_new) + (1-γ)*s[t-m]
    L     = L_new
forecast h:  ŷ[T+k] = L + (k+1)*b + s[T-m + ((k) mod m)]
```
Fit `α,β,γ` (and inits) by minimizing SSE of one-step residuals (Nelder–Mead / L-BFGS-B box-bounded to (0,1)).

**Parameters (defaults).** `α=0.3, β=0.1` (Holt, matching A1), `γ=0.1`, season period `m` auto (ACF peak / FFT dominant period) or supplied; trend ∈ {additive, none}; seasonality ∈ {additive, multiplicative, none}. Optimize when ≥ `2m` points.

**Inputs / Outputs.** In: `x_{1:T}`, `m`, `h`. Out: `forecast[h]`, `interval`, fitted `α,β,γ`, components `L,b,s`.

**Complexity.** `O(T)` per evaluation; `O(T·iters)` to fit. Memory `O(T)`.

**Numerical stability.** Multiplicative HW requires `x_t>0` and `|s|` bounded away from 0; guard with additive fallback. Clamp constants to `[1e-4, 1-1e-4]`. Floor non-negative quantities at 0.

**Pipeline integration.** FORECAST CORE classical leg + ensemble member; strong on seasonal History-Lake series (FX intraday, daily crypto). Provides a deterministic anchor that stabilizes the ensemble when Monte-Carlo variance is high.

**Reuse target.** `/home/user/jarvis-app/server/services/prediction.py` lines 288–298 (Holt level/trend loop) — extract to a standalone `holt_winters()`; **NEW** seasonal component to add.

**Source.** Hyndman & Athanasopoulos, *Forecasting: Principles and Practice* ch.8; https://otexts.com/fpp3/holt-winters.html

#### A2.+ DEPTH MILESTONE

**Full derivation.** Simple exponential smoothing solves `ŷ_{t+1}=α x_t+(1−α)ŷ_t`. Unrolling: `ŷ_{t+1}=α Σ_{k≥0}(1−α)^k x_{t−k}` — a geometrically-weighted average (weights sum to 1 since `α Σ(1−α)^k = α/(1−(1−α))=1`). Holt adds a trend state by writing the level/trend as a linear innovations state-space model: `x_t = L_{t−1}+b_{t−1}+ε_t`, with `L_t=L_{t−1}+b_{t−1}+αε_t`, `b_t=b_{t−1}+αβε_t`. Substituting `ε_t=x_t−(L_{t−1}+b_{t−1})` recovers the component recursions in the Math block. The `h`-step forecast is `L_t+h b_t` because under the SSM the conditional expectation of future innovations is 0, so the deterministic skeleton extrapolates linearly. Forecast variance grows: `Var(ŷ_{t+h}) = σ²[1 + Σ_{j=1}^{h−1}(α+jαβ)²]`, which is where the `√h`-like band widening comes from (exact ETS variance, not the heuristic `σ√h`).

**Runnable-quality pseudocode.**
```python
def holt_winters(x, m, horizon, *, alpha=0.3, beta=0.1, gamma=0.1, seasonal="add"):
    import numpy as np
    x = np.asarray(x, float); T = x.size
    if seasonal in ("add", "mul") and T < 2*m:
        seasonal = None
    if seasonal is None:
        L, b = x[0], (x[1]-x[0]) if T > 1 else 0.0
        resid = []
        for t in range(1, T):
            f = L + b; resid.append(x[t]-f)
            L_new = alpha*x[t] + (1-alpha)*(L+b)
            b = beta*(L_new-L) + (1-beta)*b; L = L_new
        fc = np.array([L + (k+1)*b for k in range(horizon)])
    else:
        L = x[:m].mean()
        b = (x[m:2*m].mean() - x[:m].mean())/m
        if seasonal == "add": s = list(x[:m] - L)
        else:                 s = list(x[:m] / L)
        resid = []
        for t in range(m, T):
            si = s[t-m]
            if seasonal == "add":
                f = L + b + si; resid.append(x[t]-f)
                L_new = alpha*(x[t]-si) + (1-alpha)*(L+b)
                s.append(gamma*(x[t]-L_new) + (1-gamma)*si)
            else:
                f = (L + b)*si; resid.append(x[t]-f)
                L_new = alpha*(x[t]/si) + (1-alpha)*(L+b)
                s.append(gamma*(x[t]/L_new) + (1-gamma)*si)
            b = beta*(L_new-L) + (1-beta)*b; L = L_new
        fc = []
        for k in range(horizon):
            si = s[T - m + (k % m)]
            fc.append((L+(k+1)*b)+si if seasonal=="add" else (L+(k+1)*b)*si)
        fc = np.array(fc)
    sd = np.std(resid, ddof=1) if len(resid) > 1 else 0.0
    z = 1.645  # 90%
    lo = fc - z*sd*np.sqrt(np.arange(1, horizon+1))
    hi = fc + z*sd*np.sqrt(np.arange(1, horizon+1))
    return {"forecast": fc.tolist(), "low": lo.tolist(), "high": hi.tolist(),
            "alpha": alpha, "beta": beta, "gamma": gamma, "resid_sd": sd}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `alpha` | float | 0.3 | [1e-4, 1−1e-4] | level reactivity | grid/L-BFGS-B minimize one-step SSE |
| `beta` | float | 0.1 | [1e-4, 1−1e-4] | trend reactivity | ↓ if trend noisy; 0 ⇒ damped/flat trend |
| `gamma` | float | 0.1 | [1e-4, 1−1e-4] | seasonal reactivity | ↑ for evolving seasonality |
| `m` | int | auto | ≥2 | season period | ACF peak or FFT dominant freq |
| `seasonal` | str | add | {add,mul,none} | seasonal form | mul for proportional seasonality (x>0) |
| `horizon` | int | — | ≥1 | steps | — |

**Worked numeric example.** `x=[10,12,14,11,10,13,15,12]`, `m=4`, additive, defaults, `h=4`.
- init `L=mean(10,12,14,11)=11.75`; `b=(mean(10,13,15,12)−11.75)/4=(12.5−11.75)/4=0.1875`; `s=[−1.75,0.25,2.25,−0.75]`.
- After running t=4..7 the level drifts to `L≈12.0`, `b≈0.14`; forecasts add back seasonals → `fc≈[10.5,13.4,15.6,12.6]` (first cycle), band `±1.645·resid_sd·√k`.

**Complexity (derivation).** Single forward pass touches each of `T` observations with `O(1)` state updates → `O(T)` per evaluation. Fitting runs the pass once per optimizer iteration (`I` iters, typically 20–100 for Nelder–Mead over 3 params) → `O(T·I)`. **Space** `O(T)` (residual buffer + seasonal ring of length `m`, so really `O(T+m)`).

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Multiplicative with `x≤0` or `s≈0` | divide-by-zero / blowup | fall back to additive when any `x≤0` |
| `T<2m` | seasonal init impossible | auto-drop to Holt (no seasonality) |
| Over-reactive constants | forecast chases noise | clamp to `[1e-4,1−1e-4]`; regularize toward small values |
| Negative forecasts for non-negative quantity | implausible band | floor at 0 |

**Unit-test oracle.** Pure linear ramp `x=[1,2,3,4,5]`, no seasonality, `alpha=beta=1` → after warmup `L=x_t`, `b=1` exactly, so `forecast(h=3)=[6,7,8]` with `resid_sd=0`. For constant `x=[5]*8`, additive m=4: `b→0`, `s→0`, `forecast=[5,5,5,5]`.

**Integration code-points.** Extract from the Holt loop inside `gbm_montecarlo_forecast()` (`/home/user/jarvis-app/server/services/prediction.py:288–298`) into a standalone `holt_winters()` beside it. Returns `{forecast, low, high}` into the FORECAST CORE classical leg; registered as ensemble member `k="holt"` in F18. `m` is detected via an FFT/ACF helper that reuses `_infer_dt_years()` for unit conversion.

---

### A3. ARIMA / auto-ARIMA

**Purpose.** Linear stochastic model for stationary-after-differencing series; auto-ARIMA selects `(p,d,q)(P,D,Q)_m` by information criterion. Workhorse classical forecaster with principled prediction intervals.

**Math.** ARIMA(p,d,q): with backshift `B`, difference `∇^d = (1−B)^d`,
```
φ(B) ∇^d x_t = θ(B) ε_t,   ε_t ~ N(0,σ²)
φ(B)=1−φ₁B−…−φ_p B^p,   θ(B)=1+θ₁B+…+θ_q B^q
```
Seasonal SARIMA multiplies in `Φ(B^m), Θ(B^m), ∇_m^D`. Fit by conditional/exact MLE (Kalman-filter likelihood of the state-space form). Forecast & variance via the state-space recursions; `h`-step PI `= ŷ_{t+h} ± z·√(Var)`.

**auto-ARIMA pseudocode (Hyndman–Khandakar).**
```
d = ndiffs(x via KPSS); D = nsdiffs(x via OCSB/CH) if seasonal
start with candidates around (2,d,2)(1,D,1)
loop: fit neighbors (p±1,q±1,P±1,Q±1), accept lowest AICc, repeat
      until no improvement     # stepwise, avoids full grid
return best model; refit on full data; forecast(h)
```
AICc `= AIC + 2k(k+1)/(n−k−1)`.

**Parameters (defaults).** `max_p=5, max_q=5, max_P=2, max_Q=2, d=auto (KPSS, α=0.05), D=auto, m` from seasonality detection; `ic='aicc'`; `stepwise=True`; `seasonal=True` if `m>1`. Min data ≥ `max(3m, 30)`.

**Inputs / Outputs.** In: `x_{1:T}`, optional `m`, `h`, optional exog `X` (→ ARIMAX). Out: orders, coefficients, `forecast[h]`, `interval`, AICc, residual diagnostics (Ljung–Box).

**Complexity.** Per fit `O(T·(p+q+P+Q)·iters)` (Kalman filter); stepwise search ≈ tens of fits ≪ full grid. Memory `O(T + state²)`.

**Numerical stability.** Enforce stationarity/invertibility (roots of `φ,θ` outside unit circle) via constrained optimization or Jones reparameterization; standardize series; cap differencing `d≤2, D≤1`; fall back to lower order on non-convergence. Ljung–Box on residuals to catch mis-specification.

**Pipeline integration.** FORECAST CORE classical leg + ensemble member; default for stationary/seasonal History-Lake series where GBM's multiplicative assumption is wrong. ARIMAX ingests exogenous drivers discovered by Granger/CCM (§15/§16).

**Reuse target.** **NEW** — depend on `statsmodels.tsa.arima.model.ARIMA` + `pmdarima.auto_arima` (preferred) or implement Hyndman–Khandakar over statsmodels. Scaffold: place beside `prediction.py` forecasters; reuse `_infer_dt_years` (line 232) for `m` detection.

**Source.** Hyndman & Khandakar (2008), *JSS* 27(3); https://www.jstatsoft.org/article/view/v027i03 · `pmdarima` https://alkaline-ml.com/pmdarima/

#### A3.+ DEPTH MILESTONE

**Full derivation.** An ARMA(p,q) is the stationary solution of `φ(B)x_t=θ(B)ε_t`. Causality requires the roots of `φ(z)=0` to lie outside the unit circle so that `x_t=φ(B)^{−1}θ(B)ε_t=ψ(B)ε_t` converges (the `ψ`-weights are the impulse response). The `h`-step forecast is the conditional mean `x̂_{t+h}=E[x_{t+h}|F_t]`, obtained by setting future `ε=0` and recursing; its error is `Σ_{j=0}^{h−1}ψ_j ε_{t+h−j}` with variance `σ²Σ_{j=0}^{h−1}ψ_j²` — this *closed-form* growing variance gives ARIMA's principled PIs. The likelihood is computed by casting ARIMA in state-space form and running the Kalman filter: the prediction-error decomposition gives `−2 log L = Σ_t [ln(2πF_t) + v_t²/F_t]` where `v_t` is the one-step innovation and `F_t` its variance from the filter. auto-ARIMA's AICc penalizes parameters; the `2k(k+1)/(n−k−1)` term is the small-sample correction that dominates when `n` is small, preventing over-fitting.

**Runnable-quality pseudocode (Hyndman–Khandakar stepwise).**
```python
def auto_arima(x, m=1, *, max_p=5, max_q=5, max_P=2, max_Q=2,
               max_d=2, max_D=1, seasonal=True, ic="aicc"):
    import numpy as np
    from statsmodels.tsa.arima.model import ARIMA
    def kpss_d(y, dmax):
        from statsmodels.tsa.stattools import kpss
        d = 0; z = np.asarray(y, float)
        while d < dmax:
            try: p = kpss(z, regression="c", nlags="auto")[1]
            except Exception: break
            if p > 0.05: break       # stationary
            z = np.diff(z); d += 1
        return d
    d = kpss_d(x, max_d)
    D = 0  # (seasonal differencing via OCSB/CH omitted for brevity; set by nsdiffs)
    def fit(order, sorder):
        try:
            r = ARIMA(x, order=order, seasonal_order=sorder,
                      enforce_stationarity=True, enforce_invertibility=True).fit()
            k = sum(order)+sum(sorder[:3]); n = len(x)
            return r.aic + 2*k*(k+1)/max(n-k-1, 1) if ic=="aicc" else r.aic, r
        except Exception:
            return np.inf, None
    sm = (1, D, 1, m) if (seasonal and m > 1) else (0,0,0,0)
    best_ic, best = fit((2,d,2), sm); best_order, best_s = (2,d,2), sm
    improved = True
    while improved:
        improved = False
        for dp in (-1,0,1):
            for dq in (-1,0,1):
                p, q = best_order[0]+dp, best_order[2]+dq
                if not (0<=p<=max_p and 0<=q<=max_q): continue
                cand_ic, cand = fit((p,d,q), best_s)
                if cand_ic + 1e-6 < best_ic:
                    best_ic, best, best_order = cand_ic, cand, (p,d,q); improved=True
    return best, best_order, best_s, best_ic
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `max_p`/`max_q` | int | 5 | 0–10 | AR/MA search ceiling | ↓ for short series |
| `max_P`/`max_Q` | int | 2 | 0–3 | seasonal AR/MA ceiling | keep small (data hungry) |
| `d` | int | auto (KPSS) | 0–2 | non-seasonal differencing | cap at 2 |
| `D` | int | auto | 0–1 | seasonal differencing | cap at 1 |
| `m` | int | from detection | ≥1 | season period | FFT/ACF |
| `ic` | str | aicc | {aic,aicc,bic} | model selection | aicc for n<40·k |
| `stepwise` | bool | True | — | search strategy | False ⇒ full grid (slow, marginal gain) |

**Worked numeric example.** AR(1) data `x_t=0.6 x_{t−1}+ε_t`, σ=1, n=500. KPSS → `d=0`. Stepwise converges to `(1,0,0)`; estimated `φ̂≈0.59`, `σ̂²≈1.0`. One-step forecast `x̂_{t+1}=0.59 x_t`; two-step `x̂_{t+2}=0.59²x_t=0.348 x_t`; forecast variance `Var(1)=σ̂²=1.0`, `Var(2)=σ̂²(1+φ̂²)=1.348` → 90% PI half-widths `1.645` and `1.910`.

**Complexity (derivation).** Each Kalman-filter likelihood eval is `O(T·s²)` where `s=max(p,q+1)` is the state dimension (one `s×s` covariance update per step); times `I` optimizer iterations per fit → `O(T·s²·I)`. Stepwise visits `≈ tens` of models vs `O(max_p·max_q·max_P·max_Q)` for full grid. **Space** `O(T + s²)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Non-stationary roots | exploding forecasts | `enforce_stationarity=True` (Jones reparam) |
| Over-differencing | inflated variance, MA unit root | cap `d≤2`; KPSS-based selection |
| Optimizer non-convergence | NaN AIC | try/except → `inf`, skip candidate |
| Mis-specification | autocorrelated residuals | Ljung–Box test; raise order |
| Near-cancelling AR/MA roots | unstable coefficients | prefer parsimonious model by AICc |

**Unit-test oracle.** Generate `x_t = ε_t` (white noise, n=1000, seed fixed): auto-ARIMA should select `(0,0,0)` (or a model whose forecast ≈ mean, variance ≈ sample var); the 1-step PI half-width must be `≈1.645·σ̂`. For a deterministic linear trend differenced once → should pick `d=1` with near-constant differenced forecast.

**Integration code-points.** **NEW** module `arima_forecast.py` beside `prediction.py`; entry `auto_arima_forecast(values, timestamps, horizon)` returns the standard forecast dict with `quantiles` derived from the Gaussian `ŷ±z√Var`. Registered as ensemble member `k="arima"` in F18. ARIMAX exogenous regressors are sourced from Granger (E15)/CCM (E16) screened drivers. `m` detection reuses `_infer_dt_years()` (`prediction.py:232`).

---

### A4. Foundation-Model Inference Adapter (TimesFM / Chronos)

**Purpose.** Zero-shot probabilistic forecasting via a pretrained time-series transformer — no per-series training. PATTERN ORACLE's *learned* forecaster, closing gap §1.2(1). We specify the **inference interface and tokenization**, not training.

**Math / tokenization.**
- **TimesFM (patched decoder):** split the context into non-overlapping **patches** of length `P` (e.g. 32). Each patch → linear/MLP embed → residual transformer decoder → output an **output-patch** of length `H_out` (e.g. 128) predicting the next chunk; long horizons by autoregressive patch rollout. Probabilistic via quantile heads (10 quantiles) — output `q̂_α(t+h)` directly.
- **Chronos:** **scale + quantize** values into a fixed vocabulary of tokens (mean-scale normalization then bin into `B` tokens), treat forecasting as next-token language modeling (T5 backbone); sample `S` trajectories → empirical predictive quantiles. **Chronos-Bolt** is the faster patched, direct-multi-step variant.

**Adapter interface (the contract we own).**
```
class FoundationForecaster(Protocol):
    def forecast(context: float[T], horizon: int,
                 quantile_levels: list[float] = [.1,.2,…,.9],
                 freq: str | None = None) -> {
                     "quantiles": dict[level -> float[horizon]],
                     "mean": float[horizon],
                     "model": str, "version": str }
```
Preprocessing the adapter performs: (1) clean (drop NaN/inf), (2) context truncation to model max (e.g. 512/2048), (3) instance normalization (store scale to invert), (4) call local model **or** remote inference (`PREDICT_GPU_URL`, see `10_COMPUTE_AND_GPU.md`), (5) denormalize, (6) emit standard quantile dict.

**Pseudocode.**
```
ctx = normalize(truncate(clean(context), max_ctx))      # save μ_s, σ_s
if local_weights:  out = model.predict(ctx, horizon, quantiles)
else:              out = http_post(PREDICT_GPU_URL, {ctx, horizon, quantiles})
q  = denormalize(out.quantiles, μ_s, σ_s)
return {quantiles:q, mean:q[0.5], model, version}
```

**Parameters (defaults).** `patch_len=32`, `max_context=512` (TimesFM-2.5) / `2048` (Chronos-Bolt large), `quantile_levels=[.1..​.9]`, `num_samples=20` (Chronos sampling), device auto (`gpu_backend`), timeout `30s` remote with fallback to A1/A3.

**Inputs / Outputs.** In: univariate context (multivariate handled per-channel v1), horizon. Out: standard quantile dict + provenance.

**Complexity.** Transformer inference `O(L²·d)` (attention) or `O(L·d)` patched; dominated by model size. GPU strongly preferred; remote-dispatch path exists.

**Numerical stability.** Instance normalization is mandatory (models trained on scaled data); guard against constant series (σ_s=0 → return flat); clip to model's representable range; always have classical fallback when the model/endpoint is unavailable (honesty: report `model:"fallback"`).

**Pipeline integration.** FORECAST CORE **primary learned leg**; highest weight in §18 when its recent error is low. Output quantiles feed EnbPI (§19) and CRPS scoring (§20). This is the §1.3 rank-1 "replicate first."

**Reuse target.** **NEW** model code; **reuse** the remote-dispatch + CuPy/NumPy abstraction `/home/user/jarvis-app/underworld/server/services/gpu_backend.py` and the `_kimi_extract`-style optional-HTTP/defensive pattern in `prediction.py` (lines 65–108) for the remote-inference client and graceful fallback.

**Source.** TimesFM — Das et al. 2024, https://github.com/google-research/timesfm · Chronos — Ansari et al. 2024, https://github.com/amazon-science/chronos-forecasting (both Apache-2.0).

#### A4.+ DEPTH MILESTONE

**Full derivation.** *Patch tokenization (TimesFM).* A context of length `L` is reshaped into `⌈L/P⌉` patches; each patch `x_{(i−1)P+1:iP}` is instance-normalized then linearly projected to a `d`-dim token. A causal decoder attends over tokens; the output MLP maps the final hidden state to `Q` quantile values for the next `H_out` steps. Long horizons roll the model autoregressively, feeding predicted patches back as input. *Quantile head loss (training, for context).* The model is trained with the **pinball (quantile) loss** `ρ_α(u)=u(α−1{u<0})` summed over quantile levels — this is what makes the output quantiles calibrated by construction. *Chronos quantization.* Values are mean-scaled `x̃=x/(1+mean|x|)` then mapped to `B` uniform bins over a clipped range `[−c,c]`; forecasting is categorical next-token prediction; sampling `S` trajectories and taking empirical quantiles recovers a predictive distribution. Instance normalization is the linchpin: the model saw scaled data in pretraining, so the adapter must store `(μ_s,σ_s)` and invert after inference.

**Runnable-quality pseudocode (adapter).**
```python
def foundation_forecast(context, horizon, *, quantile_levels=(.1,.2,.3,.4,.5,.6,.7,.8,.9),
                        max_ctx=512, model=None, endpoint=None, timeout=30):
    import numpy as np, requests
    x = np.asarray([v for v in context if np.isfinite(v)], float)[-max_ctx:]
    if x.size == 0:
        raise ValueError("empty context")
    mu_s, sd_s = float(x.mean()), float(x.std()) or 1.0   # guard constant series
    z = (x - mu_s) / sd_s
    if model is not None:                       # local weights
        out = model.predict(z[None, :], horizon=horizon, quantiles=list(quantile_levels))
        q = np.asarray(out["quantiles"])        # shape [Q, horizon]
    elif endpoint is not None:                   # remote GPU dispatch
        r = requests.post(endpoint, json={"context": z.tolist(), "horizon": horizon,
                          "quantiles": list(quantile_levels)}, timeout=timeout)
        r.raise_for_status(); q = np.asarray(r.json()["quantiles"])
    else:
        raise RuntimeError("no model/endpoint -> caller falls back to A1/A3")
    q = q * sd_s + mu_s                          # denormalize
    qd = {lvl: q[i].tolist() for i, lvl in enumerate(quantile_levels)}
    return {"quantiles": qd, "mean": qd.get(0.5, q[len(q)//2].tolist()),
            "model": getattr(model, "name", "remote"), "version": "v1"}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `patch_len` | int | 32 | 8–64 | tokens per patch (TimesFM) | model-fixed; do not change at inference |
| `max_ctx` | int | 512 | 64–2048 | context truncation | ↑ to model max if signal long-memory |
| `quantile_levels` | tuple | .1..​.9 | (0,1) | output grid | add .05/.95 for tail coverage |
| `num_samples` | int | 20 | 1–100 | Chronos trajectories | ↑ for smoother tail quantiles |
| `timeout` | int (s) | 30 | 5–120 | remote call budget | ↓ with classical fallback ready |

**Worked numeric example.** `context` = 100 points of `sin(t/5)+0.1·noise`, `horizon=12`. After instance-norm (`μ_s≈0, σ_s≈0.72`) the model returns normalized quantiles; e.g. predicted `q0.5` for step 1 = `0.31` → denorm `0.31·0.72+0 = 0.223`; `q0.1=−0.55→−0.40`, `q0.9=1.18→0.85`. Output dict: `{0.1:[-0.40,...], 0.5:[0.223,...], 0.9:[0.85,...], mean=q0.5}`.

**Complexity (derivation).** Full attention over `T_tok=⌈L/P⌉` tokens is `O(T_tok²·d)` per layer × `n_layers`; patched models keep `T_tok` small (e.g. 512/32=16). Autoregressive rollout multiplies by `⌈horizon/H_out⌉` decode steps. **Space** `O(T_tok·d + params)`; dominated by model weights (GPU resident).

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Constant series | `σ_s=0` → div-by-0 | guard `sd_s = std or 1.0`; return flat quantiles |
| Endpoint down/timeout | request exception | catch → caller falls back to A1/A3, set `model:"fallback"` |
| Out-of-range values | quantization clips | mean-scale before quantize; report clip flag |
| Quantile crossing | `q0.1>q0.5` | sort quantiles per step (monotone projection) |

**Unit-test oracle.** Mock model that returns the identity (predicts the normalized last value for all quantiles/steps). For `context=[2,4,6,8,10]` (`μ_s=6,σ_s≈2.83`), normalized last = `(10−6)/2.83=1.414`; denorm = `1.414·2.83+6=10.0`. So every output quantile must equal `10.0±1e-6`, proving the normalize→predict→denormalize round-trip is lossless.

**Integration code-points.** **NEW** `foundation_forecast.py` implementing the `FoundationForecaster` Protocol; reuses the remote-HTTP + defensive-fallback pattern from `_kimi_extract()` (`/home/user/jarvis-app/server/services/prediction.py:65`) and `gpu_backend.py` for local device selection. Registered as the **highest-prior** ensemble member `k="timesfm"`/`k="chronos"` in F18; its `quantiles` feed EnbPI (F19) and CRPS scoring (F20). Endpoint URL from `PREDICT_GPU_URL` (see `10_COMPUTE_AND_GPU.md`).

---

### A5. Lag-Llama Student-t Probabilistic Head

**Purpose.** Decoder-only foundation forecaster whose output head is a **Student-t** distribution — heavy-tailed predictive law, well-matched to crypto/financial tails that GBM's Gaussian underestimates. We specify the head + lag-feature interface.

**Math.** At each step the model emits Student-t parameters `(ν, μ, σ)` (ν>0 dof, μ location, σ>0 scale):
```
p(x) = Γ((ν+1)/2) / (Γ(ν/2)√(νπ)·σ) · (1 + ((x−μ)/σ)²/ν)^(−(ν+1)/2)
```
Sampling: `x = μ + σ·T_ν`, `T_ν ~ StudentT(ν)`. Quantiles via inverse-CDF `μ + σ·t_ν^{-1}(α)`. Features = **lags** at a fixed lag-set (e.g. quarterly/monthly/weekly/daily lags) + date/time covariates; instance-normalized.

**Pseudocode (inference).**
```
feat = build_lag_features(context, lag_set) ⊕ time_covariates
feat = instance_normalize(feat)                  # save scale
for k in 1..horizon:                              # autoregressive
    (ν,μ,σ) = model.head(transformer(feat))
    draws   = μ + σ * student_t(ν, size=S)
    x_next  = median(draws); append; roll features
quantiles = denorm(percentile(sample_paths, levels))
```
Parameter constraints via softplus: `σ=softplus(s)`, `ν=2+softplus(n)` (keep `ν>2` so variance exists).

**Parameters (defaults).** `lag_set`={1,7,14,30,…} (configurable to data freq), `context_length=32–512`, `num_parallel_samples=100`, `device` auto. `ν` lower-bounded at 2.

**Inputs / Outputs.** In: context + freq → lag features. Out: per-step `(ν,μ,σ)` and sampled predictive quantiles (standard dict, same shape as A4).

**Complexity.** Like A4 (transformer) plus `O(horizon·S)` sampling for autoregressive rollout.

**Numerical stability.** Softplus-constrain `σ>0, ν>2`; clamp `ν` upper (e.g. ≤100, else ≈Gaussian) to avoid overflow in `Γ`; instance-normalize; the heavy tail is the *feature* — don't clip extreme quantiles, just report them as wide bands.

**Pipeline integration.** FORECAST CORE learned leg specialized for **heavy-tailed** targets; its wide tails improve EnbPI coverage and CRPS on crypto. Use as the tail-aware complement to TimesFM/Chronos (A4) in the ensemble.

**Reuse target.** **NEW**; reuse the same `FoundationForecaster` adapter contract (A4) and `gpu_backend.py`. The Student-t quantile math can reuse `scipy.stats.t`.

**Source.** Rasul et al. 2023, *Lag-Llama*; https://github.com/time-series-foundation-models/lag-llama · paper https://arxiv.org/abs/2310.08278

#### A5.+ DEPTH MILESTONE

**Full derivation.** The Student-t arises as a Gaussian with an inverse-gamma prior on its variance marginalized out: if `x|τ ~ N(μ, τ)` and `τ ~ Inv-Gamma(ν/2, νσ²/2)`, then `x ~ t_ν(μ, σ)`. This *scale mixture* is exactly why it has heavier tails than the Gaussian — the random variance occasionally inflates, producing extremes. Variance exists only for `ν>2` (`Var=σ²·ν/(ν−2)`); kurtosis for `ν>4`. As `ν→∞` it converges to `N(μ,σ²)`. The model emits `(ν,μ,σ)` per step; the negative log-likelihood (training loss) is the log of the density in the Math block, optimized end-to-end. Quantiles come from the inverse regularized incomplete beta function `t_ν^{-1}(α)`; e.g. for `ν=5`, `t^{-1}(0.95)=2.015` vs Gaussian `1.645` — the tail is `22%` wider, which is the calibration benefit on crypto.

**Runnable-quality pseudocode (inference).**
```python
def lag_llama_forecast(context, horizon, *, lag_set=(1,7,14,30), context_length=256,
                       num_samples=100, model=None, seed=0):
    import numpy as np
    from scipy.stats import t as student_t
    rng = np.random.default_rng(seed)
    hist = list(np.asarray(context, float)[-context_length:])
    mu_s, sd_s = np.mean(hist), (np.std(hist) or 1.0)
    paths = np.zeros((num_samples, horizon))
    for s in range(num_samples):
        h = hist.copy()
        for k in range(horizon):
            feat = [ (h[-l] - mu_s)/sd_s if l <= len(h) else 0.0 for l in lag_set ]
            nu, mu, sigma = model.head(feat)          # softplus-constrained inside
            nu = max(nu, 2.001); sigma = max(sigma, 1e-6)
            draw = mu + sigma * student_t.rvs(nu, random_state=rng)
            x_next = draw*sd_s + mu_s
            paths[s, k] = x_next; h.append(x_next)
    levels = [.1,.25,.5,.75,.9]
    q = {lvl: np.percentile(paths, lvl*100, axis=0).tolist() for lvl in levels}
    return {"quantiles": q, "mean": q[.5], "model": "lag-llama", "version": "v1"}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `lag_set` | tuple | (1,7,14,30) | data-freq | which past lags become features | match seasonality (e.g. 24,168 hourly) |
| `context_length` | int | 256 | 32–512 | history window | ↑ for long memory |
| `num_samples` | int | 100 | 20–1000 | MC paths for quantiles | ↑ smooths tails; cost-linear |
| `nu_min` | float | 2.001 | >2 | tail floor | keep >2 so variance exists |
| `sigma_min` | float | 1e-6 | >0 | scale floor | prevents degenerate point mass |

**Worked numeric example.** Suppose head emits `(ν=5, μ=0.02, σ=0.03)` (normalized) at step 1 with `μ_s=100, σ_s=4`. Median draw = `0.02·4+100=100.08`; `q0.9 = (0.02+0.03·t_5^{-1}(0.9))·4+100 = (0.02+0.03·1.476)·4+100 = 100.257`; Gaussian-equiv `q0.9` would be `100.234` — the Student-t band is ~10% wider in the tail, exactly the heavy-tail correction.

**Complexity (derivation).** Per step: feature build `O(|lag_set|)`, one transformer forward `O(T_ctx²·d)` (or `O(T_ctx·d)` if windowed), sampling `O(num_samples)`. Autoregressive over `horizon` and `num_samples` paths → `O(num_samples·horizon·T_ctx·d)`. **Space** `O(num_samples·horizon + params)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| `ν≤2` | infinite variance, unstable sampling | softplus + floor `ν=2.001` |
| `ν` huge | `Γ(ν/2)` overflow | clamp `ν≤100`, treat as Gaussian |
| `σ` collapses | zero-width bands | softplus + `σ_min` |
| Error accumulation in rollout | drift over long horizon | report widening bands honestly; cap horizon |

**Unit-test oracle.** With a head fixed at `(ν=1e6, μ=0, σ=1)` the Student-t ≈ standard normal; the empirical `q0.5≈0±0.05`, `q0.9≈1.28±0.05` (matching the normal quantile) for `num_samples≥10000`. With `ν=4, σ=1, μ=0`: theoretical `q0.95=2.132` (vs normal 1.645) — empirical must match within MC error.

**Integration code-points.** **NEW** `lag_llama_forecast.py` using the same `FoundationForecaster` contract as A4; `scipy.stats.t` for inverse-CDF; `gpu_backend.py` for device. Registered as ensemble member `k="lag_llama"` in F18, specifically up-weighted when CRPS (F20) shows the Gaussian legs are under-covering the tails. Quantiles feed EnbPI (F19).

---

## GROUP B — TEMPORAL GRAPH

Learn time-aware node/edge representations over the KGIK graph; produce link predictions / extrapolations that the RELATIONAL LAYER promotes into confirmed edges (§1.3 deep tier). All three close gap §1.2(1,4,5).

---

### B6. TGN — Temporal Graph Networks (memory + message + embedding + link decoder)

**Purpose.** Continuous-time dynamic-graph model: maintains a per-node **memory** updated by interaction **messages**, computes time-aware **embeddings** via a GNN, and scores **links** for prediction. Backbone for learned KGIK temporal edges.

**Math / modules.**
1. **Message:** for edge event `(i,j,t,e_{ij})`: `m_i(t) = msg_s(s_i(t⁻), s_j(t⁻), Δt, e_{ij})` (and symmetric `m_j`), with time encoding `Φ(Δt)` (see B7).
2. **Memory update (RNN/GRU):** `s_i(t) = GRU(m̄_i(t), s_i(t⁻))`, `m̄` = aggregated messages since last update (e.g. most-recent or mean).
3. **Embedding (temporal graph attention):** `z_i(t) = Σ_{j∈N_i(t)} α_{ij}·V(s_j, e_{ij}, Φ(t−t_j))` — L layers of attention over temporal neighbors, mixing memory + features + time.
4. **Link decoder:** `p(i,j,t) = σ( MLP([z_i(t) ‖ z_j(t)]) )`.

**Training.** Self-supervised temporal link prediction: positive = observed edge at `t`; negatives = sampled non-edges; **BCE** loss. Critical: update memory with a batch's events *after* computing its loss (avoid leakage); store raw messages to keep `s` differentiable.

**Pseudocode.**
```
for batch of events sorted by time:
    z_src, z_dst, z_neg = embed(memory, neighbors, time_enc)   # uses pre-batch memory
    pos = decoder(z_src,z_dst); neg = decoder(z_src,z_neg)
    loss = BCE(pos,1)+BCE(neg,0); backprop
    msgs = compute_messages(batch); memory = GRU_update(memory, agg(msgs))
```

**Parameters (defaults).** `memory_dim=172`, `embedding_dim=100`, `time_dim=100`, `n_layers=1–2`, `n_neighbors=10` (sampled), `n_heads=2`, `dropout=0.1`, `lr=1e-4`, optimizer Adam, negatives=1:1. Memory updater=GRU; aggregator=last-message.

**Inputs / Outputs.** In: stream of timestamped edges `(u,v,t,feat)`. Out: node embeddings `z(t)`, link probabilities, updated memory; ranked candidate new edges for KGIK.

**Complexity.** Per batch `O(E_b · n_neighbors · n_layers · d)`; memory `O(N·memory_dim + E)`. GPU recommended.

**Numerical stability.** Detach memory across batches but keep raw-message store; clip gradients (e.g. 1.0); normalize/scale `Δt` before `Φ`; cold-start nodes init memory=0. Guard against stale memory with last-update timestamps.

**Pipeline integration.** RELATIONAL LAYER: trains on KGIK interaction history (`PopulationSnapshot`/`Event` streams), proposes new typed edges → confidence-laddered into the knowledge graph; link scores feed SELF-IMPROVEMENT edge-strength updates.

**Reuse target.** **NEW** (PyTorch). Reuse graph substrate `/home/user/jarvis-app/underworld/server/services/knowledge_graph.py` (typed graph, confidence ladder) and `temporal_nodes.py` (`TemporalNode`, causal_chain) for event/edge sourcing; `gpu_backend.py` for device.

**Source.** Rossi et al. 2020, *TGN*; https://arxiv.org/abs/2006.10637 · ref impl https://github.com/twitter-research/tgn

#### B6.+ DEPTH MILESTONE

**Full derivation.** The memory `s_i(t)` is a recurrent summary of node `i`'s interaction history; the GRU update `s_i(t)=GRU(m̄_i(t), s_i(t⁻))` is the standard gated recurrence: reset gate `r=σ(W_r[m̄,s])`, update gate `u=σ(W_u[m̄,s])`, candidate `s̃=tanh(W[m̄, r⊙s])`, `s=(1−u)⊙s+u⊙s̃`. The key correctness theorem for TGN training is the **no-leakage ordering**: embeddings for a batch must be computed from memory state *before* that batch's events are applied, otherwise the model trivially "sees" the answer. The BCE link loss `−[y log p + (1−y) log(1−p)]` with `p=σ(MLP[z_i‖z_j])` is the empirical risk of a Bernoulli edge model; negatives sampled uniformly from non-neighbors make it a noise-contrastive estimator of edge probability. The time encoding `Φ(Δt)` (shared with B7) lets the message MLP modulate by recency.

**Runnable-quality pseudocode.**
```python
def tgn_train_epoch(events, memory, modules, opt, *, n_neighbors=10, n_neg=1):
    import torch
    events = sorted(events, key=lambda e: e.t)
    for batch in chunk(events, bs=200):
        srcs = [e.src for e in batch]; dsts = [e.dst for e in batch]
        ts   = [e.t for e in batch]
        negs = sample_non_edges(srcs, n_neg)
        # 1) embed from PRE-batch memory (no leakage)
        z_src = modules.embed(memory, srcs, ts, n_neighbors)
        z_dst = modules.embed(memory, dsts, ts, n_neighbors)
        z_neg = modules.embed(memory, negs, ts, n_neighbors)
        pos = modules.decoder(z_src, z_dst)         # sigmoid logits
        neg = modules.decoder(z_src, z_neg)
        loss = (bce(pos, ones) + bce(neg, zeros)).mean()
        opt.zero_grad(); loss.backward()
        torch.nn.utils.clip_grad_norm_(modules.parameters(), 1.0); opt.step()
        # 2) AFTER loss: compute messages & update memory
        with torch.no_grad():
            msgs = modules.message(memory, batch)    # uses Φ(Δt), edge feats
            memory.update(srcs+dsts, aggregate(msgs))
            memory.detach()                          # truncate BPTT across batches
    return loss.item()
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `memory_dim` | int | 172 | 64–512 | node state capacity | ↑ for complex dynamics |
| `embedding_dim` | int | 100 | 32–256 | output embed size | match decoder MLP |
| `time_dim` | int | 100 | 32–200 | Φ(Δt) feature size | log-space init freqs |
| `n_layers` | int | 1–2 | 1–3 | attention hops | 2 captures 2-hop context |
| `n_neighbors` | int | 10 | 5–50 | sampled temporal nbrs | ↑ accuracy, ↑ cost |
| `lr` | float | 1e-4 | 1e-5–1e-3 | Adam step | ↓ if unstable |
| `dropout` | float | 0.1 | 0–0.5 | regularization | ↑ on small graphs |

**Worked numeric example.** 3-node toy: events `(A→B,t=1),(B→C,t=2),(A→C,t=3)`. With `memory_dim=2` init 0: after `t=1` A and B memories become nonzero via GRU; at `t=3` predicting `A→C` uses A's memory (carrying the `A→B` interaction) and C's memory (carrying `B→C`). A correctly-trained model yields `p(A→C,t=3) > p(A→random,t=3)` — the chain `A→B→C` raises the A–C link probability above the negative.

**Complexity (derivation).** Per batch of `E_b` events: each event embeds 2 endpoints + `n_neg` negatives, each requiring `n_neighbors^{n_layers}` neighbor aggregations of `d`-dim vectors → `O(E_b·n_neighbors^{n_layers}·n_heads·d)`. Memory update is `O(E_b·d)` (GRU). **Space** `O(N·memory_dim + E)` for memory + event store.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Memory leakage | suspiciously perfect train AUC | embed BEFORE updating memory; assert ordering |
| Exploding gradients (BPTT through memory) | NaN loss | clip_grad_norm 1.0; detach memory per batch |
| Stale memory | poor cold predictions | store last-update timestamp; encode `Δt` since update |
| Cold-start nodes | random embeddings | init memory=0; rely on neighbor features |

**Unit-test oracle.** Deterministic repeating pattern: emit `A→B` every even `t`, `A→C` every odd `t`, for 1000 steps. After training, at a held-out even `t` the model must rank `B` above `C` as the destination (AUC→1.0 on this separable task). A randomly-initialized untrained model gives AUC≈0.5 — the gap verifies learning.

**Integration code-points.** **NEW** PyTorch module `tgn.py`. Sources events from `temporal_nodes.py` (`TemporalNode`, `causal_chain`) and writes ranked candidate edges into `knowledge_graph.py` via its confidence-ladder API (`add_edge(..., confidence=p)`); `gpu_backend.py` selects device. Link scores `p` feed SELF-IMPROVEMENT edge-strength updates (§08). Predicted edges enter KGIK at the lowest confidence tier pending realized-outcome confirmation.

---

### B7. TGAT — Temporal Graph Attention (Bochner time encoding + self-attention)

**Purpose.** Inductive temporal-graph embedding via a **functional time encoding** (from Bochner's theorem) plugged into graph self-attention; no node memory required, generalizes to unseen nodes.

**Math.**
- **Bochner / random-Fourier time encoding** (continuous kernel → feature map): for elapsed time `Δt`,
  `Φ(Δt) = √(1/d)·[ cos(ω₁Δt), sin(ω₁Δt), …, cos(ω_{d/2}Δt), sin(ω_{d/2}Δt) ]`
  with learnable frequencies `{ω_k}`. This is the feature map of a translation-invariant temporal kernel `K(t₁,t₂)=⟨Φ(t₁),Φ(t₂)⟩` guaranteed PSD by Bochner's theorem.
- **Temporal self-attention** over neighbors of node `v₀` at time `t`: form entity-time features `h̃_j = [ h_j ‖ Φ(t−t_j) ]`. Then `Q=h̃_0 W_Q`, `K=[h̃_j]W_K`, `V=[h̃_j]W_V`;
  `z_0(t) = softmax(QKᵀ/√d_k)·V`, stacked over `L` layers and multiple heads, fused with `h_0` via FFN.

**Pseudocode.**
```
def TGAT_layer(v0, t, neighbors):
    feats = [ concat(h_j, Bochner(t - t_j)) for j in sample(neighbors, n_nbr) ]
    q = W_Q · concat(h_v0, Bochner(0))
    z = MultiHeadAttention(q, K=W_K·feats, V=W_V·feats)
    return FFN(concat(z, h_v0))
embed(v0,t) = stack L layers; link prob = σ(MLP([z_u‖z_v]))
```

**Parameters (defaults).** `time_dim=100` (Fourier features), `n_layers=2`, `n_heads=2`, `n_neighbors=20`, `node/edge feat dim` data-driven, `dropout=0.1`, Adam `lr=1e-4`, BCE link-prediction loss with 1:1 negatives.

**Inputs / Outputs.** In: temporal graph (timestamped edges, node/edge features). Out: inductive node embeddings `z(t)`, link probabilities (works for unseen nodes — KGIK growth).

**Complexity.** `O(n_neighbors^L · n_heads · d)` per query node; embarrassingly parallel across nodes; GPU.

**Numerical stability.** Scale attention by `1/√d_k`; initialize `ω_k` log-spaced over expected `Δt` range (avoid all-zero gradients); normalize `Δt` units consistently; dropout on attention weights.

**Pipeline integration.** RELATIONAL LAYER alternative/complement to TGN — preferred when **new nodes appear frequently** (inductive). Same downstream: candidate edges → confidence ladder → KGIK; the Bochner encoder is also reusable as the time-feature module inside TGN (B6).

**Reuse target.** **NEW** (PyTorch). Same substrate reuse as B6 (`knowledge_graph.py`, `temporal_nodes.py`). PageRank/graph utilities in `graph_extras` for neighbor candidate ranking.

**Source.** Xu et al. 2020, *Inductive Representation Learning on Temporal Graphs (TGAT)*; https://arxiv.org/abs/2002.07962 · impl https://github.com/StatsDLMathsRecomSys/Inductive-representation-learning-on-temporal-graphs

#### B7.+ DEPTH MILESTONE

**Full derivation (Bochner).** Bochner's theorem: a continuous translation-invariant kernel `K(t₁,t₂)=ψ(t₁−t₂)` is positive-definite iff it is the Fourier transform of a non-negative measure `p(ω)`: `ψ(Δt)=∫ e^{iωΔt} p(ω) dω = E_{ω~p}[cos(ωΔt)]` (real part, since the kernel is real). Monte-Carlo approximating the expectation with `d/2` sampled/learned frequencies `ω_k` and using `cos(ω(t₁−t₂))=cos(ωt₁)cos(ωt₂)+sin(ωt₁)sin(ωt₂)` gives the explicit feature map `Φ(t)=√(1/d)[cos(ω₁t),sin(ω₁t),...]` such that `⟨Φ(t₁),Φ(t₂)⟩≈ψ(t₁−t₂)`. This is exactly Random Fourier Features specialized to time — it turns "elapsed time" into a vector the attention can dot-product. Because frequencies are *learnable*, the network discovers the relevant temporal scales. Unlike TGN there is **no memory state**, so embeddings depend only on (sampled) neighbors → inductive on unseen nodes.

**Runnable-quality pseudocode.**
```python
class BochnerTime(torch.nn.Module):
    def __init__(self, dim):
        super().__init__()
        # log-spaced init over expected Δt range avoids dead gradients
        self.w = torch.nn.Parameter(1.0/10**(torch.linspace(0,4,dim//2)))
        self.scale = (1.0/(dim))**0.5
    def forward(self, dt):                       # dt: [...]
        a = dt.unsqueeze(-1) * self.w            # [..., dim/2]
        return self.scale * torch.cat([a.cos(), a.sin()], dim=-1)

def tgat_embed(node, t, neighbors, h, phi, attn, ffn, n_layers=2, n_nbr=20):
    z = h[node]
    for _ in range(n_layers):
        nbr = sample(neighbors[node], n_nbr)     # (j, t_j, e_ij)
        feats = torch.stack([torch.cat([h[j], phi(t - t_j)]) for j,t_j,_ in nbr])
        q = torch.cat([z, phi(torch.zeros(()))])
        z = ffn(torch.cat([attn(q, feats, feats), z]))   # MHA(query, K, V) + residual
    return z

def link_prob(u, v, t, *a):   # σ(MLP[z_u ‖ z_v])
    return torch.sigmoid(mlp(torch.cat([tgat_embed(u,t,*a), tgat_embed(v,t,*a)])))
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `time_dim` | int | 100 | 32–200 | Fourier features | log-space init `ω` |
| `n_layers` | int | 2 | 1–3 | attention hops | 2 standard |
| `n_heads` | int | 2 | 1–8 | attention heads | ↑ with dim |
| `n_neighbors` | int | 20 | 5–50 | sampled nbrs/layer | ↑ accuracy, cost `n_nbr^L` |
| `dropout` | float | 0.1 | 0–0.5 | attn/feat dropout | ↑ small graphs |
| `lr` | float | 1e-4 | 1e-5–1e-3 | Adam | — |

**Worked numeric example.** `time_dim=4`, one learnable freq pair `ω=[1.0, 0.01]`. For `Δt=0`: `Φ=√(1/4)[cos0,cos0,sin0,sin0]=0.5[1,1,0,0]`. For `Δt=π`: `Φ=0.5[cos π, cos(0.01π), sin π, sin(0.01π)]=0.5[−1, 0.9995, 0, 0.0314]`. Kernel `⟨Φ(0),Φ(π)⟩=0.25(−1+0.9995)=−0.000125≈0` — distant times are nearly orthogonal at the fast frequency, capturing "recent vs old."

**Complexity (derivation).** Each query node expands `n_neighbors` per layer recursively → `n_neighbors^{n_layers}` leaf computations, each an `O(n_heads·d)` attention term → `O(n_neighbors^{n_layers}·n_heads·d)` per node. Fully parallel across query nodes (no shared mutable memory). **Space** `O(n_neighbors^{n_layers}·d)` per query during forward.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| All-zero time grads | `Φ` flat, time ignored | log-spaced freq init spanning Δt range |
| Inconsistent Δt units | meaningless encoding | normalize all Δt to a fixed unit (e.g. seconds) |
| Attention overflow | NaN softmax | scale by `1/√d_k`; subtract max |
| Neighbor sampling variance | noisy embeddings | average over multiple samples or larger `n_nbr` |

**Unit-test oracle.** Bochner kernel self-consistency: for any frequencies and any `t₁,t₂`, `⟨Φ(t₁),Φ(t₂)⟩` must equal `(1/(d/2))Σ_k cos(ω_k(t₁−t₂))` within `1e-6`. Test `Φ(t)·Φ(t)=1.0±1e-6` for all `t` (unit norm, since `cos²+sin²=1` summed and scaled by `1/d` over `d/2` pairs = `(d/2)/d·2 = 1`). This verifies the encoding is a proper RFF map.

**Integration code-points.** **NEW** `tgat.py`. Same substrate as B6 (`knowledge_graph.py`, `temporal_nodes.py`); preferred over TGN when KGIK gains new entity nodes frequently (inductive). The `BochnerTime` module is reused as the time-feature submodule inside `tgn.py` (B6). Outputs link probabilities → confidence-ladder edges in KGIK; neighbor candidate ranking can reuse PageRank utilities in `graph_extras`.

---

### B8. xERTE — Explainable Temporal-KG Link Extrapolation

**Purpose.** Answer future temporal-KG queries `(s, r, ?, t)` by iteratively expanding a **temporal inference subgraph** around the query entity, propagating attention to candidate objects — extrapolation (future `t`) with an **explanation** (the expanded subgraph). Powers "what will connect to X next" on KGIK.

**Math / mechanism.**
- Temporal relational attention between a node and a temporally-valid neighbor `(e', r', t')` (with `t'<t_query`):
  `α = softmax( (W_q·[h_e ‖ φ(t)]) · (W_k·[h_{e'} ‖ h_{r'} ‖ φ(t')]) )`, using a time encoding `φ` (Bochner-style, cf. B7).
- **Iterative sampling + propagation:** start with query entity; at each of `L` steps, sample temporally-valid outgoing edges, attend, propagate attention scores to newly reached entities; prune to top-K by attention to bound the subgraph.
- **Score** of candidate object = aggregated attention mass arriving at it after `L` steps; trained with a temporal cross-entropy over true objects.

**Pseudocode.**
```
frontier = {query_subject : score 1.0};  subgraph = {}
for step in 1..L:
    new = {}
    for e in frontier:
        for (e, r, e', t') in temporal_edges(e, before=t_query):
            a = attention(e, r, e', t', t_query)
            new[e'] += frontier[e] * a
            subgraph.add(e,r,e',t')
    frontier = top_K(new)              # prune (controls cost)
ranked_objects = sort(frontier by score)
return ranked_objects, subgraph        # subgraph = explanation
```

**Parameters (defaults).** `L=3` inference steps, `top_K≈50–100` per expansion, embedding dim `d≈100`, time-encoding dim `100`, attention heads `1–2`, Adam `lr=2e-4`, batch of queries. Sampling budget caps subgraph size.

**Inputs / Outputs.** In: temporal KG (quadruples `(s,r,o,t)`) + query `(s,r,?,t_future)`. Out: ranked candidate objects with probabilities **and** the explanatory subgraph (auditable — supports the VERIFIER's "drivers/assumptions").

**Complexity.** `O(L · top_K · avg_degree · d)` per query; bounded by pruning. GPU optional.

**Numerical stability.** Prune aggressively (top-K) to prevent subgraph blow-up; normalize attention per expansion; mask future edges (`t'≥t_query`) strictly to avoid leakage; smooth scores to avoid zero-mass dead ends.

**Pipeline integration.** RELATIONAL LAYER **extrapolation/link-prediction** for KGIK (the §1.3 "xERTE-style link prediction"); its explanatory subgraph is surfaced by the VERIFIER as grounded drivers. Complements TGN/TGAT (which embed) by directly answering future-edge queries with provenance.

**Reuse target.** **NEW** (PyTorch). Reuse `knowledge_graph.py` (typed quadruple store, confidence ladder for promoting predicted edges) and `temporal_nodes.causal_chain` for temporal-edge enumeration.

**Source.** Han et al. 2021, *xERTE: Explainable Subgraph Reasoning for Forecasting on Temporal KGs*, ICLR; https://arxiv.org/abs/2012.15537 · impl https://github.com/TemporalKGTeam/xERTE

#### B8.+ DEPTH MILESTONE

**Full derivation.** xERTE frames future-link prediction as **attention-flow** over a temporal subgraph. Define a normalized attention `α(e,r,e',t',t_q)=softmax_e'(score)` over a node's temporally-valid out-edges. Treating attention as a transition probability, the score arriving at a node after `L` steps is the sum over all length-`≤L` temporal paths of the product of edge attentions weighted by the source mass — a truncated personalized-PageRank-like diffusion where edges are gated by recency and relation type. The top-K pruning at each step is a beam search that keeps the diffusion tractable while preserving the highest-mass paths, which double as the **explanation** (the retained subgraph). Training minimizes cross-entropy of the arrived mass against the one-hot true object — gradients flow back through the attention weights along the retained paths. Strict masking `t'<t_q` is the temporal-causality constraint that makes this *extrapolation*, not interpolation.

**Runnable-quality pseudocode.**
```python
def xerte_query(kg, subject, rel, t_query, *, L=3, top_K=80, attn_fn=None):
    frontier = {subject: 1.0}          # node -> arrived mass
    subgraph = []
    for step in range(L):
        new = {}
        for e, mass in frontier.items():
            edges = kg.temporal_out_edges(e, before=t_query)   # (r', e', t') with t'<t_query
            if not edges: continue
            scores = [attn_fn(e, rel, r2, e2, t2, t_query) for (r2, e2, t2) in edges]
            w = softmax(scores)
            for (r2, e2, t2), a in zip(edges, w):
                new[e2] = new.get(e2, 0.0) + mass * a
                subgraph.append((e, r2, e2, t2, mass * a))
        # prune to top-K by arrived mass (beam)
        frontier = dict(sorted(new.items(), key=lambda kv: -kv[1])[:top_K])
        s = sum(frontier.values()) or 1.0
        frontier = {k: v/s for k, v in frontier.items()}       # renormalize
    ranked = sorted(frontier.items(), key=lambda kv: -kv[1])
    return ranked, subgraph            # subgraph = human-auditable explanation
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `L` | int | 3 | 1–5 | inference hops | ↑ reaches farther, ↑ cost |
| `top_K` | int | 80 | 20–200 | beam width per step | ↑ recall, ↑ subgraph size |
| `embed_dim` | int | 100 | 32–256 | entity/rel embeds | — |
| `time_dim` | int | 100 | 32–200 | φ(t) encoding | log-space init |
| `lr` | float | 2e-4 | 1e-5–1e-3 | Adam | — |

**Worked numeric example.** Query `(Alice, collaborates, ?, t=10)`. Step 1 from Alice: edges to Bob (att 0.6), Carol (0.4). Step 2 from Bob: Bob→Dave (0.7), Bob→Eve (0.3); from Carol: Carol→Dave (0.5), Carol→Frank (0.5). Arrived mass at Dave = `0.6·0.7 + 0.4·0.5 = 0.42+0.20 = 0.62`; Eve `=0.18`; Frank `=0.20`. Ranked object = **Dave** (0.62), with the explanatory subgraph `{Alice→Bob→Dave, Alice→Carol→Dave}`.

**Complexity (derivation).** Each step expands ≤`top_K` frontier nodes, each with up to `avg_degree` temporal edges, each scored in `O(d)` → `O(top_K·avg_degree·d)` per step × `L` steps → `O(L·top_K·avg_degree·d)` per query. Pruning bounds growth (without it, frontier could explode as `avg_degree^L`). **Space** `O(top_K·L + |subgraph|)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Temporal leakage | uses `t'≥t_q` edges | strict `before=t_query` filter |
| Subgraph blow-up | OOM / slow | top-K beam pruning each step |
| Dead-end frontier (zero mass) | no candidates | additive smoothing / fallback to TGAT |
| Attention saturation | one path dominates spuriously | renormalize per step; temperature on softmax |

**Unit-test oracle.** Construct a KG where exactly one length-2 temporal path connects subject→target (all other paths dead-end before `t_query`). The model must rank the target #1 with mass = product of the two edge attentions, and the returned subgraph must contain exactly those 2 edges. Add an edge with `t'=t_query` (future): asserting the target's mass is unchanged proves the masking works.

**Integration code-points.** **NEW** `xerte.py`. Enumerates temporal edges via `temporal_nodes.causal_chain`; reads/writes the quadruple store in `knowledge_graph.py`. Directly answers RELATIONAL-LAYER future-edge queries; the returned `subgraph` is surfaced by the VERIFIER as grounded drivers/assumptions (provenance). Predicted objects promoted into KGIK via the confidence ladder; complements TGN/TGAT (which embed) by answering queries with explanations.

---

## GROUP C — CLUSTER / MOTIF / REGIME

Training-free pattern discovery over History-Lake series (§1.3 rank-3). Feed PATTERN-DISCOVERY: motifs, regimes, recurring shapes.

---

### C9. HDBSCAN — Hierarchical Density-Based Clustering

**Purpose.** Density clustering that finds variable-density clusters, labels noise, and needs no `k`. Used to discover **regimes**/clusters of series-states or motif embeddings.

**Math / steps.**
1. **Core distance** `core_k(x)` = distance to `x`'s `min_samples`-th neighbor.
2. **Mutual reachability distance** `d_mreach(a,b) = max(core_k(a), core_k(b), d(a,b))` — pushes sparse points apart.
3. **MST** of the mutual-reachability graph (Prim/Boruvka).
4. **Hierarchy:** sort MST edges ascending, union-find → dendrogram.
5. **Condense** the tree: at each split keep only components with ≥ `min_cluster_size`; smaller "falling out" points become noise.
6. **Stability** of a cluster `C` = `Σ_{x∈C} (λ_x − λ_birth)` where `λ=1/distance` (persistence over the density scale).
7. **Extract** flat clusters: select the set of nodes maximizing total stability (Excess of Mass), constrained to a single cluster per leaf path.

**Pseudocode.**
```
core = kth_neighbor_distance(X, min_samples)
G    = mutual_reachability_graph(X, core)
mst  = minimum_spanning_tree(G)
hier = single_linkage(sort_edges(mst))
cond = condense(hier, min_cluster_size)
stab = {C: sum(λ_x - λ_birth(C) for x in C)}
labels = excess_of_mass_extract(cond, stab)     # -1 = noise
probs  = membership_strength(points, λ)
```

**Parameters (defaults).** `min_cluster_size=5` (smallest grouping you'll call a cluster), `min_samples=min_cluster_size` (↑ = more conservative/more noise), `metric='euclidean'`, `cluster_selection_method='eom'` (or `'leaf'`), `cluster_selection_epsilon=0.0`.

**Inputs / Outputs.** In: `X ∈ R^{n×d}` (raw or embeddings). Out: `labels[n]` (−1 = noise), `probabilities[n]`, `cluster_persistence`, condensed tree (for plots).

**Complexity.** ≈`O(n log n)` typical with space trees (KD/Ball); worst `O(n²)`. Memory `O(n)` + MST.

**Numerical stability.** Standardize features; `λ=1/d` → guard `d=0` (duplicate points) with epsilon; deterministic given data. Reachability avoids single-linkage chaining.

**Pipeline integration.** PATTERN-DISCOVERY regime/cluster detection; cluster Matrix-Profile motifs (C10) or foundation-model latent states into discrete regimes; regime label is a driver/feature for FORECAST CORE and a switch for ensemble weighting.

**Reuse target.** Prefer `hdbscan` library; **NEW** wrapper. Reuse existing clustering scaffolds `/home/user/jarvis-app/underworld/server/services/methods_cs_ai.py` (`kmeans_clustering`) and `disease_models.symptom_clustering` for the call/return shape and feature prep.

**Source.** Campello, Moulavi, Sander 2013; McInnes et al. *JOSS* 2017; https://hdbscan.readthedocs.io/ · https://github.com/scikit-learn-contrib/hdbscan

---

### C10. Matrix Profile (STOMP / SCRIMP++) — motifs & discords

**Purpose.** For every length-`m` subsequence, the **z-normalized Euclidean distance to its nearest neighbor** elsewhere in the series. Minima = **motifs** (recurring shapes), maxima = **discords** (anomalies). Training-free, parameter-light.

**Math.** Distance between z-normalized subsequences via the **MASS** trick using `QT` (dot product) computed by FFT-based sliding dot products:
```
d(i,j) = sqrt( 2m · (1 − (QT_{i,j} − m·μ_i·μ_j) / (m·σ_i·σ_j)) )
MP[i]  = min_j |i−j|>excl  d(i,j)         # matrix profile
MPI[i] = argmin_j ...                      # profile index (NN location)
```
- **STOMP:** `O(n²)` exact — updates `QT` row-to-row in `O(1)` after one FFT, sweeping all diagonals.
- **SCRIMP++:** anytime/ordered evaluation of diagonals + **PreSCRIMP** (sampled) → converges to exact, gives a useful approximate profile early.
Motif = the pair `(i, MPI[i])` at the smallest `MP`; discord = largest `MP`.

**Pseudocode (STOMP core).**
```
precompute μ,σ for all windows; QT_0 via FFT
for i in 0..n-m:
    for j (diagonal update): QT_{i,j} = QT_{i-1,j-1} - x_{i-1}x_{j-1} + x_{i+m-1}x_{j+m-1}
    D = dist(QT, μ, σ); apply exclusion zone (|i-j| < m/2)
    MP[i], MPI[i] = min(D), argmin(D)
motifs   = k_smallest(MP);  discords = k_largest(MP)
```

**Parameters (defaults).** `m` = subsequence length (domain-driven, e.g. one day/cycle), `exclusion_zone = ceil(m/2)`, `k` motifs/discords to report (e.g. 3). SCRIMP++ adds `sample_pct` (PreSCRIMP, e.g. 0.25).

**Inputs / Outputs.** In: univariate `x_{1:n}`, `m`. Out: `MP[n−m+1]`, `MPI`, top-k motif index pairs, top-k discord indices. (mSTAMP for multivariate.)

**Complexity.** STOMP `O(n²)` time, `O(n)` memory; SCRIMP++ same worst-case but anytime/approximate early. GPU/CuPy accelerable.

**Numerical stability.** z-normalization makes it scale/offset invariant; guard `σ≈0` (flat windows → set distance to ∞ or skip); exclusion zone prevents trivial self-matches; FFT path needs float64 for long series.

**Pipeline integration.** PATTERN-DISCOVERY core (§1.3 rank-3): motifs = recurring patterns to promote into KGIK; discords = anomalies → feed change-point/anomaly stage (Group D) and SELF-IMPROVEMENT alerts. Motif embeddings → HDBSCAN (C9) for regime sets.

**Reuse target.** Prefer **STUMPY** (`stumpy.stomp`/`stump`, GPU `gpu_stump`); **NEW** wrapper. Reuse `/home/user/jarvis-app/underworld/server/services/gpu_backend.py` for CuPy acceleration.

**Source.** Yeh et al. 2016 (Matrix Profile I); Zhu et al. 2018 (SCRIMP++); STUMPY https://stumpy.readthedocs.io/ · https://www.cs.ucr.edu/~eamonn/MatrixProfile.html

---

### C11. DTW — Dynamic Time Warping

**Purpose.** Elastic distance/alignment between two series that may be locally stretched/shifted in time. Used for shape-based similarity (motif matching, series retrieval, k-NN classification of patterns).

**Math.** For series `a_{1:n}, b_{1:m}`, cost `c(i,j)=(a_i−b_j)²`, DP:
```
D(i,j) = c(i,j) + min( D(i−1,j), D(i,j−1), D(i−1,j−1) )
D(0,0)=0; D(i,0)=D(0,j)=∞
DTW(a,b) = sqrt(D(n,m))     # warping path traced by argmin backtrack
```
Constraints: **Sakoe–Chiba band** `|i−j|≤w` (window) or Itakura parallelogram bound the warp and reduce cost. **Soft-DTW** replaces `min` with `−γ·log Σ exp(−·/γ)` for a differentiable variant.

**Pseudocode.**
```
D = inf[(n+1)×(m+1)]; D[0,0]=0
for i in 1..n:
  for j in max(1,i−w)..min(m,i+w):           # banded
     D[i,j] = (a[i]-b[j])^2 + min(D[i-1,j],D[i,j-1],D[i-1,j-1])
return sqrt(D[n,m])  (+ backtrack for alignment path)
```

**Parameters (defaults).** Window `w = ceil(0.1·max(n,m))` (Sakoe–Chiba, 10%); `metric` squared-euclidean; z-normalize inputs first; `γ=0.1` if soft-DTW. LB_Keogh lower bound for fast k-NN pruning.

**Inputs / Outputs.** In: two series (optionally a query + corpus). Out: DTW distance and warping path; for retrieval, ranked neighbors.

**Complexity.** `O(n·m)` (→ `O(n·w)` banded). Memory `O(n·m)` or `O(min(n,m))` with two-row trick. FastDTW gives approximate `O(n)`.

**Numerical stability.** z-normalize to compare shapes not scale; band prevents pathological warps and overflow; for batched k-NN apply LB_Keogh before full DTW.

**Pipeline integration.** PATTERN-DISCOVERY similarity backbone: match a current window against History-Lake motifs (complements Matrix Profile's intra-series search with cross-series search); DTW distance is a feature for HDBSCAN (C9) and an analog-forecasting retriever.

**Reuse target.** Prefer `tslearn`/`dtaidistance` or STUMPY's `stumpy.match`/subsequence DTW; **NEW** wrapper. Reuse `sim_methods.upgma` distance-matrix patterns and `gpu_backend.py`.

**Source.** Sakoe & Chiba 1978; Müller, *Information Retrieval for Music and Motion* ch.4; https://en.wikipedia.org/wiki/Dynamic_time_warping · soft-DTW https://arxiv.org/abs/1703.01541

---

## GROUP D — CHANGE-POINT / ANOMALY

Detect structural breaks and outliers in History-Lake series (§1.3 rank-6). Output segment boundaries / anomaly flags into PATTERN-DISCOVERY and SELF-IMPROVEMENT (drift triggers).

---

### D12. PELT — Pruned Exact Linear Time change-point detection

**Purpose.** Exact optimal multiple-change-point segmentation by minimizing segment cost + penalty, with pruning that gives ~linear time. Finds regime boundaries (mean/variance shifts).

**Math.** Minimize over change-point sets `τ`:
```
Σ_{k=0}^{K} [ C(y_{τ_k+1 : τ_{k+1}}) ] + β·K
```
`C` = segment cost (e.g. negative Gaussian log-likelihood, or `Σ(y−ȳ)²` for mean shift); `β` = penalty per change point. DP recursion:
```
F(t) = min_{τ<t} [ F(τ) + C(y_{τ+1:t}) + β ]
```
**Pruning:** drop candidate `τ` from future consideration when `F(τ)+C(y_{τ+1:t}) + K* > F(t)` (assuming cost satisfies the pruning inequality) — removes points that can never be optimal → near-linear.

**Pseudocode.**
```
F[0] = -β; cp[0]=∅; R = {0}                    # candidate set
for t in 1..n:
    F[t] = min over τ in R of (F[τ] + C(y[τ+1:t]) + β)
    last[t] = argmin τ
    R = { τ in R ∪ {t} : F[τ] + C(y[τ+1:t]) <= F[t] }   # prune
changepoints = backtrack(last)
```

**Parameters (defaults).** Cost model `'l2'`/`'normal'` (mean) or `'rbf'` (distributional); penalty `β = log(n)·p·σ̂²` (BIC-style, `p`=params/segment) or set by desired sensitivity; `min_segment_length=2`.

**Inputs / Outputs.** In: series `y_{1:n}`, cost model, penalty. Out: ordered change-point indices, per-segment statistics.

**Complexity.** `O(n)`–`O(n log n)` typical with pruning (worst `O(n²)`); `O(n)` memory.

**Numerical stability.** Precompute cumulative sums/sum-of-squares for `O(1)` segment costs; standardize series so `β` is scale-stable; guard tiny segments (`min_segment_length`). Penalty choice governs over/under-segmentation — expose it.

**Pipeline integration.** PATTERN-DISCOVERY **batch/offline** regime segmentation of History-Lake series; segment boundaries define stationary windows for ARIMA/GBM fitting and label regimes for ensemble switching. Complements BOCPD (online).

**Reuse target.** Prefer `ruptures` (`rpt.Pelt`); **NEW** thin wrapper. Reuse `numpy` cumulative-stats idioms already used across `prediction.py`.

**Source.** Killick, Fearnhead, Eckley 2012, *JASA*; https://arxiv.org/abs/1101.1438 · `ruptures` https://centre-borelli.github.io/ruptures-docs/

---

### D13. BOCPD — Bayesian Online Change-Point Detection

**Purpose.** **Online** posterior over the **run length** (time since last change) updated each new observation; spikes in `P(r_t=0)` signal change points with uncertainty. Streaming counterpart to PELT.

**Math.** Run length `r_t`; hazard `H(r)` (constant `H=1/λ` ⇒ geometric prior on run length). Recursion:
```
growth:  P(r_t=r_{t-1}+1, x_{1:t}) = P(r_{t-1}, x_{1:t-1})·π(x_t|r_{t-1})·(1−H(r_{t-1}))
change:  P(r_t=0,        x_{1:t}) = Σ_{r} P(r, x_{1:t-1})·π(x_t|r)·H(r)
normalize → P(r_t | x_{1:t})
```
`π(x_t|r)` = posterior predictive of the per-segment model (use a conjugate exponential-family, e.g. Normal-Inverse-Gamma for Gaussian segments — closed form, updated via sufficient statistics).

**Pseudocode.**
```
P = [1.0]                                   # run-length dist, r=0
init suff stats for r=0
for each x_t:
    pred = predictive_prob(x_t, suffstats)  # π(x|r) per run length
    growth = P * pred * (1 - H)
    cp     = sum(P * pred * H)
    P      = normalize( [cp] ++ growth )
    suffstats = update_and_prepend(suffstats, x_t)
    if P[0] > threshold: emit changepoint
    optionally prune run lengths with P < ε
```

**Parameters (defaults).** Hazard `λ=250` (i.e. `H=1/250`, expected run length); predictive model = Gaussian (NIG priors `μ0=0, κ0=1, α0=1, β0=1` on standardized data); change threshold on `P(r_t=0)` (e.g. 0.5) or report MAP run length; run-length truncation `R_max` / `ε`-pruning.

**Inputs / Outputs.** In: streaming `x_t`. Out: per-step run-length posterior, MAP run length, change-point probability/flags.

**Complexity.** `O(t)` per step naively (grows with history) → `O(R_max)` with pruning/truncation; `O(R_max)` memory.

**Numerical stability.** Work in **log-space** for the recursion (sum-exp); prune low-mass run lengths to bound cost; conjugate updates avoid integration; standardize input so default priors are reasonable.

**Pipeline integration.** PATTERN-DISCOVERY **online** detector on live History-Lake feeds; a fresh change-point invalidates current forecasts → SELF-IMPROVEMENT retrain/re-weight trigger and a VERIFIER caveat ("regime change detected").

**Reuse target.** **NEW** (small pure-numpy implementation; reference `bayesian_changepoint_detection`). Reuse `numpy`/defensive patterns from `prediction.py`.

**Source.** Adams & MacKay 2007, *Bayesian Online Changepoint Detection*; https://arxiv.org/abs/0710.3742

---

### D14. Isolation Forest

**Purpose.** Unsupervised anomaly detection by random partitioning — anomalies are isolated in fewer splits (shorter path length). Fast, scales to high-dimensional History-Lake feature vectors.

**Math.** Build `t` random binary trees (iTrees) on subsamples; each split picks a random feature and random split value. Anomaly score from average path length `E[h(x)]`:
```
s(x) = 2^( − E[h(x)] / c(n) ),   c(n)=2H(n−1) − 2(n−1)/n,  H=harmonic
```
`s→1` ⇒ anomaly; `s≈0.5` ⇒ normal. `c(n)` normalizes by the average BST path length.

**Pseudocode.**
```
forest = [ build_itree(subsample(X, ψ), max_depth=ceil(log2 ψ)) for _ in t ]
build_itree(D): if |D|<=1 or depth: return leaf(size)
    f = random_feature; v = uniform(min_f, max_f)
    return node(f,v, left=build(D[f<v]), right=build(D[f>=v]))
score(x) = 2^( -mean(pathlen(x, tree)) / c(ψ) )       # +adjust for leaf size
anomalies = score(x) > 1 - contamination_quantile
```

**Parameters (defaults).** `n_estimators=100`, `max_samples=256` (subsample ψ), `max_features=1.0`, `contamination='auto'` (or set), `random_state` fixed. `max_depth=ceil(log2 ψ)`.

**Inputs / Outputs.** In: `X ∈ R^{n×d}`. Out: anomaly scores, binary labels (1 normal / −1 anomaly), decision threshold.

**Complexity.** Train `O(t·ψ·log ψ)`; score `O(t·log ψ)` per point — sublinear in `n`. Memory `O(t·ψ)`.

**Numerical stability.** Subsampling makes it robust to swamping/masking; deterministic with fixed seed; no distance metric so no scaling sensitivity (but per-feature ranges affect split granularity — standardize for mixed units).

**Pipeline integration.** PATTERN-DISCOVERY multivariate anomaly screen over engineered features (returns, volatility, Matrix-Profile discord scores, residuals); flags → VERIFIER caveats and SELF-IMPROVEMENT outlier handling. Complements C10 discords (univariate-shape) with multivariate point anomalies.

**Reuse target.** `sklearn.ensemble.IsolationForest`; **NEW** wrapper. Reuse the sklearn usage pattern already in `/home/user/jarvis-app/underworld/server/services/ai_model.py` (RF/GB/MLP on the Yeh dataset).

**Source.** Liu, Ting, Zhou 2008, *Isolation Forest*, ICDM; https://doi.org/10.1109/ICDM.2008.17 · sklearn https://scikit-learn.org/stable/modules/outlier_detection.html#isolation-forest

---

## GROUP E — CAUSAL DISCOVERY

Replace asserted causality (gap §1.2-5) with screened, data-driven candidate causal links + distribution-shift monitoring. Feeds RELATIONAL LAYER (candidate edges) and SELF-IMPROVEMENT (drift).

---

### E15. Granger Causality (F-test on lagged regressions)

**Purpose.** Tests whether past `X` improves prediction of `Y` beyond `Y`'s own past — a *predictive* (linear, lag-based) causality screen for lead-lag relationships among History-Lake series.

**Math.** Compare restricted vs unrestricted AR models for `Y`:
```
restricted:   Y_t = Σ_{i=1}^{L} a_i Y_{t−i} + ε_t           (RSS_R)
unrestricted: Y_t = Σ_{i=1}^{L} a_i Y_{t−i} + Σ_{i=1}^{L} b_i X_{t−i} + η_t   (RSS_U)
F = ((RSS_R − RSS_U)/L) / (RSS_U/(T − 2L − 1))   ~ F(L, T−2L−1)
```
`X` Granger-causes `Y` if `F` significant (p < α). Both series must be (made) stationary first.

**Pseudocode.**
```
ensure_stationary(X, Y)                 # difference if ADF/KPSS fails
for L in 1..max_lag:
    RSS_R = OLS(Y ~ lags(Y,L)).rss
    RSS_U = OLS(Y ~ lags(Y,L)+lags(X,L)).rss
    F, p  = f_test(RSS_R, RSS_U, L, T)
report min-p lag; granger_causes = (p < α)
```

**Parameters (defaults).** `max_lag` from AIC/BIC (or `=ceil(T^{1/3})`), `α=0.05`, stationarity via ADF (`p<0.05`) else difference (`d≤2`). Optionally Toda–Yamamoto for integrated series.

**Inputs / Outputs.** In: two (stationary) series, max lag. Out: F-stat, p-value, best lag, direction(s); a lead-lag adjacency for the cross-series screen.

**Complexity.** `O(max_lag · T · L²)` (OLS per lag); pairwise over `S` series `O(S²·…)`.

**Numerical stability.** Stationarize first (else spurious causality); guard collinearity (ridge/pinv in OLS); multiple-testing correction (Benjamini–Hochberg) across all pairs; require `T ≫ 2L`.

**Pipeline integration.** PATTERN-DISCOVERY cross-series **lead-lag/causal screen** (§2): significant `X→Y` becomes a candidate exogenous regressor for ARIMAX (A3) and a candidate KGIK edge (RELATIONAL LAYER) pending confirmation by SELF-IMPROVEMENT. Honest framing: "Granger-predictive," not proof of mechanism.

**Reuse target.** `statsmodels.tsa.stattools.grangercausalitytests`; **NEW** wrapper. Reuse `numpy` OLS idioms (`np.polyfit`/`lstsq`) already used in `prediction.py` (`fit_growth_series`).

**Source.** Granger 1969, *Econometrica*; https://doi.org/10.2307/1912791 · statsmodels https://www.statsmodels.org/stable/generated/statsmodels.tsa.stattools.grangercausalitytests.html

---

### E16. CCM — Convergent Cross Mapping

**Purpose.** Detect **nonlinear** dynamical coupling in deterministic systems where Granger fails (e.g. coupled chaotic series). If `X` drives `Y`, `X`'s states are recoverable from `Y`'s shadow manifold, and skill **converges** as library length grows.

**Math (Takens + cross-map).**
1. Time-delay embed `Y`: `Ŷ(t)=[Y_t, Y_{t−τ}, …, Y_{t−(E−1)τ}]` (shadow manifold `M_Y`).
2. To "cross-map" `X` from `M_Y`: for target `t`, find `E+1` nearest neighbors of `Ŷ(t)` in `M_Y`, weight by `w_i ∝ exp(−d_i/d_1)` (normalized), predict `X̂(t)=Σ w_i X(t_i)`.
3. Skill `ρ(L)` = correlation(`X̂, X`) as library length `L` increases. **Convergence** (`ρ` rising and saturating with `L`) ⇒ `X` causes `Y` (in Sugihara's sense). Test both directions for direction/strength.

**Pseudocode.**
```
M_Y = delay_embed(Y, E, τ)
for L in increasing library sizes:
    for t in prediction set:
        nn = E+1 nearest neighbors of M_Y[t] within library L
        w  = softmax(-dist/dist_min)
        Xhat[t] = Σ w_i * X[nn_i]
    ρ[L] = corr(Xhat, X)
X→Y if ρ[L] increases with L and saturates high
```

**Parameters (defaults).** Embedding dim `E` chosen by simplex-projection prediction skill (try 1..10); delay `τ=1` (or first ACF/MI minimum); neighbors `=E+1`; library lengths swept `[E+2 … T]`; significance via surrogate (twin/seasonal) shuffles.

**Inputs / Outputs.** In: two series (no differencing — needs deterministic dynamics). Out: `ρ(L)` curves per direction, convergence verdict, coupling strength/direction.

**Complexity.** `O(L · k · log N)` per library size with KD-tree NN; swept over `L` and both directions.

**Numerical stability.** Normalize series; choose `E,τ` carefully (under/over-embedding distorts); requires sufficient length and low noise; use surrogate tests to avoid false convergence; not for stochastic/strongly noisy data — guard with a determinism check (simplex skill > threshold).

**Pipeline integration.** PATTERN-DISCOVERY causal screen for **nonlinear** couplings that Granger (E15) misses; converged links → candidate KGIK edges with "nonlinear coupling" type. Use Granger + CCM together (linear + nonlinear coverage).

**Reuse target.** **NEW** (numpy + KD-tree; reference `pyEDM`/`skccm`). Reuse `gpu_backend.py` for batched NN if scaled.

**Source.** Sugihara et al. 2012, *Detecting Causality in Complex Ecosystems*, *Science*; https://doi.org/10.1126/science.1227079 · pyEDM https://github.com/SugiharaLab/pyEDM

---

### E17. PSI — Population Stability Index (distribution shift) — **REUSE EXISTING**

**Purpose.** Quantify how much a feature's/target's distribution has shifted from a reference window — drift detection for inputs and for prediction errors. Already implemented.

**Math.** Bin reference and current into the same edges; with proportions `r_b, c_b`:
```
PSI = Σ_b (c_b − r_b)·ln(c_b / r_b)
```
Rule of thumb: `<0.1` stable, `0.1–0.2` moderate, `>0.2` significant drift. (KL-divergence-like, symmetrized by the `(c−r)` weight.)

**Pseudocode (as implemented).**
```
edges  = histogram_bin_edges(reference, bins)
r_hist = hist(reference, edges)/N_ref;  c_hist = hist(current, edges)/N_cur
r_hist = clip(r_hist, 1e-6, None); c_hist = clip(c_hist, 1e-6, None)
psi = Σ (c_hist - r_hist) * ln(c_hist / r_hist)
return {psi, drift: psi > 0.2}
```

**Parameters (defaults).** `bins=10` (quantile or equal-width on reference); drift threshold `0.2`; floor `1e-6` to avoid `log 0`.

**Inputs / Outputs.** In: `reference[], current[]`. Out: `{psi, drift:bool}`.

**Complexity.** `O(N log N)` (histogram); `O(bins)` memory.

**Numerical stability.** Clip empty bins to `1e-6` (already done) to avoid `−∞`; use reference-defined edges for both; quantile bins for skewed data.

**Pipeline integration.** SELF-IMPROVEMENT drift monitor (§08): PSI on incoming feature feeds and on forecast-error distributions → retrain/re-weight trigger; pairs with ECE (calibration) and CRPS (skill). This is the §1.3 "PSI/ECE drift."

**Reuse target.** **ALREADY EXISTS** — `/home/user/jarvis-app/underworld/server/services/ai_models.py` → `drift_detector()` (lines 74–82). Also reuse `calibration_error()` (ECE, lines 85–94) and `uncertainty_estimate()` (ensemble mean/std, lines 103–107).

**Source.** Standard credit-scoring PSI; overview https://www.listendata.com/2015/05/population-stability-index.html

---

## GROUP F — ENSEMBLE / UNCERTAINTY

Combine forecasters and produce calibrated intervals + skill scores — PATTERN ORACLE's "calibrated honesty" core (§1.3 rank-2,5,7).

---

### F18. Error-Weighted Ensemble (expired patent WO2014075108A2)

**Purpose.** Combine member forecasts with weights inversely proportional to each member's **recent** error (exponentially scaled), so the ensemble tracks whichever model is currently best. Patent expired → free to implement.

**Math.** Per member `k`, recent error `e_k` (e.g. EWMA of |error| or RMSE over a trailing window):
```
w_k = exp(−γ · e_k / ē) / Σ_j exp(−γ · e_j / ē)      # softmax of −scaled error
ŷ   = Σ_k w_k · ŷ_k     (and for quantiles: weighted mixture / weighted quantile)
```
`ē` = mean recent error (scale normalizer); `γ` = temperature (↑ ⇒ winner-take-all). Equivalent inverse form `w_k ∝ 1/e_k` is the `γ→` linearization; exponential scaling is the patent's emphasis.

**Pseudocode.**
```
for each new realized outcome y:
    for k: e_k = λ*|ŷ_k_prev - y| + (1-λ)*e_k          # EWMA recent error
ē = mean(e); w = softmax(-γ * e/ē)
forecast: ŷ = Σ w_k ŷ_k
          predictive quantiles = weighted_mixture({ŷ_k quantiles}, w)
```

**Parameters (defaults).** Error EWMA `λ=0.3`; temperature `γ=2.0`; trailing window `W=30`; floor weights (`min 0.01`) to keep diversity; reset on detected change-point (D12/D13).

**Inputs / Outputs.** In: member forecasts (point + quantiles) + their recent realized errors. Out: combined point + combined predictive quantiles + member weights (drivers).

**Complexity.** `O(K)` per step (K members); negligible.

**Numerical stability.** Softmax in stable form (subtract max); normalize errors by `ē` so `γ` is scale-free; weight floor prevents collapse; handle missing member (renormalize over present ones).

**Pipeline integration.** FORECAST CORE **combiner** (§2): fuses A1–A5 (and EnKF §21) using errors tracked by SELF-IMPROVEMENT; output goes to EnbPI (§19) for final calibration. This is the §1.3 rank-7 Error-Weighted Ensemble.

**Reuse target.** **NEW** combiner; reuse `uncertainty_estimate()` (`ai_models.py` lines 103–107) for ensemble mean/std and the error-tracking store from `08_SELF_IMPROVEMENT_AND_MLOPS.md`.

**Source.** Expired patent **WO2014075108A2** (error-weighted predictive ensemble) https://patents.google.com/patent/WO2014075108A2 · related: Cerqueira et al., arbitrated dynamic ensembles https://arxiv.org/abs/1811.10916

---

### F19. EnbPI — Ensemble Batch Prediction Intervals (conformal)

**Purpose.** Distribution-free, **no-exchangeability-required** prediction intervals for time series via a bootstrap ensemble + leave-one-out residuals + sliding-window residual quantiles. Wraps any point forecaster (A1–A5) with calibrated coverage.

**Math.**
- Train `B` bootstrap models on resampled blocks; for each training index `i`, the **LOO** prediction `f^{−i}(x_i)` aggregates only bootstraps that did **not** include `i`; residual `ε_i = |y_i − f^{−i}(x_i)|`.
- For a test point at horizon, point `f̂(x_t)` = aggregate of all bootstraps; interval:
  `[ f̂(x_t) − q_{1−α}({ε}_{recent W}),  f̂(x_t) + q_{1−α}({ε}_{recent W}) ]`
  where `q_{1−α}` is the empirical `(1−α)` quantile of the most recent `W` LOO residuals (sliding window adapts to drift). After observing `y_t`, append its residual and slide.

**Pseudocode.**
```
fit B bootstrap models on block-resampled data
for i in train: f_loo[i] = aggregate(models not containing i)(x_i)
                eps[i]   = |y_i - f_loo[i]|
for each test t in order:
    fhat = aggregate(all models)(x_t)
    w    = quantile(eps[-W:], 1-α)
    interval = [fhat - w, fhat + w]
    after y_t observed: eps.append(|y_t - fhat|)     # online update
```

**Parameters (defaults).** `B=20–30` bootstraps, miscoverage `α=0.1` (90% PI), window `W=100` (or full), aggregator = mean/median, block length for resampling = seasonal period or `~√T`.

**Inputs / Outputs.** In: a base forecaster + training (X,y) + test stream. Out: per-step prediction intervals with target coverage `1−α`; realized coverage tracked.

**Complexity.** `O(B·cost(base_fit))` train; `O(B + W log W)` per prediction. Memory `O(B + W)`.

**Numerical stability.** Sliding window handles non-stationarity (the whole point — no exchangeability needed); ensure ≥1 LOO model per index (raise `B` or use leave-one-block-out); use absolute residuals for symmetric PIs or signed for asymmetric.

**Pipeline integration.** FORECAST CORE **final calibration** after the ensemble (§18): every forecast gets an EnbPI interval; realized coverage feeds SELF-IMPROVEMENT (§08) and the VERIFIER's honest interval. This is the §1.3 rank-2 "EnbPI conformal intervals."

**Reuse target.** **NEW**; reference `MAPIE`'s `EnbPI`. Reuse `numpy.percentile` (already used in `gbm_montecarlo_forecast`) and the bootstrap idea is small.

**Source.** Xu & Xie 2021, *Conformal prediction interval for dynamic time-series*, ICML; https://arxiv.org/abs/2010.09107 · MAPIE https://mapie.readthedocs.io/

---

### F20. CRPS & Skill Score vs Climatology

**Purpose.** Proper scoring rule for **probabilistic** forecasts (rewards calibration + sharpness) plus a skill score that normalizes against a climatology baseline — the metric the supercomputer loop optimizes (§1.3 rank-5).

**Math.**
- **CRPS** for predictive CDF `F` and observation `y`:
  `CRPS(F,y) = ∫_{−∞}^{∞} (F(z) − 1{z≥y})² dz`. For an ensemble `{x_1..x_m}` (empirical CDF), unbiased estimator:
  `CRPS = (1/m)Σ_i |x_i − y| − (1/2m²)ΣΣ |x_i − x_j|`. (Lower = better; reduces to MAE for a point forecast.)
- **Skill score** vs reference (climatology): `SS = 1 − CRPS_model / CRPS_clim`. `SS>0` beats climatology; `SS=1` perfect; `SS<0` worse than the naive baseline. Climatology = unconditional historical distribution (or seasonal mean ± historical spread).

**Pseudocode.**
```
def crps_ensemble(samples, y):
    m = len(samples)
    term1 = mean(|s - y| for s in samples)
    term2 = mean(|si - sj| for all i,j) / 2
    return term1 - term2
SS = 1 - mean(crps_model) / mean(crps_climatology)
# also: RMSE, MAE, empirical interval coverage vs nominal (1-α)
```

**Parameters (defaults).** Climatology = trailing-window empirical distribution (window e.g. 365 daily / one seasonal cycle); evaluate on rolling-origin backtest; report CRPS, RMSE, MAE, coverage, sharpness (mean interval width).

**Inputs / Outputs.** In: predictive samples/quantiles + realized `y` (+ climatology samples). Out: CRPS, skill score, coverage, sharpness — the forecast scorecard.

**Complexity.** Ensemble CRPS naive `O(m²)`; sorted form `O(m log m)`; trivial memory.

**Numerical stability.** Use the sorted `O(m log m)` estimator for large ensembles; ensure model and climatology scored on identical targets/horizons; report coverage alongside CRPS (CRPS alone can hide miscalibration).

**Pipeline integration.** SELF-IMPROVEMENT scoring engine (§08): every forecast is later scored by CRPS/skill/coverage vs realized outcome; scores drive Error-Weighted-Ensemble weights (§18), retrain triggers, and the honest "this method beats climatology by X" statement in the VERIFIER. This is the §1.3 rank-5 backtesting loop.

**Reuse target.** **NEW** (small numpy); reference `properscoring`/`scoringrules`. Reuse `evaluation_arena()` (`ai_models.py` line 59) for the metrics-dict shape.

**Source.** Gneiting & Raftery 2007, *Strictly Proper Scoring Rules*, *JASA*; https://doi.org/10.1198/016214506000001437 · properscoring https://github.com/properscoring/properscoring

---

## GROUP G — DATA ASSIMILATION

Blend model forecasts with noisy observations as they arrive — numerical-weather-prediction-style ensemble loop (§1.3 deep tier).

---

### G21. EnKF — Ensemble Kalman Filter

**Purpose.** Sequential state estimation for high-dimensional / nonlinear systems: a forecast **ensemble** approximates the state covariance, then a Kalman update assimilates observations with perturbed observations. Powers the "supercomputer" assimilation loop fusing models + live data.

**Math.**
1. **Forecast:** propagate each member `x_i^f = M(x_i^a) + noise`; sample covariance
   `P^f = (1/(N−1)) Σ_i (x_i^f − x̄^f)(x_i^f − x̄^f)ᵀ`.
2. **Kalman gain:** `K = P^f Hᵀ (H P^f Hᵀ + R)^{−1}` (`H` = observation operator, `R` = obs error covariance).
3. **Update (perturbed observations):** for each member, `x_i^a = x_i^f + K(y + ε_i − H x_i^f)`, `ε_i ~ N(0,R)` (perturbing obs keeps the analysis ensemble spread correct).
4. **Covariance localization:** `P^f ← ρ ∘ P^f` (Schur product with a compact correlation taper, e.g. Gaspari–Cohn) to kill spurious long-range correlations from finite `N`; **inflation** `x_i^f ← x̄^f + r(x_i^f − x̄^f)`, `r>1`, to counter ensemble under-dispersion.

**Pseudocode.**
```
ensemble = {x_i}_{i=1..N}
for each assimilation cycle:
    # forecast
    x_i_f = M(x_i_a) for all i;  inflate spread by r
    P_f   = cov(x_f) ∘ localization_taper
    # analysis
    K = P_f Hᵀ (H P_f Hᵀ + R)^-1
    for i: x_i_a = x_i_f + K (y + ε_i - H x_i_f),  ε_i~N(0,R)
    x_estimate = mean(x_a);  spread = std(x_a)
```

**Parameters (defaults).** Ensemble size `N=50–100`; inflation `r=1.02–1.10`; localization radius (Gaspari–Cohn length scale) domain-dependent; `R` from sensor error specs; `H` linear (or use EnKF's stochastic handling of nonlinear `H`).

**Inputs / Outputs.** In: dynamics `M`, obs operator `H`, observations `y` + `R`, prior ensemble. Out: analysis state estimate `x̄^a` + uncertainty (ensemble spread) + updated ensemble for the next cycle.

**Complexity.** `O(N·(cost(M)) + N·n·p + p³)` per cycle (`n` state dim, `p` obs dim; `p³` from the `(HP^fHᵀ+R)^{−1}` solve — small if few obs). Memory `O(N·n)`.

**Numerical stability.** **Localization + inflation are mandatory** at finite `N` (else filter divergence from spurious/underdispersed covariance); solve the gain via Cholesky/`solve` not explicit inverse; perturbed obs reduce analysis-covariance bias; symmetrize `P^f`.

**Pipeline integration.** FORECAST CORE assimilation leg (§2): continuously nudges model state toward live History-Lake observations; the assimilated estimate + spread enters the Error-Weighted Ensemble (§18) and supplies a physically-consistent uncertainty band. Realizes the §1.3 "EnKF data assimilation."

**Reuse target.** **NEW** (numpy/`filterpy`'s `EnsembleKalmanFilter` as reference). Reuse `gpu_backend.py` for large-`n` covariance ops and the ensemble idioms from `/home/user/jarvis-app/underworld/server/services/epidemic_network.py` (already does ensemble SIR).

**Source.** Evensen 2003, *The Ensemble Kalman Filter*, *Ocean Dynamics*; https://doi.org/10.1007/s10236-003-0036-9 · Gaspari–Cohn localization https://doi.org/10.1002/qj.49712555417

---

## GROUP H — LATENT WORLD MODEL (design-level, interfaces only)

Forward-looking latent dynamics models — specified at the **interface** level per §1.3 deep tier (full training is out of v1 scope). They learn a compressed latent that predicts the future and supports planning.

---

### H22. JEPA — Joint-Embedding Predictive Architecture (next-latent prediction)

**Purpose.** Self-supervised world model that predicts **in representation space** (not pixels/values): an encoder maps context to a latent, a predictor predicts the target's latent; trained to match a target-encoder's (EMA) embedding. Avoids the blur/cost of reconstruction; learns abstract dynamics.

**Math / loss.**
- Context encoder `s_x = E_θ(x)`; target encoder `s_y = E_ξ(y)` with EMA weights `ξ ← m·ξ + (1−m)·θ` (stop-gradient on target).
- Predictor `ŝ_y = P_φ(s_x, z)` (`z` = positional/conditioning, e.g. which future block).
- Loss `L = ‖ŝ_y − sg(s_y)‖²` (smooth-L1 / cosine), no negatives — collapse prevented by the asymmetric EMA target + stop-gradient (and optional variance/covariance regularization à la VICReg).

**Interface (the contract).**
```
class JEPAWorldModel(Protocol):
    def encode(context) -> latent
    def predict_latent(latent, target_spec) -> pred_latent     # next-state in latent space
    def train_step(context, target) -> loss                    # EMA target encoder updated internally
    # downstream: latent features feed a lightweight forecast/probe head
```
For time series: context = past window, target = future window; the predicted **next latent** is decoded by a small probe head into forecast quantiles, or clustered (HDBSCAN C9) into regimes.

**Parameters (interface-level).** Latent dim, EMA momentum `m≈0.996→1.0` (ramped), masking/blocking ratio for context/target split, predictor depth. (Architecture-specific; specify when implemented.)

**Inputs / Outputs.** In: unlabeled sequences from the History Lake. Out: pretrained encoder producing **transferable latents**; a predictor for next-latent; probe head → forecasts.

**Complexity.** Training: transformer/encoder cost; **no decoder** so cheaper than generative world models. GPU required for pretraining; inference is encoder-forward.

**Numerical stability.** EMA target + stop-gradient are essential to avoid representational collapse; ramp `m`; optionally VICReg variance/covariance terms; normalize latents.

**Pipeline integration.** LATENT WORLD MODEL (forward-looking, §1.3): pretrain on the History Lake to give every series a learned latent; latents feed FORECAST CORE probe heads, PATTERN-DISCOVERY (regime clustering), and RELATIONAL LAYER (node features for TGN/TGAT). v1 = design + interface; build behind a feature flag.

**Reuse target.** **NEW** (PyTorch). Reuse `gpu_backend.py`, the History-Lake loaders (`05_DATA_MODEL_AND_SCHEMAS.md`), and the foundation-adapter contract (A4) for the probe-head forecast output shape.

**Source.** LeCun 2022 position paper; Assran et al. 2023, *I-JEPA*; https://arxiv.org/abs/2301.08243 · video V-JEPA https://github.com/facebookresearch/jepa

---

### H23. DreamerV3 — RSSM with symlog + two-hot (interfaces only)

**Purpose.** Model-based RL world model: a **Recurrent State-Space Model (RSSM)** learns latent dynamics from observations, and an actor-critic plans/learns **inside the learned model** ("in imagination"). DreamerV3's symlog + two-hot tricks make it robust across scales without per-task tuning. Design-level inclusion for future closed-loop "act-and-predict."

**Math / components.**
- **RSSM:** deterministic recurrent state `h_t = GRU(h_{t−1}, z_{t−1}, a_{t−1})`; stochastic latent `z_t ~ q(z_t | h_t, x_t)` (posterior) and prior `ẑ_t ~ p(ẑ_t | h_t)`; decode `x̂_t = D(h_t, z_t)`. Loss = reconstruction + KL(`q‖p`) (with free-bits / KL balancing).
- **symlog** transform for rewards/values/inputs of varying magnitude: `symlog(x)=sign(x)·ln(1+|x|)`, inverse `symexp`. Predict `symlog(x)`, decode with `symexp` — tames large/small scales.
- **two-hot** encoding: regress scalars (returns/values) as a distribution over a fixed set of exponentially-spaced bins, target = the two adjacent bins weighting to the exact value; predict via softmax then expectation. Stabilizes value learning across orders of magnitude.
- **Imagination:** roll the RSSM forward under the actor to train critic (λ-returns) and actor (policy gradient through the model).

**Interface (the contract).**
```
class RSSMWorldModel(Protocol):
    def observe(obs_seq, action_seq) -> latents           # posterior states
    def imagine(start_latent, policy, horizon) -> rollout  # prior rollout for planning
    def decode(latent) -> obs_pred / reward_pred           # symlog+two-hot heads
symlog(x)=sign(x)ln(1+|x|);  symexp(y)=sign(y)(exp|y|-1)
```

**Parameters (interface-level).** Deterministic dim, stochastic categorical dims, KL balance/free-bits, two-hot bin count/range, imagination horizon, actor/critic schedules. (Specify at build time.)

**Inputs / Outputs.** In: observation/action sequences (for a controllable subsystem — e.g. a simulated minion world). Out: learned latent dynamics, imagined rollouts for planning, value/reward predictions.

**Complexity.** Training: sequence model + imagination rollouts (GPU). Heavier than JEPA (generative + RL). Strictly future scope.

**Numerical stability.** symlog/symexp + two-hot are the stability mechanism (scale-robust); KL balancing/free-bits prevent posterior collapse; categorical latents with straight-through gradients. Document only — not built in v1.

**Pipeline integration.** LATENT WORLD MODEL / closed-loop planning (deepest tier): applicable where PATTERN ORACLE both predicts **and acts** (e.g. the underworld minion simulation), enabling counterfactual "what if we intervene" rollouts that complement the observational causal screens (E15/E16). Interface only in this spec.

**Reuse target.** **NEW** (PyTorch). Reuse the simulation substrate `/home/user/jarvis-app/underworld/server/services/epidemic_network.py` (agent dynamics) and `temporal_nodes.counterfactual_fork` as the conceptual analog for imagined rollouts.

**Source.** Hafner et al. 2023, *DreamerV3: Mastering Diverse Domains through World Models*; https://arxiv.org/abs/2301.04104 · impl https://github.com/danijar/dreamerv3

---

## SUMMARY TABLE — algorithm → role in pipeline → reuse target → source

| # | Algorithm | Role in PATTERN ORACLE pipeline | Reuse target (repo) | Source |
|---|-----------|---------------------------------|---------------------|--------|
| 1 | GBM Monte-Carlo | FORECAST CORE classical leg / ensemble member (**live**) | `server/services/prediction.py:gbm_montecarlo_forecast` | en.wikipedia.org/wiki/Geometric_Brownian_motion |
| 2 | Holt / Holt-Winters | FORECAST CORE classical / seasonal anchor | `prediction.py` Holt loop (L288–298) → extract | otexts.com/fpp3/holt-winters.html |
| 3 | ARIMA / auto-ARIMA | FORECAST CORE classical / ARIMAX w/ exog drivers | NEW (statsmodels/pmdarima) | jstatsoft.org/article/view/v027i03 |
| 4 | TimesFM / Chronos adapter | FORECAST CORE **primary learned leg** | NEW + `gpu_backend.py`, `prediction.py` HTTP pattern | github.com/google-research/timesfm |
| 5 | Lag-Llama Student-t | FORECAST CORE learned leg (heavy tails) | NEW + A4 adapter contract | arxiv.org/abs/2310.08278 |
| 6 | TGN | RELATIONAL LAYER learned temporal edges | NEW + `knowledge_graph.py`, `temporal_nodes.py` | arxiv.org/abs/2006.10637 |
| 7 | TGAT | RELATIONAL LAYER inductive temporal embeddings | NEW + same substrate | arxiv.org/abs/2002.07962 |
| 8 | xERTE | RELATIONAL LAYER explainable link extrapolation | NEW + `knowledge_graph.py` | arxiv.org/abs/2012.15537 |
| 9 | HDBSCAN | PATTERN-DISCOVERY regime/cluster detection | `methods_cs_ai.kmeans_clustering` (shape) + hdbscan lib | hdbscan.readthedocs.io |
| 10 | Matrix Profile (STOMP/SCRIMP++) | PATTERN-DISCOVERY motifs/discords | NEW (STUMPY) + `gpu_backend.py` | stumpy.readthedocs.io |
| 11 | DTW | PATTERN-DISCOVERY shape similarity / analog retrieval | NEW (tslearn) + `sim_methods.upgma` (dist) | en.wikipedia.org/wiki/Dynamic_time_warping |
| 12 | PELT | PATTERN-DISCOVERY offline change-point segmentation | NEW (ruptures) | arxiv.org/abs/1101.1438 |
| 13 | BOCPD | PATTERN-DISCOVERY online change-point → retrain trigger | NEW (numpy) | arxiv.org/abs/0710.3742 |
| 14 | Isolation Forest | PATTERN-DISCOVERY multivariate anomaly screen | NEW + `ai_model.py` sklearn pattern | doi.org/10.1109/ICDM.2008.17 |
| 15 | Granger causality | PATTERN-DISCOVERY linear lead-lag/causal screen | NEW (statsmodels) + numpy OLS in `prediction.py` | doi.org/10.2307/1912791 |
| 16 | CCM | PATTERN-DISCOVERY nonlinear coupling screen | NEW (numpy+KDtree) | doi.org/10.1126/science.1227079 |
| 17 | PSI | SELF-IMPROVEMENT drift monitor (**exists**) | `underworld/.../ai_models.py:drift_detector` (+`calibration_error`,`uncertainty_estimate`) | listendata.com PSI |
| 18 | Error-Weighted Ensemble | FORECAST CORE combiner | NEW + `ai_models.uncertainty_estimate` | patents.google.com/patent/WO2014075108A2 |
| 19 | EnbPI conformal | FORECAST CORE final interval calibration | NEW (MAPIE ref) + `np.percentile` | arxiv.org/abs/2010.09107 |
| 20 | CRPS & skill score | SELF-IMPROVEMENT scoring engine | NEW + `ai_models.evaluation_arena` (shape) | doi.org/10.1198/016214506000001437 |
| 21 | Ensemble Kalman Filter | FORECAST CORE assimilation leg | NEW + `epidemic_network.py` ensembles, `gpu_backend.py` | doi.org/10.1007/s10236-003-0036-9 |
| 22 | JEPA | LATENT WORLD MODEL (latent features, design-level) | NEW + `gpu_backend.py`, A4 contract | arxiv.org/abs/2301.08243 |
| 23 | DreamerV3 RSSM | LATENT WORLD MODEL / planning (interface-only) | NEW + `epidemic_network.py`, `temporal_nodes.counterfactual_fork` | arxiv.org/abs/2301.04104 |

---

### Cross-cutting implementation notes
- **Standard forecast contract.** Every forecaster (A1–A5, ensemble) emits the same shape: `{point_estimate, mean, quantiles{level→value}, interval{low,high,confidence}, drivers, math, model, version}` — so §18 can combine and §19/§20 can calibrate/score uniformly. Upgrade A1's `percentiles` to a full quantile grid to match.
- **Honesty rule.** When a learned model (A4/A5) or remote endpoint is unavailable, fall back to A1–A3 and set `model:"fallback"` + a caveat (mirrors the existing best-effort `_kimi_extract` / underworld-import guards in `prediction.py`).
- **GPU.** A4–A8, C10, E16, G21, H22–H23 route heavy linear algebra through `gpu_backend.py` (CuPy↔NumPy drop-in) with remote dispatch per `10_COMPUTE_AND_GPU.md`.
- **Self-improvement closure.** Outputs of A1–A21 are persisted as forecasts, scored by §20 (CRPS/skill/coverage) and §17 (PSI/ECE) against realized outcomes, feeding §18 weights and KGIK edge strengths — the loop in `00_MASTER_INDEX.md §2`.
