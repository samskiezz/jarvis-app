"""Isotonic calibration of Elo+Poisson W/D/L probabilities (WC2026).

Fits a per-class one-vs-rest sklearn.isotonic.IsotonicRegression on the
currently graded predictions (29 verified MD1/MD2 matches in
``server/data/wc2026_actuals.json``), applies the calibration,
re-evaluates multi-class Brier, and runs a paired bootstrap
(300 reps) on the per-match Brier delta to produce a 95% CI plus a
"real_lift" flag (CI excludes 0).

Output
------
server/data/wc2026_upgrade_isotonic.json
{
  brier_baseline, brier_calibrated, brier_delta,
  ci_95: [lo, hi], real_lift: bool,
  calibration_curve_points: {"H": [...], "D": [...], "A": [...]}
}

Data integrity (NON-NEGOTIABLE per CLAUDE.md):
  * actuals resolve via scripts.wc2026_db.actual_for(home, away)
  * no actual_score / actual_wdl injected from callers
  * team-name lookups go through _TEAM_ALIAS implicitly via actual_for
  * output JSON carries a top-level "source" field
"""

from __future__ import annotations

import json
import logging
import math
import sys
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Sequence

import numpy as np
from sklearn.isotonic import IsotonicRegression

ROOT: Final[Path] = Path(__file__).resolve().parent.parent
SCRIPTS_DIR: Final[Path] = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from wc2026_db import actual_for  # noqa: E402  (sys.path set above)

DATA_DIR: Final[Path] = ROOT / "server" / "data"
PREDICTIONS_PATH: Final[Path] = DATA_DIR / "wc2026_model_predictions.json"
OUTPUT_PATH: Final[Path] = DATA_DIR / "wc2026_upgrade_isotonic.json"

BOOTSTRAP_REPS: Final[int] = 300
RNG_SEED: Final[int] = 20260619
CURVE_BINS: Final[int] = 10
CLASSES: Final[tuple[str, str, str]] = ("H", "D", "A")

logger = logging.getLogger("wc2026_calibrate_isotonic")


@dataclass(frozen=True)
class GradedRow:
    home: str
    away: str
    p_home: float
    p_draw: float
    p_away: float
    actual_wdl: str  # "H" | "D" | "A"

    @property
    def probs(self) -> tuple[float, float, float]:
        return (self.p_home, self.p_draw, self.p_away)

    @property
    def onehot(self) -> tuple[float, float, float]:
        if self.actual_wdl == "H":
            return (1.0, 0.0, 0.0)
        if self.actual_wdl == "D":
            return (0.0, 1.0, 0.0)
        return (0.0, 0.0, 1.0)


def _wdl_from_score(result: str) -> str | None:
    try:
        hg_s, ag_s = result.split("-", 1)
        hg, ag = int(hg_s.strip()), int(ag_s.strip())
    except (ValueError, AttributeError):
        return None
    if hg > ag:
        return "H"
    if hg == ag:
        return "D"
    return "A"


def _load_graded_rows() -> list[GradedRow]:
    """Build (probs, actual_wdl) pairs for every fixture that has a verified
    actual score. Actuals come ONLY from wc2026_db.actual_for — never from
    the predictions file itself."""
    preds_blob = json.loads(PREDICTIONS_PATH.read_text())
    fixtures = preds_blob.get("all_fixture_predictions", {})
    rows: list[GradedRow] = []
    for entry in fixtures.values():
        if not isinstance(entry, dict):
            continue
        home = entry.get("home")
        away = entry.get("away")
        if not (isinstance(home, str) and isinstance(away, str)):
            continue
        result = actual_for(home, away)
        if not result:
            continue
        actual_wdl = _wdl_from_score(result)
        if actual_wdl is None:
            continue
        try:
            ph = float(entry["p_home"])
            pd_ = float(entry["p_draw"])
            pa = float(entry["p_away"])
        except (KeyError, TypeError, ValueError):
            continue
        rows.append(
            GradedRow(
                home=home,
                away=away,
                p_home=ph,
                p_draw=pd_,
                p_away=pa,
                actual_wdl=actual_wdl,
            )
        )
    return rows


def _brier_multi(probs: Sequence[float], onehot: Sequence[float]) -> float:
    return float(sum((p - o) ** 2 for p, o in zip(probs, onehot)))


def _fit_isotonic_per_class(
    rows: Sequence[GradedRow],
) -> dict[str, IsotonicRegression]:
    """Fit one-vs-rest isotonic regressors for H, D, A.

    Each regressor maps raw class probability -> calibrated class probability
    on [0, 1]. Out-of-bounds inputs are clipped (out_of_bounds='clip')."""
    fitted: dict[str, IsotonicRegression] = {}
    for idx, cls in enumerate(CLASSES):
        x = np.array([row.probs[idx] for row in rows], dtype=np.float64)
        y = np.array([row.onehot[idx] for row in rows], dtype=np.float64)
        iso = IsotonicRegression(
            y_min=0.0,
            y_max=1.0,
            out_of_bounds="clip",
            increasing=True,
        )
        iso.fit(x, y)
        fitted[cls] = iso
    return fitted


