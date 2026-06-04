# 02 — Jarvis Backend: Complete File Inventory

Exhaustive, file-by-file inventory of `server/`. Every `.py` file (and the
data/prompt assets) was read in full. Line citations are `file:line`.

**Stack:** FastAPI + Uvicorn, httpx, pydantic v2, numpy, scikit-learn, scipy,
stdlib `sqlite3`. See `server/requirements.txt:1-10`.

**Tree (non-`__pycache__`):**

```
server/
  __init__.py            (empty package marker)
  main.py                (FastAPI app factory + lifespan loops)
  config.py              (env config, feed URLs, auth flags)
  auth.py                (bearer dependencies)
  requirements.txt
  routes/   auth.py  entities.py  functions.py  history.py  predict.py  streams.py
  services/ analyst.py  backtest.py  corpus.py  forecaster.py  forecaster_ml.py
            forward_test.py  history_lake.py  ingestion.py  live_intel.py
            oracle_model.py  prediction.py  scrapers.py  simulation.py  train_sp500.py
  data/     ontology.py  corpus.py  history_lake.db  oracle_model.joblib
  llm/      kimi.py
  prompts/  analyst.md
  scripts/  accuracy_scorecard.py  forward_test.py  horizon_sweep.py  live_5min.py
            predict_5min.py  train_backtest.py  train_oracle.py  train_sp500.py
  tests/    test_forecaster.py  test_forecaster_ml.py  test_forward_test.py
            test_history_lake.py  test_oracle_model.py  test_prediction.py
            test_routes.py  test_simulation.py  test_train_sp500.py
```

Total ~9,935 lines of Python (services dominate: prediction 1187, simulation 783,
oracle_model 654, forecaster_ml 624, history_lake 622, forward_test 587,
forecaster 567).

---

## 0. APP ENTRY + CONFIG + AUTH

### `server/main.py` (76 lines) — app factory
- `create_app() -> FastAPI` (`main.py:52`): builds the app, adds CORS
  (`CORSMiddleware`, origins from `config.CORS_ORIGINS`, `allow_credentials`,
  all methods/headers — `main.py:54-60`), includes all six routers
  (`main.py:62-67`), defines `GET /` health root returning
  `{"service":"jarvis-backend","status":"ok"}` (`main.py:69-71`).
- `app = create_app()` module-level (`main.py:76`) — the ASGI entrypoint.
- `_lifespan(app)` async ctx mgr (`main.py:20-49`): two **opt-in** background
  loops, both disabled by default so imports/tests never touch network/DB:
  - History-Lake ingestion loop — only when `HISTORY_INGEST_ENABLED` truthy
    (`_ingest_enabled()` `main.py:16-17`), interval `HISTORY_INGEST_INTERVAL_S`
    (default 900s); spawns `services.ingestion.ingestion_loop` (`main.py:27-31`).
  - Forward-test loop — `services.forward_test.start_loop_if_enabled()`
    (`main.py:36-41`), gated on `FORWARD_TEST_ENABLE`.
  - Both tasks cancelled on shutdown (`main.py:45-49`).

### `server/config.py` (25 lines) — environment config
Module constants, all env-overridable:
- `API_KEY` (`JARVIS_API_KEY`, default `"dev-key"`) — `config.py:3`.
- `KIMI_BASE_URL` / `KIMI_API_KEY` / `KIMI_MODEL` (default
  `kimi-k2-0905-preview`) — `config.py:4-6`.
- `REQUIRE_AUTH` (`JARVIS_REQUIRE_AUTH`, default **false**) — public reads work
  keyless unless set — `config.py:11`.
- `CORS_ORIGINS` (`JARVIS_CORS_ORIGINS`, default localhost:5173) — `config.py:13-20`.
- `USGS_FEED` (2.5_day summary geojson) — `config.py:22`.
- `FX_FEED` (open.er-api.com, base AUD, keyless) — `config.py:24`.
- `LIVE_INTEL_TTL_SECONDS = 60` — `config.py:25`.

### `server/auth.py` (31 lines) — bearer deps
- `_check(authorization) -> str|None` (`auth.py:6`): validates `Bearer <token>`
  against `API_KEY`, raises 401 on missing/invalid.
- `require_bearer(authorization=Header) -> str` (`auth.py:15`): **strict**, always
  requires a valid token (used by entities CRUD, `/auth/me`, ingest, stubs).
- `optional_bearer(...) -> str|None` (`auth.py:20`): **public read**; enforces
  token only if `REQUIRE_AUTH`, else validates a supplied token but allows
  absence. Used by getLiveIntel, analystChat, predict, streams, history reads.

---

## 1. ROUTES

All routers are included in `main.py:62-67`. Auth column: `optional` =
`optional_bearer` (public by default), `strict` = `require_bearer`.

### `server/routes/auth.py` (10 lines)
| Method | Path | Auth | Returns | Frontend |
|---|---|---|---|---|
| GET | `/auth/me` | strict | `{"role":"admin","provider":"kimi-k2.6","authenticated":true}` (`auth.py:10`) | **WIRED** — `kimiClient.auth.me()` (`src/api/kimiClient.js:41`), shown in `AuthGate.jsx` |

### `server/routes/functions.py` (76 lines)
Request model `ChatRequest{message:str}` (`functions.py:16`).

| Method | Path | Auth | Service | Frontend |
|---|---|---|---|---|
| POST | `/functions/getLiveIntel` | optional | `live_intel.get_live_intel()` (`functions.py:20-22`) | **WIRED** — JarvisTerminal, JarvisAssistant, SystemHealth |
| POST | `/functions/analystChat` | optional | SSE stream; `llm.kimi.stream_chat` if `KIMI_API_KEY` else local `_local_chat` over `analyst.answer` (`functions.py:36-48`) | **WIRED** — CommandCenter, JarvisTerminal:802, JarvisAssistant:23 |

