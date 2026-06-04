# 05 — DATA MODEL & SCHEMAS

**Parent spec:** `00_MASTER_INDEX.md` · **Section owner:** PATTERN ORACLE data layer
**Document class:** Master Engineering Spec · execution-grade · ISO depth
**Status:** living document (expanded per the v1→v150 ladder). This file is the single source of truth for every persisted and on-the-wire data structure in the engine.

---

## 0. SCOPE & GROUNDING

This section defines **every data structure** the PATTERN ORACLE engine reads or writes, execution-ready: exact DDL, JSON Schema (Draft 2020-12) blocks, type tables, indexes, retention policy, and the migration approach. It closes audit gaps §1.2.3 (no self-improvement loop / DB), §1.2.6 (no persistent History Lake), and §1.2.5 (causality asserted, not discovered — the PATTERN store + KGIK learned edges give discovered patterns a home).

**Consistency anchors (read before editing):**
- **SQLAlchemy patterns** — mirror `underworld/server/db/models.py`: `DeclarativeBase`, `Mapped[...]` + `mapped_column`, `_uuid()` string PKs (`String(36)`), `_now()` defaults, `JSON` columns for free-form maps, `Enum(...)` for closed sets, `__table_args__` tuples of `Index(...)` / `UniqueConstraint(...)`. We reuse those conventions verbatim so the two backends feel like one codebase.
- **Response shape** — the `/functions/predict` schema (§5) is a **superset** of the dict that `server/services/prediction.py::predict()` already returns (`question, domain, target, horizon, prediction{value,unit,point_estimate,interval{low,high,confidence},probability}, method{name,family,models_used,math}, drivers, data{source,as_of,lookback,history,forecast}, assumptions, caveats, used_llm`). Every existing key is preserved; new keys are **additive and optional** so the live UI (`src/pages/PredictionOracle.jsx`) keeps working unchanged.
- **KGIK shape** — extend `src/domain/ontology.js`: nodes carry `{id, label, type, props, conf, …}`; edges (`LINKS`) carry `{a, b, label, strength}`. The graph schema (§3) generalises these to a temporal, versioned, learnable form **without breaking** the existing literal arrays — the JS literals become the bootstrap seed of the persisted graph.

