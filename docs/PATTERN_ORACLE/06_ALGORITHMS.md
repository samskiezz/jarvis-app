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

#### C9.+ DEPTH MILESTONE

**Full derivation.** Single-linkage clustering chains through low-density bridges. HDBSCAN fixes this by transforming the metric: the **mutual reachability distance** `d_mr(a,b)=max(core_k(a),core_k(b),d(a,b))` inflates distances in sparse regions (where `core_k` is large), so a sparse bridge point cannot cheaply connect two dense blobs. Building a single-linkage hierarchy on `d_mr` then sweeping a density threshold `λ=1/d_mr` is equivalent to running DBSCAN at *every* `ε` simultaneously. A cluster's **stability** `S(C)=Σ_{x∈C}(λ_x−λ_birth(C))` integrates how long (over the `λ` sweep) points remained in `C` before falling out — clusters that persist across many density scales are "real." The **Excess of Mass** extraction selects the antichain of tree nodes maximizing total stability subject to "one cluster per root-to-leaf path," a DP over the condensed tree. This is why HDBSCAN needs no global `ε`: it picks the most stable density per cluster.

**DBSCAN vs HDBSCAN tradeoff (requested).**
| Aspect | DBSCAN | HDBSCAN |
|---|---|---|
| Params | `ε` (global radius) + `min_samples` | `min_cluster_size` (+ `min_samples`) — no `ε` |
| Variable density | fails (one `ε` can't fit all) | handles (per-cluster density) |
| Noise labeling | yes | yes, with membership `probabilities` |
| Cluster count | implicit via `ε` | implicit via stability |
| Determinism | deterministic | deterministic |
| Complexity | `O(n log n)` w/ index | `O(n log n)` typical, MST extra |
| When to use | uniform density, known scale, streaming | unknown/variable density, exploratory regimes |
| Failure | merges/splits at wrong `ε` | over-fragments if `min_cluster_size` too small |

Rule for PATTERN ORACLE: use **HDBSCAN** for regime discovery (unknown #regimes, variable density); fall back to DBSCAN only when a fixed operational radius is meaningful (e.g. fixed sensor tolerance).

**Runnable-quality pseudocode.**
```python
def hdbscan_cluster(X, *, min_cluster_size=5, min_samples=None, metric="euclidean"):
    import numpy as np
    from scipy.spatial import cKDTree
    from scipy.sparse.csgraph import minimum_spanning_tree
    ms = min_samples or min_cluster_size
    Xs = (X - X.mean(0)) / (X.std(0) + 1e-9)          # standardize
    tree = cKDTree(Xs)
    dk, _ = tree.query(Xs, k=ms)                       # ms-th neighbor distance
    core = dk[:, -1]
    n = len(Xs)
    # mutual reachability (dense for clarity; library uses sparse MST construction)
    D = np.zeros((n, n))
    for i in range(n):
        d = np.linalg.norm(Xs - Xs[i], axis=1)
        D[i] = np.maximum.reduce([core, np.full(n, core[i]), d])
    mst = minimum_spanning_tree(D).toarray()
    # condense + stability + EOM extraction handled by library:
    import hdbscan
    clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size,
                                min_samples=ms, metric=metric).fit(X)
    return {"labels": clusterer.labels_.tolist(),
            "probabilities": clusterer.probabilities_.tolist(),
            "persistence": clusterer.cluster_persistence_.tolist()}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `min_cluster_size` | int | 5 | 2–n/2 | smallest valid cluster | ↑ to suppress micro-clusters |
| `min_samples` | int | =mcs | 1–50 | conservativeness / noise | ↑ ⇒ more points labeled noise |
| `metric` | str | euclidean | any | distance | match feature space; standardize first |
| `cluster_selection_method` | str | eom | {eom,leaf} | flat extraction | leaf ⇒ finer clusters |
| `cluster_selection_epsilon` | float | 0.0 | ≥0 | merge below ε | >0 to prevent over-split |

**Worked numeric example.** `X` = two Gaussian blobs (50 pts at (0,0) σ=0.3; 50 at (5,5) σ=0.3) + 5 uniform noise points. `min_cluster_size=5`: core distances inside blobs are small (~0.1), bridge/noise points have large core → mutual reachability separates the blobs; output `labels` = `[0]*50+[1]*50+[−1]*5`, two clusters with `persistence≈[0.8,0.8]`, 5 noise points (label −1).

**Complexity (derivation).** Core distances via KD/Ball tree: `O(n log n)` for `n` queries. Mutual-reachability MST with Boruvka on a space tree: `O(n log n)` typical (worst `O(n²)` if tree degenerates, e.g. high-d). Condensing + stability DP: `O(n)` (tree has `O(n)` nodes). Total **time** `O(n log n)` typical; **space** `O(n)` (+ MST edges `O(n)`).

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Duplicate points (`d=0`) | `λ=1/0=∞` | epsilon-jitter or merge duplicates |
| Unstandardized mixed-unit features | one dim dominates distance | z-score standardize |
| High dimensionality | distance concentration, slow tree | PCA/UMAP reduce first |
| `min_cluster_size` too small | spurious micro-clusters | raise it; use eom |

**Unit-test oracle.** Two perfectly separated unit clusters: `X=[[0,0]]*10 + [[10,10]]*10`. With `min_cluster_size=5`, exactly 2 clusters, 0 noise, and the two cluster labels partition the 20 points 10/10. Single well-separated blob of 3 points with `min_cluster_size=5` → all labeled noise (−1), since no group reaches the size threshold.

**Integration code-points.** Prefer the `hdbscan` library behind a **NEW** wrapper `cluster_regimes.py`. Reuses the call/return shape of `methods_cs_ai.kmeans_clustering` and `disease_models.symptom_clustering` (`/home/user/jarvis-app/underworld/server/services/`). Input `X` = Matrix-Profile motif embeddings (C10) or foundation-model latents (A4/H22). Output `labels` become a regime feature/driver for FORECAST CORE and a switch key for Error-Weighted-Ensemble (F18) weighting.

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

#### C10.+ DEPTH MILESTONE

**Full derivation (MASS).** The z-normalized Euclidean distance between subsequences `T_i` and `T_j` of length `m` expands as `d²=Σ((t_{i+k}−μ_i)/σ_i − (t_{j+k}−μ_j)/σ_j)²`. Multiplying out and using that z-normalized vectors have norm `√m`, this reduces to `d²=2m(1 − (QT_{i,j}−m μ_i μ_j)/(m σ_i σ_j))` where `QT_{i,j}=Σ_k t_{i+k}t_{j+k}` is the raw dot product. The dot products along a fixed diagonal satisfy the `O(1)` recurrence `QT_{i,j}=QT_{i−1,j−1} − t_{i−1}t_{j−1} + t_{i+m−1}t_{j+m−1}` (drop the leaving term, add the entering term). STOMP computes the first column via one FFT-based convolution (`O(n log n)`) then sweeps all diagonals in `O(1)` each → `O(n²)` total. The rolling means/stds use cumulative-sum tricks for `O(1)` per window. The exclusion zone `|i−j|<m/2` removes trivial matches where a subsequence is compared to its own near-overlap.

**Runnable-quality pseudocode (STOMP core).**
```python
def stomp(T, m):
    import numpy as np
    n = len(T) - m + 1
    # rolling mean/std via cumulative sums (O(1) per window)
    cs  = np.concatenate([[0], np.cumsum(T)])
    cs2 = np.concatenate([[0], np.cumsum(T*T)])
    mu  = (cs[m:]-cs[:-m]) / m
    s2  = (cs2[m:]-cs2[:-m]) / m - mu*mu
    sig = np.sqrt(np.maximum(s2, 1e-12))
    def dist_profile(QT):
        d2 = 2*m*(1 - (QT - m*mu*mu[0]) / (m*sig*sig[0]))
        return np.sqrt(np.maximum(d2, 0))
    # first dot-product column via FFT sliding dot product
    QT0 = np.array([np.dot(T[i:i+m], T[0:m]) for i in range(n)])   # ref; FFT in prod
    QT = QT0.copy()
    MP = np.full(n, np.inf); MPI = np.full(n, -1, int)
    excl = m // 2
    for j in range(n):
        if j > 0:   # O(1) diagonal update of the whole column
            QT[1:] = QT[:-1] - T[:n-1]*T[j-1] + T[m:m+n-1]*T[j+m-1]
            QT[0]  = QT0[j]
        D = dist_profile_col(QT, mu, sig, m, j)
        lo, hi = max(0, j-excl), min(n, j+excl+1)
        D[lo:hi] = np.inf                          # exclusion zone
        idx = int(np.argmin(D))
        if D[idx] < MP[j]: MP[j], MPI[j] = D[idx], idx
    return MP, MPI
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `m` | int | domain | 4–n/4 | subsequence length | one natural cycle (e.g. 1 day) |
| `exclusion_zone` | int | ⌈m/2⌉ | 0–m | suppress trivial matches | keep ~m/2 |
| `k` | int | 3 | 1–20 | #motifs/discords reported | task-driven |
| `sample_pct` | float | 0.25 | 0–1 | PreSCRIMP sampling | ↑ accuracy of early profile |

**Worked numeric example.** `T=[0,1,2,3,0,1,2,3,7,1]`, `m=4`. Windows: W0=[0,1,2,3], W4=[0,1,2,3] are identical → after z-norm `d(0,4)=0` (perfect motif). The discord is the window containing the spike `7` (W6=[2,3,7,1]) — its nearest neighbor distance (`MP[6]`) is the largest. So motif pair `(0,4)` with `MP≈0`; discord at index 6.

**Complexity (derivation).** First column: one FFT convolution `O(n log n)`. Main loop: `n` diagonals, each updated in `O(1)` per element across `O(n)` elements → `O(n)` per column × `n` columns = `O(n²)`. **Space** `O(n)` (keep only current column + MP/MPI). SCRIMP++ has the same worst case but yields a useful approximate profile after the first `sample_pct` fraction.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Flat window `σ≈0` | div-by-zero in z-norm | floor `σ` at 1e-12; set distance to ∞ |
| Long series float drift | accumulating QT error | use float64; periodic FFT recompute |
| Negative `d²` from rounding | NaN sqrt | `max(d²,0)` clamp |
| Trivial self-match | MP≈0 everywhere | exclusion zone `m/2` |

**Unit-test oracle.** A series that is two concatenated copies of the same length-`m` random pattern (plus noise-free) must have `MP[0]=0` (or ≤1e-6) with `MPI[0]` pointing to the copy. A constant series → all `σ=0` → every MP entry is `∞`/skipped (verifies the flat-window guard). Cross-check `MP` against the brute-force `O(n²m)` z-normed distance for a small `n` — must match within 1e-6.

**Integration code-points.** Prefer **STUMPY** (`stumpy.stump`, GPU `stumpy.gpu_stump`) behind a **NEW** wrapper `matrix_profile.py`; routes through `gpu_backend.py` for CuPy. Motif index pairs → promoted into KGIK as recurring-pattern edges (RELATIONAL LAYER); discord indices → fed to the anomaly stage (D14) and SELF-IMPROVEMENT alerts. Motif subsequences → embedded and clustered by HDBSCAN (C9) into regime sets.

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

#### C11.+ DEPTH MILESTONE

**Full derivation.** DTW seeks the warping path `π=((i₁,j₁),...,(i_K,j_K))` minimizing `Σ_k c(i_k,j_k)` subject to boundary (`(1,1)→(n,m)`), monotonicity, and step constraints. The optimal-substructure property — the best path to `(i,j)` extends a best path to one of `(i−1,j),(i,j−1),(i−1,j−1)` — yields Bellman's recursion `D(i,j)=c(i,j)+min(...)`. This is dynamic programming over an `n×m` lattice. The **Sakoe–Chiba band** `|i−j|≤w` restricts the lattice to a diagonal strip, both pruning cost and forbidding pathological warps (e.g. matching all of `a` to one point of `b`). **Soft-DTW** replaces the hard `min` with the smooth `min_γ(x)=−γ log Σ exp(−x_i/γ)`, making the loss differentiable (gradient via the soft-argmin), enabling DTW as a training loss / barycenter objective. **LB_Keogh** lower-bounds DTW by enveloping the query with `±w` upper/lower bounds and summing exceedances — cheap `O(n)` pruning before the `O(nm)` full DP in k-NN.

**Runnable-quality pseudocode.**
```python
def dtw(a, b, *, w=None, znorm=True):
    import numpy as np
    a = np.asarray(a, float); b = np.asarray(b, float)
    if znorm:
        a = (a - a.mean())/(a.std() or 1.0); b = (b - b.mean())/(b.std() or 1.0)
    n, m = len(a), len(b)
    if w is None: w = int(np.ceil(0.1*max(n, m)))
    w = max(w, abs(n-m))                       # band must reach the corner
    INF = float("inf")
    D = np.full((n+1, m+1), INF); D[0, 0] = 0.0
    for i in range(1, n+1):
        jlo, jhi = max(1, i-w), min(m, i+w)
        for j in range(jlo, jhi+1):
            cost = (a[i-1]-b[j-1])**2
            D[i, j] = cost + min(D[i-1, j], D[i, j-1], D[i-1, j-1])
    return float(np.sqrt(D[n, m]))

def lb_keogh(query, candidate, w):             # fast pruning bound
    import numpy as np
    q = np.asarray(query); c = np.asarray(candidate); lb = 0.0
    for i in range(len(c)):
        lo = q[max(0,i-w):i+w+1].min(); hi = q[max(0,i-w):i+w+1].max()
        if c[i] > hi: lb += (c[i]-hi)**2
        elif c[i] < lo: lb += (c[i]-lo)**2
    return np.sqrt(lb)
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `w` (band) | int | ⌈0.1·max(n,m)⌉ | \|n−m\|–max(n,m) | warp flexibility / cost | ↓ to restrict warp, speed up |
| `metric` | str | sq-euclid | any | local cost | match data |
| `znorm` | bool | True | — | shape vs scale | True for shape similarity |
| `γ` (soft-DTW) | float | 0.1 | >0 | smoothing | ↓→hard DTW; ↑→smoother grad |

**Worked numeric example.** `a=[1,2,3]`, `b=[1,1,2,3]` (b is `a` with a stutter), `w=2`, no z-norm. The DP aligns `a[0]=1` to `b[0]=1` and `b[1]=1` (warp), then `2→2`, `3→3`; all matched costs are 0 → `D[3,4]=0` → `DTW=0`. Plain Euclidean (after padding) would be nonzero — DTW's elasticity absorbs the stutter.

**Complexity (derivation).** Full lattice fills `n·m` cells, each `O(1)` → `O(nm)`. Banded: only `~(2w+1)` cells per row × `n` rows → `O(n·w)`. Backtrack the path in `O(n+m)`. **Space** `O(nm)` for the full matrix, reducible to `O(min(n,m))` with the two-row rolling trick (if the path itself isn't needed). FastDTW gives approximate `O(n)` via multi-resolution.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Band too narrow vs `\|n−m\|` | INF at corner (no valid path) | `w=max(w,\|n−m\|)` |
| Scale mismatch | distance dominated by amplitude | z-normalize first |
| Pathological warp (singularities) | one point matches many | Sakoe–Chiba band; slope constraints |
| Large corpus k-NN slow | `O(corpus·nm)` | LB_Keogh prune, then full DTW on survivors |

**Unit-test oracle.** `dtw(a, a)=0` for any `a` (identity). `dtw([0,1,2],[0,1,2])=0`. Known shift: `dtw([0,0,1,1],[0,1,1,1], w=2, znorm=False)` — hand-computed DP gives `0` (the leading-zero stutter is absorbed). Symmetry: `dtw(a,b)=dtw(b,a)` within 1e-9.

**Integration code-points.** Prefer `tslearn`/`dtaidistance` or STUMPY's `stumpy.match` behind a **NEW** wrapper `dtw_retrieval.py`. Matches the current window against History-Lake motifs (cross-series complement to Matrix Profile's intra-series search). DTW distance is a feature for HDBSCAN (C9) and the kernel of an analog-forecasting retriever feeding FORECAST CORE. Distance-matrix idioms reuse `sim_methods.upgma`; batched NN routes through `gpu_backend.py`.

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

#### D12.+ DEPTH MILESTONE

**Full derivation.** The segmentation objective is `min_τ Σ_seg C(seg) + βK`. The DP `F(t)=min_{0≤τ<t}[F(τ)+C(y_{τ+1:t})+β]` is exact but `O(n²)`. The **pruning theorem** (Killick et al.): if the cost satisfies `C(y_{τ+1:t}) + C(y_{t+1:s}) ≤ C(y_{τ+1:s})` (a mild condition met by likelihood costs), then once `F(τ)+C(y_{τ+1:t}) ≥ F(t)` holds, `τ` can *never* be the optimal last change-point for any future `s>t` and is removed from the candidate set `R`. Because pruned points stay pruned, the amortized candidate-set size is `O(1)` under reasonable change-point density → near-linear total. Costs are `O(1)` via precomputed prefix sums: for the L2/mean-shift cost `C=Σ(y−ȳ)² = Σy² − (Σy)²/len`, both `Σy` and `Σy²` come from cumulative arrays.

**Runnable-quality pseudocode.**
```python
def pelt(y, *, penalty=None, min_size=2, cost="l2"):
    import numpy as np
    y = np.asarray(y, float); n = len(y)
    cs  = np.concatenate([[0], np.cumsum(y)])
    cs2 = np.concatenate([[0], np.cumsum(y*y)])
    def C(a, b):                                   # cost of y[a:b]
        ln = b - a
        if ln <= 0: return 0.0
        s, s2 = cs[b]-cs[a], cs2[b]-cs2[a]
        return s2 - s*s/ln                         # SSE (L2 / mean-shift)
    if penalty is None:
        sigma2 = max(y.var(), 1e-12)
        penalty = np.log(n) * sigma2               # BIC-style
    F = {0: -penalty}; last = {0: None}; R = [0]
    for t in range(min_size, n+1):
        best, arg = np.inf, None
        for tau in R:
            if t - tau < min_size: continue
            v = F[tau] + C(tau, t) + penalty
            if v < best: best, arg = v, tau
        F[t] = best; last[t] = arg
        R = [tau for tau in R if F[tau] + C(tau, t) <= F[t]] + [t]   # prune + add
    # backtrack
    cps, t = [], n
    while last.get(t):
        cps.append(last[t]); t = last[t]
    return sorted(c for c in cps if 0 < c < n)
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `penalty β` | float | log(n)·σ̂² (BIC) | >0 | #change-points | ↑ ⇒ fewer CPs |
| `cost` | str | l2 | {l2,normal,rbf} | what shift it detects | rbf for distributional |
| `min_size` | int | 2 | ≥1 | min segment length | ↑ to avoid spurious tiny segs |

**Worked numeric example.** `y=[0,0,0,0,5,5,5,5]` (clear mean shift at index 4). With BIC penalty: segmenting at `τ=4` gives total cost `C(0,4)+C(4,8)+2β = 0+0+2β`; no segmentation gives `C(0,8)+β = Σ(y−2.5)² + β = 50 + β`. Since `2β ≪ 50+β` for the small `β`, PELT returns change-point `[4]` with per-segment means `0` and `5`.

**Complexity (derivation).** Without pruning, `Σ_t |R_t| = Σ_t t = O(n²)`. Pruning bounds `E[|R_t|]=O(1)` (constant under geometric change spacing) → `O(n)`–`O(n log n)`. Each `C(a,b)` is `O(1)` (prefix sums). **Space** `O(n)` for `F,last,R` + prefix arrays.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Penalty too low | over-segmentation | raise β; use BIC/MBIC |
| Penalty too high | misses real CPs | lower β; validate on labeled breaks |
| Heteroscedastic series | L2 misreads variance shifts | use `normal`/`rbf` cost |
| Floating cumsum drift (long n) | tiny negative SSE | clamp `C≥0`; float64 |

**Unit-test oracle.** Step function `y=[1]*100+[10]*100` with default penalty must return exactly `[100]`. Pure constant `y=[3]*200` must return `[]` (no change-points). Two steps `[0]*50+[5]*50+[0]*50` → `[50,100]`. Compare against `ruptures.Pelt` on random data — change-point sets must match.

**Integration code-points.** Prefer `ruptures` (`rpt.Pelt`) behind a **NEW** wrapper `changepoint.py`. Offline/batch segmentation of History-Lake series; segment boundaries define stationary windows handed to ARIMA/GBM (A1/A3) fitting and label regimes for Error-Weighted-Ensemble (F18) switching. Complements BOCPD (D13, online). Cumulative-stat idioms reuse the numpy patterns in `prediction.py`.

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

#### D13.+ DEPTH MILESTONE

**Full derivation.** Let `r_t` = run length (steps since last change). The joint `P(r_t, x_{1:t})` factors recursively. Two events: (a) **growth** — no change, `r_t=r_{t−1}+1`, contributing `P(r_{t−1},x_{1:t−1})·π(x_t|r_{t−1})·(1−H(r_{t−1}))`; (b) **change** — `r_t=0`, summing over all previous run lengths times the hazard `H`. The hazard for a constant rate is `H(r)=1/λ` (geometric prior: `P(run length=r)=(1−1/λ)^r/λ`). `π(x_t|r)` is the **posterior predictive** of the segment model given the `r` observations since the last change. For a Gaussian with Normal-Inverse-Gamma prior, the posterior predictive is a **Student-t**: `x_t | x_{(t−r):t} ~ t_{2α_n}(μ_n, β_n(κ_n+1)/(α_n κ_n))` with the standard NIG sufficient-statistic updates `κ_n=κ_0+r, μ_n=(κ_0μ_0+rx̄)/κ_n, α_n=α_0+r/2, β_n=β_0+½Σ(x−x̄)²+κ_0 r(x̄−μ_0)²/(2κ_n)`. Closed form ⇒ no integration.

**Runnable-quality pseudocode.**
```python
def bocpd(stream, *, hazard_lambda=250, mu0=0., kappa0=1., alpha0=1., beta0=1.,
          threshold=0.5, R_max=500):
    import numpy as np
    from scipy.stats import t as student_t
    H = 1.0 / hazard_lambda
    # run-length posterior, NIG sufficient stats per run length
    P = np.array([1.0])
    mu, kap, al, be = ([mu0], [kappa0], [alpha0], [beta0])
    cps = []
    for i, x in enumerate(stream):
        # posterior predictive per run length (Student-t)
        df = 2*np.array(al)
        scale = np.sqrt(np.array(be)*(np.array(kap)+1)/(np.array(al)*np.array(kap)))
        pred = student_t.pdf(x, df=df, loc=np.array(mu), scale=scale)
        growth = P * pred * (1 - H)
        cp     = (P * pred * H).sum()
        newP   = np.concatenate([[cp], growth])
        newP  /= newP.sum()
        # update sufficient stats (prepend fresh r=0 prior, advance others)
        nmu  = [mu0]  + [(kap[j]*mu[j] + x)/(kap[j]+1) for j in range(len(mu))]
        nkap = [kappa0]+ [kap[j]+1 for j in range(len(kap))]
        nal  = [alpha0]+ [al[j]+0.5 for j in range(len(al))]
        nbe  = [beta0] + [be[j] + kap[j]*(x-mu[j])**2/(2*(kap[j]+1)) for j in range(len(be))]
        # truncate run lengths for bounded cost
        if len(newP) > R_max:
            newP, nmu, nkap, nal, nbe = (a[:R_max] for a in (list(newP),nmu,nkap,nal,nbe))
            newP = np.array(newP)/np.sum(newP)
        P, mu, kap, al, be = np.array(newP), nmu, nkap, nal, nbe
        if P[0] > threshold: cps.append(i)
    return cps
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `hazard_lambda` | float | 250 | 10–10000 | expected run length | ↑ ⇒ rarer CPs |
| `mu0,kappa0,alpha0,beta0` | float | 0,1,1,1 | priors | segment model prior | set on standardized data |
| `threshold` | float | 0.5 | (0,1) | CP flag on P(r=0) | ↑ ⇒ fewer flags |
| `R_max` | int | 500 | 50–5000 | run-length truncation | bound memory/cost |

**Worked numeric example.** Standardized stream `[0,0,0,0,...,3,3,3,...]` with `λ=250`. While stable, `P(r=0)` stays tiny (predictive favors growth). At the first `x=3` after a run of zeros, the Student-t predictive under the long run assigns very low likelihood, so the change branch `P(r=0)` spikes (e.g. to ~0.8 > threshold) → change-point emitted at that index; run length resets and grows again.

**Complexity (derivation).** Naive: at step `t` the run-length vector has length `t` → `O(t)` per step, `O(n²)` total. With `R_max` truncation or `ε`-pruning, vector length is bounded → `O(R_max)` per step, `O(n·R_max)` total. **Space** `O(R_max)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Underflow in long products | `P` collapses to 0 | work in log-space (logsumexp) |
| Unbounded run-length growth | memory/time blow-up | `R_max` truncation + `ε`-prune low mass |
| Misscaled priors | over/under-sensitive | standardize input; tune `β0` |
| Heavy tails vs Gaussian predictive | false change flags | use t-predictive (already), or robust model |

**Unit-test oracle.** Pure i.i.d. `N(0,1)` stream of length 1000 with `λ=250`: expected number of flagged change-points ≈ `1000/250 = 4` (order of magnitude; should not flag dozens). A single hard step (mean 0→10 at index 500) must produce a sharp `P(r=0)` spike at ~500 and a MAP run length that resets there. Stable constant stream → `P(r=0)` never exceeds threshold.

**Integration code-points.** **NEW** pure-numpy `bocpd.py` (reference `bayesian_changepoint_detection`). Runs **online** on live History-Lake feeds; a fresh change-point invalidates current forecasts → triggers SELF-IMPROVEMENT retrain/re-weight and resets Error-Weighted-Ensemble (F18) error windows; the VERIFIER appends a "regime change detected" caveat. Complements PELT (D12, offline). Defensive numpy patterns reuse `prediction.py`.

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

#### D14.+ DEPTH MILESTONE

**Full derivation.** Anomalies are "few and different," so a random axis-parallel partition isolates them in fewer cuts. The path length `h(x)` to isolate `x` in a random binary tree is analogous to an unsuccessful BST search; its expectation over random trees relates to the data structure's average depth. The normalization `c(n)=2H(n−1)−2(n−1)/n` (with `H` the harmonic number) is the **average path length of an unsuccessful BST search on `n` nodes** — it makes scores comparable across sample sizes. The score `s(x)=2^{−E[h(x)]/c(n)}` maps short paths (anomalies) to `s→1` and long paths (normal) to `s→0.5`. Using subsamples of size `ψ` and `max_depth=⌈log₂ψ⌉` both speeds training and mitigates **swamping** (normal points flagged due to large dense regions) and **masking** (anomaly clusters hiding each other) by limiting how much structure each tree sees.

**Runnable-quality pseudocode.**
```python
import numpy as np
def c_factor(n):
    if n <= 1: return 0.0
    return 2.0*(np.log(n-1)+0.5772156649) - 2.0*(n-1)/n      # harmonic ≈ ln+γ

def build_itree(X, depth, max_depth, rng):
    n = len(X)
    if depth >= max_depth or n <= 1:
        return {"size": n}
    f = rng.integers(X.shape[1])
    lo, hi = X[:, f].min(), X[:, f].max()
    if lo == hi: return {"size": n}
    v = rng.uniform(lo, hi)
    mask = X[:, f] < v
    return {"f": f, "v": v,
            "L": build_itree(X[mask], depth+1, max_depth, rng),
            "R": build_itree(X[~mask], depth+1, max_depth, rng)}

def path_len(x, node, depth=0):
    if "f" not in node:                       # leaf
        return depth + c_factor(node["size"])  # adjust for unsplit leaf size
    nxt = node["L"] if x[node["f"]] < node["v"] else node["R"]
    return path_len(x, nxt, depth+1)

def isolation_forest(X, *, n_estimators=100, max_samples=256, seed=0):
    rng = np.random.default_rng(seed); X = np.asarray(X, float)
    psi = min(max_samples, len(X)); md = int(np.ceil(np.log2(max(psi,2))))
    trees = [build_itree(X[rng.choice(len(X), psi, replace=False)], 0, md, rng)
             for _ in range(n_estimators)]
    cn = c_factor(psi)
    scores = np.array([2**(-np.mean([path_len(x,t) for t in trees])/cn) for x in X])
    return scores       # ~1 anomaly, ~0.5 normal
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `n_estimators` | int | 100 | 50–500 | #trees, score stability | ↑ smooths scores |
| `max_samples ψ` | int | 256 | 64–1024 | subsample per tree | 256 is paper sweet spot |
| `max_features` | float | 1.0 | (0,1] | features per split | <1 for high-d |
| `contamination` | float/auto | auto | (0,0.5) | label threshold | set to expected anomaly rate |
| `random_state` | int | fixed | any | reproducibility | fix in prod |

**Worked numeric example.** `X` = 1000 points `N(0, I₂)` plus one outlier at `(10,10)`. Mean path length for the outlier ≈ 2–3 splits (isolated immediately) vs ≈ `c(256)≈10.2` for inliers. Outlier score `≈ 2^{−2.5/10.2} = 0.844` (near 1 ⇒ anomaly); inliers `≈ 2^{−10/10.2} = 0.506` (≈0.5 ⇒ normal). Threshold at 0.6 cleanly flags only the outlier.

**Complexity (derivation).** Building one tree on `ψ` points: average depth `O(log ψ)`, each level partitions `ψ` points → `O(ψ log ψ)`; `t` trees → `O(t·ψ log ψ)`. Scoring one point: traverse `t` trees of depth `O(log ψ)` → `O(t log ψ)`; **sublinear in `n`** (training subsamples). **Space** `O(t·ψ)` (tree nodes).

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Constant feature | `lo==hi`, no valid split | return leaf early (handled) |
| Mixed-unit features | split granularity skew | standardize per feature |
| Swamping/masking | wrong flags in dense data | subsampling `ψ`; default 256 |
| Highly correlated dims | axis-parallel cuts weak | use Extended Isolation Forest |

**Unit-test oracle.** `c_factor(256)≈10.244` (compute against `2(ln255+γ)−2·255/256`). A dataset of 1 inlier blob + 1 extreme outlier must give the outlier the maximum score, strictly greater than every inlier's score (with fixed seed, deterministic). `c_factor(1)=0`, `c_factor(2)=2(ln1+γ)−1=2·0.5772−1=0.1544`.

**Integration code-points.** `sklearn.ensemble.IsolationForest` behind a **NEW** wrapper `anomaly_screen.py`. Reuses the sklearn usage pattern in `ai_model.py` (RF/GB/MLP on the Yeh dataset). Input = engineered multivariate features (returns, volatility, Matrix-Profile discord scores from C10, forecast residuals); flags → VERIFIER caveats + SELF-IMPROVEMENT outlier handling. Complements C10's univariate-shape discords with multivariate point anomalies.

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

#### E15.+ DEPTH MILESTONE

**Full derivation.** Under the null "`X` does not Granger-cause `Y`," the extra regressors `b_1..b_L` are jointly zero. The F-test compares nested OLS models: restricted (Y on its own lags, RSS_R, `T−L−1` residual df) vs unrestricted (adds X lags, RSS_U, `T−2L−1` df). The statistic `F=((RSS_R−RSS_U)/L)/(RSS_U/(T−2L−1))` follows `F(L, T−2L−1)` under Gaussian errors because `(RSS_R−RSS_U)/σ²~χ²_L` and `RSS_U/σ²~χ²_{T−2L−1}` are independent (Cochran's theorem). A significant `F` means the X-lags explain variance beyond Y's own past — *predictive* causality. Stationarity is required because OLS on integrated (unit-root) series produces spurious significance (Granger–Newbold). The Toda–Yamamoto extension fits a VAR in levels with `L+d_max` lags and Wald-tests only the first `L`, sidestepping pretesting bias for integrated series.

**Runnable-quality pseudocode.**
```python
def granger_test(X, Y, *, max_lag=None, alpha=0.05):
    import numpy as np
    from scipy.stats import f as f_dist
    X = np.asarray(X, float); Y = np.asarray(Y, float); T0 = len(Y)
    max_lag = max_lag or max(1, int(np.ceil(T0**(1/3))))
    def ensure_stationary(z, dmax=2):
        from statsmodels.tsa.stattools import adfuller
        d = 0
        while d < dmax and adfuller(z)[1] > 0.05:
            z = np.diff(z); d += 1
        return z, d
    X, _ = ensure_stationary(X); Y, _ = ensure_stationary(Y)
    n = min(len(X), len(Y)); X, Y = X[-n:], Y[-n:]
    best = {"p": 1.0, "F": 0.0, "lag": None}
    for L in range(1, max_lag+1):
        T = n - L
        yt = Y[L:]
        Yl = np.column_stack([Y[L-k-1:n-k-1] for k in range(L)])
        Xl = np.column_stack([X[L-k-1:n-k-1] for k in range(L)])
        def rss(A):
            A = np.column_stack([np.ones(T), A])
            beta, *_ = np.linalg.lstsq(A, yt, rcond=None)
            r = yt - A@beta; return float(r@r)
        RSS_R = rss(Yl); RSS_U = rss(np.column_stack([Yl, Xl]))
        df2 = T - 2*L - 1
        if df2 <= 0: continue
        F = ((RSS_R - RSS_U)/L) / (RSS_U/df2)
        p = 1 - f_dist.cdf(F, L, df2)
        if p < best["p"]: best = {"p": p, "F": F, "lag": L}
    best["granger_causes"] = best["p"] < alpha
    return best
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `max_lag` | int | ⌈T^{1/3}⌉ | 1–T/4 | candidate lags | AIC/BIC selection |
| `alpha` | float | 0.05 | (0,1) | significance | BH-correct over pairs |
| diff order `d` | int | auto (ADF) | 0–2 | stationarization | cap at 2 |

**Worked numeric example.** Construct `Y_t = 0.5 Y_{t−1} + 0.8 X_{t−1} + ε`, `X` i.i.d., T=500. Granger test X→Y at L=1: `RSS_U ≪ RSS_R` (X-lag explains lots) → large `F` (e.g. >100), `p<1e-10` → `granger_causes=True`. Reverse Y→X: `F≈small`, `p>0.05` → not significant. Correctly recovers the one-way coupling.

**Complexity (derivation).** Per lag `L`: two OLS solves on `T×(≈L)` and `T×(≈2L)` design matrices → `O(T·L²)` each (normal equations / QR). Over lags `1..max_lag`: `O(max_lag²·T·max_lag)≈O(T·max_lag³)` worst. Pairwise over `S` series: `O(S²·...)`. **Space** `O(T·max_lag)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Non-stationary inputs | spurious significance | ADF/KPSS + differencing first |
| Collinear lags | singular normal matrix | `lstsq`/pinv (rank-robust) |
| Multiple testing over S² pairs | false discoveries | Benjamini–Hochberg FDR |
| Confounding/common driver | "causality" that's correlation | frame as "Granger-predictive," pair with CCM |

**Unit-test oracle.** Independent white-noise `X,Y` (T=1000): p-value should be ~Uniform(0,1) → not significant at 0.05 in ~95% of seeds (calibration check). The constructed `Y_t=0.8X_{t−1}+ε` example above must yield `p<0.01` for X→Y and `p>0.05` for Y→X. Cross-check `F`/`p` against `statsmodels.grangercausalitytests` (match within numerical tolerance).

**Integration code-points.** `statsmodels.tsa.stattools.grangercausalitytests` behind a **NEW** wrapper `causal_screen.py`; OLS idioms reuse `np.linalg.lstsq` as in `prediction.py:fit_growth_series` (`/home/user/jarvis-app/server/services/prediction.py:491`). Significant `X→Y` (post BH-correction) becomes a candidate ARIMAX exogenous regressor (A3) and a candidate KGIK edge (RELATIONAL LAYER) pending SELF-IMPROVEMENT confirmation.

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

#### E16.+ DEPTH MILESTONE

**Full derivation (Takens).** Takens' embedding theorem: for a generic observation function on a `q`-dimensional attractor, the delay map `Ŷ(t)=[Y_t, Y_{t−τ}, ..., Y_{t−(E−1)τ}]` with `E>2q` is a diffeomorphism onto a reconstruction (shadow) manifold `M_Y` that preserves the attractor's topology. If `X` and `Y` belong to the *same* dynamical system and `X` drives `Y`, then information about `X` is encoded in `Y`'s trajectory, so `M_Y` can recover `X`'s states — **cross-mapping**. The estimator finds the `E+1` simplex neighbors of `Ŷ(t)` (minimal set to bound a simplex in `E`-space), weights them by `w_i=exp(−d_i/d_1)/Σexp(...)` (normalized, `d_1`=nearest distance), and predicts `X̂(t)=Σ w_i X(t_i)`. **Convergence** — `ρ(L)=corr(X̂,X)` rising and saturating as library length `L→T` — is the signature of causation: more data fills `M_Y` so the local neighborhoods shrink and prediction improves. Direction asymmetry (`X→Y` converges but `Y→X` doesn't) distinguishes driver from response. Note the (initially counterintuitive) direction: `X` causing `Y` means `X` is *cross-mappable from* `M_Y`.

**Runnable-quality pseudocode.**
```python
def ccm(X, Y, *, E=3, tau=1, lib_sizes=None, seed=0):
    import numpy as np
    from scipy.spatial import cKDTree
    rng = np.random.default_rng(seed)
    X = (np.asarray(X,float)-np.mean(X))/(np.std(X) or 1)
    Y = (np.asarray(Y,float)-np.mean(Y))/(np.std(Y) or 1)
    def embed(Z):
        idx = np.arange((E-1)*tau, len(Z))
        return np.column_stack([Z[idx - k*tau] for k in range(E)]), idx
    MY, tidx = embed(Y)                      # cross-map X from M_Y
    Xt = X[tidx]
    if lib_sizes is None:
        lib_sizes = np.linspace(E+2, len(MY), 8, dtype=int)
    rhos = []
    for L in lib_sizes:
        lib = rng.choice(len(MY), L, replace=False)
        tree = cKDTree(MY[lib])
        d, nn = tree.query(MY, k=E+1)
        d = np.maximum(d, 1e-12)
        w = np.exp(-d / d[:, :1]); w /= w.sum(1, keepdims=True)
        Xhat = (w * Xt[lib][nn]).sum(1)
        rhos.append(float(np.corrcoef(Xhat, Xt)[0, 1]))
    converges = rhos[-1] > rhos[0] + 0.1 and rhos[-1] > 0.3
    return {"lib_sizes": list(map(int, lib_sizes)), "rho": rhos,
            "converges": bool(converges)}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `E` | int | 3 | 1–10 | embedding dim | pick max simplex-projection skill |
| `tau` | int | 1 | 1–20 | delay | first ACF/mutual-info minimum |
| `lib_sizes` | list | E+2..T | — | convergence sweep | dense near small L |
| neighbors | int | E+1 | E+1 | simplex size | fixed by theory |

**Worked numeric example.** Coupled logistic map `X_{t+1}=X_t(3.8−3.8X_t−0.02Y_t)`, `Y_{t+1}=Y_t(3.5−3.5Y_t−0.1X_t)` (X drives Y strongly). Cross-mapping X from `M_Y`: `ρ` rises from ~0.4 (L=20) to ~0.9 (L=2000) — converges → X causes Y. Cross-mapping Y from `M_X`: `ρ` stays ~0.5 flat → weak/no Y→X. Asymmetry confirms direction.

**Complexity (derivation).** Per library size `L`: build KD-tree `O(L log L)`, query all `N` points for `E+1` neighbors `O(N·E log L)`, predict `O(N·E)`. Over `|lib_sizes|` sizes and both directions → multiply. **Space** `O(N·E)` (embedding) + tree.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Stochastic/noisy data | false convergence | require simplex determinism check first; surrogate test |
| Under/over-embedding | distorted manifold | choose E by prediction skill |
| Short series | unstable ρ | need long, low-noise data |
| Synchrony (strong coupling) | both directions converge | report as "bidirectional/synchronized" |

**Unit-test oracle.** Two **independent** logistic maps (no coupling): `ρ(L)` must stay flat and low (no convergence) in both directions → `converges=False`. A one-way coupled pair must converge only in the driver→response direction. Surrogate (phase-shuffled) data must destroy convergence.

**Integration code-points.** **NEW** `ccm.py` (numpy + `scipy.spatial.cKDTree`; reference pyEDM/skccm). Screens **nonlinear** couplings Granger (E15) misses; converged links → candidate KGIK edges typed "nonlinear coupling." Run alongside Granger for linear+nonlinear coverage. Batched NN can route through `gpu_backend.py` at scale.

---

### E16b. Transfer Entropy (information-theoretic directed coupling) — **NEW ALGORITHM**

**Purpose.** Model-free, **nonlinear** directed information flow: how much knowing `X`'s past reduces uncertainty about `Y`'s future beyond `Y`'s own past. The information-theoretic generalization of Granger (they coincide for Gaussian variables). Third leg of the causal-screen trio (linear Granger E15, dynamical CCM E16, information-theoretic TE).

**Math.** Transfer entropy from `X` to `Y` with history lengths `k,l`:
```
TE_{X→Y} = Σ p(y_{t+1}, y_t^{(k)}, x_t^{(l)}) · log[ p(y_{t+1} | y_t^{(k)}, x_t^{(l)}) / p(y_{t+1} | y_t^{(k)}) ]
         = I(Y_{t+1} ; X_t^{(l)} | Y_t^{(k)})            (conditional mutual information)
```
where `y_t^{(k)}=(y_t,...,y_{t−k+1})`. `TE_{X→Y}>0` ⇔ X's past adds predictive information about Y's next value given Y's own past. It is **directed** (`TE_{X→Y}≠TE_{Y→X}`) and captures arbitrary nonlinear dependence.

**Derivation.** TE is the Kullback–Leibler divergence between the full transition `p(y_{t+1}|y_t^{(k)},x_t^{(l)})` and the reduced `p(y_{t+1}|y_t^{(k)})`, averaged over states. Writing it as conditional mutual information `I(Y_{t+1};X^{(l)}|Y^{(k)})` shows it is non-negative (CMI≥0) and zero iff `Y_{t+1} ⟂ X^{(l)} | Y^{(k)}` — exactly the conditional-independence statement of "no information flow." For jointly Gaussian variables, `TE_{X→Y} = ½ ln(RSS_R/RSS_U)` which is a monotone transform of the Granger F-statistic — proving TE ⊇ Granger.

**Runnable-quality pseudocode (KSG estimator, k-NN, bias-reduced).**
```python
def transfer_entropy(X, Y, *, k_hist=1, l_hist=1, knn=4, seed=0):
    import numpy as np
    from scipy.spatial import cKDTree
    from scipy.special import digamma
    X = np.asarray(X,float); Y = np.asarray(Y,float)
    m = (k_hist if k_hist>l_hist else l_hist)
    yf = Y[m:]                                   # Y_{t+1}
    Yp = np.column_stack([Y[m-1-i:len(Y)-1-i] for i in range(k_hist)])  # Y past
    Xp = np.column_stack([X[m-1-i:len(X)-1-i] for i in range(l_hist)])  # X past
    yf = yf[:len(Yp)]
    # TE = I(yf ; Xp | Yp) via KSG conditional MI (Frenzel-Pompe)
    joint = np.column_stack([yf.reshape(-1,1), Yp, Xp])
    tree_j = cKDTree(joint)
    eps = tree_j.query(joint, k=knn+1)[0][:, -1]    # distance to k-th neighbor
    def count(space):
        t = cKDTree(space)
        return np.array([len(t.query_ball_point(p, r-1e-12))-1
                         for p, r in zip(space, eps)])
    n_yYp = count(np.column_stack([yf.reshape(-1,1), Yp]))
    n_XpYp= count(np.column_stack([Xp, Yp]))
    n_Yp  = count(Yp if Yp.size else np.zeros((len(yf),1)))
    te = digamma(knn) + np.mean(digamma(n_Yp+1) - digamma(n_yYp+1) - digamma(n_XpYp+1))
    return max(float(te), 0.0)                    # CMI is non-negative
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `k_hist` | int | 1 | 1–10 | target history length | ACF/embedding skill |
| `l_hist` | int | 1 | 1–10 | source history length | match expected lag |
| `knn` | int | 4 | 3–10 | KSG neighbor count | ↑ less variance, more bias |
| estimator | str | KSG | {KSG,binning} | density method | KSG for continuous data |

**Worked numeric example.** `Y_{t+1}=0.7 X_t + 0.2 Y_t + ε` (X drives Y), T=2000. `TE_{X→Y} ≈ 0.45 nats` (clearly positive); `TE_{Y→X} ≈ 0.01 nats` (≈0, within noise). Directionality and magnitude recovered. For independent series both ≈0.

**Complexity (derivation).** KSG builds KD-trees on the joint and three marginal spaces (`O(N log N)` each) and does `O(N)` range queries (`O(log N)` each) → `O(N log N)` overall. **Space** `O(N·(k+l))`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Finite-sample bias | TE>0 for independent data | use KSG (bias-reduced); permutation null |
| Wrong history lengths | missed/spurious flow | select `k,l` by embedding criteria |
| High dimensionality | neighbor sparsity | keep `k+l` small; more data |
| Negative estimate (rounding) | small negative TE | clamp at 0 (CMI≥0) |

**Unit-test oracle.** Independent Gaussian white noise `X,Y` (T=5000): `TE_{X→Y}≈0±0.02` and `TE_{Y→X}≈0±0.02` (permutation test p>0.05). For jointly Gaussian linear coupling, TE must match the analytic `½ln(RSS_R/RSS_U)` (the Granger equivalence) within estimator error — a strong cross-check against E15.

**Integration code-points.** **NEW** `transfer_entropy.py` (numpy + `scipy.spatial`, KSG estimator; reference `pyinform`/`JIDT`). Third causal-screen leg in `causal_screen.py` alongside Granger (E15) and CCM (E16): a link counts as a candidate KGIK edge only if it passes a permutation-null significance test; agreement across the three estimators raises edge confidence. Significant directed TE → candidate ARIMAX exogenous driver (A3). Honest framing: "directed information flow," not mechanistic proof.

**Source.** Schreiber 2000, *Measuring Information Transfer*, *Phys. Rev. Lett.* 85; https://doi.org/10.1103/PhysRevLett.85.461 · KSG estimator Kraskov et al. 2004 https://doi.org/10.1103/PhysRevE.69.066138 · `pyinform` https://elife-asu.github.io/PyInform/ · JIDT https://github.com/jlizier/jidt

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

#### E17.+ DEPTH MILESTONE

**Full derivation.** PSI is the **symmetrized KL divergence** between the reference and current binned distributions. The standard (forward) KL is `Σ c_b ln(c_b/r_b)`; reverse is `Σ r_b ln(r_b/c_b)`. Adding them: `Σ (c_b−r_b)(ln c_b − ln r_b) = Σ (c_b−r_b) ln(c_b/r_b)` — exactly the PSI formula. So PSI = `KL(c‖r)+KL(r‖c)` = **Jeffreys divergence**, which is why it is symmetric in reference/current and always ≥0 (each term `(c−r)ln(c/r)` is non-negative since `c−r` and `ln(c/r)` share sign). The `<0.1 / 0.1–0.2 / >0.2` thresholds are industry heuristics (roughly: small/moderate/large population shift), not from a sampling distribution — for a principled test, bootstrap PSI under the null or use a chi-square two-sample test.

**Runnable-quality pseudocode (as implemented + quantile-bin option).**
```python
def psi(reference, current, *, bins=10, quantile=True, eps=1e-6):
    import numpy as np
    ref = np.asarray(reference, float); cur = np.asarray(current, float)
    if quantile:
        edges = np.quantile(ref, np.linspace(0, 1, bins+1))
        edges[0], edges[-1] = -np.inf, np.inf
        edges = np.unique(edges)
    else:
        edges = np.histogram_bin_edges(ref, bins=bins)
    r = np.histogram(ref, edges)[0] / max(len(ref), 1)
    c = np.histogram(cur, edges)[0] / max(len(cur), 1)
    r = np.clip(r, eps, None); c = np.clip(c, eps, None)
    val = float(np.sum((c - r) * np.log(c / r)))
    band = "stable" if val < 0.1 else ("moderate" if val < 0.2 else "significant")
    return {"psi": val, "drift": val > 0.2, "band": band}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `bins` | int | 10 | 5–50 | resolution | ↑ sensitivity, ↑ noise |
| `quantile` | bool | True | — | bin scheme | quantile for skewed data |
| threshold | float | 0.2 | 0.1–0.25 | drift flag | 0.1 for high-sensitivity monitors |
| `eps` | float | 1e-6 | >0 | empty-bin floor | avoid log(0) |

**Worked numeric example.** `reference~N(0,1)`, `current~N(0.5,1)` (mean shift), 10 quantile bins. Lower bins lose mass (`c<r`), upper bins gain (`c>r`); summing `(c−r)ln(c/r)` gives `PSI≈0.12` → "moderate" drift. Same vs `current~N(1.5,1)` → `PSI≈0.9` → "significant."

**Complexity (derivation).** Quantile edges sort the reference `O(N_ref log N_ref)`; two histograms `O(N)`; bin sum `O(bins)`. **Time** `O(N log N)`, **space** `O(bins)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Empty current bin | `ln(0)=−∞` | clip to `eps` (already done) |
| Few samples | unstable PSI | fewer bins; bootstrap CI |
| Different bin edges for ref/cur | invalid comparison | always use reference-defined edges |
| Skewed data + equal-width bins | most mass in one bin | use quantile bins |

**Unit-test oracle.** Identical distributions (`current==reference`): `PSI=0` exactly (each `c_b=r_b` ⇒ term 0). Disjoint distributions (no overlap) → large PSI driven by `eps` floors. Symmetry: `psi(a,b)≈psi(b,a)` (Jeffreys property) — must hold within binning artifacts.

**Integration code-points.** **ALREADY EXISTS** — `drift_detector()` at `/home/user/jarvis-app/underworld/server/services/ai_models.py:74`. SELF-IMPROVEMENT drift monitor (§08): PSI on incoming feature feeds and on forecast-error distributions → retrain/re-weight trigger; pairs with `calibration_error()` (ECE, line 85) and CRPS (F20). Drift event resets Error-Weighted-Ensemble (F18) windows and may trigger BOCPD-style caveats.

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

#### F18.+ DEPTH MILESTONE

**Full derivation.** The softmax weighting `w_k=exp(−γ e_k/ē)/Σ_j exp(−γ e_j/ē)` is the solution to `max_w Σ_k w_k(−e_k/ē) + (1/γ)H(w)` where `H(w)=−Σ w_k ln w_k` is the entropy regularizer — i.e. **maximum-entropy weighting subject to an expected-error budget**. Large `γ` (low temperature) concentrates weight on the best member (winner-take-all); `γ→0` gives uniform weights. This is the multiplicative-weights / Hedge family from online learning, whose regret vs the best fixed expert is `O(√(T log K))` — the ensemble provably tracks the best member up to that bound. Normalizing by `ē` makes `γ` scale-free across different error magnitudes. For predictive quantiles, the combined CDF is the `w`-weighted mixture `F(z)=Σ_k w_k F_k(z)`; its quantiles are found by inverting the mixture (not by averaging member quantiles, which is only exact for the median under symmetry).

**Runnable-quality pseudocode.**
```python
def error_weighted_ensemble(member_forecasts, member_errors, *, gamma=2.0,
                            w_floor=0.01, quantile_levels=(.1,.25,.5,.75,.9)):
    import numpy as np
    ks = list(member_forecasts)
    e  = np.array([member_errors[k] for k in ks], float)
    present = np.isfinite(e)
    e = e[present]; ks = [k for k,p in zip(ks, present) if p]
    ebar = e.mean() or 1.0
    z = -gamma * e / ebar
    z -= z.max()                                   # stable softmax
    w = np.exp(z); w /= w.sum()
    w = np.maximum(w, w_floor); w /= w.sum()       # floor + renorm (keep diversity)
    point = float(sum(wk*member_forecasts[k]["point"] for wk,k in zip(w,ks)))
    # weighted-mixture quantiles via fine grid inversion of mixture CDF
    grid = np.linspace(min(member_forecasts[k]["quantiles"][min(quantile_levels)] for k in ks),
                       max(member_forecasts[k]["quantiles"][max(quantile_levels)] for k in ks), 2000)
    def member_cdf(k, x):
        q = member_forecasts[k]["quantiles"]
        xs = np.array(sorted(q)); ys = np.array([q[s] for s in sorted(q)])
        return np.interp(x, ys, xs)               # level at value x
    mix = sum(wk*np.array([member_cdf(k, g) for g in grid]) for wk,k in zip(w,ks))
    out_q = {lvl: float(grid[np.searchsorted(mix, lvl)]) for lvl in quantile_levels}
    return {"point_estimate": point, "quantiles": out_q,
            "weights": dict(zip(ks, w.tolist()))}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `gamma` | float | 2.0 | 0–10 | temperature | ↑ ⇒ winner-take-all |
| `lambda` (error EWMA) | float | 0.3 | (0,1) | error memory | ↑ faster adaptation |
| `W` (window) | int | 30 | 10–200 | trailing error window | match drift speed |
| `w_floor` | float | 0.01 | 0–0.1 | min weight | keeps diversity |

**Worked numeric example.** 3 members with recent RMSE `e=[1.0, 2.0, 4.0]`, `γ=2`, `ē=2.33`. `z=−2·[1,2,4]/2.33=[−0.857,−1.714,−3.429]`; after subtract-max `[0,−0.857,−2.571]`; `exp=[1,0.424,0.0764]`; sum`=1.500`; `w=[0.667,0.283,0.051]`. Floor 0.01 unchanged. Point `=0.667·ŷ₁+0.283·ŷ₂+0.051·ŷ₃` — best member dominates but others retain influence.

**Complexity (derivation).** Weight computation `O(K)`. Mixture-quantile inversion uses a grid of `G` points evaluating `K` member CDFs → `O(K·G)`. For point-only combination it is `O(K)`. **Space** `O(K+G)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Softmax overflow | inf weights | subtract max (done) |
| One member dominates permanently | loss of diversity | `w_floor`; reset on change-point |
| Missing member forecast | broken sum | drop & renormalize over present |
| Stale errors after regime change | wrong weights | reset error windows on BOCPD/PELT event |

**Unit-test oracle.** Equal errors `e=[1,1,1]` ⇒ `w=[1/3,1/3,1/3]` exactly (uniform), so the combined point = simple average. One perfect member (`e=[0, 1, 1]`, `γ` large) ⇒ its weight →1 (up to floor). Weights must always sum to 1.0±1e-9.

**Integration code-points.** **NEW** combiner `ensemble.py`. Reads member forecasts (A1–A5, G21) and their recent realized errors tracked by SELF-IMPROVEMENT (`08_SELF_IMPROVEMENT_AND_MLOPS.md`); reuses `ai_models.uncertainty_estimate()` (`/home/user/jarvis-app/underworld/server/services/ai_models.py:103`) for ensemble mean/std. Output feeds EnbPI (F19) for final interval calibration; weights are surfaced as VERIFIER drivers.

---

### F18b. EWMA & EWMA-Variance (RiskMetrics) — **NEW ALGORITHM**

**Purpose.** Exponentially-weighted moving average of level and of squared returns — the lightweight, online volatility/level tracker. Used to compute the "recent error" that drives the Error-Weighted Ensemble (F18), to estimate time-varying volatility for GBM bands (A1), and as a fast trend baseline. RiskMetrics' EWMA variance is the industry volatility standard.

**Math.**
```
EWMA level:    μ_t = λ x_t + (1−λ) μ_{t−1}              (= SES, A2's degenerate case)
EWMA variance: σ²_t = λ r_t² + (1−λ) σ²_{t−1}           (RiskMetrics, r_t = return)
EWMA control limits: μ_t ± L·σ_{ewma}·√(λ/(2−λ))         (Roberts 1959 EWMA chart)
```

**Derivation.** Unrolling `μ_t=λΣ_{k≥0}(1−λ)^k x_{t−k}` shows EWMA is an IIR low-pass filter with geometric weights summing to 1. The **effective window** (center of mass) is `(1−λ)/λ`, and the "span" convention used by pandas is `λ=2/(span+1)`. For the EWMA variance, taking expectations of the recursion at stationarity gives `E[σ²_t]=σ²` (unbiased for constant volatility) while reacting to clustering — the basis of RiskMetrics' choice `λ=0.94` (daily). The control-limit factor `√(λ/(2−λ))` is the asymptotic standard deviation of the EWMA statistic (variance of a geometric-weighted sum of unit-variance innovations).

**Runnable-quality pseudocode.**
```python
def ewma(x, *, lam=0.3, var_lambda=0.94, L=3.0):
    import numpy as np
    x = np.asarray(x, float)
    mu = np.empty_like(x); mu[0] = x[0]
    for t in range(1, len(x)):
        mu[t] = lam*x[t] + (1-lam)*mu[t-1]
    r = np.diff(np.log(np.clip(x, 1e-12, None))) if (x > 0).all() else np.diff(x)
    var = np.empty(len(r)); var[0] = r[0]**2
    for t in range(1, len(r)):
        var[t] = var_lambda*r[t]**2 + (1-var_lambda)*var[t-1]
    sigma = np.sqrt(var)
    cl = L*sigma[-1]*np.sqrt(lam/(2-lam))
    return {"ewma_level": mu.tolist(), "ewma_vol": sigma.tolist(),
            "upper": (mu[-1]+cl), "lower": (mu[-1]-cl)}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `lam` (level) | float | 0.3 | (0,1) | level smoothing | span `=2/λ−1`; ↑ for fast level |
| `var_lambda` | float | 0.94 | (0,1) | vol memory | 0.94 daily / 0.97 monthly (RiskMetrics) |
| `L` | float | 3.0 | 2–4 | control-limit width | 3σ ≈ 99.7% under normality |

**Worked numeric example.** `x=[10,11,9,12,10]`, `λ=0.5`. `μ=[10, 10.5, 9.75, 10.875, 10.4375]`. The EWMA reacts to each move at half-weight — smoother than raw, faster than a long SMA. With `var_lambda=0.94` on returns, the volatility estimate up-ticks after the 9→12 jump and decays back.

**Complexity (derivation).** Single forward pass, `O(1)` per step → `O(T)` time. **Space** `O(1)` for streaming (or `O(T)` if storing the series).

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Initialization bias | early values off | bias-correct `μ_t/(1−(1−λ)^t)` (pandas `adjust=True`) |
| `λ` too small | sluggish, misses shifts | raise `λ`; pair with CUSUM |
| Non-positive prices for log-returns | log error | guard `clip`/use raw diffs |

**Unit-test oracle.** Constant series `x=[5]*100`, any `λ` ⇒ `μ_t=5` for all `t` (fixed point) and `vol=0`. Step `x=[0]*50+[1]*50`, `λ=0.5`: `μ` rises geometrically toward 1 with `μ_{50+k}=1−(0.5)^{k+1}` — closed-form check.

**Integration code-points.** **NEW** `ewma.py` (or pandas `.ewm`). Supplies the **recent-error EWMA** consumed by F18 (`member_errors[k]` updated as `e_k=λ|ŷ_k−y|+(1−λ)e_k`); supplies time-varying `σ` to A1's GBM bands and a fast trend baseline ensemble member. Output also feeds the SELF-IMPROVEMENT dashboards.

**Source.** Roberts 1959, *Control Chart Tests Based on Geometric Moving Averages*, *Technometrics*; https://doi.org/10.1080/00401706.1959.10489860 · RiskMetrics Technical Document (1996), J.P. Morgan; https://www.msci.com/documents/10199/5915b101-4206-4ba0-aee2-3449d5c7e95a

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

#### F19.+ DEPTH MILESTONE

**Full derivation.** Split conformal prediction guarantees `P(y ∈ [f̂±q_{1−α}(residuals)]) ≥ 1−α` *under exchangeability* — the residual quantile is calibrated because, by exchangeability, a future residual is equally likely to fall at any rank among the calibration residuals. Time series violate exchangeability (temporal dependence). EnbPI restores validity two ways: (1) **LOO ensemble residuals** `ε_i=|y_i−f^{−i}(x_i)|` use out-of-bag predictions, removing the train/test leakage that would shrink residuals; (2) a **sliding window** of the most recent `W` residuals tracks the (possibly drifting) error distribution, so the empirical quantile adapts. Xu & Xie prove asymptotically valid marginal coverage under mild assumptions (stationary-after-conditioning + bounded estimation error). The online residual append makes it a self-correcting interval: persistent under-coverage widens future intervals automatically.

**Runnable-quality pseudocode.**
```python
def enbpi(base_fit, base_predict, X_train, y_train, X_test, *,
          B=25, alpha=0.1, W=100, block=None, agg="mean", seed=0):
    import numpy as np
    rng = np.random.default_rng(seed)
    n = len(y_train); block = block or max(1, int(np.sqrt(n)))
    models, in_bag = [], []
    for b in range(B):
        # block bootstrap (preserves short-range dependence)
        starts = rng.integers(0, n-block+1, size=n//block)
        idx = np.concatenate([np.arange(s, s+block) for s in starts])
        models.append(base_fit(X_train[idx], y_train[idx])); in_bag.append(set(idx))
    # LOO residuals
    agg_fn = np.mean if agg == "mean" else np.median
    eps = []
    for i in range(n):
        oob = [base_predict(m, X_train[i:i+1])[0] for m, s in zip(models, in_bag) if i not in s]
        if oob: eps.append(abs(y_train[i] - agg_fn(oob)))
    eps = list(eps)
    intervals = []
    for xt in X_test:
        fhat = agg_fn([base_predict(m, xt[None])[0] for m in models])
        w = np.quantile(eps[-W:], 1-alpha)
        intervals.append((fhat - w, fhat + w))
    return intervals, eps        # caller appends |y_t - fhat| to eps online
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `B` | int | 25 | 10–100 | bootstraps; OOB coverage | ↑ ensures ≥1 OOB per index |
| `alpha` | float | 0.1 | (0,1) | miscoverage (1−cov) | 0.1 ⇒ 90% PI |
| `W` | int | 100 | 30–∞ | residual window | ↓ for fast drift |
| `block` | int | √T | 1–T | bootstrap block len | seasonal period if known |
| `agg` | str | mean | {mean,median} | aggregator | median for robustness |

**Worked numeric example.** Base = linear model, true `y=2x+ε`, ε~N(0,1), n=500, α=0.1. LOO residuals ≈ |N(0,1)| with `q_{0.9}≈1.645`. Interval half-width ≈ 1.645; realized coverage over a held-out stream ≈ 0.90 (±sampling). If a variance break doubles ε's spread, the sliding window's `q_{0.9}` climbs toward 3.29 within `W` steps, restoring coverage.

**Complexity (derivation).** Training: `B` base fits → `O(B·cost(fit))`. LOO residuals: each of `n` indices aggregates ≤`B` OOB predictions → `O(n·B·cost(predict))`. Per test point: `B` predictions + a window quantile (`O(W log W)` or `O(W)` with a heap) → `O(B + W log W)`. **Space** `O(B·model + W)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Some index never OOB | missing residual | raise `B`; leave-one-block-out |
| Non-stationarity | coverage drifts | sliding window (the core fix); shrink `W` |
| Asymmetric errors | symmetric PI miscovers one side | use signed residual quantiles (two-sided) |
| Tiny calibration set | noisy quantile | full-history window; more data |

**Unit-test oracle.** Homoscedastic Gaussian residuals: realized coverage over a long test stream must converge to `1−α=0.90` (±2%). For α=0.5 the interval half-width must equal the median absolute residual. Degenerate case: zero-residual perfect model ⇒ interval width 0 and 100% coverage.

**Integration code-points.** **NEW** `enbpi.py` (reference MAPIE's `EnbPI`); `numpy.percentile` reuse as in `gbm_montecarlo_forecast`. FORECAST CORE **final calibration** after F18: wraps the combined point forecast (or any A1–A5 member) to produce the published interval; realized coverage feeds SELF-IMPROVEMENT (§08) and the VERIFIER's honest interval statement. Online residual append closes the calibration loop.

---

### F19b. Quantile Regression & Quantile Gradient Boosting — **NEW ALGORITHM**

**Purpose.** Directly model conditional quantiles `Q_Y(α|X)` (not just the mean) — a native way to produce calibrated predictive intervals and asymmetric/heteroscedastic bands. Linear (Koenker) and gradient-boosted (LightGBM/sklearn `GradientBoostingRegressor(loss="quantile")`) variants. Complements conformal (F19): QR gives *conditional* quantiles, conformal *calibrates* them.

**Math.** Fit `β_α` minimizing the **pinball (check) loss**:
```
ρ_α(u) = u·(α − 1{u<0}) = max(α·u, (α−1)·u)
β̂_α = argmin_β Σ_t ρ_α(y_t − x_tᵀβ)
Q_Y(α|x) = xᵀβ̂_α
```

**Derivation.** The pinball loss is minimized in expectation at the conditional α-quantile: setting the subgradient `E[α−1{y<q}]=0` gives `P(y<q)=α`, i.e. `q=Q_Y(α)` — so minimizing `ρ_α` *is* quantile estimation (the mean-analog of OLS). It is piecewise-linear and convex, solvable by linear programming (Koenker–Bassett) or, for the boosted version, by fitting regression trees to the negative gradient of `ρ_α` (a step function: `−1{u<0}+α` … i.e. `α` or `α−1`). Fitting several `α` levels yields a quantile grid; **monotonicity** across levels is enforced by post-hoc sorting (or joint estimation) to prevent quantile crossing.

**Runnable-quality pseudocode.**
```python
def quantile_forecast(X_train, y_train, X_test, *, levels=(.1,.25,.5,.75,.9),
                      method="gbm", n_estimators=200, max_depth=3, lr=0.05):
    import numpy as np
    preds = {}
    if method == "gbm":
        from sklearn.ensemble import GradientBoostingRegressor
        for a in levels:
            m = GradientBoostingRegressor(loss="quantile", alpha=a,
                    n_estimators=n_estimators, max_depth=max_depth, learning_rate=lr)
            m.fit(X_train, y_train); preds[a] = m.predict(X_test)
    else:  # linear, IRLS / LP via statsmodels
        import statsmodels.formula.api as smf, pandas as pd
        df = pd.DataFrame(X_train); df["y"] = y_train
        cols = "+".join(map(str, range(X_train.shape[1])))
        for a in levels:
            r = smf.quantreg(f"y ~ {cols}", df).fit(q=a)
            preds[a] = r.predict(pd.DataFrame(X_test))
    # enforce monotone, non-crossing quantiles
    P = np.array([preds[a] for a in sorted(levels)])
    P = np.sort(P, axis=0)
    return {a: P[i].tolist() for i, a in enumerate(sorted(levels))}
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `levels` | tuple | .1..​.9 | (0,1) | quantile grid | add .05/.95 for tails |
| `method` | str | gbm | {gbm,linear} | model family | gbm for nonlinearity |
| `n_estimators` | int | 200 | 50–1000 | boosting rounds | early-stop on val pinball |
| `max_depth` | int | 3 | 2–8 | tree depth | ↑ for interactions |
| `lr` | float | 0.05 | 0.01–0.3 | learning rate | ↓ with ↑ estimators |

**Worked numeric example.** Heteroscedastic `y=x+ x·ε`, ε~N(0,1) (spread grows with x). At `x=1`: `Q(0.1)≈1−1.28=−0.28`, `Q(0.5)≈1`, `Q(0.9)≈2.28` (width ~2.56). At `x=5`: `Q(0.1)≈5−6.4=−1.4`, `Q(0.9)≈11.4` (width ~12.8) — QR captures the widening band that a constant-width interval cannot.

**Complexity (derivation).** Linear QR via LP/IRLS: `O(n·p²)` per level. GBM QR: `O(n·log n · n_estimators)` per level (tree building), × `|levels|`. **Space** `O(n·p)` + model.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Quantile crossing | `Q(0.1)>Q(0.9)` | post-hoc sort; monotone constraints |
| Extreme tails, sparse data | unstable `Q(0.01)` | regularize; widen via conformal (F19) |
| Pinball non-smooth at 0 | optimizer stalls | smoothed pinball or LP solver |
| Overfit per level | jagged quantiles | shared features; early stopping |

**Unit-test oracle.** Homoscedastic `y=N(μ,σ²)` independent of `x`: estimated `Q(α|x)` must converge to `μ+σ·Φ^{-1}(α)` (constant in x). `Q(0.5)→median`. Pinball loss at the true quantile is minimized — perturbing the predicted quantile up or down must increase average pinball loss (gradient check).

**Integration code-points.** **NEW** `quantile_regression.py` (sklearn `GradientBoostingRegressor(loss="quantile")` / statsmodels `quantreg`). Acts as an ensemble member (F18) emitting a native `quantiles` dict in the standard contract; its quantiles can be EnbPI-calibrated (F19) and CRPS-scored (F20). Features sourced from engineered History-Lake covariates + Granger/CCM/TE-screened drivers (E15/E16/E16b).

**Source.** Koenker & Bassett 1978, *Regression Quantiles*, *Econometrica*; https://doi.org/10.2307/1913643 · Koenker, *Quantile Regression* (2005) · sklearn https://scikit-learn.org/stable/auto_examples/ensemble/plot_gradient_boosting_quantile.html · LightGBM quantile objective https://lightgbm.readthedocs.io/

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

#### F20.+ DEPTH MILESTONE

**Full derivation.** CRPS `= ∫(F(z)−1{z≥y})²dz` is **strictly proper**: its expected value `E_{y~G}[CRPS(F,y)]` is uniquely minimized at `F=G` (the true distribution), so honest probabilistic reporting is optimal — no gaming. The **energy-form identity** `CRPS(F,y)=E|X−y|−½E|X−X'|` (with `X,X'` i.i.d. from `F`) decomposes it into **accuracy** (`E|X−y|`, distance of forecast to truth) minus **sharpness** (`½E|X−X'|`, forecast spread) — rewarding calibrated *and* sharp forecasts. For an `m`-member ensemble the unbiased estimator is `(1/m)Σ|x_i−y| − (1/(2m²))ΣΣ|x_i−x_j|`; sorting the samples lets the double sum be computed in `O(m log m)` via `Σ_i x_(i)(2i−m−1)` (order-statistic trick). For a point forecast (degenerate `F`), CRPS reduces to `|x−y|` = MAE, so CRPS generalizes MAE to distributions. The skill score `SS=1−CRPS_model/CRPS_clim` is the fractional improvement over the unconditional climatology baseline.

**Runnable-quality pseudocode (O(m log m)).**
```python
def crps_ensemble(samples, y):
    import numpy as np
    s = np.sort(np.asarray(samples, float)); m = len(s)
    term1 = np.mean(np.abs(s - y))                       # E|X-y|
    # sharpness via order statistics: sum_{i,j}|s_i-s_j| = 2 * sum_i s_(i)*(2i-m-1)
    i = np.arange(1, m+1)
    term2 = np.sum(s * (2*i - m - 1)) / (m*m)            # = E|X-X'|/2
    return float(term1 - term2)

def skill_score(crps_model, crps_clim):
    cm, cc = float(np.mean(crps_model)), float(np.mean(crps_clim))
    return 1.0 - cm/cc if cc > 0 else 0.0

def coverage(intervals, ys):                              # empirical PI coverage
    return float(np.mean([lo <= y <= hi for (lo, hi), y in zip(intervals, ys)]))
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| climatology window | int | 365 / 1 cycle | ≥30 | baseline distribution | one seasonal cycle |
| backtest | str | rolling-origin | — | evaluation protocol | expanding vs sliding window |
| metrics | set | {CRPS,RMSE,MAE,cov,sharp} | — | scorecard | always report coverage with CRPS |

**Worked numeric example.** Ensemble `samples=[1,2,3]`, observation `y=2`. `term1=(|1−2|+|2−2|+|3−2|)/3=2/3=0.667`. Sorted `s=[1,2,3]`, `Σ s_(i)(2i−4)=1·(−2)+2·0+3·2=4`; `term2=4/9=0.444`. `CRPS=0.667−0.444=0.222`. If climatology CRPS=0.5, `SS=1−0.222/0.5=0.556` (model beats climatology by 56%).

**Complexity (derivation).** Sorting `O(m log m)`; both terms then `O(m)` → **time** `O(m log m)` (vs naive `O(m²)` for the double sum). Over `N` forecasts evaluated: `O(N·m log m)`. **Space** `O(m)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Naive `O(m²)` slow | timeout on large ensembles | order-statistic `O(m log m)` form |
| CRPS hides miscalibration | low CRPS but bad coverage | always co-report coverage + sharpness |
| Mismatched targets/horizons | invalid comparison | score model & clim on identical (t,h) |
| Zero-spread ensemble | CRPS=MAE (fine) | expected; report sharpness=0 |

**Unit-test oracle.** Point forecast (all samples equal `c`): `CRPS=|c−y|` (must equal MAE exactly). For `samples=[1,2,3], y=2` the worked value `0.2222…` is the oracle (cross-check against `properscoring.crps_ensemble`). Perfect deterministic forecast `samples=[y]` ⇒ CRPS=0. `SS=0` when model==climatology; `SS=1` when CRPS_model=0.

**Integration code-points.** **NEW** `scoring.py` (small numpy; reference `properscoring`/`scoringrules`). Reuses the metrics-dict shape of `ai_models.evaluation_arena()` (`/home/user/jarvis-app/underworld/server/services/ai_models.py:59`). SELF-IMPROVEMENT scoring engine (§08): every forecast is scored vs realized outcome; scores drive F18 ensemble weights, retrain triggers, and the VERIFIER's "beats climatology by X%" statement. The metric the supercomputer loop optimizes.

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

#### G21.+ DEPTH MILESTONE

**Full derivation.** The Kalman update is the BLUE (best linear unbiased estimator): minimize the analysis error variance `tr(P^a)` subject to unbiasedness, giving `x^a=x^f+K(y−Hx^f)` with `K=P^fH^T(HP^fH^T+R)^{-1}` and `P^a=(I−KH)P^f`. The EnKF approximates `P^f` by the **sample covariance** of a forecast ensemble (Monte-Carlo, avoiding storing the full `n×n` matrix). Burgers et al. (1998) proved that to get the correct *analysis* covariance you must perturb the observations: updating each member with `y+ε_i` (`ε_i~N(0,R)`) makes the analysis-ensemble sample covariance an unbiased estimate of `P^a`; using the same `y` for all members would under-disperse it by exactly the Kalman-gain term. **Inflation** `r>1` counters the systematic under-dispersion from finite `N` and model error; **localization** `ρ∘P^f` (Schur product with a compact, e.g. Gaspari–Cohn, taper) zeros spurious long-range sample correlations that arise because `rank(P^f)≤N−1≪n`.

**Runnable-quality pseudocode.**
```python
def enkf_cycle(ensemble, M, H, y, R, *, inflation=1.05, taper=None, rng=None):
    import numpy as np
    rng = rng or np.random.default_rng(0)
    N = ensemble.shape[1]                          # ensemble.shape = (n_state, N)
    # 1) forecast each member through dynamics M
    Xf = np.column_stack([M(ensemble[:, i]) for i in range(N)])
    xbar = Xf.mean(1, keepdims=True)
    Xf = xbar + inflation*(Xf - xbar)              # multiplicative inflation
    A = Xf - Xf.mean(1, keepdims=True)
    Pf = (A @ A.T) / (N - 1)
    Pf = 0.5*(Pf + Pf.T)                           # symmetrize
    if taper is not None: Pf = taper * Pf          # localization (Schur product)
    # 2) Kalman gain via solve (no explicit inverse)
    S = H @ Pf @ H.T + R
    K = Pf @ H.T @ np.linalg.solve(S, np.eye(S.shape[0]))
    # 3) perturbed-observation update
    Xa = np.empty_like(Xf)
    for i in range(N):
        eps = rng.multivariate_normal(np.zeros(R.shape[0]), R)
        Xa[:, i] = Xf[:, i] + K @ (y + eps - H @ Xf[:, i])
    return Xa, Xa.mean(1), Xa.std(1)               # ensemble, estimate, spread
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `N` | int | 50–100 | 20–1000 | ensemble size / rank of P^f | ↑ accuracy, ↑ cost |
| `inflation r` | float | 1.05 | 1.0–1.2 | counter under-dispersion | tune to keep spread≈RMSE |
| localization len | float | domain | >0 | spurious-corr cutoff | ↓ with small N |
| `R` | matrix | sensor specs | PSD | obs error cov | from instrument |

**Worked numeric example.** Scalar state, `M(x)=x` (persistence), true state 10, prior ensemble mean 8 with spread 2 (`P^f=4`), one direct obs `y=10.5`, `R=1`, `H=1`. `K=4/(4+1)=0.8`; analysis mean `=8+0.8(10.5−8)=10.0`; analysis variance `(1−0.8)·4=0.8` (spread shrinks from 2 to ~0.89). The filter pulls the estimate toward the observation, weighted by relative uncertainty.

**Complexity (derivation).** Forecast: `N` dynamics evaluations `O(N·cost(M))`. Covariance `A A^T` is `O(N·n²)` (or `O(N²·n)` working in ensemble space). Gain solve `(HP^fH^T+R)^{-1}` is `O(p³)` for `p` observations (small if few obs). Update `O(N·n·p)`. **Time** `O(N·cost(M)+N n p+p³)`; **space** `O(N·n)` (store ensemble, never the full `P^f` in ensemble-space variants).

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Filter divergence (under-dispersion) | spread ≪ error, ignores obs | inflation r>1 (mandatory) |
| Spurious long-range correlations | unphysical updates far from obs | localization (Gaspari–Cohn taper) |
| Explicit inverse instability | NaN gain | Cholesky/`solve`, not `inv` |
| Asymmetric `P^f` from rounding | non-PSD | symmetrize `0.5(P+Pᵀ)` |

**Unit-test oracle.** Linear-Gaussian scalar system: EnKF analysis mean/variance must converge (large `N`) to the exact **Kalman filter** values. For the worked example, with `N→∞` the analysis mean →10.0 and variance →0.8 (match the closed-form KF within MC error `O(1/√N)`). Identity dynamics + repeated identical obs ⇒ estimate converges to the obs, variance →0.

**Integration code-points.** **NEW** `enkf.py` (numpy; reference `filterpy.EnsembleKalmanFilter`). Reuses the ensemble idioms in `epidemic_network.py` (already runs ensemble SIR) and `gpu_backend.py` for large-`n` covariance ops. FORECAST CORE assimilation leg: nudges model state toward live History-Lake observations each cycle; assimilated estimate + spread enters Error-Weighted-Ensemble (F18) as member `k="enkf"` with a physically-consistent uncertainty band.

---

### G21b. STL Decomposition (Seasonal-Trend via Loess) — **NEW ALGORITHM**

**Purpose.** Robustly split a series into **trend + seasonal + remainder** (`y_t = T_t + S_t + R_t`) using iterated local regression (loess). A preprocessing/feature step: deseasonalize before forecasting (A1/A3), expose the seasonal pattern as a KGIK feature, and isolate the remainder for anomaly (D14) / change-point (D12/D13) detection. STL+ETS/ARIMA on the remainder is a standard strong baseline.

**Math.** STL is two nested loops. **Inner loop** (per iteration):
1. *Detrend:* `y_t − T_t^{(k)}`.
2. *Cycle-subseries smoothing:* loess-smooth each seasonal sub-series (all Januaries, all Februaries, ...) → temporary seasonal `C`.
3. *Low-pass + subtract:* low-pass filter `C`, subtract from `C` to get seasonal `S^{(k+1)}` (ensures seasonal sums ≈0 over a cycle).
4. *Deseasonalize & trend-smooth:* loess-smooth `y_t − S_t^{(k+1)}` → `T_t^{(k+1)}`.
**Outer loop:** compute robustness weights `ρ_t = B(|R_t|/(6·median|R|))` (bisquare `B`) and re-run the inner loop weighting by `ρ_t` to downweight outliers.

**Derivation.** Loess at a point fits a low-degree (deg 1 or 2) weighted polynomial using a tricube kernel over the nearest `q` points; the fitted value is `x_0ᵀ(XᵀWX)^{-1}XᵀWy` — a local linear smoother. Iterating detrend↔deseasonalize is a backfitting algorithm (Gauss–Seidel on the additive model), which converges because each loess smoother is a contraction (its eigenvalues ≤1). The robustness outer loop is iteratively reweighted least squares with a bisquare ρ-function, giving resistance to outliers in `R_t`.

**Runnable-quality pseudocode.**
```python
def stl_decompose(y, period, *, seasonal=7, trend=None, robust=True, n_inner=2, n_outer=1):
    import numpy as np
    from statsmodels.tsa.seasonal import STL
    res = STL(np.asarray(y, float), period=period, seasonal=seasonal,
              trend=trend, robust=robust).fit()
    return {"trend": res.trend.tolist(), "seasonal": res.seasonal.tolist(),
            "remainder": res.resid.tolist(),
            "seasonal_strength": float(max(0, 1 - np.var(res.resid)/np.var(res.resid+res.seasonal))),
            "trend_strength":    float(max(0, 1 - np.var(res.resid)/np.var(res.resid+res.trend)))}
# (statsmodels STL implements the loess inner/outer loops above)
```

**Parameter table.**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| `period` | int | — | ≥2 | seasonal cycle length | from FFT/ACF/domain |
| `seasonal` | int (odd) | 7 | ≥7 odd | seasonal loess window | ↑ ⇒ smoother (more fixed) seasonality |
| `trend` | int (odd) | auto | ≥period | trend loess window | ↑ ⇒ smoother trend |
| `robust` | bool | True | — | outlier resistance | True for spiky data |
| `n_inner`/`n_outer` | int | 2 / 1 (15 if robust) | — | loop iterations | more outer for many outliers |

**Worked numeric example.** Monthly series `y=trend(0.5t) + 10·sin(2πt/12) + noise`, `period=12`. STL recovers `T_t≈0.5t` (near-linear), `S_t` a clean sinusoid with amplitude ~10 summing to ≈0 over each 12 months, and `R_t` ≈ the noise. `seasonal_strength≈0.95` (strong seasonality), `trend_strength≈0.9`.

**Complexity (derivation).** Each loess smooth of `n` points with window `q` is `O(n·q)` (a weighted regression per point); the inner loop does a constant number of smooths → `O(n·q)` per inner iteration; total `O(n·q·n_inner·n_outer)`. **Space** `O(n)`.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Wrong `period` | seasonal leaks into trend/remainder | detect period via FFT/ACF first |
| Outliers distort components | biased trend/seasonal | `robust=True` (bisquare reweighting) |
| Short series (<2 periods) | unstable seasonal | require ≥2 full cycles |
| Multiplicative seasonality | additive misfit | log-transform first, then STL |

**Unit-test oracle.** Pure additive synthetic `y=a·t + b·sin(2πt/p)` (no noise): STL must recover `trend≈a·t` and `seasonal≈b·sin(...)` with `remainder≈0` (max |R|<1e-2 after warmup). Seasonal component must sum to ≈0 over each full period (a defining property). Constant series ⇒ trend=mean, seasonal=0, remainder=0.

**Integration code-points.** **NEW** `stl.py` (statsmodels `STL`). Preprocessing step in FORECAST CORE: deseasonalize → forecast trend+remainder with ARIMA/GBM (A1/A3) → re-add seasonal (STL+ARIMA pipeline); the `seasonal`/`trend` strengths become KGIK features and ensemble-routing signals (F18); the `remainder` feeds Isolation Forest (D14) and PELT/BOCPD (D12/D13) so anomalies/breaks are detected on the de-trended, de-seasonalized signal. Period detection reuses the FFT/ACF helper shared with A2/A3.

**Source.** Cleveland, Cleveland, McRae, Terpenning 1990, *STL: A Seasonal-Trend Decomposition Procedure Based on Loess*, *J. Official Statistics* 6(1); https://www.wessa.net/download/stl.pdf · statsmodels STL https://www.statsmodels.org/stable/generated/statsmodels.tsa.seasonal.STL.html · MSTL (multiple seasonality) https://arxiv.org/abs/2107.13462

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

#### H22.+ DEPTH MILESTONE

**Full derivation (collapse avoidance).** The trivial minimizer of `L=‖ŝ_y−sg(s_y)‖²` is the constant map `E_θ(·)=const` (zero loss, useless). JEPA prevents this *without negatives* via an **asymmetry**: (1) the target encoder uses **EMA** weights `ξ←m ξ+(1−m)θ` and **stop-gradient**, so the target is a slowly-moving teacher the student chases — it cannot instantaneously collapse to match a constant because the target lags; (2) optional **VICReg** terms add a variance hinge `Σ max(0, 1−√(Var(s)+ε))` (forces per-dimension std ≥1, preventing dimensional collapse) and a covariance penalty `Σ_{i≠j} Cov(s)_{ij}²` (decorrelates dimensions). The EMA-teacher dynamic is the same mechanism as BYOL; the predictor `P_φ` provides the extra capacity that, combined with the lag, makes the constant solution unstable. The key insight (LeCun): predicting in **representation space** discards unpredictable pixel/value detail, so the model spends capacity on predictable abstract structure — ideal for noisy financial series.

**Runnable-quality pseudocode (train step).**
```python
def jepa_train_step(ctx, tgt, E_theta, E_xi, P_phi, opt, *, m=0.996, vicreg=True):
    import torch, torch.nn.functional as F
    s_x = E_theta(ctx)                                  # context latent (grad)
    with torch.no_grad():
        s_y = E_xi(tgt)                                 # target latent (stop-grad, EMA)
    pred = P_phi(s_x)                                   # predict target latent
    loss = F.smooth_l1_loss(pred, s_y)
    if vicreg:
        std = torch.sqrt(s_x.var(0) + 1e-4)
        loss = loss + torch.mean(F.relu(1 - std))       # variance hinge
        Z = s_x - s_x.mean(0)
        cov = (Z.T @ Z) / (len(Z) - 1)
        off = cov - torch.diag(torch.diag(cov))
        loss = loss + (off**2).sum() / s_x.shape[1]     # covariance penalty
    opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():                               # EMA update of target encoder
        for p, q in zip(E_theta.parameters(), E_xi.parameters()):
            q.mul_(m).add_((1-m)*p)
    return loss.item()
```

**Parameter table (interface-level).**
| Name | Type | Default | Range | Effect | Tuning |
|------|------|---------|-------|--------|--------|
| latent_dim | int | 256 | 64–1024 | representation size | task capacity |
| `m` (EMA) | float | 0.996→1.0 | 0.99–0.9999 | teacher lag | ramp up over training |
| mask_ratio | float | 0.5 | 0.15–0.75 | context/target split | ↑ harder pretext |
| vicreg λ | float | 1.0 | 0–25 | collapse regularizer | ↑ if collapse observed |

**Worked numeric example.** Pretrain on 100k History-Lake windows; context = first 80% of window, target = last 20%. After convergence, the encoder maps a "bull-trend with rising vol" window and a paraphrased one to nearby latents (cosine ≈0.95), while a "bear crash" window is far (cosine ≈0.1). A linear probe on the frozen latent predicts next-window direction at AUC≈0.7 — the latent is transferable.

**Complexity (derivation).** Forward = two encoder passes (context+target) + predictor; **no decoder**, so ~⅔ the cost of a generative world model. Per step `O(B·encoder_FLOPs)`; EMA update `O(params)`. **Space** dominated by two encoder copies (student + EMA teacher). GPU required for pretraining; inference is a single encoder forward.

**Numerical stability + failure modes + mitigations.**
| Failure mode | Symptom | Mitigation |
|---|---|---|
| Representational collapse | latent variance →0, constant output | EMA target + stop-grad; VICReg variance hinge |
| Dimensional collapse | latents lie in a subspace | covariance penalty |
| EMA too fast | student/teacher couple, collapse | ramp `m`→1.0 |
| Latent scale drift | unstable predictor | layer-norm latents |

**Unit-test oracle.** Collapse detector: after N steps, per-dimension latent std must stay `>0.1` (VICReg lower bound ~1.0) — a collapsed model fails this. Invariance check: feed two augmentations of the same window; cosine(latent₁, latent₂) must exceed cosine(latent₁, latent_random) by a clear margin. EMA monotonicity: teacher weights move strictly toward student weights each step.

**Integration code-points.** **NEW** PyTorch `jepa.py` behind a feature flag. Reuses `gpu_backend.py`, History-Lake loaders (`05_DATA_MODEL_AND_SCHEMAS.md`), and the A4 probe-head output contract. Frozen latents feed: FORECAST CORE probe heads (forecast quantiles), PATTERN-DISCOVERY (HDBSCAN C9 regime clustering on latents), and RELATIONAL LAYER (node features for TGN/TGAT B6/B7). v1 = design + interface.

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