`_sse_chat` (`functions.py:36`) picks Kimi vs local fallback by key presence,
JSON-encodes each chunk into SSE `data:` frames + `[DONE]`. `_local_chat`
(`functions.py:25`) streams `analyst.answer(message, live_intel)` word-by-word
with a 12ms delay for a typing effect.

**Stub functions (`functions.py:53-76`)** — 11 names registered in a loop, each
POST + `require_bearer`, returning `{"status":"not_implemented","function":name}`:
`checkUrgentEmail`, `runOmegaScanBatch`, `psgJobPipeline`, `gmailJobWatcher`,
`gmailJobWatcherV2`, `psgEmailToOpenSolarToSM8`, `psgEmailToOpenSolarToServiceM8`,
`addJobComponents`, `psgPipelineHandler`, `loadOmegaContext`, `getJarvisIntel`.
These are **STUBS** (return `not_implemented`). The frontend can call any of them
via the `kimiClient.functions.<name>` Proxy (`src/api/kimiClient.js:32`), but they
do nothing real.

### `server/routes/predict.py` (114 lines)
Request model `PredictRequest{question:str, params:dict|None}` (`predict.py:28`).

| Method | Path | Auth | Service | Frontend |
|---|---|---|---|---|
| POST | `/functions/predict` | optional | `services.prediction.predict(question, params)` (`predict.py:104-114`) | **WIRED** — `PredictionOracle.jsx:27,78` via `kimiClient.functions.predict` |

Extra: best-effort forecast logging into the forward-test loop. `_log_forecast`
(`predict.py:45`) fires only when `FORWARD_TEST_LOG` is truthy
(`_forward_test_log_enabled` `predict.py:33`) AND `result.domain ∈
{crypto, series, growth, generic}` (`_LOGGABLE_DOMAINS` `predict.py:42`); it
derives a numeric horizon + `resolve_ts` and calls `history_lake.record_forecast`.
Never raises. Disabled by default — ordinary predict calls do **not** write the DB.

### `server/routes/entities.py` (106 lines) — generic in-memory CRUD
In-memory `_store` seeded with `IntelProfile` (from `ontology.OBJECTS`) and
`RiskSignal` (from `ontology.RISK_SIGNALS`) (`entities.py:27-30`). `_bucket(name)`
lazily creates a dict per entity name (`entities.py:33`). All endpoints `strict`.

| Method | Path | Body | Behaviour |
|---|---|---|---|
| POST | `/entities/{name}` | `ListFilter{where,limit}` | list w/ optional `where` filter + `limit` (`entities.py:42-57`) |
| GET | `/entities/{name}/{item_id}` | — | get one, 404 if absent (`entities.py:60-69`) |
| PUT | `/entities/{name}` | dict | create (id = body.id or uuid4) (`entities.py:72-81`) |
| PATCH | `/entities/{name}/{item_id}` | dict | update, 404 if absent (`entities.py:84-95`) |
| DELETE | `/entities/{name}/{item_id}` | — | delete (204) (`entities.py:98-106`) |

**Frontend:** `kimiClient.entities.<Name>.list/get/create/update/remove`
(`src/api/kimiClient.js:22-26`). `src/api/entities.js:3-14` declares 13 entity
names (SolarProduct, ProductRecall, Investment, WealthSnapshot, Task, Contact,
OmegaScanProgress, SwarmJob, **IntelProfile**, **RiskSignal**, GmailSyncState,
WorkflowMapping). Only IntelProfile/RiskSignal are seeded; the rest are empty
buckets. **PARTIALLY WIRED** — generic plumbing exists; storage is volatile
(per-process dict, lost on restart). No persistence layer.

### `server/routes/streams.py` (50 lines) — SSE tactical sims
`_HZ = 8.0` (`streams.py:22`). `_frames(key)` async generator (`streams.py:25`):
steps the sim to now, emits `frame()` + `maps` as SSE JSON at 8Hz.

| Method | Path | Auth | Query | Service | Frontend |
|---|---|---|---|---|---|
| GET | `/streams/{key}` | optional | `map?` | `simulation.get_game(key)`, `.set_map`, streams `_frames` (`streams.py:35-50`) | **WIRED** — War.jsx:132, JarvisTerminal:1317/1329, Underworld.jsx:17 for `panopticon`/`counterstrike` |

404 on unknown stream key (`streams.py:42-43`).

### `server/routes/history.py` (64 lines) — History Lake / skill (P0)
Delegates to `services.history_lake` (`history.py:20`).

| Method | Path | Auth | Service | Frontend |
|---|---|---|---|---|
| GET | `/v1/history/series` | optional | `lake.list_series()` catalog + counts (`history.py:25-29`) | **DORMANT** — no frontend caller |
| GET | `/v1/history/series/{series_id}` | optional | `lake.read_series(since,limit)`, 404 if unknown (`history.py:32-46`) | **DORMANT** |
| GET | `/v1/predict/skill` | optional | `lake.skill_summary(domain?)` (`history.py:49-55`) | **DORMANT** |
| POST | `/v1/history/ingest` | strict | `ingestion.ingest_all()` (lazy import) (`history.py:58-64`) | **DORMANT** — admin only |

These four endpoints are fully implemented but **not referenced anywhere in
`src/`** (confirmed: no `/v1/` string in the frontend). Backend capability with
no UI surface — see GAPS.

---

## 2. SERVICES

