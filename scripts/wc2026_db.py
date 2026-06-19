"""WC2026 prediction audit database (stdlib sqlite3 only).

Purpose
-------
Every simulation / model run that produces WC2026 match predictions writes
EVERY prediction it makes into a SQLite database, so the user can audit the
full prediction history and verify the system is not making up retroactive
results ("ensure your not lying" — owner instruction, verbatim).

Public API
----------
- init_db(path=DB_PATH) -> sqlite3.Connection
- actual_for(home, away) -> Optional[str]   # verified score from JSON
- log_run(run_id, model, notes, generated_at=None)   # notes REQUIRED
- log_prediction(run_id, model, match, prediction)   # actuals resolved server-side
- finalize_run(run_id, summary)
- query_recent_runs(limit=20) -> list[dict]
- query_recent_predictions(limit=50, model=None) -> list[dict]

The match / prediction / actual dicts are intentionally permissive — they
accept the shape used by both wc2026_predictor.py (Elo+Poisson) and
wc2026_llm_predictor.py (Ollama LLM) without requiring callers to remap
fields.

Schema is created on first connection if missing; subsequent runs are
additive only — no destructive migrations.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

# ---------------------------------------------------------------------------
# Paths + constants
# ---------------------------------------------------------------------------

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_THIS_DIR)
DB_PATH = os.path.join(_REPO_ROOT, "server", "data", "wc2026_predictions.db")
ACTUALS_PATH = os.path.join(_REPO_ROOT, "server", "data", "wc2026_actuals.json")

_WDL_FROM_SCORE_CACHE: dict[str, str] = {}

# ---------------------------------------------------------------------------
# Actuals cache + team alias map
# ---------------------------------------------------------------------------
#
# _ACTUALS_CACHE holds the parsed wc2026_actuals.json keyed by (norm_home,
# norm_away). Loaded lazily; invalidated by mtime so an updated JSON is
# re-read without restart. Keys are normalised through _TEAM_ALIAS so the
# same lookup works regardless of which spelling the caller used.
_ACTUALS_CACHE: dict[str, Any] = {
    "mtime": None,
    "by_pair": {},   # type: ignore[var-annotated]
}

# Canonical (lowercase) team-name alias map. The KEY is any alternate
# spelling we accept; the VALUE is the canonical normalised spelling we
# index by. The verified JSON's spellings are the canonical ones.
_TEAM_ALIAS: dict[str, str] = {
    # USA family
    "usa": "united states",
    "u.s.a.": "united states",
    "us": "united states",
    "united states of america": "united states",
    "united states": "united states",
    # Cape Verde
    "cape verde": "cabo verde",
    "cabo verde": "cabo verde",
    # Ivory Coast / Côte d'Ivoire (various accent + apostrophe spellings)
    "ivory coast": "côte d'ivoire",
    "cote d'ivoire": "côte d'ivoire",
    "cote divoire": "côte d'ivoire",
    "cote d ivoire": "côte d'ivoire",
    "côte divoire": "côte d'ivoire",
    "côte d ivoire": "côte d'ivoire",
    "côte d'ivoire": "côte d'ivoire",
    "côte d’ivoire": "côte d'ivoire",  # curly apostrophe variant
    "cote d’ivoire": "côte d'ivoire",
    # South Korea / Korea Republic
    "korea republic": "south korea",
    "republic of korea": "south korea",
    "korea, republic of": "south korea",
    "south korea": "south korea",
    # Türkiye / Turkey
    "turkey": "türkiye",
    "turkiye": "türkiye",
    "türkiye": "türkiye",
    # Czechia / Czech Republic
    "czech republic": "czechia",
    "czechia": "czechia",
    # Bosnia / Bosnia and Herzegovina
    "bosnia": "bosnia and herzegovina",
    "bosnia-herzegovina": "bosnia and herzegovina",
    "bosnia & herzegovina": "bosnia and herzegovina",
    "bosnia and herzegovina": "bosnia and herzegovina",
    # DR Congo / Congo DR
    "dr congo": "dr congo",
    "congo dr": "dr congo",
    "democratic republic of the congo": "dr congo",
    "democratic republic of congo": "dr congo",
    "dr. congo": "dr congo",
    # Netherlands / Holland
    "holland": "netherlands",
    "netherlands": "netherlands",
    # Curaçao / Curacao
    "curacao": "curaçao",
    "curaçao": "curaçao",
}


def _norm(name: Optional[str]) -> str:
    """Lowercase + strip + resolve alias. Returns '' on falsy input.

    Always returns the canonical spelling so two callers using different
    spellings (e.g. 'USA' and 'United States') resolve to the same key.
    """
    if not name or not isinstance(name, str):
        return ""
    base = name.strip().lower()
    if not base:
        return ""
    # Resolve via alias map; unknown names pass through unchanged so we
    # don't silently fail closed on a team we just haven't aliased yet.
    return _TEAM_ALIAS.get(base, base)


def _load_actuals_if_needed() -> dict:
    """Lazy-load + mtime-watch wc2026_actuals.json into the module cache.

    Returns the dict of {(norm_home, norm_away) -> match record}. Empty
    dict if the file is missing or unreadable — callers handle None
    lookups gracefully.
    """
    try:
        mtime = os.path.getmtime(ACTUALS_PATH)
    except OSError:
        _ACTUALS_CACHE["mtime"] = None
        _ACTUALS_CACHE["by_pair"] = {}
        return {}
    if _ACTUALS_CACHE["mtime"] == mtime and _ACTUALS_CACHE["by_pair"]:
        return _ACTUALS_CACHE["by_pair"]
    try:
        with open(ACTUALS_PATH, "r", encoding="utf-8") as f:
            doc = json.load(f)
    except (OSError, ValueError):
        _ACTUALS_CACHE["mtime"] = mtime
        _ACTUALS_CACHE["by_pair"] = {}
        return {}
    by_pair: dict[tuple[str, str], dict] = {}
    for m in (doc.get("matches") or []):
        key = (_norm(m.get("home")), _norm(m.get("away")))
        if key[0] and key[1]:
            by_pair[key] = m
    _ACTUALS_CACHE["mtime"] = mtime
    _ACTUALS_CACHE["by_pair"] = by_pair
    return by_pair


def actual_for(home: str, away: str) -> Optional[str]:
    """Return the verified result string for (home, away), or None.

    Looks up wc2026_actuals.json (cached, mtime-watched) by normalised
    team names. This is the ONLY trusted source of realised scores — the
    audit DB never accepts actuals from caller-supplied parameters,
    preventing hallucinated retroactive 'wins' from being persisted.
    """
    by_pair = _load_actuals_if_needed()
    if not by_pair:
        return None
    rec = by_pair.get((_norm(home), _norm(away)))
    if not rec:
        return None
    result = rec.get("result")
    return result if isinstance(result, str) and result.strip() else None

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  model TEXT NOT NULL,
  competition TEXT,
  match_date TEXT,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  predicted_score TEXT,
  predicted_wdl TEXT,
  p_home REAL,
  p_draw REAL,
  p_away REAL,
  actual_score TEXT,
  actual_wdl TEXT,
  winner_hit INTEGER,
  exact_hit INTEGER,
  brier REAL,
  log_loss REAL,
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_run ON predictions(run_id);
CREATE INDEX IF NOT EXISTS idx_model ON predictions(model);
CREATE INDEX IF NOT EXISTS idx_match ON predictions(home, away);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  generated_at TEXT,
  model TEXT,
  notes TEXT,
  total_matches INTEGER,
  winner_correct INTEGER,
  exact_correct INTEGER,
  winner_accuracy REAL,
  exact_accuracy REAL,
  brier REAL,
  log_loss REAL
);

-- T-8h lock table: at 8h before kickoff the cron locker freezes whatever
-- prediction is current for that fixture so it cannot be retroactively
-- rewritten. PRIMARY KEY on match_n makes the lock idempotent — re-running
-- the locker is a no-op for already-locked matches.
CREATE TABLE IF NOT EXISTS locked_predictions (
  match_n INTEGER PRIMARY KEY,
  locked_at TEXT NOT NULL,
  kickoff_iso TEXT NOT NULL,
  model TEXT NOT NULL,
  home TEXT,
  away TEXT,
  predicted_score TEXT,
  predicted_wdl TEXT,
  p_home REAL,
  p_draw REAL,
  p_away REAL,
  source_run_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_locked_kickoff ON locked_predictions(kickoff_iso);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _wdl_from_score(score: Optional[str]) -> Optional[str]:
    """Parse 'h-a' style score → 'H' / 'D' / 'A'. Returns None on bad input."""
    if not score or not isinstance(score, str):
        return None
    if score in _WDL_FROM_SCORE_CACHE:
        return _WDL_FROM_SCORE_CACHE[score]
    try:
        h_str, a_str = score.split("-", 1)
        h, a = int(h_str.strip()), int(a_str.strip())
    except (ValueError, AttributeError):
        return None
    result = "H" if h > a else ("A" if a > h else "D")
    _WDL_FROM_SCORE_CACHE[score] = result
    return result


def _safe_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


def _brier_3way(p_home: Optional[float], p_draw: Optional[float],
                p_away: Optional[float], actual_wdl: Optional[str]) -> Optional[float]:
    """Three-way Brier score against the realised one-hot outcome."""
    if actual_wdl not in ("H", "D", "A"):
        return None
    ph = _safe_float(p_home) or 0.0
    pd = _safe_float(p_draw) or 0.0
    pa = _safe_float(p_away) or 0.0
    th = 1.0 if actual_wdl == "H" else 0.0
    td = 1.0 if actual_wdl == "D" else 0.0
    ta = 1.0 if actual_wdl == "A" else 0.0
    return (ph - th) ** 2 + (pd - td) ** 2 + (pa - ta) ** 2


def _log_loss_3way(p_home: Optional[float], p_draw: Optional[float],
                   p_away: Optional[float], actual_wdl: Optional[str]) -> Optional[float]:
    """Log loss for the realised outcome — clamps to avoid log(0)."""
    if actual_wdl not in ("H", "D", "A"):
        return None
    pick = {"H": _safe_float(p_home), "D": _safe_float(p_draw), "A": _safe_float(p_away)}[actual_wdl]
    if pick is None:
        return None
    clamped = max(1e-12, min(1.0 - 1e-12, pick))
    return -math.log(clamped)


# ---------------------------------------------------------------------------
# Connection / schema bootstrap
# ---------------------------------------------------------------------------

def init_db(path: str = DB_PATH) -> sqlite3.Connection:
    """Open the DB and ensure the schema exists. Safe to call repeatedly."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    conn.commit()
    return conn


