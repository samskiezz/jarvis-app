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

## 10. ACCEPTANCE CRITERIA (for this section)

1. Running the §1–§4,§7 DDL on a fresh SQLite file creates all tables, indexes, and constraints with `PRAGMA foreign_keys=ON` and no errors.
2. The dict returned by `server/services/prediction.py::predict()` (including the `_insufficient()` shape) **validates** against the §5.3 response schema unchanged.
3. A round-trip — issue forecast → write `forecast` → simulate horizon → write `realized_outcome` → compute `skill_score` — produces a non-null `skill_vs_climatology` against the seeded `climatology@1.0` baseline.
4. The two reference adapters (`coingecko`, `usgs`) refactored onto the §6 contract write `series`+`observation`+`feed_run` rows that are byte-identical on re-fetch (idempotency).
5. Seeding `OBJECTS`/`LINKS` from `src/domain/ontology.js` into `kg_node`/`kg_edge` reproduces the current graph (every existing node/edge present, `learned=0`, `confidence=1.0`).
6. Alembic `upgrade head` on an empty DB and `Base.metadata.create_all` produce schemas that diff clean.
