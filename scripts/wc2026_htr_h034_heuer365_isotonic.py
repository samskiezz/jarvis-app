"""HTR h-034 — Combine the 365d-Heuer-decay Elo (best of h-010 sweep) with
isotonic calibration evaluated under honest 5-fold cross-validation.

Lineage
-------
- Parent A: h-010 (Heuer half-life sweep). h-010 picked half_life=365d as the
  Brier-minimising decay; that becomes the *raw* probability source.
- Parent B: h-012 (isotonic calibration with proper 5-fold CV and the
  candidate-minus-baseline sign convention).

Hypothesis
----------
The 365d-Heuer Elo already lifts Brier vs the 90d baseline. Layering a
5-fold-CV isotonic re-mapping on top of those probabilities should further
flatten residual calibration error without re-introducing the in-sample
fit that originally sank h-003.

Method
------
1. Re-warm the Elo book at DECAY_DAYS = 365 (the h-010 winner) and grade
   every verified WC2026 actual via predict_match → (p_home, p_draw, p_away).
   This is the "vanilla 365d-Heuer" baseline.
2. 5-fold KFold(shuffle=True, random_state=20260619) over the graded matches.
   For each fold, fit one-vs-rest IsotonicRegression on the held-IN raw
   probabilities and re-normalise per row; predict the held-OUT raw probs
   through that fold's calibrator. Every match ends up scored by a model
   that never saw it (no in-sample fit).
3. Per-match three-way Brier on both the vanilla and the CV-calibrated
   probabilities. Paired bootstrap (5000 reps, seed 20260619) of the mean
   per-match delta = brier_calibrated - brier_vanilla.
4. real_lift is True iff ci_95[1] < 0 strictly.

Data discipline (WC2026 non-negotiables)
----------------------------------------
- Actuals are resolved server-side via scripts.wc2026_db.actual_for(home, away)
  — no actual_score / actual_wdl injected by the caller.
- Output JSON carries verified=True + source + record-level traceability.
- log_run is called with a non-empty notes string.

Output: server/data/wc2026_htr_h034_heuer365_isotonic.json
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.model_selection import KFold

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import wc2026_upgrade_heuer as heuer  # noqa: E402
import wc2026_db as wdb  # noqa: E402


logger = logging.getLogger("wc2026_htr_h034_heuer365_isotonic")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


REPO_ROOT = Path("/opt/jarvis-app-1")
OUT_JSON = REPO_ROOT / "server" / "data" / "wc2026_htr_h034_heuer365_isotonic.json"

# Best half-life from h-010 sweep (parent node).
DECAY_DAYS_BEST: float = 365.0

CLASSES = ("H", "D", "A")
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}

N_FOLDS: int = 5
BOOTSTRAP_REPS: int = 5000
BOOTSTRAP_SEED: int = 20260619


def _brier_3way(ph: float, pd_: float, pa: float, actual: str) -> float:
    th = 1.0 if actual == "H" else 0.0
    td = 1.0 if actual == "D" else 0.0
    ta = 1.0 if actual == "A" else 0.0
    return (ph - th) ** 2 + (pd_ - td) ** 2 + (pa - ta) ** 2


def _fit_isotonic_per_class(
    probs: np.ndarray, labels: list[str]
) -> list[IsotonicRegression]:
    """One-vs-rest isotonic regressors (H, D, A) trained on `probs`/`labels`."""
    fitted: list[IsotonicRegression] = []
    for cls_idx, cls in enumerate(CLASSES):
        y = np.array([1.0 if lbl == cls else 0.0 for lbl in labels], dtype=float)
        x = probs[:, cls_idx]
        ir = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        ir.fit(x, y)
        fitted.append(ir)
    return fitted


def _apply_isotonic(
    fitted: list[IsotonicRegression], probs: np.ndarray
) -> np.ndarray:
    """Apply per-class isotonic mapping and renormalise rows to sum to 1.0."""
    cal = np.zeros_like(probs, dtype=float)
    for cls_idx, ir in enumerate(fitted):
        cal[:, cls_idx] = ir.predict(probs[:, cls_idx])
    row_sums = cal.sum(axis=1, keepdims=True)
    # Guard against the (extremely unlikely) all-zero row from heavy clipping.
    row_sums[row_sums == 0] = 1.0
    return cal / row_sums


def _audit_log(
    run_id: str,
    model_name: str,
    notes: str,
    graded_records: list[dict[str, Any]],
) -> int:
    """Persist run + per-match probabilities to the audit DB.

    Actuals are resolved server-side by wdb.log_prediction → no
    actual_score / actual_wdl injected here.
    """
    rows = 0
    try:
        conn = wdb.init_db()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit DB unavailable for %s: %s", model_name, exc)
        return 0
    try:
        wdb.log_run(run_id, model_name, notes=notes, conn=conn)
        for g in graded_records:
            pred = {
                "predicted_score": None,
                "p_home": float(g["p_home"]),
                "p_draw": float(g["p_draw"]),
                "p_away": float(g["p_away"]),
                "source": f"wc2026_htr_h034_heuer365_isotonic.{model_name}",
            }
            try:
                wdb.log_prediction(
                    run_id,
                    model_name,
                    {
                        "home": g["home"],
                        "away": g["away"],
                        "match_date": g["date"],
                        "competition": "FIFA World Cup 2026",
                    },
                    pred,
                    conn=conn,
                )
                rows += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "log_prediction failed for %s vs %s under %s: %s",
                    g["home"], g["away"], model_name, exc,
                )
        wdb.finalize_run(run_id, {"notes": notes}, conn=conn)
    finally:
        conn.close()
    return rows


def main() -> dict[str, Any]:
    history = heuer._load_history()
    if not history:
        raise RuntimeError("empty historical corpus")
    actuals = heuer._load_actuals()
    if not actuals:
        raise RuntimeError("no verified WC2026 actuals to grade against")
    now_date = history[-1][0]

    logger.info(
        "corpus rows=%d span=%s..%s actuals=%d decay_days=%.0f",
        len(history), history[0][0].isoformat(), now_date.isoformat(),
        len(actuals), DECAY_DAYS_BEST,
    )

    # ---- 1) Vanilla 365d-Heuer predictions ---------------------------------
    original_decay = heuer.DECAY_DAYS
    try:
        heuer.DECAY_DAYS = DECAY_DAYS_BEST
        elo = heuer.warm_elo(history, weighted=True, now_date=now_date)
        graded = heuer.grade_actuals(elo, actuals)
    finally:
        heuer.DECAY_DAYS = original_decay

    n = len(graded)
    if n < N_FOLDS:
        raise RuntimeError(
            f"only {n} graded matches — need >= {N_FOLDS} for 5-fold CV"
        )

    probs_raw = np.array(
        [[g.p_home, g.p_draw, g.p_away] for g in graded], dtype=float
    )
    labels = [g.actual_wdl for g in graded]

    vanilla_briers = np.array([g.brier for g in graded], dtype=float)
    vanilla_hits = np.array([g.winner_hit for g in graded], dtype=int)

    # ---- 2) 5-fold CV isotonic calibration ---------------------------------
    cal_probs = np.full_like(probs_raw, np.nan)
    fold_diagnostics: list[dict[str, Any]] = []
    kf = KFold(n_splits=N_FOLDS, shuffle=True, random_state=BOOTSTRAP_SEED)
    for fold_idx, (train_idx, test_idx) in enumerate(kf.split(np.arange(n))):
        fitted = _fit_isotonic_per_class(
            probs_raw[train_idx], [labels[i] for i in train_idx]
        )
        cal_test = _apply_isotonic(fitted, probs_raw[test_idx])
        for j, i in enumerate(test_idx):
            cal_probs[i] = cal_test[j]
        fold_brier_van = float(np.mean(vanilla_briers[test_idx]))
        fold_brier_cal = float(np.mean([
            _brier_3way(*cal_test[j], labels[i])
            for j, i in enumerate(test_idx)
        ]))
        fold_diagnostics.append({
            "fold": fold_idx,
            "n_train": int(len(train_idx)),
            "n_test": int(len(test_idx)),
            "test_brier_vanilla": round(fold_brier_van, 6),
            "test_brier_calibrated": round(fold_brier_cal, 6),
        })

    if np.isnan(cal_probs).any():
        raise RuntimeError("every match must be assigned to exactly one fold")

    # Per-match Brier on the CV-calibrated probabilities.
    calibrated_briers = np.array([
        _brier_3way(cal_probs[i, 0], cal_probs[i, 1], cal_probs[i, 2], labels[i])
        for i in range(n)
    ], dtype=float)

    # Winner-pick accuracy on CV-calibrated probs.
    calibrated_picks = [
        max(("H", cal_probs[i, 0]), ("D", cal_probs[i, 1]), ("A", cal_probs[i, 2]),
            key=lambda kv: kv[1])[0]
        for i in range(n)
    ]
    calibrated_hits = np.array(
        [1 if calibrated_picks[i] == labels[i] else 0 for i in range(n)],
        dtype=int,
    )

    # ---- 3) Means + paired bootstrap on the delta --------------------------
    brier_vanilla = float(np.mean(vanilla_briers))
    brier_calibrated = float(np.mean(calibrated_briers))
    brier_delta = brier_calibrated - brier_vanilla  # negative = improvement

    per_match_delta = calibrated_briers - vanilla_briers
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    boot_means = np.empty(BOOTSTRAP_REPS, dtype=float)
    for b in range(BOOTSTRAP_REPS):
        idx = rng.integers(0, n, size=n)
        boot_means[b] = float(np.mean(per_match_delta[idx]))
    ci_lo = float(np.percentile(boot_means, 2.5))
    ci_hi = float(np.percentile(boot_means, 97.5))
    real_lift = bool(ci_hi < 0.0)

    winner_acc_heuer = float(np.mean(vanilla_hits))
    winner_acc_combined = float(np.mean(calibrated_hits))

    # ---- 4) Audit DB rows --------------------------------------------------
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_van = f"htr_h034_heuer365_vanilla_{ts_tag}"
    run_cal = f"htr_h034_heuer365_isotonic_cv_{ts_tag}"

    vanilla_records = [{
        "date": g.date,
        "home": g.home,
        "away": g.away,
        "p_home": g.p_home,
        "p_draw": g.p_draw,
        "p_away": g.p_away,
    } for g in graded]
    calibrated_records = [{
        "date": graded[i].date,
        "home": graded[i].home,
        "away": graded[i].away,
        "p_home": float(cal_probs[i, 0]),
        "p_draw": float(cal_probs[i, 1]),
        "p_away": float(cal_probs[i, 2]),
    } for i in range(n)]

    rows_van = _audit_log(
        run_van,
        "elo_heuer_decay365d",
        notes=(
            "HTR h-034 vanilla 365d-Heuer-decay Elo (w=exp(-age_days/365)) "
            f"re-warm on {len(history)}-match corpus; graded vs verified "
            f"WC2026 actuals; baseline for the h-034 isotonic-CV comparison; "
            f"paired-bootstrap reps={BOOTSTRAP_REPS}, seed={BOOTSTRAP_SEED}."
        ),
        graded_records=vanilla_records,
    )
    rows_cal = _audit_log(
        run_cal,
        "elo_heuer_decay365d_isotonic_5foldcv",
        notes=(
            "HTR h-034 365d-Heuer-decay Elo + one-vs-rest isotonic "
            f"calibration under honest {N_FOLDS}-fold KFold(shuffle=True, "
            f"random_state={BOOTSTRAP_SEED}); per fold isotonic is fit on "
            "held-IN raw probs and applied to held-OUT only, with row "
            "renormalisation; paired bootstrap "
            f"reps={BOOTSTRAP_REPS}, seed={BOOTSTRAP_SEED}; sign "
            "convention delta = brier_calibrated - brier_vanilla (negative "
            "= improvement); real_lift iff ci_95[1] < 0 strictly."
        ),
        graded_records=calibrated_records,
    )

    payload: dict[str, Any] = {
        "schema": "wc2026_htr_h034_heuer365_isotonic.v1",
        "verified": True,
        "source": (
            "scripts/wc2026_htr_h034_heuer365_isotonic.py — 365d-Heuer-decay "
            "Elo (h-010 best half-life) re-warmed on full historical corpus, "
            "graded vs verified WC2026 actuals resolved server-side via "
            "scripts.wc2026_db.actual_for; one-vs-rest "
            "sklearn.isotonic.IsotonicRegression calibration under 5-fold "
            f"KFold(shuffle=True, random_state={BOOTSTRAP_SEED}); paired "
            f"bootstrap (reps={BOOTSTRAP_REPS}, seed={BOOTSTRAP_SEED})."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "node_id": "h-034",
        "parent_nodes": ["h-010", "h-012"],
        "method": (
            "365d-Heuer-decay Elo (w=exp(-age_days/365)) + bivariate Poisson "
            "+ Dixon-Coles → raw 3-way probs → per-class isotonic regression "
            "under honest 5-fold cross-validation (every match scored by a "
            "calibrator it was never trained on) → row renormalisation"
        ),
        "decay_days": int(DECAY_DAYS_BEST),
        "now_date": now_date.isoformat(),
        "corpus_size": len(history),
        "graded_matches": n,
        "n_folds": N_FOLDS,
        "bootstrap_reps": BOOTSTRAP_REPS,
        "bootstrap_seed": BOOTSTRAP_SEED,
        "sign_convention": (
            "brier_delta = brier_calibrated - brier_vanilla; negative=better; "
            "real_lift iff ci_95[1] < 0 strictly"
        ),
        # Required return keys ------------------------------------------------
        "heuer365_brier": round(brier_vanilla, 6),
        "heuer365_iso_brier": round(brier_calibrated, 6),
        "brier_delta": round(brier_delta, 6),
        "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
        "real_lift": real_lift,
        "winner_acc_heuer": round(winner_acc_heuer, 6),
        "winner_acc_combined": round(winner_acc_combined, 6),
        # Diagnostics ---------------------------------------------------------
        "fold_diagnostics": fold_diagnostics,
        "audit_runs": {
            "vanilla": {"run_id": run_van, "rows_logged": rows_van},
            "isotonic_cv": {"run_id": run_cal, "rows_logged": rows_cal},
        },
        "notes": (
            "h-034 = h-010 best (365d-Heuer-decay Elo) + h-012-style 5-fold "
            "isotonic-CV calibration. Real lift requires the 95% paired-"
            "bootstrap CI on the per-match delta to lie strictly below 0 "
            "(ci_95[1] < 0). Actuals come exclusively from server-side "
            "scripts.wc2026_db.actual_for(home, away); no caller-injected "
            "actual_score / actual_wdl."
        ),
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    logger.info("wrote %s", OUT_JSON)
    return payload


if __name__ == "__main__":
    out = main()
    summary = {
        "heuer365_brier": out["heuer365_brier"],
        "heuer365_iso_brier": out["heuer365_iso_brier"],
        "brier_delta": out["brier_delta"],
        "ci_95": out["ci_95"],
        "real_lift": out["real_lift"],
        "winner_acc_heuer": out["winner_acc_heuer"],
        "winner_acc_combined": out["winner_acc_combined"],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
