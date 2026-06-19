"""WC2026 Elo+Poisson 30K random hyperparameter search.

GATEGUARD facts (first-edit context):
- Caller: top-level CLI run (`python wc2026_30k_search.py`). Owner-directed
  one-shot search across 30,000 random hyperparameter samples to find the
  Brier-minimising Elo + bivariate-Poisson + Dixon-Coles configuration.
- Data source: `server/data/wc2026_training_history.csv` (551 historical
  rows, 1994-2024) merged with `server/data/wc2026_actuals.json` (29 played
  WC2026 games, the only trusted source per the data-integrity rule in
  CLAUDE.md).
- Outputs:
    * JSON: `server/data/wc2026_30k_search_results.json` — top-20 variants
      by Brier, baseline numbers, search metadata.
    * SQLite: `search_runs` table in `wc2026_predictions.db` — every
      sampled point logged for later audit.

Method
------
Random uniform sampling across 5 hyperparameters per the user spec:
  K_factor             ~ U(20, 80)
  home_adv             ~ U(0.0, 0.8)    log-lambda bump for home side
  poisson_b            ~ U(0.5, 3.0)
  dc_tau               ~ U(-0.3, +0.3)
  decay_half_life_days ~ U(30, 365)     Heuer (2010) exponential time-decay

For each sample we run a walk-forward backtest:
  1) Warm Elo from the first 100 rows (no scoring).
  2) For each subsequent row, predict via bivariate-Poisson + DC tau, score
     Brier / winner-accuracy / log-loss, then advance the Elo book using
     the sample's K-factor and a Heuer time-decay weight derived from the
     match's age relative to the most-recent training-corpus date.

The match grid is 0..max_goals_h x 0..max_goals_a goals (max_goals=6 — see
the per-match Poisson loop). The DC correction is applied to the four
low-score corner cells (0-0, 0-1, 1-0, 1-1).

Performance budget
------------------
Per-sample cost is dominated by ~600 Poisson pmf evaluations. Using SciPy
`poisson.pmf` is wasteful; we inline the closed-form Poisson pmf with a
precomputed log-gamma table over [0, max_goals]. The vectorised version
runs at ~7-15 ms per sample on this box -> 30k samples ~ 4-7 min
end-to-end, well inside the 25 min budget the user quoted.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone
from math import lgamma
from pathlib import Path
from typing import Any

import numpy as np

PROJECT_ROOT = Path("/opt/jarvis-app-1")
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

# Reuse canonical team aliasing + the BASELINE_ELO book so historical-corpus
# teams start at the same ratings the production predictor uses.
from wc2026_predictor import (  # noqa: E402
    BASELINE_ELO,
    DEFAULT_ELO,
    _canonical_team,
)
import wc2026_db as wdb  # noqa: E402

# ---------------------------------------------------------------------------
# Paths + constants
# ---------------------------------------------------------------------------

HISTORY_CSV = PROJECT_ROOT / "server" / "data" / "wc2026_training_history.csv"
ACTUALS_JSON = PROJECT_ROOT / "server" / "data" / "wc2026_actuals.json"
OUT_JSON = PROJECT_ROOT / "server" / "data" / "wc2026_30k_search_results.json"

POISSON_A = 0.15  # intercept held fixed (only b varies per spec).
WARMUP_N = 100
MAX_GOALS = 6
TOP_K = 20

logger = logging.getLogger("wc2026_30k_search")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Corpus assembly: history CSV + verified WC2026 actuals
# ---------------------------------------------------------------------------

def _parse_date(s: str) -> datetime | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def load_corpus() -> list[dict[str, Any]]:
    """Return the merged training corpus, sorted ascending by date.

    Rows from the history CSV are pre-WC2026 + early WC2026 fixtures.
    We drop any WC2026 rows from the CSV and replace them with the 29
    verified actuals from wc2026_actuals.json (the only trusted source).
    """
    rows: list[dict[str, Any]] = []

    if not HISTORY_CSV.exists():
        raise FileNotFoundError(HISTORY_CSV)
    with HISTORY_CSV.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            if r.get("competition") == "WC2026":
                # Held out — WC2026 rows must come from the verified JSON only.
                continue
            try:
                hg = int(r["hg"])
                ag = int(r["ag"])
            except (KeyError, ValueError):
                continue
            try:
                neutral = bool(int(r.get("neutral", "0") or "0"))
            except ValueError:
                neutral = False
            rows.append({
                "date": r.get("date", ""),
                "home": _canonical_team(r["home"]),
                "away": _canonical_team(r["away"]),
                "hg": hg,
                "ag": ag,
                "neutral": neutral,
                "competition": r.get("competition", "") or "",
                "source": "history_csv",
            })

    if not ACTUALS_JSON.exists():
        raise FileNotFoundError(ACTUALS_JSON)
    actuals = json.loads(ACTUALS_JSON.read_text())
    for m in (actuals.get("matches") or []):
        if not m.get("verified"):
            continue
        result = (m.get("result") or "").strip()
        if "-" not in result:
            continue
        try:
            hs, as_ = result.split("-", 1)
            hg, ag = int(hs.strip()), int(as_.strip())
        except ValueError:
            continue
        rows.append({
            "date": m.get("date", ""),
            "home": _canonical_team(m.get("home", "")),
            "away": _canonical_team(m.get("away", "")),
            "hg": hg,
            "ag": ag,
            # WC2026 group games are played at fixed host venues; treat as
            # neutral (matches the production predictor convention).
            "neutral": True,
            "competition": "WC2026",
            "source": "wc2026_actuals.json",
        })

    rows.sort(key=lambda r: (r["date"], r["competition"], r["home"]))
    return rows


# ---------------------------------------------------------------------------
# Precompute static per-match data
# ---------------------------------------------------------------------------

def precompute_corpus(rows: list[dict[str, Any]]) -> dict[str, np.ndarray]:
    """Materialise scalar arrays so the inner loop avoids dict lookups.

    Returns a dict with float64 / int64 numpy arrays for:
      home_idx, away_idx (team indices into the Elo rating array)
      hg, ag (goal counts)
      neutral (1.0/0.0)
      age_days (days before the reference date == last corpus row)
    Plus the team list and the seeded Elo ratings.
    """
    team_to_idx: dict[str, int] = {}
    teams: list[str] = []
    for r in rows:
        for t in (r["home"], r["away"]):
            if t not in team_to_idx:
                team_to_idx[t] = len(teams)
                teams.append(t)

    n = len(rows)
    home_idx = np.zeros(n, dtype=np.int64)
    away_idx = np.zeros(n, dtype=np.int64)
    hg = np.zeros(n, dtype=np.int64)
    ag = np.zeros(n, dtype=np.int64)
    neutral = np.zeros(n, dtype=np.float64)
    parsed_dates = []

    for i, r in enumerate(rows):
        home_idx[i] = team_to_idx[r["home"]]
        away_idx[i] = team_to_idx[r["away"]]
        hg[i] = r["hg"]
        ag[i] = r["ag"]
        neutral[i] = 1.0 if r["neutral"] else 0.0
        parsed_dates.append(_parse_date(r["date"]) or datetime(2026, 1, 1))

    # age_days = days from this match to the most-recent match in the corpus.
    ref = max(parsed_dates)
    age_days = np.array(
        [(ref - d).days for d in parsed_dates],
        dtype=np.float64,
    )

    # Seed ratings: baseline for known teams, DEFAULT_ELO otherwise.
    ratings0 = np.full(len(teams), DEFAULT_ELO, dtype=np.float64)
    for t, idx in team_to_idx.items():
        ratings0[idx] = BASELINE_ELO.get(t, DEFAULT_ELO)

    return {
        "team_to_idx": team_to_idx,
        "teams": teams,
        "home_idx": home_idx,
        "away_idx": away_idx,
        "hg": hg,
        "ag": ag,
        "neutral": neutral,
        "age_days": age_days,
        "ratings0": ratings0,
    }


# ---------------------------------------------------------------------------
# Fast Poisson pmf for the 0..MAX_GOALS support (NumPy, no SciPy)
# ---------------------------------------------------------------------------

_LOG_FACTORIAL = np.array(
    [lgamma(k + 1.0) for k in range(MAX_GOALS + 1)],
    dtype=np.float64,
)
_KS = np.arange(MAX_GOALS + 1, dtype=np.float64)


def _poisson_pmf(lam: float) -> np.ndarray:
    """Poisson pmf at k=0..MAX_GOALS — closed form, returns float64 array."""
    # log p(k) = k*log(lam) - lam - log(k!)
    log_pmf = _KS * math.log(lam) - lam - _LOG_FACTORIAL
    return np.exp(log_pmf)


def _dc_tau_grid(lam_h: float, lam_a: float, rho: float) -> np.ndarray:
    """Return the 4-cell Dixon-Coles tau multiplier as a 2x2 patch.

    Layout matches grid[:2, :2] indexed by (hg, ag).
    """
    return np.array([
        [1.0 - lam_h * lam_a * rho, 1.0 + lam_h * rho],
        [1.0 + lam_a * rho,         1.0 - rho],
    ], dtype=np.float64)


# ---------------------------------------------------------------------------
# Single-sample walk-forward backtest
# ---------------------------------------------------------------------------

def backtest_one(
    corpus: dict[str, np.ndarray],
    *,
    k_factor: float,
    home_adv: float,
    poisson_b: float,
    dc_tau: float,
    decay_half_life_days: float,
    warmup_n: int = WARMUP_N,
) -> dict[str, float]:
    """Walk-forward backtest for one hyperparameter sample.

    Returns dict with brier, winner_acc, log_loss, n_scored.
    """
    ratings = corpus["ratings0"].copy()
    home_idx = corpus["home_idx"]
    away_idx = corpus["away_idx"]
    hg_arr = corpus["hg"]
    ag_arr = corpus["ag"]
    neutral_arr = corpus["neutral"]
    age_arr = corpus["age_days"]

    n = len(home_idx)
    # Heuer (2010) exponential time-decay weight: w = exp(-ln2 * age / H).
    inv_half = math.log(2.0) / max(decay_half_life_days, 1.0)
    weights = np.exp(-inv_half * age_arr)

    # Precompute log10 / 400.0 scaling once.
    LN10_OVER_400 = math.log(10.0) / 400.0

    brier_sum = 0.0
    log_loss_sum = 0.0
    winner_hits = 0
    n_scored = 0
    eps = 1e-12

    for i in range(n):
        h = int(home_idx[i])
        a = int(away_idx[i])
        hg_i = int(hg_arr[i])
        ag_i = int(ag_arr[i])
        is_neutral = bool(neutral_arr[i])

        elo_h = ratings[h]
        elo_a = ratings[a]
        diff_400 = (elo_h - elo_a) / 400.0

        if i >= warmup_n:
            # Predict before updating Elo (no leakage).
            home_bonus = 0.0 if is_neutral else home_adv
            lam_h = math.exp(POISSON_A + poisson_b * diff_400 + home_bonus)
            lam_a = math.exp(POISSON_A - poisson_b * diff_400)
            # Clamp to safe range so extreme Elo gaps don't blow up the pmf.
            if lam_h < 0.05:
                lam_h = 0.05
            elif lam_h > 8.0:
                lam_h = 8.0
            if lam_a < 0.05:
                lam_a = 0.05
            elif lam_a > 8.0:
                lam_a = 8.0

            pmf_h = _poisson_pmf(lam_h)
            pmf_a = _poisson_pmf(lam_a)
            grid = np.outer(pmf_h, pmf_a)

            # Dixon-Coles low-score correction (4 cells).
            grid[0, 0] *= 1.0 - lam_h * lam_a * dc_tau
            grid[0, 1] *= 1.0 + lam_h * dc_tau
            grid[1, 0] *= 1.0 + lam_a * dc_tau
            grid[1, 1] *= 1.0 - dc_tau

            total = float(grid.sum())
            if total > 0.0:
                grid /= total

            # Triangle sums: p_home (hg>ag), p_draw (hg==ag), p_away.
            p_home = float(np.tril(grid, -1).sum())
            p_draw = float(np.trace(grid))
            p_away = float(np.triu(grid, 1).sum())
            s = p_home + p_draw + p_away
            if s > 0.0:
                p_home /= s
                p_draw /= s
                p_away /= s

            # Score against actual.
            if hg_i > ag_i:
                y_h, y_d, y_a = 1.0, 0.0, 0.0
                actual_cls = 0
                true_p = p_home
            elif hg_i == ag_i:
                y_h, y_d, y_a = 0.0, 1.0, 0.0
                actual_cls = 1
                true_p = p_draw
            else:
                y_h, y_d, y_a = 0.0, 0.0, 1.0
                actual_cls = 2
                true_p = p_away

            brier_sum += (p_home - y_h) ** 2 + (p_draw - y_d) ** 2 + (p_away - y_a) ** 2
            log_loss_sum += -math.log(max(true_p, eps))
            # argmax class -> 0=H, 1=D, 2=A.
            if p_home >= p_draw and p_home >= p_away:
                picked = 0
            elif p_draw >= p_away:
                picked = 1
            else:
                picked = 2
            if picked == actual_cls:
                winner_hits += 1
            n_scored += 1

        # Advance Elo book with margin-of-victory + time-decay weight.
        if hg_i > ag_i:
            score = 1.0
        elif hg_i == ag_i:
            score = 0.5
        else:
            score = 0.0
        gd = abs(hg_i - ag_i)
        if gd <= 1:
            mov = 1.0
        elif gd == 2:
            mov = 1.5
        else:
            mov = (11.0 + gd) / 8.0
        # Logistic expected score for the home side (no Elo home bonus —
        # we encode home advantage in the Poisson log-lambda only, matching
        # the production predictor's convention).
        exp_h = 1.0 / (1.0 + 10.0 ** (-diff_400))
        delta = k_factor * mov * (score - exp_h) * float(weights[i])
        ratings[h] += delta
        ratings[a] -= delta

    if n_scored == 0:
        return {"brier": 0.0, "winner_acc": 0.0, "log_loss": 0.0, "n_scored": 0}
    return {
        "brier": brier_sum / n_scored,
        "winner_acc": winner_hits / n_scored,
        "log_loss": log_loss_sum / n_scored,
        "n_scored": n_scored,
    }


# ---------------------------------------------------------------------------
# 30K random search driver
# ---------------------------------------------------------------------------

# Production baseline (matches wc2026_predictor.py defaults).
BASELINE_PARAMS = {
    "k_factor": 40.0,
    "home_adv": 0.4,
    "poisson_b": 1.6,
    "dc_tau": -0.08,
    "decay_half_life_days": 365.0,  # near-no-decay; matches prod predictor
}


def run_search(
    n_samples: int = 30_000,
    *,
    seed: int = 20260619,
    db_batch: int = 500,
    progress_every: int = 1000,
) -> dict[str, Any]:
    logger.info("loading corpus: %s + %s", HISTORY_CSV.name, ACTUALS_JSON.name)
    rows = load_corpus()
    n_total = len(rows)
    n_wc26 = sum(1 for r in rows if r["competition"] == "WC2026")
    n_hist = n_total - n_wc26
    logger.info(
        "loaded %d rows (history=%d + verified WC2026 actuals=%d); warmup=%d",
        n_total, n_hist, n_wc26, WARMUP_N,
    )
    if n_wc26 != 29:
        logger.warning(
            "expected 29 verified WC2026 actuals, got %d; check wc2026_actuals.json",
            n_wc26,
        )

    corpus = precompute_corpus(rows)

    # Baseline once.
    baseline = backtest_one(corpus, **BASELINE_PARAMS)
    logger.info(
        "baseline: brier=%.5f winner=%.4f log_loss=%.4f n=%d",
        baseline["brier"], baseline["winner_acc"], baseline["log_loss"],
        baseline["n_scored"],
    )

    rng = np.random.default_rng(seed)
    # Pre-sample all 30K hyperparameter vectors in one shot — random calls
    # are cheap, and pre-sampling makes the seed fully deterministic.
    k_samples = rng.uniform(20.0, 80.0, size=n_samples)
    ha_samples = rng.uniform(0.0, 0.8, size=n_samples)
    b_samples = rng.uniform(0.5, 3.0, size=n_samples)
    tau_samples = rng.uniform(-0.3, 0.3, size=n_samples)
    half_samples = rng.uniform(30.0, 365.0, size=n_samples)

    # Build a generated-at stamp + a search id for the audit table.
    started = time.monotonic()
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    search_id = f"wc2026_30k_search_{ts_tag}"
    logger.info("starting random search: n_samples=%d search_id=%s",
                n_samples, search_id)

    # Track top-K with a simple sorted list (n=20 is tiny; bisect/heap not
    # justified vs raw insertion sort on a 20-element list).
    top: list[dict[str, Any]] = []

    db_rows: list[dict[str, Any]] = []
    total_inserted = 0

    last_log = started
    for i in range(n_samples):
        params = {
            "k_factor": float(k_samples[i]),
            "home_adv": float(ha_samples[i]),
            "poisson_b": float(b_samples[i]),
            "dc_tau": float(tau_samples[i]),
            "decay_half_life_days": float(half_samples[i]),
        }
        m = backtest_one(corpus, **params)
        row = {
            "sample_idx": i,
            **params,
            "brier": m["brier"],
            "winner_acc": m["winner_acc"],
            "log_loss": m["log_loss"],
            "n_scored": m["n_scored"],
        }
        db_rows.append(row)

        # Maintain top-20 by Brier (lower is better).
        if len(top) < TOP_K or m["brier"] < top[-1]["brier"]:
            top.append({"params": params, **m})
            top.sort(key=lambda r: r["brier"])
            if len(top) > TOP_K:
                top.pop()

        if len(db_rows) >= db_batch:
            total_inserted += wdb.log_search_samples(search_id, db_rows)
            db_rows = []

        if (i + 1) % progress_every == 0:
            now = time.monotonic()
            elapsed = now - started
            rate = (i + 1) / elapsed
            eta = (n_samples - (i + 1)) / rate if rate > 0 else 0.0
            logger.info(
                "progress: %d/%d (%.1f samples/s, eta=%.0fs) "
                "current best brier=%.5f",
                i + 1, n_samples, rate, eta,
                top[0]["brier"] if top else float("nan"),
            )
            last_log = now

    if db_rows:
        total_inserted += wdb.log_search_samples(search_id, db_rows)

    elapsed = time.monotonic() - started
    logger.info(
        "search done in %.1fs (%.1f samples/s); db rows inserted=%d",
        elapsed, n_samples / max(elapsed, 1e-9), total_inserted,
    )

    return {
        "search_id": search_id,
        "n_samples": n_samples,
        "elapsed_seconds": round(elapsed, 1),
        "warmup_n": WARMUP_N,
        "corpus": {
            "total": n_total,
            "history_rows": n_hist,
            "wc2026_actuals_rows": n_wc26,
            "n_scored_per_sample": baseline["n_scored"],
        },
        "baseline_params": dict(BASELINE_PARAMS),
        "baseline_brier": round(baseline["brier"], 5),
        "baseline_winner": round(baseline["winner_acc"], 4),
        "baseline_log_loss": round(baseline["log_loss"], 4),
        "top_20": [
            {
                "params": {k: round(v, 4) for k, v in t["params"].items()},
                "brier": round(t["brier"], 5),
                "winner_acc": round(t["winner_acc"], 4),
                "log_loss": round(t["log_loss"], 4),
                "n_scored": t["n_scored"],
            }
            for t in top
        ],
        "db_rows_inserted": total_inserted,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="WC2026 Elo+Poisson 30K random hyperparameter search",
    )
    parser.add_argument("--n", type=int, default=30_000,
                        help="Number of random samples (default: 30000)")
    parser.add_argument("--seed", type=int, default=20260619,
                        help="RNG seed for reproducibility")
    parser.add_argument("--out", type=Path, default=OUT_JSON,
                        help="Output JSON path")
    args = parser.parse_args()

    payload = run_search(n_samples=args.n, seed=args.seed)
    payload["generated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    out_path = args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, out_path)
    logger.info("wrote %s (%d bytes)", out_path, out_path.stat().st_size)

    # Tight stdout summary.
    logger.info("=== TOP 5 BY BRIER ===")
    for rank, t in enumerate(payload["top_20"][:5], 1):
        p = t["params"]
        logger.info(
            "#%d K=%.2f ha=%.3f b=%.3f tau=%+.3f hl=%.1fd "
            "-> brier=%.5f winner=%.4f log_loss=%.4f",
            rank, p["k_factor"], p["home_adv"], p["poisson_b"],
            p["dc_tau"], p["decay_half_life_days"],
            t["brier"], t["winner_acc"], t["log_loss"],
        )
    logger.info(
        "baseline brier=%.5f winner=%.4f log_loss=%.4f (K=40 ha=0.4 b=1.6 tau=-0.08 hl=365)",
        payload["baseline_brier"], payload["baseline_winner"], payload["baseline_log_loss"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
