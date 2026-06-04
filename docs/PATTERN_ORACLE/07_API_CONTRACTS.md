# 07 — API CONTRACTS

**Codename:** PATTERN ORACLE
**Document class:** Master Engineering Spec · ISO-execution depth
**Section:** `07_API_CONTRACTS.md` (see `00_MASTER_INDEX.md` §3)
**Status:** living document; extends — does not contradict — the audited live endpoint `POST /functions/predict` (`server/routes/predict.py` → `server/services/prediction.py`) and the optional-bearer auth pattern (`server/auth.py`).

> **Grounding rule (from §0):** every contract here is either (a) the *exact* shape the existing code already returns, documented faithfully, or (b) a *forward* contract for the full engine (History Lake, pattern discovery, KGIK, model registry, backtesting) that is consistent with the existing schema, the data model (`05_DATA_MODEL_AND_SCHEMAS.md`), the algorithms (`06_ALGORITHMS.md`), and the self-improvement loop (`08_SELF_IMPROVEMENT_AND_MLOPS.md`). Endpoints not yet in code are marked **[FORWARD]**; the live one is marked **[LIVE]**.

---

## 0. CONVENTIONS

### 0.1 Base URL, transport, content type
- All endpoints are served by the FastAPI app in `server/main.py`.
- Transport: HTTPS in production; `http://localhost:8000` (backend) / `http://localhost:5173` (Vite dev) locally. CORS is governed by `JARVIS_CORS_ORIGINS` (`server/config.py`).
- Request/response media type: `application/json; charset=utf-8` unless a streaming variant is explicitly noted.
- Times: epoch **milliseconds** (integers) wherever the existing predictor uses them (it does — see `data.as_of`, `history[].t`); ISO-8601 UTC strings are accepted on input for new endpoints and always echoed back in ms for series payloads to stay chart-compatible with `ForecastChart` in `src/pages/PredictionOracle.jsx`.
- Numbers: JSON numbers; `null` is a first-class "unknown / not-applicable" value (the predictor already emits `null` for `value`, `interval.low`, `probability`, etc.). Clients MUST treat `null` as "not available," never `0`.
- Floats may be `NaN`/`Infinity` internally but are **always** serialized as `null` at the API boundary (never as the JSON tokens `NaN`/`Infinity`, which are invalid JSON).

### 0.2 Versioning (see §6)
- Current live route is **un-versioned** for backward compatibility: `POST /functions/predict`.
- All **new** endpoints are mounted under **`/v1`** (e.g. `POST /v1/predict/explain`). `POST /functions/predict` is additionally aliased at `POST /v1/functions/predict` (identical behaviour) so new clients can be uniformly `/v1`-prefixed.

### 0.3 Auth (reuse existing pattern)
Auth reuses `optional_bearer` from `server/auth.py` verbatim:

- Header: `Authorization: Bearer <JARVIS_API_KEY>`.
- When `JARVIS_REQUIRE_AUTH=false` (default): public-read endpoints work **without** a token; if a token *is* supplied it is validated (a wrong token → `401`).
- When `JARVIS_REQUIRE_AUTH=true`: every endpoint behaves like `require_bearer` — a valid token is mandatory.
- **Write / mutating** endpoints (those that persist outcomes, trigger retrains, or enqueue backtests) use `require_bearer` **always**, regardless of `JARVIS_REQUIRE_AUTH`, because they change server state. These are flagged **auth: required** below. Read endpoints are flagged **auth: optional_bearer**.

Per-endpoint auth summary:

| Endpoint | Auth dependency |
|---|---|
| `POST /functions/predict` (and `/v1/functions/predict`) | `optional_bearer` |
| `POST /v1/predict/explain` | `optional_bearer` |
| `GET  /v1/predict/skill` | `optional_bearer` |
| `GET  /v1/history/series` | `optional_bearer` |
| `GET  /v1/history/series/{id}` | `optional_bearer` |
| `POST /v1/patterns/scan` | `optional_bearer` |
| `GET  /v1/kgik/graph` | `optional_bearer` |
| `POST /v1/kgik/link-predict` | `optional_bearer` |
| `GET  /v1/models/registry` | `optional_bearer` |
| `POST /v1/predict/backtest` | **`require_bearer`** (enqueues compute / persists) |

### 0.4 The standard error envelope (see §7 for the taxonomy)
Two failure modes coexist, by design:

1. **Soft / domain failures** (e.g. not enough data to forecast) are returned with HTTP **`200`** as a structured, on-schema result — never an exception. This is the existing predictor contract: `predict()` "never raises on a normal question" and returns an `insufficient_data` result with the method name `"insufficient_data"` and an explanatory `caveats[]` entry. The frontend (`DataState`) renders this as a normal result, not an error toast. **Do not change this for `/functions/predict`.**
2. **Hard / protocol failures** (auth, malformed body, unknown route, rate limit, upstream feed hard-down, internal bug) are returned with the appropriate **4xx/5xx** status and the **error envelope** below.

```json
{
  "error": {
    "code": "insufficient_data",
    "message": "Human-readable explanation safe to surface to the user.",
    "status": 422,
    "details": { "needs": "a price series via params.series, or a recognised ticker" },
    "request_id": "req_2f9c1ab4e7",
    "docs": "https://docs.apex.local/pattern-oracle/errors#insufficient_data",
    "retryable": false
  }
}
```

Field semantics:
- `code` — stable machine string from the taxonomy in §7. Clients branch on this, not on `message`.
- `message` — display-safe, never leaks stack traces or secrets.
- `status` — mirrors the HTTP status (redundant for clients that only see the body).
- `details` — optional, code-specific structured context (e.g. `needs`, `entity_id`, `feed`, `retry_after_seconds`).
- `request_id` — correlation id; also returned in the `X-Request-Id` response header on every response.
- `retryable` — boolean hint; `true` for transient classes (`upstream_feed_error`, `model_unavailable`, `rate_limited`, `internal_error`).

> **Note on `insufficient_data`:** for `POST /functions/predict` it is delivered as a **200 soft result** (existing behaviour, preserved). For the **new** `/v1` analytical endpoints that have no useful degraded answer (e.g. `/v1/patterns/scan` on a 1-point series), it is delivered as a **422** error envelope with `code: "insufficient_data"`. Both share the same code so client logic is uniform.

### 0.5 Idempotency
- `GET` endpoints are inherently idempotent and safe; responses are cacheable (see per-endpoint `Cache-Control`).
- `POST /functions/predict`, `POST /v1/predict/explain`, `POST /v1/patterns/scan`, `POST /v1/kgik/link-predict` are **pure functions of their body** (no persisted side effects beyond the in-process ~5-min data cache). They are naturally idempotent; repeating an identical body yields an equivalent result (subject to live-feed drift and Monte-Carlo seeding — the GBM forecaster is seeded `seed=42` by default, so it is *deterministic* given identical input data).
- `POST /v1/predict/backtest` **persists** a backtest run and therefore supports the `Idempotency-Key` header. Supplying the same key within the retention window (24 h) returns the original run instead of creating a duplicate. The key is an opaque client-chosen string ≤ 200 chars.

```
Idempotency-Key: bt_xrp_2026-06-04_run7
```

### 0.6 Pagination (list endpoints)
Cursor-based, stable under concurrent writes:

- Request query params: `limit` (default 50, max 500), `cursor` (opaque, from a prior response).
- Response wraps the collection:

```json
{
  "items": [ /* ... */ ],
  "page": { "limit": 50, "next_cursor": "eyJvZmYiOjUwfQ==", "has_more": true, "total_estimate": 1284 }
}
```

- `next_cursor` is `null` when exhausted. `total_estimate` is best-effort (may be approximate for large tables).