**Storage engines.**
- **SQLite** is the system of record for *control-plane* tables: series catalog, forecasts, outcomes, skill scores, KGIK graph, pattern store, model registry, feed-run audit. Single-writer, WAL mode, embedded — same operational footprint the repo already uses.
- **Parquet** is the *bulk-data plane* for the `observation` fact table (the History Lake's heavy time-series). SQLite holds a thin pointer + recent hot rows; cold rows roll into partitioned Parquet. A `observation` SQLite table is also defined for small/dev deployments so the engine runs with zero extra infra.

---

## 1. HISTORY LAKE — persistent world-data time-series

The History Lake is the engine's memory of the world: every series we ingest (USGS quakes, CoinGecko prices, FX, KGIK snapshots, sim outputs) is normalised into a **3-table star**: `series` (dimension) → `observation` (fact) ← `feed_run` (ingestion audit).

### 1.1 Logical model

```
feed_run (1) ──ingests──▶ (N) observation (N) ──belongs to──▶ (1) series
   audit of one fetch          one (series, ts) datapoint        a metric stream
```

- A **series** is a uniquely identified, regularly-or-irregularly sampled stream: `(source, entity, metric, unit, freq)`. Example: `(coingecko, ripple, close_price, USD, 1d)`.
- An **observation** is one `(series_id, ts, value)` with a `quality` flag and a `feed_run_id` provenance pointer.
- A **feed_run** is one execution of one adapter over one fetch window: counts, status, latency, error — the ingestion audit trail (§6).

### 1.2 Column type tables

**`series`** — series catalog / dimension table.

| Column        | Type            | Null | Default        | Notes |
|---------------|-----------------|------|----------------|-------|
| `series_id`   | TEXT (UUID)     | no   | uuid4          | PK |
| `source`      | TEXT            | no   | —              | adapter name, FK-ish to feed adapter `name` (§6), e.g. `coingecko`, `usgs`, `kgik`, `sim` |
| `entity`      | TEXT            | no   | —              | the subject, e.g. `ripple`, `region:tokyo`, `psg` |
| `metric`      | TEXT            | no   | —              | what is measured, e.g. `close_price`, `event_count`, `revenue` |
| `unit`        | TEXT            | yes  | NULL           | UCUM-ish unit string, e.g. `USD`, `count`, `m/s`, `probability` |
| `freq`        | TEXT (enum)     | no   | `irregular`    | one of `1m,5m,15m,1h,1d,1w,1mo,irregular` (ISO-8601-ish cadence) |
| `entity_type` | TEXT            | yes  | NULL           | optional KGIK node `type` (links History Lake → graph) |
| `kgik_node_id`| TEXT            | yes  | NULL           | optional FK → `kg_node.id`; ties a series to a graph node |
| `point_kind`  | TEXT (enum)     | no   | `level`        | `level` \| `flow` \| `rate` \| `ratio` \| `event` (controls rollup math, §1.5) |
| `tz`          | TEXT            | no   | `UTC`          | IANA tz of the source clock; all `ts` stored as UTC epoch ms |
| `meta`        | JSON            | no   | `{}`           | free-form (coin id, USGS query box, etc.) |
| `active`      | BOOLEAN         | no   | `1`            | false = no longer ingested, kept for history |
| `created_at`  | DATETIME        | no   | now()          | |
| `updated_at`  | DATETIME        | no   | now()/onupdate | |

Uniqueness: a series is identified by its natural key `(source, entity, metric, unit, freq)`.

**`observation`** — observation fact table (hot rows in SQLite; bulk in Parquet, §1.4).

| Column         | Type        | Null | Default | Notes |
|----------------|-------------|------|---------|-------|
| `series_id`    | TEXT (UUID) | no   | —       | FK → `series.series_id` |
| `ts`           | INTEGER     | no   | —       | observation time, **UTC epoch milliseconds** (matches prediction.py `{t: ms}`) |
| `value`        | REAL        | no   | —       | the measurement |
| `quality`      | TEXT (enum) | no   | `ok`    | `ok` \| `interpolated` \| `suspect` \| `imputed` \| `revised` |
| `feed_run_id`  | TEXT (UUID) | yes  | NULL    | FK → `feed_run.feed_run_id` (provenance) |
| `ingested_at`  | INTEGER     | no   | now-ms  | epoch ms the row landed (for revision tracking) |

Primary key is the composite `(series_id, ts)` — naturally dedups re-fetches; a later fetch of the same `(series_id, ts)` **upserts** (`ON CONFLICT … DO UPDATE`) and is marked `revised`.

**`feed_run`** — ingestion audit.

| Column          | Type        | Null | Default   | Notes |
|-----------------|-------------|------|-----------|-------|
| `feed_run_id`   | TEXT (UUID) | no   | uuid4     | PK |
| `source`        | TEXT        | no   | —         | adapter `name` |
| `window_start`  | INTEGER     | yes  | NULL      | requested fetch window start, epoch ms |
| `window_end`    | INTEGER     | yes  | NULL      | requested fetch window end, epoch ms |
| `started_at`    | INTEGER     | no   | now-ms    | run start, epoch ms |
| `finished_at`   | INTEGER     | yes  | NULL      | run end, epoch ms |
| `status`        | TEXT (enum) | no   | `running` | `running` \| `ok` \| `partial` \| `error` \| `rate_limited` \| `cache_hit` |
| `series_touched`| INTEGER     | no   | 0         | # series written |
| `rows_written`  | INTEGER     | no   | 0         | # observations upserted |
| `rows_revised`  | INTEGER     | no   | 0         | # observations that changed an existing value |
| `http_status`   | INTEGER     | yes  | NULL      | last upstream HTTP status |
| `latency_ms`    | INTEGER     | yes  | NULL      | wall time of the fetch |
| `error`         | TEXT        | yes  | NULL      | truncated error string on failure |
| `meta`          | JSON        | no   | `{}`      | request params echo, cache key, etc. |

### 1.3 SQL DDL (SQLite, system of record)

```sql
-- HISTORY LAKE -----------------------------------------------------------------
PRAGMA journal_mode = WAL;          -- single-writer, many-reader
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS series (
    series_id    TEXT    PRIMARY KEY,                       -- uuid4
    source       TEXT    NOT NULL,
    entity       TEXT    NOT NULL,
    metric       TEXT    NOT NULL,
    unit         TEXT,
    freq         TEXT    NOT NULL DEFAULT 'irregular'
                 CHECK (freq IN ('1m','5m','15m','1h','1d','1w','1mo','irregular')),
    entity_type  TEXT,
    kgik_node_id TEXT    REFERENCES kg_node(id) ON DELETE SET NULL,
    point_kind   TEXT    NOT NULL DEFAULT 'level'
                 CHECK (point_kind IN ('level','flow','rate','ratio','event')),
    tz           TEXT    NOT NULL DEFAULT 'UTC',
    meta         TEXT    NOT NULL DEFAULT '{}',             -- JSON
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (source, entity, metric, unit, freq)
);
CREATE INDEX IF NOT EXISTS ix_series_source_entity ON series (source, entity);
CREATE INDEX IF NOT EXISTS ix_series_metric        ON series (metric);
CREATE INDEX IF NOT EXISTS ix_series_kgik          ON series (kgik_node_id);

CREATE TABLE IF NOT EXISTS observation (
    series_id   TEXT    NOT NULL REFERENCES series(series_id) ON DELETE CASCADE,
    ts          INTEGER NOT NULL,                           -- UTC epoch ms
    value       REAL    NOT NULL,
    quality     TEXT    NOT NULL DEFAULT 'ok'
                CHECK (quality IN ('ok','interpolated','suspect','imputed','revised')),
    feed_run_id TEXT    REFERENCES feed_run(feed_run_id) ON DELETE SET NULL,
    ingested_at INTEGER NOT NULL,
    PRIMARY KEY (series_id, ts)                             -- dedups re-fetch
) WITHOUT ROWID;                                            -- clustered on (series_id, ts)
-- the PK already covers (series_id, ts); add ts-leading index for cross-series scans
CREATE INDEX IF NOT EXISTS ix_obs_ts         ON observation (ts);
CREATE INDEX IF NOT EXISTS ix_obs_series_ts  ON observation (series_id, ts);

CREATE TABLE IF NOT EXISTS feed_run (
    feed_run_id   TEXT    PRIMARY KEY,
    source        TEXT    NOT NULL,
    window_start  INTEGER,
    window_end    INTEGER,
    started_at    INTEGER NOT NULL,
    finished_at   INTEGER,
    status        TEXT    NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','ok','partial','error','rate_limited','cache_hit')),
    series_touched INTEGER NOT NULL DEFAULT 0,
    rows_written   INTEGER NOT NULL DEFAULT 0,
    rows_revised   INTEGER NOT NULL DEFAULT 0,
    http_status    INTEGER,
    latency_ms     INTEGER,
    error          TEXT,
    meta           TEXT   NOT NULL DEFAULT '{}'             -- JSON
);
CREATE INDEX IF NOT EXISTS ix_feedrun_source_started ON feed_run (source, started_at);
CREATE INDEX IF NOT EXISTS ix_feedrun_status         ON feed_run (status);

-- Upsert pattern the ingestion loop uses for every datapoint:
-- INSERT INTO observation (series_id, ts, value, quality, feed_run_id, ingested_at)
-- VALUES (?,?,?,?,?,?)
-- ON CONFLICT(series_id, ts) DO UPDATE SET
--     value       = excluded.value,
--     quality     = CASE WHEN observation.value <> excluded.value THEN 'revised'
--                        ELSE observation.quality END,
--     feed_run_id = excluded.feed_run_id,
--     ingested_at = excluded.ingested_at
-- WHERE observation.value <> excluded.value;
```

### 1.4 Parquet layout (bulk-data plane)

Cold `observation` rows live as Hive-partitioned Parquet so a year of minute data per series stays query-fast and cheap:

```
history_lake/
  observation/
    source=coingecko/
      series_id=<uuid>/
        year=2026/month=06/part-000.parquet
    source=usgs/
      series_id=<uuid>/
        year=2026/month=06/part-000.parquet
```

Parquet file schema (one row per observation, Arrow types):

| Field         | Arrow type      | Notes |
|---------------|-----------------|-------|
| `ts`          | `int64`         | UTC epoch ms; file sorted ascending by `ts` for predicate pushdown |
| `value`       | `double`        | |
| `quality`     | `dictionary<string>` | low-cardinality |
| `feed_run_id` | `string`        | provenance |
| `ingested_at` | `int64`         | |

`series_id`, `source`, `year`, `month` are encoded in the **partition path**, not the file (standard Hive partitioning), so partition pruning is free. Compression: ZSTD level 3. Row-group size: 128 MB target. The reader (DuckDB or `pyarrow.dataset`) treats SQLite-hot + Parquet-cold as one logical table via a `UNION ALL` view.

### 1.5 Retention & rollup policy

Driven by `series.freq` and `series.point_kind`. A nightly maintenance job (§8 MLOps loop) enforces:

| Tier      | Age           | Resolution kept | Storage |
|-----------|---------------|-----------------|---------|
| **Hot**   | 0–7 days      | native (raw)    | SQLite `observation` |
| **Warm**  | 7–90 days     | native (raw)    | Parquet (current month + last) |
| **Cold**  | 90 days–2 yr  | rolled-up       | Parquet, downsampled |
| **Frozen**| > 2 yr        | rolled-up + compacted | Parquet, ZSTD-19 |

**Rollup math by `point_kind`** (downsampling a fine bucket → coarse bucket):
- `level` (price, temperature) → keep **OHLC**: open=first, high=max, low=min, close=last (stored as 4 derived series with metric suffixes `_open/_high/_low/_close`, the base series keeps `close`).
- `flow` (rainfall, revenue) → **sum**.
- `rate` (events/day) → **time-weighted mean**.
- `ratio`/`probability` → **mean** (and `count` of contributing points kept in `meta`).
- `event` (discrete occurrences, e.g. each quake) → **never rolled up**; events are kept raw forever (they are the realized outcomes the skill loop scores against).

**Downsample cadence:** Cold tier 1d→1d (kept), intraday `1m/5m/15m/1h` → `1d` OHLC after 90 days. Frozen tier `1d` → `1w` after 2 years for non-`event` series.

**Deletion:** nothing is hard-deleted by default; rollup *replaces* fine rows with coarse rows in a new partition and the fine partition is dropped atomically. `feed_run` rows older than 1 year are pruned to a daily summary row (`status='ok'` aggregates) to bound audit growth.

---

## 2. OUTCOME / FORECAST STORE — the self-improvement substrate

This is the closure of audit gap §1.2.3. Every forecast the engine issues is **persisted** the moment it is returned; when reality arrives it is recorded in `realized_outcome`; a backtester then writes `skill_score`. This is the loop that lets the engine measure and improve its own skill (CRPS/RMSE vs climatology).

### 2.1 Column type tables

**`forecast`** — one row per issued prediction (written on every non-trivial `/functions/predict` call).

| Column          | Type        | Null | Default | Notes |
|-----------------|-------------|------|---------|-------|
| `id`            | TEXT (UUID) | no   | uuid4   | PK; echoed to caller as `forecast_id` (§5) |
| `question`      | TEXT        | no   | —       | raw NL question |
| `domain`        | TEXT (enum) | no   | —       | §5 domain enum |
| `target`        | TEXT        | yes  | NULL    | e.g. `ripple`, `M>=5.0`, `psg.revenue` |
| `series_id`     | TEXT        | yes  | NULL    | FK → `series.series_id` when the target maps to a History Lake series (enables auto-scoring) |
| `horizon`       | TEXT        | no   | —       | human label, e.g. `48h`, `30d` (matches prediction.py) |
| `horizon_s`     | INTEGER     | no   | —       | horizon in seconds (machine-usable) |
| `issued_ts`     | INTEGER     | no   | now-ms  | when the forecast was made, epoch ms |
| `due_ts`        | INTEGER     | yes  | NULL    | `issued_ts + horizon_s*1000`; when reality should be checked |
| `point`         | REAL        | yes  | NULL    | point estimate (NULL for vector/probability-only) |
| `low`           | REAL        | yes  | NULL    | interval low |
| `high`          | REAL        | yes  | NULL    | interval high |
| `confidence`    | REAL        | yes  | NULL    | interval nominal coverage (0..1), e.g. 0.90 |
| `probability`   | REAL        | yes  | NULL    | event/up probability (0..1) when applicable |
| `unit`          | TEXT        | yes  | NULL    | unit of `point` (`USD`, `probability`, …) |
| `method`        | TEXT        | no   | —       | `method.name` from the response |
| `family`        | TEXT (enum) | no   | —       | §5 family enum |
| `model_versions`| JSON        | no   | `[]`    | array of `model_id` (FK → `model_registry`) that produced this; e.g. `["chronos-bolt@2.1","gbm-mc@1.0"]` |
| `drivers`       | JSON        | no   | `{}`    | the full `drivers` map from the response (snapshot for audit) |
| `point_vec`     | JSON        | yes  | NULL    | for vector targets (e.g. trajectory `{lat,lng,alt_m}`) |
| `climatology`   | JSON        | yes  | NULL    | baseline used for skill-vs-climatology (mean/std or persistence value) |
| `used_llm`      | BOOLEAN     | no   | 0       | mirrors response `used_llm` |
| `scored`        | BOOLEAN     | no   | 0       | true once a `skill_score` row exists |
| `created_at`    | DATETIME    | no   | now()   | |

**`realized_outcome`** — the actual value once the horizon elapses.

| Column         | Type        | Null | Default | Notes |
|----------------|-------------|------|---------|-------|
| `forecast_id`  | TEXT (UUID) | no   | —       | PK, FK → `forecast.id` (1:1) |
| `realized_ts`  | INTEGER     | no   | —       | when reality was observed, epoch ms |
| `actual_value` | REAL        | yes  | NULL    | the realized scalar (NULL if event-probability outcome → use `actual_bool`) |
| `actual_bool`  | BOOLEAN     | yes  | NULL    | for event forecasts: did the event happen? |
| `actual_vec`   | JSON        | yes  | NULL    | realized vector (trajectory) |
| `source`       | TEXT        | no   | `auto`  | `auto` (matched from History Lake) \| `manual` \| `adapter` |
| `lag_s`        | INTEGER     | yes  | NULL    | `realized_ts - due_ts` in seconds (lateness of resolution) |
| `created_at`   | DATETIME    | no   | now()   | |

**`skill_score`** — per-forecast scorecard (the metric that drives re-weighting/retraining, §8).

| Column                | Type        | Null | Default | Notes |
|-----------------------|-------------|------|---------|-------|
| `id`                  | TEXT (UUID) | no   | uuid4   | PK |
| `forecast_id`         | TEXT (UUID) | no   | —       | FK → `forecast.id` (UNIQUE; 1:1) |
| `crps`                | REAL        | yes  | NULL    | Continuous Ranked Probability Score (lower better); from interval/percentiles |
| `rmse`                | REAL        | yes  | NULL    | per-forecast = abs error; aggregated upstream as RMSE |
| `abs_err`            | REAL        | yes  | NULL    | `|point - actual|` |
| `pct_err`            | REAL        | yes  | NULL    | `abs_err / |actual|` when actual≠0 |
| `in_interval`        | BOOLEAN     | yes  | NULL    | was `actual` within `[low, high]`? (coverage) |
| `pinball_low`        | REAL        | yes  | NULL    | pinball loss at the low quantile |
| `pinball_high`       | REAL        | yes  | NULL    | pinball loss at the high quantile |
| `brier`              | REAL        | yes  | NULL    | for probability/event forecasts: `(probability - actual_bool)^2` |
| `log_loss`           | REAL        | yes  | NULL    | event forecast log loss |
| `skill_vs_climatology`| REAL       | yes  | NULL    | `1 - score_model / score_climatology` (>0 = beats baseline) |
| `baseline_score`     | REAL        | yes  | NULL    | the climatology/persistence reference score |
| `scored_ts`          | INTEGER     | no   | now-ms  | when scored |
| `created_at`         | DATETIME    | no   | now()   | |

### 2.2 SQL DDL

```sql
-- OUTCOME / FORECAST STORE -----------------------------------------------------
CREATE TABLE IF NOT EXISTS forecast (
    id             TEXT    PRIMARY KEY,
    question       TEXT    NOT NULL,
    domain         TEXT    NOT NULL
                   CHECK (domain IN ('crypto','seismic','trajectory','growth',
                                     'weather','epidemic','finance','generic')),
    target         TEXT,
    series_id      TEXT    REFERENCES series(series_id) ON DELETE SET NULL,
    horizon        TEXT    NOT NULL,
    horizon_s      INTEGER NOT NULL,
    issued_ts      INTEGER NOT NULL,
    due_ts         INTEGER,
    point          REAL,
    low            REAL,
    high           REAL,
    confidence     REAL,
    probability    REAL,
    unit           TEXT,
    method         TEXT    NOT NULL,
    family         TEXT    NOT NULL
                   CHECK (family IN ('time_series','event_probability','trajectory',
                                     'growth','ensemble','graph','foundation_ts',
                                     'data_assimilation')),
    model_versions TEXT    NOT NULL DEFAULT '[]',   -- JSON array of model_id
    drivers        TEXT    NOT NULL DEFAULT '{}',   -- JSON
    point_vec      TEXT,                            -- JSON
    climatology    TEXT,                            -- JSON
    used_llm       INTEGER NOT NULL DEFAULT 0,
    scored         INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_forecast_due_unscored ON forecast (due_ts) WHERE scored = 0;
CREATE INDEX IF NOT EXISTS ix_forecast_domain       ON forecast (domain);
CREATE INDEX IF NOT EXISTS ix_forecast_series       ON forecast (series_id);
CREATE INDEX IF NOT EXISTS ix_forecast_issued       ON forecast (issued_ts);

CREATE TABLE IF NOT EXISTS realized_outcome (
    forecast_id  TEXT    PRIMARY KEY REFERENCES forecast(id) ON DELETE CASCADE,
    realized_ts  INTEGER NOT NULL,
    actual_value REAL,
    actual_bool  INTEGER,
    actual_vec   TEXT,                              -- JSON
    source       TEXT    NOT NULL DEFAULT 'auto'
                 CHECK (source IN ('auto','manual','adapter')),
    lag_s        INTEGER,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_score (
    id                   TEXT    PRIMARY KEY,
    forecast_id          TEXT    NOT NULL UNIQUE REFERENCES forecast(id) ON DELETE CASCADE,
    crps                 REAL,
    rmse                 REAL,
    abs_err              REAL,
    pct_err              REAL,
    in_interval          INTEGER,                   -- boolean
    pinball_low          REAL,
    pinball_high         REAL,
    brier                REAL,
    log_loss             REAL,
    skill_vs_climatology REAL,
    baseline_score       REAL,
    scored_ts            INTEGER NOT NULL,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_skill_forecast ON skill_score (forecast_id);
```

**Scoring loop (how the three tables interlock).** A scheduled job (§8) selects `forecast WHERE scored=0 AND due_ts <= now`; for each it resolves `actual_value` — preferentially **auto** by reading the History Lake at/near `due_ts` for the linked `series_id` (event forecasts check whether a matching `event`-kind observation occurred in the window) — writes `realized_outcome`, computes the metrics into `skill_score`, and sets `forecast.scored=1`. Aggregations (RMSE, mean CRPS, coverage rate, mean skill-vs-climatology) are computed on read by `domain`/`family`/`model_id`; they are not stored, so they never go stale.

---

## 3. KGIK GRAPH SCHEMA (extends `src/domain/ontology.js`)

The existing `OBJECTS`/`LINKS` literals become the **seed** of a persisted, **temporal, versioned, learnable** graph. The shapes are backward-compatible: a JS node `{id,label,type,props,conf}` maps directly onto `kg_node`; a JS link `{a,b,label,strength}` maps onto `kg_edge` (`label`→`relation`). New columns (`valid_from/valid_to/version`, `learned/evidence_count/last_confirmed_ts/confidence`) default such that hand-authored rows behave exactly as before.

### 3.1 Node & edge type tables

**`kg_node`**

| Column       | Type        | Null | Default | Notes |
|--------------|-------------|------|---------|-------|
| `id`         | TEXT        | no   | —       | PK; stable id (e.g. `sam`, `psg`, or uuid for learned nodes) |
| `label`      | TEXT        | no   | —       | display name |
| `type`       | TEXT        | no   | —       | `person`\|`org`\|`client`\|`invest`\|`asset`\|`property`\|`creative`\|`target`\|`series`\|`pattern`\|`concept` (open set; extends the JS `type`s with engine types) |
| `props`      | JSON        | no   | `{}`    | the `props` object from ontology.js |
| `version`    | INTEGER     | no   | 1       | bumped on any mutating change (optimistic) |
| `valid_from` | INTEGER     | no   | now-ms  | bitemporal: when this version became true |
| `valid_to`   | INTEGER     | yes  | NULL    | NULL = currently valid; set when superseded |
| `confidence` | REAL        | no   | 1.0     | mirrors ontology `conf` |
| `learned`    | BOOLEAN     | no   | 0       | true if created by pattern discovery, not hand-authored |
| `created_at` | DATETIME    | no   | now()   | |
| `updated_at` | DATETIME    | no   | now()/onupdate | |

**`kg_edge`**

| Column            | Type        | Null | Default | Notes |
|-------------------|-------------|------|---------|-------|
| `id`              | TEXT (UUID) | no   | uuid4   | PK |
| `a`               | TEXT        | no   | —       | FK → `kg_node.id` (source) |
| `b`               | TEXT        | no   | —       | FK → `kg_node.id` (target) |
| `relation`        | TEXT        | no   | —       | the edge `label`, e.g. `CONTROLS 50%`, `LEADS`, `CAUSES`, `CORRELATES` |
| `strength`        | REAL        | no   | 1.0     | magnitude (generalises ontology `strength` 1–3; learned edges use 0..1) |
| `directed`        | BOOLEAN     | no   | 1       | hand-authored ontology links are directed a→b |
| `learned`         | BOOLEAN     | no   | 0       | true = discovered by the pattern engine (§4) |
| `evidence_count`  | INTEGER     | no   | 0       | # confirmations supporting this edge |
| `last_confirmed_ts`| INTEGER    | yes  | NULL    | epoch ms of most recent confirmation |
| `confidence`      | REAL        | no   | 1.0     | calibrated belief (0..1); hand-authored = 1.0 |
| `pattern_id`      | TEXT        | yes  | NULL    | FK → `pattern.id` that justifies a learned edge |
| `version`         | INTEGER     | no   | 1       | |
| `valid_from`      | INTEGER     | no   | now-ms  | temporal validity |
| `valid_to`        | INTEGER     | yes  | NULL    | NULL = current |
| `created_at`      | DATETIME    | no   | now()   | |
| `updated_at`      | DATETIME    | no   | now()/onupdate | |

### 3.2 SQL DDL

```sql
-- KGIK GRAPH -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kg_node (
    id         TEXT    PRIMARY KEY,
    label      TEXT    NOT NULL,
    type       TEXT    NOT NULL,
    props      TEXT    NOT NULL DEFAULT '{}',   -- JSON
    version    INTEGER NOT NULL DEFAULT 1,
    valid_from INTEGER NOT NULL,
    valid_to   INTEGER,
    confidence REAL    NOT NULL DEFAULT 1.0,
    learned    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_kgnode_type    ON kg_node (type);
CREATE INDEX IF NOT EXISTS ix_kgnode_current ON kg_node (id) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS kg_edge (
    id                TEXT    PRIMARY KEY,
    a                 TEXT    NOT NULL REFERENCES kg_node(id) ON DELETE CASCADE,
    b                 TEXT    NOT NULL REFERENCES kg_node(id) ON DELETE CASCADE,
    relation          TEXT    NOT NULL,
    strength          REAL    NOT NULL DEFAULT 1.0,
    directed          INTEGER NOT NULL DEFAULT 1,
    learned           INTEGER NOT NULL DEFAULT 0,
    evidence_count    INTEGER NOT NULL DEFAULT 0,
    last_confirmed_ts INTEGER,
    confidence        REAL    NOT NULL DEFAULT 1.0,
    pattern_id        TEXT    REFERENCES pattern(id) ON DELETE SET NULL,
    version           INTEGER NOT NULL DEFAULT 1,
    valid_from        INTEGER NOT NULL,
    valid_to          INTEGER,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    -- one current edge per (a,b,relation); supersede by closing valid_to first
    UNIQUE (a, b, relation, valid_from)
);
CREATE INDEX IF NOT EXISTS ix_kgedge_a        ON kg_edge (a);
CREATE INDEX IF NOT EXISTS ix_kgedge_b        ON kg_edge (b);
CREATE INDEX IF NOT EXISTS ix_kgedge_relation ON kg_edge (relation);
CREATE INDEX IF NOT EXISTS ix_kgedge_current  ON kg_edge (a, b, relation) WHERE valid_to IS NULL;
```

### 3.3 How learned edges are added & updated

This is the mechanism that turns discovered patterns (§4) into graph knowledge — closing audit gap §1.2.5 ("causal asserted, not discovered").

**Add (first observation of a pattern).** When the pattern engine emits a lead-lag or causal-link record (§4) above the promotion threshold, it:
1. Ensures both endpoint nodes exist (creating `learned=1` `series`/`pattern`/`concept` nodes if needed, e.g. a node per History Lake series).
2. Inserts a `kg_edge` with `learned=1`, `relation` ∈ {`LEADS`,`LAGS`,`CORRELATES`,`CAUSES`,`GRANGER_CAUSES`}, `strength` = effect size (e.g. |cross-correlation| or transfer-entropy), `evidence_count=1`, `last_confirmed_ts=now`, `confidence` = a calibrated initial belief, and `pattern_id` pointing at the justifying pattern row.

**Update (re-confirmation / decay).** On each subsequent backtest pass:
- **Confirmed** (pattern still significant): `evidence_count += 1`, `last_confirmed_ts = now`, and `confidence` is revised upward by a **Beta–Bernoulli / Laplace-smoothed** rule — exactly the pattern already used by `CausalBelief` in `underworld/server/db/models.py` (`confidence = (confirmations + 1) / (trials + 2)`). `strength` is updated by an EWMA of the latest effect size.
- **Not confirmed** (pattern fell below significance): `confidence` **decays** (multiplicative, e.g. ×0.9 per missed confirmation). When `confidence` drops below a retirement floor, the edge is *not deleted* but **temporally closed**: set `valid_to = now`, leaving a full audit trail. A later re-confirmation opens a fresh version (`version+1`, new `valid_from`).
- **Promotion to causal:** an edge that starts as `CORRELATES`/`LEADS` is upgraded to `GRANGER_CAUSES`/`CAUSES` only after passing the causal screen (Granger / CCM, §4) for N consecutive windows; the `relation` change is a new version (old version closed, new opened) so the upgrade is traceable.

Hand-authored edges (`learned=0`, `confidence=1.0`) are **never** auto-decayed or retired — discovery only ever *adds* learned edges alongside the curated KGIK.

---

## 4. PATTERN STORE — discovered structure with provenance

The home for everything the pattern-discovery layer (§06) finds: motifs, regimes, change-points, lead-lag relations, and causal links. One polymorphic table keyed by `kind`, plus typed payload, plus mandatory provenance so every pattern traces back to the data and method that produced it.

### 4.1 Pattern kinds & payloads

| `kind`        | Discovered by (per §1.3 evidence base) | Key payload fields (in `params` JSON) |
|---------------|----------------------------------------|----------------------------------------|
| `motif`       | Matrix Profile / STUMPY                 | `window_len`, `subseq_start_ts`, `neighbor_start_ts`, `distance` |
| `anomaly`     | Matrix Profile discord                  | `window_len`, `subseq_start_ts`, `discord_distance` |
| `regime`      | HDBSCAN over MP / features              | `regime_label`, `start_ts`, `end_ts`, `cluster_size`, `centroid` |
| `changepoint` | PELT / BOCPD                            | `change_ts`, `before_mean`, `after_mean`, `penalty`/`hazard` |
| `lead_lag`    | cross-correlation / windowed CCF        | `lag_s`, `corr`, `direction` (`a_leads_b`\|`b_leads_a`) |
| `causal_link` | Granger / CCM / transfer entropy        | `direction`, `test` (`granger`\|`ccm`\|`te`), `stat`, `lag_s` |

### 4.2 Column type table — `pattern`

| Column         | Type        | Null | Default | Notes |
|----------------|-------------|------|---------|-------|
| `id`           | TEXT (UUID) | no   | uuid4   | PK |
| `kind`         | TEXT (enum) | no   | —       | one of the kinds above |
| `series_id`    | TEXT        | yes  | NULL    | primary series (FK → `series`); for single-series patterns |
| `series_id_b`  | TEXT        | yes  | NULL    | second series (FK → `series`) for lead_lag / causal_link |
| `window_start` | INTEGER     | yes  | NULL    | analysis window start, epoch ms |
| `window_end`   | INTEGER     | yes  | NULL    | analysis window end, epoch ms |
| `strength`     | REAL        | yes  | NULL    | unified effect size (distance for motif, |corr| for lead_lag, stat for causal) |
| `p_value`      | REAL        | yes  | NULL    | significance where the method yields one (Granger/CCM) |
| `confidence`   | REAL        | no   | 0.5     | calibrated belief the pattern is real (drives KGIK promotion §3.3) |
| `params`       | JSON        | no   | `{}`    | kind-specific payload (table §4.1) |
| **provenance** | | | | |
| `method`       | TEXT        | no   | —       | algorithm name, e.g. `stumpy.matrix_profile`, `ruptures.pelt`, `granger` |
| `method_params`| JSON        | no   | `{}`    | hyperparameters used (window, penalty, max-lag) |
| `feed_run_id`  | TEXT        | yes  | NULL    | FK → `feed_run` snapshot the analysis ran on |
| `code_version` | TEXT        | yes  | NULL    | git sha / package version of the discovery code |
| `evidence_count`| INTEGER    | no   | 1       | # windows the pattern recurred in (re-confirmation) |
| `last_seen_ts` | INTEGER     | no   | now-ms  | last window it was significant |
| `promoted_edge_id`| TEXT     | yes  | NULL    | FK → `kg_edge.id` if promoted into the graph |
| `status`       | TEXT (enum) | no   | `active`| `active` \| `stale` \| `retired` \| `promoted` |
| `created_at`   | DATETIME    | no   | now()   | |
| `updated_at`   | DATETIME    | no   | now()/onupdate | |

### 4.3 SQL DDL

```sql
-- PATTERN STORE ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pattern (
    id            TEXT    PRIMARY KEY,
    kind          TEXT    NOT NULL
                  CHECK (kind IN ('motif','anomaly','regime','changepoint',
                                  'lead_lag','causal_link')),
    series_id     TEXT    REFERENCES series(series_id) ON DELETE CASCADE,
    series_id_b   TEXT    REFERENCES series(series_id) ON DELETE CASCADE,
    window_start  INTEGER,
    window_end    INTEGER,
    strength      REAL,
    p_value       REAL,
    confidence    REAL    NOT NULL DEFAULT 0.5,
    params        TEXT    NOT NULL DEFAULT '{}',   -- JSON, kind-specific payload
    method        TEXT    NOT NULL,
    method_params TEXT    NOT NULL DEFAULT '{}',   -- JSON
    feed_run_id   TEXT    REFERENCES feed_run(feed_run_id) ON DELETE SET NULL,
    code_version  TEXT,
    evidence_count INTEGER NOT NULL DEFAULT 1,
    last_seen_ts  INTEGER NOT NULL,
    promoted_edge_id TEXT REFERENCES kg_edge(id) ON DELETE SET NULL,
    status        TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','stale','retired','promoted')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_pattern_kind        ON pattern (kind);
CREATE INDEX IF NOT EXISTS ix_pattern_series      ON pattern (series_id);
CREATE INDEX IF NOT EXISTS ix_pattern_pair        ON pattern (series_id, series_id_b);
CREATE INDEX IF NOT EXISTS ix_pattern_status      ON pattern (status);
CREATE INDEX IF NOT EXISTS ix_pattern_promotable  ON pattern (kind, confidence) WHERE status = 'active';
```

A `causal_link`/`lead_lag` pattern with `confidence ≥ promotion_threshold` and `evidence_count ≥ min_evidence` is promoted into a `kg_edge` (§3.3); the resulting edge id is written back to `promoted_edge_id` and `status='promoted'`.

---

## 5. `/functions/predict` REQUEST & RESPONSE JSON SCHEMA

Formal JSON Schema (Draft 2020-12). The **response is a strict superset** of the dict returned today by `server/services/prediction.py::predict()` — every current key is required exactly as emitted; new keys (`forecast_id`, `ensemble`, `model_versions`, `provenance`, `as_of_iso`) are **optional/additive** so `PredictionOracle.jsx` and existing callers are unaffected.

### 5.1 Shared enums

```jsonc
// domain — extends prediction.py's classify() set (crypto|seismic|trajectory|growth|generic)
// with the engine's new domains (weather/epidemic/finance) per the architecture diagram.
"DomainEnum": ["crypto","seismic","trajectory","growth","weather","epidemic","finance","generic"]

// family — method family; superset of the families prediction.py emits in method.family
// ("time_series","event_probability","trajectory","growth").
"FamilyEnum": ["time_series","event_probability","trajectory","growth",
               "ensemble","graph","foundation_ts","data_assimilation"]
```

### 5.2 REQUEST schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/predict.request.json",
  "title": "PredictRequest",
  "type": "object",
  "required": ["question"],
  "additionalProperties": false,
  "properties": {
    "question": {
      "type": "string", "minLength": 1, "maxLength": 2000,
      "description": "Natural-language question. The only required field."
    },
    "params": {
      "type": "object",
      "description": "Optional overrides + inline data so the engine runs offline/deterministically (matches prediction.py params).",
      "additionalProperties": true,
      "properties": {
        "domain":        { "type": "string", "enum": ["crypto","seismic","trajectory","growth","weather","epidemic","finance","generic"] },
        "target":        { "type": ["string","null"] },
        "horizon_hours": { "type": ["number","null"], "minimum": 0 },
        "horizon_steps": { "type": ["integer","null"], "minimum": 1 },
        "lookback_days": { "type": "integer", "minimum": 1, "default": 90 },
        "unit":          { "type": ["string","null"] },

        "series": {
          "type": "array",
          "description": "Inline time-series; accepts objects {t,v} (t=epoch ms) or bare numbers (matches _series_from_params).",
          "items": {
            "oneOf": [
              { "type": "number" },
              { "type": "object", "required": ["v"],
                "properties": { "t": {"type":"number"}, "v": {"type":"number"} } }
            ]
          }
        },
        "values": { "type": "array", "items": { "type": "number" } },
        "prices": { "type": "array", "items": { "type": "number" } },

        "magnitudes":  { "type": "array", "items": { "type": "number" } },
        "magnitude":   { "type": "number", "description": "target magnitude for seismic" },
        "latitude":    { "type": "number", "minimum": -90,  "maximum": 90 },
        "longitude":   { "type": "number", "minimum": -180, "maximum": 180 },
        "radius_km":   { "type": "number", "minimum": 0 },
        "catalog_days":{ "type": "number", "minimum": 0 },
        "min_magnitude": { "type": "number" },
        "omori":       { "type": "object" },
        "mainshock_K": { "type": "number" },
        "days_since_mainshock": { "type": "number" },

        "state_vector": {
          "type": "object",
          "description": "Trajectory inputs (matches great_circle_forward).",
          "properties": {
            "lat": {"type":"number"}, "lng": {"type":"number"},
            "alt_m": {"type":"number"},
            "speed_mps": {"type":"number"}, "heading_deg": {"type":"number"},
            "vertical_rate_mps": {"type":"number"}
          }
        },
        "semi_major_axis_km": { "type": "number", "minimum": 0 },
        "speed":    { "type": "number" },
        "angle_deg":{ "type": "number" }
      }
    },
    "options": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "persist":         { "type": "boolean", "default": true,
                             "description": "Write a forecast row (§2) for self-improvement." },
        "ensemble":        { "type": "boolean", "default": true },
        "use_foundation_ts": { "type": "boolean", "default": true,
                             "description": "Allow TimesFM/Chronos when available; else classical only." },
        "conformal":       { "type": "boolean", "default": true,
                             "description": "Apply EnbPI conformal calibration to intervals." },
        "explain":         { "type": "boolean", "default": false }
      }
    }
  }
}
```

### 5.3 RESPONSE schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/predict.response.json",
  "title": "PredictResponse",
  "type": "object",
  "required": ["question","domain","target","horizon","prediction","method","drivers","data","assumptions","caveats","used_llm"],
  "additionalProperties": false,
  "properties": {
    "question": { "type": "string" },
    "domain":   { "type": "string", "enum": ["crypto","seismic","trajectory","growth","weather","epidemic","finance","generic"] },
    "target":   { "type": ["string","null"] },
    "horizon":  { "type": ["string","null"], "description": "human label, e.g. '48h','30d'" },

    "prediction": {
      "type": "object",
      "required": ["value","unit","point_estimate","interval","probability"],
      "additionalProperties": false,
      "properties": {
        "value":          { "type": ["number","object","null"] },
        "unit":           { "type": ["string","null"] },
        "point_estimate": { "type": ["number","object","null"],
                            "description": "scalar, or vector object e.g. {lat,lng,alt_m} for trajectory" },
        "interval": {
          "type": "object",
          "required": ["low","high","confidence"],
          "properties": {
            "low":        { "type": ["number","null"] },
            "high":       { "type": ["number","null"] },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        },
        "probability":    { "type": ["number","null"], "minimum": 0, "maximum": 1 },
        "percentiles":    { "type": "object",
                            "description": "optional p5/p25/p50/p75/p95 map",
                            "additionalProperties": { "type": "number" } }
      }
    },

    "method": {
      "type": "object",
      "required": ["name","family","models_used","math"],
      "additionalProperties": false,
      "properties": {
        "name":        { "type": "string" },
        "family":      { "type": "string", "enum": ["time_series","event_probability","trajectory","growth","ensemble","graph","foundation_ts","data_assimilation"] },
        "models_used": { "type": "array", "items": { "type": "string" } },
        "math":        { "type": "string" }
      }
    },

    "drivers": { "type": "object", "additionalProperties": true },

    "data": {
      "type": "object",
      "required": ["source","as_of","lookback","history","forecast"],
      "additionalProperties": false,
      "properties": {
        "source":   { "type": ["string","null"] },
        "as_of":    { "type": ["number","null"], "description": "epoch ms of latest datum" },
        "as_of_iso":{ "type": ["string","null"], "format": "date-time", "description": "additive convenience field" },
        "lookback": { "type": ["string","null"] },
        "history":  { "type": "array", "items": { "type": "object",
                       "properties": { "t": {}, "v": {} } } },
        "forecast": { "type": "array", "items": { "type": "object",
                       "properties": { "t": {}, "v": {}, "low": {}, "high": {} } } }
      }
    },

    "assumptions": { "type": "array", "items": { "type": "string" } },
    "caveats":     { "type": "array", "items": { "type": "string" } },
    "used_llm":    { "type": "boolean" },

    // ── additive, optional (new in PATTERN ORACLE; absent in legacy responses) ──
    "forecast_id":    { "type": "string", "description": "FK to forecast store (§2); present when options.persist=true" },
    "model_versions": { "type": "array", "items": { "type": "string" },
                        "description": "model_id list (FK → model_registry §7)" },
    "ensemble": {
      "type": "object",
      "description": "per-member contributions when an ensemble produced the forecast",
      "properties": {
        "members": { "type": "array", "items": {
          "type": "object",
          "required": ["model_id","weight"],
          "properties": {
            "model_id": { "type": "string" },
            "weight":   { "type": "number", "minimum": 0, "maximum": 1 },
            "point":    { "type": ["number","null"] }
          }
        }},
        "weighting": { "type": "string", "enum": ["error_weighted","equal","stacked"] },
        "conformal_applied": { "type": "boolean" }
      }
    },
    "provenance": {
      "type": "object",
      "properties": {
        "series_ids":  { "type": "array", "items": { "type": "string" } },
        "feed_run_id": { "type": ["string","null"] },
        "patterns":    { "type": "array", "items": { "type": "string" },
                         "description": "pattern.id rows that informed the forecast" },
        "kgik_edges":  { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

> **Insufficient-data result** (`_insufficient()` in prediction.py) validates against this same schema: `prediction.value=null`, `interval.confidence=0.0`, `method.name="insufficient_data"`, and the explanation carried in `caveats`. No schema branch is needed.

---

## 6. FEED ADAPTER CONTRACT

Every world-data source implements one interface so the ingestion loop is source-agnostic. This generalises the ad-hoc loaders already in prediction.py (`load_crypto_series`, `load_seismic_catalog`) and `services/live_intel.py` into a uniform contract that writes the History Lake (§1).

### 6.1 Interface (Python `Protocol`)

```python
from typing import Protocol, TypedDict, Optional

