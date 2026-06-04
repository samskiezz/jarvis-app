"""HISTORY LAKE — the PATTERN ORACLE persistent, self-improving CORE (P0).

A SQLite-backed (stdlib ``sqlite3``, no ORM) store that is the engine's memory
of the world and of its own forecasts. It implements a simplified-but-faithful
subset of the §05 data model:

  * ``series``           — series catalog / dimension table.
  * ``observation``      — the time-series fact table (one (series_id, ts) point).
  * ``feed_run``         — ingestion audit trail (one row per adapter fetch).
  * ``forecast``         — one row per issued prediction.
  * ``realized_outcome`` — the actual value once a forecast's horizon elapses.
  * ``skill_score``      — the scorecard (abs/sq error, coverage, skill) per forecast.

Design rules (P0 doctrine):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``) and idempotent writes
    (``INSERT ... ON CONFLICT ... DO UPDATE``) so re-ingesting overlapping
    windows never duplicates rows.
  * never raise on normal use — every public function degrades gracefully and
    returns a sensible empty/zero value on error, mirroring the rest of the
    backend (``prediction.py``/``live_intel.py``).

DB path comes from the env var ``HISTORY_LAKE_DB`` (default
``server/data/history_lake.db``). The on-disk default lives under the existing
``server/data/`` directory; tests pass an explicit temp path / ``:memory:``.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import time
import uuid
from typing import Any, Callable, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "history_lake.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``HISTORY_LAKE_DB``
    (or pass ``db_path=`` explicitly) before the first connection."""
    return os.environ.get("HISTORY_LAKE_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS series (
    series_id  TEXT    PRIMARY KEY,
    source     TEXT    NOT NULL,
    entity     TEXT    NOT NULL,
    metric     TEXT    NOT NULL,
    unit       TEXT,
    freq       TEXT    NOT NULL DEFAULT 'irregular',
    created_ts INTEGER NOT NULL,
    UNIQUE (source, entity, metric, unit, freq)
);

CREATE TABLE IF NOT EXISTS observation (
    series_id TEXT    NOT NULL REFERENCES series(series_id) ON DELETE CASCADE,
    ts        INTEGER NOT NULL,
    value     REAL    NOT NULL,
    quality   TEXT    NOT NULL DEFAULT 'ok',
    PRIMARY KEY (series_id, ts)
);
CREATE INDEX IF NOT EXISTS ix_obs_series_ts ON observation (series_id, ts);

CREATE TABLE IF NOT EXISTS feed_run (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT    NOT NULL,
    started_ts INTEGER NOT NULL,
    ended_ts   INTEGER,
    n_rows     INTEGER NOT NULL DEFAULT 0,
    status     TEXT    NOT NULL DEFAULT 'running',
    note       TEXT
);
CREATE INDEX IF NOT EXISTS ix_feedrun_source ON feed_run (source, started_ts);