### 0.7 Rate limits
Token-bucket per identity (API key when present, else client IP). Limits returned on every response:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1749038400
```

Default buckets (per minute):

| Class | Endpoints | Default limit / min |
|---|---|---|
| Forecast (compute-light) | `/functions/predict`, `/v1/predict/explain`, `/v1/kgik/link-predict` | 120 |
| Query (read) | `/v1/history/*`, `/v1/kgik/graph`, `/v1/models/registry`, `/v1/predict/skill` | 240 |
| Heavy compute | `/v1/patterns/scan` | 30 |
| Job submission | `/v1/predict/backtest` | 10 |

Exceeding a bucket → `429` with `code: "rate_limited"`, `details.retry_after_seconds`, and a `Retry-After` header.

### 0.8 Common HTTP status codes
| Status | Meaning in this API |
|---|---|
| `200 OK` | Success — including **soft** `insufficient_data` from `/functions/predict`. |
| `202 Accepted` | Async job accepted (`/v1/predict/backtest` when run asynchronously). |
| `400 Bad Request` | Malformed JSON, wrong types, failed schema validation (`validation_error`). |
| `401 Unauthorized` | Missing/invalid bearer (`unauthorized`). Matches `server/auth.py` `_check`. |
| `403 Forbidden` | Authenticated but not permitted (`forbidden`). |
| `404 Not Found` | Unknown route, or unknown `series_id` / `run_id` / entity (`not_found` / `unknown_entity`). |
| `409 Conflict` | Idempotency-key reuse with a different body (`idempotency_conflict`). |
| `422 Unprocessable Entity` | Semantically invalid but well-formed (`insufficient_data` on `/v1` analytics, `unknown_entity`). |
| `429 Too Many Requests` | Rate limited (`rate_limited`). |
| `500 Internal Server Error` | Unhandled bug (`internal_error`). Should be rare; the predictor self-handles. |
| `502 Bad Gateway` | Upstream feed hard failure surfaced (`upstream_feed_error`). |
| `503 Service Unavailable` | Forecast/inference backend unavailable (`model_unavailable`), or maintenance. |

---

## 1. `POST /functions/predict` — the unified prediction engine **[LIVE]**

**Method/path:** `POST /functions/predict` (alias: `POST /v1/functions/predict`)
**Auth:** `optional_bearer`
**Idempotency:** pure function of body (GBM seeded `42` → deterministic given data).
**Rate limit:** Forecast class (120/min).
**Frontend call:** `kimiClient.functions.predict({ question, params? })` → `src/pages/PredictionOracle.jsx`.

### 1.1 Request schema

```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PredictRequest",
  "type": "object",
  "required": ["question"],
  "additionalProperties": false,
  "properties": {
    "question": {
      "type": "string",
      "minLength": 1,
      "description": "Natural-language forecasting question. Routed via Kimi (best-effort) then a regex/keyword fallback."
    },
    "params": {
      "type": ["object", "null"],
      "description": "Optional structured overrides + offline data. When present, the network is NOT touched for series the params already supply.",
      "additionalProperties": true,
      "properties": {
        "domain": { "type": "string", "enum": ["crypto", "seismic", "trajectory", "growth", "generic"], "description": "Force the route, bypassing the classifier." },
        "target": { "type": "string", "description": "Subject, e.g. a ticker ('xrp'), or 'M>=6.0'." },
        "horizon_hours": { "type": "number", "exclusiveMinimum": 0, "description": "Forecast horizon in hours; overrides any horizon parsed from the question." },

        "series": { "type": "array", "items": { "oneOf": [ {"type":"number"}, {"type":"object","properties":{"t":{"type":"number"},"v":{"type":"number"}},"required":["v"]} ] }, "description": "Generic time series: array of numbers OR {t(ms), v} objects." },
        "values": { "type": "array", "items": {"type":"number"}, "description": "Alias for series (numbers only)." },
        "prices": { "type": "array", "items": {"type":"number"}, "description": "Alias for series (crypto)." },
        "lookback_days": { "type": "integer", "minimum": 1, "default": 90, "description": "CoinGecko market_chart window when fetching crypto." },
        "unit": { "type": "string", "description": "Display unit for growth/generic outputs." },

        "magnitude": { "type": "number", "description": "Seismic target magnitude M (default 5.0)." },
        "magnitudes": { "type": "array", "items": {"type":"number"}, "description": "Offline magnitude catalog." },
        "catalog": { "type": "array", "description": "Alias for magnitudes; accepts [{mag}] or [number]." },
        "min_magnitude": { "type": "number", "default": 2.5 },
        "catalog_days": { "type": "number", "default": 30.0 },
        "latitude": { "type": "number" },
        "longitude": { "type": "number" },
        "radius_km": { "type": "number" },
        "omori": { "type": "object", "description": "Presence switches to the Omori aftershock branch." },
        "mainshock_K": { "type": "number" },
        "omori_c": { "type": "number", "default": 0.05 },
        "omori_p": { "type": "number", "default": 1.1 },
        "days_since_mainshock": { "type": "number", "default": 1.0 },

        "state_vector": { "type": "object", "properties": {
          "lat": {"type":"number"}, "lng": {"type":"number"}, "alt_m": {"type":"number"},
          "speed_mps": {"type":"number"}, "heading_deg": {"type":"number"}, "vertical_rate_mps": {"type":"number"}
        }, "required": ["lat","lng","speed_mps","heading_deg"] },
        "minutes": { "type": "number", "description": "Trajectory horizon in minutes (default 10)." },
        "semi_major_axis_km": { "type": "number", "description": "Orbital-period branch (Kepler III)." },
        "a_km": { "type": "number", "description": "Alias for semi_major_axis_km." },
        "projectile": { "type": "object", "description": "Presence switches to the ballistic branch." },
        "speed": { "type": "number", "description": "Ballistic muzzle speed (m/s)." },
        "angle_deg": { "type": "number", "description": "Ballistic launch angle." },
        "height0": { "type": "number", "default": 0.0 },

        "horizon_steps": { "type": "integer", "minimum": 1, "description": "Growth: explicit step count." }
      }
    }
  }
}
```

### 1.2 Response schema (the canonical PATTERN ORACLE answer envelope)

This is the **exact** shape `services.prediction.predict()` returns today (faithfully documented). All `/v1` forecast endpoints that emit a forecast reuse this envelope.

```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PredictResponse",
  "type": "object",
  "required": ["question","domain","target","horizon","prediction","method","drivers","data","assumptions","caveats","used_llm"],
  "properties": {
    "question": { "type": "string" },
    "domain":   { "type": "string", "enum": ["crypto","seismic","trajectory","growth","generic","unknown"] },
    "target":   { "type": ["string","null"] },
    "horizon":  { "type": ["string","null"], "description": "Human label, e.g. '48h', '7.0d', '2.10y', '20 min'." },

    "prediction": {
      "type": "object",
      "required": ["value","unit","point_estimate","interval","probability"],
      "properties": {
        "value":          { "type": ["number","object","null"], "description": "Headline answer. number (price/count), object {lat,lng,alt_m} for trajectory, or null (e.g. seismic uses probability)." },
        "unit":           { "type": ["string","null"], "description": "'USD' | 'probability' | 'minutes' | 'meters' | 'lat/lng/alt' | caller unit | null." },
        "point_estimate": { "type": ["number","object","null"] },
        "interval": {
          "type": "object",
          "required": ["low","high","confidence"],
          "properties": {
            "low":        { "type": ["number","null"] },
            "high":       { "type": ["number","null"] },
            "confidence": { "type": ["number","null"], "minimum": 0, "maximum": 1, "description": "Nominal coverage, e.g. 0.90, 0.95. 0.0 when not a statistical interval (e.g. analytic trajectory)." }
          }
        },
        "probability": { "type": ["number","null"], "minimum": 0, "maximum": 1, "description": "Event probability or P(up) for price. null when N/A." }
      }
    },

    "method": {
      "type": "object",
      "required": ["name","family","models_used","math"],
      "properties": {
        "name":        { "type": "string", "description": "e.g. 'GBM Monte-Carlo + Holt blend', 'Gutenberg-Richter + Poisson'." },
        "family":      { "type": "string", "enum": ["time_series","event_probability","trajectory","growth","relational","ensemble","unknown"] },
        "models_used": { "type": "array", "items": {"type":"string"}, "description": "Concrete model ids, e.g. ['geometric_brownian_motion_montecarlo','holt_linear_trend']." },
        "math":        { "type": "string", "description": "Compact formula trace, rendered verbatim in the UI METHOD panel." }
      }
    },

    "drivers": { "type": "object", "additionalProperties": true, "description": "Flat-ish map of the numeric quantities that drove the forecast (mu, sigma, b_value, K, etc.)." },

    "data": {
      "type": "object",
      "required": ["source","as_of","history","forecast"],
      "properties": {
        "source":   { "type": ["string","null"], "description": "Provenance, e.g. 'CoinGecko /coins/ripple/market_chart', 'USGS fdsnws/event/1/query', 'params'." },
        "as_of":    { "type": ["integer","null"], "description": "Epoch ms of the latest datum." },
        "lookback": { "type": ["string","null"], "description": "e.g. '90 samples', '412 events'." },
        "history":  { "type": "array", "items": { "type": "object", "properties": { "t": {}, "v": {} } }, "description": "Past series [{t,v}]; capped (crypto last 200, seismic 500)." },
        "forecast": { "type": "array", "items": { "type": "object", "properties": { "t": {}, "v": {}, "low": {}, "high": {} } }, "description": "Projected points with optional band." }
      }
    },

    "assumptions": { "type": "array", "items": {"type":"string"} },
    "caveats":     { "type": "array", "items": {"type":"string"} },
    "used_llm":    { "type": "boolean", "description": "true when Kimi performed the NL intent extraction; false on the regex fallback." }
  }
}
```

**Enums consolidated:**
- `domain` ∈ `{crypto, seismic, trajectory, growth, generic, unknown}` (`unknown` only appears inside `insufficient_data` results where the route could not be determined).
- `method.family` ∈ `{time_series, event_probability, trajectory, growth, relational, ensemble, unknown}`. (`relational` and `ensemble` are reserved for the full engine — KGIK link-prediction and the error-weighted ensemble of `06_ALGORITHMS.md` — and are not yet emitted by the live code.)

### 1.3 Worked examples (request + success + soft error) for every domain

#### 1.3.1 Crypto — `time_series`
**Request**
```json
{ "question": "XRP price in 48h" }
```
**Success (200)** — abbreviated to the load-bearing fields:
```json
{
  "question": "XRP price in 48h",
  "domain": "crypto",
  "target": "xrp",
  "horizon": "48h",
  "prediction": {
    "value": 0.5213,
    "unit": "USD",
    "point_estimate": 0.5213,
    "interval": { "low": 0.4788, "high": 0.5701, "confidence": 0.90 },
    "probability": 0.512
  },
  "method": {
    "name": "GBM Monte-Carlo + Holt blend",
    "family": "time_series",
    "models_used": ["geometric_brownian_motion_montecarlo","holt_linear_trend"],
    "math": "log-returns r=ln(P_i/P_{i-1}); mu,sigma per step; GBM P_h=P0*exp((mu-0.5*sigma^2)h+sigma*Z*sqrt(h)) Monte-Carlo (10000 paths); sigma annualised /sqrt(dt); blended 50/50 with Holt linear-trend (alpha=0.3,beta=0.1)."
  },
  "drivers": {
    "p0": 0.5189, "drift_per_step": 0.0012, "volatility_per_step": 0.041,
    "drift_annualized": 0.438, "volatility_annualized": 0.783,
    "sampling_interval_years": 0.00274, "horizon_steps": 2, "n_paths": 10000,
    "percentiles": { "5": 0.4788, "25": 0.5012, "50": 0.5201, "75": 0.5398, "95": 0.5701 },
    "probability_up": 0.512
  },
  "data": {
    "source": "CoinGecko /coins/ripple/market_chart",
    "as_of": 1749038400000,
    "lookback": "90 samples",
    "history": [ { "t": 1741262400000, "v": 0.488 }, { "t": 1741348800000, "v": 0.495 } ],
    "forecast": [ { "t": 1749211200000, "v": 0.5213, "low": 0.4788, "high": 0.5701 } ]
  },
  "assumptions": [
    "Log-returns are i.i.d. Gaussian (Geometric Brownian Motion).",
    "Drift and volatility are constant over the forecast horizon.",
    "Sampling interval inferred as ~24.0h; sigma annualised accordingly."
  ],
  "caveats": [
    "Crypto is heavy-tailed and regime-switching; real tails are fatter than Gaussian.",
    "Not financial advice. The interval is a model band, not a guarantee.",
    "P(up) is the Monte-Carlo fraction of terminal paths above the last price."
  ],
  "used_llm": false
}
```
**Soft error (200, offline / no series):**
```json
{
  "question": "XRP price in 48h",
  "domain": "crypto", "target": "xrp", "horizon": "48h",
  "prediction": { "value": null, "unit": null, "point_estimate": null,
                  "interval": { "low": null, "high": null, "confidence": 0.0 }, "probability": null },
  "method": { "name": "insufficient_data", "family": "crypto", "models_used": [], "math": "" },
  "drivers": {},
  "data": { "source": null, "as_of": null, "lookback": null, "history": [], "forecast": [] },
  "assumptions": [],
  "caveats": ["Insufficient data to answer. Needs: a price series via params.series/values, or a recognised ticker with network access"],
  "used_llm": false
}
```

#### 1.3.2 Seismic — `event_probability` (offline catalog via params)
**Request**
```json
{
  "question": "Chance of an M6+ near 35.7,139.7 in the next 7 days?",
  "params": { "domain": "seismic", "magnitude": 6.0, "horizon_hours": 168,
              "magnitudes": [2.5,2.6,2.7,2.9,3.1,3.3,3.0,2.8,4.1,3.7,2.6,5.2,3.9],
              "catalog_days": 30 }
}
```
**Success (200)**
```json
{
  "question": "Chance of an M6+ near 35.7,139.7 in the next 7 days?",
  "domain": "seismic", "target": "M>=6.0", "horizon": "7.0d",
  "prediction": {
    "value": 0.037, "unit": "probability", "point_estimate": 0.037,
    "interval": { "low": 0.0, "high": 1.0, "confidence": 0.0 }, "probability": 0.037
  },
  "method": {
    "name": "Gutenberg-Richter + Poisson", "family": "event_probability",
    "models_used": ["gutenberg_richter_b_value","poisson_rate"],
    "math": "G-R log10(N>=M)=a-b*M (Aki/Utsu MLE b); N_target=10^(a-b*M); lambda=N_target/catalog_days; P(>=1 in T)=1-exp(-lambda*T) (Poisson)."
  },
  "drivers": { "b_value": 0.92, "a_value": 4.31, "b_std_error": 0.18, "mc": 2.5,
               "n_events": 13, "rate_per_day": 0.0054, "target_magnitude": 6.0, "used_underworld_gr": false },
  "data": {
    "source": "params", "as_of": 1749038400000, "lookback": "13 events",
    "history": [ { "t": 0, "v": 2.5 }, { "t": 11, "v": 5.2 } ],
    "forecast": [ { "t": "horizon", "v": 0.037, "low": 0.0, "high": 1.0 } ]
  },
  "assumptions": [
    "Earthquake magnitudes follow the Gutenberg-Richter frequency-magnitude law.",
    "Occurrence is a stationary Poisson process at the fitted rate.",
    "Catalog complete above Mc; window = 30 days."
  ],
  "caveats": [
    "Poisson stationarity ignores clustering / triggering beyond the model used.",
    "Probability is for AT LEAST ONE event of the target magnitude in the horizon.",
    "G-R extrapolation to large M above the catalog max is uncertain."
  ],
  "used_llm": false
}
```

#### 1.3.3 Trajectory — great-circle from a state vector
**Request**
```json
{
  "question": "Where will this aircraft be in 20 minutes?",
  "params": { "domain": "trajectory", "state_vector": {
    "lat": 51.47, "lng": -0.4543, "alt_m": 11277, "speed_mps": 246, "heading_deg": 285, "vertical_rate_mps": 0 },
    "minutes": 20 }
}
```
**Success (200)**
```json
{
  "question": "Where will this aircraft be in 20 minutes?",
  "domain": "trajectory", "target": "great_circle_position", "horizon": "20 min",
  "prediction": {
    "value": null, "unit": "lat/lng/alt",
    "point_estimate": { "lat": 52.107, "lng": -5.012, "alt_m": 11277 },
    "interval": { "low": null, "high": null, "confidence": 0.0 }, "probability": null
  },
  "method": { "name": "Great-circle forward (haversine)", "family": "trajectory",
              "models_used": ["great_circle_forward"],
              "math": "haversine direct: delta=d/R; lat2=asin(sin l1 cos d + cos l1 sin d cos h); lng2=l1+atan2(sin h sin d cos l1, cos d - sin l1 sin l2)." },
  "drivers": { "speed_mps": 246, "heading_deg": 285, "vertical_rate_mps": 0, "minutes": 20,
               "earth_radius_m": 6371000.0, "predicted_lat": 52.107, "predicted_lng": -5.012, "ground_distance_m": 295200.0 },
  "data": {
    "source": "params (state vector)", "as_of": 1749038400000, "lookback": "single state vector",
    "history": [ { "t": 0, "v": { "lat": 51.47, "lng": -0.4543 } } ],
    "forecast": [ { "t": 20, "v": { "lat": 52.107, "lng": -5.012, "alt_m": 11277 }, "low": null, "high": null } ]
  },
  "assumptions": [
    "Constant speed, heading, and vertical rate over the horizon.",
    "Spherical Earth (R=6371 km); great-circle (geodesic) track."
  ],
  "caveats": [
    "No live ADS-B feed: the supplied state vector is taken as ground truth.",
    "Real aircraft change heading/speed; this is a straight-track extrapolation."
  ],
  "used_llm": false
}
```

#### 1.3.4 Growth — exponential/logistic fit
**Request**
```json
{ "question": "Project our user growth 6 months out",
  "params": { "domain": "growth", "series": [1000,1320,1700,2150,2700,3300,3950],
              "horizon_steps": 6, "unit": "users" } }
```
**Success (200)**
```json
{
  "question": "Project our user growth 6 months out",
  "domain": "growth", "target": null, "horizon": "6 steps",
  "prediction": {
    "value": 11842.6, "unit": "users", "point_estimate": 11842.6,
    "interval": { "low": 10903.1, "high": 12782.1, "confidence": 0.95 }, "probability": null
  },
  "method": { "name": "exponential growth fit", "family": "growth",
              "models_used": ["exponential_fit","logistic_fit"],
              "math": "exp: ln(y)=ln(y0)+r t (OLS), T2=ln2/r; logistic: y=K/(1+A e^{-r t}), K grid-searched, A,r OLS on logit; pick lower-SSE; CI=point +/- 1.96*sigma_resid." },
  "drivers": { "model": "exponential", "y0": 1014.2, "growth_rate": 0.226, "doubling_time": 3.07, "residual_std": 479.3 },
  "data": {
    "source": "params", "as_of": null, "lookback": "7 points",
    "history": [ { "t": 0, "v": 1000 }, { "t": 6, "v": 3950 } ],
    "forecast": [ { "t": 7, "v": 4942.1, "low": 4002.8, "high": 5881.4 } ]
  },
  "assumptions": [
    "Best-fit model selected by SSE: exponential.",
    "Residuals are homoscedastic; CI is +/-1.96*sigma_resid (95%).",
    "Growth regime is stable over the forecast horizon."
  ],
  "caveats": [
    "Exponential growth cannot continue indefinitely; check the logistic K.",
    "Short series make the fit and CI unreliable."
  ],
  "used_llm": false
}
```

#### 1.3.5 Relational — **[FORWARD]** (KGIK-backed; `family: "relational"`)
The unified endpoint will accept `domain: "relational"` once the KGIK layer (§5) is wired in. Until then this is the *target* shape — note it stays inside the same envelope (`family: "relational"`, `models_used` referencing the link predictor):
**Request**
```json
{ "question": "If protocol X adopts standard Y, will project Z's TVL rise?",
  "params": { "domain": "relational", "source": "protocol:X", "relation": "adopts", "target": "project:Z", "horizon_hours": 720 } }
```
**Success (200)** — shape preview:
```json
{
  "question": "If protocol X adopts standard Y, will project Z's TVL rise?",
  "domain": "relational", "target": "project:Z", "horizon": "30.0d",
  "prediction": { "value": null, "unit": "probability", "point_estimate": null,
                  "interval": { "low": null, "high": null, "confidence": 0.0 }, "probability": 0.61 },
  "method": { "name": "KGIK temporal link prediction", "family": "relational",
              "models_used": ["xerte_link_predict","error_weighted_ensemble"],
              "math": "score(s,r,o,t) via temporal GNN embedding; sigmoid -> edge probability; calibrated by EnbPI residuals." },
  "drivers": { "subject": "protocol:X", "relation": "adopts", "object": "project:Z",
               "embedding_dim": 128, "top_path": ["protocol:X","uses","standard:Y","governs","project:Z"], "confidence_tier": "B" },
  "data": { "source": "kgik:graph@snapshot_2026-06-04", "as_of": 1749038400000, "lookback": "graph snapshot",
            "history": [], "forecast": [ { "t": "horizon", "v": 0.61, "low": null, "high": null } ] },
  "assumptions": ["Edge dynamics learned from confirmed historical KGIK transitions.",
                  "Relation type 'adopts' has >= 30 historical instances (else confidence tier drops)."],
  "caveats": ["Relational forecasts are correlational unless a causal screen (Granger/CCM) confirms direction.",
              "Sparse relations yield wide, low-confidence scores."],
  "used_llm": true
}
```

#### 1.3.6 Hard errors for `/functions/predict`
- **400 validation_error** — body missing `question`:
```json
{ "error": { "code": "validation_error", "message": "Field 'question' is required.", "status": 400,
  "details": { "field": "question" }, "request_id": "req_a1", "retryable": false } }
```
- **401 unauthorized** — `JARVIS_REQUIRE_AUTH=true` and no/invalid token (mirrors `server/auth.py`):
```json
{ "error": { "code": "unauthorized", "message": "missing bearer token", "status": 401, "request_id": "req_a2", "retryable": false } }
```
> Note: data-shortage is **not** a hard error here — it is the 200 soft result in §1.3.1.

---

## 2. `POST /v1/predict/explain` — drivers/patterns behind a forecast **[FORWARD]**

Returns the *why*: the patterns, motifs, regimes, lead-lag relationships, and feature attributions that produced (or would produce) a forecast. Stateless — re-derives explanation from the same inputs as `/functions/predict`, or from a prior `forecast_id` if one was persisted.

**Method/path:** `POST /v1/predict/explain`
**Auth:** `optional_bearer` · **Idempotency:** pure function of body · **Rate limit:** Forecast class (120/min).

### 2.1 Request schema
```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ExplainRequest",
  "type": "object",
  "oneOf": [ { "required": ["forecast_id"] }, { "required": ["question"] } ],
  "additionalProperties": false,
  "properties": {
    "forecast_id": { "type": "string", "description": "Id of a previously persisted forecast (from the self-improvement store)." },
    "question":    { "type": "string", "description": "Re-run the forecast inline then explain it (same routing as /functions/predict)." },
    "params":      { "type": ["object","null"], "description": "Same params object as /functions/predict." },
    "depth":       { "type": "string", "enum": ["summary","full"], "default": "summary", "description": "summary = top drivers/patterns; full = all motifs, change-points, attributions." },
    "max_patterns":{ "type": "integer", "minimum": 1, "maximum": 50, "default": 10 }
  }
}
```

### 2.2 Response schema
```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ExplainResponse",
  "type": "object",
  "required": ["forecast_ref","domain","drivers","patterns","attributions","narrative"],
  "properties": {
    "forecast_ref": { "type": "object", "properties": {
      "forecast_id": {"type":["string","null"]}, "question": {"type":["string","null"]}, "target": {"type":["string","null"]} } },
    "domain": { "type": "string", "enum": ["crypto","seismic","trajectory","growth","generic","relational"] },
    "drivers": { "type": "object", "additionalProperties": true, "description": "Same driver map as PredictResponse.drivers." },
    "patterns": { "type": "array", "items": { "type": "object", "required": ["type","summary","strength"], "properties": {
      "type":     { "type": "string", "enum": ["motif","regime","changepoint","lead_lag","seasonality","trend","anomaly"] },
      "summary":  { "type": "string" },
      "strength": { "type": "number", "minimum": 0, "maximum": 1, "description": "Normalised salience." },
      "span":     { "type": "object", "properties": { "start": {}, "end": {} }, "description": "Index/timestamp range in the series." },
      "evidence": { "type": "object", "additionalProperties": true }
    } } },
    "attributions": { "type": "array", "items": { "type": "object", "properties": {
      "feature": {"type":"string"}, "contribution": {"type":"number"}, "direction": {"type":"string","enum":["up","down","neutral"]} } },
      "description": "Feature attributions (e.g. permutation importance / SHAP-style), signed." },
    "narrative": { "type": "string", "description": "Plain-language synthesis safe to display." }
  }
}
```

### 2.3 Examples
**Request**
```json
{ "question": "XRP price in 48h", "depth": "full", "max_patterns": 5 }
```
**Success (200)**
```json
{
  "forecast_ref": { "forecast_id": null, "question": "XRP price in 48h", "target": "xrp" },
  "domain": "crypto",
  "drivers": { "drift_per_step": 0.0012, "volatility_per_step": 0.041, "probability_up": 0.512 },
  "patterns": [
    { "type": "regime", "summary": "Low-volatility consolidation over the last 18 days.", "strength": 0.74,
      "span": { "start": 1747569600000, "end": 1749038400000 }, "evidence": { "regime_vol": 0.031, "global_vol": 0.052 } },
    { "type": "changepoint", "summary": "Volatility step-down detected 18 days ago (PELT).", "strength": 0.66,
      "span": { "start": 1747569600000, "end": 1747569600000 }, "evidence": { "penalty": "BIC", "delta_vol": -0.021 } },
    { "type": "motif", "summary": "Recurring 5-day rounded-bottom motif (Matrix Profile).", "strength": 0.58,
      "span": { "start": 1748000000000, "end": 1748432000000 }, "evidence": { "matrix_profile_distance": 0.91 } }
  ],
  "attributions": [
    { "feature": "recent_drift", "contribution": 0.41, "direction": "up" },
    { "feature": "volatility", "contribution": 0.33, "direction": "neutral" },
    { "feature": "holt_trend", "contribution": 0.26, "direction": "up" }
  ],
  "narrative": "The slightly positive forecast is driven by a small positive drift in a low-volatility regime that began ~18 days ago after a detected volatility step-down. A recurring rounded-bottom motif weakly supports near-term stability. Uncertainty is dominated by per-step volatility (sigma=0.041)."
}
```
**Error (422 insufficient_data)** — no forecast and no resolvable series:
```json
{ "error": { "code": "insufficient_data", "message": "Cannot explain: no forecast_id resolved and the question yielded no usable series.",
  "status": 422, "details": { "needs": "a valid forecast_id, or a question+params that produce a forecast" },
  "request_id": "req_ex1", "retryable": false } }
```
**Error (404 not_found)** — bad `forecast_id`:
```json
{ "error": { "code": "not_found", "message": "forecast_id 'fc_nope' not found.", "status": 404,
  "details": { "forecast_id": "fc_nope" }, "request_id": "req_ex2", "retryable": false } }
```

---

## 3. `GET /v1/predict/skill` — self-improvement scorecard **[FORWARD]**

Accuracy-over-time: realized-vs-predicted skill scores (CRPS, RMSE, MAE, interval coverage, Brier for probabilistic forecasts) computed by the self-improvement loop (`08_SELF_IMPROVEMENT_AND_MLOPS.md`) and benchmarked against a climatology/naive baseline.

**Method/path:** `GET /v1/predict/skill`
**Auth:** `optional_bearer` · **Cache-Control:** `public, max-age=60` · **Rate limit:** Query class (240/min).

### 3.1 Query parameters
| Param | Type | Default | Notes |
|---|---|---|---|
| `domain` | enum (`crypto\|seismic\|trajectory\|growth\|generic\|relational`) | all | Filter. |
| `target` | string | all | e.g. `xrp`. |
| `metric` | enum (`crps\|rmse\|mae\|coverage\|brier\|skill_score`) | `skill_score` | Primary metric in the headline series. |
| `from` | ISO-8601 / epoch ms | -90d | Window start. |
| `to` | ISO-8601 / epoch ms | now | Window end. |
| `bucket` | enum (`day\|week\|month`) | `week` | Aggregation granularity. |

### 3.2 Response schema
```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SkillResponse",
  "type": "object",
  "required": ["window","filters","headline","series","baselines"],
  "properties": {
    "window":  { "type": "object", "properties": { "from": {"type":"integer"}, "to": {"type":"integer"}, "bucket": {"type":"string"} } },
    "filters": { "type": "object", "properties": { "domain": {"type":["string","null"]}, "target": {"type":["string","null"]}, "metric": {"type":"string"} } },
    "headline": { "type": "object", "properties": {
      "n_forecasts": {"type":"integer"}, "n_scored": {"type":"integer"},
      "crps": {"type":["number","null"]}, "rmse": {"type":["number","null"]}, "mae": {"type":["number","null"]},
      "coverage_90": {"type":["number","null"]}, "coverage_95": {"type":["number","null"]},
      "brier": {"type":["number","null"]},
      "skill_score": {"type":["number","null"], "description": "1 - score/score_baseline; >0 beats baseline."},
      "calibration": { "type": "object", "properties": { "ece": {"type":["number","null"]}, "psi_drift": {"type":["number","null"]} } } } },
    "series": { "type": "array", "items": { "type": "object", "properties": {
      "t": {"type":"integer"}, "metric_value": {"type":["number","null"]}, "n": {"type":"integer"} } } },
    "baselines": { "type": "object", "properties": {
      "climatology": {"type":["number","null"]}, "naive_persistence": {"type":["number","null"]} } }
  }
}
```

### 3.3 Examples
**Request:** `GET /v1/predict/skill?domain=crypto&target=xrp&metric=crps&bucket=week&from=2026-03-06`
**Success (200)**
```json
{
  "window": { "from": 1741219200000, "to": 1749038400000, "bucket": "week" },
  "filters": { "domain": "crypto", "target": "xrp", "metric": "crps" },
  "headline": {
    "n_forecasts": 412, "n_scored": 388, "crps": 0.0214, "rmse": 0.031, "mae": 0.024,
    "coverage_90": 0.88, "coverage_95": 0.94, "brier": 0.221, "skill_score": 0.18,
    "calibration": { "ece": 0.041, "psi_drift": 0.12 }
  },
  "series": [
    { "t": 1741219200000, "metric_value": 0.0251, "n": 41 },
    { "t": 1741824000000, "metric_value": 0.0233, "n": 47 },
    { "t": 1748044800000, "metric_value": 0.0198, "n": 52 }
  ],
  "baselines": { "climatology": 0.0261, "naive_persistence": 0.0247 }
}
```
**Error (422 insufficient_data)** — no scored forecasts in the window:
```json
{ "error": { "code": "insufficient_data", "message": "No realized outcomes scored for the requested filters/window.",
  "status": 422, "details": { "n_scored": 0 }, "request_id": "req_sk1", "retryable": false } }
```

---

## 4. History Lake query **[FORWARD]**

Persisted world-data time-series + outcomes (`05_DATA_MODEL_AND_SCHEMAS.md`). Two endpoints: a paginated catalog (`/v1/history/series`) and a single-series fetch with the actual points (`/v1/history/series/{id}`).

### 4.1 `GET /v1/history/series` — catalog / search
**Auth:** `optional_bearer` · **Cache-Control:** `public, max-age=30` · **Rate limit:** Query (240/min) · **Pagination:** cursor (§0.6).

#### Query parameters
| Param | Type | Default | Notes |
|---|---|---|---|
| `domain` | enum | all | `crypto\|seismic\|fx\|sim\|kgik\|...` (open vocabulary from feed adapters). |
| `source` | string | all | e.g. `coingecko`, `usgs`, `er-api`. |
| `entity` | string | all | e.g. `ripple`, `region:tokyo`. |
| `q` | string | — | Free-text over `entity`/`label`. |
| `as_of_from`/`as_of_to` | ISO/ms | — | Filter by last-updated. |
| `limit` / `cursor` | int / string | 50 / — | Pagination. |

#### Response schema (catalog item)
```jsonschema
{
  "type": "object",
  "required": ["items","page"],
  "properties": {
    "items": { "type": "array", "items": { "type": "object", "required": ["id","domain","source","entity","unit","n_points","first_t","last_t"], "properties": {
      "id":       {"type":"string", "description":"Stable series id, e.g. 'crypto:ripple:usd:1d'."},
      "domain":   {"type":"string"},
      "source":   {"type":"string"},
      "entity":   {"type":"string"},
      "label":    {"type":["string","null"]},
      "unit":     {"type":["string","null"]},
      "interval": {"type":["string","null"], "description":"Sampling cadence, e.g. '1d','1h','event'."},
      "n_points": {"type":"integer"},
      "first_t":  {"type":["integer","null"]},
      "last_t":   {"type":["integer","null"]},
      "freshness_seconds": {"type":["integer","null"]}
    } } },
    "page": { "type": "object", "properties": { "limit": {"type":"integer"}, "next_cursor": {"type":["string","null"]}, "has_more": {"type":"boolean"}, "total_estimate": {"type":["integer","null"]} } }
  }
}
```

#### Examples
**Request:** `GET /v1/history/series?domain=crypto&q=rip&limit=2`
**Success (200)**
```json
{
  "items": [
    { "id": "crypto:ripple:usd:1d", "domain": "crypto", "source": "coingecko", "entity": "ripple",
      "label": "XRP / USD", "unit": "USD", "interval": "1d", "n_points": 365,
      "first_t": 1717545600000, "last_t": 1749038400000, "freshness_seconds": 240 }
  ],
  "page": { "limit": 2, "next_cursor": null, "has_more": false, "total_estimate": 1 }
}
```

### 4.2 `GET /v1/history/series/{id}` — fetch points
**Auth:** `optional_bearer` · **Cache-Control:** `public, max-age=30` · **Rate limit:** Query (240/min).

#### Path + query parameters
| Param | In | Type | Default | Notes |
|---|---|---|---|---|
| `id` | path | string | — | Series id from the catalog. |
| `from`/`to` | query | ISO/ms | full range | Time window. |
| `limit` | query | int | 1000 (max 50000) | Max points returned. |
| `cursor` | query | string | — | Pagination when the window exceeds `limit`. |
| `downsample` | query | enum (`none\|lttb\|mean`) | `none` | Server-side downsampling for charting. |
| `outcomes` | query | bool | `false` | When `true`, include realized outcomes joined for skill scoring. |

#### Response schema
```jsonschema
{
  "type": "object",
  "required": ["id","meta","points","page"],
  "properties": {
    "id":   {"type":"string"},
    "meta": { "type": "object", "properties": {
      "domain":{"type":"string"}, "source":{"type":"string"}, "entity":{"type":"string"},
      "unit":{"type":["string","null"]}, "interval":{"type":["string","null"]} } },
    "points": { "type": "array", "items": { "type": "object", "required": ["t","v"], "properties": {
      "t": {"type":"integer","description":"epoch ms"}, "v": {"type":["number","null"]},
      "outcome": {"type":["number","null"], "description":"Realized value when outcomes=true."} } } },
    "page": { "type": "object", "properties": { "limit":{"type":"integer"}, "next_cursor":{"type":["string","null"]}, "has_more":{"type":"boolean"} } }
  }
}
```

#### Examples
**Request:** `GET /v1/history/series/crypto:ripple:usd:1d?from=2026-06-01&limit=3`
**Success (200)**
```json
{
  "id": "crypto:ripple:usd:1d",
  "meta": { "domain": "crypto", "source": "coingecko", "entity": "ripple", "unit": "USD", "interval": "1d" },
  "points": [
    { "t": 1748736000000, "v": 0.501 },
    { "t": 1748822400000, "v": 0.509 },
    { "t": 1748908800000, "v": 0.5189 }
  ],
  "page": { "limit": 3, "next_cursor": "eyJvZmYiOjN9", "has_more": true }
}
```
**Error (404 not_found):**
```json
{ "error": { "code": "not_found", "message": "Series 'crypto:nope:usd:1d' does not exist.", "status": 404,
  "details": { "id": "crypto:nope:usd:1d" }, "request_id": "req_hl1", "retryable": false } }
```

---

## 5. `POST /v1/patterns/scan` — motif/regime/changepoint discovery **[FORWARD]**

Training-free pattern discovery on a series (Matrix Profile / STUMPY motifs + anomalies, HDBSCAN regimes, PELT/BOCPD change-points; `06_ALGORITHMS.md`). Accepts an inline series or a History Lake `series_id`.

**Method/path:** `POST /v1/patterns/scan`
**Auth:** `optional_bearer` · **Idempotency:** pure function of body · **Rate limit:** Heavy compute (30/min).

### 5.1 Request schema
```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PatternScanRequest",
  "type": "object",
  "oneOf": [ { "required": ["series"] }, { "required": ["series_id"] } ],
  "additionalProperties": false,
  "properties": {
    "series":    { "type": "array", "items": { "oneOf": [ {"type":"number"}, {"type":"object","properties":{"t":{"type":"number"},"v":{"type":"number"}},"required":["v"]} ], "minItems": 8 } },
    "series_id": { "type": "string", "description": "History Lake id to scan instead of an inline series." },
    "from": { "type": ["integer","string"] }, "to": { "type": ["integer","string"] },
    "detectors": { "type": "array", "items": { "type": "string", "enum": ["motif","anomaly","regime","changepoint","seasonality"] },
      "default": ["motif","anomaly","regime","changepoint"] },
    "window": { "type": "integer", "minimum": 3, "description": "Matrix Profile subsequence length m. Auto if omitted." },
    "max_results_per_detector": { "type": "integer", "minimum": 1, "maximum": 100, "default": 10 },
    "changepoint": { "type": "object", "properties": {
      "method": { "type": "string", "enum": ["pelt","bocpd"], "default": "pelt" },
      "penalty": { "type": "string", "enum": ["bic","aic","mbic"], "default": "bic" } } }
  }
}
```

### 5.2 Response schema
```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PatternScanResponse",
  "type": "object",
  "required": ["series_ref","n_points","motifs","anomalies","regimes","changepoints","math"],
  "properties": {
    "series_ref": { "type": "object", "properties": { "series_id": {"type":["string","null"]}, "inline": {"type":"boolean"} } },
    "n_points": { "type": "integer" },
    "window": { "type": "integer" },
    "motifs": { "type": "array", "items": { "type": "object", "properties": {
      "start_a": {"type":"integer"}, "start_b": {"type":"integer"}, "length": {"type":"integer"},
      "distance": {"type":"number","description":"z-normalised Euclidean (lower = more similar)."}, "strength": {"type":"number"} } } },
    "anomalies": { "type": "array", "items": { "type": "object", "properties": {
      "index": {"type":"integer"}, "t": {"type":["integer","null"]}, "score": {"type":"number"}, "matrix_profile": {"type":"number"} } } },
    "regimes": { "type": "array", "items": { "type": "object", "properties": {
      "label": {"type":"integer"}, "start": {"type":"integer"}, "end": {"type":"integer"}, "summary": {"type":"string"}, "stats": {"type":"object"} } } },
    "changepoints": { "type": "array", "items": { "type": "object", "properties": {
      "index": {"type":"integer"}, "t": {"type":["integer","null"]}, "confidence": {"type":"number"}, "kind": {"type":"string","enum":["mean","variance","trend"]} } } },
    "math": { "type": "string" }
  }
}
```

### 5.3 Examples
**Request**
```json
{ "series_id": "crypto:ripple:usd:1d", "from": "2026-03-06",
  "detectors": ["motif","changepoint","regime"], "window": 5,
  "changepoint": { "method": "pelt", "penalty": "bic" } }
```
**Success (200)**
```json
{
  "series_ref": { "series_id": "crypto:ripple:usd:1d", "inline": false },
  "n_points": 90, "window": 5,
  "motifs": [ { "start_a": 41, "start_b": 78, "length": 5, "distance": 0.91, "strength": 0.58 } ],
  "anomalies": [ { "index": 63, "t": 1748044800000, "score": 0.87, "matrix_profile": 3.21 } ],
  "regimes": [
    { "label": 0, "start": 0, "end": 53, "summary": "high-vol downtrend", "stats": { "vol": 0.052, "slope": -0.004 } },
    { "label": 1, "start": 54, "end": 89, "summary": "low-vol consolidation", "stats": { "vol": 0.031, "slope": 0.0006 } }
  ],
  "changepoints": [ { "index": 54, "t": 1747569600000, "confidence": 0.72, "kind": "variance" } ],
  "math": "Matrix Profile (STUMPY) z-norm Euclidean motifs/discords; PELT change-points (BIC penalty); HDBSCAN regimes on rolling [vol,slope] features."
}
```
**Error (422 insufficient_data)** — too few points:
```json
{ "error": { "code": "insufficient_data", "message": "Need >= 8 points to scan for patterns; got 4.",
  "status": 422, "details": { "n_points": 4, "min": 8 }, "request_id": "req_ps1", "retryable": false } }
```

---

## 6b. KGIK relational layer **[FORWARD]**

### 6b.1 `GET /v1/kgik/graph` — read the temporal knowledge graph
**Auth:** `optional_bearer` · **Cache-Control:** `public, max-age=30` · **Rate limit:** Query (240/min) · **Pagination:** cursor over edges.

#### Query parameters
| Param | Type | Default | Notes |
|---|---|---|---|
| `node` | string | — | Center the subgraph on this node id (e.g. `protocol:X`). |
| `depth` | int (1–3) | 1 | Neighbourhood radius from `node`. |
| `relation` | string | all | Filter by edge relation type. |
| `min_confidence` | number 0–1 | 0 | Drop edges below this confidence. |
| `as_of` | ISO/ms | now | Temporal snapshot (graph is time-aware). |
| `limit` / `cursor` | int / string | 200 / — | Edge pagination. |

#### Response schema
```jsonschema
{
  "type": "object",
  "required": ["snapshot_as_of","nodes","edges","page"],
  "properties": {
    "snapshot_as_of": {"type":"integer"},
    "nodes": { "type": "array", "items": { "type": "object", "required": ["id","type"], "properties": {
      "id": {"type":"string"}, "type": {"type":"string"}, "label": {"type":["string","null"]},
      "attributes": {"type":"object"} } } },
    "edges": { "type": "array", "items": { "type": "object", "required": ["source","relation","target","confidence"], "properties": {
      "source": {"type":"string"}, "relation": {"type":"string"}, "target": {"type":"string"},
      "confidence": {"type":"number","minimum":0,"maximum":1},
      "confidence_tier": {"type":"string","enum":["A","B","C","D"]},
      "first_seen": {"type":["integer","null"]}, "last_seen": {"type":["integer","null"]},
      "support": {"type":"integer","description":"# historical instances backing the edge."},
      "learned": {"type":"boolean","description":"true if promoted from a confirmed pattern, false if hand-authored ontology."} } } },
    "page": { "type": "object", "properties": { "limit":{"type":"integer"}, "next_cursor":{"type":["string","null"]}, "has_more":{"type":"boolean"} } }
  }
}
```

#### Examples
**Request:** `GET /v1/kgik/graph?node=protocol:X&depth=1&min_confidence=0.3`
**Success (200)**
```json
{
  "snapshot_as_of": 1749038400000,
  "nodes": [
    { "id": "protocol:X", "type": "protocol", "label": "Protocol X", "attributes": { "tvl_usd": 1.2e9 } },
    { "id": "standard:Y", "type": "standard", "label": "Standard Y", "attributes": {} },
    { "id": "project:Z", "type": "project", "label": "Project Z", "attributes": {} }
  ],
  "edges": [
    { "source": "protocol:X", "relation": "uses", "target": "standard:Y", "confidence": 0.91, "confidence_tier": "A",
      "first_seen": 1717545600000, "last_seen": 1749038400000, "support": 144, "learned": false },
    { "source": "standard:Y", "relation": "governs", "target": "project:Z", "confidence": 0.47, "confidence_tier": "C",
      "first_seen": 1735689600000, "last_seen": 1749038400000, "support": 31, "learned": true }
  ],
  "page": { "limit": 200, "next_cursor": null, "has_more": false }
}
```
**Error (422 unknown_entity):**
```json
{ "error": { "code": "unknown_entity", "message": "Node 'protocol:Nope' is not in the KGIK graph.", "status": 422,
  "details": { "node": "protocol:Nope" }, "request_id": "req_kg1", "retryable": false } }
```

### 6b.2 `POST /v1/kgik/link-predict` — relational forecasts
**Auth:** `optional_bearer` · **Idempotency:** pure function of body · **Rate limit:** Forecast (120/min).

#### Request schema
```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LinkPredictRequest",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "source":   { "type": ["string","null"], "description": "Subject node id. Null = predict missing subject." },
    "relation": { "type": ["string","null"], "description": "Relation type. Null = predict the relation." },
    "target":   { "type": ["string","null"], "description": "Object node id. Null = predict missing object (ranking)." },
    "horizon_hours": { "type": ["number","null"], "description": "Temporal horizon for a will-this-edge-form forecast." },
    "as_of":    { "type": ["integer","string","null"] },
    "top_k":    { "type": "integer", "minimum": 1, "maximum": 100, "default": 10, "description": "When ranking candidates for a null slot." }
  },
  "anyOf": [ { "required": ["source"] }, { "required": ["target"] } ]
}
```

#### Response schema
```jsonschema
{
  "type": "object",
  "required": ["query","predictions","method","as_of"],
  "properties": {
    "query": { "type": "object", "properties": { "source": {}, "relation": {}, "target": {}, "horizon_hours": {} } },
    "as_of": {"type":"integer"},
    "predictions": { "type": "array", "items": { "type": "object", "required": ["source","relation","target","probability"], "properties": {
      "source": {"type":"string"}, "relation": {"type":"string"}, "target": {"type":"string"},
      "probability": {"type":"number","minimum":0,"maximum":1},
      "score": {"type":"number","description":"Pre-sigmoid model score."},
      "confidence_tier": {"type":"string","enum":["A","B","C","D"]},
      "top_path": {"type":"array","items":{"type":"string"},"description":"Explanatory path (xERTE-style)."} } } },
    "method": { "type": "object", "properties": {
      "name": {"type":"string"}, "family": {"type":"string","const":"relational"}, "models_used": {"type":"array","items":{"type":"string"}}, "math": {"type":"string"} } }
  }
}
```

#### Examples
**Request** (rank likely objects):
```json
{ "source": "protocol:X", "relation": "adopts", "target": null, "horizon_hours": 720, "top_k": 3 }
```
**Success (200)**
```json
{
  "query": { "source": "protocol:X", "relation": "adopts", "target": null, "horizon_hours": 720 },
  "as_of": 1749038400000,
  "predictions": [
    { "source": "protocol:X", "relation": "adopts", "target": "standard:Y", "probability": 0.61, "score": 0.45,
      "confidence_tier": "B", "top_path": ["protocol:X","uses","standard:Y"] },
    { "source": "protocol:X", "relation": "adopts", "target": "standard:W", "probability": 0.29, "score": -0.9,
      "confidence_tier": "C", "top_path": ["protocol:X","peer_of","protocol:Q","adopts","standard:W"] }
  ],
  "method": { "name": "KGIK temporal link prediction", "family": "relational",
    "models_used": ["xerte_link_predict","error_weighted_ensemble"],
    "math": "temporal GNN embedding score(s,r,o,t); sigmoid->prob; EnbPI-calibrated; explanatory subgraph via xERTE." }
}
```
**Error (422 unknown_entity):**
```json
{ "error": { "code": "unknown_entity", "message": "source 'protocol:Ghost' not found in graph.", "status": 422,
  "details": { "source": "protocol:Ghost" }, "request_id": "req_lp1", "retryable": false } }
```

---

## 6c. `GET /v1/models/registry` — model registry **[FORWARD]**

Lists the forecast models/ensembles available to the engine with their status, version, calibration, and recent skill (`08_SELF_IMPROVEMENT_AND_MLOPS.md`).

**Method/path:** `GET /v1/models/registry`
**Auth:** `optional_bearer` · **Cache-Control:** `public, max-age=60` · **Rate limit:** Query (240/min).

### Query parameters
| Param | Type | Default | Notes |
|---|---|---|---|
| `domain` | enum | all | Filter to models serving a domain. |
| `status` | enum (`active\|shadow\|deprecated\|unavailable`) | all | |
| `family` | enum (`time_series\|event_probability\|trajectory\|growth\|relational\|ensemble`) | all | |

### Response schema
```jsonschema
{
  "type": "object",
  "required": ["items"],
  "properties": {
    "items": { "type": "array", "items": { "type": "object", "required": ["id","name","family","status","version"], "properties": {
      "id":      {"type":"string"},
      "name":    {"type":"string"},
      "family":  {"type":"string","enum":["time_series","event_probability","trajectory","growth","relational","ensemble"]},
      "domains": {"type":"array","items":{"type":"string"}},
      "status":  {"type":"string","enum":["active","shadow","deprecated","unavailable"]},
      "version": {"type":"string"},
      "source":  {"type":["string","null"],"description":"Citation/provenance, e.g. 'TimesFM 2.5 (Apache-2.0)' or 'native: prediction.gbm_montecarlo_forecast'."},
      "weight":  {"type":["number","null"],"description":"Current ensemble weight (error-weighted)."},
      "calibration": { "type": "object", "properties": { "ece": {"type":["number","null"]}, "last_calibrated": {"type":["integer","null"]} } },
      "skill":   { "type": "object", "properties": { "crps": {"type":["number","null"]}, "rmse": {"type":["number","null"]}, "coverage_90": {"type":["number","null"]}, "n_scored": {"type":"integer"} } },
      "updated_at": {"type":["integer","null"]}
    } } }
  }
}
```

### Examples
**Request:** `GET /v1/models/registry?domain=crypto&status=active`
**Success (200)**
```json
{
  "items": [
    { "id": "gbm_mc_holt", "name": "GBM Monte-Carlo + Holt blend", "family": "time_series",
      "domains": ["crypto","generic"], "status": "active", "version": "1.0.0",
      "source": "native: prediction.gbm_montecarlo_forecast", "weight": 0.55,
      "calibration": { "ece": 0.041, "last_calibrated": 1748908800000 },
      "skill": { "crps": 0.0214, "rmse": 0.031, "coverage_90": 0.88, "n_scored": 388 },
      "updated_at": 1749038400000 },
    { "id": "timesfm_2_5", "name": "TimesFM 2.5 (zero-shot foundation TS)", "family": "time_series",
      "domains": ["crypto","growth","generic"], "status": "shadow", "version": "2.5.0",
      "source": "TimesFM 2.5 (Apache-2.0)", "weight": 0.0,
      "calibration": { "ece": null, "last_calibrated": null },
      "skill": { "crps": 0.0231, "rmse": 0.034, "coverage_90": 0.86, "n_scored": 120 },
      "updated_at": 1749038400000 }
  ]
}
```

---

## 6d. `POST /v1/predict/backtest` — historical skill evaluation **[FORWARD]**

Runs a rolling-origin backtest of one or more models over a historical window and computes skill scores vs baselines. **Persists** a run (so it is the one mutating endpoint here) and supports async execution.

**Method/path:** `POST /v1/predict/backtest`
**Auth:** **`require_bearer`** (always) · **Idempotency:** `Idempotency-Key` header · **Rate limit:** Job submission (10/min).

### Request schema
```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "BacktestRequest",
  "type": "object",
  "required": ["series_id","horizon_hours"],
  "additionalProperties": false,
  "properties": {
    "series_id":     { "type": "string", "description": "History Lake series to backtest on." },
    "models":        { "type": "array", "items": {"type":"string"}, "description": "Model ids (from /v1/models/registry). Default: all active for the domain." },
    "horizon_hours": { "type": "number", "exclusiveMinimum": 0 },
    "from":          { "type": ["integer","string"] },
    "to":            { "type": ["integer","string"] },
    "scheme":        { "type": "string", "enum": ["rolling_origin","expanding_window","sliding_window"], "default": "rolling_origin" },
    "step":          { "type": "integer", "minimum": 1, "default": 1, "description": "Origins advance by this many samples." },
    "metrics":       { "type": "array", "items": {"type":"string","enum":["crps","rmse","mae","coverage","brier"]}, "default": ["crps","rmse","coverage"] },
    "baselines":     { "type": "array", "items": {"type":"string","enum":["climatology","naive_persistence","seasonal_naive"]}, "default": ["climatology","naive_persistence"] },
    "async":         { "type": "boolean", "default": false, "description": "If true, returns 202 + run_id to poll; large windows should set true." }
  }
}
```

### Response schemas
**Synchronous (200)** — completed run:
```jsonschema
{
  "type": "object",
  "required": ["run_id","status","series_id","horizon_hours","results","baselines","window","n_origins"],
  "properties": {
    "run_id": {"type":"string"},
    "status": {"type":"string","enum":["completed"]},
    "series_id": {"type":"string"},
    "horizon_hours": {"type":"number"},
    "window": { "type":"object", "properties": { "from": {"type":"integer"}, "to": {"type":"integer"} } },
    "n_origins": {"type":"integer"},
    "results": { "type": "array", "items": { "type": "object", "properties": {
      "model": {"type":"string"},
      "crps": {"type":["number","null"]}, "rmse": {"type":["number","null"]}, "mae": {"type":["number","null"]},
      "coverage_90": {"type":["number","null"]}, "brier": {"type":["number","null"]},
      "skill_score": {"type":["number","null"]} } } },
    "baselines": { "type": "object", "additionalProperties": {"type":["number","null"]} }
  }
}
```
**Asynchronous (202)** — accepted job:
```json
{ "run_id": "bt_8c2f", "status": "queued", "poll": "/v1/predict/backtest/bt_8c2f" }
```
(Polling `GET /v1/predict/backtest/{run_id}` returns `status` ∈ `{queued,running,completed,failed}`; on `completed` the body matches the synchronous schema.)

### Examples
**Request**
```
POST /v1/predict/backtest
Authorization: Bearer <key>
Idempotency-Key: bt_xrp_2026-06-04_run7
```
```json
{ "series_id": "crypto:ripple:usd:1d", "models": ["gbm_mc_holt","timesfm_2_5"],
  "horizon_hours": 48, "from": "2026-03-06", "to": "2026-06-04",
  "scheme": "rolling_origin", "metrics": ["crps","rmse","coverage"] }
```
**Success (200)**
```json
{
  "run_id": "bt_8c2f", "status": "completed", "series_id": "crypto:ripple:usd:1d", "horizon_hours": 48,
  "window": { "from": 1741219200000, "to": 1749038400000 }, "n_origins": 88,
  "results": [
    { "model": "gbm_mc_holt", "crps": 0.0214, "rmse": 0.031, "coverage_90": 0.88, "skill_score": 0.18 },
    { "model": "timesfm_2_5", "crps": 0.0201, "rmse": 0.029, "coverage_90": 0.86, "skill_score": 0.23 }
  ],
  "baselines": { "climatology": 0.0261, "naive_persistence": 0.0247 }
}
```
**Error (401 unauthorized)** — write endpoint requires a token even when `JARVIS_REQUIRE_AUTH=false`:
```json
{ "error": { "code": "unauthorized", "message": "missing bearer token", "status": 401, "request_id": "req_bt1", "retryable": false } }
```
**Error (409 idempotency_conflict)** — same key, different body:
```json
{ "error": { "code": "idempotency_conflict", "message": "Idempotency-Key already used with a different request body.",
  "status": 409, "details": { "idempotency_key": "bt_xrp_2026-06-04_run7" }, "request_id": "req_bt2", "retryable": false } }
```
**Error (404 not_found)** — bad series:
```json
{ "error": { "code": "not_found", "message": "series_id 'crypto:nope:usd:1d' not found.", "status": 404,
  "details": { "series_id": "crypto:nope:usd:1d" }, "request_id": "req_bt3", "retryable": false } }
```

---

## 6. VERSIONING & DEPRECATION STRATEGY

### 6.1 URI versioning (`/v1`)
- **Scheme:** path-prefix versioning. The major version lives in the URL: `/v1/...`. This is chosen over header-based versioning for cache-friendliness and because the existing client (`kimiClient.request(path, …)`) trivially supports arbitrary paths.
- **Major (`/v1` → `/v2`)** is reserved for **breaking** changes (removing/renaming a field, changing a type, tightening an enum, changing default semantics). A new major is mounted as a *parallel* router; the old major keeps running through its deprecation window.
- **Minor / additive changes are NOT a new version.** Adding a new optional field, a new enum *member* with a documented default, a new endpoint, or a new optional query param is backward-compatible and ships under the same `/v1`. **Clients MUST ignore unknown fields** and MUST treat unknown enum values as the documented fallback (`generic`/`unknown`).
- **The live un-versioned `POST /functions/predict` is permanent.** It is treated as `v1` semantics and additionally aliased at `/v1/functions/predict`. It will never be removed; breaking changes to its shape would ship at `/v2/functions/predict` only.
- **Discovery:** `GET /v1/` returns `{ "version": "1.x.y", "endpoints": [...], "deprecations": [...] }`. The response header `X-API-Version: 1.4.0` is sent on every response (semantic version of the running build).

### 6.2 Deprecation policy
- **Announcement:** a deprecated endpoint/field is documented in this file and surfaced at `GET /v1/` under `deprecations[]` with `since`, `sunset`, and `replacement`.
- **Headers:** deprecated responses carry `Deprecation: true`, `Sunset: <HTTP-date>` (RFC 8594), and `Link: <replacement>; rel="successor-version"`.
- **Window:** minimum **90 days** between `Deprecation` first appearing and `Sunset`. After sunset, the endpoint returns `410 Gone` with `code: "deprecated_endpoint"` for one further release, then `404`.
- **Field deprecation:** a deprecated *field* is retained (still populated) for the full window; its replacement ships alongside it. No silent removals.

---

## 7. ERROR TAXONOMY (standard codes)

`code` is the stable contract; clients branch on it. `retryable` and typical `status` are advisory.

| `code` | Typical HTTP | retryable | Meaning / when emitted | `details` keys |
|---|---|---|---|---|
| `insufficient_data` | 200 (soft, on `/functions/predict`) · 422 (`/v1` analytics) | no | Not enough data to produce a meaningful result. On `/functions/predict` this is the 200 on-schema `method.name="insufficient_data"` result with a `caveats[]` explanation; on `/v1` analytics it is a 422 envelope. | `needs`, `n_points`, `min` |
| `unknown_entity` | 422 (or 404 for path ids) | no | A referenced ticker / node / region / series entity does not exist or could not be resolved. | `entity`, `node`, `source`, `series_id` |
| `upstream_feed_error` | 502 | **yes** | A required external feed (CoinGecko, USGS, FX) failed hard (network down, non-200, malformed). Note the live predictor *degrades to `insufficient_data` (200)* when a feed merely returns nothing; this hard code is for the new endpoints that cannot degrade. | `feed`, `upstream_status`, `retry_after_seconds` |
| `model_unavailable` | 503 | **yes** | The requested/required forecast model or inference backend (e.g. remote GPU at `PREDICT_GPU_URL`, a foundation-TS server) is down or not loaded. | `model`, `backend` |
| `validation_error` | 400 | no | Malformed JSON, wrong types, missing required field, failed JSON-Schema validation. | `field`, `errors[]` |
| `unauthorized` | 401 | no | Missing or invalid bearer token (matches `server/auth.py` messages `"missing bearer token"` / `"invalid token"`). | — |
| `forbidden` | 403 | no | Authenticated but not permitted for this resource/action. | `resource` |
| `not_found` | 404 | no | Unknown route or unknown path resource (`series_id`, `run_id`, `forecast_id`). | id field |
| `rate_limited` | 429 | **yes** | Token bucket exhausted (§0.7). | `retry_after_seconds`, `limit` |
| `idempotency_conflict` | 409 | no | `Idempotency-Key` reused with a different body. | `idempotency_key` |
| `deprecated_endpoint` | 410 | no | Called after its `Sunset` date (§6.2). | `sunset`, `replacement` |
| `payload_too_large` | 413 | no | Request body / inline series exceeds limits (e.g. series > 50k points). | `limit`, `received` |
| `timeout` | 504 | **yes** | A bounded compute/feed step exceeded its deadline. | `stage`, `deadline_ms` |
| `internal_error` | 500 | **yes** | Unhandled server bug. Rare — the predictor self-handles and degrades to `insufficient_data`. | — |

**Soft-vs-hard reminder:** `insufficient_data`, `upstream_feed_error`, and `model_unavailable` are the three conditions that the **live `/functions/predict`** swallows into a 200 soft `insufficient_data` result (it "never 500s a normal query"). The hard 502/503 forms apply to the **new `/v1`** endpoints, which surface them in the error envelope so callers can retry.

---

## 8. FRONTEND CONTRACT

### 8.1 How `src/pages/PredictionOracle.jsx` calls the engine (the `kimiClient.functions.predict` pattern)
The page wraps the function proxy in `src/api/kimiClient.js`:

```js
// src/pages/PredictionOracle.jsx (existing)
import { kimiClient } from "@/api/kimiClient";
const predict = (payload) => kimiClient.functions.predict(payload);
// ...
const res = await predict(params ? { question, params } : { question });
```

`kimiClient.functions` is a `Proxy`: `kimiClient.functions.predict(payload)` POSTs `payload` (JSON) to `/functions/predict`, automatically attaching `Authorization: Bearer <appParams.apiKey>` **only when a key is configured** — which dovetails with `optional_bearer` (public by default). Non-2xx responses throw an `Error` with `.status` set, which the page catches into the `error` state and `DataState` renders. A 200 soft `insufficient_data` result is **not** thrown — it flows into `setResult` and renders normally (the caveats appear in the red CAVEATS panel). This is the desired behaviour and must be preserved.

### 8.2 Calling the new `/v1` endpoints from the frontend
The function proxy only targets `/functions/<name>`. For the `/v1` endpoints, use the lower-level `kimiClient.request(path, options)` (same base URL + auth header logic). Recommended thin wrappers to add to `kimiClient` (additive, non-breaking):

```js
// Proposed additions to src/api/kimiClient.js (consistent with existing request()):
export const oracle = {
  predict:      (body) => kimiClient.functions.predict(body),                                  // unchanged
  explain:      (body) => kimiClient.request("/v1/predict/explain", { method: "POST", body: JSON.stringify(body) }),
  skill:        (qs)   => kimiClient.request(`/v1/predict/skill${toQuery(qs)}`),
  seriesList:   (qs)   => kimiClient.request(`/v1/history/series${toQuery(qs)}`),
  series:       (id, qs) => kimiClient.request(`/v1/history/series/${encodeURIComponent(id)}${toQuery(qs)}`),
  scan:         (body) => kimiClient.request("/v1/patterns/scan", { method: "POST", body: JSON.stringify(body) }),
  kgikGraph:    (qs)   => kimiClient.request(`/v1/kgik/graph${toQuery(qs)}`),
  linkPredict:  (body) => kimiClient.request("/v1/kgik/link-predict", { method: "POST", body: JSON.stringify(body) }),
  models:       (qs)   => kimiClient.request(`/v1/models/registry${toQuery(qs)}`),
  backtest:     (body, idemKey) => kimiClient.request("/v1/predict/backtest",
                  { method: "POST", body: JSON.stringify(body),
                    headers: idemKey ? { "Idempotency-Key": idemKey } : {} }),
};
// toQuery(obj) -> "" or "?a=1&b=2" (skip null/undefined).
```

### 8.3 Error handling contract for the UI
- `request()` already throws `new Error("API <status>: <text>")` with `err.status`. UI code should parse the JSON error envelope (§0.4) from the thrown text when present and branch on `error.code`:
  - `insufficient_data` (422 on `/v1`) → render an informational empty-state, not a red error.
  - `rate_limited` (429) → show "try again in N s" using `details.retry_after_seconds`.
  - `upstream_feed_error` / `model_unavailable` (502/503, `retryable:true`) → offer a Retry button.
  - `unauthorized` (401) → prompt for / re-check the API key (`kimiClient.auth.me`).
- The existing `ResultView`, `ForecastChart`, `HonestyList`, and badge rendering consume the **PredictResponse** envelope unchanged; any `/v1` endpoint that returns a forecast MUST emit that exact envelope so the same components render it without modification. `data.history[]` / `data.forecast[]` MUST use `{t,v,low?,high?}` with `t` as epoch ms (or an integer index) — exactly what `ForecastChart.labelT` expects.

---

## 9. TRACEABILITY

| Endpoint | Source / target component | Spec section |
|---|---|---|
| `POST /functions/predict` | `server/routes/predict.py`, `server/services/prediction.py` | §02 audit, §06 algorithms |
| `POST /v1/predict/explain` | pattern-discovery + attribution | §06 |
| `GET /v1/predict/skill` | self-improvement loop / outcome store | §08 |
| `GET /v1/history/series[/{id}]` | History Lake | §04, §05 |
| `POST /v1/patterns/scan` | Matrix Profile / HDBSCAN / PELT-BOCPD | §06 |
| `GET /v1/kgik/graph`, `POST /v1/kgik/link-predict` | KGIK temporal graph / TGN-xERTE | §04, §05, §06 |
| `GET /v1/models/registry` | model registry / MLOps | §08 |
| `POST /v1/predict/backtest` | rolling-origin backtester | §08, §11 |
| Auth (`optional_bearer`/`require_bearer`, `JARVIS_REQUIRE_AUTH`) | `server/auth.py`, `server/config.py` | §12 |
| Frontend wiring | `src/api/kimiClient.js`, `src/pages/PredictionOracle.jsx` | §09, this §8 |

---

## 10. COMPLETE OpenAPI 3.1 SPECIFICATION

This is the machine-readable contract for the entire surface above, expressed as a single OpenAPI 3.1 document. It is **derived from and consistent with** the live `PredictRequest`/`predict()` shapes (`server/routes/predict.py`, `server/services/prediction.py`) and the forward `/v1` endpoints (§§2–6d). It is intended to be served verbatim at `GET /v1/openapi.json` and rendered at `GET /v1/docs` (FastAPI already auto-generates the live subset at `/openapi.json`; this is the curated superset).

> **OpenAPI 3.1 note:** 3.1 is a strict superset of JSON Schema 2020-12, so the `$schema`-flavoured schemas in §§1–6 drop straight into `components/schemas` with only cosmetic edits (nullable expressed as `type: [..,"null"]`, which 3.1 supports natively — no `nullable: true` shim). Examples reuse the worked examples above.

### 10.1 Document head, servers, security

```yaml
openapi: 3.1.0
info:
  title: PATTERN ORACLE — Prediction Engine API
  version: 1.4.0
  summary: Ask-anything forecasting (crypto, seismic, trajectory, growth, relational) with honest intervals.
  description: |
    Unified prediction engine. The live, un-versioned `POST /functions/predict`
    is permanent and aliased at `/v1/functions/predict`. All new endpoints are
    `/v1`-prefixed. Soft/domain failures (e.g. insufficient_data) on
    `/functions/predict` are returned as 200 on-schema results; hard/protocol
    failures use the error envelope (see ErrorEnvelope).
  contact:
    name: PATTERN ORACLE Platform
    url: https://docs.apex.local/pattern-oracle
  license:
    name: Proprietary
servers:
  - url: https://api.apex.local
    description: Production
  - url: http://localhost:8000
    description: Local backend (FastAPI, server/main.py)
tags:
  - name: predict
    description: Forecasting endpoints (the canonical PredictResponse envelope).
  - name: explain
    description: Drivers / patterns / attributions behind a forecast.
  - name: skill
    description: Self-improvement scorecard (realized-vs-predicted skill).
  - name: history
    description: History Lake — persisted world-data series + outcomes.
  - name: patterns
    description: Training-free pattern discovery (motif/regime/changepoint).
  - name: kgik
    description: Temporal knowledge graph + relational link prediction.
  - name: models
    description: Model registry.
  - name: backtest
    description: Rolling-origin backtests (mutating; persists runs).
  - name: meta
    description: Discovery, versioning, health.
security:
  - {}                      # default: public (optional_bearer) when JARVIS_REQUIRE_AUTH=false
  - bearerAuth: []          # accepted on every endpoint; required on write endpoints
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: opaque
      description: |
        `Authorization: Bearer <JARVIS_API_KEY>`. Validated by
        `server/auth.py::_check`: a malformed/absent header on a protected route
        yields 401 "missing bearer token"; a token != API_KEY yields 401
        "invalid token". When JARVIS_REQUIRE_AUTH=false, read endpoints accept
        no token; write endpoints (`/v1/predict/backtest`) always require one.
```

### 10.2 Reusable parameters & headers

```yaml
components:
  parameters:
    Limit:
      name: limit
      in: query
      required: false
      schema: { type: integer, minimum: 1, maximum: 500, default: 50 }
      description: Page size (cursor pagination, §0.6).
    Cursor:
      name: cursor
      in: query
      required: false
      schema: { type: string }
      description: Opaque cursor from a prior `page.next_cursor`.
    From:
      name: from
      in: query
      required: false
      schema: { oneOf: [ { type: integer }, { type: string, format: date-time } ] }
      description: Window start — epoch ms or ISO-8601 UTC.
    To:
      name: to
      in: query
      required: false
      schema: { oneOf: [ { type: integer }, { type: string, format: date-time } ] }
      description: Window end — epoch ms or ISO-8601 UTC.
    DomainFilter:
      name: domain
      in: query
      required: false
      schema:
        type: string
        enum: [crypto, seismic, trajectory, growth, generic, relational]
    SortBy:
      name: sort
      in: query
      required: false
      schema: { type: string }
      description: |
        Field to sort by, optionally `-`-prefixed for descending (e.g.
        `sort=-last_t`). Allowed fields are per-endpoint (see each path).
        Multiple keys are comma-separated; first key is primary.
    Order:
      name: order
      in: query
      required: false
      schema: { type: string, enum: [asc, desc], default: asc }
      description: Sort direction when `sort` carries no `-` prefix.
  headers:
    X-Request-Id:
      description: Correlation id; mirrors `error.request_id`. Present on every response.
      schema: { type: string }
    X-API-Version:
      description: Semantic version of the running build (matches info.version).
      schema: { type: string, example: "1.4.0" }
    X-RateLimit-Limit:
      description: Requests permitted per window for this identity+class.
      schema: { type: integer, example: 120 }
    X-RateLimit-Remaining:
      description: Requests remaining in the current window.
      schema: { type: integer, example: 117 }
    X-RateLimit-Reset:
      description: Epoch seconds when the bucket refills.
      schema: { type: integer, example: 1749038400 }
    Retry-After:
      description: Seconds to wait before retrying (sent on 429/503/502 when retryable).
      schema: { type: integer, example: 12 }
    Deprecation:
      description: "`true` on deprecated endpoints/fields (RFC 8594)."
      schema: { type: boolean }
    Sunset:
      description: HTTP-date after which a deprecated endpoint returns 410 (RFC 8594).
      schema: { type: string }
    Link:
      description: 'On deprecated responses: `<replacement>; rel="successor-version"`.'
      schema: { type: string }
    Idempotency-Key:
      description: Client-chosen opaque key (<=200 chars) for safe retries of writes.
      schema: { type: string }
```

### 10.3 Components / schemas

The forecast envelope (`PredictResponse`) and request (`PredictRequest`) are the **live** shapes; the rest are forward.

```yaml
components:
  schemas:
    # ── Errors ────────────────────────────────────────────────────────────────
    ErrorEnvelope:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, status]
          properties:
            code:
              type: string
              enum: [insufficient_data, unknown_entity, upstream_feed_error,
                     model_unavailable, validation_error, unauthorized, forbidden,
                     not_found, rate_limited, idempotency_conflict,
                     deprecated_endpoint, payload_too_large, timeout, internal_error]
            message: { type: string }
            status: { type: integer }
            details: { type: object, additionalProperties: true }
            request_id: { type: string }
            docs: { type: string }
            retryable: { type: boolean }
      example:
        error:
          code: insufficient_data
          message: "Human-readable explanation safe to surface to the user."
          status: 422
          details: { needs: "a price series via params.series, or a recognised ticker" }
          request_id: req_2f9c1ab4e7
          docs: https://docs.apex.local/pattern-oracle/errors#insufficient_data
          retryable: false

    # ── Series primitives ─────────────────────────────────────────────────────
    SeriesPoint:
      type: object
      required: [t, v]
      properties:
        t: { type: integer, description: epoch ms (or integer index when no timestamps) }
        v: { type: [number, "null"] }
    ForecastPoint:
      type: object
      properties:
        t: { oneOf: [ { type: integer }, { type: string } ], description: "epoch ms, index, or label e.g. 'horizon'." }
        v: { description: "number or {lat,lng,alt_m} for trajectory" }
        low: { type: [number, "null"] }
        high: { type: [number, "null"] }
    Page:
      type: object
      properties:
        limit: { type: integer }
        next_cursor: { type: [string, "null"] }
        has_more: { type: boolean }
        total_estimate: { type: [integer, "null"] }

    # ── Predict (LIVE) ────────────────────────────────────────────────────────
    PredictRequest:
      type: object
      required: [question]
      additionalProperties: false
      properties:
        question:
          type: string
          minLength: 1
          description: Natural-language forecasting question.
        params:
          type: [object, "null"]
          additionalProperties: true
          description: |
            Optional structured overrides + offline data (see §1.1 for the full
            per-domain key list — domain, target, horizon_hours, series/values/
            prices, lookback_days, magnitude(s)/catalog/min_magnitude/catalog_days,
            latitude/longitude/radius_km, omori/mainshock_K/omori_c/omori_p/
            days_since_mainshock, state_vector, minutes, semi_major_axis_km/a_km,
            projectile/speed/angle_deg/height0, horizon_steps, unit).
      example:
        question: "XRP price in 48h"
    Interval:
      type: object
      required: [low, high, confidence]
      properties:
        low: { type: [number, "null"] }
        high: { type: [number, "null"] }
        confidence: { type: [number, "null"], minimum: 0, maximum: 1 }
    Prediction:
      type: object
      required: [value, unit, point_estimate, interval, probability]
      properties:
        value: { type: [number, object, "null"] }
        unit: { type: [string, "null"] }
        point_estimate: { type: [number, object, "null"] }
        interval: { $ref: '#/components/schemas/Interval' }
        probability: { type: [number, "null"], minimum: 0, maximum: 1 }
    Method:
      type: object
      required: [name, family, models_used, math]
      properties:
        name: { type: string }
        family:
          type: string
          enum: [time_series, event_probability, trajectory, growth, relational, ensemble, unknown]
        models_used: { type: array, items: { type: string } }
        math: { type: string }
    PredictData:
      type: object
      required: [source, as_of, history, forecast]
      properties:
        source: { type: [string, "null"] }
        as_of: { type: [integer, "null"] }
        lookback: { type: [string, "null"] }
        history: { type: array, items: { $ref: '#/components/schemas/SeriesPoint' } }
        forecast: { type: array, items: { $ref: '#/components/schemas/ForecastPoint' } }
    PredictResponse:
      type: object
      required: [question, domain, target, horizon, prediction, method, drivers, data, assumptions, caveats, used_llm]
      properties:
        question: { type: string }
        domain:
          type: string
          enum: [crypto, seismic, trajectory, growth, generic, unknown]
        target: { type: [string, "null"] }
        horizon: { type: [string, "null"] }
        prediction: { $ref: '#/components/schemas/Prediction' }
        method: { $ref: '#/components/schemas/Method' }
        drivers: { type: object, additionalProperties: true }
        data: { $ref: '#/components/schemas/PredictData' }
        assumptions: { type: array, items: { type: string } }
        caveats: { type: array, items: { type: string } }
        used_llm: { type: boolean }
      # Note: insufficient_data on /functions/predict is THIS schema with
      # method.name="insufficient_data", method.family=<domain>, and a caveat
      # explaining what was needed — delivered with HTTP 200 (soft result).
```

(The remaining schemas — `ExplainRequest/Response`, `SkillResponse`, `SeriesCatalog`, `SeriesPoints`, `PatternScanRequest/Response`, `KgikGraph`, `LinkPredictRequest/Response`, `ModelRegistry`, `BacktestRequest`, `BacktestRun` — are the JSON-Schema objects already defined inline in §§2–6d; under OpenAPI they are copied into `components/schemas` 1:1 with their `$ref`-able titles. They are not duplicated here to keep this section authoritative-not-redundant.)

### 10.4 Paths

```yaml
paths:
  /functions/predict:
    post:
      tags: [predict]
      operationId: predict
      summary: Unified prediction engine (LIVE; alias /v1/functions/predict).
      security: [ {}, { bearerAuth: [] } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PredictRequest' }
            examples:
              crypto:        { value: { question: "XRP price in 48h" } }
              seismic:       { value: { question: "Chance of an M6+ near 35.7,139.7 in the next 7 days?", params: { domain: seismic, magnitude: 6.0, horizon_hours: 168, magnitudes: [2.5,2.6,2.7,2.9,3.1,3.3,3.0,2.8,4.1,3.7,2.6,5.2,3.9], catalog_days: 30 } } }
              trajectory:    { value: { question: "Where will this aircraft be in 20 minutes?", params: { domain: trajectory, state_vector: { lat: 51.47, lng: -0.4543, alt_m: 11277, speed_mps: 246, heading_deg: 285, vertical_rate_mps: 0 }, minutes: 20 } } }
              growth:        { value: { question: "Project our user growth 6 months out", params: { domain: growth, series: [1000,1320,1700,2150,2700,3300,3950], horizon_steps: 6, unit: users } } }
      responses:
        '200':
          description: Forecast (or soft insufficient_data result).
          headers:
            X-Request-Id: { $ref: '#/components/headers/X-Request-Id' }
            X-API-Version: { $ref: '#/components/headers/X-API-Version' }
            X-RateLimit-Limit: { $ref: '#/components/headers/X-RateLimit-Limit' }
            X-RateLimit-Remaining: { $ref: '#/components/headers/X-RateLimit-Remaining' }
            X-RateLimit-Reset: { $ref: '#/components/headers/X-RateLimit-Reset' }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PredictResponse' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/RateLimited' }
  /v1/functions/predict:
    post:
      tags: [predict]
      operationId: predictV1Alias
      summary: Identical to POST /functions/predict (v1 alias).
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/PredictRequest' } } }
      responses:
        '200': { description: See POST /functions/predict., content: { application/json: { schema: { $ref: '#/components/schemas/PredictResponse' } } } }
  /v1/predict/explain:
    post:
      tags: [explain]
      operationId: explain
      security: [ {}, { bearerAuth: [] } ]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/ExplainRequest' } } }
      responses:
        '200': { description: Explanation., content: { application/json: { schema: { $ref: '#/components/schemas/ExplainResponse' } } } }
        '404': { $ref: '#/components/responses/NotFound' }
        '422': { $ref: '#/components/responses/InsufficientData' }
  /v1/predict/skill:
    get:
      tags: [skill]
      operationId: skill
      parameters:
        - { $ref: '#/components/parameters/DomainFilter' }
        - { name: target, in: query, schema: { type: string } }
        - { name: metric, in: query, schema: { type: string, enum: [crps, rmse, mae, coverage, brier, skill_score], default: skill_score } }
        - { $ref: '#/components/parameters/From' }
        - { $ref: '#/components/parameters/To' }
        - { name: bucket, in: query, schema: { type: string, enum: [day, week, month], default: week } }
      responses:
        '200': { description: Skill scorecard., content: { application/json: { schema: { $ref: '#/components/schemas/SkillResponse' } } } }
        '422': { $ref: '#/components/responses/InsufficientData' }
  /v1/history/series:
    get:
      tags: [history]
      operationId: listSeries
      parameters:
        - { $ref: '#/components/parameters/DomainFilter' }
        - { name: source, in: query, schema: { type: string } }
        - { name: entity, in: query, schema: { type: string } }
        - { name: q, in: query, schema: { type: string } }
        - { name: as_of_from, in: query, schema: { oneOf: [ { type: integer }, { type: string } ] } }
        - { name: as_of_to, in: query, schema: { oneOf: [ { type: integer }, { type: string } ] } }
        - { $ref: '#/components/parameters/SortBy' }      # allowed: last_t, first_t, n_points, freshness_seconds
        - { $ref: '#/components/parameters/Limit' }
        - { $ref: '#/components/parameters/Cursor' }
      responses:
        '200': { description: Catalog page., content: { application/json: { schema: { $ref: '#/components/schemas/SeriesCatalog' } } } }
  /v1/history/series/{id}:
    get:
      tags: [history]
      operationId: getSeries
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { $ref: '#/components/parameters/From' }
        - { $ref: '#/components/parameters/To' }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 50000, default: 1000 } }
        - { $ref: '#/components/parameters/Cursor' }
        - { name: downsample, in: query, schema: { type: string, enum: [none, lttb, mean], default: none } }
        - { name: outcomes, in: query, schema: { type: boolean, default: false } }
      responses:
        '200': { description: Series points., content: { application/json: { schema: { $ref: '#/components/schemas/SeriesPoints' } } } }
        '404': { $ref: '#/components/responses/NotFound' }
  /v1/patterns/scan:
    post:
      tags: [patterns]
      operationId: patternScan
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/PatternScanRequest' } } }
      responses:
        '200': { description: Discovered patterns., content: { application/json: { schema: { $ref: '#/components/schemas/PatternScanResponse' } } } }
        '413': { $ref: '#/components/responses/PayloadTooLarge' }
        '422': { $ref: '#/components/responses/InsufficientData' }
  /v1/kgik/graph:
    get:
      tags: [kgik]
      operationId: kgikGraph
      parameters:
        - { name: node, in: query, schema: { type: string } }
        - { name: depth, in: query, schema: { type: integer, minimum: 1, maximum: 3, default: 1 } }
        - { name: relation, in: query, schema: { type: string } }
        - { name: min_confidence, in: query, schema: { type: number, minimum: 0, maximum: 1, default: 0 } }
        - { name: as_of, in: query, schema: { oneOf: [ { type: integer }, { type: string } ] } }
        - { $ref: '#/components/parameters/Limit' }
        - { $ref: '#/components/parameters/Cursor' }
      responses:
        '200': { description: Subgraph., content: { application/json: { schema: { $ref: '#/components/schemas/KgikGraph' } } } }
        '422': { $ref: '#/components/responses/UnknownEntity' }
  /v1/kgik/link-predict:
    post:
      tags: [kgik]
      operationId: linkPredict
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/LinkPredictRequest' } } }
      responses:
        '200': { description: Link predictions., content: { application/json: { schema: { $ref: '#/components/schemas/LinkPredictResponse' } } } }
        '422': { $ref: '#/components/responses/UnknownEntity' }
  /v1/models/registry:
    get:
      tags: [models]
      operationId: modelsRegistry
      parameters:
        - { $ref: '#/components/parameters/DomainFilter' }
        - { name: status, in: query, schema: { type: string, enum: [active, shadow, deprecated, unavailable] } }
        - { name: family, in: query, schema: { type: string, enum: [time_series, event_probability, trajectory, growth, relational, ensemble] } }
      responses:
        '200': { description: Model list., content: { application/json: { schema: { $ref: '#/components/schemas/ModelRegistry' } } } }
  /v1/predict/backtest:
    post:
      tags: [backtest]
      operationId: backtest
      security: [ { bearerAuth: [] } ]      # write: token ALWAYS required
      parameters:
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 200 } }
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/BacktestRequest' } } }
      responses:
        '200': { description: Completed run (sync)., content: { application/json: { schema: { $ref: '#/components/schemas/BacktestRun' } } } }
        '202':
          description: Accepted (async); poll the run.
          content: { application/json: { schema: { type: object, properties: { run_id: { type: string }, status: { type: string }, poll: { type: string } } } } }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/IdempotencyConflict' }
        '429': { $ref: '#/components/responses/RateLimited' }
  /v1/predict/backtest/{run_id}:
    get:
      tags: [backtest]
      operationId: backtestStatus
      security: [ { bearerAuth: [] } ]
      parameters:
        - { name: run_id, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: Run status/results., content: { application/json: { schema: { $ref: '#/components/schemas/BacktestRun' } } } }
        '404': { $ref: '#/components/responses/NotFound' }
  /v1/:
    get:
      tags: [meta]
      operationId: discovery
      summary: Version + endpoint + deprecation discovery.
      responses:
        '200':
          description: Discovery document.
          content:
            application/json:
              schema:
                type: object
                properties:
                  version: { type: string }
                  endpoints: { type: array, items: { type: string } }
                  deprecations: { type: array, items: { type: object } }
              example:
                version: "1.4.0"
                endpoints: ["/functions/predict", "/v1/predict/explain", "/v1/history/series"]
                deprecations: []
  /healthz:
    get:
      tags: [meta]
      operationId: healthz
      security: [ {} ]
      responses:
        '200': { description: OK., content: { application/json: { schema: { type: object, properties: { ok: { type: boolean } } }, example: { ok: true } } } }
```

### 10.5 Reusable responses (error envelope per code)

```yaml
components:
  responses:
    ValidationError:
      description: Malformed body / failed schema validation.
      headers: { X-Request-Id: { $ref: '#/components/headers/X-Request-Id' } }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorEnvelope' }
          example: { error: { code: validation_error, message: "Field 'question' is required.", status: 400, details: { field: question }, request_id: req_a1, retryable: false } }
    Unauthorized:
      description: Missing/invalid bearer (server/auth.py).
      headers: { X-Request-Id: { $ref: '#/components/headers/X-Request-Id' } }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorEnvelope' }
          example: { error: { code: unauthorized, message: "missing bearer token", status: 401, request_id: req_a2, retryable: false } }
    Forbidden:
      description: Authenticated but not permitted.
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: forbidden, message: "Not permitted.", status: 403, details: { resource: "backtest:write" }, request_id: req_f1, retryable: false } } } }
    NotFound:
      description: Unknown route or path resource.
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: not_found, message: "Series 'crypto:nope:usd:1d' does not exist.", status: 404, details: { id: "crypto:nope:usd:1d" }, request_id: req_n1, retryable: false } } } }
    InsufficientData:
      description: Well-formed but no useful result (422 on /v1 analytics).
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: insufficient_data, message: "Need >= 8 points to scan for patterns; got 4.", status: 422, details: { n_points: 4, min: 8 }, request_id: req_ps1, retryable: false } } } }
    UnknownEntity:
      description: Referenced ticker/node/series does not resolve.
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: unknown_entity, message: "Node 'protocol:Nope' is not in the KGIK graph.", status: 422, details: { node: "protocol:Nope" }, request_id: req_kg1, retryable: false } } } }
    RateLimited:
      description: Token bucket exhausted (§0.7).
      headers:
        Retry-After: { $ref: '#/components/headers/Retry-After' }
        X-RateLimit-Limit: { $ref: '#/components/headers/X-RateLimit-Limit' }
        X-RateLimit-Remaining: { $ref: '#/components/headers/X-RateLimit-Remaining' }
        X-RateLimit-Reset: { $ref: '#/components/headers/X-RateLimit-Reset' }
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: rate_limited, message: "Rate limit exceeded for the Forecast class.", status: 429, details: { retry_after_seconds: 12, limit: 120 }, request_id: req_rl1, retryable: true } } } }
    IdempotencyConflict:
      description: Idempotency-Key reused with a different body.
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: idempotency_conflict, message: "Idempotency-Key already used with a different request body.", status: 409, details: { idempotency_key: "bt_xrp_2026-06-04_run7" }, request_id: req_bt2, retryable: false } } } }
    PayloadTooLarge:
      description: Inline series / body exceeds limits.
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: payload_too_large, message: "Inline series exceeds 50000 points.", status: 413, details: { limit: 50000, received: 91234 }, request_id: req_pl1, retryable: false } } } }
    UpstreamFeedError:
      description: External feed hard failure (retryable).
      headers: { Retry-After: { $ref: '#/components/headers/Retry-After' } }
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: upstream_feed_error, message: "CoinGecko returned 503.", status: 502, details: { feed: coingecko, upstream_status: 503, retry_after_seconds: 30 }, request_id: req_up1, retryable: true } } } }
    ModelUnavailable:
      description: Inference backend down/not loaded (retryable).
      headers: { Retry-After: { $ref: '#/components/headers/Retry-After' } }
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: model_unavailable, message: "timesfm_2_5 backend is not loaded.", status: 503, details: { model: timesfm_2_5, backend: "PREDICT_GPU_URL" }, request_id: req_mu1, retryable: true } } } }
    Timeout:
      description: A bounded compute/feed step exceeded its deadline (retryable).
      headers: { Retry-After: { $ref: '#/components/headers/Retry-After' } }
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: timeout, message: "Pattern scan exceeded its compute deadline.", status: 504, details: { stage: matrix_profile, deadline_ms: 15000 }, request_id: req_to1, retryable: true } } } }
    InternalError:
      description: Unhandled bug (rare; predictor self-handles).
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code: internal_error, message: "An unexpected error occurred.", status: 500, request_id: req_ie1, retryable: true } } } }
```

---

## 11. HEADERS — full request/response header reference

### 11.1 Request headers
| Header | Endpoints | Required | Notes |
|---|---|---|---|
| `Authorization: Bearer <key>` | all | conditional | Required on writes (`/v1/predict/backtest`) always; required everywhere when `JARVIS_REQUIRE_AUTH=true`; otherwise optional. Validated by `server/auth.py::_check`. |
| `Content-Type: application/json` | all `POST` | yes | Bodies are JSON; a wrong/absent type on a body → `400 validation_error`. |
| `Accept: application/json` | reads | no | Default. For streaming endpoints use `Accept: text/event-stream` (§13). |
| `Idempotency-Key: <opaque>` | `POST /v1/predict/backtest` | no | ≤200 chars; replays the original run within 24 h (§0.5). |
| `If-None-Match: <etag>` | reads (history/registry/skill) | no | Conditional GET; `304 Not Modified` when the `ETag` is unchanged. |
| `X-Request-Id: <id>` | all | no | Client-supplied correlation id; echoed back. If absent, the server generates one. |

### 11.2 Response headers (every response)
| Header | Always? | Meaning |
|---|---|---|
| `X-Request-Id` | yes | Correlation id; equals `error.request_id` on errors. |
| `X-API-Version` | yes | Build semver, e.g. `1.4.0` (§6.1). |
| `X-RateLimit-Limit` / `-Remaining` / `-Reset` | yes | Token-bucket state (§0.7). |
| `Cache-Control` | reads | Per-endpoint (`public, max-age=30|60`; `no-store` on writes/forecasts). |
| `ETag` | cacheable reads | Strong validator for `If-None-Match`. |
| `Retry-After` | on 429/502/503/504 | Seconds to back off. |
| `Deprecation` / `Sunset` / `Link` | deprecated only | RFC 8594 lifecycle (§6.2). |
| `Content-Type` | yes | `application/json; charset=utf-8`, or `text/event-stream` for SSE. |

> **Forecast cacheability:** `POST /functions/predict` is `Cache-Control: no-store` even though it is a pure function of body, because the *default network path* reads a live ~5-min-cached feed (`load_crypto_series`, `load_seismic_catalog`) — so two identical calls minutes apart may legitimately differ. Offline (params-supplied series) calls are deterministic (GBM `seed=42`) but the header stays `no-store` for a single, simple contract.

---

## 12. PAGINATION, FILTERING & SORTING — consolidated reference

### 12.1 Pagination (cursor; §0.6 expanded)
- **Model:** opaque forward cursors. A cursor encodes the last-seen sort key + tiebreak id (base64url JSON), so it is stable under concurrent inserts (no skipped/duplicated rows the way offset pagination drifts).
- **Request:** `?limit=<1..500, default 50>&cursor=<opaque>`. For `GET /v1/history/series/{id}` the point limit is larger (`default 1000, max 50000`).
- **Response:** every list wraps items in `{ items|points|edges, page }` where `page = { limit, next_cursor, has_more, total_estimate? }`.
- **Termination:** iterate until `page.next_cursor == null` (equivalently `has_more == false`). Do **not** rely on `total_estimate` for loop control — it is best-effort.
- **Invalid cursor →** `400 validation_error` with `details.field = "cursor"`.

```text
GET /v1/history/series?domain=crypto&limit=50
  → page.next_cursor = "eyJvZmYiOjUwfQ=="
GET /v1/history/series?domain=crypto&limit=50&cursor=eyJvZmYiOjUwfQ==
  → ... until next_cursor == null
```

### 12.2 Filtering
| Endpoint | Filters |
|---|---|
| `GET /v1/history/series` | `domain`, `source`, `entity`, `q` (free text over entity/label), `as_of_from`/`as_of_to`. |
| `GET /v1/history/series/{id}` | `from`/`to` (time window), `outcomes` (join realized), `downsample`. |
| `GET /v1/predict/skill` | `domain`, `target`, `metric`, `from`/`to`, `bucket`. |
| `GET /v1/kgik/graph` | `node`, `depth`, `relation`, `min_confidence`, `as_of`. |
| `GET /v1/models/registry` | `domain`, `status`, `family`. |

- Unknown filter params are **ignored** (forward-compatible), not rejected.
- Time filters accept **either** epoch ms (integer) **or** ISO-8601 UTC; responses always echo ms.
- Range filters are half-open `[from, to)`.

### 12.3 Sorting
- Syntax: `?sort=<field>` ascending, `?sort=-<field>` descending; or `?sort=<field>&order=desc`. Multiple keys comma-separated, first is primary: `?sort=-last_t,entity`.
- Allowed sort fields (others → `400 validation_error`, `details.field="sort"`):

| Endpoint | Allowed sort fields | Default |
|---|---|---|
| `GET /v1/history/series` | `last_t`, `first_t`, `n_points`, `freshness_seconds`, `entity` | `-last_t` |
| `GET /v1/models/registry` | `weight`, `updated_at`, `version`, `skill.crps` | `-weight` |
| `GET /v1/kgik/graph` (edges) | `confidence`, `last_seen`, `support` | `-confidence` |

---

## 13. STREAMING & WEBHOOKS — long-running predictions, backtests, and live forecasts

Two delivery models for work that is either long (backtests) or continuous (live re-forecasting). Both are **forward** contracts; neither changes the live `/functions/predict` request/response shape.

### 13.1 Server-Sent Events (SSE) — incremental forecast / backtest progress
**Transport:** `text/event-stream` over a held-open HTTP `GET`/`POST`. Negotiated with `Accept: text/event-stream`. Each event is `event: <type>\ndata: <json>\n\n`. Clients use `EventSource` (GET) or `fetch` + a stream reader (POST). The terminal `done`/`error` event closes the stream.

**13.1.1 Streaming a prediction** — `POST /v1/predict/stream`
Same body as `/functions/predict`; streams partials as the engine classifies → loads data → simulates → blends. Useful for Monte-Carlo progress on large `n_paths`.

```
POST /v1/predict/stream
Accept: text/event-stream
Content-Type: application/json

{ "question": "XRP price in 48h", "params": { "n_paths": 200000 } }
```
Event sequence (each `data:` is one JSON line):
```text
event: routed
data: {"domain":"crypto","target":"xrp","horizon":"48h","used_llm":false}

event: data_loaded
data: {"source":"CoinGecko /coins/ripple/market_chart","n_points":90,"as_of":1749038400000}

event: progress
data: {"stage":"montecarlo","paths_done":50000,"paths_total":200000,"pct":0.25}

event: progress
data: {"stage":"montecarlo","paths_done":150000,"paths_total":200000,"pct":0.75}

event: partial
data: {"point_estimate":0.5208,"interval":{"low":0.479,"high":0.569,"confidence":0.90}}

event: done
data: { /* the FULL PredictResponse envelope from §1.2, identical to non-streamed */ }
```
- The terminal `done` payload is byte-for-byte a `PredictResponse`, so a client can ignore all intermediate events and treat the stream as a slow request.
- On failure mid-stream: `event: error\ndata: {ErrorEnvelope}` then the stream closes. A soft `insufficient_data` still arrives as a normal `event: done` with the 200 soft result body (consistent with §0.4).
- Heartbeat: a `:` comment line (`: keep-alive`) every 15 s to defeat idle proxies.

**13.1.2 Streaming a backtest** — `GET /v1/predict/backtest/{run_id}/stream`
Auth: `require_bearer`. Streams per-origin progress for an async run (§6d).
```text
event: status
data: {"run_id":"bt_8c2f","status":"running","n_origins":88}