class FetchWindow(TypedDict):
    start_ms: Optional[int]      # inclusive; None = adapter default lookback
    end_ms:   Optional[int]      # inclusive; None = now

class SeriesPoint(TypedDict):
    t: int                       # UTC epoch ms  (matches prediction.py {t,v})
    v: float
    quality: Optional[str]       # 'ok' default; see observation.quality enum

class SeriesBatch(TypedDict):
    # natural key → series catalog (§1.2). The loop upserts series, then observations.
    source: str
    entity: str
    metric: str
    unit: Optional[str]
    freq: str                    # series.freq enum
    point_kind: str              # series.point_kind enum (controls rollup §1.5)
    meta: dict
    points: list[SeriesPoint]

class FeedAdapter(Protocol):
    name: str                    # unique; == series.source and feed_run.source

    # discovery cadence + politeness
    default_freq: str            # e.g. '1d'
    rate_limit_per_min: int      # max upstream calls/min (loop throttles to this)
    cache_ttl_s: float           # reuse a cached fetch within this TTL (prediction.py uses 300s)
    timeout_s: float             # per-request HTTP timeout

    def fetch(self, window: FetchWindow) -> list[SeriesBatch]:
        """Fetch all series this adapter owns over `window`.
        MUST NOT raise on transient errors: return [] and let the loop record a
        failed feed_run (mirrors prediction.py loaders that return [] on error).
        MUST be idempotent — re-fetching the same window upserts identical rows."""
        ...

    def schema_map(self, raw: dict) -> SeriesBatch:
        """Map one upstream record/payload → the normalised SeriesBatch shape.
        This is the *only* source-specific mapping; everything downstream is generic."""
        ...

    def health(self) -> dict:
        """Lightweight liveness probe: {ok: bool, latency_ms: int, note: str}."""
        ...
```

### 6.2 Contract requirements (every adapter MUST)

| Concern        | Requirement |
|----------------|-------------|
| **Naming**     | `name` is globally unique, lowercase, stable; it is the `series.source` and `feed_run.source` value. |
| **Idempotency**| `fetch(window)` upserts on `(series_id, ts)`; re-running a window changes nothing unless upstream revised a value (→ `quality='revised'`). |
| **Errors**     | Never raise on network/parse failure; return `[]`. The loop wraps every `fetch` in a `feed_run` row (`status='error'`, `error=...`). |
| **Rate limit** | Loop schedules calls so per-adapter calls/min ≤ `rate_limit_per_min` (token bucket). Adapter may also self-throttle. |
| **Caching**    | Loop honours `cache_ttl_s` (same 5-min default as prediction.py `_CACHE_TTL`); a cache hit writes a `feed_run` with `status='cache_hit'` and no new rows. |
| **Timezone**   | All emitted `t` are UTC epoch ms; adapter declares the source clock in `meta.tz` (mapped to `series.tz`). |
| **Units**      | `unit` is an explicit UCUM-ish string; if the source is unitless use `count`/`ratio`/`probability`. |
| **Provenance** | The loop stamps each upserted observation with the current `feed_run_id`. |

### 6.3 Reference registry

Adapters are discovered via a registry dict (mirroring `methods_registry.py`):

| `name`      | entity examples         | metric(s)                | freq        | upstream | maps from |
|-------------|-------------------------|--------------------------|-------------|----------|-----------|
| `coingecko` | `ripple`,`bitcoin`,…    | `close_price`            | `1d`/`1h`   | CoinGecko `market_chart` | `load_crypto_series` |
| `usgs`      | `region:<box>`          | `event_count`, per-event `magnitude` (point_kind=`event`) | `irregular` | USGS fdsnws | `load_seismic_catalog` |
| `fx`        | `AUD/USD`,…             | `rate`                   | `1d`        | FX provider | live_intel patterns |
| `kgik`      | KGIK node ids (`psg`,…) | node-derived metrics (e.g. `revenue`) | `irregular` | internal snapshots | ontology.js props |
| `sim`       | world ids               | `PopulationSnapshot` cols (`alive`,`total_knowledge`,…) | per-tick | underworld DB | models.py |

---

## 7. MODEL REGISTRY RECORD SCHEMA

Tracks every model version the engine can call in an ensemble, with its training provenance, evaluation metrics, artifact location, and lifecycle status. The `model_id` values here are exactly what `forecast.model_versions` (§2) and the response `model_versions` (§5) reference.

### 7.1 Column type table — `model_registry`

| Column        | Type        | Null | Default | Notes |
|---------------|-------------|------|---------|-------|
| `model_id`    | TEXT        | no   | —       | PK; convention `<family-name>@<version>`, e.g. `chronos-bolt@2.1` |
| `family`      | TEXT (enum) | no   | —       | `gbm_mc`,`holt`,`arima`,`foundation_ts`,`gnn`,`enkf`,`conformal`,`ensemble`,`climatology` |
| `name`        | TEXT        | no   | —       | human label, e.g. `Chronos-Bolt` |
| `version`     | TEXT        | no   | —       | semver/tag string |
| `trained_ts`  | INTEGER     | yes  | NULL    | epoch ms training finished (NULL = analytic/zero-shot model) |
| `train_window`| JSON        | yes  | NULL    | `{start_ms,end_ms,n_series,n_rows}` of the training data |
| `metrics`     | JSON        | no   | `{}`    | backtest metrics snapshot `{crps,rmse,coverage,skill_vs_climatology,...}` |
| `artifact_uri`| TEXT        | yes  | NULL    | `file://…`,`s3://…`, or `builtin:` for code-only/analytic models |
| `artifact_sha`| TEXT        | yes  | NULL    | content hash of the artifact (integrity) |
| `params`      | JSON        | no   | `{}`    | hyperparameters |
| `domains`     | JSON        | no   | `[]`    | domains this model is eligible for (subset of §5 DomainEnum) |
| `status`      | TEXT (enum) | no   | `staging` | `staging`,`production`,`shadow`,`deprecated`,`failed` |
| `code_version`| TEXT        | yes  | NULL    | git sha of the training/inference code |
| `created_at`  | DATETIME    | no   | now()   | |
| `updated_at`  | DATETIME    | no   | now()/onupdate | |