# ---------------------------------------------------------------------------
# Run lifecycle
# ---------------------------------------------------------------------------

def log_run(run_id: str, model: str, notes: Optional[str] = None,
            generated_at: Optional[str] = None,
            conn: Optional[sqlite3.Connection] = None) -> None:
    """Create (or refresh) the runs row for this run_id. Idempotent.

    `notes` is REQUIRED (non-empty after strip) so every run carries a
    human-readable explanation of what produced it. This is part of the
    WC2026 data-integrity guardrails — anonymous runs are not allowed.
    """
    if not run_id or not model:
        raise ValueError("log_run: run_id and model are required")
    if not notes or not str(notes).strip():
        raise ValueError("log_run: notes is required and must be non-empty")
    owns = conn is None
    if owns:
        conn = init_db()
    try:
        conn.execute(
            """INSERT INTO runs (run_id, generated_at, model, notes)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(run_id) DO UPDATE SET
                 generated_at = COALESCE(excluded.generated_at, runs.generated_at),
                 model        = excluded.model,
                 notes        = COALESCE(excluded.notes, runs.notes)""",
            (run_id, generated_at or _utc_now_iso(), model, notes),
        )
        conn.commit()
    finally:
        if owns:
            conn.close()


def log_prediction(run_id: str, model: str, match: dict, prediction: dict,
                   conn: Optional[sqlite3.Connection] = None,
                   generated_at: Optional[str] = None) -> int:
    """Insert one prediction row. Returns the new id.

    match: {home, away, date?/match_date?, competition?}
    prediction: {predicted_score? / expected_score?, p_home, p_draw, p_away,
                 predicted_wdl?, source?}

    Actuals are resolved SERVER-SIDE via actual_for(home, away) against
    the verified wc2026_actuals.json — callers cannot inject realised
    scores. This is a hard guardrail against hallucinated retroactive
    results being persisted into the audit DB.
    """
    if not run_id or not model:
        raise ValueError("log_prediction: run_id and model are required")
    home = (match.get("home") or "").strip()
    away = (match.get("away") or "").strip()
    if not home or not away:
        raise ValueError("log_prediction: match.home + match.away required")

    match_date = match.get("match_date") or match.get("date")
    competition = match.get("competition")

    pred_score = prediction.get("predicted_score") or prediction.get("expected_score")
    p_home = _safe_float(prediction.get("p_home"))
    p_draw = _safe_float(prediction.get("p_draw"))
    p_away = _safe_float(prediction.get("p_away"))
    pred_wdl = prediction.get("predicted_wdl")
    if not pred_wdl and pred_score:
        pred_wdl = _wdl_from_score(pred_score)
    if not pred_wdl and (p_home is not None and p_draw is not None and p_away is not None):
        pick = max(("H", p_home), ("D", p_draw), ("A", p_away), key=lambda kv: kv[1])
        pred_wdl = pick[0]
    source = prediction.get("source")

    # Server-side actuals lookup — single source of truth, no caller input.
    actual_score = actual_for(home, away)
    actual_wdl = _wdl_from_score(actual_score) if actual_score else None

    winner_hit = None
    exact_hit = None
    if actual_wdl and pred_wdl:
        winner_hit = 1 if actual_wdl == pred_wdl else 0
    if actual_score and pred_score:
        exact_hit = 1 if actual_score.strip() == pred_score.strip() else 0

    brier = _brier_3way(p_home, p_draw, p_away, actual_wdl)
    ll = _log_loss_3way(p_home, p_draw, p_away, actual_wdl)

    owns = conn is None
    if owns:
        conn = init_db()
    try:
        cur = conn.execute(
            """INSERT INTO predictions (
                 run_id, generated_at, model, competition, match_date,
                 home, away, predicted_score, predicted_wdl,
                 p_home, p_draw, p_away,
                 actual_score, actual_wdl, winner_hit, exact_hit,
                 brier, log_loss, source
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                run_id, generated_at or _utc_now_iso(), model, competition, match_date,
                home, away, pred_score, pred_wdl,
                p_home, p_draw, p_away,
                actual_score, actual_wdl, winner_hit, exact_hit,
                brier, ll, source,
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        if owns:
            conn.close()


def finalize_run(run_id: str, summary: dict,
                 conn: Optional[sqlite3.Connection] = None) -> None:
    """Write aggregate stats onto the runs row.

    summary keys (all optional):
      total_matches, winner_correct, exact_correct,
      winner_accuracy, exact_accuracy, brier, log_loss
    Missing aggregates are computed from the predictions table where possible.
    """
    if not run_id:
        raise ValueError("finalize_run: run_id required")
    owns = conn is None
    if owns:
        conn = init_db()
    try:
        agg = conn.execute(
            """SELECT
                 COUNT(*) AS n,
                 SUM(CASE WHEN winner_hit=1 THEN 1 ELSE 0 END) AS wc,
                 SUM(CASE WHEN exact_hit=1 THEN 1 ELSE 0 END) AS ec,
                 AVG(brier) AS brier,
                 AVG(log_loss) AS log_loss
               FROM predictions WHERE run_id = ?""",
            (run_id,),
        ).fetchone()
        n = (summary.get("total_matches") if summary.get("total_matches") is not None
             else (agg["n"] if agg else 0))
        wc = (summary.get("winner_correct") if summary.get("winner_correct") is not None
              else (agg["wc"] if agg else None))
        ec = (summary.get("exact_correct") if summary.get("exact_correct") is not None
              else (agg["ec"] if agg else None))
        # Count rows that actually have a graded outcome (winner_hit IS NOT NULL).
        graded_row = conn.execute(
            "SELECT COUNT(*) AS g FROM predictions WHERE run_id = ? AND winner_hit IS NOT NULL",
            (run_id,),
        ).fetchone()
        graded = (graded_row["g"] if graded_row else 0) or 0

        wa = summary.get("winner_accuracy")
        ea = summary.get("exact_accuracy")
        # Only compute accuracy when at least one row has an actual score —
        # otherwise leave NULL so the audit trail doesn't lie with 0.0.
        if wa is None and graded and wc is not None:
            wa = wc / graded
        if ea is None and graded and ec is not None:
            ea = ec / graded
        brier = summary.get("brier") if summary.get("brier") is not None else (agg["brier"] if agg else None)
        ll = summary.get("log_loss") if summary.get("log_loss") is not None else (agg["log_loss"] if agg else None)

        conn.execute(
            """UPDATE runs SET
                 total_matches = ?, winner_correct = ?, exact_correct = ?,
                 winner_accuracy = ?, exact_accuracy = ?, brier = ?, log_loss = ?
               WHERE run_id = ?""",
            (n, wc, ec, wa, ea, brier, ll, run_id),
        )
        if conn.total_changes == 0:
            # No runs row yet — create it with whatever model name we can find.
            model_row = conn.execute(
                "SELECT model FROM predictions WHERE run_id = ? LIMIT 1", (run_id,)
            ).fetchone()
            model_name = (model_row["model"] if model_row else summary.get("model", "unknown"))
            conn.execute(
                """INSERT INTO runs (run_id, generated_at, model, notes,
                                     total_matches, winner_correct, exact_correct,
                                     winner_accuracy, exact_accuracy, brier, log_loss)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (run_id, _utc_now_iso(), model_name, summary.get("notes"),
                 n, wc, ec, wa, ea, brier, ll),
            )
        conn.commit()
    finally:
        if owns:
            conn.close()