### `server/services/live_intel.py` (146 lines) — getLiveIntel aggregator
Caches the assembled payload 60s in-memory (`_cache` + `_lock`, `live_intel.py:30-31`).
- `get_live_intel() -> dict` (`live_intel.py:124`): double-checked-locked cache;
  on miss, concurrently fetches earthquakes + markets, then assembles
  `{earthquakes, markets, corpus, panopticon, counterstrike, generated_at}`
  (`live_intel.py:136-145`). **Data sources:** USGS feed, CoinGecko simple/price,
  open.er-api FX, `services.corpus.get_corpus()`, `simulation.snapshot()` x2.
- `_earthquakes(client)` (`live_intel.py:34`): USGS `USGS_FEED`, first 50 features
  → `{lat,lng,mag,place,time}`.
- `_crypto(client)` (`live_intel.py:67`): CoinGecko `simple/price` for
  `_COINS = [ripple/aud, bitcoin/aud, ethereum/usd]` (`live_intel.py:21-26`) w/
  24h change.
- `_fx(client)` (`live_intel.py:98`): open.er-api AUD base → AUD/USD and AED/AUD.
- `_markets(client)` (`live_intel.py:119`): gathers crypto + fx.
- `_fmt_price(price)` (`live_intel.py:59`): thousands/precision formatting.
- **WIRED** (drives `/functions/getLiveIntel`).

### `server/services/analyst.py` (144 lines) — keyless local analyst
Retrieval-over-ontology answerer used when `KIMI_API_KEY` is absent.
- `answer(message, live=None) -> str` (`analyst.py:109`): keyword-routes the
  question: risks → `_risk_summary`; markets/price → `_markets_summary(live)`;
  email/corpus/timeline → `_corpus_summary`; entity keywords (`_TOPICS`
  `analyst.py:20-46`) → `_entity_block`s; else overview.
- `_links_for(obj_id)` (`analyst.py:49`), `_entity_block(obj_id)` (`analyst.py:59`),
  `_risk_summary()` (`analyst.py:75`), `_markets_summary(live)` (`analyst.py:84`,
  includes a XRP×9,300 valuation line), `_corpus_summary()` (`analyst.py:102`).
- **Data sources:** `data.ontology` (OBJECTS/LINKS/RISK_SIGNALS), `data.corpus`
  (EMAIL_TABLES/TIMELINE), live markets dict.
- **WIRED** (fallback path of `/functions/analystChat`).

### `server/services/corpus.py` (53 lines) — corpus payload
- `get_corpus() -> dict` (`corpus.py:32`): assembles `{timeline, facts{predicates,
  total}, totals{...}}` + spreads all `EMAIL_TABLES` (`corpus.py:32-53`).
- `_predicate_counts() -> dict` (`corpus.py:16`): honest tallies (ENTITIES,
  RELATIONS, RISK_SIGNALS, EMAILS, TIMELINE, ORGS, INVESTMENTS, PEOPLE) derived
  from ontology + corpus.
- **Data sources:** `data.corpus`, `data.ontology`.
- **WIRED** (embedded in getLiveIntel payload).

### `server/services/simulation.py` (783 lines) — live tactical sims
Wall-clock-advanced sim engine, two modes sharing one schema.
- `Unit` dataclass (`simulation.py:52`): position/target/hp/state/weapon/kills/
  role/timer/wp.
- `GameSim` dataclass (`simulation.py:79`): full match state for both modes.
  Public methods:
  - `set_map(map_name)` (`simulation.py:193`): switch map + reset match.
  - `step_to_now(hz=8.0)` (`simulation.py:678`): advance by elapsed wall-clock
    steps, capped at `_CATCHUP_CAP=600` (`simulation.py:33`).
  - `frame() -> dict` (`simulation.py:704`): additive schema — base keys
    (map/tick/round/bounds/mode/phase/score/events/units) always present; CS adds
    `bombsites`/`bomb`, panopticon adds `objectives`/`alert_level`/
    `intrusions_stopped`/`breaches`.
  - Internal: `_advance` (`:670`), `_advance_cs` (`:331`, bomb round loop:
    buy→live→planted→over, plant/defuse, LOS combat), `_advance_pano` (`:532`,
    AGENT patrol/vision-cone/capture vs INTRUDER breach, escalating alert),
    `_reset_match`, `_build_bombsites`, `_build_objectives`, `_cs_combat`,
    `_end_cs_round`, etc.
- Module: `get_game(key) -> GameSim|None` (`simulation.py:772`),
  `snapshot(key) -> dict` (`simulation.py:776`). `_GAMES` registry
  (`simulation.py:752`): `counterstrike` (CT/T, 5v5, maps de_dust2/mirage/inferno/
  nuke `_CS_BOUNDS:740`), `panopticon` (AGENT/INTRUDER, 6v3, maps city_grid/
  dockyard/industrial_zone `_PANO_BOUNDS:746`).
- **WIRED** — drives `/streams/{key}` and the `panopticon`/`counterstrike` keys in
  the getLiveIntel snapshot.

### `server/services/prediction.py` (1187 lines) — UNIFIED PREDICTION ENGINE
The core "ask anything" forecaster powering `POST /functions/predict`.
`predict(question, params) -> dict` classifies into one of 5 domains, loads data,
runs a domain forecaster, and returns an HONEST schema (point + interval/prob +
assumptions + caveats). **Never raises** on a normal question (`predict.py:789`).

**Domain handlers** (`predict()` dispatch `prediction.py:806-815`):
- `_predict_crypto` (`:835`): GBM Monte-Carlo + Holt blend, USD point + 90% band
  + P(up). Loads via `load_crypto_series` when only a ticker is given.
