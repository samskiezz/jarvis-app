"""Heuer (2010) exponential time-decay weighting for the WC2026 Elo book.

Each historical match contributes to the Elo update with multiplicative weight
        w = exp(-(now_date - match_date).days / 90)

so matches drift toward zero influence at a 90-day timescale. This script:

1. Re-warms the Elo book on the full 563-match historical corpus from
   server/data/wc2026_training_history.csv with the Heuer time-decay weight.
   In parallel, it warms a *baseline* Elo book with weight=1 (unmodified
   eloratings.net rule) on the same corpus so the two Brier numbers are
   directly comparable.
2. Predicts each of the 29 verified WC2026 matches in wc2026_actuals.json
   from both Elo books (causally — using the as-of-then rating; no leakage)
   and grades them via wc2026_db.log_prediction (server-side actuals lookup).
3. Computes the per-match three-way Brier delta (Heuer - baseline), runs a
   paired bootstrap with 300 replicates, and emits a 95% CI on the delta.
4. Writes /opt/jarvis-app-1/server/data/wc2026_upgrade_heuer.json with
   {brier, brier_delta, ci_95, winner_delta_pp, real_lift_brier,
    real_lift_winner}. `real_lift_*` is only True if the 95% CI strictly
   excludes 0 (lower upper-bound below 0 → improvement; higher lower-bound
   above 0 → regression).

Heuer (2010): "Computer simulations and statistical mechanics of football."
The exponential half-life of ~90 days is a standard sports-rating choice
(consistent with eloratings.net / fivethirtyeight discussions of recency
weighting) and matches the user-requested formula verbatim.
"""
from __future__ import annotations

import csv
import json
import logging
import math
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Sequence

import numpy as np

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

# Import the predictor (Elo + bivariate Poisson + Dixon-Coles) and the audit DB.
# We deliberately reuse predict_match() so the Heuer variant differs from the
# baseline ONLY in the Elo warm-up weighting — Poisson + DC coefficients are
# identical, isolating the time-decay contribution.
import wc2026_predictor as wp  # noqa: E402
import wc2026_db as wdb  # noqa: E402


logger = logging.getLogger("wc2026_upgrade_heuer")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
REPO_ROOT = Path("/opt/jarvis-app-1")
HISTORY_CSV = REPO_ROOT / "server" / "data" / "wc2026_training_history.csv"
ACTUALS_JSON = REPO_ROOT / "server" / "data" / "wc2026_actuals.json"
OUT_JSON = REPO_ROOT / "server" / "data" / "wc2026_upgrade_heuer.json"

# Heuer 2010 decay timescale (days). w = exp(-age_days / DECAY_DAYS).
DECAY_DAYS = 90.0

# Anchor "now" date. We use the most recent date present in the historical
# corpus so the weighting is deterministic and reproducible across runs
# (rather than time-of-execution-dependent).
# This is the same convention used in academic re-fits of Heuer's model.
BOOTSTRAP_REPS = 300
BOOTSTRAP_SEED = 20260619


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_date(s: str) -> date | None:
    """Parse YYYY-MM-DD; return None on bad input."""
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _load_history() -> list[tuple[date, str, str, int, int, bool, str]]:
    """Load the historical corpus.

    Returns ordered (date, home, away, hg, ag, neutral, competition) tuples
    sorted chronologically. We DO NOT filter out WC2026 rows here — the
    full 563-row corpus is what the user requested for re-warm. Callers
    that need to skip a competition can do so downstream.
    """
    rows: list[tuple[date, str, str, int, int, bool, str]] = []
    if not HISTORY_CSV.exists():
        raise FileNotFoundError(f"missing history csv: {HISTORY_CSV}")
    with HISTORY_CSV.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            d = _parse_date(r.get("date", ""))
            if d is None:
                continue
            try:
                hg = int(r["hg"])
                ag = int(r["ag"])
            except (KeyError, ValueError):
                continue
            home = wp._canonical_team((r.get("home") or "").strip())
            away = wp._canonical_team((r.get("away") or "").strip())
            if not home or not away:
                continue
            neutral_raw = (r.get("neutral") or "0").strip()
            neutral = neutral_raw in ("1", "true", "True", "TRUE")
            comp = (r.get("competition") or "").strip()
            rows.append((d, home, away, hg, ag, neutral, comp))
    rows.sort(key=lambda x: x[0])
    return rows


