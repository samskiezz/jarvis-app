"""Fit Dixon-Coles MLE on the WC2026 historical corpus + paired-bootstrap
baseline-vs-MLE comparison.

GATEGUARD facts (first-edit context):
- Reads `/opt/jarvis-app-1/server/data/wc2026_training_history.csv` (563 rows
  incl. header; 551 non-WC2026 historical matches with 75 unique teams).
- Calls `wc2026_predictor.dixon_coles_mle()` (just added in the same edit
  batch) to fit {alpha_team, beta_team, gamma_home, tau, b_coeff} via
  scipy.optimize L-BFGS-B.
- Re-runs walk-forward backtest twice — once under BASELINE coefficients
  (the current production values) and once under the new MLE coefficients —
  on the same post-warmup window, then runs a 300-rep paired bootstrap on
  per-match Brier and winner-correct deltas.
- Writes two files:
    1. `/opt/jarvis-app-1/scripts/wc2026_predictor_dc_mle.json` — fitted
       coefficients (this is REFERENCE OUTPUT for analyst review; the
       production predictor continues to load `wc2026_predictor_tuned.json`
       which is the grid-search tuned file — we do NOT auto-adopt the MLE
       params).
    2. `/opt/jarvis-app-1/server/data/wc2026_methods_comparison.json` —
       honest baseline-vs-tuned delta + 95% bootstrap CIs + recommendation.
- Project rule observed: every WC2026 JSON output carries a top-level
  `source` field per CLAUDE.md WC2026 NON-NEGOTIABLE.

Methodology
-----------
1. Walk the 551 historical matches chronologically with the production Elo
   book (K=40 for tournaments). Skip the first 100 (warmup) before scoring.
2. Compute the as-of-match Elo diff for every match — this is a *causal*
   feature (no leakage from the result being predicted).
3. Fit the Dixon-Coles bivariate-Poisson likelihood on the 451 post-warmup
   matches under sum-to-zero + light-L2 anchoring on team coefs.
4. Re-walk the corpus under BASELINE coefs (POISSON_A=0.15, POISSON_B=1.6,
   HOME_ADV=0.4, DC_RHO=-0.08, K_WORLDCUP=40) and under MLE coefs
   (alpha+beta+gamma_home+tau+b_coeff, with POISSON_A=0.15 retained as
   intercept and K_WORLDCUP=40 to keep the Elo walk identical).
5. Per-match Brier = sum_{H,D,A}(p - y)^2. Paired bootstrap resamples
   match indices with replacement.
6. "Real lift" requires the 95% CI to strictly exclude 0 in the favourable
   direction (Brier delta < 0 means MLE better; winner delta > 0 means MLE
   better).

Recommendation
--------------
- "adopt"   - real lift on Brier AND winner accuracy.
- "defer"   - real lift on exactly one of the two metrics.
- "reject"  - neither CI excludes 0 (within noise).
"""

from __future__ import annotations

import csv
import json
import logging
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

import numpy as np
from scipy.special import gammaln  # noqa: F401  (re-exported for prediction math)
from scipy.stats import poisson

# Make the predictor importable when this script is run directly.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from wc2026_predictor import (  # noqa: E402
    BASELINE_ELO,
    DC_RHO,
    DEFAULT_ELO,
    Elo,
    HOME_ADV,
    POISSON_A,
    POISSON_B,
    _canonical_team,
    dixon_coles_mle,
)

logger = logging.getLogger("wc2026_dc_mle")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


HISTORY_CSV = Path("/opt/jarvis-app-1/server/data/wc2026_training_history.csv")
MLE_PARAMS_JSON = Path("/opt/jarvis-app-1/scripts/wc2026_predictor_dc_mle.json")
COMPARISON_JSON = Path("/opt/jarvis-app-1/server/data/wc2026_methods_comparison.json")
WARMUP_N = 100
N_BOOT = 300
RNG_SEED = 20260619
MAX_GOALS_GRID = 8


# ---------------------------------------------------------------------------
# History loader
# ---------------------------------------------------------------------------
def _load_history() -> list[tuple[str, str, str, int, int, bool]]:
    rows: list[tuple[str, str, str, int, int, bool]] = []
    if not HISTORY_CSV.exists():
        raise FileNotFoundError(f"missing historical corpus: {HISTORY_CSV}")
    with HISTORY_CSV.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            # Hold WC2026 rows out — the MD1 results are the live test set,
            # not training data. Matches the tune script's behaviour.
            if r.get("competition") == "WC2026":
                continue
            try:
                hg = int(r["hg"])
                ag = int(r["ag"])
            except (KeyError, ValueError):
                continue
            neutral_raw = str(r.get("neutral", "1")).strip()
            neutral = neutral_raw not in {"0", "false", "False"}
            rows.append((
                r.get("date", ""),
                _canonical_team(r["home"]),
                _canonical_team(r["away"]),
                hg, ag, neutral,
            ))
    rows.sort(key=lambda x: x[0])
    return rows


