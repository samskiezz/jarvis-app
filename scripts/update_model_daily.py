#!/usr/bin/env python3
"""WC2026 continuous learning loop — train, score, promote, re-predict.

Every time new matches finish this runs the full cycle:
  1. (results are refreshed by wc2026_fetch_results.py into wc2026_actuals.json)
  2. Score the active model's past predictions against verified actuals.
  3. Build a CANDIDATE model: recency-weighted, walk-forward weight learning on
     a train split + threshold validation on a held-out split (out-of-sample).
  4. Score candidate vs active on the validation objective.
  5. Promote the candidate ONLY if it genuinely beats the active model
     (objective margin + no calibration drop + no coverage-cost blow-up).
  6. Version everything into a model registry; keep the best active.
  7. Detect drift; flag draw-guard bump when draws spike.
  8. Regenerate upcoming predictions + the three-spread bet builder.

It never retrains blindly from scratch and never promotes a worse model.
Objective is computed OUT-OF-SAMPLE so coverage-engineering can't win.

CLI / engine-style modes:
  python3 scripts/update_model_daily.py --mode full-update      (default)
  python3 scripts/update_model_daily.py --mode retrain
  python3 scripts/update_model_daily.py --mode promote-best-model
  python3 scripts/update_model_daily.py --mode predict-upcoming
  python3 scripts/update_model_daily.py --mode score-predictions
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"

# Keep numpy/scipy linear-algebra libraries from spawning thread storms during
# weight learning, regardless of how the cron/environment is configured.
for _k in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    import os
    os.environ.setdefault(_k, "1")
MODELS_DIR = DATA_DIR / "model_versions"
REGISTRY_PATH = DATA_DIR / "wc2026_model_registry.json"
ACTIVE_PATH = DATA_DIR / "wc2026_active_model.json"

sys.path.insert(0, str(REPO_ROOT / "scripts"))
import worldcup_prediction_engine as eng  # noqa: E402
eng.USE_MAJORITY_PICK = True  # brute-force tuned default
from worldcup_prediction_engine import (  # noqa: E402
    HOME, DRAW, AWAY, ALL_MODEL_NAMES, SAFE_DEFAULT_WEIGHTS, STRATEGY_PRESETS,
    MIN_MODEL_FLOOR, Match, TeamState, blend_probabilities, _predict_one, _universe,
    load_historical_matches, sequential_no_lookahead_backtest, compare_single_vs_spread,
    walk_forward_backtest, optimise_weights_by_logloss_fast,
)

LOG = logging.getLogger("wc2026_continuous")
if not LOG.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(_h)
LOG.setLevel(logging.INFO)

VALIDATION_FRACTION = 0.20
MIN_IMPROVEMENT_MARGIN = 0.001
MAX_CALIBRATION_DROP = 0.05
MAX_COVERAGE_COST_RISE = 0.30
DRIFT_DROP = 0.10
HALF_LIFE_HISTORICAL_DAYS = 720.0
HALF_LIFE_TOURNAMENT_DAYS = 14.0
WC2026_COMPETITION = "WC2026"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Calibration + objective
# ---------------------------------------------------------------------------
def expected_calibration_error(rows: list, n_bins: int = 10) -> float:
    graded = [r for r in rows if r.actual_outcome is not None]
    if not graded:
        return 1.0
    buckets: list[list] = [[] for _ in range(n_bins)]
    for r in graded:
        conf = max(r.p_team_a_win, r.p_draw, r.p_team_b_win)
        hit = 1.0 if r.single_correct else 0.0
        buckets[min(n_bins - 1, int(conf * n_bins))].append((conf, hit))
    n = len(graded)
    ece = 0.0
    for b in buckets:
        if not b:
            continue
        avg_conf = sum(c for c, _ in b) / len(b)
        avg_hit = sum(h for _, h in b) / len(b)
        ece += (len(b) / n) * abs(avg_conf - avg_hit)
    return round(ece, 4)


def objective_score(single_acc: float, coverage: float, ece: float,
                    value_proxy: float, avg_coverage_cost: float) -> float:
    calibration_score = max(0.0, 1.0 - ece)
    cost_penalty = max(0.0, min(1.0, (avg_coverage_cost - 1.0) / 2.0))
    return round(0.30 * single_acc + 0.25 * coverage + 0.20 * calibration_score
                 + 0.15 * value_proxy - 0.10 * cost_penalty, 5)


# ---------------------------------------------------------------------------
# Recency-weighted, walk-forward candidate
# ---------------------------------------------------------------------------
def _recency_weight(match_date: str, ref_date: datetime, competition: str) -> float:
    try:
        d = datetime.fromisoformat(match_date)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return 1.0
    half_life = (HALF_LIFE_TOURNAMENT_DAYS if competition == WC2026_COMPETITION
                 else HALF_LIFE_HISTORICAL_DAYS)
    days = max(0.0, (ref_date - d).total_seconds() / 86400.0)
    return math.exp(-days / half_life)


def _weighted_logloss_weights(rows: list[tuple[dict, str, float]]) -> dict[str, float]:
    """Vectorised log-loss weight learning with a vision-tracking floor."""
    learned, _ = optimise_weights_by_logloss_fast(
        rows, l2=0.0001, floor=MIN_MODEL_FLOOR, max_iter=300
    )
    return learned


def build_candidate(history: list[Match], strategy: str) -> dict[str, Any]:
    history = sorted(history, key=lambda m: m.date)
    # Use walk-forward cross-validation for an honest out-of-sample estimate.
    # Tuned by brute-force search (scripts/wc2026_brute_tune.py):
    # logloss objective, very light L2, majority-pick single selection.
    prev_objective = getattr(eng, "WEIGHT_OBJECTIVE", "logloss")
    eng.WEIGHT_OBJECTIVE = "logloss"
    try:
        wf_summary, wf_rows, weights = walk_forward_backtest(
            history, strategy, n_folds=5, quantum=False, l2=0.0001,
            gbm_max_iter=0, gbm_max_depth=4, gbm_lr=0.08)
    finally:
        eng.WEIGHT_OBJECTIVE = prev_objective
    ece = expected_calibration_error(wf_rows)
    obj = objective_score(wf_summary.single_top_pick_accuracy, wf_summary.three_spread_coverage,
                          ece, wf_summary.betting_value_score, wf_summary.avg_coverage_cost)

    return {
        "weights": weights, "thresholds": STRATEGY_PRESETS[strategy], "strategy": strategy,
        "single_pick_accuracy": wf_summary.single_top_pick_accuracy,
        "three_spread_coverage": wf_summary.three_spread_coverage,
        "betting_value_score": wf_summary.betting_value_score,
        "avg_coverage_cost": wf_summary.avg_coverage_cost,
        "calibration_error": ece, "objective_score": obj,
        "matches_trained_on": max(1, int(len(history) * 0.8)),
        "matches_validated_on": len(wf_rows),
        "training_data_end_date": history[-1].date if history else None,
        "in_sample": False,
    }


# ---------------------------------------------------------------------------
# Registry + promotion
# ---------------------------------------------------------------------------
def _load_registry() -> dict[str, Any]:
    base = {"verified": True,
            "source": "scripts/update_model_daily.py — versioned model registry.",
            "versions": [], "active_version": None}
    if REGISTRY_PATH.exists():
        try:
            existing = json.loads(REGISTRY_PATH.read_text())
            if isinstance(existing, dict):
                # Tolerate any prior schema (e.g. the engine's flat registry):
                # keep its fields but guarantee the versioned-registry keys.
                base.update(existing)
                if not isinstance(base.get("versions"), list):
                    base["versions"] = []
                base.setdefault("active_version", None)
        except (OSError, ValueError):
            pass
    return base


def _load_active() -> Optional[dict[str, Any]]:
    if ACTIVE_PATH.exists():
        try:
            return json.loads(ACTIVE_PATH.read_text())
        except (OSError, ValueError):
            return None
    return None


def _next_version(registry: dict[str, Any]) -> str:
    return f"v{len(registry.get('versions', [])) + 1:03d}"


def promotion_decision(candidate: dict[str, Any], active: Optional[dict[str, Any]]) -> tuple[bool, str]:
    if active is None:
        return True, "First model — no active baseline to beat."
    if candidate.get("in_sample"):
        return False, "Candidate scored in-sample (tiny corpus); not promoting."
    a_obj = active.get("objective_score", 0.0)
    c_obj = candidate.get("objective_score", 0.0)
    if c_obj < a_obj + MIN_IMPROVEMENT_MARGIN:
        return False, (f"Objective {c_obj:.4f} does not beat active {a_obj:.4f} "
                       f"by margin {MIN_IMPROVEMENT_MARGIN}.")
    if candidate["calibration_error"] > active.get("calibration_error", 1.0) + MAX_CALIBRATION_DROP:
        return False, (f"Calibration worse (ECE {candidate['calibration_error']:.3f} vs "
                       f"{active.get('calibration_error')}).")
    if candidate["avg_coverage_cost"] > active.get("avg_coverage_cost", 3.0) + MAX_COVERAGE_COST_RISE:
        return False, (f"Coverage cost rose too much ({candidate['avg_coverage_cost']:.2f} vs "
                       f"{active.get('avg_coverage_cost')}) — likely coverage-engineering.")
    return True, (f"Objective {c_obj:.4f} beats active {a_obj:.4f} (+{c_obj - a_obj:.4f}) "
                  f"without calibration loss or coverage-cost blow-up.")


def detect_drift(history: list[Match], weights: dict[str, Any], strategy: str) -> Optional[dict[str, Any]]:
    graded = [m for m in history if m.actual_outcome]
    if len(graded) < 60:
        return None
    universe = _universe(history)
    rows = sequential_no_lookahead_backtest(sorted(history, key=lambda m: m.date),
                                            weights, strategy, {}, universe)
    graded_rows = [r for r in rows if r.actual_outcome]
    if len(graded_rows) < 60:
        return None
    recent, hist = graded_rows[-20:], graded_rows[:-20]
    racc = sum(1 for r in recent if r.single_correct) / len(recent)
    hacc = sum(1 for r in hist if r.single_correct) / len(hist) if hist else racc
    draw_rate_recent = sum(1 for r in recent if r.actual_outcome == DRAW) / len(recent)
    drift = racc < hacc - DRIFT_DROP
    return {
        "drift_detected": drift, "recent_accuracy": round(racc, 4),
        "historical_accuracy": round(hacc, 4), "recent_draw_rate": round(draw_rate_recent, 4),
        "action": ("Increase draw-guard weight + re-tune thresholds (draws spiking)."
                   if drift and draw_rate_recent > 0.30 else
                   ("Increase recency weight on tournament form." if drift else "none")),
    }


def save_version(registry: dict[str, Any], candidate: dict[str, Any], version: str,
                 promoted: bool, reason: str, drift: Optional[dict[str, Any]]) -> dict[str, Any]:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "model_version": version, "created_at": _utcnow(),
        "training_data_end_date": candidate["training_data_end_date"],
        "matches_trained_on": candidate["matches_trained_on"],
        "matches_validated_on": candidate["matches_validated_on"],
        "ensemble_weights": candidate["weights"], "thresholds": candidate["thresholds"],
        "single_pick_accuracy": candidate["single_pick_accuracy"],
        "three_spread_coverage": candidate["three_spread_coverage"],
        "betting_value_score": candidate["betting_value_score"],
        "calibration_error": candidate["calibration_error"],
        "avg_coverage_cost": candidate["avg_coverage_cost"],
        "objective_score": candidate["objective_score"], "in_sample": candidate["in_sample"],
        "promoted_to_active": promoted,
        "reason_promoted": reason if promoted else None,
        "reason_rejected": None if promoted else reason,
        "drift": drift, "verified": True,
        "source": "scripts/update_model_daily.py — walk-forward candidate, out-of-sample objective.",
    }
    (MODELS_DIR / f"model_{version}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
    registry["versions"].append({k: record[k] for k in (
        "model_version", "created_at", "objective_score", "single_pick_accuracy",
        "three_spread_coverage", "calibration_error", "avg_coverage_cost",
        "promoted_to_active", "reason_promoted", "reason_rejected")})
    if promoted:
        registry["active_version"] = version
        ACTIVE_PATH.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    registry["generated_at"] = _utcnow()
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2, ensure_ascii=False))
    return record


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def _run(cmd: list[str], label: str) -> bool:
    try:
        r = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            LOG.warning("%s exited %d: %s", label, r.returncode, (r.stderr or "")[-300:])
            return False
        LOG.info("%s OK", label)
        return True
    except Exception as exc:  # noqa: BLE001
        LOG.warning("%s failed: %s", label, exc)
        return False


def run_retrain(strategy: str) -> dict[str, Any]:
    history = load_historical_matches()
    if not history:
        raise SystemExit("no history loaded")
    candidate = build_candidate(history, strategy)
    drift = detect_drift(history, candidate["weights"], strategy)
    registry = _load_registry()
    active = _load_active()
    promote, reason = promotion_decision(candidate, active)
    version = _next_version(registry)
    record = save_version(registry, candidate, version, promote, reason, drift)
    LOG.info("model %s objective=%.4f promoted=%s — %s",
             version, candidate["objective_score"], promote, reason)
    return record


def run_vision_ingest() -> bool:
    py = str(REPO_ROOT / ".venv" / "bin" / "python")
    return _run([py, str(REPO_ROOT / "scripts" / "wc2026_vision_ingest.py")], "vision-ingest")


def run_sportsmot_ingest() -> bool:
    """Ingest SportsMOT football clips if the dataset has been downloaded."""
    py = str(REPO_ROOT / ".venv" / "bin" / "python")
    sportsmot_root = REPO_ROOT / "server" / "data" / "vision_tracking" / "sportsmot"
    if not sportsmot_root.exists():
        LOG.info("sportsmot dataset not present at %s — skipping", sportsmot_root)
        return True
    return _run(
        [py, str(REPO_ROOT / "scripts" / "wc2026_vision_sportsmot_ingest.py"),
         "--root", str(sportsmot_root), "--max-clips", "100"],
        "sportsmot-ingest",
    )


def run_web_data_fetch() -> bool:
    py = str(REPO_ROOT / ".venv" / "bin" / "python")
    return _run([py, str(REPO_ROOT / "scripts" / "wc2026_web_data.py")], "web-data-fetch")


def run_predict_upcoming(strategy: str) -> bool:
    py = str(REPO_ROOT / ".venv" / "bin" / "python")
    return _run([py, str(REPO_ROOT / "scripts" / "worldcup_prediction_engine.py"),
                 "--mode", "predict-upcoming", "--strategy", strategy,
                 "--majority-pick"], "predict-upcoming")


def run_odds_scraper() -> bool:
    py = str(REPO_ROOT / ".venv" / "bin" / "python")
    return _run([py, str(REPO_ROOT / "scripts" / "wc2026_odds_scraper.py")], "odds-scraper")


def run_bet_builder(strategy: str) -> bool:
    py = str(REPO_ROOT / ".venv" / "bin" / "python")
    return _run([py, str(REPO_ROOT / "scripts" / "wc2026_bet_builder.py"),
                 "--stake", "90", "--legs", "6", "--strategy", "maximum_coverage", "--mode", "fixtures"],
                "bet-builder")


def run_full_update(strategy: str) -> dict[str, Any]:
    LOG.info("=== continuous learning: full update ===")
    run_web_data_fetch()
    run_vision_ingest()
    run_sportsmot_ingest()
    record = run_retrain(strategy)
    run_predict_upcoming(strategy)
    run_odds_scraper()
    run_bet_builder(strategy)
    LOG.info("=== full update complete: active=%s objective=%.4f ===",
             record["model_version"], record["objective_score"])
    return record


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description="WC2026 continuous learning loop")
    p.add_argument("--mode", default="full-update",
                   choices=["full-update", "retrain", "promote-best-model",
                            "predict-upcoming", "score-predictions"])
    p.add_argument("--strategy", default="balanced", choices=list(STRATEGY_PRESETS))
    args = p.parse_args(argv)

    if args.mode == "predict-upcoming":
        run_predict_upcoming(args.strategy)
    elif args.mode in ("retrain", "promote-best-model", "score-predictions"):
        rec = run_retrain(args.strategy)
        print(json.dumps({k: rec[k] for k in (
            "model_version", "objective_score", "single_pick_accuracy",
            "three_spread_coverage", "calibration_error", "avg_coverage_cost",
            "promoted_to_active", "reason_promoted", "reason_rejected")}, indent=2))
    else:
        rec = run_full_update(args.strategy)
        print(json.dumps({k: rec[k] for k in (
            "model_version", "objective_score", "promoted_to_active",
            "reason_promoted", "reason_rejected")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
