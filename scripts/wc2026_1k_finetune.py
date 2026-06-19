"""WC2026 1K local-search refinement over the top-20 30K-search variants.

GATEGUARD facts (first-edit context):
- Caller: top-level CLI run (`python wc2026_1k_finetune.py`).
- Inputs:
    * server/data/wc2026_30k_search_results.json  (top-20 + baseline_brier)
    * server/data/wc2026_training_history.csv     (551 pre-WC rows)
    * server/data/wc2026_actuals.json             (29 verified WC2026 matches —
      only trusted source per the data-integrity rule in CLAUDE.md)
- Output: server/data/wc2026_1k_finetune_results.json
- Backtest is the exact walk-forward used by wc2026_30k_search.backtest_one
  (re-used to guarantee identical accounting). Per-match Brier is captured
  by a parallel variant `backtest_one_per_match` so paired bootstrap CIs are
  computed on the same scored row set as the aggregate Brier.

Method
------
For each of the top-20 30K-search variants ("parents"):
  1) Sample n_refine=1000 local Gaussian perturbations centred on the parent.
     Per-param scale = 0.02 * (search range), so a perturbation only nudges
     each axis by roughly 2% of its full search width.
  2) Clip each perturbed vector to the original search bounds.
  3) Run the walk-forward backtest for each perturbation.
  4) Pick the perturbation with lowest Brier as the refined point.
  5) Paired 300-rep bootstrap CI on per-match Brier delta
     (refined - parent). real_lift = both CI bounds strictly < 0.

Overall best = the single refined variant with lowest refined_brier whose
ci_95 strictly excludes 0 (i.e. its lift over its parent is statistically
real). The script also reports the global minimum-Brier refined point even
if its CI straddles 0, so callers can see both.

Performance budget
------------------
~20 parents * 1000 perturbations = 20,000 backtests. Each ~7-15 ms => total
search ~3-5 min. Plus 40 per-match backtests (20 parents + 20 best-refined)
for bootstrap. Bootstrap itself is pure numpy on ~480-row arrays and is
nearly free. Whole run fits well under 10 min.
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

PROJECT_ROOT = Path("/opt/jarvis-app-1")
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

# Re-use the corpus loader, Poisson math, and search-range constants from the
# 30K search so the refinement is a strict subset of the same evaluation.
from wc2026_30k_search import (  # noqa: E402
    BASELINE_PARAMS,
    MAX_GOALS,
    POISSON_A,
    WARMUP_N,
    _poisson_pmf,
    load_corpus,
    precompute_corpus,
)

logger = logging.getLogger("wc2026_1k_finetune")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


SEARCH_RESULTS = PROJECT_ROOT / "server" / "data" / "wc2026_30k_search_results.json"
OUT_JSON = PROJECT_ROOT / "server" / "data" / "wc2026_1k_finetune_results.json"

# Same search bounds as the 30K random search — we clip perturbations to
# this hyper-box so we never leave the original feasible region.
PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "k_factor": (20.0, 80.0),
    "home_adv": (0.0, 0.8),
    "poisson_b": (0.5, 3.0),
    "dc_tau": (-0.3, 0.3),
    "decay_half_life_days": (30.0, 365.0),
}
PARAM_ORDER = (
    "k_factor",
    "home_adv",
    "poisson_b",
    "dc_tau",
    "decay_half_life_days",
)
# Per-axis sigma = 0.02 * (hi - lo). Locks the local search to a small
# neighbourhood around each parent.
PERTURB_SCALE = 0.02
PARAM_SIGMA = {
    k: PERTURB_SCALE * (hi - lo) for k, (lo, hi) in PARAM_BOUNDS.items()
}

N_REFINE_DEFAULT = 1000
N_BOOTSTRAP_DEFAULT = 300
SEED_DEFAULT = 20260619


# ---------------------------------------------------------------------------
# Per-match backtest (mirrors wc2026_30k_search.backtest_one but also
# returns the per-match Brier array — required for paired bootstrap).
# ---------------------------------------------------------------------------

def backtest_one_per_match(
    corpus: dict[str, np.ndarray],
    *,
    k_factor: float,
    home_adv: float,
    poisson_b: float,
    dc_tau: float,
    decay_half_life_days: float,
    warmup_n: int = WARMUP_N,
) -> dict[str, Any]:
    """Walk-forward backtest, returning aggregates + per-match Brier array.

    Per-match Brier rows are recorded in scored order (i.e. in the same
    chronological sweep used to compute the aggregate). Length == n_scored.
    """
    ratings = corpus["ratings0"].copy()
    home_idx = corpus["home_idx"]
    away_idx = corpus["away_idx"]
    hg_arr = corpus["hg"]
    ag_arr = corpus["ag"]
    neutral_arr = corpus["neutral"]
    age_arr = corpus["age_days"]

    n = len(home_idx)
    inv_half = math.log(2.0) / max(decay_half_life_days, 1.0)
    weights = np.exp(-inv_half * age_arr)

    brier_per_match: list[float] = []
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
            home_bonus = 0.0 if is_neutral else home_adv
            lam_h = math.exp(POISSON_A + poisson_b * diff_400 + home_bonus)
            lam_a = math.exp(POISSON_A - poisson_b * diff_400)
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

            grid[0, 0] *= 1.0 - lam_h * lam_a * dc_tau
            grid[0, 1] *= 1.0 + lam_h * dc_tau
            grid[1, 0] *= 1.0 + lam_a * dc_tau
            grid[1, 1] *= 1.0 - dc_tau

            total = float(grid.sum())
            if total > 0.0:
                grid /= total

            p_home = float(np.tril(grid, -1).sum())
            p_draw = float(np.trace(grid))
            p_away = float(np.triu(grid, 1).sum())
            s = p_home + p_draw + p_away
            if s > 0.0:
                p_home /= s
                p_draw /= s
                p_away /= s

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

            brier = (p_home - y_h) ** 2 + (p_draw - y_d) ** 2 + (p_away - y_a) ** 2
            brier_per_match.append(brier)
            log_loss_sum += -math.log(max(true_p, eps))
            if p_home >= p_draw and p_home >= p_away:
                picked = 0
            elif p_draw >= p_away:
                picked = 1
            else:
                picked = 2
            if picked == actual_cls:
                winner_hits += 1
            n_scored += 1

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
        exp_h = 1.0 / (1.0 + 10.0 ** (-diff_400))
        delta = k_factor * mov * (score - exp_h) * float(weights[i])
        ratings[h] += delta
        ratings[a] -= delta

    arr = np.asarray(brier_per_match, dtype=np.float64)
    if arr.size == 0:
        return {
            "brier": 0.0,
            "winner_acc": 0.0,
            "log_loss": 0.0,
            "n_scored": 0,
            "brier_per_match": arr,
        }
    return {
        "brier": float(arr.mean()),
        "winner_acc": winner_hits / n_scored,
        "log_loss": log_loss_sum / n_scored,
        "n_scored": n_scored,
        "brier_per_match": arr,
    }


def backtest_brier_only(
    corpus: dict[str, np.ndarray],
    *,
    k_factor: float,
    home_adv: float,
    poisson_b: float,
    dc_tau: float,
    decay_half_life_days: float,
    warmup_n: int = WARMUP_N,
) -> dict[str, float]:
    """Same as backtest_one_per_match but skips per-match storage for speed.

    Used in the hot inner loop (20,000 perturbations); we only need the
    aggregate Brier + winner_acc to pick the best refinement per parent.
    """
    ratings = corpus["ratings0"].copy()
    home_idx = corpus["home_idx"]
    away_idx = corpus["away_idx"]
    hg_arr = corpus["hg"]
    ag_arr = corpus["ag"]
    neutral_arr = corpus["neutral"]
    age_arr = corpus["age_days"]

    n = len(home_idx)
    inv_half = math.log(2.0) / max(decay_half_life_days, 1.0)
    weights = np.exp(-inv_half * age_arr)

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
            home_bonus = 0.0 if is_neutral else home_adv
            lam_h = math.exp(POISSON_A + poisson_b * diff_400 + home_bonus)
            lam_a = math.exp(POISSON_A - poisson_b * diff_400)
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

            grid[0, 0] *= 1.0 - lam_h * lam_a * dc_tau
            grid[0, 1] *= 1.0 + lam_h * dc_tau
            grid[1, 0] *= 1.0 + lam_a * dc_tau
            grid[1, 1] *= 1.0 - dc_tau

            total = float(grid.sum())
            if total > 0.0:
                grid /= total

            p_home = float(np.tril(grid, -1).sum())
            p_draw = float(np.trace(grid))
            p_away = float(np.triu(grid, 1).sum())
            s = p_home + p_draw + p_away
            if s > 0.0:
                p_home /= s
                p_draw /= s
                p_away /= s

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
            if p_home >= p_draw and p_home >= p_away:
                picked = 0
            elif p_draw >= p_away:
                picked = 1
            else:
                picked = 2
            if picked == actual_cls:
                winner_hits += 1
            n_scored += 1

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
# Perturbation + paired bootstrap helpers
# ---------------------------------------------------------------------------

def _clip_params(params: dict[str, float]) -> dict[str, float]:
    """Clip every axis to PARAM_BOUNDS so perturbations stay in the feasible region."""
    out: dict[str, float] = {}
    for key in PARAM_ORDER:
        lo, hi = PARAM_BOUNDS[key]
        v = float(params[key])
        if v < lo:
            v = lo
        elif v > hi:
            v = hi
        out[key] = v
    return out


def _sample_perturbations(
    parent: dict[str, float],
    n_refine: int,
    rng: np.random.Generator,
) -> list[dict[str, float]]:
    """Return n_refine perturbed parameter vectors centred on `parent`."""
    out: list[dict[str, float]] = []
    for _ in range(n_refine):
        candidate = {
            key: float(parent[key] + rng.normal(0.0, PARAM_SIGMA[key]))
            for key in PARAM_ORDER
        }
        out.append(_clip_params(candidate))
    return out


def _paired_bootstrap_brier(
    refined_per_match: np.ndarray,
    parent_per_match: np.ndarray,
    *,
    n_boot: int,
    rng: np.random.Generator,
) -> dict[str, Any]:
    """Paired-bootstrap 95% CI on mean(refined - parent) per-match Brier.

    Returns ci_95 (low, high), point estimate delta, and real_lift flag
    (both bounds < 0).
    """
    n = len(refined_per_match)
    if n == 0 or n != len(parent_per_match):
        return {
            "n_matches": int(n),
            "n_boot": n_boot,
            "point_delta_brier": 0.0,
            "ci_95": (0.0, 0.0),
            "real_lift": False,
        }
    diff = refined_per_match - parent_per_match
    point = float(diff.mean())
    boot = np.empty(n_boot, dtype=np.float64)
    for j in range(n_boot):
        idx = rng.integers(0, n, size=n)
        boot[j] = float(diff[idx].mean())
    lo = float(np.percentile(boot, 2.5))
    hi = float(np.percentile(boot, 97.5))
    return {
        "n_matches": int(n),
        "n_boot": int(n_boot),
        "point_delta_brier": point,
        "ci_95": (lo, hi),
        "real_lift": hi < 0.0,
    }


# ---------------------------------------------------------------------------
# Main driver
# ---------------------------------------------------------------------------

def _load_parents(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    top = payload.get("top_20") or []
    if not top:
        raise ValueError(f"no top_20 in {path}")
    return top


def run_finetune(
    *,
    n_refine: int = N_REFINE_DEFAULT,
    n_boot: int = N_BOOTSTRAP_DEFAULT,
    seed: int = SEED_DEFAULT,
) -> dict[str, Any]:
    logger.info("loading 30K search top-20 from %s", SEARCH_RESULTS.name)
    parents_raw = _load_parents(SEARCH_RESULTS)
    if len(parents_raw) < 20:
        logger.warning("expected 20 parents in top_20, got %d", len(parents_raw))

    logger.info("loading corpus + precomputing arrays")
    rows = load_corpus()
    corpus = precompute_corpus(rows)

    # Production-baseline Brier — same params the live predictor would use
    # if no tuned coefficients JSON exists at TUNED_COEFFS_PATH. This is the
    # number callers compare against.
    logger.info("computing production-baseline brier (%s)", BASELINE_PARAMS)
    baseline_metrics = backtest_one_per_match(corpus, **BASELINE_PARAMS)
    baseline_brier = float(baseline_metrics["brier"])
    logger.info(
        "baseline: brier=%.5f winner=%.4f n=%d",
        baseline_brier, baseline_metrics["winner_acc"], baseline_metrics["n_scored"],
    )

    rng = np.random.default_rng(seed)

    per_parent_best: list[dict[str, Any]] = []
    started = time.monotonic()
    total_perturbations = 0
    for p_idx, parent_row in enumerate(parents_raw):
        parent_params_raw = parent_row.get("params") or {}
        # Coerce + sanity-check.
        parent_params = {k: float(parent_params_raw[k]) for k in PARAM_ORDER}
        # Re-evaluate the parent under per-match accounting so the bootstrap
        # uses the same scored rows on both sides (cell-aligned diff).
        parent_metrics = backtest_one_per_match(corpus, **parent_params)
        parent_brier = float(parent_metrics["brier"])

        # Sample + score perturbations.
        perturbations = _sample_perturbations(parent_params, n_refine, rng)
        best = {
            "params": dict(parent_params),
            "brier": parent_brier,
            "winner_acc": float(parent_metrics["winner_acc"]),
            "log_loss": float(parent_metrics["log_loss"]),
            "n_scored": int(parent_metrics["n_scored"]),
        }
        for cand in perturbations:
            m = backtest_brier_only(corpus, **cand)
            total_perturbations += 1
            if m["brier"] < best["brier"]:
                best = {
                    "params": cand,
                    "brier": float(m["brier"]),
                    "winner_acc": float(m["winner_acc"]),
                    "log_loss": float(m["log_loss"]),
                    "n_scored": int(m["n_scored"]),
                }

        # Re-evaluate the chosen refined point with per-match Brier captured.
        refined_metrics = backtest_one_per_match(corpus, **best["params"])
        refined_brier = float(refined_metrics["brier"])

        # Paired bootstrap on per-match Brier diff (refined - parent).
        sig = _paired_bootstrap_brier(
            refined_metrics["brier_per_match"],
            parent_metrics["brier_per_match"],
            n_boot=n_boot,
            rng=rng,
        )

        per_parent_best.append({
            "parent_rank": p_idx + 1,
            "parent_params": parent_params,
            "parent_brier": parent_brier,
            "parent_winner_acc": float(parent_metrics["winner_acc"]),
            "refined_params": {k: float(best["params"][k]) for k in PARAM_ORDER},
            "refined_brier": refined_brier,
            "refined_winner_acc": float(refined_metrics["winner_acc"]),
            "refined_log_loss": float(refined_metrics["log_loss"]),
            "n_scored": int(refined_metrics["n_scored"]),
            "brier_delta": refined_brier - parent_brier,
            "ci_95": list(sig["ci_95"]),
            "real_lift": bool(sig["real_lift"]),
            "n_boot": int(sig["n_boot"]),
        })
        logger.info(
            "parent #%-2d  parent_brier=%.5f -> refined_brier=%.5f  "
            "delta=%+.5f  ci_95=[%+.5f, %+.5f]  real_lift=%s",
            p_idx + 1, parent_brier, refined_brier,
            refined_brier - parent_brier, sig["ci_95"][0], sig["ci_95"][1],
            sig["real_lift"],
        )

    elapsed = time.monotonic() - started
    logger.info(
        "finished %d parents x %d perturbations = %d backtests in %.1fs (%.0f /s)",
        len(parents_raw), n_refine, total_perturbations, elapsed,
        total_perturbations / max(elapsed, 1e-9),
    )

    # Overall best = lowest refined_brier with CI strictly excluding 0
    # (i.e. real lift over its parent).
    significant = [r for r in per_parent_best if r["real_lift"]]
    if significant:
        overall_best = min(significant, key=lambda r: r["refined_brier"])
        overall_best_basis = "real_lift_strict"
    else:
        # Fall back to global min-brier refined point so the report is still
        # informative, and flag that no parent's perturbation passed the CI gate.
        overall_best = min(per_parent_best, key=lambda r: r["refined_brier"])
        overall_best_basis = "min_brier_no_significant_lift"

    # Also report the global min-brier refined point regardless of significance.
    global_min = min(per_parent_best, key=lambda r: r["refined_brier"])

    payload: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "scripts/wc2026_1k_finetune.py over wc2026_30k_search_results.json",
        "n_parents": len(parents_raw),
        "n_refine_per_parent": int(n_refine),
        "n_boot_paired": int(n_boot),
        "perturb_scale_fraction": PERTURB_SCALE,
        "param_bounds": {k: list(v) for k, v in PARAM_BOUNDS.items()},
        "param_sigma": dict(PARAM_SIGMA),
        "warmup_n": int(WARMUP_N),
        "corpus": {
            "total": len(rows),
            "wc2026_actuals_rows": sum(1 for r in rows if r["competition"] == "WC2026"),
            "n_scored_per_sample": int(baseline_metrics["n_scored"]),
        },
        "baseline_params": dict(BASELINE_PARAMS),
        "baseline_brier": baseline_brier,
        "baseline_winner_acc": float(baseline_metrics["winner_acc"]),
        "per_parent_best": per_parent_best,
        "overall_best": {
            "selection_basis": overall_best_basis,
            **overall_best,
            "vs_baseline_brier_delta": overall_best["refined_brier"] - baseline_brier,
        },
        "global_min_brier_refined": {
            **global_min,
            "vs_baseline_brier_delta": global_min["refined_brier"] - baseline_brier,
        },
        "elapsed_seconds": round(elapsed, 1),
        "total_perturbations": int(total_perturbations),
    }
    return payload


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="1K local-search refinement over top-20 WC2026 30K-search variants",
    )
    parser.add_argument("--n-refine", type=int, default=N_REFINE_DEFAULT,
                        help=f"perturbations per parent (default: {N_REFINE_DEFAULT})")
    parser.add_argument("--n-boot", type=int, default=N_BOOTSTRAP_DEFAULT,
                        help=f"paired bootstrap reps (default: {N_BOOTSTRAP_DEFAULT})")
    parser.add_argument("--seed", type=int, default=SEED_DEFAULT,
                        help=f"rng seed (default: {SEED_DEFAULT})")
    parser.add_argument("--out", type=Path, default=OUT_JSON,
                        help=f"output json (default: {OUT_JSON})")
    args = parser.parse_args()

    payload = run_finetune(
        n_refine=args.n_refine,
        n_boot=args.n_boot,
        seed=args.seed,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.out.with_suffix(args.out.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, args.out)
    logger.info("wrote %s (%d bytes)", args.out, args.out.stat().st_size)

    ob = payload["overall_best"]
    logger.info("=== OVERALL BEST (basis=%s) ===", ob["selection_basis"])
    logger.info("  refined_params=%s", ob["refined_params"])
    logger.info(
        "  refined_brier=%.5f (parent_brier=%.5f, baseline_brier=%.5f)",
        ob["refined_brier"], ob["parent_brier"], payload["baseline_brier"],
    )
    logger.info(
        "  vs_baseline=%+.5f  vs_parent=%+.5f  ci_95=[%+.5f, %+.5f]  real_lift=%s",
        ob["vs_baseline_brier_delta"], ob["brier_delta"],
        ob["ci_95"][0], ob["ci_95"][1], ob["real_lift"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