# ---------------------------------------------------------------------------
# Prediction kernels (baseline vs MLE) — both reuse the same DC tau shape
# ---------------------------------------------------------------------------
def _dc_tau_cell(hg: int, ag: int, lam_h: float, lam_a: float, tau: float) -> float:
    if hg == 0 and ag == 0:
        return 1.0 - lam_h * lam_a * tau
    if hg == 0 and ag == 1:
        return 1.0 + lam_h * tau
    if hg == 1 and ag == 0:
        return 1.0 + lam_a * tau
    if hg == 1 and ag == 1:
        return 1.0 - tau
    return 1.0


def _wdl_from_lambdas(lam_h: float, lam_a: float, tau: float) -> tuple[float, float, float]:
    lam_h = float(np.clip(lam_h, 0.05, 8.0))
    lam_a = float(np.clip(lam_a, 0.05, 8.0))
    pmf_h = poisson.pmf(np.arange(MAX_GOALS_GRID + 1), lam_h)
    pmf_a = poisson.pmf(np.arange(MAX_GOALS_GRID + 1), lam_a)
    grid = np.outer(pmf_h, pmf_a)
    for hg, ag in ((0, 0), (0, 1), (1, 0), (1, 1)):
        grid[hg, ag] *= _dc_tau_cell(hg, ag, lam_h, lam_a, tau)
    total = float(grid.sum())
    if total <= 0:
        return 1.0 / 3, 1.0 / 3, 1.0 / 3
    grid = grid / total
    p_home = float(np.tril(grid, -1).sum())
    p_draw = float(np.trace(grid))
    p_away = float(np.triu(grid, 1).sum())
    s = p_home + p_draw + p_away
    if s > 0:
        p_home, p_draw, p_away = p_home / s, p_draw / s, p_away / s
    return p_home, p_draw, p_away


def _predict_baseline(
    elo: Elo, home: str, away: str, *, neutral: bool,
) -> tuple[float, float, float]:
    diff = (elo.get(home) - elo.get(away)) / 400.0
    home_bonus = 0.0 if neutral else HOME_ADV
    lam_h = math.exp(POISSON_A + POISSON_B * diff + home_bonus)
    lam_a = math.exp(POISSON_A - POISSON_B * diff)
    return _wdl_from_lambdas(lam_h, lam_a, DC_RHO)


def _predict_mle(
    elo: Elo,
    home: str,
    away: str,
    *,
    neutral: bool,
    alpha: dict[str, float],
    beta: dict[str, float],
    gamma_home: float,
    tau: float,
    b_coeff: float,
) -> tuple[float, float, float]:
    diff = (elo.get(home) - elo.get(away)) / 400.0
    a_h = alpha.get(home, 0.0)
    a_a = alpha.get(away, 0.0)
    b_h = beta.get(home, 0.0)
    b_a = beta.get(away, 0.0)
    home_bonus = 0.0 if neutral else gamma_home
    # POISSON_A is the shared scoring intercept — kept fixed at 0.15 so the
    # MLE's per-team coefs are interpreted as deviations from a league-mean
    # ~1.16 goals/match (exp(0.15)), exactly as in the baseline parameterisation.
    lam_h = math.exp(POISSON_A + a_h + b_a + home_bonus + b_coeff * diff)
    lam_a = math.exp(POISSON_A + a_a + b_h - b_coeff * diff)
    return _wdl_from_lambdas(lam_h, lam_a, tau)