### 7.2 SQL DDL

```sql
-- MODEL REGISTRY ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_registry (
    model_id     TEXT    PRIMARY KEY,             -- '<family>@<version>'
    family       TEXT    NOT NULL
                 CHECK (family IN ('gbm_mc','holt','arima','foundation_ts','gnn',
                                   'enkf','conformal','ensemble','climatology')),
    name         TEXT    NOT NULL,
    version      TEXT    NOT NULL,
    trained_ts   INTEGER,
    train_window TEXT,                            -- JSON
    metrics      TEXT    NOT NULL DEFAULT '{}',   -- JSON
    artifact_uri TEXT,
    artifact_sha TEXT,
    params       TEXT    NOT NULL DEFAULT '{}',   -- JSON
    domains      TEXT    NOT NULL DEFAULT '[]',   -- JSON array
    status       TEXT    NOT NULL DEFAULT 'staging'
                 CHECK (status IN ('staging','production','shadow','deprecated','failed')),
    code_version TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (family, version)
);
CREATE INDEX IF NOT EXISTS ix_model_family_status ON model_registry (family, status);
CREATE INDEX IF NOT EXISTS ix_model_status        ON model_registry (status);
```

The classical forecasters already in prediction.py are seeded as analytic registry rows (`artifact_uri='builtin:'`, `trained_ts=NULL`): `gbm-mc@1.0` (`gbm_montecarlo_forecast`), `holt@1.0`, `gutenberg-richter@1.0`, `omori@1.0`, `great-circle@1.0`, `growth-exp-logistic@1.0`, plus a `climatology@1.0` baseline that every `skill_score` measures against.

---

## 8. MIGRATIONS & SCHEMA MANAGEMENT

**ORM mirror.** All control-plane tables above are also declared as SQLAlchemy models in a new `server/db/pattern_oracle_models.py` using the **exact conventions** of `underworld/server/db/models.py`: a local `Base(DeclarativeBase)`, `_uuid()`/`_now()` helpers, `Mapped[...]` + `mapped_column`, `JSON` columns for the `*_json`/`props`/`params`/`meta`/`metrics` fields, `Enum(...)` for the closed sets (domain/family/quality/status/freq/point_kind), and `__table_args__` carrying the `Index(...)`/`UniqueConstraint(...)` shown in the DDL. The hand-written DDL above is the authoritative spec; the ORM is generated to match it (verified by a `metadata.create_all` round-trip test that diffs against the DDL).

**Migration approach — Alembic.** The PATTERN ORACLE schema is versioned with **Alembic** (autogenerate against the SQLAlchemy metadata), independent of the underworld schema:

- `alembic/pattern_oracle/` env with its own `version_locations` and `version_table = 'po_alembic_version'` so it never collides with any existing migration history.
- Initial revision `0001_initial` creates §1–§4, §7 tables (the JS ontology + classical models are seeded in a `0002_seed` data migration).
- Each schema change is a new revision; `upgrade()`/`downgrade()` are both implemented. JSON columns and SQLite `CHECK` constraints are emitted via `op.create_table(..., sqlite_*)` / `batch_alter_table` (SQLite's limited `ALTER` requires Alembic **batch mode** for column changes).
- Parquet is schema-on-read (no migrations); a `parquet_schema_version` key in each partition's `_metadata` records the layout version (§1.4) so the reader can evolve.
- For the zero-infra dev path, `Base.metadata.create_all(engine)` produces an identical schema; Alembic `stamp head` reconciles a `create_all`-bootstrapped DB into migration control.

**Cross-schema FK note.** `series.kgik_node_id → kg_node.id` and `forecast.series_id → series.series_id` live in the **same** PATTERN ORACLE SQLite file, so the FKs are real (with `PRAGMA foreign_keys=ON`). References to the underworld DB (the `sim` adapter reading `PopulationSnapshot`) are **logical, cross-database** and are resolved in application code, not as DB FKs.

---

## 9. ENTITY-RELATIONSHIP SUMMARY

```
                    ┌──────────────┐
        ┌──────────▶│   series     │◀───────────┐
        │           └──────┬───────┘            │
        │                  │ 1                   │ kgik_node_id
        │ series_id        │                     ▼
   ┌────┴─────┐       N    │              ┌────────────┐      ┌──────────┐
   │ forecast │       ┌────▼──────┐       │  kg_node   │◀────▶│ kg_edge  │
   └────┬─────┘       │observation│       └─────┬──────┘ a,b  └────┬─────┘
        │ 1:1         └────┬──────┘             │ promoted        │
        ▼                  │ feed_run_id        │ pattern_id      │
  ┌──────────────┐         ▼                    ▼  ◀──────────────┘
  │realized_     │    ┌──────────┐         ┌──────────┐
  │  outcome     │    │ feed_run │◀────────│ pattern  │ feed_run_id
  └────┬─────────┘    └──────────┘         └──────────┘
       │ 1:1
       ▼
  ┌──────────────┐    ┌─────────────────┐
  │ skill_score  │    │ model_registry  │◀── forecast.model_versions[] (logical)
  └──────────────┘    └─────────────────┘
```

- **History Lake:** `series` 1—N `observation` N—1 `feed_run`.
- **Self-improvement:** `forecast` 1—1 `realized_outcome` 1—1 `skill_score`; `forecast.series_id → series` enables auto-resolution.
- **Graph:** `kg_node` ⟷ `kg_edge`; learned edges carry `pattern_id`; `series.kgik_node_id → kg_node`.
- **Patterns:** `pattern → series` (and `series_id_b`), `pattern → feed_run` (provenance), `pattern.promoted_edge_id → kg_edge`.
- **Registry:** `model_registry` referenced (logically) by `forecast.model_versions[]` and the response `model_versions`.

---

## 10. ENTITY-RELATIONSHIP DIAGRAM (full ASCII, all tables, all keys)

The §9 summary is the bird's-eye view; this is the complete crow's-foot ERD covering every control-plane table, every key column, every cardinality, and the cross-database (logical) edges. Notation: `||` = exactly-one, `o{` = zero-or-many, `|{` = one-or-many, `o|` = zero-or-one. Dashed (`- - ->`) edges are *logical* (resolved in application code, not a DB FK).

```
                              HISTORY LAKE
  ┌───────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   feed_run                          series                              │
  │  ┌────────────────────┐  1        ┌──────────────────────────┐         │
  │  │ PK feed_run_id      │──────o{──▶│ PK series_id             │         │
  │  │    source           │  ingests  │ UQ (source,entity,metric,│         │
  │  │    window_start     │  (via     │     unit,freq)           │         │
  │  │    window_end       │   obs.    │    source                │         │
  │  │    started_at       │   feed_   │    entity                │         │
  │  │    finished_at      │   run_id) │    metric                │         │
  │  │    status (enum)    │           │    unit                  │         │
  │  │    series_touched   │           │    freq (enum)           │         │
  │  │    rows_written     │           │    entity_type           │         │
  │  │    rows_revised     │           │ FK kgik_node_id ─ ─ ─ ─ ─┼─ ─ ┐    │
  │  │    http_status      │           │    point_kind (enum)     │    :    │
  │  │    latency_ms       │           │    tz / meta / active    │    :    │
  │  │    error / meta     │           │    created_at/updated_at │    :    │
  │  └─────────┬───────────┘           └────────────┬─────────────┘    :    │
  │            │ 1                          1        │                  :    │
  │            │                                     │ owns             :    │
  │            │ stamps           ┌──────────────────▼──────────┐       :    │
  │            └────────────o{───▶│ observation                 │       :    │
  │              provenance       │ PK (series_id, ts)          │       :    │
  │              (feed_run_id)    │ FK series_id  ──▶ series     │       :    │
  │                               │ FK feed_run_id ─▶ feed_run   │       :    │
  │                               │    value / quality (enum)    │       :    │
  │                               │    ingested_at               │       :    │
  │                               └──────────────────────────────┘      :    │
  └─────────────────────────────────────────────────────────────────── : ───┘
                                                                         :
              OUTCOME / FORECAST STORE                                   :
  ┌───────────────────────────────────────────────────────────┐        :
  │   forecast                                                  │        :
  │  ┌──────────────────────────┐                              │        :
  │  │ PK id  (= forecast_id)    │   FK series_id ─ ─ ─ ─ ─ ─ ─ ┼─ ─ ─ ─▶ series.series_id
  │  │    question / domain(enum)│   (auto-scoring link)        │        :
  │  │    target / horizon       │                              │        :
  │  │    horizon_s / issued_ts  │                              │        :
  │  │    due_ts / point/low/high│                              │        :
  │  │    confidence/probability │                              │        :
  │  │    unit / method          │                              │        :
  │  │    family (enum)          │                              │        :
  │  │    model_versions[] ─ ─ ─ ┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─▶ model_registry.model_id (logical)
  │  │    drivers / point_vec    │                              │        :
  │  │    climatology / used_llm │                              │        :
  │  │    scored / created_at    │                              │        :
  │  └────────┬─────────────────┘                              │        :
  │           │ 1                                               │        :
  │           │ 1:1                                             │        :
  │  ┌────────▼─────────────────┐                              │        :
  │  │ realized_outcome         │                              │        :
  │  │ PK,FK forecast_id ──▶ forecast.id                       │        :
  │  │    realized_ts / actual_value / actual_bool / actual_vec│        :
  │  │    source (enum) / lag_s │                              │        :
  │  └────────┬─────────────────┘                              │        :
  │           │ 1                                               │        :
  │           │ 1:1                                             │        :
  │  ┌────────▼─────────────────┐                              │        :
  │  │ skill_score              │                              │        :
  │  │ PK id / FK,UQ forecast_id ──▶ forecast.id               │        :
  │  │    crps/rmse/abs_err/pct_err/in_interval                │        :
  │  │    pinball_low/high/brier/log_loss                      │        :
  │  │    skill_vs_climatology/baseline_score/scored_ts        │        :
  │  └──────────────────────────┘                              │        :
  └───────────────────────────────────────────────────────────┘        :
                                                                         :
              KGIK GRAPH                                                 :
  ┌───────────────────────────────────────────────────────────┐        :
  │   kg_node                                  kg_edge          │        :
  │  ┌──────────────────────┐ 1            o{ ┌──────────────┐  │        :
  │  │ PK id  ◀─ ─ ─ ─ ─ ─ ─ ┼─ ─ ─ ─ ─ ─ ─ ─ ┼ FK a         │  │        :
  │  │    label/type/props   │ a (source)      │ FK b         │  │        :
  │  │    version            │ o{           1  │    relation  │  │        :
  │  │    valid_from/valid_to│◀────────────────┤    strength  │  │        :
  │  │    confidence/learned │ b (target)      │    directed  │  │        :
  │  │    created/updated_at  │                 │    learned   │  │        :
  │  └──────────▲────────────┘                 │ evidence_cnt │  │        :
  │             │ kgik_node_id (from series) ─ ─┤ last_conf_ts│  │        :
  │             └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│    confidence│  │        :
  │             (series.kgik_node_id) ◀─────────┘ FK pattern_id│ │        :
  │                                              │    version  │  │        :
  │                                              │ valid_from/to│ │        :
  │                                              └──────┬───────┘ │        :
  └─────────────────────────────────────────────────── │ ───────┘        :
                                                        │ pattern_id      :
              PATTERN STORE                             │ (justifies)     :
  ┌──────────────────────────────────────────────────  │ ──────┐         :
  │   pattern                                           │       │         :
  │  ┌──────────────────────────────┐                   │       │         :
  │  │ PK id                         │ promoted_edge_id ─┘       │         :
  │  │    kind (enum)                │ (FK ──▶ kg_edge.id)       │         :
  │  │ FK series_id   ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼─ ─ ─ ─▶ series.series_id
  │  │ FK series_id_b ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼─ ─ ─ ─▶ series.series_id
  │  │    window_start/end           │                           │         :
  │  │    strength/p_value/confidence│                           │         :
  │  │    params (JSON)              │                           │         :
  │  │    method/method_params       │                           │         :
  │  │ FK feed_run_id ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─▶ feed_run.feed_run_id
  │  │    code_version/evidence_count│                           │         :
  │  │    last_seen_ts/status(enum)  │                           │         :
  │  └──────────────────────────────┘                           │         :
  └─────────────────────────────────────────────────────────────┘         :
                                                                           :
              MODEL REGISTRY                                               :
  ┌──────────────────────────────┐                                        :
  │   model_registry             │                                        :
  │  ┌────────────────────────┐  │                                        :
  │  │ PK model_id            │  │◀── forecast.model_versions[] (logical)  :
  │  │ UQ (family, version)   │  │◀── response.model_versions[] (logical)  :
  │  │    family(enum)/name   │  │                                        :
  │  │    version/trained_ts  │  │                                        :
  │  │    train_window/metrics│  │                                        :
  │  │    artifact_uri/_sha   │  │                                        :
  │  │    params/domains      │  │                                        :
  │  │    status(enum)/code_v │  │                                        :
  │  └────────────────────────┘  │                                        :
  └──────────────────────────────┘                                        :
                                                                          :
              UNDERWORLD DB (separate SQLite file)  ◀ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
  ┌──────────────────────────────┐    the `sim` feed adapter (§6.3) reads
  │ population_snapshots          │    PopulationSnapshot rows and writes them
  │ PK id / world_id / tick / ... │    into series+observation. This is a
  └──────────────────────────────┘    LOGICAL, cross-database read only.
```

**Cardinality catalogue (every relationship, exhaustively):**

| From | To | Card. | Key | On delete | Real/logical |
|------|----|-------|-----|-----------|--------------|
| `series` | `observation` | 1 — N | `observation.series_id` | CASCADE | real FK |
| `feed_run` | `observation` | 1 — N (0..N) | `observation.feed_run_id` | SET NULL | real FK |
| `kg_node` | `series` | 0..1 — N | `series.kgik_node_id` | SET NULL | real FK |
| `series` | `forecast` | 0..1 — N | `forecast.series_id` | SET NULL | real FK |
| `forecast` | `realized_outcome` | 1 — 0..1 | `realized_outcome.forecast_id` (PK) | CASCADE | real FK |
| `forecast` | `skill_score` | 1 — 0..1 | `skill_score.forecast_id` (UQ) | CASCADE | real FK |
| `kg_node` (a) | `kg_edge` | 1 — N | `kg_edge.a` | CASCADE | real FK |
| `kg_node` (b) | `kg_edge` | 1 — N | `kg_edge.b` | CASCADE | real FK |
| `pattern` | `kg_edge` | 0..1 — N | `kg_edge.pattern_id` | SET NULL | real FK |
| `kg_edge` | `pattern` | 0..1 — 0..1 | `pattern.promoted_edge_id` | SET NULL | real FK |
| `series` | `pattern` | 0..1 — N | `pattern.series_id` | CASCADE | real FK |
| `series` | `pattern` | 0..1 — N | `pattern.series_id_b` | CASCADE | real FK |
| `feed_run` | `pattern` | 0..1 — N | `pattern.feed_run_id` | SET NULL | real FK |
| `model_registry` | `forecast` | N — N (array) | `forecast.model_versions[]` | — | **logical** |
| `model_registry` | response | N — N (array) | `response.model_versions[]` | — | **logical** |
| `population_snapshots` (underworld) | `series`/`observation` | N — N | sim adapter ingest | — | **logical, cross-db** |

---

## 11. COMPLETE DATA DICTIONARY (every column, every table)

This is the authoritative per-column reference: **type, unit, nullability, valid range/domain, semantic description, and a concrete example**. It supersedes the abbreviated type tables in §1–§7 (those stay for locality; this section is the canonical, exhaustive form). Types are given as `SQLite affinity (logical type)`. `epoch ms` everywhere means UTC milliseconds since 1970-01-01 (matching `prediction.py`'s `{t: ms}`). All `*_json` / `meta` / `params` columns are `TEXT` storing a JSON document (mirrors `models.py` `JSON` columns).

### 11.1 `series`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `series_id` | TEXT (UUID4) | — | no | RFC-4122 v4 | Surrogate PK; `_uuid()` convention. | `7b2a…-…-4f` |
| `source` | TEXT | — | no | registered adapter `name` (lowercase) | Adapter that owns the stream; == `feed_run.source`. | `coingecko` |
| `entity` | TEXT | — | no | non-empty | Subject of measurement (coin id, region box, node id). | `ripple` |
| `metric` | TEXT | — | no | non-empty snake_case | What is measured. | `close_price` |
| `unit` | TEXT | UCUM-ish | yes | UCUM token or `count`/`ratio`/`probability` | Physical/financial unit; NULL only for unitless legacy rows. | `USD` |
| `freq` | TEXT (enum) | — | no | `1m,5m,15m,1h,1d,1w,1mo,irregular` | Native cadence; drives rollup buckets (§1.5). | `1d` |
| `entity_type` | TEXT | — | yes | KGIK node `type` set | Optional link to graph node typing. | `asset` |
| `kgik_node_id` | TEXT | — | yes | FK → `kg_node.id` | Ties series to a graph node; SET NULL on node delete. | `xrp` |
| `point_kind` | TEXT (enum) | — | no | `level,flow,rate,ratio,event` | Controls rollup math (§1.5) & scoring. | `level` |
| `tz` | TEXT (IANA) | — | no | IANA tz db name | Source clock; `ts` always stored UTC. | `America/New_York` |
| `meta` | TEXT (JSON) | — | no | valid JSON object | Free-form (coin id, USGS box). Default `{}`. | `{"coin":"ripple"}` |
| `active` | INTEGER (bool) | — | no | 0 \| 1 | 0 = retired stream, kept for history. | `1` |
| `created_at` | TEXT (datetime) | — | no | ISO-8601 | Row creation (`datetime('now')`). | `2026-06-04 09:00:00` |
| `updated_at` | TEXT (datetime) | — | no | ISO-8601 | Last mutation (onupdate). | `2026-06-04 09:00:00` |

### 11.2 `observation`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `series_id` | TEXT (UUID4) | — | no | FK → `series.series_id` | Owning stream. | `7b2a…` |
| `ts` | INTEGER | epoch ms | no | ≥ 0 (≤ now + clock-skew tol.) | Observation time. | `1749027600000` |
| `value` | REAL | series `unit` | no | finite (no NaN/Inf) | The measurement. | `0.5213` |
| `quality` | TEXT (enum) | — | no | `ok,interpolated,suspect,imputed,revised` | Data-quality flag (§13). | `ok` |
| `feed_run_id` | TEXT (UUID4) | — | yes | FK → `feed_run` | Provenance pointer. | `c91…` |
| `ingested_at` | INTEGER | epoch ms | no | ≥ `ts` typical | When row landed (revision tracking). | `1749031200000` |

### 11.3 `feed_run`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `feed_run_id` | TEXT (UUID4) | — | no | RFC-4122 v4 | PK. | `c91…` |
| `source` | TEXT | — | no | adapter `name` | Which adapter ran. | `usgs` |
| `window_start` | INTEGER | epoch ms | yes | ≥ 0 or NULL | Requested fetch start; NULL = adapter default. | `1746349200000` |
| `window_end` | INTEGER | epoch ms | yes | ≥ `window_start` | Requested fetch end; NULL = now. | `1749027600000` |
| `started_at` | INTEGER | epoch ms | no | ≥ 0 | Run start. | `1749031200000` |
| `finished_at` | INTEGER | epoch ms | yes | ≥ `started_at` | Run end; NULL while running. | `1749031203120` |
| `status` | TEXT (enum) | — | no | `running,ok,partial,error,rate_limited,cache_hit` | Terminal/observed status. | `ok` |
| `series_touched` | INTEGER | count | no | ≥ 0 | Distinct series written. | `5` |
| `rows_written` | INTEGER | count | no | ≥ 0 | Observations upserted. | `450` |
| `rows_revised` | INTEGER | count | no | ≥ 0, ≤ `rows_written` | Upserts that changed a value. | `2` |
| `http_status` | INTEGER | — | yes | 100–599 or NULL | Last upstream HTTP code. | `200` |
| `latency_ms` | INTEGER | ms | yes | ≥ 0 | Fetch wall time. | `3120` |
| `error` | TEXT | — | yes | ≤ 2000 chars | Truncated error string. | `ReadTimeout` |
| `meta` | TEXT (JSON) | — | no | valid JSON | Request echo, cache key. | `{"days":"90"}` |

### 11.4 `forecast`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `id` | TEXT (UUID4) | — | no | RFC-4122 v4 | PK; echoed as `forecast_id`. | `f12…` |
| `question` | TEXT | — | no | 1–2000 chars | Raw NL question. | `Where will XRP be in 48h?` |
| `domain` | TEXT (enum) | — | no | DomainEnum (§5.1) | Routed domain. | `crypto` |
| `target` | TEXT | — | yes | free | Subject. | `ripple` |
| `series_id` | TEXT | — | yes | FK → `series` | Auto-scoring link. | `7b2a…` |
| `horizon` | TEXT | — | no | human label | e.g. `48h`. | `48h` |
| `horizon_s` | INTEGER | s | no | > 0 | Horizon in seconds. | `172800` |
| `issued_ts` | INTEGER | epoch ms | no | ≥ 0 | When forecast made. | `1749027600000` |
| `due_ts` | INTEGER | epoch ms | yes | ≥ `issued_ts` | When reality is checked. | `1749200400000` |
| `point` | REAL | `unit` | yes | finite | Point estimate (NULL for vector-only). | `0.547` |
| `low` | REAL | `unit` | yes | ≤ `point` | Interval low. | `0.41` |
| `high` | REAL | `unit` | yes | ≥ `point` | Interval high. | `0.69` |
| `confidence` | REAL | — | yes | 0..1 | Nominal coverage. | `0.90` |
| `probability` | REAL | — | yes | 0..1 | Event/up probability. | `0.62` |
| `unit` | TEXT | — | yes | unit token | Unit of `point`. | `USD` |
| `method` | TEXT | — | no | non-empty | `method.name`. | `GBM Monte-Carlo + Holt blend` |
| `family` | TEXT (enum) | — | no | FamilyEnum (§5.1) | Method family. | `time_series` |
| `model_versions` | TEXT (JSON[]) | — | no | array of `model_id` | Producers. Default `[]`. | `["gbm-mc@1.0"]` |
| `drivers` | TEXT (JSON) | — | no | valid JSON | Response `drivers` snapshot. | `{"p0":0.52,…}` |
| `point_vec` | TEXT (JSON) | — | yes | valid JSON | Vector target. | `{"lat":35.6,"lng":139.7}` |
| `climatology` | TEXT (JSON) | — | yes | valid JSON | Baseline for skill. | `{"mean":0.5,"std":0.08}` |
| `used_llm` | INTEGER (bool) | — | no | 0 \| 1 | Mirrors response. | `0` |
| `scored` | INTEGER (bool) | — | no | 0 \| 1 | True once scored. | `0` |
| `created_at` | TEXT (datetime) | — | no | ISO-8601 | Row creation. | `2026-06-04 09:00:00` |

### 11.5 `realized_outcome`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `forecast_id` | TEXT (UUID4) | — | no | PK, FK → `forecast.id` | 1:1 link. | `f12…` |
| `realized_ts` | INTEGER | epoch ms | no | ≥ 0 | When observed. | `1749200500000` |
| `actual_value` | REAL | forecast `unit` | yes | finite | Realized scalar. | `0.531` |
| `actual_bool` | INTEGER (bool) | — | yes | 0 \| 1 | Did event occur? | `1` |
| `actual_vec` | TEXT (JSON) | — | yes | valid JSON | Realized vector. | `{"lat":35.7,…}` |
| `source` | TEXT (enum) | — | no | `auto,manual,adapter` | Resolution source. | `auto` |
| `lag_s` | INTEGER | s | yes | any (may be ±) | `realized_ts - due_ts` (s). | `100` |
| `created_at` | TEXT (datetime) | — | no | ISO-8601 | Row creation. | `…` |

### 11.6 `skill_score`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `id` | TEXT (UUID4) | — | no | v4 | PK. | `s44…` |
| `forecast_id` | TEXT | — | no | FK, UQ → `forecast.id` | 1:1. | `f12…` |
| `crps` | REAL | `unit` | yes | ≥ 0 | Continuous Ranked Probability Score. | `0.031` |
| `rmse` | REAL | `unit` | yes | ≥ 0 | Per-forecast |err| (RMSE on aggregate). | `0.016` |
| `abs_err` | REAL | `unit` | yes | ≥ 0 | `|point − actual|`. | `0.016` |
| `pct_err` | REAL | ratio | yes | ≥ 0 | `abs_err/|actual|`. | `0.030` |
| `in_interval` | INTEGER (bool) | — | yes | 0 \| 1 | Was actual ∈ [low,high]? | `1` |
| `pinball_low` | REAL | `unit` | yes | ≥ 0 | Pinball loss @ low quantile. | `0.004` |
| `pinball_high` | REAL | `unit` | yes | ≥ 0 | Pinball loss @ high quantile. | `0.006` |
| `brier` | REAL | — | yes | 0..1 | `(prob − actual_bool)²`. | `0.144` |
| `log_loss` | REAL | nats | yes | ≥ 0 | Event log loss. | `0.47` |
| `skill_vs_climatology` | REAL | — | yes | ≤ 1 (often −∞..1) | `1 − score/score_clim` (>0 beats baseline). | `0.22` |
| `baseline_score` | REAL | `unit` | yes | ≥ 0 | Climatology/persistence ref. | `0.040` |
| `scored_ts` | INTEGER | epoch ms | no | ≥ 0 | When scored. | `…` |
| `created_at` | TEXT (datetime) | — | no | ISO-8601 | Row creation. | `…` |

### 11.7 `kg_node`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `id` | TEXT | — | no | stable id or UUID | PK (hand-authored ids are stable). | `psg` |
| `label` | TEXT | — | no | non-empty | Display name. | `PSG` |
| `type` | TEXT | — | no | node type set (open) | KGIK/engine type. | `org` |
| `props` | TEXT (JSON) | — | no | valid JSON | `props` from ontology.js. Default `{}`. | `{"league":"L1"}` |
| `version` | INTEGER | — | no | ≥ 1 | Optimistic version. | `1` |
| `valid_from` | INTEGER | epoch ms | no | ≥ 0 | Bitemporal validity start. | `…` |
| `valid_to` | INTEGER | epoch ms | yes | ≥ `valid_from` or NULL | NULL = currently valid. | `null` |
| `confidence` | REAL | — | no | 0..1 | Belief (== ontology `conf`). | `1.0` |
| `learned` | INTEGER (bool) | — | no | 0 \| 1 | 1 = discovered, not hand-authored. | `0` |
| `created_at` | TEXT (datetime) | — | no | ISO-8601 | — | `…` |
| `updated_at` | TEXT (datetime) | — | no | ISO-8601 | — | `…` |

### 11.8 `kg_edge`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `id` | TEXT (UUID4) | — | no | v4 | PK. | `e77…` |
| `a` | TEXT | — | no | FK → `kg_node.id` | Source node. | `sam` |
| `b` | TEXT | — | no | FK → `kg_node.id` | Target node. | `psg` |
| `relation` | TEXT | — | no | non-empty | Edge label. | `CONTROLS 50%` |
| `strength` | REAL | — | no | learned 0..1; authored 1..3 | Magnitude/effect size. | `2.0` |
| `directed` | INTEGER (bool) | — | no | 0 \| 1 | a→b directionality. | `1` |
| `learned` | INTEGER (bool) | — | no | 0 \| 1 | 1 = discovered. | `0` |
| `evidence_count` | INTEGER | count | no | ≥ 0 | # confirmations. | `0` |
| `last_confirmed_ts` | INTEGER | epoch ms | yes | ≥ 0 | Most recent confirmation. | `null` |
| `confidence` | REAL | — | no | 0..1 | Calibrated belief; authored = 1.0. | `1.0` |
| `pattern_id` | TEXT | — | yes | FK → `pattern.id` | Justifying pattern (learned edges). | `null` |
| `version` | INTEGER | — | no | ≥ 1 | Version. | `1` |
| `valid_from` | INTEGER | epoch ms | no | ≥ 0 | Validity start. | `…` |
| `valid_to` | INTEGER | epoch ms | yes | ≥ `valid_from` | NULL = current. | `null` |
| `created_at` / `updated_at` | TEXT (datetime) | — | no | ISO-8601 | — | `…` |

### 11.9 `pattern`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `id` | TEXT (UUID4) | — | no | v4 | PK. | `p33…` |
| `kind` | TEXT (enum) | — | no | `motif,anomaly,regime,changepoint,lead_lag,causal_link` | Pattern kind. | `lead_lag` |
| `series_id` | TEXT | — | yes | FK → `series` | Primary series. | `7b2a…` |
| `series_id_b` | TEXT | — | yes | FK → `series` | Second series (pair). | `9cd…` |
| `window_start` | INTEGER | epoch ms | yes | ≥ 0 | Analysis window start. | `…` |
| `window_end` | INTEGER | epoch ms | yes | ≥ `window_start` | Window end. | `…` |
| `strength` | REAL | — | yes | kind-dependent | Unified effect size. | `0.71` |
| `p_value` | REAL | — | yes | 0..1 | Significance (Granger/CCM). | `0.003` |
| `confidence` | REAL | — | no | 0..1 | Calibrated belief. Default `0.5`. | `0.62` |
| `params` | TEXT (JSON) | — | no | valid JSON | Kind payload (§4.1). | `{"lag_s":3600,…}` |
| `method` | TEXT | — | no | non-empty | Algorithm name. | `granger` |
| `method_params` | TEXT (JSON) | — | no | valid JSON | Hyperparameters. | `{"max_lag":24}` |
| `feed_run_id` | TEXT | — | yes | FK → `feed_run` | Data snapshot. | `c91…` |
| `code_version` | TEXT | — | yes | git sha / pkg ver | Discovery code version. | `a1b2c3d` |
| `evidence_count` | INTEGER | count | no | ≥ 1 | # recurrences. | `4` |
| `last_seen_ts` | INTEGER | epoch ms | no | ≥ 0 | Last significant window. | `…` |
| `promoted_edge_id` | TEXT | — | yes | FK → `kg_edge.id` | Promoted graph edge. | `e77…` |
| `status` | TEXT (enum) | — | no | `active,stale,retired,promoted` | Lifecycle. | `active` |
| `created_at` / `updated_at` | TEXT (datetime) | — | no | ISO-8601 | — | `…` |

### 11.10 `model_registry`

| Column | Type | Unit | Null | Range / domain | Description | Example |
|--------|------|------|------|----------------|-------------|---------|
| `model_id` | TEXT | — | no | `<family>@<version>` | PK. | `chronos-bolt@2.1` |
| `family` | TEXT (enum) | — | no | `gbm_mc,holt,arima,foundation_ts,gnn,enkf,conformal,ensemble,climatology` | Model family. | `foundation_ts` |
| `name` | TEXT | — | no | non-empty | Human label. | `Chronos-Bolt` |
| `version` | TEXT | — | no | semver/tag | Version string. | `2.1` |
| `trained_ts` | INTEGER | epoch ms | yes | ≥ 0 or NULL | Train finish (NULL = analytic). | `null` |
| `train_window` | TEXT (JSON) | — | yes | `{start_ms,end_ms,n_series,n_rows}` | Training data extent. | `{"n_rows":1e6}` |
| `metrics` | TEXT (JSON) | — | no | valid JSON | Backtest snapshot. Default `{}`. | `{"crps":0.03}` |
| `artifact_uri` | TEXT | — | yes | URI or `builtin:` | Artifact location. | `builtin:` |
| `artifact_sha` | TEXT | — | yes | hex hash | Integrity hash. | `sha256:…` |
| `params` | TEXT (JSON) | — | no | valid JSON | Hyperparameters. | `{}` |
| `domains` | TEXT (JSON[]) | — | no | subset of DomainEnum | Eligible domains. | `["crypto"]` |
| `status` | TEXT (enum) | — | no | `staging,production,shadow,deprecated,failed` | Lifecycle. | `production` |
| `code_version` | TEXT | — | yes | git sha | Train/infer code version. | `a1b2c3d` |
| `created_at` / `updated_at` | TEXT (datetime) | — | no | ISO-8601 | — | `…` |

---

## 12. JSON SCHEMA (Draft 2020-12) FOR EVERY OBJECT

§5 specifies the on-the-wire `/functions/predict` request/response. This section adds **a JSON Schema for every internal record** (each control-plane table's row as a JSON object) **and every nested API object**, so any layer (Python, JS, the ingestion loop, test fixtures) can validate the exact same shapes. Every schema is independently `$id`-addressable and they cross-reference via `$ref`. Convention: `string` for UUID/datetime, `integer` for epoch-ms, `number` for reals; nullability via `["T","null"]`.

### 12.1 Common definitions (`$defs`) — referenced by all record schemas

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/common.json",
  "$defs": {
    "uuid":    { "type": "string", "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$" },
    "epoch_ms":{ "type": "integer", "minimum": 0 },
    "datetime":{ "type": "string", "format": "date-time" },
    "unit_ratio":{ "type": "number", "minimum": 0, "maximum": 1 },
    "finite":  { "type": "number" },
    "jsonObject": { "type": "object", "additionalProperties": true },
    "DomainEnum": { "enum": ["crypto","seismic","trajectory","growth","weather","epidemic","finance","generic"] },
    "FamilyEnum": { "enum": ["time_series","event_probability","trajectory","growth","ensemble","graph","foundation_ts","data_assimilation"] },
    "FreqEnum":   { "enum": ["1m","5m","15m","1h","1d","1w","1mo","irregular"] },
    "PointKindEnum": { "enum": ["level","flow","rate","ratio","event"] },
    "QualityEnum":{ "enum": ["ok","interpolated","suspect","imputed","revised"] },
    "RunStatusEnum": { "enum": ["running","ok","partial","error","rate_limited","cache_hit"] },
    "OutcomeSourceEnum": { "enum": ["auto","manual","adapter"] },
    "PatternKindEnum": { "enum": ["motif","anomaly","regime","changepoint","lead_lag","causal_link"] },
    "PatternStatusEnum": { "enum": ["active","stale","retired","promoted"] },
    "ModelFamilyEnum": { "enum": ["gbm_mc","holt","arima","foundation_ts","gnn","enkf","conformal","ensemble","climatology"] },
    "ModelStatusEnum": { "enum": ["staging","production","shadow","deprecated","failed"] }
  }
}
```

### 12.2 `series` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/series.json",
  "title": "SeriesRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["series_id","source","entity","metric","freq","point_kind","tz","meta","active","created_at","updated_at"],
  "properties": {
    "series_id":   { "$ref": "common.json#/$defs/uuid" },
    "source":      { "type": "string", "minLength": 1, "pattern": "^[a-z0-9_]+$" },
    "entity":      { "type": "string", "minLength": 1 },
    "metric":      { "type": "string", "minLength": 1 },
    "unit":        { "type": ["string","null"] },
    "freq":        { "$ref": "common.json#/$defs/FreqEnum" },
    "entity_type": { "type": ["string","null"] },
    "kgik_node_id":{ "type": ["string","null"] },
    "point_kind":  { "$ref": "common.json#/$defs/PointKindEnum" },
    "tz":          { "type": "string", "default": "UTC" },
    "meta":        { "$ref": "common.json#/$defs/jsonObject" },
    "active":      { "type": "boolean" },
    "created_at":  { "$ref": "common.json#/$defs/datetime" },
    "updated_at":  { "$ref": "common.json#/$defs/datetime" }
  }
}
```

### 12.3 `observation` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/observation.json",
  "title": "ObservationRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["series_id","ts","value","quality","ingested_at"],
  "properties": {
    "series_id":   { "$ref": "common.json#/$defs/uuid" },
    "ts":          { "$ref": "common.json#/$defs/epoch_ms" },
    "value":       { "$ref": "common.json#/$defs/finite" },
    "quality":     { "$ref": "common.json#/$defs/QualityEnum" },
    "feed_run_id": { "oneOf": [ { "$ref": "common.json#/$defs/uuid" }, { "type": "null" } ] },
    "ingested_at": { "$ref": "common.json#/$defs/epoch_ms" }
  }
}
```

### 12.4 `feed_run` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/feed_run.json",
  "title": "FeedRunRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["feed_run_id","source","started_at","status","series_touched","rows_written","rows_revised","meta"],
  "properties": {
    "feed_run_id":   { "$ref": "common.json#/$defs/uuid" },
    "source":        { "type": "string", "pattern": "^[a-z0-9_]+$" },
    "window_start":  { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "window_end":    { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "started_at":    { "$ref": "common.json#/$defs/epoch_ms" },
    "finished_at":   { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "status":        { "$ref": "common.json#/$defs/RunStatusEnum" },
    "series_touched":{ "type": "integer", "minimum": 0 },
    "rows_written":  { "type": "integer", "minimum": 0 },
    "rows_revised":  { "type": "integer", "minimum": 0 },
    "http_status":   { "type": ["integer","null"], "minimum": 100, "maximum": 599 },
    "latency_ms":    { "type": ["integer","null"], "minimum": 0 },
    "error":         { "type": ["string","null"], "maxLength": 2000 },
    "meta":          { "$ref": "common.json#/$defs/jsonObject" }
  }
}
```

### 12.5 `forecast` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/forecast.json",
  "title": "ForecastRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["id","question","domain","horizon","horizon_s","issued_ts","method","family","model_versions","drivers","used_llm","scored","created_at"],
  "properties": {
    "id":            { "$ref": "common.json#/$defs/uuid" },
    "question":      { "type": "string", "minLength": 1, "maxLength": 2000 },
    "domain":        { "$ref": "common.json#/$defs/DomainEnum" },
    "target":        { "type": ["string","null"] },
    "series_id":     { "oneOf": [ { "$ref": "common.json#/$defs/uuid" }, { "type": "null" } ] },
    "horizon":       { "type": "string" },
    "horizon_s":     { "type": "integer", "exclusiveMinimum": 0 },
    "issued_ts":     { "$ref": "common.json#/$defs/epoch_ms" },
    "due_ts":        { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "point":         { "type": ["number","null"] },
    "low":           { "type": ["number","null"] },
    "high":          { "type": ["number","null"] },
    "confidence":    { "type": ["number","null"], "minimum": 0, "maximum": 1 },
    "probability":   { "type": ["number","null"], "minimum": 0, "maximum": 1 },
    "unit":          { "type": ["string","null"] },
    "method":        { "type": "string", "minLength": 1 },
    "family":        { "$ref": "common.json#/$defs/FamilyEnum" },
    "model_versions":{ "type": "array", "items": { "type": "string" } },
    "drivers":       { "$ref": "common.json#/$defs/jsonObject" },
    "point_vec":     { "type": ["object","null"], "additionalProperties": true },
    "climatology":   { "type": ["object","null"], "additionalProperties": true },
    "used_llm":      { "type": "boolean" },
    "scored":        { "type": "boolean" },
    "created_at":    { "$ref": "common.json#/$defs/datetime" }
  },
  "allOf": [
    { "if": { "properties": { "low": { "type": "number" }, "high": { "type": "number" } }, "required": ["low","high"] },
      "then": { "properties": { "low": { "type": "number" }, "high": { "type": "number" } } } }
  ]
}
```

### 12.6 `realized_outcome` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/realized_outcome.json",
  "title": "RealizedOutcomeRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["forecast_id","realized_ts","source","created_at"],
  "properties": {
    "forecast_id":  { "$ref": "common.json#/$defs/uuid" },
    "realized_ts":  { "$ref": "common.json#/$defs/epoch_ms" },
    "actual_value": { "type": ["number","null"] },
    "actual_bool":  { "type": ["boolean","null"] },
    "actual_vec":   { "type": ["object","null"], "additionalProperties": true },
    "source":       { "$ref": "common.json#/$defs/OutcomeSourceEnum" },
    "lag_s":        { "type": ["integer","null"] },
    "created_at":   { "$ref": "common.json#/$defs/datetime" }
  },
  "anyOf": [
    { "required": ["actual_value"] },
    { "required": ["actual_bool"] },
    { "required": ["actual_vec"] }
  ]
}
```

### 12.7 `skill_score` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/skill_score.json",
  "title": "SkillScoreRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["id","forecast_id","scored_ts","created_at"],
  "properties": {
    "id":          { "$ref": "common.json#/$defs/uuid" },
    "forecast_id": { "$ref": "common.json#/$defs/uuid" },
    "crps":        { "type": ["number","null"], "minimum": 0 },
    "rmse":        { "type": ["number","null"], "minimum": 0 },
    "abs_err":     { "type": ["number","null"], "minimum": 0 },
    "pct_err":     { "type": ["number","null"], "minimum": 0 },
    "in_interval": { "type": ["boolean","null"] },
    "pinball_low": { "type": ["number","null"], "minimum": 0 },
    "pinball_high":{ "type": ["number","null"], "minimum": 0 },
    "brier":       { "type": ["number","null"], "minimum": 0, "maximum": 1 },
    "log_loss":    { "type": ["number","null"], "minimum": 0 },
    "skill_vs_climatology": { "type": ["number","null"], "maximum": 1 },
    "baseline_score": { "type": ["number","null"], "minimum": 0 },
    "scored_ts":   { "$ref": "common.json#/$defs/epoch_ms" },
    "created_at":  { "$ref": "common.json#/$defs/datetime" }
  }
}
```

### 12.8 `kg_node` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/kg_node.json",
  "title": "KgNodeRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["id","label","type","props","version","valid_from","confidence","learned","created_at","updated_at"],
  "properties": {
    "id":         { "type": "string", "minLength": 1 },
    "label":      { "type": "string", "minLength": 1 },
    "type":       { "type": "string", "minLength": 1 },
    "props":      { "$ref": "common.json#/$defs/jsonObject" },
    "version":    { "type": "integer", "minimum": 1 },
    "valid_from": { "$ref": "common.json#/$defs/epoch_ms" },
    "valid_to":   { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "confidence": { "$ref": "common.json#/$defs/unit_ratio" },
    "learned":    { "type": "boolean" },
    "created_at": { "$ref": "common.json#/$defs/datetime" },
    "updated_at": { "$ref": "common.json#/$defs/datetime" }
  }
}
```

