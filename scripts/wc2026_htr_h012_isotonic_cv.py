"""HTR h-012 — Isotonic calibration with proper 5-fold cross-validation.

Child of h-003 (rejected for sign-convention inversion + train/test overlap).

Goals
-----
1. Use the CORRECT sign convention:
       brier_delta = brier_calibrated - brier_baseline   (negative = better)
       real_lift_brier = ci_95[1] < 0
2. Eliminate the overfit problem in h-003: h-003 fit isotonic on all 29
   graded predictions and then evaluated Brier on those same 29 — pure
   in-sample fit. We use 5-fold CV: fit isotonic on ~24 train rows, score
   the ~5 held-out rows, repeat across all 5 folds, then aggregate the
   29 held-out per-match Brier values.
3. Paired bootstrap on the (baseline_brier_i, calibrated_brier_i) match-level
   deltas to get a 95% CI on the mean delta.

Data discipline (project NON-NEGOTIABLE for WC2026):
- Actuals come ONLY from server-side scripts.wc2026_db.actual_for(home, away).
- We never accept actual_score / actual_wdl from caller params.
- Source field set on output JSON. log_run() carries a non-empty notes string.

Outputs
-------
- server/data/wc2026_htr_h012_isotonic_cv.json  (verified, source-tagged)
- Audit row via wc2026_db.log_run + finalize_run with notes.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.model_selection import KFold

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))

from wc2026_db import actual_for, log_run, finalize_run  # noqa: E402

CLASSES = ("H", "D", "A")
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
N_FOLDS = 5
N_BOOTSTRAP = 5000
RNG_SEED = 20260619


def load_graded() -> list[dict[str, Any]]:
    """Join model predictions to verified actuals via actual_for()."""
    mp_path = REPO / "server" / "data" / "wc2026_model_predictions.json"
    mp = json.loads(mp_path.read_text())
    afp = mp.get("all_fixture_predictions") or {}

    graded: list[dict[str, Any]] = []
    for _, rec in afp.items():
        home = rec.get("home")
        away = rec.get("away")
        if not home or not away:
            continue
        # actuals resolved server-side only
        result = actual_for(home, away)
        if not result or "-" not in result:
            continue
        try:
            h_goals_str, a_goals_str = result.split("-", 1)
            h_goals = int(h_goals_str)
            a_goals = int(a_goals_str)
        except ValueError:
            continue
        actual_wdl = "H" if h_goals > a_goals else ("A" if a_goals > h_goals else "D")
        if "p_home_raw" not in rec or "p_draw_raw" not in rec or "p_away_raw" not in rec:
            continue
        graded.append(
            {
                "home": home,
                "away": away,
                "p_raw": (
                    float(rec["p_home_raw"]),
                    float(rec["p_draw_raw"]),
                    float(rec["p_away_raw"]),
                ),
                "actual_wdl": actual_wdl,
            }
        )
    return graded


def brier_per_match(p_h: float, p_d: float, p_a: float, actual_wdl: str) -> float:
    """Standard three-class Brier score for one match."""
    target = [0.0, 0.0, 0.0]
    target[CLASS_TO_IDX[actual_wdl]] = 1.0
    return (p_h - target[0]) ** 2 + (p_d - target[1]) ** 2 + (p_a - target[2]) ** 2


def fit_isotonic_per_class(probs: np.ndarray, labels: list[str]) -> list[IsotonicRegression]:
    """Fit one-vs-rest isotonic regressors, one per class.

    probs: shape (n, 3) raw probabilities in column order H, D, A.
    labels: length-n list of true class letters.
    """
    fitted: list[IsotonicRegression] = []
    for cls_idx, cls in enumerate(CLASSES):
        y = np.array([1.0 if lbl == cls else 0.0 for lbl in labels])
        x = probs[:, cls_idx]
        ir = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        ir.fit(x, y)
        fitted.append(ir)
    return fitted


def apply_isotonic(fitted: list[IsotonicRegression], probs: np.ndarray) -> np.ndarray:
    """Apply per-class isotonic + renormalise so each row sums to 1."""
    cal = np.zeros_like(probs)
    for cls_idx, ir in enumerate(fitted):
        cal[:, cls_idx] = ir.predict(probs[:, cls_idx])
    row_sums = cal.sum(axis=1, keepdims=True)
    # Guard against all-zero rows from clipping (extremely unlikely with n=24 train)
    row_sums[row_sums == 0] = 1.0
    return cal / row_sums


def run_cv(graded: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(graded)
    probs_raw = np.array([g["p_raw"] for g in graded], dtype=float)
    labels = [g["actual_wdl"] for g in graded]

    # Baseline (raw) per-match brier
    baseline_per_match = np.array(
        [brier_per_match(*probs_raw[i], labels[i]) for i in range(n)]
    )

    # CV-calibrated per-match brier
    calibrated_per_match = np.full(n, np.nan)
    fold_diagnostics: list[dict[str, Any]] = []
    kf = KFold(n_splits=N_FOLDS, shuffle=True, random_state=RNG_SEED)
    for fold_idx, (train_idx, test_idx) in enumerate(kf.split(np.arange(n))):
        fitted = fit_isotonic_per_class(
            probs_raw[train_idx], [labels[i] for i in train_idx]
        )
        cal_test = apply_isotonic(fitted, probs_raw[test_idx])
        for j, i in enumerate(test_idx):
            calibrated_per_match[i] = brier_per_match(
                cal_test[j, 0], cal_test[j, 1], cal_test[j, 2], labels[i]
            )
        fold_diagnostics.append(
            {
                "fold": fold_idx,
                "n_train": int(len(train_idx)),
                "n_test": int(len(test_idx)),
                "test_brier_mean_baseline": float(np.mean(baseline_per_match[test_idx])),
                "test_brier_mean_calibrated": float(np.mean(calibrated_per_match[test_idx])),
            }
        )

    assert not np.isnan(calibrated_per_match).any(), "All matches must be in exactly one fold"

    brier_baseline = float(np.mean(baseline_per_match))
    brier_calibrated = float(np.mean(calibrated_per_match))
    delta = brier_calibrated - brier_baseline  # negative = better

    # Paired bootstrap on per-match deltas
    per_match_delta = calibrated_per_match - baseline_per_match
    rng = np.random.default_rng(RNG_SEED)
    boot_means = np.empty(N_BOOTSTRAP)
    for b in range(N_BOOTSTRAP):
        sample_idx = rng.integers(0, n, size=n)
        boot_means[b] = float(np.mean(per_match_delta[sample_idx]))
    ci_lo = float(np.percentile(boot_means, 2.5))
    ci_hi = float(np.percentile(boot_means, 97.5))
    real_lift_brier = bool(ci_hi < 0.0)

    return {
        "n_matches": n,
        "n_folds": N_FOLDS,
        "brier_baseline": round(brier_baseline, 6),
        "brier_calibrated_5fold": round(brier_calibrated, 6),
        "delta": round(delta, 6),
        "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
        "real_lift_brier": real_lift_brier,
        "fold_diagnostics": fold_diagnostics,
        "bootstrap_reps": N_BOOTSTRAP,
        "rng_seed": RNG_SEED,
        "sign_convention": "delta = brier_calibrated - brier_baseline; negative=better; real_lift_brier = ci_95[1] < 0",
    }


def main() -> int:
    graded = load_graded()
    if len(graded) < N_FOLDS:
        print(f"[h-012] only {len(graded)} graded matches — need at least {N_FOLDS}", flush=True)
        return 1

    result = run_cv(graded)

    out: dict[str, Any] = {
        "hypothesis_id": "h-012",
        "parent_id": "h-003",
        "hypothesis": (
            "Isotonic calibration helps under proper 5-fold CV and the correct "
            "sign convention (brier_delta = candidate - baseline; negative = better)."
        ),
        "original_error_explained": (
            "h-003 (1) computed brier_delta = baseline - candidate so a +0.214 "
            "value was waved through under 'higher=better' even though Brier is "
            "lower=better, and (2) fit isotonic on all 29 graded predictions and "
            "evaluated Brier on those same 29 — pure in-sample fit. h-012 fixes "
            "both: signed delta = candidate - baseline, and 5-fold cross-"
            "validated Brier where every held-out match is scored by an isotonic "
            "model trained without it."
        ),
        "source": (
            "wc2026_actuals.json (verified scores) joined to "
            "wc2026_model_predictions.json all_fixture_predictions; actuals "
            "resolved via scripts.wc2026_db.actual_for; isotonic fit via "
            "sklearn.isotonic.IsotonicRegression one-vs-rest per class with "
            "post-fit row renormalisation; 5-fold KFold(shuffle=True, "
            "random_state=20260619); paired bootstrap with 5000 reps."
        ),
        "method": "sklearn.isotonic per-class one-vs-rest, 5-fold CV, paired bootstrap",
        "verified": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    out.update(result)

    out_path = REPO / "server" / "data" / "wc2026_htr_h012_isotonic_cv.json"
    out_path.write_text(json.dumps(out, indent=2, sort_keys=True))

    # Audit row
    run_id = f"h-012-isotonic-cv-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    log_run(
        run_id=run_id,
        model="wc2026_isotonic_h012_cv",
        notes=(
            "HTR h-012 redo of h-003 isotonic calibration with correct sign "
            "convention (delta = candidate - baseline, negative = better) and "
            "5-fold cross-validation to remove the in-sample fit. 29 graded "
            "matches, paired bootstrap n=5000."
        ),
    )
    finalize_run(
        run_id=run_id,
        summary={
            "n_matches": result["n_matches"],
            "brier_baseline": result["brier_baseline"],
            "brier_calibrated_5fold": result["brier_calibrated_5fold"],
            "delta": result["delta"],
            "ci_95": result["ci_95"],
            "real_lift_brier": result["real_lift_brier"],
        },
    )

    print(json.dumps({
        "brier_baseline": result["brier_baseline"],
        "brier_calibrated_5fold": result["brier_calibrated_5fold"],
        "delta": result["delta"],
        "ci_95": result["ci_95"],
        "real_lift_brier": result["real_lift_brier"],
        "n_matches": result["n_matches"],
        "out_path": str(out_path),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