event: origin
data: {"origin":12,"t":1742428800000,"model":"gbm_mc_holt","crps":0.0219}

event: progress
data: {"origins_done":44,"origins_total":88,"pct":0.5}

event: done
data: { /* the BacktestRun completed body from §6d */ }
```

**13.1.3 SSE event-type catalogue**
| `event:` | Where | `data` shape |
|---|---|---|
| `routed` | predict/stream | `{domain,target,horizon,used_llm}` |
| `data_loaded` | predict/stream | `{source,n_points,as_of}` |
| `progress` | both | `{stage?,pct,...counts}` |
| `partial` | predict/stream | partial `Prediction` (subject to change before `done`) |
| `status` / `origin` | backtest/stream | run status / per-origin score |
| `done` | both | the FULL terminal envelope (PredictResponse or BacktestRun) |
| `error` | both | `ErrorEnvelope` (then stream closes) |

### 13.2 Webhooks — push on async completion
For fire-and-forget async backtests (or scheduled re-forecasts from the self-improvement loop), the caller may register a webhook instead of polling.

**Registration (in the backtest body):**
```json
{ "series_id": "crypto:ripple:usd:1d", "horizon_hours": 48, "async": true,
  "webhook": { "url": "https://client.example/hooks/oracle", "secret": "whsec_..." } }
