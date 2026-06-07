"""Pattern Discovery Engine — time-series motif, discord, and regime detection.

Uses optional advanced libraries (stumpy, hdbscan, ruptures) when available,
with pure-Python fallbacks so the engine always works regardless of the
dependency matrix.
"""

from __future__ import annotations

import math
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore

# ── optional heavy libraries ──────────────────────────────────────────────────
_STUMPY_AVAILABLE = False
try:  # pragma: no cover
    import stumpy

    _STUMPY_AVAILABLE = True
except Exception:
    pass

_HDBSCAN_AVAILABLE = False
try:  # pragma: no cover
    import hdbscan

    _HDBSCAN_AVAILABLE = True
except Exception:
    pass

_RUPTURES_AVAILABLE = False
try:  # pragma: no cover
    import ruptures as rpt

    _RUPTURES_AVAILABLE = True
except Exception:
    pass

_SKLEARN_AVAILABLE = False
try:  # pragma: no cover
    from sklearn.cluster import KMeans

    _SKLEARN_AVAILABLE = True
except Exception:
    pass

# ── DB ────────────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "pattern_oracle.db",
)


def _db_path() -> str:
    return os.environ.get("PATTERN_ORACLE_DB", _DEFAULT_DB)


_MEMORY_CONN: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS pattern_discoveries (
    id          TEXT PRIMARY KEY,
    created_ts  INTEGER NOT NULL,
    series_len  INTEGER NOT NULL,
    window      INTEGER NOT NULL,
    motifs      TEXT,
    discords    TEXT,
    regimes     TEXT,
    meta        TEXT
);
"""


def _conn() -> sqlite3.Connection:
    global _MEMORY_CONN
    path = _db_path()
    if path == ":memory:":
        if _MEMORY_CONN is None:
            _MEMORY_CONN = sqlite3.connect(path, check_same_thread=False)
            _MEMORY_CONN.row_factory = sqlite3.Row
            _MEMORY_CONN.executescript(_SCHEMA)
        return _MEMORY_CONN
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


# ── Pure-Python fallbacks ─────────────────────────────────────────────────────

def _to_series(series: list[float]) -> list[float]:
    return [float(v) for v in series if isinstance(v, (int, float)) and math.isfinite(v)]


def _zscore_anomalies(values: list[float], threshold: float = 3.0) -> list[int]:
    """Return indices where |z| > threshold."""
    if len(values) < 3:
        return []
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / len(values)
    std = math.sqrt(var) if var > 0 else 1.0
    return [i for i, v in enumerate(values) if abs(v - mean) / std > threshold]


def _sliding_window_motifs(values: list[float], window: int, top_k: int = 3) -> list[dict]:
    """Simple Euclidean-distance motif discovery via brute-force MPDist-like scan."""
    n = len(values)
    if n < window * 2:
        return []
    # Normalised subsequence vectors
    subs: list[tuple[int, list[float]]] = []
    for i in range(n - window + 1):
        sub = values[i : i + window]
        mu = sum(sub) / window
        sigma = math.sqrt(sum((v - mu) ** 2 for v in sub) / window) or 1.0
        norm = [(v - mu) / sigma for v in sub]
        subs.append((i, norm))
    # Distance matrix (lower triangle)
    best: list[tuple[float, int, int]] = []
    for i in range(len(subs)):
        for j in range(i + window, len(subs)):
            d = math.sqrt(sum((a - b) ** 2 for a, b in zip(subs[i][1], subs[j][1])))
            best.append((d, subs[i][0], subs[j][0]))
    best.sort(key=lambda x: x[0])
    motifs: list[dict] = []
    used: set[int] = set()
    for d, a, b in best:
        if len(motifs) >= top_k:
            break
        if a in used or b in used:
            continue
        motifs.append({"start_a": a, "start_b": b, "length": window, "distance": round(d, 4)})
        used.add(a)
        used.add(b)
    return motifs


def _cusum_changepoints(values: list[float], threshold: float = 5.0, drift: float = 0.0) -> list[int]:
    """CUSUM change-point detection (Page-Hinkley style)."""
    if len(values) < 4:
        return []
    mean = sum(values) / len(values)
    sp, sm = 0.0, 0.0
    cps: list[int] = []
    for i, v in enumerate(values):
        sp = max(0.0, sp + v - mean - drift)
        sm = max(0.0, sm + mean - v - drift)
        if sp > threshold or sm > threshold:
            cps.append(i)
            sp, sm = 0.0, 0.0
    # Deduplicate close points
    if not cps:
        return []
    filtered = [cps[0]]
    for cp in cps[1:]:
        if cp - filtered[-1] > max(3, len(values) // 20):
            filtered.append(cp)
    return filtered


def _pelt_fallback(values: list[float], pen: float = 10.0) -> list[int]:
    """Fallback change-point: threshold-based + CUSUM hybrid."""
    return _cusum_changepoints(values, threshold=pen)


def _kmeans_fallback(values: list[float], n_clusters: int = 3) -> list[dict]:
    """Simple 1-D clustering by value bins when sklearn/hdbscan unavailable."""
    if len(values) < n_clusters:
        return [{"label": 0, "start": 0, "end": len(values) - 1, "centroid": float(sum(values) / len(values))}]
    sorted_vals = sorted(set(values))
    if len(sorted_vals) < n_clusters:
        n_clusters = len(sorted_vals)
    # Equal-frequency binning as a crude regime proxy
    n = len(values)
    size = n // n_clusters
    regimes: list[dict] = []
    for i in range(n_clusters):
        s = i * size
        e = (n - 1) if i == n_clusters - 1 else (i + 1) * size - 1
        seg = values[s : e + 1]
        regimes.append({"label": i, "start": s, "end": e, "centroid": round(sum(seg) / len(seg), 4)})
    return regimes


# ── Optional-library paths ────────────────────────────────────────────────────

def _stumpy_motifs_discords(values: list[float], window: int):
    motifs: list[dict] = []
    discords: list[dict] = []
    if np is None or not _STUMPY_AVAILABLE or len(values) < window * 2:
        return motifs, discords
    arr = np.array(values, dtype=np.float64)
    mp = stumpy.stump(arr, m=window)
    # motifs: lowest matrix profile values
    idx = np.argsort(mp[:, 0])
    used = set()
    for i in idx[:5]:
        if len(motifs) >= 3:
            break
        j = int(mp[i, 1])
        if i in used or j in used or abs(int(i) - j) < window:
            continue
        motifs.append({"start_a": int(i), "start_b": j, "length": window, "distance": round(float(mp[i, 0]), 4)})
        used.add(int(i))
        used.add(j)
    # discords: highest matrix profile values
    idx_desc = np.argsort(mp[:, 0])[::-1]
    used_d = set()
    for i in idx_desc[:5]:
        if len(discords) >= 3:
            break
        if int(i) in used_d:
            continue
        discords.append({"index": int(i), "length": window, "distance": round(float(mp[i, 0]), 4)})
        used_d.add(int(i))
    return motifs, discords


def _hdbscan_regimes(values: list[float], window: int) -> list[dict]:
    if np is None or len(values) < window * 2:
        return []
    if _HDBSCAN_AVAILABLE and _SKLEARN_AVAILABLE:
        arr = np.array(values, dtype=np.float64)
        # Feature = rolling mean + std
        feats = []
        for i in range(len(arr) - window + 1):
            w = arr[i : i + window]
            feats.append([float(w.mean()), float(w.std())])
        X = np.array(feats)
        clusterer = hdbscan.HDBSCAN(min_cluster_size=max(2, len(X) // 10), allow_single_cluster=True)
        labels = clusterer.fit_predict(X)
    elif _SKLEARN_AVAILABLE:
        arr = np.array(values, dtype=np.float64)
        feats = []
        for i in range(len(arr) - window + 1):
            w = arr[i : i + window]
            feats.append([float(w.mean()), float(w.std())])
        X = np.array(feats)
        k = min(3, len(X))
        labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(X)
    else:
        return []
    # Convert labels into contiguous regime segments
    regimes: list[dict] = []
    if len(labels) == 0:
        return regimes
    cur_label = int(labels[0])
    cur_start = 0
    for i, lab in enumerate(labels[1:], start=1):
        if int(lab) != cur_label:
            seg = values[cur_start : i + window - 1]
            centroid = float(sum(seg) / len(seg)) if seg else 0.0
            regimes.append({"label": cur_label, "start": cur_start, "end": i + window - 2, "centroid": round(centroid, 4)})
            cur_label = int(lab)
            cur_start = i
    seg = values[cur_start:]
    centroid = float(sum(seg) / len(seg)) if seg else 0.0
    regimes.append({"label": cur_label, "start": cur_start, "end": len(values) - 1, "centroid": round(centroid, 4)})
    return regimes


def _ruptures_cps(values: list[float], pen: float = 10.0) -> list[int]:
    if np is None or not _RUPTURES_AVAILABLE or len(values) < 4:
        return []
    arr = np.array(values, dtype=np.float64).reshape(-1, 1)
    model = rpt.Pelt(model="l2").fit(arr)
    cps = model.predict(pen=pen)
    # ruptures returns end-of-segment indices; drop the last (== len)
    return [int(c) for c in cps[:-1] if c < len(values)]


# ── Public API ────────────────────────────────────────────────────────────────

async def discover_patterns(series: list[float], window: int) -> dict[str, Any]:
    """Discover motifs, discords, and regimes in a time-series.

    Returns a dict with keys: ``motifs``, ``discords``, ``regimes``,
    ``changepoints``, ``anomalies``.
    """
    values = _to_series(series)
    n = len(values)
    if n < 4:
        return {"motifs": [], "discords": [], "regimes": [], "changepoints": [], "anomalies": [], "error": "series too short"}
    w = max(3, min(window, n // 3))

    # Motifs + discords
    motifs: list[dict] = []
    discords: list[dict] = []
    if _STUMPY_AVAILABLE and np is not None:
        try:
            motifs, discords = _stumpy_motifs_discords(values, w)
        except Exception:
            pass
    if not motifs:
        motifs = _sliding_window_motifs(values, w)
    if not discords:
        # Discord = top anomalies by z-score
        anom_idx = _zscore_anomalies(values)
        discords = [{"index": i, "length": 1, "distance": round(abs(values[i] - sum(values) / len(values)) / (math.sqrt(sum((v - sum(values) / len(values)) ** 2 for v in values) / len(values)) or 1.0), 4)} for i in anom_idx[:3]]

    # Regimes
    regimes = _hdbscan_regimes(values, w)
    if not regimes:
        regimes = _kmeans_fallback(values)

    # Change-points
    cps: list[int] = []
    if _RUPTURES_AVAILABLE and np is not None:
        try:
            cps = _ruptures_cps(values, pen=max(5.0, math.log(n) * 2))
        except Exception:
            pass
    if not cps:
        cps = _cusum_changepoints(values, threshold=max(3.0, math.log(n) * 1.5))

    # Anomalies (z-score)
    anomalies = [{"index": i, "score": round(abs(values[i] - sum(values) / len(values)) / (math.sqrt(sum((v - sum(values) / len(values)) ** 2 for v in values) / len(values)) or 1.0), 4)} for i in _zscore_anomalies(values)]

    result = {
        "motifs": motifs,
        "discords": discords,
        "regimes": regimes,
        "changepoints": cps,
        "anomalies": anomalies,
        "window": w,
        "library_path": "stumpy" if _STUMPY_AVAILABLE else "fallback",
        "regime_library": "hdbscan" if _HDBSCAN_AVAILABLE else ("sklearn" if _SKLEARN_AVAILABLE else "fallback"),
        "cp_library": "ruptures" if _RUPTURES_AVAILABLE else "cusum_fallback",
    }

    # Persist
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO pattern_discoveries (id, created_ts, series_len, window, motifs, discords, regimes, meta) VALUES (?,?,?,?,?,?,?,?)",
                (
                    str(uuid.uuid4()),
                    int(time.time() * 1000),
                    n,
                    w,
                    json.dumps(motifs),
                    json.dumps(discords),
                    json.dumps(regimes),
                    json.dumps({"changepoints": cps, "anomalies": anomalies}),
                ),
            )
    except Exception:
        pass  # persistence is best-effort

    return result


import json  # noqa: E402