### 12.9 `kg_edge` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/kg_edge.json",
  "title": "KgEdgeRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["id","a","b","relation","strength","directed","learned","evidence_count","confidence","version","valid_from","created_at","updated_at"],
  "properties": {
    "id":               { "$ref": "common.json#/$defs/uuid" },
    "a":                { "type": "string", "minLength": 1 },
    "b":                { "type": "string", "minLength": 1 },
    "relation":         { "type": "string", "minLength": 1 },
    "strength":         { "type": "number" },
    "directed":         { "type": "boolean" },
    "learned":          { "type": "boolean" },
    "evidence_count":   { "type": "integer", "minimum": 0 },
    "last_confirmed_ts":{ "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "confidence":       { "$ref": "common.json#/$defs/unit_ratio" },
    "pattern_id":       { "oneOf": [ { "$ref": "common.json#/$defs/uuid" }, { "type": "null" } ] },
    "version":          { "type": "integer", "minimum": 1 },
    "valid_from":       { "$ref": "common.json#/$defs/epoch_ms" },
    "valid_to":         { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "created_at":       { "$ref": "common.json#/$defs/datetime" },
    "updated_at":       { "$ref": "common.json#/$defs/datetime" }
  }
}
```

### 12.10 `pattern` record (with per-`kind` payload sub-schemas)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/pattern.json",
  "title": "PatternRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["id","kind","confidence","params","method","method_params","evidence_count","last_seen_ts","status","created_at","updated_at"],
  "properties": {
    "id":            { "$ref": "common.json#/$defs/uuid" },
    "kind":          { "$ref": "common.json#/$defs/PatternKindEnum" },
    "series_id":     { "oneOf": [ { "$ref": "common.json#/$defs/uuid" }, { "type": "null" } ] },
    "series_id_b":   { "oneOf": [ { "$ref": "common.json#/$defs/uuid" }, { "type": "null" } ] },
    "window_start":  { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "window_end":    { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "strength":      { "type": ["number","null"] },
    "p_value":       { "type": ["number","null"], "minimum": 0, "maximum": 1 },
    "confidence":    { "$ref": "common.json#/$defs/unit_ratio" },
    "params":        { "$ref": "common.json#/$defs/jsonObject" },
    "method":        { "type": "string", "minLength": 1 },
    "method_params": { "$ref": "common.json#/$defs/jsonObject" },
    "feed_run_id":   { "oneOf": [ { "$ref": "common.json#/$defs/uuid" }, { "type": "null" } ] },
    "code_version":  { "type": ["string","null"] },
    "evidence_count":{ "type": "integer", "minimum": 1 },
    "last_seen_ts":  { "$ref": "common.json#/$defs/epoch_ms" },
    "promoted_edge_id": { "oneOf": [ { "$ref": "common.json#/$defs/uuid" }, { "type": "null" } ] },
    "status":        { "$ref": "common.json#/$defs/PatternStatusEnum" },
    "created_at":    { "$ref": "common.json#/$defs/datetime" },
    "updated_at":    { "$ref": "common.json#/$defs/datetime" }
  },
  "allOf": [
    { "if": { "properties": { "kind": { "const": "lead_lag" } } },
      "then": { "required": ["series_id","series_id_b"],
                "properties": { "params": { "type": "object",
                  "required": ["lag_s","corr","direction"],
                  "properties": { "lag_s": { "type": "number" }, "corr": { "type": "number", "minimum": -1, "maximum": 1 },
                                  "direction": { "enum": ["a_leads_b","b_leads_a"] } } } } },
    { "if": { "properties": { "kind": { "const": "causal_link" } } },
      "then": { "required": ["series_id","series_id_b"],
                "properties": { "params": { "type": "object",
                  "required": ["direction","test","stat"],
                  "properties": { "direction": { "enum": ["a_to_b","b_to_a"] },
                                  "test": { "enum": ["granger","ccm","te"] },
                                  "stat": { "type": "number" }, "lag_s": { "type": "number" } } } } },
    { "if": { "properties": { "kind": { "const": "motif" } } },
      "then": { "properties": { "params": { "required": ["window_len","subseq_start_ts","neighbor_start_ts","distance"] } } } },
    { "if": { "properties": { "kind": { "const": "changepoint" } } },
      "then": { "properties": { "params": { "required": ["change_ts","before_mean","after_mean"] } } } },
    { "if": { "properties": { "kind": { "const": "regime" } } },
      "then": { "properties": { "params": { "required": ["regime_label","start_ts","end_ts"] } } } }
  ]
}
```

### 12.11 `model_registry` record

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/record/model_registry.json",
  "title": "ModelRegistryRecord",
  "type": "object",
  "additionalProperties": false,
  "required": ["model_id","family","name","version","metrics","params","domains","status","created_at","updated_at"],
  "properties": {
    "model_id":     { "type": "string", "pattern": "^[a-z0-9\\-]+@[0-9A-Za-z.\\-]+$" },
    "family":       { "$ref": "common.json#/$defs/ModelFamilyEnum" },
    "name":         { "type": "string", "minLength": 1 },
    "version":      { "type": "string", "minLength": 1 },
    "trained_ts":   { "oneOf": [ { "$ref": "common.json#/$defs/epoch_ms" }, { "type": "null" } ] },
    "train_window": { "type": ["object","null"],
                      "properties": { "start_ms": {"type":"integer"}, "end_ms": {"type":"integer"},
                                      "n_series": {"type":"integer"}, "n_rows": {"type":"integer"} } },
    "metrics":      { "$ref": "common.json#/$defs/jsonObject" },
    "artifact_uri": { "type": ["string","null"] },
    "artifact_sha": { "type": ["string","null"] },
    "params":       { "$ref": "common.json#/$defs/jsonObject" },
    "domains":      { "type": "array", "items": { "$ref": "common.json#/$defs/DomainEnum" } },
    "status":       { "$ref": "common.json#/$defs/ModelStatusEnum" },
    "code_version": { "type": ["string","null"] },
    "created_at":   { "$ref": "common.json#/$defs/datetime" },
    "updated_at":   { "$ref": "common.json#/$defs/datetime" }
  }
}
```

### 12.12 Nested API objects (feed-adapter & response sub-objects)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/api/series_batch.json",
  "title": "SeriesBatch",
  "description": "The normalised payload a FeedAdapter.fetch() emits (§6.1).",
  "type": "object",
  "additionalProperties": false,
  "required": ["source","entity","metric","freq","point_kind","meta","points"],
  "properties": {
    "source":     { "type": "string", "pattern": "^[a-z0-9_]+$" },
    "entity":     { "type": "string", "minLength": 1 },
    "metric":     { "type": "string", "minLength": 1 },
    "unit":       { "type": ["string","null"] },
    "freq":       { "$ref": "common.json#/$defs/FreqEnum" },
    "point_kind": { "$ref": "common.json#/$defs/PointKindEnum" },
    "meta":       { "$ref": "common.json#/$defs/jsonObject" },
    "points": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["t","v"],
        "properties": {
          "t": { "$ref": "common.json#/$defs/epoch_ms" },
          "v": { "$ref": "common.json#/$defs/finite" },
          "quality": { "$ref": "common.json#/$defs/QualityEnum" }
        }
      }
    }
  }
}
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://apex/pattern-oracle/api/health.json",
  "title": "AdapterHealth",
  "type": "object",
  "additionalProperties": false,
  "required": ["ok"],
  "properties": {
    "ok":         { "type": "boolean" },
    "latency_ms": { "type": "integer", "minimum": 0 },
    "note":       { "type": "string" }
  }
}
```

---

## 13. DATA-QUALITY VALIDATION RULES (per field)

Every datapoint passes a **validation gate** before it is upserted into `observation`; failures either reject the row (hard) or downgrade `quality` (soft). Rules are grouped by stage and mirror the defensive posture already in `prediction.py` (which drops non-finite/non-positive prices and returns `[]` on parse failure rather than raising). The gate is implemented once in the ingestion loop and applied to every adapter's output.

