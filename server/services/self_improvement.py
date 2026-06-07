"""Self-Improvement Loop — measure, compare, trigger retrain, upgrade.

Closes the feedback loop between forecasts and realized outcomes:
  * CRPS  — Continuous Ranked Probability Score (interval calibration)
  * RMSE  — point accuracy
  * PSI   — Population Stability Index (distribution drift)
  * ECE   — Expected Calibration Error

All results are persisted to SQLite so the loop survives restarts.
"""

from __future__ import annotations

import json
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
CREATE TABLE IF NOT EXISTS forecast_evaluations (
    id          TEXT PRIMARY KEY,
    forecast_id TEXT,
    evaluated_ts INTEGER NOT NULL,
    model       TEXT NOT NULL,
    crps        REAL,
    rmse        REAL,
    psi         REAL,
    ece         REAL,
    actuals     TEXT,
    metrics     TEXT
);

CREATE TABLE IF NOT EXISTS model_scores (
    model       TEXT PRIMARY KEY,
    runs        INTEGER NOT NULL DEFAULT 0,
    avg_crps    REAL,
    avg_rmse    REAL,
    avg_psi     REAL,
    avg_ece     REAL,
    last_eval_ts INTEGER,
    score       REAL
);

CREATE TABLE IF NOT EXISTS retrain_queue (
    id          TEXT PRIMARY KEY,
    model       TEXT NOT NULL,
    requested_ts INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    reason      TEXT,
    started_ts  INTEGER,
    finished_ts INTEGER,
    result      TEXT
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


# ── Metrics (pure Python + numpy optional) ────────────────────────────────────

def _to_floats(vals: list[float]) -> list[float]:
    return [float(v) for v in vals if isinstance(v, (int, float)) and math.isfinite(v)]


def _crps(actuals: list[float], forecasts: list[float], lows: list[float], highs: list[float]) -> float:
    """Approximate CRPS via interval score for Gaussian-like forecasts."""
    a = _to_floats(actuals)
    f = _to_floats(forecasts)
    if len(a) != len(f) or len(a) != len(lows) or len(a) != len(highs):
        return float("nan")
    total = 0.0
    for i in range(len(a)):
        width = highs[i] - lows[i]
        under = max(0.0, lows[i] - a[i])
        over = max(0.0, a[i] - highs[i])
        total += width + 2.0 * (under + over)
    return total / len(a)


def _rmse(actuals: list[float], forecasts: list[float]) -> float:
    a = _to_floats(actuals)
    f = _to_floats(forecasts)
    if len(a) != len(f) or not a:
        return float("nan")
    return math.sqrt(sum((a[i] - f[i]) ** 2 for i in range(len(a))) / len(a))


def _psi(actuals: list[float], forecasts: list[float], bins: int = 10) -> float:
    """Population Stability Index between actual and forecast distributions."""
    a = _to_floats(actuals)
    f = _to_floats(forecasts)
    if not a or not f:
        return float("nan")
    lo = min(min(a), min(f))
    hi = max(max(a), max(f))
    if lo == hi:
        return 0.0
    # Build equal-width histograms
    def _hist(data: list[float]) -> list[float]:
        counts = [0] * bins
        for v in data:
            idx = min(bins - 1, int((v - lo) / (hi - lo) * bins))
            counts[idx] += 1
        total = sum(counts)
        return [c / total if total else 1e-6 for c in counts]

    ha = _hist(a)
    hf = _hist(f)
    psi = 0.0
    for pa, pf in zip(ha, hf):
        if pa > 0 and pf > 0:
            psi += (pa - pf) * math.log(pa / pf)
    return psi


def _ece(actuals: list[float], forecasts: list[float], lows: list[float], highs: list[float], n_bins: int = 5) -> float:
    """Expected Calibration Error for prediction intervals."""
    a = _to_floats(actuals)
    f = _to_floats(forecasts)
    if len(a) != len(f) or not a:
        return float("nan")
    # Bin by forecast confidence (use |actual - point| / interval_width as proxy)
    errors = []
    for i in range(len(a)):
        width = max(1e-9, highs[i] - lows[i])
        err = abs(a[i] - f[i]) / width
        errors.append(err)
    # Binned average error vs expected (we expect ~0.67 for ~50% interval, etc)
    # Simplified: bin by error magnitude and compute average deviation from uniform
    sorted_err = sorted(errors)
    bin_size = max(1, len(sorted_err) // n_bins)
    ece = 0.0
    for i in range(0, len(sorted_err), bin_size):
        chunk = sorted_err[i : i + bin_size]
        avg_err = sum(chunk) / len(chunk)
        # Expected average normalised error for a well-calibrated Gaussian ~ 0.8
        ece += abs(avg_err - 0.8) * (len(chunk) / len(sorted_err))
    return ece


# ── Public API ────────────────────────────────────────────────────────────────

async def evaluate_forecast(forecast_id: str, actuals: list[float]) -> dict[str, Any]:
    """Evaluate a past forecast against realised values.

    Looks up the forecast from ``forecast_runs`` and computes CRPS, RMSE, PSI,
    ECE.  Persists to ``forecast_evaluations`` and updates ``model_scores``.
    """
    # Fetch forecast
    row: Optional[sqlite3.Row] = None
    try:
        with _conn() as conn:
            row = conn.execute(
                "SELECT * FROM forecast_runs WHERE id = ?", (forecast_id,)
            ).fetchone()
    except Exception:
        pass
    if row is None:
        return {"error": "forecast not found", "forecast_id": forecast_id}

    payload = json.loads(row["payload"] or "{}")
    forecasts = payload.get("forecast", [])
    lows = payload.get("low", [])
    highs = payload.get("high", [])
    model = row["model"]
    a = _to_floats(actuals)
    f = _to_floats(forecasts)
    # Truncate to shortest common length
    k = min(len(a), len(f))
    if k < 1:
        return {"error": "no overlapping points", "forecast_id": forecast_id}
    a = a[:k]
    f = f[:k]
    lows = lows[:k]
    highs = highs[:k]

    crps = _crps(a, f, lows, highs)
    rmse = _rmse(a, f)
    psi_val = _psi(a, f)
    ece_val = _ece(a, f, lows, highs)

    eval_id = str(uuid.uuid4())
    metrics = {"crps": crps, "rmse": rmse, "psi": psi_val, "ece": ece_val, "overlap": k}
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO forecast_evaluations (id, forecast_id, evaluated_ts, model, crps, rmse, psi, ece, actuals, metrics) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (eval_id, forecast_id, int(time.time() * 1000), model, crps, rmse, psi_val, ece_val, json.dumps(a), json.dumps(metrics)),
            )
            # Update rolling model score
            conn.execute(
                """
                INSERT INTO model_scores (model, runs, avg_crps, avg_rmse, avg_psi, avg_ece, last_eval_ts, score)
                VALUES (?, 1, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(model) DO UPDATE SET
                    runs = runs + 1,
                    avg_crps = (avg_crps * runs + excluded.avg_crps) / (runs + 1),
                    avg_rmse = (avg_rmse * runs + excluded.avg_rmse) / (runs + 1),
                    avg_psi  = (avg_psi  * runs + excluded.avg_psi ) / (runs + 1),
                    avg_ece  = (avg_ece  * runs + excluded.avg_ece ) / (runs + 1),
                    last_eval_ts = excluded.last_eval_ts,
                    score = (COALESCE(avg_crps,0) + COALESCE(avg_rmse,0) + COALESCE(avg_psi,0) + COALESCE(avg_ece,0))
                """,
                (model, crps, rmse, psi_val, ece_val, int(time.time() * 1000), crps + rmse + psi_val + ece_val),
            )
    except Exception:
        pass  # persistence best-effort

    return {"evaluation_id": eval_id, "forecast_id": forecast_id, "model": model, **metrics}


async def should_retrain(model: str, threshold: Optional[dict[str, float]] = None) -> dict[str, Any]:
    """Decide whether a model has degraded enough to warrant retraining.

    Thresholds default to moderate values; override via ``threshold`` dict.
    """
    thr = {"crps": 5.0, "rmse": 10.0, "psi": 0.25, "ece": 1.0}
    if threshold:
        thr.update(threshold)
    try:
        with _conn() as conn:
            row = conn.execute("SELECT * FROM model_scores WHERE model = ?", (model,)).fetchone()
    except Exception:
        row = None
    if row is None:
        return {"model": model, "retrain": True, "reason": "no score history", "metrics": {}}

    metrics = {
        "crps": row["avg_crps"],
        "rmse": row["avg_rmse"],
        "psi": row["avg_psi"],
        "ece": row["avg_ece"],
        "runs": row["runs"],
    }
    reasons = []
    for key, limit in thr.items():
        val = metrics.get(key)
        if val is not None and val > limit:
            reasons.append(f"{key}={val:.3f}>{limit}")
    return {
        "model": model,
        "retrain": len(reasons) > 0,
        "reasons": reasons,
        "metrics": metrics,
    }


async def trigger_retrain(model: str) -> dict[str, Any]:
    """Queue a model for retraining.  Logs to ``retrain_queue``."""
    rid = str(uuid.uuid4())
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO retrain_queue (id, model, requested_ts, status, reason) VALUES (?,?,?,?,?)",
                (rid, model, int(time.time() * 1000), "pending", f"degraded performance for {model}"),
            )
    except Exception:
        pass
    return {"retrain_id": rid, "model": model, "status": "pending"}