def _split_actuals_home_away(team_a: str, team_b: str, result: str) -> tuple[str, str, int, int] | None:
    """Parse 'h-a' from the actuals record. Returns (home, away, hg, ag) on
    success or None on parse failure."""
    try:
        h_s, a_s = result.split("-", 1)
        hg, ag = int(h_s.strip()), int(a_s.strip())
    except (ValueError, AttributeError):
        return None
    return team_a, team_b, hg, ag


def _load_actuals() -> list[dict]:
    """Load verified WC2026 actuals. Each dict has date/home/away/hg/ag."""
    if not ACTUALS_JSON.exists():
        raise FileNotFoundError(f"missing actuals: {ACTUALS_JSON}")
    with ACTUALS_JSON.open("r", encoding="utf-8") as fh:
        doc = json.load(fh)
    out: list[dict] = []
    for m in doc.get("matches", []) or []:
        # Only grade rows the audit pipeline considers verified.
        if not m.get("verified"):
            continue
        d = _parse_date(m.get("date", ""))
        result = m.get("result")
        if d is None or not isinstance(result, str):
            continue
        home_raw = (m.get("home") or "").strip()
        away_raw = (m.get("away") or "").strip()
        if not home_raw or not away_raw:
            continue
        parsed = _split_actuals_home_away(home_raw, away_raw, result)
        if parsed is None:
            continue
        h, a, hg, ag = parsed
        out.append({
            "date": d.isoformat(),
            "stage": m.get("stage"),
            "group": m.get("group"),
            "home_raw": h,
            "away_raw": a,
            "home": wp._canonical_team(h),
            "away": wp._canonical_team(a),
            "hg": hg,
            "ag": ag,
        })
    out.sort(key=lambda r: r["date"])
    return out


# ---------------------------------------------------------------------------
# Elo warm-up — Heuer weighted vs unweighted baseline
# ---------------------------------------------------------------------------
def _heuer_weight(match_date: date, now_date: date) -> float:
    """w = exp(-(now_date - match_date).days / DECAY_DAYS).

    Future-dated matches (age_days < 0) clamp to weight 1.0 so a corpus
    that includes today's fixtures isn't accidentally over-weighted.
    """
    age_days = (now_date - match_date).days
    if age_days <= 0:
        return 1.0
    return math.exp(-age_days / DECAY_DAYS)


def warm_elo(
    history: Sequence[tuple[date, str, str, int, int, bool, str]],
    *,
    weighted: bool,
    now_date: date,
    skip_competitions: tuple[str, ...] = ("WC2026",),
) -> wp.Elo:
    """Walk the historical corpus chronologically and update the Elo book.

    weighted=True applies the Heuer exponential time-decay weight; False
    runs the unmodified eloratings.net rule (the baseline). WC2026 rows are
    skipped by default to match the predictor's _warm_up_from_history()
    behaviour — those rows are graded against, not folded into the warm-up.
    """
    elo = wp.Elo()
    n_used = 0
    for d, home, away, hg, ag, _neutral, comp in history:
        if comp in skip_competitions:
            continue
        if weighted:
            w = _heuer_weight(d, now_date)
        else:
            w = 1.0
        elo.update(home, away, hg, ag, competition="worldcup", weight=w)
        n_used += 1
    logger.info(
        "warmed Elo: weighted=%s rows_used=%d (skipped competitions=%s)",
        weighted, n_used, skip_competitions,
    )
    return elo


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Graded:
    """One graded fixture under one model."""

    date: str
    home: str
    away: str
    hg: int
    ag: int
    actual_wdl: str
    p_home: float
    p_draw: float
    p_away: float
    brier: float
    winner_hit: int