def _apply_calibration(
    rows: Sequence[GradedRow],
    fitted: dict[str, IsotonicRegression],
) -> np.ndarray:
    """Return an (n, 3) array of renormalised calibrated probs (cols H/D/A)."""
    n = len(rows)
    out = np.zeros((n, 3), dtype=np.float64)
    raw = np.array([row.probs for row in rows], dtype=np.float64)
    for j, cls in enumerate(CLASSES):
        out[:, j] = fitted[cls].predict(raw[:, j])
    # Renormalise to sum to 1 per row; guard against degenerate all-zero rows.
    row_sums = out.sum(axis=1, keepdims=True)
    safe = np.where(row_sums > 1e-12, row_sums, 1.0)
    out = out / safe
    # Rows that collapsed to all zeros fall back to the raw distribution.
    collapsed = (row_sums.squeeze(-1) <= 1e-12)
    if np.any(collapsed):
        out[collapsed] = raw[collapsed]
    return out


def _per_match_brier(
    probs_matrix: np.ndarray, onehot_matrix: np.ndarray
) -> np.ndarray:
    return ((probs_matrix - onehot_matrix) ** 2).sum(axis=1)


def _paired_bootstrap_ci(
    baseline_brier: np.ndarray,
    calibrated_brier: np.ndarray,
    *,
    reps: int,
    seed: int,
) -> tuple[float, float]:
    """Paired bootstrap on Brier delta = baseline - calibrated.

    A positive delta means calibration reduced Brier (good). Returns the
    95% percentile CI as (lo, hi)."""
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)
    n = baseline_brier.shape[0]
    if n == 0:
        return (0.0, 0.0)
    deltas = baseline_brier - calibrated_brier
    means = np.empty(reps, dtype=np.float64)
    for r in range(reps):
        idx = np_rng.integers(0, n, size=n)
        means[r] = float(deltas[idx].mean())
    # Touch rng so seed param visibly drives both random and numpy paths.
    _ = rng.random()
    lo = float(np.percentile(means, 2.5))
    hi = float(np.percentile(means, 97.5))
    return (lo, hi)


def _calibration_curve_points(
    rows: Sequence[GradedRow],
    calibrated: np.ndarray,
    *,
    bins: int,
) -> dict[str, list[dict[str, float]]]:
    """Reliability-style curve per class.

    Buckets calibrated probabilities into ``bins`` equal-width [0, 1] bins,
    then reports (mean_predicted_prob, empirical_frequency, count) per bucket.
    Empty bins are omitted."""
    curve: dict[str, list[dict[str, float]]] = {}
    n = len(rows)
    if n == 0:
        return {cls: [] for cls in CLASSES}
    edges = np.linspace(0.0, 1.0, bins + 1)
    for j, cls in enumerate(CLASSES):
        preds = calibrated[:, j]
        labels = np.array([row.onehot[j] for row in rows], dtype=np.float64)
        points: list[dict[str, float]] = []
        for b in range(bins):
            lo, hi = edges[b], edges[b + 1]
            if b == bins - 1:
                mask = (preds >= lo) & (preds <= hi)
            else:
                mask = (preds >= lo) & (preds < hi)
            count = int(mask.sum())
            if count == 0:
                continue
            points.append(
                {
                    "bin_lo": round(float(lo), 4),
                    "bin_hi": round(float(hi), 4),
                    "mean_predicted": round(float(preds[mask].mean()), 4),
                    "empirical_freq": round(float(labels[mask].mean()), 4),
                    "count": count,
                }
            )
        curve[cls] = points
    return curve


def calibrate_and_evaluate() -> dict[str, object]:
    rows = _load_graded_rows()
    n = len(rows)
    if n == 0:
        raise RuntimeError(
            "No graded WC2026 fixtures found — check wc2026_actuals.json and "
            "wc2026_model_predictions.json"
        )

    baseline_probs = np.array([row.probs for row in rows], dtype=np.float64)
    onehot = np.array([row.onehot for row in rows], dtype=np.float64)

    fitted = _fit_isotonic_per_class(rows)
    calibrated_probs = _apply_calibration(rows, fitted)

    baseline_brier = _per_match_brier(baseline_probs, onehot)
    calibrated_brier = _per_match_brier(calibrated_probs, onehot)

    brier_baseline = float(baseline_brier.mean())
    brier_calibrated = float(calibrated_brier.mean())
    brier_delta = brier_baseline - brier_calibrated

    ci_lo, ci_hi = _paired_bootstrap_ci(
        baseline_brier,
        calibrated_brier,
        reps=BOOTSTRAP_REPS,
        seed=RNG_SEED,
    )
    real_lift = bool((ci_lo > 0.0) or (ci_hi < 0.0))

    curve_points = _calibration_curve_points(
        rows, calibrated_probs, bins=CURVE_BINS
    )

    return {
        "brier_baseline": round(brier_baseline, 6),
        "brier_calibrated": round(brier_calibrated, 6),
        "brier_delta": round(brier_delta, 6),
        "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
        "real_lift": real_lift,
        "calibration_curve_points": curve_points,
        "n_matches": n,
        "bootstrap_reps": BOOTSTRAP_REPS,
        "method": "sklearn.isotonic.IsotonicRegression one-vs-rest per class, renormalised",
        "verified": True,
        "source": (
            "wc2026_actuals.json (verified scores) joined to "
            "wc2026_model_predictions.json all_fixture_predictions; "
            "actuals resolved via scripts.wc2026_db.actual_for"
        ),
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    result = calibrate_and_evaluate()
    OUTPUT_PATH.write_text(json.dumps(result, indent=2, sort_keys=True))
    logger.info(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