# ---------------------------------------------------------------------------
# T-8h lock API
# ---------------------------------------------------------------------------

def is_locked(match_n: int,
              conn: Optional[sqlite3.Connection] = None) -> bool:
    """Return True if a lock row exists for this match number."""
    owns = conn is None
    if owns:
        conn = init_db()
    try:
        row = conn.execute(
            "SELECT 1 FROM locked_predictions WHERE match_n = ? LIMIT 1",
            (int(match_n),),
        ).fetchone()
        return row is not None
    finally:
        if owns:
            conn.close()


def lock_prediction(match_n: int, prediction: dict,
                    conn: Optional[sqlite3.Connection] = None) -> bool:
    """Insert a lock row for match_n. Idempotent — silently no-ops on conflict.

    prediction shape (all strings/floats optional except kickoff_iso + model):
      kickoff_iso, model, home, away,
      predicted_score, predicted_wdl,
      p_home, p_draw, p_away,
      source_run_id

    Returns True if a NEW lock row was inserted, False if the match was
    already locked (so callers can count fresh locks).
    """
    kickoff_iso = (prediction.get("kickoff_iso") or "").strip()
    model = (prediction.get("model") or "").strip()
    if not kickoff_iso or not model:
        raise ValueError("lock_prediction: kickoff_iso and model are required")

    owns = conn is None
    if owns:
        conn = init_db()
    try:
        # INSERT OR IGNORE guarantees idempotency: the cron can re-run every
        # 15 min and only the first call per match_n actually writes.
        cur = conn.execute(
            """INSERT OR IGNORE INTO locked_predictions (
                 match_n, locked_at, kickoff_iso, model,
                 home, away, predicted_score, predicted_wdl,
                 p_home, p_draw, p_away, source_run_id
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                int(match_n),
                _utc_now_iso(),
                kickoff_iso,
                model,
                prediction.get("home"),
                prediction.get("away"),
                prediction.get("predicted_score"),
                prediction.get("predicted_wdl"),
                _safe_float(prediction.get("p_home")),
                _safe_float(prediction.get("p_draw")),
                _safe_float(prediction.get("p_away")),
                prediction.get("source_run_id"),
            ),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        if owns:
            conn.close()


def query_locked_predictions(limit: int = 500,
                             conn: Optional[sqlite3.Connection] = None) -> list[dict]:
    """Return all lock rows (most recent kickoff first), capped at `limit`."""
    owns = conn is None
    if owns:
        conn = init_db()
    try:
        rows = conn.execute(
            "SELECT * FROM locked_predictions "
            "ORDER BY kickoff_iso ASC LIMIT ?",
            (max(1, min(1000, int(limit))),),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        if owns:
            conn.close()


# ---------------------------------------------------------------------------
# Read API
# ---------------------------------------------------------------------------

def _row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def query_recent_runs(limit: int = 20,
                      conn: Optional[sqlite3.Connection] = None) -> list[dict]:
    """Return the last `limit` runs ordered by generated_at desc."""
    owns = conn is None
    if owns:
        conn = init_db()
    try:
        rows = conn.execute(
            "SELECT * FROM runs ORDER BY COALESCE(generated_at,'') DESC LIMIT ?",
            (max(1, min(500, int(limit))),),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        if owns:
            conn.close()


def query_recent_predictions(limit: int = 50, model: Optional[str] = None,
                             conn: Optional[sqlite3.Connection] = None) -> list[dict]:
    """Return the last `limit` predictions (most recent first)."""
    owns = conn is None
    if owns:
        conn = init_db()
    try:
        if model:
            rows = conn.execute(
                "SELECT * FROM predictions WHERE model = ? ORDER BY id DESC LIMIT ?",
                (model, max(1, min(500, int(limit)))),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM predictions ORDER BY id DESC LIMIT ?",
                (max(1, min(500, int(limit))),),
            ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        if owns:
            conn.close()


def query_model_accuracy_summary(
    conn: Optional[sqlite3.Connection] = None,
) -> list[dict]:
    """Per-model live accuracy snapshot used by the WC2026 HTML badges.

    Returns one row per `model` aggregating over the `predictions` table:
      - graded:        rows where winner_hit IS NOT NULL (actual_for() landed an actual)
      - winner_hits:   SUM(winner_hit) within graded rows
      - exact_hits:    SUM(exact_hit)  within graded rows
      - total:         all logged predictions for that model (graded + ungraded)
      - winner_pct:    winner_hits / graded, or None when graded == 0

    Returned shape (sorted by graded desc, model asc):
      [{"model": "...", "total": int, "graded": int,
        "winner_hits": int, "exact_hits": int, "winner_pct": float|None}]
    """
    owns = conn is None
    if owns:
        conn = init_db()
    try:
        rows = conn.execute(
            """
            SELECT
              model,
              COUNT(*) AS total,
              SUM(CASE WHEN winner_hit IS NOT NULL THEN 1 ELSE 0 END) AS graded,
              SUM(CASE WHEN winner_hit = 1 THEN 1 ELSE 0 END) AS winner_hits,
              SUM(CASE WHEN exact_hit  = 1 THEN 1 ELSE 0 END) AS exact_hits
            FROM predictions
            GROUP BY model
            ORDER BY graded DESC, model ASC
            """
        ).fetchall()
        out: list[dict] = []
        for r in rows:
            graded = int(r["graded"] or 0)
            wh = int(r["winner_hits"] or 0)
            eh = int(r["exact_hits"] or 0)
            out.append({
                "model": r["model"],
                "total": int(r["total"] or 0),
                "graded": graded,
                "winner_hits": wh,
                "exact_hits": eh,
                "winner_pct": (wh / graded) if graded > 0 else None,
            })
        return out
    finally:
        if owns:
            conn.close()


# ---------------------------------------------------------------------------
# Backfill — loads existing JSONs into the DB so the audit trail starts at the
# first known prediction the system produced, not at "now".
# ---------------------------------------------------------------------------

def _backfill_elo_model(json_path: str) -> tuple[str, str, int, int]:
    """Backfill the Elo + Bivariate Poisson model JSON.

    Splits into two runs:
      - elo_md1_backtest_<ts>: md1_backtest.details (with actuals)
      - elo_md2_predictions_<ts>: md2_predictions (no actuals yet)
    """
    with open(json_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    model_name = doc.get("model", "elo_bivariate_poisson_dixoncoles")
    generated_at = doc.get("generated_at") or _utc_now_iso()
    ts_tag = (generated_at.replace(":", "").replace("-", "").replace("T", "_").replace("Z", ""))

    md1_run = f"elo_md1_backtest_{ts_tag}"
    md2_run = f"elo_md2_predictions_{ts_tag}"

    conn = init_db()
    md1_inserted = 0
    md2_inserted = 0
    try:
        # MD1 backtest — has actuals
        md1 = doc.get("md1_backtest") or {}
        details = md1.get("details") or []
        if details:
            log_run(md1_run, model_name,
                    notes="Backfill: matchday 1 backtest (predictions WITH realised actuals)",
                    generated_at=generated_at, conn=conn)
            for d in details:
                match_str = d.get("match", "")
                home, away = "", ""
                if " vs " in match_str:
                    home, away = match_str.split(" vs ", 1)
                pred = {
                    "predicted_score": d.get("predicted_score"),
                    "p_home": d.get("p_home"),
                    "p_draw": d.get("p_draw"),
                    "p_away": d.get("p_away"),
                    "predicted_wdl": d.get("predicted_class"),
                    "source": "md1_backtest.details",
                }
                # Actuals come from wc2026_actuals.json server-side now —
                # the source JSON's d.get("actual") is no longer trusted.
                log_prediction(md1_run, model_name,
                               {"home": home, "away": away,
                                "match_date": d.get("date"),
                                "competition": "FIFA World Cup 2026"},
                               pred, conn=conn,
                               generated_at=generated_at)
                md1_inserted += 1
            finalize_run(md1_run, {
                "winner_accuracy": md1.get("winner_accuracy"),
                "exact_accuracy": md1.get("exact_accuracy"),
                "brier": md1.get("brier_score"),
                "log_loss": md1.get("mean_log_loss"),
                "notes": "Backfill: matchday 1 backtest (predictions WITH realised actuals)",
            }, conn=conn)

        # MD2 forward predictions — no actuals yet
        md2 = doc.get("md2_predictions") or []
        if md2:
            log_run(md2_run, model_name,
                    notes="Backfill: matchday 2 forward predictions (no actuals yet)",
                    generated_at=generated_at, conn=conn)
            for p in md2:
                pred = {
                    "predicted_score": p.get("expected_score"),
                    "p_home": p.get("p_home"),
                    "p_draw": p.get("p_draw"),
                    "p_away": p.get("p_away"),
                    "source": "md2_predictions",
                }
                log_prediction(md2_run, model_name,
                               {"home": p.get("home"), "away": p.get("away"),
                                "competition": "FIFA World Cup 2026"},
                               pred, conn=conn,
                               generated_at=generated_at)
                md2_inserted += 1
            finalize_run(md2_run, {
                "notes": "Backfill: matchday 2 forward predictions (no actuals yet)",
            }, conn=conn)
    finally:
        conn.close()

    return md1_run, md2_run, md1_inserted, md2_inserted


def _backfill_llm(json_path: str) -> tuple[str, int]:
    """Backfill the LLM (Ollama qwen2.5:14b) prediction JSON."""
    with open(json_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    model_name = doc.get("model_used", "qwen2.5:14b")
    generated_at = doc.get("generated_at") or _utc_now_iso()
    ts_tag = (generated_at.replace(":", "").replace("-", "").replace("T", "_")
              .replace("Z", "").replace("+", "_"))
    run_id = f"llm_{model_name.replace(':', '_').replace('.', '_')}_{ts_tag}"

    conn = init_db()
    inserted = 0
    try:
        preds = doc.get("predictions") or []
        if preds:
            log_run(run_id, model_name,
                    notes="Backfill: LLM matchday predictions (no actuals yet)",
                    generated_at=generated_at, conn=conn)
            for p in preds:
                pred = {
                    "predicted_score": p.get("predicted_score"),
                    "p_home": p.get("p_home"),
                    "p_draw": p.get("p_draw"),
                    "p_away": p.get("p_away"),
                    "source": "llm_predictions",
                }
                log_prediction(run_id, model_name,
                               {"home": p.get("home"), "away": p.get("away"),
                                "competition": "FIFA World Cup 2026"},
                               pred, conn=conn,
                               generated_at=generated_at)
                inserted += 1
            finalize_run(run_id, {
                "notes": "Backfill: LLM matchday predictions (no actuals yet)",
            }, conn=conn)
    finally:
        conn.close()
    return run_id, inserted


def backfill_all() -> dict:
    """Backfill every known WC2026 prediction JSON into the DB. Idempotent-ish:
    re-running creates new run_ids tagged with a fresh generated_at so older
    audit history is preserved."""
    data_dir = os.path.join(_REPO_ROOT, "server", "data")
    model_json = os.path.join(data_dir, "wc2026_model_predictions.json")
    llm_json = os.path.join(data_dir, "wc2026_llm_predictions.json")

    result: dict[str, Any] = {"runs": []}
    if os.path.exists(model_json):
        md1_run, md2_run, md1_n, md2_n = _backfill_elo_model(model_json)
        result["runs"].append({"run_id": md1_run, "inserted": md1_n})
        result["runs"].append({"run_id": md2_run, "inserted": md2_n})
    if os.path.exists(llm_json):
        llm_run, llm_n = _backfill_llm(llm_json)
        result["runs"].append({"run_id": llm_run, "inserted": llm_n})
    return result


# ---------------------------------------------------------------------------
# CLI — `python -m scripts.wc2026_db --init` / `--backfill` / `--summary`
# ---------------------------------------------------------------------------

def _cli_summary() -> None:
    conn = init_db()
    try:
        rows = conn.execute(
            "SELECT model, COUNT(*) AS n FROM predictions GROUP BY model ORDER BY model"
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) AS n FROM predictions").fetchone()
        print(f"DB: {DB_PATH}")
        print(f"total predictions: {total['n']}")
        for r in rows:
            print(f"  {r['model']:<40} {r['n']:>6}")
        runs = conn.execute(
            "SELECT run_id, model, total_matches, winner_accuracy, brier "
            "FROM runs ORDER BY COALESCE(generated_at,'') DESC LIMIT 10"
        ).fetchall()
        if runs:
            print("recent runs:")
            for r in runs:
                wa = f"{r['winner_accuracy']:.3f}" if r["winner_accuracy"] is not None else "—"
                br = f"{r['brier']:.3f}" if r["brier"] is not None else "—"
                print(f"  {r['run_id']:<55} {r['model']:<35} "
                      f"n={r['total_matches']} wa={wa} brier={br}")
    finally:
        conn.close()


def main(argv: Optional[Iterable[str]] = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="WC2026 prediction audit DB")
    parser.add_argument("--init", action="store_true", help="Create schema if missing")
    parser.add_argument("--backfill", action="store_true",
                        help="Backfill existing WC2026 JSON predictions into the DB")
    parser.add_argument("--summary", action="store_true",
                        help="Print model row counts + recent runs")
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.init or not (args.backfill or args.summary):
        init_db().close()
        print(f"[wc2026_db] schema ensured at {DB_PATH}")
    if args.backfill:
        out = backfill_all()
        for r in out["runs"]:
            print(f"[wc2026_db] backfilled run={r['run_id']} rows={r['inserted']}")
    if args.summary:
        _cli_summary()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