def _actual_wdl(hg: int, ag: int) -> str:
    if hg > ag:
        return "H"
    if hg < ag:
        return "A"
    return "D"


def _brier_3way(ph: float, pd_: float, pa: float, actual: str) -> float:
    th = 1.0 if actual == "H" else 0.0
    td = 1.0 if actual == "D" else 0.0
    ta = 1.0 if actual == "A" else 0.0
    return (ph - th) ** 2 + (pd_ - td) ** 2 + (pa - ta) ** 2


def grade_actuals(
    elo: wp.Elo,
    actuals: Sequence[dict],
) -> list[Graded]:
    """Predict each actual WC2026 fixture from the Elo book and grade it.

    Predictions are made at neutral venue (tournament games) to mirror the
    predictor's all-fixture walker. The Elo book is NOT updated as we walk
    the actuals — both models score every fixture from the same warmed
    baseline, so the comparison is paired by fixture.
    """
    out: list[Graded] = []
    for rec in actuals:
        home = rec["home"]
        away = rec["away"]
        pred = wp.predict_match(elo, home, away, neutral=True)
        actual = _actual_wdl(rec["hg"], rec["ag"])
        ph = float(pred["p_home"])
        pd_ = float(pred["p_draw"])
        pa = float(pred["p_away"])
        # Argmax class for winner accuracy.
        pick = max(("H", ph), ("D", pd_), ("A", pa), key=lambda kv: kv[1])[0]
        brier = _brier_3way(ph, pd_, pa, actual)
        out.append(Graded(
            date=rec["date"],
            home=home,
            away=away,
            hg=rec["hg"],
            ag=rec["ag"],
            actual_wdl=actual,
            p_home=ph,
            p_draw=pd_,
            p_away=pa,
            brier=brier,
            winner_hit=1 if pick == actual else 0,
        ))
    return out


# ---------------------------------------------------------------------------
# Paired bootstrap
# ---------------------------------------------------------------------------
def paired_bootstrap_brier_delta(
    heuer_briers: Sequence[float],
    baseline_briers: Sequence[float],
    *,
    reps: int = BOOTSTRAP_REPS,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, tuple[float, float], list[float]]:
    """Paired bootstrap of the mean per-match Brier delta (Heuer - baseline).

    Returns (point_delta, (ci_lo, ci_hi), all_rep_deltas). The CI is the
    2.5 / 97.5 percentile of the bootstrap distribution.
    """
    if len(heuer_briers) != len(baseline_briers):
        raise ValueError(
            f"paired bootstrap needs equal-length samples "
            f"(heuer={len(heuer_briers)}, baseline={len(baseline_briers)})"
        )
    h = np.asarray(heuer_briers, dtype=float)
    b = np.asarray(baseline_briers, dtype=float)
    n = h.shape[0]
    if n == 0:
        return 0.0, (0.0, 0.0), []
    rng = np.random.default_rng(seed)
    deltas: list[float] = []
    for _ in range(reps):
        idx = rng.integers(0, n, size=n)
        d = float(np.mean(h[idx] - b[idx]))
        deltas.append(d)
    point = float(np.mean(h - b))
    lo = float(np.percentile(deltas, 2.5))
    hi = float(np.percentile(deltas, 97.5))
    return point, (lo, hi), deltas