# ---------------------------------------------------------------------------
# Walk-forward backtest under one prediction kernel
# ---------------------------------------------------------------------------
def _walk_forward(
    history: Sequence[tuple[str, str, str, int, int, bool]],
    predict_fn,
    *,
    warmup_n: int,
) -> dict:
    """Walk history chronologically; predict each post-warmup match using
    the as-of-then Elo book, then update Elo with the actual result. Returns
    per-match Brier + per-match correctness arrays + summary metrics.
    """
    elo = Elo()
    brier_per_match: list[float] = []
    correct_per_match: list[int] = []
    for i, (_date, home, away, hg, ag, neutral) in enumerate(history):
        if i >= warmup_n:
            p_h, p_d, p_a = predict_fn(elo, home, away, neutral=neutral)
            if hg > ag:
                y_h, y_d, y_a, actual = 1.0, 0.0, 0.0, "H"
            elif hg == ag:
                y_h, y_d, y_a, actual = 0.0, 1.0, 0.0, "D"
            else:
                y_h, y_d, y_a, actual = 0.0, 0.0, 1.0, "A"
            brier_per_match.append(
                (p_h - y_h) ** 2 + (p_d - y_d) ** 2 + (p_a - y_a) ** 2
            )
            triples = ((p_h, "H"), (p_d, "D"), (p_a, "A"))
            cls = max(triples, key=lambda t: t[0])[1]
            correct_per_match.append(1 if cls == actual else 0)
        # Elo book always updates so the chronological state matches what the
        # production walker would see at MD1 kickoff.
        elo.update(home, away, hg, ag, competition="worldcup")
    brier = np.array(brier_per_match, dtype=np.float64)
    correct = np.array(correct_per_match, dtype=np.int64)
    n = len(brier)
    return {
        "brier_per_match": brier,
        "correct_per_match": correct,
        "n": n,
        "winner_accuracy": float(correct.mean()) if n else 0.0,
        "mean_brier": float(brier.mean()) if n else 0.0,
    }