async def upgrade_model_if_better(candidate_id: str) -> dict[str, Any]:
    """A/B compare a candidate model run against incumbent and promote if better.

    Promotion is logged; the actual model swap is a config/metadata update.
    """
    # Fetch candidate
    candidate: Optional[sqlite3.Row] = None
    incumbent: Optional[sqlite3.Row] = None
    try:
        with _conn() as conn:
            candidate = conn.execute(
                "SELECT * FROM forecast_evaluations WHERE id = ?", (candidate_id,)
            ).fetchone()
            if candidate:
                incumbent = conn.execute(
                    "SELECT * FROM model_scores WHERE model = ?", (candidate["model"],)
                ).fetchone()
    except Exception:
        pass
    if candidate is None:
        return {"upgraded": False, "reason": "candidate not found", "candidate_id": candidate_id}

    c_crps = candidate["crps"] or float("inf")
    c_rmse = candidate["rmse"] or float("inf")
    # Simplistic composite: lower is better
    c_score = c_crps + c_rmse

    if incumbent is None:
        upgraded = True
        reason = "no incumbent; candidate becomes baseline"
    else:
        i_score = (incumbent["avg_crps"] or 0) + (incumbent["avg_rmse"] or 0)
        upgraded = c_score < i_score * 0.95  # 5% improvement gate
        reason = f"candidate_score={c_score:.4f} vs incumbent={i_score:.4f}"

    # Log upgrade decision
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO retrain_queue (id, model, requested_ts, status, reason, result) VALUES (?,?,?,?,?,?)",
                (
                    str(uuid.uuid4()),
                    candidate["model"],
                    int(time.time() * 1000),
                    "upgraded" if upgraded else "rejected",
                    reason,
                    json.dumps({"candidate_id": candidate_id, "candidate_score": c_score, "upgraded": upgraded}),
                ),
            )
    except Exception:
        pass

    return {
        "upgraded": upgraded,
        "candidate_id": candidate_id,
        "model": candidate["model"],
        "reason": reason,
    }


async def improvement_status() -> dict[str, Any]:
    """Snapshot of the self-improvement loop state."""
    try:
        with _conn() as conn:
            scores = [dict(r) for r in conn.execute("SELECT * FROM model_scores ORDER BY score DESC").fetchall()]
            pending = [dict(r) for r in conn.execute("SELECT * FROM retrain_queue WHERE status = 'pending' ORDER BY requested_ts DESC").fetchall()]
            recent_evals = [dict(r) for r in conn.execute("SELECT * FROM forecast_evaluations ORDER BY evaluated_ts DESC LIMIT 20").fetchall()]
    except Exception:
        scores, pending, recent_evals = [], [], []
    return {
        "model_scores": scores,
        "pending_retrains": pending,
        "recent_evaluations": recent_evals,
    }