- `_predict_seismic` (`:907`): Gutenberg-Richter + Poisson (or Omori aftershock
  branch when mainshock params supplied), returns a probability. Loads USGS.
- `_predict_trajectory` (`:1001`): orbital period (Kepler III), ballistic range,
  or great-circle forward extrapolation of a state vector.
- `_predict_growth` (`:1117`) / `_predict_generic` (`:1175`): exponential/logistic
  fit + residual CI.

**Forecaster primitives** (pure numpy/math, reused widely across the ML stack):
- `gbm_montecarlo_forecast(values, horizon_steps, ...)` (`:284`): log-returns →
  drift/vol → GBM terminal MC (default 10k paths) blended 50/50 with Holt
  (α=0.3,β=0.1); returns point/percentiles/P(up)/drivers/math.
- `gutenberg_richter_poisson(magnitudes, *, target_magnitude, horizon_days,
  catalog_days, mc)` (`:369`): G-R MLE b/a → Poisson λ → P(≥1 in T).
- `omori_aftershock_probability(*, K, c_days, p, t_days, horizon_days)` (`:443`).
- `great_circle_forward(*, lat, lng, alt_m, speed_mps, heading_deg,
  vertical_rate_mps, minutes)` (`:474`): haversine direct geodesic.
- `fit_growth_series(values, horizon_steps, *, timestamps)` (`:532`): exp +
  logistic (grid K) fit, lower-SSE chosen, ±1.96σ CI.

**Classifier:** `classify(question, params)` (`:673`): tries Kimi NL intent
extraction `_kimi_extract` (`:65`, key-optional, network), then param override,
then a robust regex/keyword fallback (`:707`). Helpers `_parse_horizon_hours`
(`:634`), `_find_ticker` (`:665`).

**Data loaders** (best-effort, ~5-min in-process cache `_CACHE`/`_CACHE_TTL=300`
`:128-141`):
- `load_crypto_series(asset, days=90)` (`:156`): CoinGecko market_chart →
  `[{t,v}]`.
- `load_crypto_history(asset, days=365)` (`:184`): longest free-tier daily series.
- `load_seismic_catalog(*, min_magnitude, days, lat, lng, radius_km)` (`:214`):
  USGS fdsnws.
- `_cg_headers()` (`:147`): `CG_API_KEY` demo header from env.
- Ticker map `_TICKER_TO_ID` (`:112`); endpoints `_COINGECKO_BASE`/`_USGS_QUERY`
  (`:125-126`).

**Optional underworld reuse** (`prediction.py:44-61`): tries to import
`underworld.server.services` methods (`gutenberg_richter_b_value`,
`omori_aftershock_rate`, `energy_from_magnitude`, `projectile_range`,
`orbital_period`) into `_UW`; soft-fails to native math when absent.

Schema assemblers: `_insufficient` (`:749`), `_series_from_params` (`:771`),
`_horizon_label` (`:822`), `_seismic_result` (`:969`), `_trajectory_result`
(`:1095`). **WIRED** (predict route + indirectly by ingestion/backtest/forward-test
loaders).

### `server/services/forecaster.py` (567 lines) — trained short-horizon ensemble (pure numpy)
- `ShortHorizonForecaster` class (`:220`): a TRAINED ridge-regression member +
  GBM member, error-weighted ensemble (F18), EnbPI conformal intervals (F19).
  - `train(series, *, horizon_steps=1) -> dict` (`:265`): builds lagged-return
    features, ridge closed-form fit on a train split, calibrates conformal
    residuals + member weights on a held-out tail.
  - `predict_next(series, *, horizon_steps, confidence=0.9) -> dict` (`:453`):
    returns `{point, interval{low,high,confidence}, prob_up, members{ridge,gbm},
    weight}` or graceful `insufficient_data`.
  - Internals: `_min_len` (`:259`), `_inverse_error_weights` (`:361`),
    `_ret_to_level` (`:379`), `_gbm_point` (`:386`, reuses
    `prediction.gbm_montecarlo_forecast`), `_featurize_origin` (`:412`),
    `_conformal_halfwidth` (`:532`), `_prob_up` (`:541`).
- Module helpers: `_as_values_times` (`:59`, **reused everywhere**), `_ewma`
  (`:80`), `_time_of_day_frac` (`:97`), `_build_features` (`:105`), `_ridge_fit`
  (`:195`), `_ridge_predict` (`:215`). Knobs `DEFAULT_N_LAGS=6`,
  `DEFAULT_RIDGE_LAMBDA=1.0`, `DEFAULT_CAL_FRACTION=0.25`, etc. (`:43-56`).
- **DORMANT relative to HTTP** — not reachable via any route. Used by
  `backtest.py`, `forward_test.py` (fallback), and CLI scripts
  (predict_5min/live_5min/accuracy_scorecard).

### `server/services/forecaster_ml.py` (624 lines) — high-capacity GBM forecaster
Upgrades `ShortHorizonForecaster` to gradient-boosted trees + calibrated quantile
intervals. Graceful sklearn fallback (`_SKLEARN_OK` `:44-54`; delegates to
`ShortHorizonForecaster` when sklearn absent).
- `MLForecaster` class (`:293`): HistGBR median + 3 quantile HistGBRs
  (α=0.05/0.5/0.95) + conformal widening; `fast` flag shrinks the boosting budget.
  - `train(series, *, horizon_steps=1) -> dict` (`:342`).
  - `predict_next(series, *, horizon_steps, confidence=0.9) -> dict` (`:463`) →
    `{point, interval, prob_up, model, ...}`; `_predict_impl` (`:492`).
  - Internals: `_min_len` (`:338`), `_ret_to_level` (`:565`),
    `_quantile_interval` (`:570`, uses scipy `norm.ppf` to rescale to confidence),
    `_conformal_halfwidth` (`:599`), `_prob_up` (`:606`).