```
**Delivery:** `POST <url>` with the run result and signature headers:
```
POST /hooks/oracle
Content-Type: application/json
X-Oracle-Event: backtest.completed
X-Oracle-Delivery: dlv_91af
X-Oracle-Signature: t=1749038460,v1=hex(HMAC_SHA256(secret, "{t}.{body}"))
```
```json
{ "event": "backtest.completed", "run_id": "bt_8c2f", "status": "completed",
  "result": { /* BacktestRun body, §6d */ }, "sent_at": 1749038460000 }
```
**Event types:** `backtest.completed`, `backtest.failed`, `forecast.scored` (self-improvement loop attached a realized outcome — see §08), `model.promoted` (registry status change), `drift.detected`.
**Verification (client side):** recompute `HMAC_SHA256(secret, "{t}.{raw_body}")`, constant-time compare to `v1`, reject if `|now - t| > 300 s` (replay window).
**Delivery semantics:** at-least-once; retried with exponential backoff (1m, 5m, 30m, 2h, 6h) on non-2xx; each carries the same `X-Oracle-Delivery` id so the receiver can dedupe. Endpoints MUST be idempotent on `run_id`/`X-Oracle-Delivery`.

---

## 14. RATE-LIMIT TIERS

§0.7 defines the four request *classes* and the per-response headers. Limits additionally scale with the caller's **plan tier** (resolved from the API key; anonymous = IP-bucketed at the `free` tier).

### 14.1 Class × tier matrix (requests per minute)
| Class \ Tier | Anonymous / `free` | `dev` | `pro` | `enterprise` |
|---|---|---|---|---|
| Forecast (`/functions/predict`, `/v1/predict/explain`, `/v1/predict/stream`, `/v1/kgik/link-predict`) | 120 | 300 | 1200 | custom |
| Query (`/v1/history/*`, `/v1/kgik/graph`, `/v1/models/registry`, `/v1/predict/skill`) | 240 | 600 | 2400 | custom |
| Heavy compute (`/v1/patterns/scan`) | 30 | 60 | 240 | custom |
| Job submission (`/v1/predict/backtest`) | 10 | 30 | 120 | custom |
| Streaming concurrency (open SSE conns) | 2 | 5 | 25 | custom |

### 14.2 Mechanics
- **Algorithm:** token bucket per `(identity, class)`. Identity = API key when present, else client IP. Burst = the per-minute limit; refill is continuous (limit/60 tokens per second).
- **Headers:** `X-RateLimit-Limit/-Remaining/-Reset` reflect the bucket for the *class of the called endpoint*.
- **Exhaustion:** `429 rate_limited` + `Retry-After` + `details.retry_after_seconds` + `details.limit`. `retryable: true`.
- **Heavy/job buckets are separate** from Forecast/Query, so hammering `/v1/patterns/scan` never starves `/functions/predict`.
- **Idempotent replays** (same `Idempotency-Key` returning the stored run) do **not** consume a fresh job-submission token.
- **Enterprise** tiers may set per-key custom limits and exempt specific source IP ranges; these are provisioned out-of-band and reflected in the headers.

---

## 15. ERROR CATALOGUE — exhaustive

Every `code` from §7, restated with: meaning, the HTTP status it ships with, retry guidance, the headers that accompany it, and a copy-paste example body. `code` is the contract; branch on it (§0.4). This expands §7's table into per-code detail.

### 15.1 `insufficient_data`
- **Meaning:** not enough data to produce a meaningful result.
- **Status:** **200** (soft, on `/functions/predict` — the live behaviour) · **422** (hard, on `/v1` analytics that cannot degrade).
- **Retry:** no (more/better *input* is needed, not a retry).
- **Headers:** standard; no `Retry-After`.
- **Soft body (200, /functions/predict)** — note this is the full `PredictResponse`, not the envelope:
```json
{ "question": "XRP price in 48h", "domain": "crypto", "target": "xrp", "horizon": "48h",
  "prediction": { "value": null, "unit": null, "point_estimate": null,
    "interval": { "low": null, "high": null, "confidence": 0.0 }, "probability": null },
  "method": { "name": "insufficient_data", "family": "crypto", "models_used": [], "math": "" },
  "drivers": {}, "data": { "source": null, "as_of": null, "lookback": null, "history": [], "forecast": [] },
  "assumptions": [],
  "caveats": ["Insufficient data to answer. Needs: a price series via params.series/values, or a recognised ticker with network access"],
  "used_llm": false }
```
- **Hard body (422, /v1/patterns/scan):**
```json
{ "error": { "code": "insufficient_data", "message": "Need >= 8 points to scan for patterns; got 4.",
  "status": 422, "details": { "n_points": 4, "min": 8 }, "request_id": "req_ps1", "retryable": false } }
```

### 15.2 `unknown_entity`
- **Meaning:** a referenced ticker / KGIK node / region / series entity does not resolve. (For crypto, an unrecognised ticker yields **`insufficient_data`** on `/functions/predict` because the live code degrades — see `_predict_crypto`; `unknown_entity` is used by the `/v1` resolvers that look entities up explicitly.)
- **Status:** 422 (or 404 when it is a path id).
- **Retry:** no.
```json
{ "error": { "code": "unknown_entity", "message": "source 'protocol:Ghost' not found in graph.",
  "status": 422, "details": { "source": "protocol:Ghost" }, "request_id": "req_lp1", "retryable": false } }
```

### 15.3 `upstream_feed_error`
- **Meaning:** a required external feed (CoinGecko `/coins/{id}/market_chart`, USGS `fdsnws/event/1/query`, FX) failed hard. **Live nuance:** `load_crypto_series`/`load_seismic_catalog` swallow feed failures and return `[]`, which becomes a **200 `insufficient_data`** soft result — so this hard 502 only appears on `/v1` endpoints that explicitly require a live feed and cannot degrade.
- **Status:** 502 · **Retry:** **yes** (`Retry-After`).
```json
{ "error": { "code": "upstream_feed_error", "message": "CoinGecko returned 503.", "status": 502,
  "details": { "feed": "coingecko", "upstream_status": 503, "retry_after_seconds": 30 },
  "request_id": "req_up1", "retryable": true } }
```

### 15.4 `model_unavailable`
- **Meaning:** the requested/required forecast model or inference backend (e.g. a foundation-TS server at `PREDICT_GPU_URL`) is down or not loaded. The native forecasters (`gbm_montecarlo_forecast`, `gutenberg_richter_poisson`, `great_circle_forward`, `fit_growth_series`) are in-process and never raise this; it applies to shadow/remote models in the registry.
- **Status:** 503 · **Retry:** **yes**.
```json
{ "error": { "code": "model_unavailable", "message": "timesfm_2_5 backend is not loaded.", "status": 503,
  "details": { "model": "timesfm_2_5", "backend": "PREDICT_GPU_URL" }, "request_id": "req_mu1", "retryable": true } }
```

### 15.5 `validation_error`
- **Meaning:** malformed JSON, wrong types, missing required field, failed schema validation. For the live route this is what FastAPI/Pydantic raises when `question` is absent or not a string (`PredictRequest`).
- **Status:** 400 · **Retry:** no.
```json
{ "error": { "code": "validation_error", "message": "Field 'question' is required.", "status": 400,
  "details": { "field": "question", "errors": [ { "loc": ["body","question"], "type": "missing" } ] },
  "request_id": "req_a1", "retryable": false } }
```

### 15.6 `unauthorized`
- **Meaning:** missing or invalid bearer. Messages mirror `server/auth.py` exactly: `"missing bearer token"` (no/!Bearer header) and `"invalid token"` (token != `API_KEY`).
- **Status:** 401 · **Retry:** no.
```json
{ "error": { "code": "unauthorized", "message": "invalid token", "status": 401, "request_id": "req_a2", "retryable": false } }
```

### 15.7 `forbidden`
- **Meaning:** authenticated but not permitted (e.g. a `dev`-tier key calling an `enterprise`-only export).
- **Status:** 403 · **Retry:** no.
```json
{ "error": { "code": "forbidden", "message": "Your plan cannot run backtests.", "status": 403,
  "details": { "resource": "backtest:write", "tier": "free" }, "request_id": "req_f1", "retryable": false } }
```

### 15.8 `not_found`
- **Meaning:** unknown route, or unknown path resource (`series_id`, `run_id`, `forecast_id`, KGIK `node` by path).
- **Status:** 404 · **Retry:** no.
```json
{ "error": { "code": "not_found", "message": "series_id 'crypto:nope:usd:1d' not found.", "status": 404,
  "details": { "series_id": "crypto:nope:usd:1d" }, "request_id": "req_bt3", "retryable": false } }
```

### 15.9 `rate_limited`
- **Meaning:** token bucket exhausted for the (identity, class). See §14.
- **Status:** 429 · **Retry:** **yes** — wait `details.retry_after_seconds` / `Retry-After`.
- **Headers:** `Retry-After`, `X-RateLimit-*`.
```json
{ "error": { "code": "rate_limited", "message": "Rate limit exceeded for the Heavy compute class.",
  "status": 429, "details": { "retry_after_seconds": 12, "limit": 30, "class": "heavy_compute" },
  "request_id": "req_rl1", "retryable": true } }
```

### 15.10 `idempotency_conflict`
- **Meaning:** `Idempotency-Key` reused within 24 h with a *different* body.
- **Status:** 409 · **Retry:** no (change the key or send the original body).
```json
{ "error": { "code": "idempotency_conflict", "message": "Idempotency-Key already used with a different request body.",
  "status": 409, "details": { "idempotency_key": "bt_xrp_2026-06-04_run7" }, "request_id": "req_bt2", "retryable": false } }
```

### 15.11 `deprecated_endpoint`
- **Meaning:** called after its `Sunset` date (§6.2). One release of 410, then 404.
- **Status:** 410 · **Retry:** no (migrate to `replacement`).
- **Headers:** `Deprecation: true`, `Sunset`, `Link: <replacement>; rel="successor-version"`.
```json
{ "error": { "code": "deprecated_endpoint", "message": "POST /v0/predict was sunset on 2026-03-01.",
  "status": 410, "details": { "sunset": "2026-03-01", "replacement": "/functions/predict" },
  "request_id": "req_dp1", "retryable": false } }
```

### 15.12 `payload_too_large`
- **Meaning:** request body / inline series exceeds limits (inline `series` > 50k points; body > 8 MB).
- **Status:** 413 · **Retry:** no (use a `series_id` or downsample client-side).
```json
{ "error": { "code": "payload_too_large", "message": "Inline series exceeds 50000 points.", "status": 413,
  "details": { "limit": 50000, "received": 91234 }, "request_id": "req_pl1", "retryable": false } }
```

### 15.13 `timeout`
- **Meaning:** a bounded compute/feed step blew its deadline (e.g. Matrix Profile on a huge series, or a slow feed within the `httpx.Timeout(...)` used by the loaders).
- **Status:** 504 · **Retry:** **yes** (often after narrowing the window or via async/SSE).
```json
{ "error": { "code": "timeout", "message": "Pattern scan exceeded its compute deadline.", "status": 504,
  "details": { "stage": "matrix_profile", "deadline_ms": 15000 }, "request_id": "req_to1", "retryable": true } }
```

### 15.14 `internal_error`
- **Meaning:** unhandled server bug. **Rare on `/functions/predict`** because `predict()` wraps every domain handler in a `try/except` that degrades to a 200 soft `insufficient_data` ("never 500 a normal query"). This code is for genuinely unexpected failures (e.g. in the `/v1` layer).
- **Status:** 500 · **Retry:** **yes** (transient assumption); report `request_id` if persistent.
```json
{ "error": { "code": "internal_error", "message": "An unexpected error occurred.", "status": 500,
  "request_id": "req_ie1", "retryable": true } }
```

### 15.15 Retry decision flow (client pseudocode)
```text
on response r:
  if r.ok: return r.body
  e = parse(r.body).error
  switch e.code:
    rate_limited                  -> sleep(e.details.retry_after_seconds); retry (cap N)
    upstream_feed_error, timeout,
    model_unavailable, internal_error -> if e.retryable: backoff_jittered(); retry (cap N)
    unauthorized                  -> refresh/prompt for key; do NOT auto-loop
    validation_error, not_found,
    unknown_entity, forbidden,
    idempotency_conflict,
    payload_too_large,
    deprecated_endpoint           -> surface to user; do NOT retry as-is
    insufficient_data (422)       -> render empty-state (not an error toast)
```

---

## 16. SDK USAGE SNIPPETS

### 16.1 Frontend — `kimiClient` (existing) and the proposed `oracle` wrapper
The live page uses the function proxy (unchanged, §8.1):
```js
import { kimiClient } from "@/api/kimiClient";

// LIVE — POSTs to /functions/predict, auto-attaches Bearer only if a key is set.
const res = await kimiClient.functions.predict({ question: "XRP price in 48h" });
// res is a PredictResponse; a soft insufficient_data result is NOT thrown.
if (res.method.name === "insufficient_data") {
  // render res.caveats[] as an informational empty-state, not an error.
} else {
  console.log(res.prediction.point_estimate, res.prediction.interval);
}

// With offline params (deterministic; no network touched for the supplied series):
await kimiClient.functions.predict({
  question: "Project our user growth 6 months out",
  params: { domain: "growth", series: [1000,1320,1700,2150,2700,3300,3950], horizon_steps: 6, unit: "users" },
});
```
The `/v1` wrapper (additive to `src/api/kimiClient.js`, §8.2) used end-to-end:
```js
import { oracle } from "@/api/kimiClient";

const skill   = await oracle.skill({ domain: "crypto", target: "xrp", metric: "crps", bucket: "week" });
const catalog = await oracle.seriesList({ domain: "crypto", q: "rip", limit: 50 });
const points  = await oracle.series("crypto:ripple:usd:1d", { from: "2026-06-01", limit: 200, downsample: "lttb" });
const scan    = await oracle.scan({ series_id: "crypto:ripple:usd:1d", detectors: ["motif","changepoint"], window: 5 });
const graph   = await oracle.kgikGraph({ node: "protocol:X", depth: 1, min_confidence: 0.3 });
const links   = await oracle.linkPredict({ source: "protocol:X", relation: "adopts", target: null, top_k: 3 });
const models  = await oracle.models({ domain: "crypto", status: "active" });

// Write (requires a key); idempotent via a client-chosen key.
const run = await oracle.backtest(
  { series_id: "crypto:ripple:usd:1d", models: ["gbm_mc_holt"], horizon_hours: 48, from: "2026-03-06", to: "2026-06-04" },
  "bt_xrp_2026-06-04_run7"
);
```
Streaming a prediction with `fetch` + a reader (SSE over POST, §13.1):
```js
const resp = await fetch("/v1/predict/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Accept": "text/event-stream",
             ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
  body: JSON.stringify({ question: "XRP price in 48h", params: { n_paths: 200000 } }),
});
const reader = resp.body.getReader();
const dec = new TextDecoder();
let buf = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const frame = buf.slice(0, i); buf = buf.slice(i + 2);
    const ev = (frame.match(/^event:\s*(.*)$/m) || [])[1];
    const data = (frame.match(/^data:\s*(.*)$/m) || [])[1];
    if (ev === "progress") updateBar(JSON.parse(data).pct);
    if (ev === "done") render(JSON.parse(data));      // full PredictResponse
    if (ev === "error") showError(JSON.parse(data).error);
  }
}
```
Error-envelope handling (parse the thrown text, branch on `error.code`, §8.3):
```js
try {
  await oracle.scan({ series: [1,2,3,4] });           // too few points
} catch (err) {
  // request() throws Error("API <status>: <text>") with err.status set.
  const env = (() => { try { return JSON.parse(err.message.replace(/^API \d+:\s*/, "")); } catch { return null; } })();
  if (env?.error?.code === "insufficient_data") showEmptyState(env.error.message);
  else if (err.status === 429) showRetryIn(env?.error?.details?.retry_after_seconds ?? 30);
  else if (err.status === 401) promptForKey();
  else showError(env?.error?.message ?? "Request failed");
}
```

### 16.2 curl
```bash
# 1) LIVE forecast (public; no key needed when JARVIS_REQUIRE_AUTH=false)
curl -sS https://api.apex.local/functions/predict \
  -H 'Content-Type: application/json' \
  -d '{"question":"XRP price in 48h"}'