# ---------------------------------------------------------------------------
# Paired bootstrap (resample MATCH INDICES with replacement)
# ---------------------------------------------------------------------------
def _paired_bootstrap(
    baseline_brier: np.ndarray,
    mle_brier: np.ndarray,
    baseline_correct: np.ndarray,
    mle_correct: np.ndarray,
    *,
    n_boot: int,
    seed: int,
) -> dict:
    if len(baseline_brier) != len(mle_brier):
        raise ValueError("paired bootstrap requires equal-length per-match arrays")
    n = len(baseline_brier)
    rng = np.random.default_rng(seed)
    deltas_brier = np.empty(n_boot, dtype=np.float64)
    deltas_winner = np.empty(n_boot, dtype=np.float64)
    for j in range(n_boot):
        idx = rng.integers(0, n, size=n)
        deltas_brier[j] = mle_brier[idx].mean() - baseline_brier[idx].mean()
        deltas_winner[j] = mle_correct[idx].mean() - baseline_correct[idx].mean()
    ci_brier = (
        float(np.percentile(deltas_brier, 2.5)),
        float(np.percentile(deltas_brier, 97.5)),
    )
    ci_winner = (
        float(np.percentile(deltas_winner, 2.5)),
        float(np.percentile(deltas_winner, 97.5)),
    )
    # MLE Brier *lower* is good -> both CI bounds < 0.
    # MLE winner accuracy *higher* is good -> both CI bounds > 0.
    return {
        "n_boot": int(n_boot),
        "n_matches": int(n),
        "brier_delta_ci_95": ci_brier,
        "winner_delta_ci_95": ci_winner,
        "real_lift_brier": bool(ci_brier[1] < 0.0),
        "real_lift_winner": bool(ci_winner[0] > 0.0),
    }


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------
def main() -> dict:
    logger.info("loading historical corpus: %s", HISTORY_CSV)
    history = _load_history()
    logger.info("loaded %d non-WC2026 historical matches", len(history))

    # 1) Dixon-Coles MLE fit on the FULL post-warmup window — used for the
    #    persisted coefficient file (full-sample fit, like the published
    #    Dixon-Coles 1997 paper).
    logger.info("running Dixon-Coles MLE fit (warmup=%d, max_iter=200) - full sample", WARMUP_N)
    mle = dixon_coles_mle(history, warmup_n=WARMUP_N)
    logger.info(
        "MLE fit complete: converged=%s nll=%.2f n_fit=%d teams=%d gamma_home=%.3f tau=%.4f b_coeff=%.3f",
        mle["converged"], mle["final_nll"], mle["n_matches_fit"],
        mle["n_teams"], mle["params"]["gamma_home"], mle["params"]["tau"],
        mle["params"]["b_coeff"],
    )

    # 2) Persist fitted coefficients.
    baseline_coefs = {
        "poisson_a": float(POISSON_A),
        "poisson_b": float(POISSON_B),
        "home_adv": float(HOME_ADV),
        "dc_rho": float(DC_RHO),
        "k_worldcup": 40.0,
    }
    fitted_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    mle_params_payload = {
        "fitted_at": fitted_at,
        "params": mle["params"],
        "baseline_coefs": baseline_coefs,
        "n_matches_fit": mle["n_matches_fit"],
        "n_teams": mle["n_teams"],
        "warmup_n": mle["warmup_n"],
        "converged": mle["converged"],
        "final_nll": mle["final_nll"],
        "n_iterations": mle["n_iterations"],
        "teams_fit_order": mle["teams"],
        "source": "scripts/wc2026_fit_dc_mle.py:dixon_coles_mle "
                  "(scipy L-BFGS-B on bivariate-Poisson NLL with sum-to-zero + L2 anchors)",
        "verified": True,
    }
    MLE_PARAMS_JSON.parent.mkdir(parents=True, exist_ok=True)
    MLE_PARAMS_JSON.write_text(json.dumps(mle_params_payload, indent=2, ensure_ascii=False))
    logger.info("wrote MLE params -> %s", MLE_PARAMS_JSON)

    # 3) OUT-OF-SAMPLE evaluation. The full-sample MLE fit above is great as a
    #    coefficient artefact, but evaluating it on the same matches it was
    #    fit on is *in-sample apparent performance*, which always overstates
    #    the lift. For an honest baseline-vs-MLE delta we refit on the first
    #    half of the post-warmup window and evaluate on the second half.
    n_post = len(history) - WARMUP_N
    train_split = WARMUP_N + n_post // 2
    train_history = history[:train_split]
    eval_history = history[train_split:]
    logger.info(
        "out-of-sample split: train_post_warmup=%d, eval=%d (eval starts %s)",
        len(train_history) - WARMUP_N, len(eval_history),
        eval_history[0][0] if eval_history else "n/a",
    )
    mle_oos = dixon_coles_mle(train_history, warmup_n=WARMUP_N)
    logger.info(
        "OOS MLE fit: converged=%s nll=%.2f n_fit=%d teams=%d gamma_home=%.3f tau=%.4f b_coeff=%.3f",
        mle_oos["converged"], mle_oos["final_nll"], mle_oos["n_matches_fit"],
        mle_oos["n_teams"], mle_oos["params"]["gamma_home"], mle_oos["params"]["tau"],
        mle_oos["params"]["b_coeff"],
    )
    alpha_oos = mle_oos["params"]["alpha"]
    beta_oos = mle_oos["params"]["beta"]
    gamma_home_oos = float(mle_oos["params"]["gamma_home"])
    tau_oos = float(mle_oos["params"]["tau"])
    b_coeff_oos = float(mle_oos["params"]["b_coeff"])

    # For the eval walk we need the Elo book warmed to the same as-of state
    # the train-fit observed. _walk_forward starts with a fresh Elo and uses
    # `warmup_n` rows to burn it in; we extend the warmup to cover the
    # train half so eval-half scoring starts at the right Elo snapshot.
    eval_walk_history = history  # full history…
    eval_warmup_n = train_split  # …with warmup covering train half + initial warmup.

    logger.info("OOS walk-forward backtest under BASELINE coefficients...")
    baseline_run = _walk_forward(eval_walk_history, _predict_baseline, warmup_n=eval_warmup_n)
    logger.info(
        "BASELINE (OOS): n=%d winner=%.4f brier=%.4f",
        baseline_run["n"], baseline_run["winner_accuracy"], baseline_run["mean_brier"],
    )

    def _predict_mle_oos(elo, home, away, *, neutral):
        return _predict_mle(
            elo, home, away, neutral=neutral,
            alpha=alpha_oos, beta=beta_oos,
            gamma_home=gamma_home_oos, tau=tau_oos, b_coeff=b_coeff_oos,
        )

    logger.info("OOS walk-forward backtest under MLE (train-only fit) coefficients...")
    mle_run = _walk_forward(eval_walk_history, _predict_mle_oos, warmup_n=eval_warmup_n)
    logger.info(
        "MLE (OOS): n=%d winner=%.4f brier=%.4f",
        mle_run["n"], mle_run["winner_accuracy"], mle_run["mean_brier"],
    )

    # Coefs persisted into the comparison payload reflect the OOS fit (the
    # one whose generalisation we actually measured). The full-sample fit is
    # kept in the separate `wc2026_predictor_dc_mle.json` artefact.
    alpha = alpha_oos
    beta = beta_oos
    gamma_home = gamma_home_oos
    tau = tau_oos
    b_coeff = b_coeff_oos

    # 4) Paired-bootstrap deltas on the OOS eval window.
    boot = _paired_bootstrap(
        baseline_run["brier_per_match"], mle_run["brier_per_match"],
        baseline_run["correct_per_match"], mle_run["correct_per_match"],
        n_boot=N_BOOT, seed=RNG_SEED,
    )

    brier_delta = mle_run["mean_brier"] - baseline_run["mean_brier"]
    winner_delta_pp = 100.0 * (mle_run["winner_accuracy"] - baseline_run["winner_accuracy"])
    winner_ci_pp = (
        100.0 * boot["winner_delta_ci_95"][0],
        100.0 * boot["winner_delta_ci_95"][1],
    )

    # 6) Recommendation.
    if boot["real_lift_brier"] and boot["real_lift_winner"]:
        recommendation = "adopt"
    elif boot["real_lift_brier"] or boot["real_lift_winner"]:
        recommendation = "defer"
    else:
        recommendation = "reject"

    comparison_payload = {
        "generated_at": fitted_at,
        "n_matches_evaluated": baseline_run["n"],
        "n_bootstrap": N_BOOT,
        "warmup_n": WARMUP_N,
        "evaluation_methodology": (
            "out-of-sample time-split: MLE refit on first half of post-warmup "
            "matches, evaluated on second half. Baseline coefs are static "
            "(no refit). Honest because the MLE has never seen the eval matches."
        ),
        "train_eval_split": {
            "warmup_n": WARMUP_N,
            "train_n_post_warmup": len(train_history) - WARMUP_N,
            "train_n_total_with_warmup": train_split,
            "eval_n": len(eval_history),
            "eval_starts": eval_history[0][0] if eval_history else None,
        },
        "baseline_metrics": {
            "winner_accuracy": round(baseline_run["winner_accuracy"], 4),
            "brier": round(baseline_run["mean_brier"], 4),
            "n": baseline_run["n"],
        },
        "mle_metrics": {
            "winner_accuracy": round(mle_run["winner_accuracy"], 4),
            "brier": round(mle_run["mean_brier"], 4),
            "n": mle_run["n"],
        },
        "brier_delta": round(brier_delta, 4),
        "brier_ci_95": [round(boot["brier_delta_ci_95"][0], 4),
                        round(boot["brier_delta_ci_95"][1], 4)],
        "winner_delta_pp": round(winner_delta_pp, 2),
        "winner_ci_95_pp": [round(winner_ci_pp[0], 2), round(winner_ci_pp[1], 2)],
        "real_lift_brier": boot["real_lift_brier"],
        "real_lift_winner": boot["real_lift_winner"],
        "recommendation": recommendation,
        "baseline_coefs": baseline_coefs,
        "mle_scalar_coefs": {
            "gamma_home": gamma_home,
            "tau": tau,
            "b_coeff": b_coeff,
        },
        "in_sample_full_fit_metrics_for_reference_only": {
            "note": (
                "Coefs in /opt/jarvis-app-1/scripts/wc2026_predictor_dc_mle.json "
                "are the full-sample MLE fit (all 451 post-warmup matches). "
                "Those coefs ARE NOT evaluated here — the OOS comparison above "
                "uses the train-half-only fit to keep the eval honest."
            ),
            "full_sample_n_matches_fit": mle["n_matches_fit"],
            "full_sample_final_nll": mle["final_nll"],
        },
        "honest_note": (
            f"OOS time-split: train on first {len(train_history) - WARMUP_N} "
            f"post-warmup matches, evaluate on the remaining {baseline_run['n']}. "
            f"Paired bootstrap (n_boot={N_BOOT}). "
            f"Brier delta 95% CI [{boot['brier_delta_ci_95'][0]:+.4f}, "
            f"{boot['brier_delta_ci_95'][1]:+.4f}]; winner delta 95% CI "
            f"[{winner_ci_pp[0]:+.2f}pp, {winner_ci_pp[1]:+.2f}pp]. "
            f"Real-lift Brier={boot['real_lift_brier']}, real-lift "
            f"winner={boot['real_lift_winner']}. Recommendation: "
            f"{recommendation}. 'Adopt' requires BOTH 95% CIs to strictly "
            f"exclude 0 in the favourable direction (Brier delta < 0, "
            f"winner delta > 0)."
        ),
        "source": "scripts/wc2026_fit_dc_mle.py paired-bootstrap walk-forward (OOS time-split)",
        "verified": True,
    }
    COMPARISON_JSON.parent.mkdir(parents=True, exist_ok=True)
    COMPARISON_JSON.write_text(json.dumps(comparison_payload, indent=2, ensure_ascii=False))
    logger.info("wrote comparison -> %s (recommendation=%s)",
                COMPARISON_JSON, recommendation)

    return {"mle_params": mle_params_payload, "comparison": comparison_payload}


if __name__ == "__main__":
    main()
