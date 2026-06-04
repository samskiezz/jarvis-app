"""TEMPORAL ANALYSIS — the temporal pillar over the History Lake (P0).

A Gotham-style temporal service that surfaces real time-aware queries over the
History Lake time-series store (``series``/``observation``) plus the temporal
versioning recorded by the Ontology Store (``created_ts``/``updated_ts`` +
``object_action`` audit rows).

Design rules (mirrors ``history_lake.py`` / ``ontology_store.py``):
  * stdlib only — ``math``/``statistics`` + the History Lake / Ontology Store
    helpers (themselves stdlib ``sqlite3``). No new dependency.
  * never raise on normal use — every public function degrades gracefully and
    returns a sensible empty/zero value on error.
  * read-only — this layer only *reads* the stores; it never mutates them.

Functions:
  * ``range_query``     — observations in [t0,t1] with basic descriptive stats.
  * ``event_sequence``  — threshold-crossing events (auto threshold = mean+1σ).
  * ``pattern_scan``    — z-score spike anomalies + rolling volatility windows.
  * ``replay_frames``   — N evenly-spaced cumulative frames for a UI scrubber.
  * ``object_versions`` — temporal version trail of an ontology object.
  * ``timeline``        — merged, time-sorted threshold-event feed across series.
"""

from __future__ import annotations

import math
import statistics
from typing import Any, Optional

from . import history_lake as lake


# ── helpers ──────────────────────────────────────────────────────────────────────
def _slope(pts: list[dict]) -> float:
    """Least-squares slope of value vs. ts (per ms). 0.0 on <2 points / flat ts."""
    n = len(pts)
    if n < 2:
        return 0.0
    xs = [float(p["t"]) for p in pts]
    ys = [float(p["v"]) for p in pts]
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return 0.0
    return num / den


def _stats(pts: list[dict]) -> dict:
    """Descriptive stats over a list of ``{"t","v"}`` points."""
    if not pts:
        return {
            "n": 0, "min": None, "max": None, "mean": None,
            "first": None, "last": None, "slope": 0.0,
        }
    vals = [float(p["v"]) for p in pts]
    return {
        "n": len(pts),
        "min": min(vals),
        "max": max(vals),
        "mean": sum(vals) / len(vals),
        "first": vals[0],
        "last": vals[-1],
        "slope": _slope(pts),
    }


def _read(series_id: str, *, since: Optional[int] = None) -> list[dict]:
    """Read a full series ascending. Never raises (history_lake degrades)."""
    if not series_id:
        return []
    try:
        return lake.read_series(series_id, since=since)
    except Exception:  # noqa: BLE001 - never raise
        return []


# ── range query ──────────────────────────────────────────────────────────────────
def range_query(
    series_id: str,
    t0: Optional[int] = None,
    t1: Optional[int] = None,
) -> dict:
    """Return observations in the inclusive window ``[t0, t1]`` with basic stats.

    ``t0``/``t1`` are epoch-ms bounds; either may be ``None`` (open-ended). Output:
    ``{series_id, t0, t1, points:[{t,v}], stats:{n,min,max,mean,first,last,slope}}``.
    """
    try:
        lo = int(t0) if t0 is not None else None
        hi = int(t1) if t1 is not None else None
    except (TypeError, ValueError):
        lo = hi = None

    rows = _read(series_id, since=lo)
    points: list[dict] = []
    for r in rows:
        try:
            t = int(r["t"])
        except (TypeError, ValueError, KeyError):
            continue
        if lo is not None and t < lo:
            continue
        if hi is not None and t > hi:
            continue
        points.append({"t": t, "v": float(r["v"])})

    return {
        "series_id": series_id,
        "t0": lo,
        "t1": hi,
        "points": points,
        "stats": _stats(points),
    }


