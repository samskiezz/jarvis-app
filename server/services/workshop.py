"""WORKSHOP — pivot / aggregation analysis over the ontology + History Lake.

The Foundry-style "workshop" surface: slice and aggregate the live object model
and the time-series lake into the shapes a dashboard needs — histograms,
group-bys, pivot tables, and per-series statistics with a trend.

It reads two existing stores:
  * :mod:`server.services.ontology_store` — the typed object model. Fields are
    either top-level columns (``type``/``label``/``mark``) or keys inside an
    object's ``props`` dict.
  * :mod:`server.services.history_lake`  — the time-series lake. ``series_stats``
    reads a series' observations and reports mean/std/min/max + a linear trend.

Design rules (mirrors the stores it reads):
  * numpy / stdlib only — no new dependency.
  * never raise — every public function degrades gracefully to a sensible
    empty/zero shape on bad input or an unreadable store.
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

from . import history_lake, ontology_store


# ── field extraction ─────────────────────────────────────────────────────────
_TOP_LEVEL = ("id", "type", "label", "mark")


def _get_field(obj: dict, field: str) -> Any:
    """Read ``field`` from an object: a top-level column or a props key."""
    if not isinstance(obj, dict):
        return None
    if field in _TOP_LEVEL:
        return obj.get(field)
    props = obj.get("props")
    if isinstance(props, dict) and field in props:
        return props[field]
    # fall back to a top-level key if it exists (tolerant)
    return obj.get(field)


def _load_objects(objects: Optional[list[dict]], type: Optional[str],
                  db_path: Optional[str]) -> list[dict]:
    """Use injected ``objects`` if supplied (tests), else query the store."""
    if objects is not None:
        return [o for o in objects if isinstance(o, dict)]
    try:
        return ontology_store.query_objects(type=type, db_path=db_path)
    except Exception:  # noqa: BLE001 - never raise
        return []


def _numeric(values: list[Any]) -> list[float]:
    out: list[float] = []
    for v in values:
        try:
            if v is None or isinstance(v, bool):
                continue
            f = float(v)
            if np.isfinite(f):
                out.append(f)
        except (TypeError, ValueError):
            continue
    return out


# ── 1. histogram ─────────────────────────────────────────────────────────────
def histogram(field: str, *, bins: int = 10, objects: Optional[list[dict]] = None,
              type: Optional[str] = None, series: Optional[list[float]] = None,
              db_path: Optional[str] = None) -> dict:
    """Histogram of a numeric ``field`` over objects (or an explicit ``series``).

    Returns ``{"field", "bins", "counts", "edges", "n"}`` where ``counts`` has
    ``bins`` entries and ``edges`` has ``bins+1`` entries. Non-numeric / missing
    values are dropped. An empty input yields zero counts. Never raises.
    """
    try:
        nbins = max(1, int(bins))
    except (TypeError, ValueError):
        nbins = 10
    try:
        if series is not None:
            values = _numeric(list(series))
        else:
            objs = _load_objects(objects, type, db_path)
            values = _numeric([_get_field(o, field) for o in objs])

        if not values:
            return {"field": field, "bins": nbins,
                    "counts": [0] * nbins, "edges": [], "n": 0}

        arr = np.asarray(values, dtype=float)
        counts, edges = np.histogram(arr, bins=nbins)
        return {
            "field": field,
            "bins": nbins,
            "counts": [int(c) for c in counts],
            "edges": [round(float(e), 6) for e in edges],
            "n": int(arr.size),
        }
    except Exception:  # noqa: BLE001 - never raise
        return {"field": field, "bins": nbins, "counts": [], "edges": [], "n": 0}


# ── 2. group_by ──────────────────────────────────────────────────────────────
_AGGS = ("count", "sum", "mean", "min", "max")


def group_by(field: str, *, agg: str = "count", value_field: Optional[str] = None,
             objects: Optional[list[dict]] = None, type: Optional[str] = None,
             db_path: Optional[str] = None) -> dict:
    """Group objects by ``field`` and aggregate.

    ``agg`` is one of count / sum / mean / min / max. ``count`` needs no value;
    the numeric aggregations operate on ``value_field`` (numeric) per group.
    Returns ``{"field", "agg", "groups": {key: number}, "n_groups"}`` with string
    group keys (so the result is JSON-safe). Never raises.
    """
    a = (agg or "count").lower()
    if a not in _AGGS:
        a = "count"
    try:
        objs = _load_objects(objects, type, db_path)
        buckets: dict[str, list[Any]] = {}
        for o in objs:
            key = _get_field(o, field)
            key = "∅" if key is None else str(key)
            val = _get_field(o, value_field) if value_field else None
            buckets.setdefault(key, []).append(val)

        groups: dict[str, float] = {}
        for key, vals in buckets.items():
            if a == "count":
                groups[key] = len(vals)
                continue
            nums = _numeric(vals)
            if not nums:
                groups[key] = 0.0
                continue
            arr = np.asarray(nums, dtype=float)
            if a == "sum":
                groups[key] = round(float(arr.sum()), 6)
            elif a == "mean":
                groups[key] = round(float(arr.mean()), 6)
            elif a == "min":
                groups[key] = round(float(arr.min()), 6)
            elif a == "max":
                groups[key] = round(float(arr.max()), 6)
        return {"field": field, "agg": a, "value_field": value_field,
                "groups": groups, "n_groups": len(groups)}
    except Exception:  # noqa: BLE001
        return {"field": field, "agg": a, "value_field": value_field,
                "groups": {}, "n_groups": 0}


# ── 3. pivot ─────────────────────────────────────────────────────────────────
def pivot(rows_field: str, cols_field: str, *, agg: str = "count",
          value_field: Optional[str] = None, objects: Optional[list[dict]] = None,
          type: Optional[str] = None, db_path: Optional[str] = None) -> dict:
    """Pivot objects into a ``rows_field`` × ``cols_field`` table.

    ``agg`` is one of count / sum / mean / min / max; the numeric aggregations
    operate on ``value_field``. Returns ``{"rows", "cols", "agg", "table"}`` where
    ``table[row_key][col_key]`` is the aggregated number (missing cells absent).
    Never raises.
    """
    a = (agg or "count").lower()
    if a not in _AGGS:
        a = "count"
    try:
        objs = _load_objects(objects, type, db_path)
        cells: dict[str, dict[str, list[Any]]] = {}
        row_keys: list[str] = []
        col_keys: list[str] = []
        for o in objs:
            rk = _get_field(o, rows_field)
            ck = _get_field(o, cols_field)
            rk = "∅" if rk is None else str(rk)
            ck = "∅" if ck is None else str(ck)
            if rk not in cells:
                cells[rk] = {}
                row_keys.append(rk)
            if ck not in col_keys:
                col_keys.append(ck)
            val = _get_field(o, value_field) if value_field else None
            cells[rk].setdefault(ck, []).append(val)

        table: dict[str, dict[str, float]] = {}
        for rk, cols in cells.items():
            table[rk] = {}
            for ck, vals in cols.items():
                if a == "count":
                    table[rk][ck] = len(vals)
                    continue
                nums = _numeric(vals)
                if not nums:
                    table[rk][ck] = 0.0
                    continue
                arr = np.asarray(nums, dtype=float)
                if a == "sum":
                    table[rk][ck] = round(float(arr.sum()), 6)
                elif a == "mean":
                    table[rk][ck] = round(float(arr.mean()), 6)
                elif a == "min":
                    table[rk][ck] = round(float(arr.min()), 6)
                elif a == "max":
                    table[rk][ck] = round(float(arr.max()), 6)
        return {
            "rows_field": rows_field,
            "cols_field": cols_field,
            "agg": a,
            "value_field": value_field,
            "row_keys": sorted(row_keys),
            "col_keys": sorted(col_keys),
            "table": table,
        }
    except Exception:  # noqa: BLE001
        return {"rows_field": rows_field, "cols_field": cols_field, "agg": a,
                "value_field": value_field, "row_keys": [], "col_keys": [],
                "table": {}}


# ── 4. series statistics ─────────────────────────────────────────────────────
def series_stats(series_id: str, *, observations: Optional[list[dict]] = None,
                 db_path: Optional[str] = None) -> dict:
    """Mean / std / min / max + linear trend for a History Lake series.

    Reads the series' observations (``[{"t": ms, "v": value}, ...]``) — either
    injected via ``observations`` (tests) or from the lake. ``trend`` is the
    least-squares slope of value-vs-index (units: value per observation);
    ``direction`` summarises its sign. Never raises; an empty/unknown series
    yields a zeroed shape with ``n == 0``.
    """
    empty = {
        "series_id": series_id, "n": 0,
        "mean": None, "std": None, "min": None, "max": None,
        "trend": None, "direction": "flat",
    }
    try:
        if observations is not None:
            obs = observations
        else:
            obs = history_lake.read_series(series_id, db_path=db_path)

        vals = _numeric([o.get("v", o.get("value")) for o in obs
                         if isinstance(o, dict)])
        if not vals:
            return empty

        arr = np.asarray(vals, dtype=float)
        n = int(arr.size)

        trend = 0.0
        if n >= 2:
            x = np.arange(n, dtype=float)
            # least-squares slope (degree-1 polyfit)
            slope = np.polyfit(x, arr, 1)[0]
            trend = round(float(slope), 6)

        direction = "flat"
        if trend > 1e-9:
            direction = "up"
        elif trend < -1e-9:
            direction = "down"

        return {
            "series_id": series_id,
            "n": n,
            "mean": round(float(arr.mean()), 6),
            "std": round(float(arr.std()), 6),
            "min": round(float(arr.min()), 6),
            "max": round(float(arr.max()), 6),
            "trend": trend,
            "direction": direction,
        }
    except Exception:  # noqa: BLE001
        return empty