- Feature engineering (CAUSAL, reused by oracle/train_sp500): `_feature_matrix`
  (`:156`) and `_supervised` (`:257`) build lagged returns, SMA/EMA ratios, rvol,
  momentum, RSI(14), MACD(12/26/9), z-score(20), calendar seasonality. Helpers
  `_ema` (`:76`), `_rolling_mean` (`:93`), `_rolling_std` (`:103`), `_rsi` (`:112`),
  `_macd` (`:133`), `_calendar` (`:143`). Knobs `_RET_LAGS`/`_MA_WINDOWS`/…
  (`:61-72`).
- **DORMANT relative to HTTP**. Default forecaster for `forward_test.py`,
  `oracle_model.py` (ret head), `horizon_sweep.py` script.

### `server/services/oracle_model.py` (654 lines) — ORACLE multi-head model
The "serious, heavily trained" model. Three heads on the shared causal feature
matrix: DIRECTION (calibrated P(up)), VOLATILITY (|fwd return|), RETURN/LEVEL
(delegated to `MLForecaster`). Reports CONVICTION; honest about ~50-55% directional.
- `OracleDataset` dataclass (`:63`): pooled multi-asset leakage-safe dataset.
  - `from_series_map(series_map, *, horizon_steps, min_rows)` (`:97`): pools many
    assets, global chronological sort.
  - `time_split(test_fraction=0.2)` (`:170`), `tail(n_rows)` (`:177`),
    `_slice` (`:181`).
- `purged_time_folds(n, *, n_folds=4, embargo=0)` (`:192`): forward-chaining CV
  with embargo (≥ horizon) — no leakage.
- `OracleModel` class (`:229`): `_PARAM_GRID` hyperparam grid (`:220`).
  - `train(dataset, *, hyperparam_search=True, n_folds=4, ret_series_map=None)`
    (`:292`): purged-CV log-loss search on direction head, isotonic/sigmoid
    calibration (prefit tail), volatility head, optional ret head.
  - `predict(series, *, horizon_steps, confidence, act_threshold)` (`:435`) →
    `{direction, prob_up, conviction, vol_pred, point, interval, act}`.
  - `predict_matrix(X)` (`:419`, vectorized for scorecards), `update(...)`
    (`:496`, rolling-window online refit), `save(path)`/`load(path)`
    (`:528`/`:550`, joblib).
- `evaluate(model, test, thresholds)` (`:591`): honest scorecard — all-bars
  dir-acc, dir-acc@conviction, top-conviction slices, vol R²/MAE/corr, Brier +
  reliability bins.
- `_concat_datasets` (`:574`).
- **Persisted artifact:** `data/oracle_model.joblib` (~1.36 MB, regenerated
  2026-06-04 by `train_oracle.py`).
- **DORMANT relative to HTTP** — trained/used by the `train_oracle.py` CLI only;
  **no route loads `oracle_model.joblib`**, no UI surface. See GAPS.

### `server/services/history_lake.py` (622 lines) — HISTORY LAKE (P0, SQLite)
Persistent self-improving store. stdlib `sqlite3`, WAL, idempotent DDL/writes,
never raises. DB path `HISTORY_LAKE_DB` (default `server/data/history_lake.db`)
(`_db_path` `:44`). `init_db()` runs on import (`:622`).

**Schema (`SCHEMA_SQL` `:55-120`):**
- `series(series_id PK, source, entity, metric, unit, freq, created_ts,
  UNIQUE(source,entity,metric,unit,freq))`.
- `observation(series_id FK, ts, value, quality, PK(series_id,ts))` + index.
- `feed_run(id PK, source, started_ts, ended_ts, n_rows, status, note)` + index.
- `forecast(id PK, question, domain, target, horizon, issued_ts, point, low,
  high, confidence, probability, method, drivers_json)` + indexes.
- `realized_outcome(forecast_id PK FK, realized_ts, actual_value)`.
- `skill_score(forecast_id PK FK, abs_err, sq_err, in_interval,
  skill_vs_baseline, scored_ts)` + index.

**Public functions:**
- `init_db(db_path=None)` (`:148`), `_connect` (`:124`).
- `upsert_series(source, entity, metric, *, unit, freq, db_path) -> sid` (`:170`);
  `_series_id` deterministic uuid5 (`:163`).
- `write_observations(series_id, points, *, db_path) -> int` (`:210`).
- `read_series(series_id, *, since, limit, db_path) -> [{t,v,quality}]` (`:257`).
- `list_series(db_path) -> [...]` (`:291`, with counts + ts bounds).
- `start_feed_run(source)` (`:317`) / `finish_feed_run(run_id, *, status, n_rows,
  note)` (`:334`) / `list_feed_runs(limit=50)` (`:359`).
- `record_forecast(*, question, domain, target, horizon, point, low, high,
  confidence, probability, method, drivers, issued_ts, forecast_id, db_path)
  -> fid` (`:374`).
- `record_outcome(forecast_id, actual, realized_ts, *, db_path) -> bool` (`:430`).
- `score_due_forecasts(now, resolver, *, db_path) -> int` (`:500`): scores every
  matured-and-unscored forecast via a `resolver(row)` callback; writes
  realized_outcome + skill_score. `_write_skill` (`:460`).
- `skill_summary(domain=None, *, db_path) -> {n_scored, mae, rmse, coverage,
  mean_skill_vs_baseline}` (`:573`).
- **Current DB state:** tables present; `forecast`=4 rows, all other tables empty
  (series/observation/feed_run/realized_outcome/skill_score = 0).
