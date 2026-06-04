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

> Append an entry to `VERSION_LOG.md` for this expansion pass (sections touched: 07; depth added: full request/response JSON Schemas, per-domain examples, error taxonomy, versioning/deprecation, frontend contract).