### 13.1 Structural rules (hard — reject row)

| Rule ID | Field(s) | Condition | On fail |
|---------|----------|-----------|---------|
| `S1` | `ts` | integer, `0 ≤ ts ≤ now + 86_400_000` (≤ 1 day future for clock skew) | reject |
| `S2` | `value` | finite (`isfinite`), not NaN/Inf | reject |
| `S3` | `series_id` | resolves to an existing/just-upserted `series` row | reject |
| `S4` | `(series_id, ts)` | unique within batch (in-batch dedup keeps last) | dedup |
| `S5` | `quality` | ∈ `QualityEnum` | coerce to `ok` |
| `S6` | natural key | `(source,entity,metric,unit,freq)` all present & typed | reject batch |

### 13.2 Domain/unit rules (soft — mark `suspect`, keep row)

| Rule ID | Applies when | Condition | On fail |
|---------|--------------|-----------|---------|
| `D1` | `unit ∈ {USD, price-like}` | `value > 0` | mark `suspect` (price ≤ 0 is implausible; mirrors `prediction.py` `p>0` filter) |
| `D2` | `unit = probability` or `metric` prob-like | `0 ≤ value ≤ 1` | mark `suspect` |
| `D3` | `metric = magnitude` (seismic) | `-1 ≤ value ≤ 10` | mark `suspect` |
| `D4` | `metric ∈ {latitude}` | `-90 ≤ value ≤ 90` | mark `suspect` |
| `D5` | `metric ∈ {longitude}` | `-180 ≤ value ≤ 180` | mark `suspect` |
| `D6` | `point_kind = ratio` | `0 ≤ value ≤ 1` (unless `meta.allow_gt1`) | mark `suspect` |
| `D7` | `point_kind = flow` | `value ≥ 0` (flows are non-negative) | mark `suspect` |
| `D8` | `unit` present | unit string parses against the UCUM-ish allow-list | mark `suspect` |

### 13.3 Statistical / temporal rules (soft — mark `suspect`, may impute)

| Rule ID | Condition | Action |
|---------|-----------|--------|
| `T1` (spike) | `|value − rolling_median₍₂₁₎|` > `k·MAD` (k=8, Hampel filter) | mark `suspect`; do not auto-correct |
| `T2` (flatline) | ≥ `N` identical consecutive values where the series is normally noisy (N=20) | mark `suspect` |
| `T3` (gap) | gap between consecutive `ts` > `3 × expected_cadence(freq)` | insert `imputed` rows only if `series.point_kind ∈ {level,rate}` (linear interp), else leave gap |
| `T4` (stale) | latest `ts` older than `staleness_budget(freq)` (e.g. `1d` series > 36h old) | flag the `feed_run` `status='partial'`, alert MLOps |
| `T5` (revision) | upsert changes an existing `value` by > `ε_rel` (1e-9) | set `quality='revised'`, increment `feed_run.rows_revised` |
| `T6` (monotonic-time) | within a series, `ingested_at` non-decreasing per `ts` | newer `ingested_at` wins on conflict |

### 13.4 Cross-table referential rules (enforced by FKs + loop)

| Rule ID | Constraint |
|---------|-----------|
| `R1` | `observation.series_id` → `series.series_id` (FK CASCADE). |
| `R2` | `observation.feed_run_id` → `feed_run.feed_run_id` (FK SET NULL). |
| `R3` | `forecast.series_id` → `series.series_id`; if NULL the forecast is not auto-scorable (must be resolved `manual`). |
| `R4` | `realized_outcome.forecast_id` 1:1 with `forecast.id`; cannot exist before its forecast. |
| `R5` | `skill_score.forecast_id` UNIQUE; a forecast has at most one scorecard. |
| `R6` | `kg_edge.a` and `kg_edge.b` must both resolve to current (`valid_to IS NULL`) `kg_node` rows at creation time. |
| `R7` | `pattern.promoted_edge_id` and `kg_edge.pattern_id` form a consistent pair: if `pattern.status='promoted'` then `promoted_edge_id` is non-NULL and the referenced edge has `pattern_id = pattern.id`. |

### 13.5 Forecast/score validation (write-time invariants)

| Rule ID | Invariant |
|---------|-----------|
| `F1` | If `point`, `low`, `high` all present: `low ≤ point ≤ high`. |
| `F2` | `confidence ∈ [0,1]`; `probability ∈ [0,1]` when present. |
| `F3` | `due_ts = issued_ts + horizon_s·1000` (computed, not trusted from caller). |
| `F4` | `family ∈ FamilyEnum`, `domain ∈ DomainEnum` (CHECK constraints). |
| `F5` | `skill_score.brier ∈ [0,1]`; `crps,rmse,abs_err,pinball_* ≥ 0`; `skill_vs_climatology ≤ 1`. |
| `F6` | `realized_outcome` must populate at least one of `actual_value` / `actual_bool` / `actual_vec` (schema `anyOf`, §12.6). |

**Quality propagation into forecasting.** When a series feeding a forecast contains `suspect`/`imputed` rows, the engine adds a machine-generated caveat to the response `caveats[]` (e.g. `"3 of 90 inputs were flagged suspect (Hampel spike filter)."`), keeping the honesty contract `prediction.py` already follows.

---

## 14. RETENTION, ROLLUP & COMPACTION — EXACT RULES

§1.5 stated the tiers; this is the executable specification: precise age boundaries, the exact bucketing arithmetic, the per-`point_kind` aggregation functions, idempotency, and the ordering of operations in the nightly job. All ages are computed as `now_ms − ts`.

### 14.1 Tier boundaries (exact)

| Tier | Predicate (`age = now_ms − ts`) | Resolution | Store |
|------|----------------------------------|------------|-------|
| Hot | `age < 7·86_400_000` | native raw | SQLite `observation` |
| Warm | `7·86_400_000 ≤ age < 90·86_400_000` | native raw | Parquet (months: current, current−1) |
| Cold | `90·86_400_000 ≤ age < 730·86_400_000` | downsampled to `1d` | Parquet |
| Frozen | `age ≥ 730·86_400_000` | downsampled to `1w` | Parquet, ZSTD-19 |

`event`-kind series are **exempt** from all downsampling at every tier (kept raw forever); only their storage tier (compression) changes.

### 14.2 Bucketing arithmetic

A coarse bucket of width `W_ms` containing fine points has bucket key
`bucket_ts = ts − (ts mod W_ms)` (left-aligned, UTC). Widths: `1d = 86_400_000`, `1w = 604_800_000` (weeks aligned to UTC Monday: `bucket_ts = ts − ((ts/86_400_000 + 3) mod 7)·86_400_000 − (ts mod 86_400_000)`; the `+3` aligns the 1970-01-01 Thursday epoch to Monday).

### 14.3 Aggregation functions by `point_kind` (exact)

For a fine set `{(ts_i, v_i, q_i)}` falling in one coarse bucket, ordered by `ts_i`:

| `point_kind` | Output value(s) | Formula |
|--------------|-----------------|---------|
| `level` | OHLC (4 derived series) | `open=v_first`, `high=max v_i`, `low=min v_i`, `close=v_last`; base series keeps `close`; derived series get metric suffixes `_open/_high/_low/_close` |
| `flow` | sum | `Σ v_i` |
| `rate` | time-weighted mean | `Σ v_i·Δt_i / Σ Δt_i`, where `Δt_i = ts_{i+1} − ts_i` (last point uses bucket end) |
| `ratio` / probability | mean | `mean(v_i)`; contributing `n` stored in rolled-up `meta.count` |
| `event` | — | never rolled up |

**Quality of a rolled-up row:** `quality = 'ok'` only if every contributing fine row was `ok`; otherwise the worst contributing flag wins under the order `ok < interpolated < imputed < suspect < revised`. The contributing-row count and worst-flag are recorded in the rolled-up row's `meta`.

### 14.4 Nightly maintenance job (ordered, idempotent)

```
MAINTENANCE(now_ms):
  1. SNAPSHOT: open a read-consistent view (WAL).
  2. HOT→WARM: for each obs with 7d ≤ age < 90d in SQLite,
       append to Parquet warm partition (source/series_id/year/month);
       after fsync, DELETE the migrated rows from SQLite.
  3. WARM→COLD: for intraday series (freq ∈ {1m,5m,15m,1h}) with age ≥ 90d,
       group fine rows by 1d bucket (§14.2), aggregate per point_kind (§14.3),
       WRITE the 1d rolled partition, then ATOMIC-DROP the fine partition.
  4. COLD→FROZEN: for non-event series with age ≥ 730d, roll 1d → 1w,
       rewrite with ZSTD-19, drop the 1d partition.
  5. FEED_RUN PRUNE: collapse feed_run rows older than 365d into one
       daily summary row per (source, date) (counts summed, status='ok'
       if any ok that day else worst).
  6. PATTERN/EDGE DECAY: apply §3.3 decay to learned edges with no
       confirmation in the decay window; close (valid_to) those below floor.
  7. VACUUM (incremental) the SQLite control-plane DB.
  WRITE one feed_run-like 'maintenance' audit row with the counts moved.
```

**Idempotency.** Each step keys on deterministic bucket boundaries and partition paths; re-running `MAINTENANCE` on the same `now_ms` is a no-op because migrated source rows are already gone and target partitions already exist (overwrite-by-bucket is content-stable). A crash between WRITE and DROP leaves duplicate logical rows that the `UNION ALL` reader de-duplicates by `(series_id, ts)` preferring the coarser partition's `meta.rolled=true`.

### 14.5 Compaction

Parquet small-file compaction runs weekly: within each `series_id/year/month` partition, files smaller than 8 MB are merged into 128 MB row-groups (target), re-sorted ascending by `ts`, recompressed (ZSTD-3 warm/cold, ZSTD-19 frozen). Compaction is transactional via write-new-then-swap-manifest; readers never see a partial set.

### 14.6 Deletion policy (explicit)

Nothing is hard-deleted except: (a) fine rows **after** their rolled-up replacement is durably written (steps 2–4); (b) `feed_run` detail rows after daily-summary collapse (step 5). `forecast`/`realized_outcome`/`skill_score` are **never** deleted (the self-improvement audit trail is permanent). KGIK rows are never deleted — superseded versions are temporally closed (`valid_to`), preserving full bitemporal history.

---

## 15. FEED-ADAPTER INTERFACE — THREE CONCRETE ADAPTERS, FIELD-BY-FIELD

§6 defined the `FeedAdapter` `Protocol`. Here are three production-shaped adapters with **exact field-by-field mappings** from the upstream payload to `SeriesBatch`/`observation`/`series`. Each is a thin refactor of code already in `prediction.py` (`load_crypto_series`, `load_seismic_catalog`) or `live_intel.py` patterns, so the mapping is verifiable against real responses.

### 15.1 USGS adapter (seismic) — refactors `load_seismic_catalog`

Upstream: `GET https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=…&minmagnitude=…` → GeoJSON `FeatureCollection`.

Per-feature upstream shape (abridged):
```json
{ "type": "Feature",
  "properties": { "mag": 5.2, "time": 1749000000000, "place": "…", "type": "earthquake", "status": "reviewed" },
  "geometry": { "type": "Point", "coordinates": [139.71, 35.68, 10.0] } }
```

**Field-by-field map** (this adapter emits **two** kinds of series per region: a per-event `magnitude` series of `point_kind=event`, and a derived daily `event_count` series):

| Upstream path | → SeriesBatch / SeriesPoint field | Transform / notes |
|---------------|-----------------------------------|-------------------|
| (config) region box id | `entity` | `region:<lat>,<lng>,r<radius_km>` or `region:global` |
| `properties.mag` | per-event series `points[].v` | `float`; rows with `mag = null` are dropped (mirrors `prediction.py` guard) |
| `properties.time` | `points[].t` | already epoch ms (USGS native); no conversion |
| `geometry.coordinates[1]` (lat) | `meta.lat` on the point's series_meta | kept in `series.meta` for event series; not the value |
| `geometry.coordinates[0]` (lng) | `meta.lng` | as above |
| `geometry.coordinates[2]` (depth km) | `meta.depth_km` | optional |
| `properties.status` (`reviewed`/`automatic`) | `points[].quality` | `reviewed→ok`, `automatic→suspect` |
| (constant) | `source` | `"usgs"` |
| (constant) | `metric` (event series) | `"magnitude"` |
| (derived) | `metric` (count series) | `"event_count"` |
| (constant) | `unit` (event series) | `"Mw"` (moment magnitude) |
| (constant) | `unit` (count series) | `"count"` |
| (constant) | `freq` (event series) | `"irregular"` |
| (constant) | `freq` (count series) | `"1d"` |
| (constant) | `point_kind` (event series) | `"event"` (never rolled up — §14.1) |
| (constant) | `point_kind` (count series) | `"flow"` (rolls up by sum) |
| request params echo | `feed_run.meta` | `{minmagnitude, starttime, maxradiuskm}` |
| HTTP status | `feed_run.http_status` | from `resp.status_code` |

Derivation of `event_count`: bucket the per-event series by UTC day (§14.2) and `Σ 1` per bucket → daily `event_count` `flow` series. This is exactly the catalog `prediction.py` feeds into Gutenberg-Richter; persisting it lets the scorer auto-resolve "≥1 quake ≥ M in horizon" event forecasts by checking the event series.

### 15.2 CoinGecko adapter (crypto) — refactors `load_crypto_series`

Upstream: `GET https://api.coingecko.com/api/v3/coins/{id}/market_chart?vs_currency=usd&days=…` →
```json
{ "prices": [[1749000000000, 0.5213], [1749086400000, 0.5331], …],
  "market_caps": [[…]], "total_volumes": [[…]] }
```

**Field-by-field map** (one `close_price` series per coin; optionally a `volume` series):

