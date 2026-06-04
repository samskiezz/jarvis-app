"""DATA-INTEGRATION layer — Foundry-style connectors / catalog / transforms /
lineage on top of the History Lake (P0).

This module is a thin *integration plane* layered over the existing History Lake
(``history_lake`` series/observation store) plus a tiny side-car catalog DB:

  * **connectors()** — the menu of source connectors (coingecko, usgs, fx,
    cryptocompare, yahoo, csv, http-json) with a descriptive params schema. The
    crypto/usgs/fx connectors delegate to the existing ingestion adapters; the
    generic ``http-json`` / ``csv`` connectors do a stdlib fetch into a new series.
  * **dataset catalog** — ``register_dataset`` / ``list_datasets`` /
    ``dataset_health`` map a friendly *dataset* name onto a History Lake series and
    report counts / freshness / null-rate computed from observations.
  * **run_connector** — ingest via the matching adapter (or a generic fetch) and
    record a ``pipeline_run`` audit row. This is the *only* place that may touch
    the network, and it is fully offline-tolerant.
  * **transform** — a couple of safe declarative transforms (resample,
    rolling_mean, pct_change) producing a *derived* History Lake series and a
    ``lineage`` edge (output <- input + op).
  * **lineage** — the provenance graph (edges) for a dataset.

Doctrine (mirrors history_lake / ingestion):
  * stdlib ``sqlite3`` + ``numpy`` only — no new dependency for the catalog.
  * idempotent DDL + idempotent writes; never raise on normal use — every public
    function degrades gracefully and returns a sensible empty/zero value.
  * the History Lake store is *reused*, never duplicated — derived series are
    ordinary History Lake series written via ``write_observations``.

Catalog DB path comes from env ``CATALOG_DB`` (default
``server/data/catalog.db``). Tests pass a temp path via the env var.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

import numpy as np

from . import history_lake as lake

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_CATALOG_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "catalog.db"
)


def _catalog_db_path() -> str:
    """Resolve the catalog DB path at call-time so tests can set ``CATALOG_DB``."""
    return os.environ.get("CATALOG_DB", _DEFAULT_CATALOG_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── catalog schema (idempotent) ─────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS dataset (
    name        TEXT    PRIMARY KEY,
    source      TEXT    NOT NULL,
    series_id   TEXT,
    schema_json TEXT    NOT NULL DEFAULT '{}',
    owner       TEXT,
    created_ts  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_run (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    connector   TEXT    NOT NULL,
    params_json TEXT    NOT NULL DEFAULT '{}',
    started_ts  INTEGER NOT NULL,
    ended_ts    INTEGER,
    n_rows      INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'running',
    dataset     TEXT,
    note        TEXT
);
CREATE INDEX IF NOT EXISTS ix_prun_connector ON pipeline_run (connector, started_ts);

CREATE TABLE IF NOT EXISTS lineage (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output      TEXT    NOT NULL,
    input       TEXT    NOT NULL,
    op          TEXT    NOT NULL,
    params_json TEXT    NOT NULL DEFAULT '{}',
    created_ts  INTEGER NOT NULL,
    UNIQUE (output, input, op)
);
CREATE INDEX IF NOT EXISTS ix_lineage_output ON lineage (output);
CREATE INDEX IF NOT EXISTS ix_lineage_input  ON lineage (input);
"""


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a catalog connection (WAL where possible). Mirrors history_lake."""
    path = db_path or _catalog_db_path()
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
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create catalog tables if absent. Idempotent; never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── connectors menu ──────────────────────────────────────────────────────────────
# Each connector advertises a descriptive params schema. ``adapter`` flags which
# connectors reuse an existing ingestion adapter; ``network`` flags ones that hit
# the network (only relevant inside run_connector, which is offline-tolerant).
_CONNECTORS: list[dict] = [
    {
        "connector": "coingecko",
        "kind": "crypto",
        "adapter": "ingest_crypto",
        "network": True,
        "description": "CoinGecko daily close-price series per asset.",
        "params": {
            "assets": {"type": "list[str]", "required": False,
                       "default": ["bitcoin", "ethereum", "ripple", "solana"],
                       "description": "CoinGecko asset ids."},
            "days": {"type": "int", "required": False, "default": 90,
                     "description": "History window in days."},
        },
    },
    {
        "connector": "usgs",
        "kind": "seismic",
        "adapter": "ingest_seismic",
        "network": True,
        "description": "USGS earthquake catalog -> daily event-count + max-magnitude series.",
        "params": {
            "days": {"type": "float", "required": False, "default": 30.0,
                     "description": "Catalog window in days."},
            "min_magnitude": {"type": "float", "required": False, "default": 2.5,
                              "description": "Minimum magnitude filter."},
        },
    },
    {
        "connector": "fx",
        "kind": "fx",
        "adapter": "ingest_fx",
        "network": True,
        "description": "open.er-api.com FX snapshot (base AUD) -> one obs per pair.",
        "params": {
            "pairs": {"type": "list[str]", "required": False,
                      "default": ["USD", "EUR", "GBP", "JPY", "AED", "NZD"],
                      "description": "Quote currencies per 1 AUD."},
        },
    },
    {
        "connector": "cryptocompare",
        "kind": "crypto",
        "adapter": None,
        "network": True,
        "description": "CryptoCompare daily histo close price (generic http-json under the hood).",
        "params": {
            "fsym": {"type": "str", "required": True, "description": "From-symbol e.g. BTC."},
            "tsym": {"type": "str", "required": False, "default": "USD",
                     "description": "To-symbol e.g. USD."},
            "limit": {"type": "int", "required": False, "default": 90,
                      "description": "Number of daily points."},
        },
    },
    {
        "connector": "yahoo",
        "kind": "equity",
        "adapter": None,
        "network": True,
        "description": "Yahoo Finance chart API daily close for a ticker.",
        "params": {
            "symbol": {"type": "str", "required": True, "description": "Ticker e.g. AAPL."},
            "range": {"type": "str", "required": False, "default": "3mo",
                      "description": "Yahoo range token e.g. 1mo/3mo/1y."},
            "interval": {"type": "str", "required": False, "default": "1d",
                         "description": "Bar interval e.g. 1d/1wk."},
        },
    },
    {
        "connector": "http-json",
        "kind": "generic",
        "adapter": None,
        "network": True,
        "description": "Generic JSON fetch: pull a list of {t,v} (or via t_path/v_path) into a new series.",
        "params": {
            "url": {"type": "str", "required": True, "description": "HTTP(S) URL returning JSON."},
            "entity": {"type": "str", "required": False, "default": "custom",
                       "description": "Series entity label."},
            "metric": {"type": "str", "required": False, "default": "value",
                       "description": "Series metric label."},
            "records_path": {"type": "str", "required": False,
                             "description": "Dotted path to the list of records in the payload."},
            "t_key": {"type": "str", "required": False, "default": "t",
                      "description": "Key holding the epoch-ms timestamp in each record."},
            "v_key": {"type": "str", "required": False, "default": "v",
                      "description": "Key holding the numeric value in each record."},
        },
    },
    {
        "connector": "csv",
        "kind": "generic",
        "adapter": None,
        "network": True,
        "description": "Generic CSV fetch/parse: two columns (ts,value) -> a new series.",
        "params": {
            "url": {"type": "str", "required": False,
                    "description": "HTTP(S) URL of the CSV (omit if 'text' supplied)."},
            "text": {"type": "str", "required": False,
                     "description": "Inline CSV text (offline path; takes precedence over url)."},
            "entity": {"type": "str", "required": False, "default": "custom",
                       "description": "Series entity label."},
            "metric": {"type": "str", "required": False, "default": "value",
                       "description": "Series metric label."},
            "ts_col": {"type": "int", "required": False, "default": 0,
                       "description": "Column index of the epoch-ms timestamp."},
            "value_col": {"type": "int", "required": False, "default": 1,
                          "description": "Column index of the numeric value."},
            "has_header": {"type": "bool", "required": False, "default": True,
                           "description": "Skip the first row as a header."},
        },
    },
]

# Supported declarative transforms (advertised so callers can discover them).
TRANSFORMS: list[dict] = [
    {"op": "resample", "description": "Bucket observations to a fixed period (ms) using mean.",
     "params": {"period_ms": {"type": "int", "required": True,
                              "description": "Bucket width in milliseconds."}}},
    {"op": "rolling_mean", "description": "Centred-trailing simple moving average.",
     "params": {"window": {"type": "int", "required": True,
                          "description": "Number of points in the window."}}},
    {"op": "pct_change", "description": "Period-over-period percent change (fraction).",
     "params": {"periods": {"type": "int", "required": False, "default": 1,
                           "description": "Lag in points."}}},
]


def connectors() -> list[dict]:
    """Return the menu of available source connectors with their params schema.

    A copy is returned so callers cannot mutate the module-level registry."""
    return json.loads(json.dumps(_CONNECTORS))


def _connector_spec(name: str) -> Optional[dict]:
    for c in _CONNECTORS:
        if c["connector"] == name:
            return c
    return None


# ── dataset catalog ──────────────────────────────────────────────────────────────
def register_dataset(
    name: str,
    source: str,
    schema: Optional[dict] = None,
    owner: Optional[str] = None,
    *,
    series_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Register (or update) a dataset in the catalog.

    ``name`` is the friendly key; ``source`` is the originating connector/source;
    ``schema`` is a free-form descriptive dict (columns/units/etc.); ``owner`` is
    a free-form owner label. ``series_id`` optionally binds the dataset to an
    existing History Lake series (so ``dataset_health``/transforms can resolve
    observations). Idempotent upsert on ``name``. Never raises."""
    if not name:
        return {"ok": False, "error": "name required"}
    init_db(db_path)
    try:
        schema_json = json.dumps(schema or {}, default=str)
    except (TypeError, ValueError):
        schema_json = "{}"
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO dataset (name, source, series_id, schema_json, owner, created_ts)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                    source=excluded.source,
                    series_id=COALESCE(excluded.series_id, dataset.series_id),
                    schema_json=excluded.schema_json,
                    owner=excluded.owner
                """,
                (name, source, series_id, schema_json, owner, _now_ms()),
            )
            conn.commit()
        finally:
            conn.close()
        return {"ok": True, "name": name, "source": source,
                "series_id": series_id, "owner": owner}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


def _row_to_dataset(row: sqlite3.Row) -> dict:
    try:
        schema = json.loads(row["schema_json"] or "{}")
    except (TypeError, ValueError):
        schema = {}
    return {
        "name": row["name"],
        "source": row["source"],
        "series_id": row["series_id"],
        "schema": schema,
        "owner": row["owner"],
        "created_ts": row["created_ts"],
    }


def get_dataset(name: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one dataset record by name (or None)."""
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT * FROM dataset WHERE name=?", (name,)
            ).fetchone()
            return _row_to_dataset(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_datasets(db_path: Optional[str] = None) -> list[dict]:
    """List the dataset catalog (most recently created first)."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM dataset ORDER BY created_ts DESC, name ASC"
            ).fetchall()
            return [_row_to_dataset(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def dataset_health(name: str, *, db_path: Optional[str] = None) -> dict:
    """Health of a dataset computed from its bound History Lake series.

    Reports row count, last_ts, freshness (ms since last_ts), and null-rate
    (fraction of observations whose value is non-finite — always 0 for a clean
    series since the lake refuses non-finite writes, but exposed for parity).
    Returns ``{"name", "found": bool, ...}``; never raises."""
    base = {
        "name": name,
        "found": False,
        "series_id": None,
        "rows": 0,
        "first_ts": None,
        "last_ts": None,
        "freshness_ms": None,
        "null_rate": None,
    }
    ds = get_dataset(name, db_path=db_path)
    if ds is None:
        return base
    base["found"] = True
    sid = ds.get("series_id")
    base["series_id"] = sid
    if not sid:
        return base
    obs = lake.read_series(sid)
    n = len(obs)
    base["rows"] = n
    if n == 0:
        base["null_rate"] = 0.0
        return base
    first_ts = obs[0]["t"]
    last_ts = obs[-1]["t"]
    base["first_ts"] = first_ts
    base["last_ts"] = last_ts
    base["freshness_ms"] = max(0, _now_ms() - int(last_ts))
    nulls = sum(1 for p in obs if p["v"] is None or not math.isfinite(float(p["v"])))
    base["null_rate"] = nulls / n
    return base


# ── pipeline_run audit ────────────────────────────────────────────────────────────
def _start_pipeline_run(
    connector: str, params: dict, *, db_path: Optional[str] = None
) -> Optional[int]:
    init_db(db_path)
    try:
        params_json = json.dumps(params or {}, default=str)
    except (TypeError, ValueError):
        params_json = "{}"
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                "INSERT INTO pipeline_run (connector, params_json, started_ts, status) "
                "VALUES (?,?,?, 'running')",
                (connector, params_json, _now_ms()),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def _finish_pipeline_run(
    run_id: Optional[int],
    *,
    status: str,
    n_rows: int = 0,
    dataset: Optional[str] = None,
    note: Optional[str] = None,
    db_path: Optional[str] = None,
) -> None:
    if run_id is None:
        return
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE pipeline_run SET ended_ts=?, n_rows=?, status=?, dataset=?, note=? "
                "WHERE id=?",
                (_now_ms(), int(n_rows), status, dataset, (note or "")[:500], int(run_id)),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def list_pipeline_runs(limit: int = 50, db_path: Optional[str] = None) -> list[dict]:
    """List recent pipeline_run audit rows (most recent first)."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM pipeline_run ORDER BY id DESC LIMIT ?", (int(limit),)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── generic fetch helpers (the ONLY network paths besides the adapters) ──────────
def _dig(obj: Any, path: Optional[str]) -> Any:
    """Follow a dotted path into nested dicts/lists. Returns obj on empty path."""
    if not path:
        return obj
    cur = obj
    for part in str(path).split("."):
        if part == "":
            continue
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return cur


def _http_get_json(url: str) -> Any:
    """Fetch a URL and parse JSON. Returns the payload or None on any failure."""
    try:
        import httpx

        resp = httpx.get(url, timeout=httpx.Timeout(15.0, connect=8.0))
        resp.raise_for_status()
        return resp.json()
    except Exception:  # noqa: BLE001 - any network/parse failure -> graceful None
        return None


def _http_get_text(url: str) -> Optional[str]:
    try:
        import httpx

        resp = httpx.get(url, timeout=httpx.Timeout(15.0, connect=8.0))
        resp.raise_for_status()
        return resp.text
    except Exception:  # noqa: BLE001
        return None


def _points_from_json(payload: Any, params: dict) -> list[dict]:
    """Extract ``[{"t":ms,"v":float}, ...]`` from a generic JSON payload."""
    records = _dig(payload, params.get("records_path"))
    if records is None and isinstance(payload, list):
        records = payload
    if not isinstance(records, list):
        return []
    t_key = params.get("t_key", "t")
    v_key = params.get("v_key", "v")
    out: list[dict] = []
    for rec in records:
        try:
            if isinstance(rec, dict):
                t = rec.get(t_key)
                v = rec.get(v_key)
            elif isinstance(rec, (list, tuple)) and len(rec) >= 2:
                t, v = rec[0], rec[1]
            else:
                continue
            if t is None or v is None:
                continue
            out.append({"t": int(t), "v": float(v)})
        except (TypeError, ValueError):
            continue
    return out


def _points_from_csv(text: str, params: dict) -> list[dict]:
    import csv as _csv
    import io

    ts_col = int(params.get("ts_col", 0))
    value_col = int(params.get("value_col", 1))
    has_header = bool(params.get("has_header", True))
    out: list[dict] = []
    try:
        reader = _csv.reader(io.StringIO(text))
        rows = list(reader)
    except Exception:  # noqa: BLE001
        return []
    if has_header and rows:
        rows = rows[1:]
    for row in rows:
        try:
            if len(row) <= max(ts_col, value_col):
                continue
            out.append({"t": int(float(row[ts_col])), "v": float(row[value_col])})
        except (TypeError, ValueError):
            continue
    return out


# ── run_connector ────────────────────────────────────────────────────────────────
def run_connector(
    connector: str, params: Optional[dict] = None, *, db_path: Optional[str] = None
) -> dict:
    """Ingest from a connector, recording a ``pipeline_run`` audit row.

    crypto/usgs/fx delegate to the existing ingestion adapters; cryptocompare /
    yahoo / http-json / csv do a generic fetch into a *new* History Lake series.
    Returns an audit dict ``{connector,status,n_rows,...}``. Network failures are
    caught and recorded (status='error'/'partial'); this function never raises."""
    params = dict(params or {})
    spec = _connector_spec(connector)
    if spec is None:
        return {"connector": connector, "status": "error", "n_rows": 0,
                "note": "unknown connector"}

    run_id = _start_pipeline_run(connector, params, db_path=db_path)
    n_rows = 0
    n_series = 0
    status = "error"
    note: Optional[str] = None
    dataset_name: Optional[str] = None
    series_id: Optional[str] = None

    try:
        if connector in ("coingecko", "usgs", "fx"):
            from . import ingestion

            if connector == "coingecko":
                res = ingestion.ingest_crypto(
                    params.get("assets"), days=int(params.get("days", 90))
                )
            elif connector == "usgs":
                res = ingestion.ingest_seismic(
                    days=float(params.get("days", 30.0)),
                    min_magnitude=float(params.get("min_magnitude", 2.5)),
                )
            else:  # fx
                res = ingestion.ingest_fx(params.get("pairs"))
            n_rows = int(res.get("n_rows", 0))
            n_series = int(res.get("n_series", 0))
            status = res.get("status", "error")
            note = res.get("note") if isinstance(res, dict) else None

        elif connector == "cryptocompare":
            fsym = str(params.get("fsym", "")).upper()
            tsym = str(params.get("tsym", "USD")).upper()
            limit = int(params.get("limit", 90))
            url = (
                "https://min-api.cryptocompare.com/data/v2/histoday"
                f"?fsym={fsym}&tsym={tsym}&limit={limit}"
            )
            payload = _http_get_json(url)
            data = (payload or {}).get("Data", {}) if isinstance(payload, dict) else {}
            rows = data.get("Data") if isinstance(data, dict) else None
            pts = []
            for r in rows or []:
                try:
                    pts.append({"t": int(r["time"]) * 1000, "v": float(r["close"])})
                except (KeyError, TypeError, ValueError):
                    continue
            series_id = lake.upsert_series(
                "cryptocompare", fsym or "unknown", "close_price", unit=tsym, freq="1d"
            )
            n_rows = lake.write_observations(series_id, pts)
            n_series = 1 if n_rows else 0
            status = "ok" if n_rows else ("partial" if payload is not None else "error")

        elif connector == "yahoo":
            symbol = str(params.get("symbol", "")).upper()
            rng = str(params.get("range", "3mo"))
            interval = str(params.get("interval", "1d"))
            url = (
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
                f"?range={rng}&interval={interval}"
            )
            payload = _http_get_json(url)
            pts = []
            try:
                result = payload["chart"]["result"][0]
                stamps = result["timestamp"]
                closes = result["indicators"]["quote"][0]["close"]
                for ts, close in zip(stamps, closes):
                    if ts is None or close is None:
                        continue
                    pts.append({"t": int(ts) * 1000, "v": float(close)})
            except (KeyError, TypeError, ValueError, IndexError):
                pts = []
            series_id = lake.upsert_series(
                "yahoo", symbol or "unknown", "close_price", unit="USD", freq=interval
            )
            n_rows = lake.write_observations(series_id, pts)
            n_series = 1 if n_rows else 0
            status = "ok" if n_rows else ("partial" if payload is not None else "error")

        elif connector == "http-json":
            url = str(params.get("url", ""))
            entity = str(params.get("entity", "custom"))
            metric = str(params.get("metric", "value"))
            payload = _http_get_json(url) if url else None
            pts = _points_from_json(payload, params) if payload is not None else []
            series_id = lake.upsert_series(
                "http-json", entity, metric, freq="irregular"
            )
            n_rows = lake.write_observations(series_id, pts)
            n_series = 1 if n_rows else 0
            status = "ok" if n_rows else ("partial" if payload is not None else "error")

        elif connector == "csv":
            entity = str(params.get("entity", "custom"))
            metric = str(params.get("metric", "value"))
            text = params.get("text")
            if text is None and params.get("url"):
                text = _http_get_text(str(params["url"]))
            pts = _points_from_csv(text, params) if text else []
            series_id = lake.upsert_series("csv", entity, metric, freq="irregular")
            n_rows = lake.write_observations(series_id, pts)
            n_series = 1 if n_rows else 0
            status = "ok" if n_rows else ("partial" if text else "error")

        # Auto-register a dataset for the new series so it shows up in the catalog.
        if series_id and n_rows:
            dataset_name = f"{connector}:{series_id[:8]}"
            register_dataset(
                dataset_name, source=connector,
                schema={"connector": connector, "metric": params.get("metric")},
                owner=str(params.get("owner") or "system"),
                series_id=series_id, db_path=db_path,
            )

    except Exception as exc:  # noqa: BLE001 - belt-and-braces: never raise
        status = "error"
        note = str(exc)

    _finish_pipeline_run(
        run_id, status=status, n_rows=n_rows, dataset=dataset_name, note=note,
        db_path=db_path,
    )
    return {
        "connector": connector,
        "status": status,
        "n_rows": n_rows,
        "n_series": n_series,
        "series_id": series_id,
        "dataset": dataset_name,
        "note": note,
    }


# ── transforms ────────────────────────────────────────────────────────────────────
def _apply_transform(
    points: list[dict], op: str, params: dict
) -> tuple[list[dict], Optional[str]]:
    """Apply a declarative op to ``[{"t","v"}, ...]`` -> (new_points, error)."""
    if not points:
        return [], "no input observations"
    ts = np.array([int(p["t"]) for p in points], dtype=np.int64)
    vals = np.array([float(p["v"]) for p in points], dtype=np.float64)

    if op == "resample":
        try:
            period = int(params.get("period_ms"))
        except (TypeError, ValueError):
            return [], "resample requires integer period_ms"
        if period <= 0:
            return [], "period_ms must be > 0"
        buckets = (ts // period) * period
        out: list[dict] = []
        for b in np.unique(buckets):
            mask = buckets == b
            out.append({"t": int(b), "v": float(np.mean(vals[mask]))})
        return out, None

    if op == "rolling_mean":
        try:
            window = int(params.get("window"))
        except (TypeError, ValueError):
            return [], "rolling_mean requires integer window"
        if window <= 0:
            return [], "window must be > 0"
        out = []
        for i in range(len(vals)):
            lo = max(0, i - window + 1)
            seg = vals[lo : i + 1]
            out.append({"t": int(ts[i]), "v": float(np.mean(seg))})
        return out, None

    if op == "pct_change":
        try:
            periods = int(params.get("periods", 1))
        except (TypeError, ValueError):
            return [], "periods must be an integer"
        if periods <= 0:
            return [], "periods must be > 0"
        out = []
        for i in range(periods, len(vals)):
            prev = vals[i - periods]
            if prev == 0:
                continue
            out.append({"t": int(ts[i]), "v": float((vals[i] - prev) / prev)})
        return out, None

    return [], f"unknown op '{op}'"


def transform(
    dataset: str, op: dict, *, owner: Optional[str] = None, db_path: Optional[str] = None
) -> dict:
    """Apply a declarative transform to a dataset, producing a *derived* History
    Lake series + a ``lineage`` edge (output <- input + op).

    ``op`` is ``{"op": "rolling_mean"|"pct_change"|"resample", ...params}``. The
    derived dataset is registered in the catalog and named
    ``"{dataset}::{op}"``. Returns an audit dict; never raises."""
    op = dict(op or {})
    op_name = str(op.get("op", "")).strip()
    op_params = {k: v for k, v in op.items() if k != "op"}

    ds = get_dataset(dataset, db_path=db_path)
    if ds is None:
        return {"ok": False, "error": f"unknown dataset '{dataset}'"}
    src_sid = ds.get("series_id")
    if not src_sid:
        return {"ok": False, "error": f"dataset '{dataset}' has no bound series"}

    points = lake.read_series(src_sid)
    new_points, err = _apply_transform(points, op_name, op_params)
    if err is not None:
        return {"ok": False, "error": err, "dataset": dataset, "op": op_name}

    out_name = f"{dataset}::{op_name}"
    # The derived series lives in the History Lake under a 'derived' source.
    out_sid = lake.upsert_series(
        "derived", out_name, op_name,
        unit=str(ds.get("schema", {}).get("unit") or "") or None,
        freq="derived",
    )
    n = lake.write_observations(out_sid, new_points)

    register_dataset(
        out_name, source="derived",
        schema={"derived_from": dataset, "op": op_name, "params": op_params},
        owner=owner or ds.get("owner") or "system",
        series_id=out_sid, db_path=db_path,
    )
    _record_lineage(out_name, dataset, op_name, op_params, db_path=db_path)

    return {
        "ok": True,
        "dataset": out_name,
        "source_dataset": dataset,
        "op": op_name,
        "series_id": out_sid,
        "n_rows": n,
    }


# ── lineage ───────────────────────────────────────────────────────────────────────
def _record_lineage(
    output: str, input_: str, op: str, params: dict, *, db_path: Optional[str] = None
) -> None:
    init_db(db_path)
    try:
        params_json = json.dumps(params or {}, default=str)
    except (TypeError, ValueError):
        params_json = "{}"
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO lineage (output, input, op, params_json, created_ts)
                VALUES (?,?,?,?,?)
                ON CONFLICT(output, input, op) DO UPDATE SET
                    params_json=excluded.params_json,
                    created_ts=excluded.created_ts
                """,
                (output, input_, op, params_json, _now_ms()),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _lineage_edges(db_path: Optional[str] = None) -> list[dict]:
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT output, input, op, params_json, created_ts FROM lineage"
            ).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return []
    edges = []
    for r in rows:
        try:
            params = json.loads(r["params_json"] or "{}")
        except (TypeError, ValueError):
            params = {}
        edges.append({
            "output": r["output"], "input": r["input"], "op": r["op"],
            "params": params, "created_ts": r["created_ts"],
        })
    return edges


def lineage(dataset: str, *, db_path: Optional[str] = None) -> dict:
    """Provenance graph for a dataset: every upstream/downstream edge reachable
    from ``dataset`` (transitively), as ``{nodes, edges}``. Never raises."""
    all_edges = _lineage_edges(db_path=db_path)
    if not all_edges:
        return {"dataset": dataset, "nodes": [dataset], "edges": []}

    by_output: dict[str, list[dict]] = {}
    by_input: dict[str, list[dict]] = {}
    for e in all_edges:
        by_output.setdefault(e["output"], []).append(e)
        by_input.setdefault(e["input"], []).append(e)

    nodes: set[str] = {dataset}
    edges: list[dict] = []
    seen_edge: set[tuple] = set()

    # Walk upstream (ancestors) and downstream (descendants) from the dataset.
    def _walk(node: str, index: dict[str, list[dict]], up: bool) -> None:
        frontier = [node]
        visited: set[str] = set()
        while frontier:
            cur = frontier.pop()
            if cur in visited:
                continue
            visited.add(cur)
            for e in index.get(cur, []):
                key = (e["output"], e["input"], e["op"])
                if key not in seen_edge:
                    seen_edge.add(key)
                    edges.append(e)
                nxt = e["input"] if up else e["output"]
                nodes.add(e["input"])
                nodes.add(e["output"])
                if nxt not in visited:
                    frontier.append(nxt)

    _walk(dataset, by_output, up=True)    # ancestors (dataset is an output)
    _walk(dataset, by_input, up=False)    # descendants (dataset is an input)

    return {"dataset": dataset, "nodes": sorted(nodes), "edges": edges}


# Bootstrap the catalog DB on import so the first request finds the tables.
init_db()