# ── threshold-crossing events ─────────────────────────────────────────────────────
def event_sequence(
    series_id: str,
    threshold: Optional[float] = None,
    direction: str = "up",
) -> list[dict]:
    """Detect threshold-crossing events along a series.

    A crossing is a consecutive pair where the value moves from one side of the
    ``threshold`` to the other. ``direction``:
      * ``"up"``   — only upward crossings (prev < thr <= cur).
      * ``"down"`` — only downward crossings (prev > thr >= cur).
      * ``"both"`` — either direction.
    If ``threshold`` is ``None`` it auto-selects ``mean + 1σ`` of the series.
    Returns ``[{t, value, kind}]`` ordered by ts; ``kind`` is ``"cross_up"`` /
    ``"cross_down"``.
    """
    rows = _read(series_id)
    if len(rows) < 2:
        return []

    vals = [float(r["v"]) for r in rows]
    thr: Optional[float]
    if threshold is None:
        try:
            mean = statistics.fmean(vals)
            sd = statistics.pstdev(vals) if len(vals) > 1 else 0.0
            thr = mean + sd
        except statistics.StatisticsError:
            return []
    else:
        try:
            thr = float(threshold)
        except (TypeError, ValueError):
            return []

    direction = str(direction or "up").lower()
    if direction not in ("up", "down", "both"):
        direction = "up"

    events: list[dict] = []
    for prev, cur in zip(rows, rows[1:]):
        pv = float(prev["v"])
        cv = float(cur["v"])
        up = pv < thr <= cv
        down = pv > thr >= cv
        if up and direction in ("up", "both"):
            events.append({"t": int(cur["t"]), "value": cv, "kind": "cross_up"})
        elif down and direction in ("down", "both"):
            events.append({"t": int(cur["t"]), "value": cv, "kind": "cross_down"})
    return events


# ── pattern / anomaly scan ────────────────────────────────────────────────────────
def pattern_scan(series_id: str, window: int = 10) -> dict:
    """Simple motif/anomaly summary over a series.

    * z-score spikes — points with ``|z| > 2.5`` (z from series mean/σ) are
      flagged as anomalies ``{t, value, z, kind}`` (``spike_up``/``spike_down``).
    * rolling volatility — stdev of each non-overlapping window of ``window``
      points, returned as ``windows:[{t0, t1, vol}]``; ``volatility`` is the mean
      window volatility.
    Output: ``{series_id, anomalies, n_anomalies, volatility, windows}``.
    """
    empty = {
        "series_id": series_id,
        "anomalies": [],
        "n_anomalies": 0,
        "volatility": 0.0,
        "windows": [],
    }
    rows = _read(series_id)
    if len(rows) < 2:
        return empty

    vals = [float(r["v"]) for r in rows]
    try:
        mean = statistics.fmean(vals)
        sd = statistics.pstdev(vals)
    except statistics.StatisticsError:
        return empty

    anomalies: list[dict] = []
    if sd > 0:
        for r in rows:
            v = float(r["v"])
            z = (v - mean) / sd
            if abs(z) > 2.5:
                anomalies.append({
                    "t": int(r["t"]),
                    "value": v,
                    "z": z,
                    "kind": "spike_up" if z > 0 else "spike_down",
                })

    try:
        w = max(2, int(window))
    except (TypeError, ValueError):
        w = 10

    windows: list[dict] = []
    vols: list[float] = []
    for i in range(0, len(rows), w):
        chunk = rows[i:i + w]
        if len(chunk) < 2:
            continue
        cvals = [float(c["v"]) for c in chunk]
        try:
            vol = statistics.pstdev(cvals)
        except statistics.StatisticsError:
            continue
        windows.append({
            "t0": int(chunk[0]["t"]),
            "t1": int(chunk[-1]["t"]),
            "vol": vol,
        })
        vols.append(vol)

    volatility = (sum(vols) / len(vols)) if vols else 0.0
    return {
        "series_id": series_id,
        "anomalies": anomalies,
        "n_anomalies": len(anomalies),
        "volatility": volatility,
        "windows": windows,
    }