| Upstream path | → field | Transform / notes |
|---------------|---------|-------------------|
| path `{id}` (e.g. `ripple`) | `entity` | resolved via `_TICKER_TO_ID` (reused verbatim) |
| `prices[i][0]` | `points[].t` | epoch ms native; cast `int()` (matches current loader) |
| `prices[i][1]` | `points[].v` | `float()`; rows with `len < 2` dropped (current guard); `v ≤ 0` → `quality='suspect'` (rule D1) |
| `total_volumes[i][1]` | volume series `points[].v` | optional second series; `metric='volume'`, `unit='USD'`, `point_kind='flow'` |
| (constant) | `source` | `"coingecko"` |
| (constant) | `metric` (price) | `"close_price"` |
| (constant) | `unit` (price) | `"USD"` |
| `days` ⇒ cadence | `freq` | `days ≤ 1 → "5m"` (CoinGecko returns 5-min), `2..90 → "1h"`, `> 90 → "1d"` (CoinGecko's auto-granularity) |
| (constant) | `point_kind` (price) | `"level"` (rolls up to OHLC — §14.3) |
| `vs_currency`, `days` | `feed_run.meta` | request echo |
| `429` from upstream | `feed_run.status` | `"rate_limited"` (CoinGecko free-tier limit) |

`cache_ttl_s = 300` (same 5-min TTL as `prediction.py` `_CACHE_TTL`); a within-TTL re-fetch writes a `feed_run` `status='cache_hit'`, `rows_written=0`.

### 15.3 FX adapter (foreign exchange) — generalises `live_intel` patterns

Upstream (provider-agnostic; example exchangerate-style): `GET .../latest?base=AUD&symbols=USD,EUR,GBP` →
```json
{ "base": "AUD", "date": "2026-06-04", "rates": { "USD": 0.661, "EUR": 0.612, "GBP": 0.520 } }
```

**Field-by-field map** (one `rate` series per ordered pair `BASE/QUOTE`):

| Upstream path | → field | Transform / notes |
|---------------|---------|-------------------|
| `base` + each key of `rates` | `entity` | `"<base>/<quote>"`, e.g. `"AUD/USD"` |
| `rates[quote]` | `points[].v` | `float`; `v ≤ 0` → reject (S2/D1) |
| `date` (`YYYY-MM-DD`) | `points[].t` | parse to UTC midnight epoch ms: `Date.parse(date+"T00:00:00Z")` |
| (constant) | `source` | `"fx"` |
| (constant) | `metric` | `"rate"` |
| (computed) | `unit` | `"<quote>/<base>"`, e.g. `"USD/AUD"` (price of 1 base in quote) |
| (constant) | `freq` | `"1d"` |
| (constant) | `point_kind` | `"rate"` (rolls up time-weighted mean — §14.3) |
| `base`, `symbols` | `feed_run.meta` | request echo |
| missing `quote` in `rates` | (skip) | that pair's batch omitted; logged in `feed_run.meta.missing[]` |

### 15.4 Adapter registry entry (uniform shape)

```python
ADAPTERS: dict[str, FeedAdapter] = {
    "usgs":      UsgsAdapter(default_freq="irregular", rate_limit_per_min=20,  cache_ttl_s=300, timeout_s=20.0),
    "coingecko": CoinGeckoAdapter(default_freq="1d",   rate_limit_per_min=10,  cache_ttl_s=300, timeout_s=15.0),
    "fx":        FxAdapter(default_freq="1d",          rate_limit_per_min=30,  cache_ttl_s=300, timeout_s=10.0),
}
```

Each entry's `name`, `freq`, `point_kind` choices line up with §6.3's reference registry and feed the rollup engine (§14) correctly: USGS event series stay raw, CoinGecko prices become OHLC, FX rates become time-weighted means.

### 15.5 Round-trip idempotency (acceptance hook)

Re-running any adapter over an identical window must produce byte-identical `series`+`observation` rows (acceptance §16.4). The only legal diff is a genuine upstream revision (USGS `automatic→reviewed`, or a CoinGecko late price correction), which lands as `quality='revised'` and bumps `feed_run.rows_revised` — never a spurious churn.

---

## 16. SCHEMA VERSIONING

Both the **persisted** schema (SQLite + Parquet) and the **on-the-wire** schema (`/functions/predict`, record JSON Schemas) are versioned, independently and explicitly, so old data and old clients keep working.

### 16.1 Persisted-schema version

- A singleton control row `schema_meta(key TEXT PRIMARY KEY, value TEXT)` stores `po_schema_version` (integer, == latest applied Alembic revision ordinal) and `parquet_layout_version`.
- The version is the Alembic head ordinal; `po_alembic_version` (the Alembic table, §8) is the machine truth, `schema_meta.po_schema_version` is a human-readable mirror updated by each migration.
- Parquet is schema-on-read: every partition's `_metadata` carries `parquet_schema_version`; the reader maps older layouts forward (e.g. a column added in v2 reads as its default for v1 files).

### 16.2 API / record-schema version (SemVer)

The JSON Schemas (§5, §12) carry a SemVer in their `$id` path once they evolve, e.g. `…/predict.response.v1.json`. Rules:

| Change | SemVer bump | Compatibility |
|--------|-------------|---------------|
| Add an **optional** field (e.g. `forecast_id`, `ensemble`) | **minor** | backward-compatible; old clients ignore it (current additive policy, §5) |
| Add an enum **value** (new domain/family) | **minor** | clients must treat unknown enum values leniently |
| Make an optional field **required**, remove a field, narrow a type, remove an enum value | **major** | breaking; served behind a new `$id` and a version negotiation header |
| Tighten a description / example only | **patch** | no client impact |

### 16.3 Version negotiation & coexistence

- Requests may send `params._schema_version` (default = latest minor of the current major). The engine validates against that schema and emits a response of the **same major**.
- The response embeds its own version in an additive `_schema_version` field (optional; absent ⇒ "v1.0", the legacy `prediction.py` shape — preserving backward compatibility with `PredictionOracle.jsx`).
- Two majors may be served simultaneously during a deprecation window (≥ 1 release). Deprecated majors emit a `caveats[]` notice.

### 16.4 Enum evolution registry

New enum values are **append-only** within a major. The canonical list lives in §5.1 / §12.1; adding `weather`/`epidemic`/`finance` to `DomainEnum` (already done relative to `prediction.py`'s 5-value set) is the template: the SQLite `CHECK` constraint is widened via an Alembic `batch_alter_table` migration, the JSON Schema enum is extended (minor bump), and existing rows are unaffected.

### 16.5 Data-version stamping

Each `forecast` row stamps `model_versions[]` (the exact model_ids used) and the `drivers` snapshot, and links `provenance.feed_run_id` — so any forecast can be **fully reproduced** against the data and code versions of its moment, independent of later schema changes. This closes the reproducibility leg of the self-improvement loop (§2, §8).

---

## 17. ALEMBIC MIGRATION SCRIPTS — OUTLINE

§8 set the migration strategy; this is the concrete revision ladder with each revision's intent and the key `op.*` calls. All live under `alembic/pattern_oracle/` with `version_table='po_alembic_version'`. SQLite's limited `ALTER` means every column/constraint change uses `with op.batch_alter_table(...) as batch:`.

### 17.1 Revision ladder

| Rev | Slug | Depends on | Intent |
|-----|------|-----------|--------|
| `0001` | `initial_history_lake` | — | `series`, `observation`, `feed_run` + indexes (§1.3) |
| `0002` | `outcome_store` | `0001` | `forecast`, `realized_outcome`, `skill_score` + indexes (§2.2) |
| `0003` | `kgik_graph` | `0001` | `kg_node`, `kg_edge` + indexes (§3.2) |
| `0004` | `pattern_store` | `0003` | `pattern` + indexes; adds `kg_edge.pattern_id` FK (§4.3) |
| `0005` | `model_registry` | `0001` | `model_registry` + indexes (§7.2) |
| `0006` | `schema_meta` | `0001` | `schema_meta` singleton + seed `po_schema_version=6` |
| `0007` | `seed_ontology_and_models` (data) | `0003,0005` | seed `kg_node`/`kg_edge` from `ontology.js`; seed analytic `model_registry` rows |
| `0008` | `add_domains_weather_epidemic_finance` | `0002` | widen `forecast.domain` CHECK via batch mode (§16.4) |

### 17.2 `0001_initial_history_lake` (skeleton)

```python
"""initial_history_lake

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None

def upgrade() -> None:
    op.create_table(
        "series",
        sa.Column("series_id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String, nullable=False),
        sa.Column("entity", sa.String, nullable=False),
        sa.Column("metric", sa.String, nullable=False),
        sa.Column("unit", sa.String, nullable=True),
        sa.Column("freq", sa.String, nullable=False, server_default="irregular"),
        sa.Column("entity_type", sa.String, nullable=True),
        sa.Column("kgik_node_id", sa.String, nullable=True),
        sa.Column("point_kind", sa.String, nullable=False, server_default="level"),
        sa.Column("tz", sa.String, nullable=False, server_default="UTC"),
        sa.Column("meta", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.CheckConstraint("freq IN ('1m','5m','15m','1h','1d','1w','1mo','irregular')", name="ck_series_freq"),
        sa.CheckConstraint("point_kind IN ('level','flow','rate','ratio','event')", name="ck_series_pointkind"),
        sa.UniqueConstraint("source","entity","metric","unit","freq", name="uq_series_natural_key"),
        sqlite_autoincrement=False,
    )
    op.create_index("ix_series_source_entity", "series", ["source","entity"])
    op.create_index("ix_series_metric", "series", ["metric"])
    op.create_index("ix_series_kgik", "series", ["kgik_node_id"])

    op.create_table(
        "observation",
        sa.Column("series_id", sa.String(36), sa.ForeignKey("series.series_id", ondelete="CASCADE"), nullable=False),
        sa.Column("ts", sa.Integer, nullable=False),
        sa.Column("value", sa.Float, nullable=False),
        sa.Column("quality", sa.String, nullable=False, server_default="ok"),
        sa.Column("feed_run_id", sa.String(36), sa.ForeignKey("feed_run.feed_run_id", ondelete="SET NULL"), nullable=True),
        sa.Column("ingested_at", sa.Integer, nullable=False),
        sa.PrimaryKeyConstraint("series_id","ts"),
        sa.CheckConstraint("quality IN ('ok','interpolated','suspect','imputed','revised')", name="ck_obs_quality"),
        sqlite_with_rowid=False,   # WITHOUT ROWID
    )
    op.create_index("ix_obs_ts", "observation", ["ts"])
    op.create_index("ix_obs_series_ts", "observation", ["series_id","ts"])

    op.create_table(
        "feed_run",
        sa.Column("feed_run_id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String, nullable=False),
        sa.Column("window_start", sa.Integer, nullable=True),
        sa.Column("window_end", sa.Integer, nullable=True),
        sa.Column("started_at", sa.Integer, nullable=False),
        sa.Column("finished_at", sa.Integer, nullable=True),
        sa.Column("status", sa.String, nullable=False, server_default="running"),
        sa.Column("series_touched", sa.Integer, nullable=False, server_default="0"),
        sa.Column("rows_written", sa.Integer, nullable=False, server_default="0"),
        sa.Column("rows_revised", sa.Integer, nullable=False, server_default="0"),
        sa.Column("http_status", sa.Integer, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("meta", sa.JSON, nullable=False, server_default="{}"),
        sa.CheckConstraint("status IN ('running','ok','partial','error','rate_limited','cache_hit')", name="ck_feedrun_status"),
    )
    op.create_index("ix_feedrun_source_started", "feed_run", ["source","started_at"])
    op.create_index("ix_feedrun_status", "feed_run", ["status"])

def downgrade() -> None:
    op.drop_table("observation")
    op.drop_table("feed_run")
    op.drop_table("series")
```

### 17.3 `0008_add_domains_…` (batch-mode CHECK widening — the SQLite pattern)

```python
def upgrade() -> None:
    with op.batch_alter_table("forecast", recreate="always") as batch:
        batch.create_check_constraint(
            "ck_forecast_domain",
            "domain IN ('crypto','seismic','trajectory','growth','weather','epidemic','finance','generic')",
        )

def downgrade() -> None:
    with op.batch_alter_table("forecast", recreate="always") as batch:
        batch.create_check_constraint(
            "ck_forecast_domain",
            "domain IN ('crypto','seismic','trajectory','growth','generic')",
        )
```

`recreate="always"` forces Alembic's batch copy-and-swap (SQLite cannot alter a CHECK in place). The data migration `0007` uses bulk `op.bulk_insert(...)` for the ontology seed and the analytic model rows (`gbm-mc@1.0`, `holt@1.0`, `gutenberg-richter@1.0`, `omori@1.0`, `great-circle@1.0`, `growth-exp-logistic@1.0`, `climatology@1.0`).

### 17.4 Autogenerate & round-trip guard

`alembic revision --autogenerate` diffs the SQLAlchemy metadata (`pattern_oracle_models.py`) against the DB; a CI test asserts that, after `upgrade head`, `Base.metadata` produces a **clean** autogenerate diff (no pending changes) and that `Base.metadata.create_all(fresh_engine)` yields a schema identical to the migrated one (acceptance §16.6). `down_revision`/`downgrade()` are implemented for every revision so the ladder is fully reversible in tests.

---

## 18. WORKED EXAMPLE RECORDS (one valid instance per table)

Concrete instances that validate against the §12 schemas — usable directly as test fixtures and as the canonical "what a row looks like" reference.

```json
// series
{ "series_id":"7b2a1f04-3c9e-4a11-8e2d-1f0a9b3c2d44", "source":"coingecko",
  "entity":"ripple", "metric":"close_price", "unit":"USD", "freq":"1d",
  "entity_type":"asset", "kgik_node_id":"xrp", "point_kind":"level",
  "tz":"UTC", "meta":{"coin_id":"ripple"}, "active":true,
  "created_at":"2026-06-04T09:00:00Z", "updated_at":"2026-06-04T09:00:00Z" }

// observation
{ "series_id":"7b2a1f04-3c9e-4a11-8e2d-1f0a9b3c2d44", "ts":1749027600000,
  "value":0.5213, "quality":"ok",
  "feed_run_id":"c9100c2e-7b6a-4d33-9f01-22aa55bb88cc", "ingested_at":1749031200000 }

// feed_run
{ "feed_run_id":"c9100c2e-7b6a-4d33-9f01-22aa55bb88cc", "source":"coingecko",
  "window_start":1746349200000, "window_end":1749027600000,
  "started_at":1749031200000, "finished_at":1749031203120, "status":"ok",
  "series_touched":1, "rows_written":90, "rows_revised":0,
  "http_status":200, "latency_ms":3120, "error":null, "meta":{"vs_currency":"usd","days":"90"} }

// forecast
{ "id":"f12e6a5b-0d44-4c2a-9b88-7e33aa1100ff", "question":"Where will XRP be in 48h?",
  "domain":"crypto", "target":"ripple",
  "series_id":"7b2a1f04-3c9e-4a11-8e2d-1f0a9b3c2d44", "horizon":"48h", "horizon_s":172800,
  "issued_ts":1749027600000, "due_ts":1749200400000, "point":0.547,
  "low":0.41, "high":0.69, "confidence":0.90, "probability":0.62, "unit":"USD",
  "method":"GBM Monte-Carlo + Holt blend", "family":"time_series",
  "model_versions":["gbm-mc@1.0","holt@1.0"],
  "drivers":{"p0":0.5213,"drift_per_step":0.001,"volatility_per_step":0.04},
  "point_vec":null, "climatology":{"mean":0.51,"std":0.06}, "used_llm":false,
  "scored":false, "created_at":"2026-06-04T09:00:00Z" }

// realized_outcome
{ "forecast_id":"f12e6a5b-0d44-4c2a-9b88-7e33aa1100ff", "realized_ts":1749200500000,
  "actual_value":0.531, "actual_bool":null, "actual_vec":null,
  "source":"auto", "lag_s":100, "created_at":"2026-06-06T09:00:00Z" }

// skill_score
{ "id":"5e44b7c1-22aa-4f90-8c3d-99bb00112233", "forecast_id":"f12e6a5b-0d44-4c2a-9b88-7e33aa1100ff",
  "crps":0.031, "rmse":0.016, "abs_err":0.016, "pct_err":0.030, "in_interval":true,
  "pinball_low":0.004, "pinball_high":0.006, "brier":null, "log_loss":null,
  "skill_vs_climatology":0.22, "baseline_score":0.040,
  "scored_ts":1749200600000, "created_at":"2026-06-06T09:00:00Z" }

// kg_node
{ "id":"psg", "label":"PSG", "type":"org", "props":{"league":"Ligue 1"},
  "version":1, "valid_from":1749000000000, "valid_to":null, "confidence":1.0,
  "learned":false, "created_at":"2026-06-04T09:00:00Z", "updated_at":"2026-06-04T09:00:00Z" }

// kg_edge
{ "id":"e7790a11-44bc-4d22-9a01-5566ee778899", "a":"sam", "b":"psg",
  "relation":"CONTROLS 50%", "strength":2.0, "directed":true, "learned":false,
  "evidence_count":0, "last_confirmed_ts":null, "confidence":1.0, "pattern_id":null,
  "version":1, "valid_from":1749000000000, "valid_to":null,
  "created_at":"2026-06-04T09:00:00Z", "updated_at":"2026-06-04T09:00:00Z" }

// pattern (lead_lag)
{ "id":"p33ad901-7c2e-4b55-8e11-0099aa334455", "kind":"lead_lag",
  "series_id":"7b2a1f04-3c9e-4a11-8e2d-1f0a9b3c2d44",
  "series_id_b":"9cd0a2b1-1122-4333-8e44-aabbccddeeff",
  "window_start":1746349200000, "window_end":1749027600000,
  "strength":0.71, "p_value":0.003, "confidence":0.62,
  "params":{"lag_s":3600,"corr":0.71,"direction":"a_leads_b"},
  "method":"windowed_ccf", "method_params":{"max_lag_s":86400},
  "feed_run_id":"c9100c2e-7b6a-4d33-9f01-22aa55bb88cc", "code_version":"a1b2c3d",
  "evidence_count":4, "last_seen_ts":1749027600000, "promoted_edge_id":null,
  "status":"active", "created_at":"2026-06-04T09:00:00Z", "updated_at":"2026-06-04T09:00:00Z" }

// model_registry
{ "model_id":"gbm-mc@1.0", "family":"gbm_mc", "name":"GBM Monte-Carlo + Holt",
  "version":"1.0", "trained_ts":null,
  "train_window":null, "metrics":{"crps":0.030,"coverage":0.91},
  "artifact_uri":"builtin:", "artifact_sha":null,
  "params":{"n_paths":10000,"alpha":0.3,"beta":0.1}, "domains":["crypto","generic"],
  "status":"production", "code_version":"a1b2c3d",
  "created_at":"2026-06-04T09:00:00Z", "updated_at":"2026-06-04T09:00:00Z" }
```

---

## 19. ACCEPTANCE CRITERIA (for this section)

1. Running the §1–§4,§7 DDL on a fresh SQLite file creates all tables, indexes, and constraints with `PRAGMA foreign_keys=ON` and no errors.
2. The dict returned by `server/services/prediction.py::predict()` (including the `_insufficient()` shape) **validates** against the §5.3 response schema unchanged.
3. A round-trip — issue forecast → write `forecast` → simulate horizon → write `realized_outcome` → compute `skill_score` — produces a non-null `skill_vs_climatology` against the seeded `climatology@1.0` baseline.
4. The two reference adapters (`coingecko`, `usgs`) refactored onto the §6 contract write `series`+`observation`+`feed_run` rows that are byte-identical on re-fetch (idempotency).
5. Seeding `OBJECTS`/`LINKS` from `src/domain/ontology.js` into `kg_node`/`kg_edge` reproduces the current graph (every existing node/edge present, `learned=0`, `confidence=1.0`).
6. Alembic `upgrade head` on an empty DB and `Base.metadata.create_all` produce schemas that diff clean.