- **Reachable via** `/v1/history/*` and `/v1/predict/skill` routes (DORMANT — no
  frontend), and the predict-route forward-test logging (opt-in).

### `server/services/ingestion.py` (193 lines) — INGESTION ADAPTERS (P0)
Pull world feeds into the History Lake; each adapter opens/closes a `feed_run`.
- `ingest_crypto(assets=None, *, days=90) -> dict` (`:39`): CoinGecko via
  `prediction.load_crypto_series`; default `_CRYPTO_ASSETS` (`:29`).
- `ingest_seismic(*, days=30, min_magnitude=2.5) -> dict` (`:68`): USGS catalog →
  daily event_count + max_magnitude series.
- `ingest_fx(pairs=None) -> dict` (`:127`): open.er-api FX (`_fetch_fx` `:115`),
  base AUD, default `_FX_PAIRS` (`:30`).
- `ingest_all() -> dict` (`:163`): runs all 3 fault-isolated, returns audit.
- `ingestion_loop(interval_s=900, *, run_immediately=True)` async (`:177`): opt-in
  background loop (runs adapters in a threadpool). Started from `main.py` lifespan
  only when `HISTORY_INGEST_ENABLED`.
- **Reachable via** `POST /v1/history/ingest` (admin) and the opt-in loop. DORMANT
  by default.

### `server/services/scrapers.py` (185 lines) — deep-history scrapers (key-less)
- `cryptocompare_full(fsym, tsym="USD", *, max_calls=6) -> [{t,v}]` (`:18`):
  paginated CryptoCompare histoday back to listing.
- `yahoo_daily(symbol, *, rng="10y", interval="1d") -> [{t,v}]` (`:60`): Yahoo
  Finance chart API (indices use `^`).
- `sp500_constituents() -> [{ticker,sector}]` (`:96`): scrapes the Wikipedia "List
  of S&P 500 companies" table (cached `_SP500_CACHE`).
- `deep_history(asset) -> [{t,v}]` (`:171`): routes asset → Yahoo (indices/stocks)
  or CryptoCompare (crypto/gold). Maps `_CC_SYM` (`:51`), `_YAHOO_SYM` (`:84`).
- **DORMANT relative to HTTP** — used by `forward_test.py` (stock resolve) and the
  training/backtest CLI scripts.

### `server/services/forward_test.py` (587 lines) — LIVE FORWARD-TEST LOOP (P0)
Closes the self-improvement loop: issue → persist → (horizon elapses) → resolve →
score. Nothing touches network/DB on import; loops are opt-in.
- `issue_forecast(asset, *, horizon_steps=1, source="crypto", model="ml",
  confidence=0.9, now_ts, series, db_path, fast) -> dict` (`:125`): loads live
  series, trains the forecaster, persists via `history_lake.record_forecast` with
  `horizon`/`resolve_ts` set; returns the persisted row.
- `resolve_value(asset, target_ts, source, *, series) -> float|None` (`:239`):
  first realized value at/after `target_ts` from the live feed; never fabricates.
- `score_due(now_ts=None, *, source_hint="crypto", db_path, resolver) -> dict`
  (`:334`): delegates to `history_lake.score_due_forecasts`; default resolver
  reconstructs (asset, resolve_ts, source) from drivers. Returns count + scorecard.
- `scorecard(domain=None, *, db_path) -> dict` (`:388`) / `_scorecard` (`:378`):
  `skill_summary` enriched with `_directional_rollup` (`:279`).
- `forward_test_loop(assets, *, horizon_steps, interval_s=3600, source, model,
  confidence, max_iterations)` async (`:397`): opt-in continuous loop.
- `start_loop_if_enabled() -> Task|None` (`:437`): starts the loop iff
  `FORWARD_TEST_ENABLE`; reads `FORWARD_TEST_ASSETS/HORIZON_STEPS/INTERVAL_S/
  SOURCE/MODEL` env.
- `simulate_forward_test(assets, ...) -> dict` (`:476`): deterministic replay of
  the full closed loop against known history (used by `--simulate` CLI + tests).
  `_replay_resolver` (`:571`).
- Loaders: `_load_live_series` (`:67`), `_make_forecaster` (`:105`),
  `_step_hours` (`:93`).
- **DORMANT relative to HTTP** — driven by `main.py` lifespan (opt-in),
  `scripts/forward_test.py` CLI, and the predict-route logging hook.

### `server/services/backtest.py` (315 lines) — walk-forward tester
- `backtest(series, *, horizon_steps=1, train_window=200, step=1, confidence=0.9,
  forecaster_kwargs, max_origins) -> dict` (`:34`): rolling-origin walk-forward
  over `ShortHorizonForecaster` with explicit leakage asserts; returns MAE/RMSE/
  directional acc/coverage/skill-vs-persistence + per-origin records +
  `leakage_audit`.
- `five_minute_test(asset="xrp", ...) -> dict` (`:235`): loads a real ~5-min
  CoinGecko series (days=1), backtests 1-step (=5 min), also emits a live "next 5
  min" prediction. Honest synthetic fallback `_synthetic_ar1_trend` (`:208`) when
  offline. `_pack` (`:202`).
- **DORMANT relative to HTTP** — used by `scripts/predict_5min.py`.

### `server/services/train_sp500.py` (425 lines) — pooled S&P 500 training/backtest
- `build_dataset(tickers, *, horizon_steps, years, max_names, throttle,
  test_fraction, series_map, fetcher, sector_map, progress) -> dict` (`:69`):
  pools causal feature rows across many names (reusing `forecaster_ml._supervised`),
  strict global TIME split.
- `train_global(dataset, *, seed=42, fast=False) -> dict` (`:260`): one global
  HistGBR point model + quantile members on pooled train rows.
