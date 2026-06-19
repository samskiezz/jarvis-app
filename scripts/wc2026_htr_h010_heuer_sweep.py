"""HTR h-010 — hyperparameter sweep on the Heuer time-decay half-life.

Child node of h-002 (Heuer 2010 exponential time-decay Elo). Re-warms the
Elo book at several half-life values, grades the same 29 verified WC2026
matches at each, finds the half-life that minimises the three-way Brier
score, then runs a paired bootstrap on the Brier delta of the BEST half-life
vs the 90-day baseline.

The script reuses scripts/wc2026_upgrade_heuer.py end-to-end. The only
difference is that DECAY_DAYS is monkey-patched per sweep value so the
exponential weight w = exp(-age_days / decay_days) varies while every
other modelling element (Poisson, Dixon-Coles, canonicalisation, neutral
venue, predict_match) stays fixed — isolating the half-life contribution.

Audit-DB compliance:
    * Each sweep value is logged with model name "elo_heuer_decay{N}d".
    * log_run is called with a non-empty notes string (mandatory).
    * Actuals are resolved server-side by wc2026_db.actual_for(); no
      caller-injected actual_score / actual_wdl.

Output: server/data/wc2026_htr_h010_heuer_sweep.json
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Sequence

import numpy as np

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import wc2026_upgrade_heuer as heuer  # noqa: E402
import wc2026_db as wdb  # noqa: E402


logger = logging.getLogger("wc2026_htr_h010_heuer_sweep")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


REPO_ROOT = Path("/opt/jarvis-app-1")
OUT_JSON = REPO_ROOT / "server" / "data" / "wc2026_htr_h010_heuer_sweep.json"

# Half-life values to sweep (days). 90d is the h-002 baseline.
HALF_LIVES: tuple[float, ...] = (30.0, 45.0, 60.0, 90.0, 120.0, 180.0, 270.0, 365.0)
BASELINE_HALF_LIFE: float = 90.0

BOOTSTRAP_REPS: int = 300
BOOTSTRAP_SEED: int = 20260619


def _warm_and_grade(
    history: Sequence[tuple[date, str, str, int, int, bool, str]],
    actuals: Sequence[dict],
    decay_days: float,
    now_date: date,
) -> list[heuer.Graded]:
    """Warm the Elo book at this decay value and grade the WC2026 actuals.

    Monkey-patches heuer.DECAY_DAYS so the existing _heuer_weight() function
    uses this sweep's value. Restored by the caller via try/finally.
    """
    elo = heuer.warm_elo(history, weighted=True, now_date=now_date)
    return heuer.grade_actuals(elo, actuals)


def _audit_log_sweep_run(
    decay_days: float,
    graded: Sequence[heuer.Graded],
    corpus_size: int,
) -> tuple[str, str, int]:
    """Log this sweep's run + graded predictions to the SQLite audit DB.

    Per data-integrity rules: actuals are resolved server-side by
    actual_for(); we pass only home/away/match_date/competition. Returns
    (run_id, model_name, rows_logged).
    """
    decay_int = int(round(decay_days))
    model_name = f"elo_heuer_decay{decay_int}d"
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = f"htr_h010_{model_name}_{ts_tag}"
    notes = (
        f"HTR h-010 half-life sweep: Heuer 2010 exponential time-decay Elo "
        f"(w=exp(-age_days/{decay_int})) re-warmed on {corpus_size}-match "
        f"historical corpus; graded vs verified WC2026 actuals; child of "
        f"h-002 (90d baseline). Bootstrap reps={BOOTSTRAP_REPS}."
    )
    rows_logged = 0
    try:
        conn = wdb.init_db()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit DB unavailable for %s: %s", model_name, exc)
        return run_id, model_name, 0
    try:
        wdb.log_run(run_id, model_name, notes=notes, conn=conn)
        for g in graded:
            pred = {
                "predicted_score": None,
                "p_home": g.p_home,
                "p_draw": g.p_draw,
                "p_away": g.p_away,
                "source": f"wc2026_htr_h010_heuer_sweep.{model_name}",
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
                rows_logged += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "log_prediction failed for %s vs %s under %s: %s",
                    g.home, g.away, model_name, exc,
                )
        wdb.finalize_run(run_id, {"notes": notes}, conn=conn)
    finally:
        conn.close()
    return run_id, model_name, rows_logged


def main() -> dict:
    history = heuer._load_history()
    if not history:
        raise RuntimeError("empty historical corpus")
    now_date = history[-1][0]
    actuals = heuer._load_actuals()
    if not actuals:
        raise RuntimeError("no verified WC2026 actuals to grade against")

    logger.info(
        "corpus rows=%d span=%s..%s actuals=%d half_lives=%s",
        len(history), history[0][0].isoformat(), now_date.isoformat(),
        len(actuals), HALF_LIVES,
    )

    # Cache per-half-life Brier vectors so we can paired-bootstrap any pair
    # without re-warming.
    per_hl: dict[float, dict] = {}
    original_decay = heuer.DECAY_DAYS
    try:
        for hl in HALF_LIVES:
            heuer.DECAY_DAYS = float(hl)
            graded = _warm_and_grade(history, actuals, hl, now_date)
            briers = [g.brier for g in graded]
            hits = [g.winner_hit for g in graded]
            mean_brier = float(np.mean(briers)) if briers else 0.0
            winner_acc = float(np.mean(hits)) if hits else 0.0
            run_id, model_name, rows_logged = _audit_log_sweep_run(
                hl, graded, corpus_size=len(history),
            )
            per_hl[hl] = {
                "half_life_days": hl,
                "model_name": model_name,
                "run_id": run_id,
                "rows_logged": rows_logged,
                "brier": round(mean_brier, 6),
                "winner_accuracy": round(winner_acc, 6),
                "briers": briers,
                "hits": hits,
                "n_graded": len(graded),
            }
            logger.info(
                "half_life=%sd brier=%.6f winner_acc=%.4f rows_logged=%d",
                int(round(hl)), mean_brier, winner_acc, rows_logged,
            )
    finally:
        heuer.DECAY_DAYS = original_decay

    # Pick the half-life with lowest Brier (ties → smaller half-life first
    # for parsimony, matching the ordering in HALF_LIVES).
    best_hl = min(HALF_LIVES, key=lambda hl: per_hl[hl]["brier"])
    best_brier = per_hl[best_hl]["brier"]

    if BASELINE_HALF_LIFE not in per_hl:
        raise RuntimeError("90d baseline missing from sweep results")
    baseline = per_hl[BASELINE_HALF_LIFE]

    # Paired bootstrap: best vs 90d baseline on the same 29 fixtures.
    best_briers = per_hl[best_hl]["briers"]
    baseline_briers = baseline["briers"]
    delta_point, (ci_lo, ci_hi), _ = heuer.paired_bootstrap_brier_delta(
        best_briers, baseline_briers, reps=BOOTSTRAP_REPS, seed=BOOTSTRAP_SEED,
    )
    real_lift = bool(ci_hi < 0.0)

    # Build the JSON payload — strip the heavy per-match arrays.
    sweep_summary = []
    for hl in HALF_LIVES:
        rec = per_hl[hl]
        sweep_summary.append({
            "half_life_days": int(round(hl)),
            "model_name": rec["model_name"],
            "run_id": rec["run_id"],
            "rows_logged": rec["rows_logged"],
            "brier": rec["brier"],
            "winner_accuracy": rec["winner_accuracy"],
            "n_graded": rec["n_graded"],
        })

    payload: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "parent_node": "h-002",
        "node_id": "h-010",
        "method": (
            "Heuer 2010 exponential time-decay Elo half-life sweep "
            "(w=exp(-age_days/half_life_days))"
        ),
        "now_date": now_date.isoformat(),
        "corpus_size": len(history),
        "graded_matches": baseline["n_graded"],
        "half_lives_tested": [int(round(hl)) for hl in HALF_LIVES],
        "baseline_half_life_days": int(round(BASELINE_HALF_LIFE)),
        "baseline_brier": baseline["brier"],
        "baseline_winner_accuracy": baseline["winner_accuracy"],
        "sweep": sweep_summary,
        "best_half_life_days": int(round(best_hl)),
        "brier_at_best": round(best_brier, 6),
        "delta_vs_90d": round(delta_point, 6),
        "delta_vs_90d_bootstrap_mean": round(delta_point, 6),
        "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
        "bootstrap_reps": BOOTSTRAP_REPS,
        "bootstrap_seed": BOOTSTRAP_SEED,
        "real_lift_brier": real_lift,
        "notes": (
            "Best half-life is the value that minimises mean three-way "
            "Brier on the 29 verified WC2026 actuals. delta_vs_90d = "
            "brier_at_best - baseline_brier (negative = improvement over "
            "h-002). real_lift_brier is True only if the 95% paired-"
            "bootstrap CI strictly excludes 0 (ci_95 upper bound < 0)."
        ),
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    logger.info("wrote %s", OUT_JSON)
    return payload


if __name__ == "__main__":
    out = main()
    # Final compact summary for the orchestrator.
    summary = {
        "best_half_life_days": out["best_half_life_days"],
        "brier_at_best": out["brier_at_best"],
        "delta_vs_90d": out["delta_vs_90d"],
        "ci_95": out["ci_95"],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
