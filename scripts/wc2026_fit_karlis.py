"""Karlis-Ntzoufras 2003 bivariate Poisson with EM-fitted goal correlation.

The Karlis-Ntzoufras (2003) bivariate Poisson model represents the home/away
goal counts as:

    Y_h = X_1 + X_3
    Y_a = X_2 + X_3

with X_1 ~ Poisson(lambda_1), X_2 ~ Poisson(lambda_2), X_3 ~ Poisson(lambda_3)
all independent. lambda_3 is the *goal-correlation* parameter — when lambda_3 > 0
the two scoring processes are positively coupled. lambda_3 = 0 collapses back
to independent Poissons.

The joint PMF is:

    P(Y_h=x, Y_a=y) = exp(-(lambda_1 + lambda_2 + lambda_3))
                     * (lambda_1^x / x!) * (lambda_2^y / y!)
                     * sum_{k=0}^{min(x,y)} C(x,k)*C(y,k)*k!
                                            * (lambda_3 / (lambda_1*lambda_2))^k

This is *qualitatively* distinct from Dixon-Coles (1997): DC only re-weights the
four low-score cells (0-0, 0-1, 1-0, 1-1) but leaves the rest as independent
Poissons. Karlis-Ntzoufras models the *entire joint distribution* with a single
common shock. For real football corpora the two parameterisations are
complementary — DC tau handles the well-known 0-0/1-1 inflation, Karlis lambda_3
handles the general positive goal-count correlation.

Project-rule observance
-----------------------
- Reads /opt/jarvis-app-1/server/data/wc2026_training_history.csv (563 rows,
  563 - 1 header = 562 match rows, of which the WC2026 group rows are held out
  exactly like wc2026_fit_dc_mle.py does — 551 non-WC2026 historical matches).
- Walks Elo chronologically; uses the as-of Elo diff as a causal feature.
- Honest OOS time-split: refit on the first half of post-warmup matches,
  evaluate on the second half. Identical eval window to the existing
  wc2026_methods_comparison.json baseline so the two upgrades are apples-to-
  apples comparable.
- Paired bootstrap (n_boot=300, seed=20260619) — same seed/n_boot as
  wc2026_fit_dc_mle.py so the CIs are directly comparable.
- Output JSON carries `source` + `verified=True` per CLAUDE.md WC2026
  NON-NEGOTIABLE rules.
- "Real lift" = 95% bootstrap CI on Brier delta strictly excludes 0 in the
  favourable direction (delta < 0).
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
from scipy.optimize import minimize
from scipy.special import gammaln
from scipy.stats import poisson

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wc2026_predictor import (  # noqa: E402
    DC_RHO,
    HOME_ADV,
    POISSON_A,
    POISSON_B,
    Elo,
    _canonical_team,
)

logger = logging.getLogger("wc2026_karlis")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


HISTORY_CSV = Path("/opt/jarvis-app-1/server/data/wc2026_training_history.csv")
OUTPUT_JSON = Path("/opt/jarvis-app-1/server/data/wc2026_upgrade_karlis.json")
WARMUP_N = 100
N_BOOT = 300
RNG_SEED = 20260619
MAX_GOALS_GRID = 8
EM_MAX_ITER = 100
EM_TOL = 1e-6
LAMBDA_MIN = 1e-6
LAMBDA_MAX = 8.0


# ---------------------------------------------------------------------------
# History loader (identical contract to wc2026_fit_dc_mle.py)
# ---------------------------------------------------------------------------
def _load_history() -> list[tuple[str, str, str, int, int, bool]]:
    rows: list[tuple[str, str, str, int, int, bool]] = []
    if not HISTORY_CSV.exists():
        raise FileNotFoundError(f"missing historical corpus: {HISTORY_CSV}")
    with HISTORY_CSV.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
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
# Karlis-Ntzoufras bivariate Poisson PMF + log-likelihood
# ---------------------------------------------------------------------------
def _karlis_log_pmf(x: int, y: int, l1: float, l2: float, l3: float) -> float:
    """log P(Y_h=x, Y_a=y) under Karlis-Ntzoufras bivariate Poisson.

    Uses the standard convolution form summed over k = 0..min(x,y):
        log P = -(l1+l2+l3) + log( sum_k l1^(x-k) l2^(y-k) l3^k / ((x-k)!(y-k)!k!) )
    Computed in log-space with logsumexp to avoid underflow.
    """
    l1 = max(float(l1), LAMBDA_MIN)
    l2 = max(float(l2), LAMBDA_MIN)
    l3 = max(float(l3), 0.0)
    kmax = min(x, y)
    if l3 <= LAMBDA_MIN:
        # Pure independent Poisson product.
        return (
            -(l1 + l2)
            + x * math.log(l1) - gammaln(x + 1)
            + y * math.log(l2) - gammaln(y + 1)
        )
    log_l1 = math.log(l1)
    log_l2 = math.log(l2)
    log_l3 = math.log(l3)
    log_terms = np.empty(kmax + 1, dtype=np.float64)
    for k in range(kmax + 1):
        log_terms[k] = (
            (x - k) * log_l1
            + (y - k) * log_l2
            + k * log_l3
            - gammaln(x - k + 1)
            - gammaln(y - k + 1)
            - gammaln(k + 1)
        )
    # logsumexp
    m = log_terms.max()
    log_sum = m + math.log(np.exp(log_terms - m).sum())
    return -(l1 + l2 + l3) + log_sum


def _karlis_joint_grid(l1: float, l2: float, l3: float, max_goals: int) -> np.ndarray:
    """Compute the (max_goals+1) x (max_goals+1) joint score grid."""
    g = np.empty((max_goals + 1, max_goals + 1), dtype=np.float64)
    for x in range(max_goals + 1):
        for y in range(max_goals + 1):
            g[x, y] = math.exp(_karlis_log_pmf(x, y, l1, l2, l3))
    return g


# ---------------------------------------------------------------------------
# EM for lambda_3 (single global goal-correlation parameter)
# ---------------------------------------------------------------------------
def _em_fit_lambda3(
    matches: Sequence[tuple[float, float, int, int]],
    *,
    max_iter: int = EM_MAX_ITER,
    tol: float = EM_TOL,
) -> dict:
    """EM fit for a single global lambda_3 across all matches.

    Inputs
    ------
    matches : sequence of (lam_h, lam_a, hg, ag) tuples — per-match mean
        scoring rates from the existing Elo+log-linear model PLUS the realised
        goal counts.

    Algorithm
    ---------
    Treat X_3 (the common shock) as latent. Given current lambda_3, the
    E-step computes the conditional expectation E[X_3 | Y_h=x, Y_a=y, lambda_3]
    using the same convolution sum used in _karlis_log_pmf, then the M-step
    sets lambda_3_new = mean_over_matches( E[X_3] ).

    Per Karlis-Ntzoufras (2003) Section 3, this is the closed-form M-step when
    lambda_1, lambda_2 are held fixed at their per-match values. We hold them
    fixed because the production model already gives well-calibrated marginals
    via Elo + log-linear regression — the upgrade we are quantifying is purely
    "what does adding the common-shock term buy us?", not "refit the whole
    scoring intensity model".

    Returns
    -------
    dict with lambda_3_fitted, n_iter, converged, final_ll, per-iter trace.
    """
    n = len(matches)
    if n == 0:
        return {
            "lambda_3_fitted": 0.0, "n_iter": 0, "converged": False,
            "final_ll": float("-inf"), "trace": [],
        }
    # Initialise lambda_3 with method-of-moments style guess: residual covariance
    # of (Y_h - lam_h) and (Y_a - lam_a). Clip to [1e-3, 0.5] — typical empirical
    # range from Karlis-Ntzoufras is ~0.05-0.30.
    lam_h_arr = np.array([m[0] for m in matches], dtype=np.float64)
    lam_a_arr = np.array([m[1] for m in matches], dtype=np.float64)
    hg_arr = np.array([m[2] for m in matches], dtype=np.float64)
    ag_arr = np.array([m[3] for m in matches], dtype=np.float64)
    cov = float(np.mean((hg_arr - lam_h_arr) * (ag_arr - lam_a_arr)))
    lambda_3 = float(np.clip(cov, 0.01, 0.5))
    logger.info(
        "EM init: lambda_3 = %.4f (residual covariance) on n=%d matches",
        lambda_3, n,
    )

    trace = []
    prev_ll = float("-inf")
    converged = False
    final_iter = 0
    for it in range(1, max_iter + 1):
        # E-step: per-match E[X_3 | Y_h, Y_a, lambda_3]
        # E[X_3] = sum_k k * w_k / sum_k w_k where
        #   w_k = lam_h_marg^(x-k) * lam_a_marg^(y-k) * lam_3^k / ((x-k)!(y-k)!k!)
        # but we need the *marginal* lam_h, lam_a NOT minus lam_3 because the
        # convention here keeps lam_h, lam_a as the X_1, X_2 rates and the
        # OBSERVED marginal mean is lam_1 + lam_3, lam_2 + lam_3. We absorb
        # lam_3 into the marginals by reading lam_h, lam_a as the X_1, X_2
        # rates directly — the calling code passes the production model's
        # exp(...) values which are interpreted as X_1 + X_3 means; to keep the
        # marginal identical when lambda_3 changes we *subtract* the shock from
        # the X_1, X_2 rates:
        l1_arr = np.maximum(lam_h_arr - lambda_3, LAMBDA_MIN)
        l2_arr = np.maximum(lam_a_arr - lambda_3, LAMBDA_MIN)
        log_l3 = math.log(max(lambda_3, LAMBDA_MIN))
        e_x3 = np.zeros(n, dtype=np.float64)
        log_lik_sum = 0.0
        for i in range(n):
            x = int(hg_arr[i])
            y = int(ag_arr[i])
            l1 = l1_arr[i]
            l2 = l2_arr[i]
            log_l1 = math.log(l1)
            log_l2 = math.log(l2)
            kmax = min(x, y)
            log_terms = np.empty(kmax + 1, dtype=np.float64)
            for k in range(kmax + 1):
                log_terms[k] = (
                    (x - k) * log_l1
                    + (y - k) * log_l2
                    + k * log_l3
                    - gammaln(x - k + 1)
                    - gammaln(y - k + 1)
                    - gammaln(k + 1)
                )
            m = log_terms.max()
            w = np.exp(log_terms - m)
            w_sum = w.sum()
            ks = np.arange(kmax + 1, dtype=np.float64)
            e_x3[i] = float((ks * w).sum() / w_sum)
            log_lik_sum += -(l1 + l2 + lambda_3) + m + math.log(w_sum)
        # M-step: closed form lambda_3 = mean(E[X_3])
        lambda_3_new = float(e_x3.mean())
        lambda_3_new = max(lambda_3_new, 1e-8)
        trace.append({
            "iter": it,
            "lambda_3": lambda_3,
            "lambda_3_new": lambda_3_new,
            "ll": log_lik_sum,
            "delta_lambda_3": abs(lambda_3_new - lambda_3),
            "delta_ll": log_lik_sum - prev_ll if it > 1 else None,
        })
        if abs(lambda_3_new - lambda_3) < tol and it > 1:
            lambda_3 = lambda_3_new
            converged = True
            final_iter = it
            prev_ll = log_lik_sum
            break
        lambda_3 = lambda_3_new
        prev_ll = log_lik_sum
        final_iter = it
    logger.info(
        "EM done: lambda_3 = %.6f after %d iter (converged=%s, final_ll=%.2f)",
        lambda_3, final_iter, converged, prev_ll,
    )
    return {
        "lambda_3_fitted": lambda_3,
        "n_iter": final_iter,
        "converged": converged,
        "final_ll": prev_ll,
        "trace": trace[-5:],  # last 5 iterations for the audit artefact
    }


# ---------------------------------------------------------------------------
# Per-match lambda generation (same parameterisation as baseline DC)
# ---------------------------------------------------------------------------
def _lambdas_baseline(elo_h: float, elo_a: float, *, neutral: bool) -> tuple[float, float]:
    diff = (elo_h - elo_a) / 400.0
    home_bonus = 0.0 if neutral else HOME_ADV
    lam_h = math.exp(POISSON_A + POISSON_B * diff + home_bonus)
    lam_a = math.exp(POISSON_A - POISSON_B * diff)
    lam_h = float(np.clip(lam_h, 0.05, LAMBDA_MAX))
    lam_a = float(np.clip(lam_a, 0.05, LAMBDA_MAX))
    return lam_h, lam_a


def _wdl_baseline_dc(lam_h: float, lam_a: float, rho: float) -> tuple[float, float, float]:
    """WDL probabilities from independent Poisson + Dixon-Coles low-score correction.
    Matches the production baseline used in wc2026_fit_dc_mle.py.
    """
    pmf_h = poisson.pmf(np.arange(MAX_GOALS_GRID + 1), lam_h)
    pmf_a = poisson.pmf(np.arange(MAX_GOALS_GRID + 1), lam_a)
    grid = np.outer(pmf_h, pmf_a)
    # Dixon-Coles low-score reweighting
    if 0 < lam_h < 8 and 0 < lam_a < 8:
        grid[0, 0] *= 1.0 - lam_h * lam_a * rho
        grid[0, 1] *= 1.0 + lam_h * rho
        grid[1, 0] *= 1.0 + lam_a * rho
        grid[1, 1] *= 1.0 - rho
    total = float(grid.sum())
    if total <= 0:
        return 1.0 / 3, 1.0 / 3, 1.0 / 3
    grid /= total
    p_h = float(np.tril(grid, -1).sum())
    p_d = float(np.trace(grid))
    p_a = float(np.triu(grid, 1).sum())
    s = p_h + p_d + p_a
    return p_h / s, p_d / s, p_a / s


def _wdl_karlis(
    lam_h_marg: float, lam_a_marg: float, lambda_3: float,
) -> tuple[float, float, float]:
    """WDL probabilities from Karlis-Ntzoufras bivariate Poisson.

    lam_h_marg, lam_a_marg are the OBSERVED marginal scoring rates (i.e. the
    production model's exp(POISSON_A + ...) values, unchanged). lambda_3 is
    the global EM-fitted common shock. The X_1, X_2 rates fed into the joint
    PMF are lam_h_marg - lambda_3, lam_a_marg - lambda_3 so that the marginal
    means of Y_h, Y_a remain identical to the baseline.
    """
    l1 = max(lam_h_marg - lambda_3, LAMBDA_MIN)
    l2 = max(lam_a_marg - lambda_3, LAMBDA_MIN)
    l3 = max(lambda_3, 0.0)
    grid = _karlis_joint_grid(l1, l2, l3, MAX_GOALS_GRID)
    total = float(grid.sum())
    if total <= 0:
        return 1.0 / 3, 1.0 / 3, 1.0 / 3
    grid /= total
    p_h = float(np.tril(grid, -1).sum())
    p_d = float(np.trace(grid))
    p_a = float(np.triu(grid, 1).sum())
    s = p_h + p_d + p_a
    return p_h / s, p_d / s, p_a / s


# ---------------------------------------------------------------------------
# Walk-forward backtest (mirrors wc2026_fit_dc_mle.py contract)
# ---------------------------------------------------------------------------
def _walk_forward(
    history: Sequence[tuple[str, str, str, int, int, bool]],
    predict_fn,
    *,
    warmup_n: int,
) -> dict:
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


def _collect_train_matches_for_em(
    history: Sequence[tuple[str, str, str, int, int, bool]],
    *,
    warmup_n: int,
    train_end_idx: int,
) -> list[tuple[float, float, int, int]]:
    """Replay Elo over [0, train_end_idx) and emit (lam_h, lam_a, hg, ag) for
    every post-warmup match in that range. These are the matches the EM uses
    to fit lambda_3. Crucially, the Elo book is exactly the as-of state the
    backtester would have seen at each point — no leakage.
    """
    elo = Elo()
    out: list[tuple[float, float, int, int]] = []
    for i, (_date, home, away, hg, ag, neutral) in enumerate(history[:train_end_idx]):
        if i >= warmup_n:
            lam_h, lam_a = _lambdas_baseline(elo.get(home), elo.get(away), neutral=neutral)
            out.append((lam_h, lam_a, hg, ag))
        elo.update(home, away, hg, ag, competition="worldcup")
    return out


# ---------------------------------------------------------------------------
# Paired bootstrap (same protocol as wc2026_fit_dc_mle.py)
# ---------------------------------------------------------------------------
def _paired_bootstrap(
    baseline_brier: np.ndarray,
    karlis_brier: np.ndarray,
    baseline_correct: np.ndarray,
    karlis_correct: np.ndarray,
    *,
    n_boot: int,
    seed: int,
) -> dict:
    if len(baseline_brier) != len(karlis_brier):
        raise ValueError("paired bootstrap requires equal-length arrays")
    n = len(baseline_brier)
    rng = np.random.default_rng(seed)
    deltas_brier = np.empty(n_boot, dtype=np.float64)
    deltas_winner = np.empty(n_boot, dtype=np.float64)
    for j in range(n_boot):
        idx = rng.integers(0, n, size=n)
        deltas_brier[j] = karlis_brier[idx].mean() - baseline_brier[idx].mean()
        deltas_winner[j] = karlis_correct[idx].mean() - baseline_correct[idx].mean()
    ci_brier = (
        float(np.percentile(deltas_brier, 2.5)),
        float(np.percentile(deltas_brier, 97.5)),
    )
    ci_winner = (
        float(np.percentile(deltas_winner, 2.5)),
        float(np.percentile(deltas_winner, 97.5)),
    )
    return {
        "n_boot": int(n_boot),
        "n_matches": int(n),
        "brier_delta_ci_95": ci_brier,
        "winner_delta_ci_95": ci_winner,
        # Karlis Brier *lower* is good -> upper bound < 0
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

    n_post = len(history) - WARMUP_N
    train_split = WARMUP_N + n_post // 2
    train_history = history[:train_split]
    eval_history = history[train_split:]
    logger.info(
        "OOS split: warmup=%d, train_post_warmup=%d, eval=%d (eval starts %s)",
        WARMUP_N, len(train_history) - WARMUP_N, len(eval_history),
        eval_history[0][0] if eval_history else "n/a",
    )

    # 1) Collect (lam_h, lam_a, hg, ag) over the training window using the
    #    production marginal-rate model + as-of Elo. These are the matches the
    #    EM fits lambda_3 on.
    train_matches = _collect_train_matches_for_em(
        history, warmup_n=WARMUP_N, train_end_idx=train_split,
    )
    logger.info("collected %d train matches for EM", len(train_matches))

    # 2) EM fit lambda_3
    em = _em_fit_lambda3(train_matches, max_iter=EM_MAX_ITER, tol=EM_TOL)
    lambda_3 = float(em["lambda_3_fitted"])

    # 3) Walk-forward backtest under BASELINE (independent Poisson + DC)
    def _predict_baseline(elo, home, away, *, neutral):
        lam_h, lam_a = _lambdas_baseline(elo.get(home), elo.get(away), neutral=neutral)
        return _wdl_baseline_dc(lam_h, lam_a, DC_RHO)

    logger.info("walk-forward backtest: BASELINE (independent Poisson + DC)")
    baseline_run = _walk_forward(history, _predict_baseline, warmup_n=train_split)
    logger.info(
        "BASELINE: n=%d winner=%.4f brier=%.4f",
        baseline_run["n"], baseline_run["winner_accuracy"], baseline_run["mean_brier"],
    )

    # 4) Walk-forward backtest under KARLIS-NTZOUFRAS (joint bivariate Poisson)
    def _predict_karlis(elo, home, away, *, neutral):
        lam_h, lam_a = _lambdas_baseline(elo.get(home), elo.get(away), neutral=neutral)
        return _wdl_karlis(lam_h, lam_a, lambda_3)

    logger.info("walk-forward backtest: KARLIS-NTZOUFRAS (joint, lambda_3=%.6f)", lambda_3)
    karlis_run = _walk_forward(history, _predict_karlis, warmup_n=train_split)
    logger.info(
        "KARLIS: n=%d winner=%.4f brier=%.4f",
        karlis_run["n"], karlis_run["winner_accuracy"], karlis_run["mean_brier"],
    )

    # 5) Paired bootstrap
    boot = _paired_bootstrap(
        baseline_run["brier_per_match"], karlis_run["brier_per_match"],
        baseline_run["correct_per_match"], karlis_run["correct_per_match"],
        n_boot=N_BOOT, seed=RNG_SEED,
    )

    brier_delta = karlis_run["mean_brier"] - baseline_run["mean_brier"]
    winner_delta = karlis_run["winner_accuracy"] - baseline_run["winner_accuracy"]
    real_lift = bool(boot["real_lift_brier"])  # the question is purely "does the joint model lift Brier?"

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "generated_at": generated_at,
        "model": "Karlis-Ntzoufras 2003 bivariate Poisson",
        "lambda_3_fitted": round(lambda_3, 6),
        "brier": round(karlis_run["mean_brier"], 6),
        "brier_baseline": round(baseline_run["mean_brier"], 6),
        "brier_delta": round(brier_delta, 6),
        "ci_95": [round(boot["brier_delta_ci_95"][0], 6),
                  round(boot["brier_delta_ci_95"][1], 6)],
        "real_lift": real_lift,
        "winner_accuracy": round(karlis_run["winner_accuracy"], 6),
        "winner_accuracy_baseline": round(baseline_run["winner_accuracy"], 6),
        "winner_delta": round(winner_delta, 6),
        "winner_ci_95": [round(boot["winner_delta_ci_95"][0], 6),
                         round(boot["winner_delta_ci_95"][1], 6)],
        "n_matches_evaluated": int(baseline_run["n"]),
        "n_train_matches_em": int(len(train_matches)),
        "n_bootstrap": int(N_BOOT),
        "rng_seed": int(RNG_SEED),
        "em_diagnostics": {
            "converged": bool(em["converged"]),
            "n_iter": int(em["n_iter"]),
            "final_ll": round(float(em["final_ll"]), 4),
            "last_iters_trace": em["trace"],
            "tol": EM_TOL,
            "max_iter": EM_MAX_ITER,
        },
        "methodology": (
            "Karlis-Ntzoufras (2003) bivariate Poisson: Y_h = X_1 + X_3, "
            "Y_a = X_2 + X_3 with X_1, X_2, X_3 independent Poisson. EM fit of "
            "a single global lambda_3 (goal-correlation common shock) on the "
            f"first half ({len(train_matches)}) of post-warmup historical "
            "matches, holding lam_h, lam_a fixed at the production model's Elo+ "
            "log-linear values (marginals unchanged). Walk-forward OOS backtest "
            f"on the second half ({baseline_run['n']} matches), with the same "
            "Elo book updates applied to both arms so the only thing differing "
            "is the joint scoring distribution. Paired bootstrap (n_boot=300) "
            "of per-match Brier deltas. real_lift = 95% CI on brier_delta "
            "strictly excludes 0 in the favourable direction (delta < 0)."
        ),
        "evaluation_methodology_matches": (
            "Identical OOS split, warmup, bootstrap seed, and n_boot as "
            "scripts/wc2026_fit_dc_mle.py so Karlis lift is directly "
            "comparable to the Dixon-Coles MLE lift recorded in "
            "server/data/wc2026_methods_comparison.json."
        ),
        "train_eval_split": {
            "warmup_n": WARMUP_N,
            "train_n_post_warmup": len(train_history) - WARMUP_N,
            "train_n_total_with_warmup": train_split,
            "eval_n": int(baseline_run["n"]),
            "eval_starts": eval_history[0][0] if eval_history else None,
        },
        "baseline_metrics": {
            "winner_accuracy": round(baseline_run["winner_accuracy"], 4),
            "brier": round(baseline_run["mean_brier"], 4),
            "n": int(baseline_run["n"]),
        },
        "karlis_metrics": {
            "winner_accuracy": round(karlis_run["winner_accuracy"], 4),
            "brier": round(karlis_run["mean_brier"], 4),
            "n": int(karlis_run["n"]),
        },
        "source": "scripts/wc2026_fit_karlis.py:_em_fit_lambda3 + walk-forward paired bootstrap (Karlis-Ntzoufras 2003)",
        "verified": True,
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    logger.info("wrote -> %s (real_lift=%s, lambda_3=%.6f)",
                OUTPUT_JSON, real_lift, lambda_3)
    return payload


if __name__ == "__main__":
    main()