# 2) Offline/deterministic seismic via params (no network feed touched)
curl -sS http://localhost:8000/functions/predict \
  -H 'Content-Type: application/json' \
  -d '{"question":"Chance of M6+ in 7 days?","params":{"domain":"seismic","magnitude":6.0,
       "horizon_hours":168,"magnitudes":[2.5,2.6,2.7,2.9,3.1,3.3,3.0,2.8,4.1,3.7,2.6,5.2,3.9],
       "catalog_days":30}}'

# 3) Authenticated call (when JARVIS_REQUIRE_AUTH=true, or for write endpoints)
curl -sS https://api.apex.local/v1/predict/explain \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer '"$JARVIS_API_KEY" \
  -d '{"question":"XRP price in 48h","depth":"full","max_patterns":5}'

# 4) Paginated, filtered, sorted catalog query
curl -sS 'https://api.apex.local/v1/history/series?domain=crypto&q=rip&sort=-last_t&limit=50' \
  -H 'Authorization: Bearer '"$JARVIS_API_KEY"

# 5) Series points with a time window + server-side downsample
curl -sS 'https://api.apex.local/v1/history/series/crypto:ripple:usd:1d?from=2026-06-01&limit=200&downsample=lttb'

# 6) Write: enqueue a backtest, idempotent + async
curl -sS https://api.apex.local/v1/predict/backtest \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer '"$JARVIS_API_KEY" \
  -H 'Idempotency-Key: bt_xrp_2026-06-04_run7' \
  -d '{"series_id":"crypto:ripple:usd:1d","models":["gbm_mc_holt","timesfm_2_5"],
       "horizon_hours":48,"from":"2026-03-06","to":"2026-06-04","async":true,
       "webhook":{"url":"https://client.example/hooks/oracle","secret":"whsec_xxx"}}'