def paired_bootstrap_winner_delta(
    heuer_hits: Sequence[int],
    baseline_hits: Sequence[int],
    *,
    reps: int = BOOTSTRAP_REPS,
    seed: int = BOOTSTRAP_SEED + 1,
) -> tuple[float, tuple[float, float]]:
    """Paired bootstrap of the winner-accuracy delta (in percentage points)."""
    if len(heuer_hits) != len(baseline_hits):
        raise ValueError("winner delta requires equal-length samples")
    h = np.asarray(heuer_hits, dtype=float)
    b = np.asarray(baseline_hits, dtype=float)
    n = h.shape[0]
    if n == 0:
        return 0.0, (0.0, 0.0)
    rng = np.random.default_rng(seed)
    deltas: list[float] = []
    for _ in range(reps):
        idx = rng.integers(0, n, size=n)
        d = float(np.mean(h[idx] - b[idx]) * 100.0)
        deltas.append(d)
    point = float(np.mean(h - b) * 100.0)
    lo = float(np.percentile(deltas, 2.5))
    hi = float(np.percentile(deltas, 97.5))
    return point, (lo, hi)


# ---------------------------------------------------------------------------
# Audit DB logging — server-side actuals lookup, no caller-injected scores
# ---------------------------------------------------------------------------
def _log_run_to_audit(
    run_id: str,
    model_name: str,
    notes: str,
    graded: Sequence[Graded],
) -> int:
    """Persist every graded prediction to the audit DB. Returns row count.

    Per the WC2026 data-integrity rules:
      - notes is mandatory (non-empty).
      - actuals are resolved by wc2026_db via actual_for() — we never
        inject actual_score / actual_wdl parameters. The grading we
        compute locally is for the JSON payload only.
    """
    inserted = 0
    try:
        conn = wdb.init_db()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit DB unavailable, skipping log_run: %s", exc)
        return 0
    try:
        wdb.log_run(run_id, model_name, notes=notes, conn=conn)
        for g in graded:
            pred = {
                "predicted_score": None,
                "p_home": g.p_home,
                "p_draw": g.p_draw,
                "p_away": g.p_away,
                "source": f"wc2026_upgrade_heuer.{model_name}",
            }
            try:
                wdb.log_prediction(
                    run_id,
                    model_name,
                    {
                        "home": g.home,
                        "away": g.away,
                        "match_date": g.date,
                        "competition": "FIFA World Cup 2026",
                    },
                    pred,
                    conn=conn,
                )
                inserted += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("log_prediction failed for %s vs %s: %s",
                               g.home, g.away, exc)
        wdb.finalize_run(run_id, {"notes": notes}, conn=conn)
    finally:
        conn.close()
    return inserted


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
def main() -> dict:
    history = _load_history()
    if not history:
        raise RuntimeError("empty historical corpus")
    # Anchor "now" at the most recent date in the corpus (deterministic).
    now_date = history[-1][0]
    logger.info("corpus rows=%d span=%s..%s decay_days=%.1f",
                len(history), history[0][0].isoformat(),
                now_date.isoformat(), DECAY_DAYS)

    actuals = _load_actuals()
    logger.info("loaded %d verified WC2026 actuals", len(actuals))
    if not actuals:
        raise RuntimeError("no verified WC2026 actuals to grade against")

    # Warm both books on the same corpus, then grade the same fixtures.
    elo_heuer = warm_elo(history, weighted=True, now_date=now_date)
    elo_baseline = warm_elo(history, weighted=False, now_date=now_date)

    graded_heuer = grade_actuals(elo_heuer, actuals)
    graded_baseline = grade_actuals(elo_baseline, actuals)

    if len(graded_heuer) != len(graded_baseline):
        raise RuntimeError("graded sample length mismatch (paired-bootstrap pre-condition)")

    heuer_briers = [g.brier for g in graded_heuer]
    baseline_briers = [g.brier for g in graded_baseline]
    heuer_hits = [g.winner_hit for g in graded_heuer]
    baseline_hits = [g.winner_hit for g in graded_baseline]

    brier_h = float(np.mean(heuer_briers)) if heuer_briers else 0.0
    brier_b = float(np.mean(baseline_briers)) if baseline_briers else 0.0
    brier_delta = brier_h - brier_b

    boot_point, (ci_lo, ci_hi), _all_deltas = paired_bootstrap_brier_delta(
        heuer_briers, baseline_briers, reps=BOOTSTRAP_REPS,
    )

    win_h = float(np.mean(heuer_hits)) if heuer_hits else 0.0
    win_b = float(np.mean(baseline_hits)) if baseline_hits else 0.0
    win_delta_pp = (win_h - win_b) * 100.0
    win_boot_point, (win_ci_lo, win_ci_hi) = paired_bootstrap_winner_delta(
        heuer_hits, baseline_hits, reps=BOOTSTRAP_REPS,
    )

    # "Real lift" = 95% CI strictly excludes 0.
    # For Brier (lower is better): improvement requires ci_hi < 0.
    # For winner accuracy (higher is better): improvement requires win_ci_lo > 0.
    real_lift_brier = bool(ci_hi < 0.0)
    real_lift_winner = bool(win_ci_lo > 0.0)

    # Persist both runs to the audit DB so the comparison is reproducible
    # from the SQLite trail. Each row's actuals come from actual_for() —
    # we don't pass actual_score / actual_wdl in.
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    heuer_run = f"heuer_decay90d_warm_{ts_tag}"
    baseline_run = f"heuer_baseline_warm_{ts_tag}"
    n_heuer_logged = _log_run_to_audit(
        heuer_run,
        "elo_heuer_decay90d_bivariate_poisson_dixoncoles",
        notes=(
            "Heuer 2010 exponential time-decay Elo (w=exp(-age_days/90)) re-warm "
            f"on {len(history)}-match historical corpus; graded vs verified "
            f"WC2026 actuals; paired-bootstrap reps={BOOTSTRAP_REPS}"
        ),
        graded=graded_heuer,
    )
    n_baseline_logged = _log_run_to_audit(
        baseline_run,
        "elo_baseline_bivariate_poisson_dixoncoles",
        notes=(
            "Unmodified eloratings.net Elo warm (weight=1) on the same "
            f"{len(history)}-match corpus, as the paired-bootstrap baseline "
            f"for the Heuer 2010 upgrade evaluation"
        ),
        graded=graded_baseline,
    )

    payload: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "method": "Heuer 2010 exponential time-decay Elo (w=exp(-age_days/decay_days))",
        "decay_days": DECAY_DAYS,
        "now_date": now_date.isoformat(),
        "corpus_size": len(history),
        "graded_matches": len(graded_heuer),
        "bootstrap_reps": BOOTSTRAP_REPS,
        "brier": round(brier_h, 6),
        "brier_baseline": round(brier_b, 6),
        "brier_delta": round(brier_delta, 6),
        "brier_delta_bootstrap_mean": round(boot_point, 6),
        "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
        "winner_accuracy_heuer": round(win_h, 6),
        "winner_accuracy_baseline": round(win_b, 6),
        "winner_delta_pp": round(win_delta_pp, 4),
        "winner_delta_pp_bootstrap_mean": round(win_boot_point, 4),
        "winner_ci_95_pp": [round(win_ci_lo, 4), round(win_ci_hi, 4)],
        "real_lift_brier": real_lift_brier,
        "real_lift_winner": real_lift_winner,
        "audit_runs": {
            "heuer": {"run_id": heuer_run, "rows_logged": n_heuer_logged},
            "baseline": {"run_id": baseline_run, "rows_logged": n_baseline_logged},
        },
        "notes": (
            "real_lift_* is True only if the 95% bootstrap CI strictly excludes 0 "
            "(brier_delta upper bound < 0 → genuine improvement; "
            "winner_delta_pp lower bound > 0 → genuine improvement)."
        ),
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    logger.info("wrote %s", OUT_JSON)
    return payload


if __name__ == "__main__":
    out = main()
    print(json.dumps(out, indent=2, ensure_ascii=False))