- `evaluate_global(dataset, model) -> dict` (`:330`): pooled OOS scorecard
  (level-acc, directional, coverage, skill-vs-persist) + per-sector breakdown.
- `_min_points` (`:64`). Requires sklearn (`_SKLEARN_OK` `:55`).
- **DORMANT relative to HTTP** — driven by `scripts/train_sp500.py`.

---

## 3. PREDICTION / ML STACK MAP

Two parallel stacks share the **same causal feature engineering** in
`forecaster_ml._feature_matrix`/`_supervised` and the GBM primitive in
`prediction.gbm_montecarlo_forecast`:

```
prediction.gbm_montecarlo_forecast   (A1 GBM/Holt — pure numpy)
        │
        ├── forecaster.ShortHorizonForecaster   (ridge + GBM ensemble, EnbPI CI)
        │        └── used by: backtest.py, forward_test fallback, predict_5min/
        │                     live_5min/accuracy_scorecard CLIs
        │
        └── forecaster_ml.MLForecaster          (HistGBR median + quantile + conformal)
                 │   (graceful fallback → ShortHorizonForecaster when no sklearn)
                 ├── forward_test.issue_forecast default model
                 ├── horizon_sweep.py CLI
                 └── oracle_model.OracleModel.ret_forecaster (LEVEL head)

oracle_model.OracleModel  (3 heads: direction/volatility/return)
        ├── OracleDataset.from_series_map  (pooled, leakage-safe)
        ├── purged_time_folds + hyperparam search + isotonic calibration
        ├── evaluate(...)  (conviction scorecard)
        └── save/load → data/oracle_model.joblib   ← trained but NOT served

train_sp500.{build_dataset,train_global,evaluate_global}
        └── one global pooled HistGBR over the whole S&P 500

history_lake (SQLite)  ←──  forward_test (issue→resolve→score)  ←── score_due_forecasts
                       └──  ingestion (crypto/seismic/fx adapters)
                       └──  predict route opt-in logging (FORWARD_TEST_LOG)
backtest.backtest / five_minute_test  (walk-forward, leakage-audited)
```

**Training & evaluation CLIs (`server/scripts/`):**
| Script | Purpose | Engine |
|---|---|---|
| `train_oracle.py` (163) | heavy-train `OracleModel` on pooled crypto+S&P, save joblib, print honest scorecard | `oracle_model` + `scrapers` |
| `train_sp500.py` (160) | pooled cross-sectional train/backtest over whole S&P 500 | `services.train_sp500` + `scrapers` |
| `train_backtest.py` (81) | multi-asset daily walk-forward backtest | `backtest` + crypto loaders |
| `horizon_sweep.py` (233) | multi-horizon (1..365d) walk-forward decay curve | `MLForecaster` + `deep_history` |
| `accuracy_scorecard.py` (87) | multi-metric accuracy (level/within%/dir/coverage) | `ShortHorizonForecaster` + `deep_history` |
| `predict_5min.py` (124) | 5-min forecast + backtest scorecard | `backtest.five_minute_test` |
| `live_5min.py` (107) | live recurring 5-min forward test w/ JSON state file | `ShortHorizonForecaster` + crypto |
| `forward_test.py` (179) | live or `--simulate` issue→resolve→score loop | `services.forward_test` + `history_lake` |

All CLIs are operator-run (`python -m server.scripts.*`); **none is invoked by the
app or the frontend.**

---

## 4. DATA

**Live feeds:**
- USGS earthquakes — summary geojson (`config.USGS_FEED`, live_intel) and
  fdsnws/event query (`prediction.load_seismic_catalog`, ingestion).
- CoinGecko — `simple/price` (live_intel) + `coins/{id}/market_chart`
  (prediction loaders, ingestion). Optional `CG_API_KEY` demo header.
- FX — open.er-api.com base AUD (`config.FX_FEED`, live_intel + ingestion).
- CryptoCompare histoday — deep crypto/gold history (scrapers).
- Yahoo Finance chart API — deep stock/index history (scrapers).
- Wikipedia — S&P 500 constituents scrape (scrapers).

**History Lake SQLite** (`server/data/history_lake.db`, 76 KB): 6 tables — `series`,
`observation`, `feed_run`, `forecast`, `realized_outcome`, `skill_score` (full
schema above, `history_lake.py:55-120`). Currently `forecast`=4 rows, rest empty.

**Static datasets / ontology / corpus:**
- `server/data/ontology.py` (84 lines): `OBJECTS` (13 entities), `LINKS` (21
  relations), `RISK_SIGNALS` (8) + `ontology_summary()` (`:73`). Mirrors
  `src/domain/ontology.js`.
- `server/data/corpus.py` (120 lines): 6 email tables (`EMAIL_TABLES`
  investment/crypto/psg/travel/wedding/music — 57 emails total) + `TIMELINE`
  (19 events). Internally consistent with the ontology.
- `server/data/oracle_model.joblib` (~1.36 MB): persisted trained `OracleModel`
  (regenerated 2026-06-04).

---

## 5. LLM WIRING

- `server/llm/kimi.py` (77 lines): async wrapper around Moonshot Kimi K2
  (OpenAI-compatible `/chat/completions`, streaming).
  - `system_prompt() -> str` (`kimi.py:21`): loads `prompts/analyst.md`, injects
    `ontology_summary()` into `{ontology}`.
  - `stream_chat(message) -> AsyncIterator[str]` (`kimi.py:26`): yields token
    deltas; if no `KIMI_API_KEY` yields a diagnostic + ontology summary; on
    HTTP/timeout yields a `// Kimi ...` error string (UI never hangs).