CREATE TABLE IF NOT EXISTS forecast (
    id           TEXT    PRIMARY KEY,
    question     TEXT,
    domain       TEXT,
    target       TEXT,
    horizon      REAL,
    issued_ts    INTEGER NOT NULL,
    point        REAL,
    low          REAL,
    high         REAL,
    confidence   REAL,
    probability  REAL,
    method       TEXT,
    drivers_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_forecast_domain ON forecast (domain);
CREATE INDEX IF NOT EXISTS ix_forecast_issued ON forecast (issued_ts);

CREATE TABLE IF NOT EXISTS realized_outcome (
    forecast_id  TEXT    PRIMARY KEY REFERENCES forecast(id) ON DELETE CASCADE,
    realized_ts  INTEGER NOT NULL,
    actual_value REAL
);

CREATE TABLE IF NOT EXISTS skill_score (
    forecast_id      TEXT    PRIMARY KEY REFERENCES forecast(id) ON DELETE CASCADE,
    abs_err          REAL,
    sq_err           REAL,
    in_interval      INTEGER,
    skill_vs_baseline REAL,
    scored_ts        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_skill_scored ON skill_score (scored_ts);
"""


# ── Connection management ────────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection with WAL + foreign keys. ``check_same_thread=False`` so
    the FastAPI threadpool/asyncio loop can share it; writes are short and
    serialized by SQLite's single-writer lock."""
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create all tables/indexes if absent. Idempotent — safe to call on every
    import / app start. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── series + observations ────────────────────────────────────────────────────────
def _series_id(source: str, entity: str, metric: str, unit: Optional[str], freq: str) -> str:
    """Deterministic series id from the natural key, so repeated ingests resolve
    to the same series without a lookup race."""
    key = f"{source}|{entity}|{metric}|{unit or ''}|{freq}"
    return uuid.uuid5(uuid.NAMESPACE_URL, key).hex


def upsert_series(
    source: str,
    entity: str,
    metric: str,
    *,
    unit: Optional[str] = None,
    freq: str = "irregular",
    db_path: Optional[str] = None,
) -> str:
    """Create (or fetch) a series row for the natural key
    ``(source, entity, metric, unit, freq)``. Returns the ``series_id``.
    Idempotent: repeated calls return the same id and do not duplicate."""
    sid = _series_id(source, entity, metric, unit, freq)
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO series (series_id, source, entity, metric, unit, freq, created_ts)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(source, entity, metric, unit, freq) DO NOTHING
                """,
                (sid, source, entity, metric, unit, freq, _now_ms()),
            )
            conn.commit()
            # Resolve the canonical id (handles a pre-existing row from a prior run).
            row = conn.execute(
                """
                SELECT series_id FROM series
                WHERE source=? AND entity=? AND metric=? AND IFNULL(unit,'')=IFNULL(?,'') AND freq=?
                """,
                (source, entity, metric, unit, freq),
            ).fetchone()
            return row["series_id"] if row else sid
        finally:
            conn.close()
    except sqlite3.Error:
        return sid


def write_observations(
    series_id: str,
    points: list[dict],
    *,
    db_path: Optional[str] = None,
) -> int:
    """Upsert observation points for a series. ``points`` is a list of
    ``{"t": epoch_ms, "v": value, "quality"?: str}`` (also accepts ``ts``/``value``).
    Returns the number of rows written/updated. Idempotent on (series_id, ts)."""
    if not series_id or not points:
        return 0
    rows: list[tuple] = []
    for p in points:
        try:
            ts = p.get("t", p.get("ts"))
            val = p.get("v", p.get("value"))
            if ts is None or val is None:
                continue
            v = float(val)
            if not math.isfinite(v):
                continue
            rows.append((series_id, int(ts), v, str(p.get("quality", "ok"))))
        except (TypeError, ValueError):
            continue
    if not rows:
        return 0
    try:
        conn = _connect(db_path)
        try:
            conn.executemany(
                """
                INSERT INTO observation (series_id, ts, value, quality)
                VALUES (?,?,?,?)
                ON CONFLICT(series_id, ts) DO UPDATE SET
                    value   = excluded.value,
                    quality = excluded.quality
                """,
                rows,
            )
            conn.commit()
            return len(rows)
        finally:
            conn.close()
    except sqlite3.Error:
        return 0


def read_series(
    series_id: str,
    *,
    since: Optional[int] = None,
    limit: Optional[int] = None,
    db_path: Optional[str] = None,
) -> list[dict]:
    """Return observations for a series as ``[{"t": ms, "v": float, "quality": str}, ...]``
    ordered ascending by ts. ``since`` filters ts >= since; ``limit`` caps rows
    (returns the most-recent ``limit`` rows, still ascending)."""
    try:
        conn = _connect(db_path)
        try:
            q = "SELECT ts, value, quality FROM observation WHERE series_id=?"
            args: list[Any] = [series_id]
            if since is not None:
                q += " AND ts >= ?"
                args.append(int(since))
            if limit is not None:
                # newest `limit` rows, re-sorted ascending
                q += " ORDER BY ts DESC LIMIT ?"
                args.append(int(limit))
                rows = conn.execute(q, args).fetchall()
                rows = list(reversed(rows))
            else:
                q += " ORDER BY ts ASC"
                rows = conn.execute(q, args).fetchall()
            return [{"t": r["ts"], "v": r["value"], "quality": r["quality"]} for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def list_series(db_path: Optional[str] = None) -> list[dict]:
    """List the series catalog with a per-series observation count + ts bounds."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                """
                SELECT s.series_id, s.source, s.entity, s.metric, s.unit, s.freq,
                       s.created_ts,
                       COUNT(o.ts) AS n_obs,
                       MIN(o.ts)   AS first_ts,
                       MAX(o.ts)   AS last_ts
                FROM series s
                LEFT JOIN observation o ON o.series_id = s.series_id
                GROUP BY s.series_id
                ORDER BY s.source, s.entity, s.metric
                """
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── feed_run audit ───────────────────────────────────────────────────────────────
def start_feed_run(source: str, *, db_path: Optional[str] = None) -> Optional[int]:
    """Open a feed_run row (status='running'). Returns its id or None on error."""
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                "INSERT INTO feed_run (source, started_ts, status) VALUES (?,?, 'running')",
                (source, _now_ms()),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def finish_feed_run(
    run_id: Optional[int],
    *,
    status: str,
    n_rows: int = 0,
    note: Optional[str] = None,
    db_path: Optional[str] = None,
) -> None:
    """Close a feed_run row with a terminal status ('ok'|'error'|'partial')."""
    if run_id is None:
        return
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE feed_run SET ended_ts=?, n_rows=?, status=?, note=? WHERE id=?",
                (_now_ms(), int(n_rows), status, (note or "")[:500], int(run_id)),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def list_feed_runs(limit: int = 50, db_path: Optional[str] = None) -> list[dict]:
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM feed_run ORDER BY id DESC LIMIT ?", (int(limit),)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── forecast / outcome / skill ───────────────────────────────────────────────────
def record_forecast(
    *,
    question: Optional[str] = None,
    domain: Optional[str] = None,
    target: Optional[str] = None,
    horizon: Optional[float] = None,
    point: Optional[float] = None,
    low: Optional[float] = None,
    high: Optional[float] = None,
    confidence: Optional[float] = None,
    probability: Optional[float] = None,
    method: Optional[str] = None,
    drivers: Optional[dict] = None,
    issued_ts: Optional[int] = None,
    forecast_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> Optional[str]:
    """Persist one issued forecast. ``horizon`` is in hours (the machine-usable
    horizon). Returns the forecast id (uuid4 if not supplied) or None on error.
    Fire-and-forget friendly — never raises."""
    fid = forecast_id or uuid.uuid4().hex
    try:
        drivers_json = json.dumps(drivers or {}, default=str)
    except (TypeError, ValueError):
        drivers_json = "{}"
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO forecast
                    (id, question, domain, target, horizon, issued_ts, point, low, high,
                     confidence, probability, method, drivers_json)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    question=excluded.question, domain=excluded.domain,
                    target=excluded.target, horizon=excluded.horizon,
                    point=excluded.point, low=excluded.low, high=excluded.high,
                    confidence=excluded.confidence, probability=excluded.probability,
                    method=excluded.method, drivers_json=excluded.drivers_json
                """,
                (
                    fid, question, domain, target,
                    float(horizon) if horizon is not None else None,
                    int(issued_ts) if issued_ts is not None else _now_ms(),
                    point, low, high, confidence, probability, method, drivers_json,
                ),
            )
            conn.commit()
            return fid
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def record_outcome(
    forecast_id: str,
    actual: float,
    realized_ts: Optional[int] = None,
    *,
    db_path: Optional[str] = None,
) -> bool:
    """Record the realized actual value for a forecast. Idempotent (upsert on
    forecast_id). Returns True on success."""
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO realized_outcome (forecast_id, realized_ts, actual_value)
                VALUES (?,?,?)
                ON CONFLICT(forecast_id) DO UPDATE SET
                    realized_ts=excluded.realized_ts,
                    actual_value=excluded.actual_value
                """,
                (forecast_id, int(realized_ts) if realized_ts is not None else _now_ms(), float(actual)),
            )
            conn.commit()
            return True
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return False


def _write_skill(
    conn: sqlite3.Connection,
    forecast_id: str,
    *,
    point: Optional[float],
    low: Optional[float],
    high: Optional[float],
    actual: float,
    baseline: Optional[float],
    scored_ts: int,
) -> None:
    abs_err = sq_err = None
    if point is not None:
        abs_err = abs(point - actual)
        sq_err = (point - actual) ** 2
    in_interval: Optional[int] = None
    if low is not None and high is not None:
        in_interval = 1 if (low <= actual <= high) else 0
    skill = None
    if baseline is not None and abs_err is not None:
        base_err = abs(baseline - actual)
        if base_err > 0:
            skill = 1.0 - (abs_err / base_err)
        elif abs_err == 0:
            skill = 0.0
    conn.execute(
        """
        INSERT INTO skill_score
            (forecast_id, abs_err, sq_err, in_interval, skill_vs_baseline, scored_ts)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(forecast_id) DO UPDATE SET
            abs_err=excluded.abs_err, sq_err=excluded.sq_err,
            in_interval=excluded.in_interval,
            skill_vs_baseline=excluded.skill_vs_baseline,
            scored_ts=excluded.scored_ts
        """,
        (forecast_id, abs_err, sq_err, in_interval, skill, scored_ts),
    )


def score_due_forecasts(
    now: int,
    resolver: Callable[[dict], Optional[float]],
    *,
    db_path: Optional[str] = None,
) -> int:
    """Score every forecast whose horizon has elapsed and that is not yet scored.

    A forecast is *due* when ``issued_ts + horizon_hours*3600_000 <= now``. For
    each due forecast the ``resolver(forecast_row_dict)`` callback is invoked to
    fetch the realized actual value (e.g. by reading the History Lake series at
    the due time); returning ``None`` skips that forecast (try again later).

    On a realized value we write a ``realized_outcome`` row and a ``skill_score``
    row (abs_err, sq_err, in_interval, skill_vs_baseline). ``baseline`` for the
    skill score is the forecast's ``drivers_json["baseline"]`` if present (else
    skill is left NULL). Returns the number of forecasts newly scored.
    """
    scored = 0
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                """
                SELECT f.* FROM forecast f
                LEFT JOIN skill_score s ON s.forecast_id = f.id
                WHERE s.forecast_id IS NULL
                  AND f.issued_ts + COALESCE(f.horizon, 0) * 3600000 <= ?
                """,
                (int(now),),
            ).fetchall()
            for r in rows:
                fr = dict(r)
                try:
                    actual = resolver(fr)
                except Exception:  # noqa: BLE001 - a bad resolver must not abort the loop
                    actual = None
                if actual is None:
                    continue
                try:
                    actual = float(actual)
                except (TypeError, ValueError):
                    continue
                baseline = None
                try:
                    drivers = json.loads(fr.get("drivers_json") or "{}")
                    if isinstance(drivers, dict) and drivers.get("baseline") is not None:
                        baseline = float(drivers["baseline"])
                except (TypeError, ValueError):
                    baseline = None
                conn.execute(
                    """
                    INSERT INTO realized_outcome (forecast_id, realized_ts, actual_value)
                    VALUES (?,?,?)
                    ON CONFLICT(forecast_id) DO UPDATE SET
                        realized_ts=excluded.realized_ts, actual_value=excluded.actual_value
                    """,
                    (fr["id"], int(now), actual),
                )
                _write_skill(
                    conn, fr["id"],
                    point=fr.get("point"), low=fr.get("low"), high=fr.get("high"),
                    actual=actual, baseline=baseline, scored_ts=int(now),
                )
                scored += 1
            conn.commit()
            return scored
        finally:
            conn.close()
    except sqlite3.Error:
        return scored


def skill_summary(domain: Optional[str] = None, *, db_path: Optional[str] = None) -> dict:
    """Rolling aggregate skill metrics over scored forecasts, optionally filtered
    by ``domain``. Returns MAE, RMSE, interval coverage, mean skill-vs-baseline,
    and the count of scored forecasts. Empty store → zeros / None."""
    empty = {
        "domain": domain,
        "n_scored": 0,
        "mae": None,
        "rmse": None,
        "coverage": None,
        "mean_skill_vs_baseline": None,
    }
    try:
        conn = _connect(db_path)
        try:
            q = """
                SELECT
                    COUNT(*)                              AS n,
                    AVG(s.abs_err)                        AS mae,
                    AVG(s.sq_err)                         AS mse,
                    AVG(CAST(s.in_interval AS REAL))      AS coverage,
                    AVG(s.skill_vs_baseline)              AS mean_skill
                FROM skill_score s
                JOIN forecast f ON f.id = s.forecast_id
            """
            args: list[Any] = []
            if domain is not None:
                q += " WHERE f.domain = ?"
                args.append(domain)
            row = conn.execute(q, args).fetchone()
            if not row or not row["n"]:
                return empty
            mse = row["mse"]
            return {
                "domain": domain,
                "n_scored": int(row["n"]),
                "mae": float(row["mae"]) if row["mae"] is not None else None,
                "rmse": float(math.sqrt(mse)) if mse is not None else None,
                "coverage": float(row["coverage"]) if row["coverage"] is not None else None,
                "mean_skill_vs_baseline": float(row["mean_skill"]) if row["mean_skill"] is not None else None,
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return empty


# Bootstrap the default DB on import so the first request/ingest finds the tables.
# Guarded so a read-only / missing-dir environment never breaks import.
init_db()