# 7) Poll the async run
curl -sS https://api.apex.local/v1/predict/backtest/bt_8c2f \
  -H 'Authorization: Bearer '"$JARVIS_API_KEY"

# 8) Stream a prediction (SSE)
curl -N https://api.apex.local/v1/predict/stream \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"question":"XRP price in 48h","params":{"n_paths":200000}}'

# 9) Conditional GET (ETag) to save bandwidth on registry polling
curl -sS https://api.apex.local/v1/models/registry \
  -H 'If-None-Match: "W/abc123"'   # -> 304 Not Modified if unchanged
```

### 16.3 Python (httpx) — mirrors the server's own client style
```python
import httpx

BASE = "http://localhost:8000"
key = "..."  # optional locally
headers = {"Authorization": f"Bearer {key}"} if key else {}

with httpx.Client(timeout=httpx.Timeout(20.0, connect=8.0)) as c:
    r = c.post(f"{BASE}/functions/predict", json={"question": "XRP price in 48h"}, headers=headers)
    r.raise_for_status()
    res = r.json()
    if res["method"]["name"] == "insufficient_data":
        print("no answer:", res["caveats"])
    else:
        p = res["prediction"]
        print(p["point_estimate"], p["interval"])
```

---

## 17. BACKWARDS-COMPATIBILITY / VERSIONING / DEPRECATION MATRIX

Concrete change-by-change ruling for what is allowed where, the lifecycle of each surface, and a worked deprecation timeline. Extends §6.

### 17.1 Change-class compatibility matrix
| Change | Backward-compatible? | Where it ships | Client action |
|---|---|---|---|
| Add a new **optional** request field/param | Yes | same `/v1` (minor) | none (ignore if unused) |
| Add a new **response** field | Yes | same `/v1` (minor) | **must ignore unknown fields** |
| Add a new **enum member** (with documented fallback) | Yes | same `/v1` (minor) | treat unknown values as fallback (`generic`/`unknown`) |
| Add a new **endpoint** | Yes | same `/v1` (minor) | none |
| Loosen validation (accept more) | Yes | same `/v1` | none |
| Make an optional field **required** | **No** (breaking) | `/v2` | migrate |
| Remove/rename a field | **No** | `/v2` (field deprecated first, §6.2) | migrate |
| Change a field's **type** | **No** | `/v2` | migrate |
| **Tighten** an enum (remove a member) | **No** | `/v2` | migrate |
| Change default **semantics** of a param | **No** | `/v2` | migrate |
| Change the **error envelope** shape | **No** | `/v2` | migrate (codes are stable within a major) |
| Change `/functions/predict` response shape | **No** — it is permanent | only `/v2/functions/predict` | none for v1 clients |

### 17.2 Surface lifecycle table
| Surface | Status | Stability guarantee | Notes |
|---|---|---|---|
| `POST /functions/predict` | **LIVE, permanent** | shape frozen at v1 semantics | Backed by `predict()`; soft-error contract (200) is load-bearing for the UI. |
| `POST /v1/functions/predict` | LIVE alias | tracks `/functions/predict` exactly | For uniform `/v1` clients. |
| `PredictResponse` envelope | **stable** | additive-only within v1 | Every forecast endpoint MUST emit it unchanged so shared UI components render it. |
| Error `code` vocabulary | **stable** | codes never re-meaning within a major | New codes may be *added* (clients default-branch). |
| `/v1/predict/explain`, `/skill`, `/history/*`, `/patterns/scan`, `/kgik/*`, `/models/registry`, `/predict/backtest` | **[FORWARD]** | additive within v1 once shipped | Forward contracts; consistent with the live envelope. |
| `/v1/predict/stream`, backtest stream, webhooks | **[FORWARD]** | additive | `done` payloads reuse the stable envelopes. |
| `/v0/*` (hypothetical legacy) | deprecated→sunset | 90-day window then 410→404 | Example used in §17.4. |

### 17.3 Discovery & header signalling (how clients detect state)
- `GET /v1/` → `{ "version": "1.4.0", "endpoints": [...], "deprecations": [ { "surface": "...", "since": "...", "sunset": "...", "replacement": "..." } ] }`.
- Every response: `X-API-Version: 1.4.0`.
- Deprecated responses additionally: `Deprecation: true`, `Sunset: <HTTP-date>`, `Link: <replacement>; rel="successor-version"`.
- A field being phased out is **still populated** for the full window and listed in `deprecations[]` with `field`-level granularity; its replacement ships alongside (no silent removals).

### 17.4 Worked deprecation timeline (example)
Suppose `drivers.doubling_time` (growth) is renamed to `drivers.doubling_time_steps` for clarity:
| Date | Event | Behaviour |
|---|---|---|
| 2026-06-04 | New field added | Both `doubling_time` and `doubling_time_steps` present; identical values. Listed in `deprecations[]`. Responses carry `Deprecation: true` on the growth path. |
| 2026-06-04 → 2026-09-02 | 90-day window | Old field stays populated; docs + discovery point to the new name. |
| 2026-09-02 | Sunset of the *field* | Old field omitted in `/v1` minor bump `1.5.0`. (A field removal that would break parsers ships only at `/v2`; a purely additive rename keeps both for the window, then drops the alias as a documented minor.) |
| breaking variants | `/v2` only | Any change that alters types/required-ness/enums of an existing field is reserved for `/v2/...`, mounted in parallel; `/v1` keeps running through its own deprecation window (min 90 days) before `410 Gone` then `404`. |

### 17.5 Client compatibility checklist (normative)
1. **Ignore unknown response fields.** Never fail on additive fields.
2. **Default unknown enum values** to the documented fallback (`domain`→`generic`, `family`→`unknown`).
3. **Treat `null` as "unavailable,"** never `0` (the predictor emits `null` for absent values/intervals/probabilities).
4. **Branch on `error.code`,** not `message` or numeric `status` alone.
5. **Respect `Retry-After`** on `429/502/503/504`; honour `retryable`.
6. **Send `Idempotency-Key`** on backtest submissions you might retry.
7. **Read `X-API-Version` / `GET /v1/`** to detect deprecations; migrate before `Sunset`.
8. **Never NaN/Infinity:** floats arrive as `null` at the boundary — parse accordingly.

---

## 18. OpenAPI `components/schemas` — the deferred forward schemas in full

§10.3 spelled out the **live** envelope and deferred the forward schemas to "copied 1:1 from §§2–6d." For a self-contained OpenAPI document, here they are as explicit `components/schemas` entries (3.1 / JSON-Schema 2020-12). These are `$ref`-able from the paths in §10.4.

```yaml
components:
  schemas:
    # ── Explain (§2) ───────────────────────────────────────────────────────────
    ExplainRequest:
      type: object
      additionalProperties: false
      oneOf:
        - { required: [forecast_id] }
        - { required: [question] }
      properties:
        forecast_id: { type: string }
        question: { type: string }
        params: { type: [object, "null"] }
        depth: { type: string, enum: [summary, full], default: summary }
        max_patterns: { type: integer, minimum: 1, maximum: 50, default: 10 }
      example: { question: "XRP price in 48h", depth: full, max_patterns: 5 }
    Pattern:
      type: object
      required: [type, summary, strength]
      properties:
        type: { type: string, enum: [motif, regime, changepoint, lead_lag, seasonality, trend, anomaly] }
        summary: { type: string }
        strength: { type: number, minimum: 0, maximum: 1 }
        span: { type: object, properties: { start: {}, end: {} } }
        evidence: { type: object, additionalProperties: true }
    Attribution:
      type: object
      properties:
        feature: { type: string }
        contribution: { type: number }
        direction: { type: string, enum: [up, down, neutral] }
    ExplainResponse:
      type: object
      required: [forecast_ref, domain, drivers, patterns, attributions, narrative]
      properties:
        forecast_ref:
          type: object
          properties:
            forecast_id: { type: [string, "null"] }
            question: { type: [string, "null"] }
            target: { type: [string, "null"] }
        domain: { type: string, enum: [crypto, seismic, trajectory, growth, generic, relational] }
        drivers: { type: object, additionalProperties: true }
        patterns: { type: array, items: { $ref: '#/components/schemas/Pattern' } }
        attributions: { type: array, items: { $ref: '#/components/schemas/Attribution' } }
        narrative: { type: string }

    # ── Skill (§3) ─────────────────────────────────────────────────────────────
    SkillResponse:
      type: object
      required: [window, filters, headline, series, baselines]
      properties:
        window:
          type: object
          properties: { from: { type: integer }, to: { type: integer }, bucket: { type: string } }
        filters:
          type: object
          properties:
            domain: { type: [string, "null"] }
            target: { type: [string, "null"] }
            metric: { type: string }
        headline:
          type: object
          properties:
            n_forecasts: { type: integer }
            n_scored: { type: integer }
            crps: { type: [number, "null"] }
            rmse: { type: [number, "null"] }
            mae: { type: [number, "null"] }
            coverage_90: { type: [number, "null"] }
            coverage_95: { type: [number, "null"] }
            brier: { type: [number, "null"] }
            skill_score: { type: [number, "null"] }
            calibration:
              type: object
              properties: { ece: { type: [number, "null"] }, psi_drift: { type: [number, "null"] } }
        series:
          type: array
          items:
            type: object
            properties:
              t: { type: integer }
              metric_value: { type: [number, "null"] }
              n: { type: integer }
        baselines:
          type: object
          properties:
            climatology: { type: [number, "null"] }
            naive_persistence: { type: [number, "null"] }

    # ── History Lake (§4) ──────────────────────────────────────────────────────
    SeriesCatalogItem:
      type: object
      required: [id, domain, source, entity, unit, n_points, first_t, last_t]
      properties:
        id: { type: string }
        domain: { type: string }
        source: { type: string }
        entity: { type: string }
        label: { type: [string, "null"] }
        unit: { type: [string, "null"] }
        interval: { type: [string, "null"] }
        n_points: { type: integer }
        first_t: { type: [integer, "null"] }
        last_t: { type: [integer, "null"] }
        freshness_seconds: { type: [integer, "null"] }
    SeriesCatalog:
      type: object
      required: [items, page]
      properties:
        items: { type: array, items: { $ref: '#/components/schemas/SeriesCatalogItem' } }
        page: { $ref: '#/components/schemas/Page' }
    SeriesPoints:
      type: object
      required: [id, meta, points, page]
      properties:
        id: { type: string }
        meta:
          type: object
          properties:
            domain: { type: string }
            source: { type: string }
            entity: { type: string }
            unit: { type: [string, "null"] }
            interval: { type: [string, "null"] }
        points:
          type: array
          items:
            type: object
            required: [t, v]
            properties:
              t: { type: integer }
              v: { type: [number, "null"] }
              outcome: { type: [number, "null"] }
        page: { $ref: '#/components/schemas/Page' }

    # ── Pattern scan (§5) ──────────────────────────────────────────────────────
    PatternScanRequest:
      type: object
      additionalProperties: false
      oneOf:
        - { required: [series] }
        - { required: [series_id] }
      properties:
        series:
          type: array
          minItems: 8
          items:
            oneOf:
              - { type: number }
              - { type: object, required: [v], properties: { t: { type: number }, v: { type: number } } }
        series_id: { type: string }
        from: { type: [integer, string] }
        to: { type: [integer, string] }
        detectors:
          type: array
          items: { type: string, enum: [motif, anomaly, regime, changepoint, seasonality] }
          default: [motif, anomaly, regime, changepoint]
        window: { type: integer, minimum: 3 }
        max_results_per_detector: { type: integer, minimum: 1, maximum: 100, default: 10 }
        changepoint:
          type: object
          properties:
            method: { type: string, enum: [pelt, bocpd], default: pelt }
            penalty: { type: string, enum: [bic, aic, mbic], default: bic }
    PatternScanResponse:
      type: object
      required: [series_ref, n_points, motifs, anomalies, regimes, changepoints, math]
      properties:
        series_ref:
          type: object
          properties: { series_id: { type: [string, "null"] }, inline: { type: boolean } }
        n_points: { type: integer }
        window: { type: integer }
        motifs:
          type: array
          items:
            type: object
            properties:
              start_a: { type: integer }
              start_b: { type: integer }
              length: { type: integer }
              distance: { type: number }
              strength: { type: number }
        anomalies:
          type: array
          items:
            type: object
            properties:
              index: { type: integer }
              t: { type: [integer, "null"] }
              score: { type: number }
              matrix_profile: { type: number }
        regimes:
          type: array
          items:
            type: object
            properties:
              label: { type: integer }
              start: { type: integer }
              end: { type: integer }
              summary: { type: string }
              stats: { type: object }
        changepoints:
          type: array
          items:
            type: object
            properties:
              index: { type: integer }
              t: { type: [integer, "null"] }
              confidence: { type: number }
              kind: { type: string, enum: [mean, variance, trend] }
        math: { type: string }

    # ── KGIK (§6b) ─────────────────────────────────────────────────────────────
    KgikNode:
      type: object
      required: [id, type]
      properties:
        id: { type: string }
        type: { type: string }
        label: { type: [string, "null"] }
        attributes: { type: object }
    KgikEdge:
      type: object
      required: [source, relation, target, confidence]
      properties:
        source: { type: string }
        relation: { type: string }
        target: { type: string }
        confidence: { type: number, minimum: 0, maximum: 1 }
        confidence_tier: { type: string, enum: [A, B, C, D] }
        first_seen: { type: [integer, "null"] }
        last_seen: { type: [integer, "null"] }
        support: { type: integer }
        learned: { type: boolean }
    KgikGraph:
      type: object
      required: [snapshot_as_of, nodes, edges, page]
      properties:
        snapshot_as_of: { type: integer }
        nodes: { type: array, items: { $ref: '#/components/schemas/KgikNode' } }
        edges: { type: array, items: { $ref: '#/components/schemas/KgikEdge' } }
        page: { $ref: '#/components/schemas/Page' }
    LinkPredictRequest:
      type: object
      additionalProperties: false
      anyOf:
        - { required: [source] }
        - { required: [target] }
      properties:
        source: { type: [string, "null"] }
        relation: { type: [string, "null"] }
        target: { type: [string, "null"] }
        horizon_hours: { type: [number, "null"] }
        as_of: { type: [integer, string, "null"] }
        top_k: { type: integer, minimum: 1, maximum: 100, default: 10 }
    LinkPredictResponse:
      type: object
      required: [query, predictions, method, as_of]
      properties:
        query:
          type: object
          properties: { source: {}, relation: {}, target: {}, horizon_hours: {} }
        as_of: { type: integer }
        predictions:
          type: array
          items:
            type: object
            required: [source, relation, target, probability]
            properties:
              source: { type: string }
              relation: { type: string }
              target: { type: string }
              probability: { type: number, minimum: 0, maximum: 1 }
              score: { type: number }
              confidence_tier: { type: string, enum: [A, B, C, D] }
              top_path: { type: array, items: { type: string } }
        method:
          type: object
          properties:
            name: { type: string }
            family: { type: string, const: relational }
            models_used: { type: array, items: { type: string } }
            math: { type: string }

    # ── Model registry (§6c) ───────────────────────────────────────────────────
    ModelRegistryItem:
      type: object
      required: [id, name, family, status, version]
      properties:
        id: { type: string }
        name: { type: string }
        family: { type: string, enum: [time_series, event_probability, trajectory, growth, relational, ensemble] }
        domains: { type: array, items: { type: string } }
        status: { type: string, enum: [active, shadow, deprecated, unavailable] }
        version: { type: string }
        source: { type: [string, "null"] }
        weight: { type: [number, "null"] }
        calibration:
          type: object
          properties: { ece: { type: [number, "null"] }, last_calibrated: { type: [integer, "null"] } }
        skill:
          type: object
          properties:
            crps: { type: [number, "null"] }
            rmse: { type: [number, "null"] }
            coverage_90: { type: [number, "null"] }
            n_scored: { type: integer }
        updated_at: { type: [integer, "null"] }
    ModelRegistry:
      type: object
      required: [items]
      properties:
        items: { type: array, items: { $ref: '#/components/schemas/ModelRegistryItem' } }

    # ── Backtest (§6d) ─────────────────────────────────────────────────────────
    BacktestRequest:
      type: object
      required: [series_id, horizon_hours]
      additionalProperties: false
      properties:
        series_id: { type: string }
        models: { type: array, items: { type: string } }
        horizon_hours: { type: number, exclusiveMinimum: 0 }
        from: { type: [integer, string] }
        to: { type: [integer, string] }
        scheme: { type: string, enum: [rolling_origin, expanding_window, sliding_window], default: rolling_origin }
        step: { type: integer, minimum: 1, default: 1 }
        metrics: { type: array, items: { type: string, enum: [crps, rmse, mae, coverage, brier] }, default: [crps, rmse, coverage] }
        baselines: { type: array, items: { type: string, enum: [climatology, naive_persistence, seasonal_naive] }, default: [climatology, naive_persistence] }
        async: { type: boolean, default: false }
        webhook:
          type: [object, "null"]
          properties:
            url: { type: string, format: uri }
            secret: { type: string }
    BacktestRun:
      type: object
      required: [run_id, status, series_id, horizon_hours]
      properties:
        run_id: { type: string }
        status: { type: string, enum: [queued, running, completed, failed] }
        series_id: { type: string }
        horizon_hours: { type: number }
        window:
          type: object
          properties: { from: { type: integer }, to: { type: integer } }
        n_origins: { type: integer }
        results:
          type: array
          items:
            type: object
            properties:
              model: { type: string }
              crps: { type: [number, "null"] }
              rmse: { type: [number, "null"] }
              mae: { type: [number, "null"] }
              coverage_90: { type: [number, "null"] }
              brier: { type: [number, "null"] }
              skill_score: { type: [number, "null"] }
        baselines:
          type: object
          additionalProperties: { type: [number, "null"] }
        poll: { type: [string, "null"] }
```

---

## 19. FORWARD-DOMAIN WORKED EXAMPLES — the remaining branches

§1.3 covered crypto/seismic-GR/trajectory-great-circle/growth/relational. The live `predict()` has more branches (Omori aftershocks, ballistic, orbital, generic) plus more soft-error shapes. Each is documented here as request + on-schema result, grounded in the exact handler that produces it.

### 19.1 Seismic — Omori aftershock branch (`_predict_seismic` → `omori_aftershock_probability`)
Triggered when `params.omori` is present or `params.mainshock_K` is set.
**Request**
```json
{ "question": "Aftershock chance in the next 2 days after the mainshock?",
  "params": { "domain": "seismic", "mainshock_K": 100, "omori_c": 0.05, "omori_p": 1.1,
              "days_since_mainshock": 1.0, "horizon_hours": 48 } }
```
**Success (200)**
```json
{
  "question": "Aftershock chance in the next 2 days after the mainshock?",
  "domain": "seismic", "target": "M>=5.0", "horizon": "2.0d",
  "prediction": { "value": 0.999, "unit": "probability", "point_estimate": 0.999,
    "interval": { "low": 0.0, "high": 1.0, "confidence": 0.0 }, "probability": 0.999 },
  "method": { "name": "Omori-Utsu aftershock decay", "family": "event_probability",
    "models_used": ["omori_aftershock_rate"],
    "math": "Omori-Utsu n(t)=K/(t+c)^p; N=int over horizon; P=1-exp(-N)." },
  "drivers": { "K": 100.0, "c_days": 0.05, "p": 1.1, "t_days": 1.0, "used_underworld": false },
  "data": { "source": "params (mainshock state)", "as_of": 1749038400000, "lookback": "mainshock state",
    "history": [], "forecast": [ { "t": "horizon", "v": 0.999, "low": 0.0, "high": 1.0 } ] },
  "assumptions": [
    "Aftershocks follow the modified Omori-Utsu law n(t)=K/(t+c)^p.",
    "Occurrence is an inhomogeneous Poisson process with this rate."
  ],
  "caveats": [
    "Poisson stationarity ignores clustering / triggering beyond the model used.",
    "Probability is for AT LEAST ONE event of the target magnitude in the horizon.",
    "G-R extrapolation to large M above the catalog max is uncertain."
  ],
  "used_llm": false
}
```

### 19.2 Trajectory — ballistic branch (`_predict_trajectory` → `projectile_range`)
Triggered by `params.projectile` or both `speed` and `angle_deg`.
**Request**
```json
{ "question": "How far will this projectile travel?",
  "params": { "domain": "trajectory", "speed": 100, "angle_deg": 45, "height0": 0 } }
```
**Success (200)**
```json
{
  "question": "How far will this projectile travel?",
  "domain": "trajectory", "target": "Ballistic projectile range", "horizon": null,
  "prediction": { "value": 1019.7, "unit": "meters", "point_estimate": 1019.7,
    "interval": { "low": null, "high": null, "confidence": 0.0 }, "probability": null },
  "method": { "name": "Ballistic projectile range", "family": "trajectory",
    "models_used": ["projectile_range"], "math": "R=v^2 sin(2*theta)/g (no drag, flat ground)." },
  "drivers": { "speed_mps": 100.0, "angle_deg": 45.0, "used_underworld": false },
  "data": { "source": "params", "as_of": 1749038400000, "lookback": "analytic",
    "history": [], "forecast": [ { "t": "impact", "v": 1019.7, "low": 1019.7, "high": 1019.7 } ] },
  "assumptions": ["No aerodynamic drag; flat ground; constant g."],
  "caveats": [
    "Analytic idealisation; point estimate has no statistical interval.",
    "Real ballistics need drag, wind, and Coriolis corrections."
  ],
  "used_llm": false
}
```

### 19.3 Trajectory — orbital-period branch (`_predict_trajectory` → `orbital_period`)
Triggered by `params.semi_major_axis_km` (or `a_km` with "orbit" in the question).
**Request**
```json
{ "question": "What's the orbital period?",
  "params": { "domain": "trajectory", "semi_major_axis_km": 6778 } }
```
**Success (200)**
```json
{
  "question": "What's the orbital period?",
  "domain": "trajectory", "target": "Orbital period (Kepler III)", "horizon": null,
  "prediction": { "value": 92.68, "unit": "minutes", "point_estimate": 92.68,
    "interval": { "low": null, "high": null, "confidence": 0.0 }, "probability": null },
  "method": { "name": "Orbital period (Kepler III)", "family": "trajectory",
    "models_used": ["orbital_period"], "math": "T=2*pi*sqrt(a^3/mu) (Kepler's third law)." },
  "drivers": { "semi_major_axis_km": 6778.0, "used_underworld": false },
  "data": { "source": "params", "as_of": 1749038400000, "lookback": "analytic",
    "history": [], "forecast": [ { "t": "period", "v": 92.68, "low": 92.68, "high": 92.68 } ] },
  "assumptions": ["Two-body Keplerian orbit about Earth (mu=398600 km^3/s^2)."],
  "caveats": [
    "Analytic idealisation; point estimate has no statistical interval.",
    "Ignores J2 oblateness, drag, and third-body perturbations."
  ],
  "used_llm": false
}
```

### 19.4 Generic — series via the growth fitter (`_predict_generic` → `_predict_growth`, `domain` rewritten)
**Request**
```json
{ "question": "Forecast this metric", "params": { "series": [10, 12, 15, 19, 24, 30], "horizon_steps": 3 } }
```
**Success (200)** — note `domain` is rewritten to `generic` while the method/drivers come from the growth fit:
```json
{
  "question": "Forecast this metric", "domain": "generic", "target": null, "horizon": "3 steps",
  "prediction": { "value": 59.3, "unit": null, "point_estimate": 59.3,
    "interval": { "low": 53.1, "high": 65.5, "confidence": 0.95 }, "probability": null },
  "method": { "name": "exponential growth fit", "family": "growth",
    "models_used": ["exponential_fit", "logistic_fit"],
    "math": "exp: ln(y)=ln(y0)+r t (OLS), T2=ln2/r; logistic: y=K/(1+A e^{-r t}), K grid-searched, A,r OLS on logit; pick lower-SSE; CI=point +/- 1.96*sigma_resid." },
  "drivers": { "model": "exponential", "y0": 9.71, "growth_rate": 0.224, "doubling_time": 3.09, "residual_std": 0.62 },
  "data": { "source": "params", "as_of": null, "lookback": "6 points",
    "history": [ { "t": 0, "v": 10 }, { "t": 5, "v": 30 } ],
    "forecast": [ { "t": 6, "v": 38.1, "low": 31.9, "high": 44.3 } ] },
  "assumptions": [
    "Best-fit model selected by SSE: exponential.",
    "Residuals are homoscedastic; CI is +/-1.96*sigma_resid (95%).",
    "Growth regime is stable over the forecast horizon."
  ],
  "caveats": [
    "Exponential growth cannot continue indefinitely; check the logistic K.",
    "Short series make the fit and CI unreliable."
  ],
  "used_llm": false
}
```

### 19.5 Soft-error gallery (every domain's `insufficient_data`, exact `caveats` strings)
These are the verbatim `needs` messages from the handlers, each yielding the §15.1 200 soft shape with the quoted caveat.

| Domain | Trigger | `caveats[0]` (exact) |
|---|---|---|
| crypto | `<3` price points & no resolvable ticker | `Insufficient data to answer. Needs: a price series via params.series/values, or a recognised ticker with network access` |
| seismic | `<2` magnitudes & no USGS access | `Insufficient data to answer. Needs: a magnitude catalog via params.magnitudes, or network access to USGS` |
| trajectory | state vector missing lat/lng/speed/heading | `Insufficient data to answer. Needs: a state vector params.{lat,lng,alt_m,speed_mps,heading_deg,vertical_rate_mps} (no live ADS-B feed; supply current state), or projectile/orbital params` |
| growth | `<3` numeric points | `Insufficient data to answer. Needs: a numeric series via params.series/values (>= 3 points)` |
| generic | `<3` numeric points & not a specific domain | `Insufficient data to answer. Needs: a numeric series via params.series/values to forecast, or a more specific question (crypto ticker, seismic magnitude+region, trajectory state vector)` |
| any | internal exception caught in `predict()` | `<exc str>` + `An internal error was caught and handled; result degraded gracefully.` |

### 19.6 `used_llm` truth table
| Path through `classify()` | `used_llm` |
|---|---|
| `params.domain` set (Kimi skipped) | `false` |
| Kimi returns a valid `domain` and `params.domain` unset | `true` |
| Kimi unavailable / no key / bad JSON → regex fallback | `false` |
| Relational/forward endpoints that consult Kimi for intent | `true` (per §1.3.5 preview) |

---

## 20. PER-ENDPOINT CONTRACT-TEST MATRIX

A normative checklist a conformance suite (or the existing pytest layer for the live route) must assert. "LIVE" rows are testable today against `predict()`; "[FWD]" rows are the forward contracts.

### 20.1 `POST /functions/predict` [LIVE]
| # | Given | Assert |
|---|---|---|
| 1 | `{question:"XRP price in 48h"}` offline (no series) | 200; `method.name=="insufficient_data"`; `domain=="crypto"`; `prediction.value==null`; one caveat starting `Insufficient data` |
| 2 | crypto `params.series` of ≥3 prices | 200; `domain=="crypto"`; `method.family=="time_series"`; `prediction.unit=="USD"`; `interval.confidence==0.90`; `drivers.percentiles` has keys 5/25/50/75/95; deterministic (`seed=42`) → identical `point_estimate` on repeat |
| 3 | seismic with ≥2 `magnitudes` | 200; `method.family=="event_probability"`; `prediction.unit=="probability"`; `0<=probability<=1`; `interval=={low:0,high:1,confidence:0}` |
| 4 | seismic `mainshock_K` set | 200; `method.name=="Omori-Utsu aftershock decay"` |
| 5 | trajectory full `state_vector` | 200; `prediction.value==null`; `point_estimate` is `{lat,lng,alt_m}`; `unit=="lat/lng/alt"` |
| 6 | trajectory `speed`+`angle_deg` | 200; `unit=="meters"`; `method.name=="Ballistic projectile range"` |
| 7 | trajectory `semi_major_axis_km` | 200; `unit=="minutes"`; `method.name=="Orbital period (Kepler III)"` |
| 8 | growth `series` ≥3 + `horizon_steps` | 200; `method.family=="growth"`; `interval.confidence==0.95`; `forecast[].{low,high}` present |
| 9 | generic `series` ≥3 | 200; `domain=="generic"` (rewritten); growth-style `method` |
| 10 | body missing `question` | 4xx `validation_error` (FastAPI/Pydantic) |
| 11 | any handler raises internally | 200 soft `insufficient_data` + "internal error was caught" caveat (never 500) |
| 12 | every 200 response | top-level keys exactly: `question,domain,target,horizon,prediction,method,drivers,data,assumptions,caveats,used_llm`; no `NaN`/`Infinity` tokens in JSON |

### 20.2 Forward endpoints
| Endpoint | Key assertions |
|---|---|
| `/v1/predict/explain` [FWD] | 200 shape has `patterns[].strength∈[0,1]`; bad `forecast_id`→404; no resolvable series→422 `insufficient_data` |
| `/v1/predict/skill` [FWD] | 200 has `headline.n_scored`; empty window→422; `skill_score>0` ⇒ beats baseline |
| `/v1/history/series` [FWD] | cursor pagination terminates (`next_cursor==null`); unknown filter ignored; invalid `sort`→400 |
| `/v1/history/series/{id}` [FWD] | unknown id→404; `downsample` reduces `points` length; `outcomes=true` adds `outcome` |
| `/v1/patterns/scan` [FWD] | `<8` points→422; inline `series>50k`→413; deterministic given identical series |
| `/v1/kgik/graph` [FWD] | unknown `node`→422 `unknown_entity`; `depth` bounded 1..3 |
| `/v1/kgik/link-predict` [FWD] | `anyOf(source,target)` enforced; `predictions[].probability∈[0,1]`; `method.family=="relational"` |
| `/v1/models/registry` [FWD] | `status`/`family` filters narrow `items` |
| `/v1/predict/backtest` [FWD] | no token→401 even when `JARVIS_REQUIRE_AUTH=false`; same `Idempotency-Key`+same body→original run; same key+diff body→409; `async:true`→202+`run_id` |

---

## 21. IDEMPOTENCY, CACHING & CONSISTENCY LIFECYCLE

A consolidated, step-by-step model of how a write replay, a cache hit, and a live-feed read interact — the three behaviours most likely to surprise integrators.

### 21.1 Idempotency-Key lifecycle (`POST /v1/predict/backtest`)
```text
1. Client POSTs body B with Idempotency-Key K.
2. Server computes fingerprint = hash(B). Looks up K.
   a. K unseen           -> store {K, fingerprint, run_id, response} (24h TTL); run; return.
   b. K seen, same fp    -> return the STORED response (200/202); no new run; no job token spent.
   c. K seen, diff fp    -> 409 idempotency_conflict (details.idempotency_key=K).
3. After 24h TTL, K is forgotten; a replay starts a fresh run.
```
Notes: only `/v1/predict/backtest` persists, so it is the only endpoint honouring `Idempotency-Key`. The pure-function POSTs (`/functions/predict`, `/explain`, `/patterns/scan`, `/kgik/link-predict`) need no key — repeat the body to repeat the result.

### 21.2 Cache lifecycle (reads)
- Cacheable reads (`/v1/history/*`, `/v1/models/registry`, `/v1/predict/skill`) send `Cache-Control: public, max-age=<30|60>` and a strong `ETag`.
- Client sends `If-None-Match: <etag>` → `304 Not Modified` (no body) when unchanged; saves bandwidth on polling loops (e.g. a registry watcher).
- Writes and forecasts send `Cache-Control: no-store`.

### 21.3 Live-feed read consistency (the in-process 5-min cache)
- `load_crypto_series` / `load_seismic_catalog` cache successful fetches for `_CACHE_TTL = 300 s` keyed by `(asset|filters, window)`; failures are **not** cached (so a transient feed blip self-heals on the next call).
- Consequence for `/functions/predict` with **no** `params.series`: two identical questions within 5 min return identical data (cache hit) and — because GBM is `seed=42` — an identical forecast; after the TTL, fresh data may shift the answer. Hence `Cache-Control: no-store` on the route (§11) even though it is body-pure.
- With `params.series` supplied, the network is never touched (`_series_from_params` short-circuits) → fully deterministic, offline, test-friendly.

### 21.4 Determinism guarantees (normative)
| Condition | Deterministic? |
|---|---|
| `/functions/predict` with `params.series` (any domain) | **Yes** — pure function; GBM `seed=42`; growth/seismic/trajectory are closed-form. |
| `/functions/predict` crypto/seismic without `params`, within 5-min cache | Yes for the cache window (same cached data + seeded MC). |
| `/functions/predict` across the 5-min TTL boundary | No — fresh live data may change the answer. |
| `/v1/predict/stream` terminal `done` vs non-streamed `/functions/predict` | **Identical** body for identical input. |
| Forecast with a remote/shadow model (e.g. TimesFM) | Subject to that model's own determinism guarantees (not the native `seed=42`). |

---

## 22. END-TO-END ANNOTATED TRANSCRIPT (HTTP wire view)

A full request/response pair on the wire for the live route, headers included, to anchor the header/envelope contracts above.

**Request**
```http
POST /functions/predict HTTP/1.1
Host: api.apex.local
Content-Type: application/json
Accept: application/json
Authorization: Bearer JARVIS_xxx          # optional when JARVIS_REQUIRE_AUTH=false
X-Request-Id: req_client_7af3             # optional; echoed back

{"question":"Project our user growth 6 months out",
 "params":{"domain":"growth","series":[1000,1320,1700,2150,2700,3300,3950],
           "horizon_steps":6,"unit":"users"}}
```
**Response**
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
X-Request-Id: req_client_7af3
X-API-Version: 1.4.0
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 119
X-RateLimit-Reset: 1749038460
Cache-Control: no-store

{"question":"Project our user growth 6 months out","domain":"growth","target":null,
 "horizon":"6 steps",
 "prediction":{"value":11842.6,"unit":"users","point_estimate":11842.6,
   "interval":{"low":10903.1,"high":12782.1,"confidence":0.95},"probability":null},
 "method":{"name":"exponential growth fit","family":"growth",
   "models_used":["exponential_fit","logistic_fit"],"math":"exp: ln(y)=ln(y0)+r t ..."},
 "drivers":{"model":"exponential","y0":1014.2,"growth_rate":0.226,"doubling_time":3.07,"residual_std":479.3},
 "data":{"source":"params","as_of":null,"lookback":"7 points",
   "history":[{"t":0,"v":1000},{"t":6,"v":3950}],
   "forecast":[{"t":7,"v":4942.1,"low":4002.8,"high":5881.4}]},
 "assumptions":["Best-fit model selected by SSE: exponential.","Residuals are homoscedastic; CI is +/-1.96*sigma_resid (95%).","Growth regime is stable over the forecast horizon."],
 "caveats":["Exponential growth cannot continue indefinitely; check the logistic K.","Short series make the fit and CI unreliable."],
 "used_llm":false}
```
**Annotations**
- `X-Request-Id` echoes the client value (else server-generated); equals `error.request_id` on the failure path.
- `Cache-Control: no-store` even for this deterministic params-supplied call — one simple rule (§11/§21.3).
- The body is exactly the `PredictResponse` schema (§10.3 / §1.2): top-level keys fixed, `probability:null` (growth has no event probability), `interval.confidence:0.95` (growth band), `used_llm:false` (params forced the route).

---

> Append an entry to `VERSION_LOG.md` for this expansion pass (sections touched: 07; depth added: full request/response JSON Schemas, per-domain examples, error taxonomy, versioning/deprecation, frontend contract; **this pass:** complete OpenAPI 3.1 document (§10), full header reference (§11), pagination/filtering/sorting reference (§12), SSE + webhooks streaming contracts (§13), rate-limit tier matrix (§14), exhaustive per-code error catalogue with retry flow (§15), frontend `kimiClient`/`oracle` + curl + Python SDK snippets (§16), backwards-compat/versioning/deprecation matrix with worked timeline (§17), the deferred OpenAPI component schemas in full (§18), the remaining forward-domain worked examples incl. Omori/ballistic/orbital/generic + soft-error gallery + `used_llm` truth table (§19), per-endpoint contract-test matrix (§20), idempotency/caching/consistency lifecycle (§21), and an end-to-end annotated wire transcript (§22)).