- `server/prompts/analyst.md` (20 lines): JARVIS persona system prompt (British,
  "sir", terse/factual) with `{ontology}` placeholder.
- **Fallback chain (`routes/functions.py:39`):** `KIMI_API_KEY` present →
  `kimi.stream_chat`; absent → local `analyst.answer` streamed word-by-word.
- `prediction._kimi_extract` (`prediction.py:65`): a second, independent Kimi
  call for NL intent extraction in the predict engine (key-optional, soft-fails
  to regex).

---

## 6. WIRED vs DORMANT MAP

**Reachable AND called by the frontend (WIRED):**
| Endpoint / service | Frontend caller |
|---|---|
| `GET /` | health check |
| `GET /auth/me` | `kimiClient.auth.me`, AuthGate |
| `POST /functions/getLiveIntel` → live_intel + corpus + simulation snapshots | JarvisTerminal, JarvisAssistant, SystemHealth |
| `POST /functions/analystChat` → kimi or analyst fallback | CommandCenter, JarvisTerminal, JarvisAssistant |
| `POST /functions/predict` → prediction engine | PredictionOracle |
| `GET /streams/{key}` → simulation (panopticon, counterstrike) | War, Underworld, JarvisTerminal |
| `*/entities/{name}` → in-memory CRUD | `kimiClient.entities.*` (IntelProfile/RiskSignal seeded; others empty) |

**Reachable (routed) but NOT called by the frontend (DORMANT endpoints):**
- `GET /v1/history/series`, `GET /v1/history/series/{id}`, `GET /v1/predict/skill`,
  `POST /v1/history/ingest` — no `/v1/` reference anywhere in `src/`.
- The 11 `/functions/*` **stubs** are callable but return `not_implemented`.

**Services with NO HTTP route at all (DORMANT engines, CLI/loop-only):**
`forecaster.py`, `forecaster_ml.py`, `oracle_model.py`, `train_sp500.py`,
`backtest.py`, `scrapers.py`, `forward_test.py` (loop is opt-in / CLI),
`ingestion.py` (only via the dormant `/v1/history/ingest` + opt-in loop).

**Opt-in background loops (off by default):** ingestion loop
(`HISTORY_INGEST_ENABLED`), forward-test loop (`FORWARD_TEST_ENABLE`), predict
logging (`FORWARD_TEST_LOG`).

---

## 7. GAPS — backend capability with NO frontend surface

1. **The entire trained ML/Oracle stack is unserved.** `OracleModel`
   (direction/volatility/return + conviction), `MLForecaster`,
   `ShortHorizonForecaster`, and the pooled S&P 500 model are real, tested, and
   `oracle_model.joblib` is persisted — but **no route loads or serves them**. The
   only model the UI reaches is the lighter `prediction.predict` engine via
   `/functions/predict`. There is no endpoint to query the Oracle's conviction /
   prob_up / volatility forecasts.
2. **History Lake + skill scorecard have no UI.** `/v1/history/series`,
   `/v1/history/series/{id}`, `/v1/predict/skill` are fully implemented and public
   but never called by the frontend — series catalog, observations, and the
   self-improvement skill metrics (MAE/RMSE/coverage/skill) are invisible to users.
4. **Forward-test scorecard is CLI-only.** The closed issue→resolve→score loop and
   its directional/coverage scorecard (`forward_test.scorecard`) have no endpoint;
   only `scripts/forward_test.py` surfaces them.
5. **Ingestion is admin/loop-only.** Feeds populate the lake only via the opt-in
   loop or the dormant `POST /v1/history/ingest`; no UI triggers or visualizes
   ingestion (`feed_run` audit, `list_feed_runs`).
6. **11 PSG/Gmail/Omega `/functions/*` are stubs.** Real implementations are
   deferred ("Phase C") — the frontend can call them but gets `not_implemented`.
7. **Entities have no persistence.** `routes/entities.py` storage is a per-process
   dict; only `IntelProfile`/`RiskSignal` are seeded, the other 11 declared entity
   types are empty, and all data is lost on restart.
8. **Backtest / accuracy / horizon-sweep / train CLIs** (`scripts/*`) expose rich
   honest evaluation (level-acc, directional, coverage, skill-vs-persistence,
   decay curves, per-sector tables) entirely outside the web app.

---

## APPENDIX — TESTS (`server/tests/`, for completeness)

Pytest suites mirror the services (no production wiring):
- `test_prediction.py` (157) — crypto/seismic/omori/trajectory/orbital/growth
  offline + classify regex fallback + structured insufficient-data.
- `test_forecaster.py` (137) — train/predict contract, beats-persistence +
  calibration, backtest no-leakage, determinism.
- `test_forecaster_ml.py` (149) — MLForecaster contract, directional, coverage,
  graceful fallbacks.
- `test_oracle_model.py` (146) — purged folds, conviction-subset > all-bars, vol
  R²>0, save/load, online update.
- `test_history_lake.py` (223) — DDL idempotency, observation roundtrip/upsert,
  score_due abs_err/in_interval, idempotent scoring, skill_summary.
- `test_forward_test.py` (173) — issue persists, score writes outcome+skill,
  interval flags, offline resolve, simulate scorecard.
- `test_train_sp500.py` (148) — pooled time-split no-leakage, finite bounded
  metrics, per-sector, empty graceful.
- `test_simulation.py` (186) — schema keys, progression, events cap=12, set_map
  respawn, catch-up cap.
- `test_routes.py` (164) — root open, auth required/`/auth/me`, live-intel shape +
  open-without-auth, entity CRUD, stub `not_implemented`, corpus honest counts,
  simulation streams, analyst local answer/stream without Kimi key.