# ── replay frames (UI scrubber) ───────────────────────────────────────────────────
def replay_frames(series_id: str, n_frames: int = 60) -> list[dict]:
    """Downsample the series into ``n_frames`` evenly-spaced cumulative frames.

    Each frame carries the running cumulative mean *up to and including* that
    frame's observation, so a UI time-slider can scrub the accumulated state of
    the series over time. Returns ``[{frame, t, value, cum_mean}]`` (length up to
    ``n_frames``; fewer if the series is shorter).
    """
    try:
        n_frames = max(1, int(n_frames))
    except (TypeError, ValueError):
        n_frames = 60

    rows = _read(series_id)
    if not rows:
        return []

    n = len(rows)
    # Pick evenly-spaced indices across the full series (always include the last).
    if n <= n_frames:
        idxs = list(range(n))
    else:
        idxs = sorted({
            min(n - 1, int(round(i * (n - 1) / (n_frames - 1))))
            for i in range(n_frames)
        }) if n_frames > 1 else [n - 1]

    # Precompute prefix sums for an O(1) cumulative mean at each sampled index.
    prefix: list[float] = [0.0]
    for r in rows:
        prefix.append(prefix[-1] + float(r["v"]))

    frames: list[dict] = []
    for f, i in enumerate(idxs):
        cum_mean = prefix[i + 1] / (i + 1)
        frames.append({
            "frame": f,
            "t": int(rows[i]["t"]),
            "value": float(rows[i]["v"]),
            "cum_mean": cum_mean,
        })
    return frames


# ── ontology object version trail ─────────────────────────────────────────────────
def object_versions(object_id: str) -> list[dict]:
    """Temporal version trail of an ontology object.

    Reads the object's ``created_ts``/``updated_ts`` plus its ``object_action``
    audit rows (via the Ontology Store) and returns an ascending timeline of
    changes ``[{ts, kind, detail}]``. Degrades to ``[]`` if the Ontology Store is
    unavailable or the object does not exist.
    """
    if not object_id:
        return []
    try:
        from . import ontology_store as onto
    except Exception:  # noqa: BLE001 - store unavailable
        return []

    try:
        obj = onto.get_object(object_id)
    except Exception:  # noqa: BLE001
        obj = None
    if not obj:
        return []

    events: list[dict] = []
    created = obj.get("created_ts")
    updated = obj.get("updated_ts")
    if created is not None:
        events.append({
            "ts": int(created),
            "kind": "created",
            "detail": {"type": obj.get("type"), "label": obj.get("label")},
        })
    if updated is not None and updated != created:
        events.append({
            "ts": int(updated),
            "kind": "updated",
            "detail": {"label": obj.get("label")},
        })

    try:
        actions = onto.list_actions(object_id, limit=1000)
    except Exception:  # noqa: BLE001
        actions = []
    for a in actions or []:
        try:
            events.append({
                "ts": int(a.get("ts")),
                "kind": f"action:{a.get('action')}",
                "detail": {"payload": a.get("payload"), "actor": a.get("actor")},
            })
        except (TypeError, ValueError):
            continue

    events.sort(key=lambda e: e["ts"])
    return events


# ── global merged timeline ────────────────────────────────────────────────────────
def timeline(
    series_ids: Optional[list[str]] = None,
    limit: int = 200,
) -> list[dict]:
    """Merged, time-sorted threshold-event feed across the given series.

    If ``series_ids`` is ``None``/empty, every series in the catalog is scanned.
    Each event is the ``event_sequence`` output annotated with its ``series_id``,
    sorted ascending by ``t`` and capped to the most-recent ``limit`` events.
    Returns ``[{t, value, kind, series_id}]``.
    """
    try:
        cap = max(1, int(limit))
    except (TypeError, ValueError):
        cap = 200

    ids: list[str]
    if series_ids:
        ids = [str(s) for s in series_ids if s]
    else:
        try:
            ids = [s["series_id"] for s in lake.list_series()]
        except Exception:  # noqa: BLE001
            ids = []

    merged: list[dict] = []
    for sid in ids:
        for ev in event_sequence(sid):
            merged.append({**ev, "series_id": sid})

    merged.sort(key=lambda e: e["t"])
    # keep the most-recent `cap` events, still ascending
    if len(merged) > cap:
        merged = merged[-cap:]
    return merged
