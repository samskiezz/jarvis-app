"""WC2026 predictor hyperparameter tuning via walk-forward backtest.

GATEGUARD facts (first-edit context):
- Callers: this script writes `wc2026_predictor_tuned.json`, which is then
  loaded at module-init time by `wc2026_predictor.py` (`_load_tuned_coefficients`).
- Data schema (input): `wc2026_30k_backtest.json` provides baseline
  `models.elo_poisson.{winner_accuracy, mean_brier, n}`.
- Data schema (output): `{best_k_factor, best_home_adv, best_b, best_dc_tau,
  baseline_metrics, tuned_metrics, delta_winner_pp, delta_brier, honest_note}`.
- User instruction quoted: "sweep these hyperparameters via small grid search
  (10 combinations max) ... Pick the combination that minimises Brier
  (lower=better calibration)."

Methodology
-----------
The full grid (3 K × 3 home_adv × 3 b × 3 tau = 81) exceeds the 10-combo
budget, so we use a constrained anchored sweep around the baseline
(K=40, home_adv=0.4, b=1.6, tau=-0.08):
  1. Baseline (K=40, ha=0.4, b=1.6, tau=-0.08).
  2. K sweep: 30 and 50 with other params at baseline (2 combos).
  3. home_adv sweep: 0.3 and 0.5 (2 combos).
  4. b sweep: 1.4 and 1.8 (2 combos).
  5. tau sweep: -0.05 and -0.10 (2 combos).
  6. Best-of-each combined (1 combo).
Total = 10 combinations.

Walk-forward backtest mirrors `wc2026_30k_backtest`:
  - Walk the full historical CSV chronologically.
  - Skip first 100 matches for warmup (Elo book updates but no scoring).
  - Score the remaining ~463 matches with the chosen hyperparams.
  - Winner accuracy = argmax matches actual class.
  - Brier = mean of (p_h - y_h)^2 + (p_d - y_d)^2 + (p_a - y_a)^2.
"""

from __future__ import annotations

import csv
import json
import logging
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import numpy as np
from scipy.stats import poisson

# Reuse Elo + alias logic from the production predictor.
sys.path.insert(0, str(Path(__file__).parent))
from wc2026_predictor import (  # noqa: E402
    BASELINE_ELO,
    DEFAULT_ELO,
    _canonical_team,
)


logger = logging.getLogger("wc2026_tune")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


HISTORY_CSV = Path("/opt/jarvis-app-1/server/data/wc2026_training_history.csv")
BACKTEST_JSON = Path("/opt/jarvis-app-1/server/data/wc2026_30k_backtest.json")
OUT_JSON = Path("/opt/jarvis-app-1/scripts/wc2026_predictor_tuned.json")
WARMUP_N = 100
POISSON_A = 0.15  # held fixed per user spec (only b varies).


# ---------------------------------------------------------------------------
# Self-contained Elo book with tunable K-factor
# ---------------------------------------------------------------------------
@dataclass
class TunableElo:
    """Elo with externally configurable K-factor and home advantage."""

    k_factor: float = 40.0
    home_adv_elo: float = 0.0  # additive Elo bonus for "home" side (not used here; we use log-lambda home_adv instead)
    ratings: dict[str, float] = field(default_factory=lambda: dict(BASELINE_ELO))

    def get(self, team: str) -> float:
        return self.ratings.get(team, BASELINE_ELO.get(team, DEFAULT_ELO))

    def set(self, team: str, value: float) -> None:
        self.ratings[team] = value

    def expected(self, home: str, away: str) -> float:
        diff = self.get(home) - self.get(away)
        return 1.0 / (1.0 + 10.0 ** (-diff / 400.0))

    def update(self, home: str, away: str, hg: int, ag: int) -> None:
        if hg > ag:
            score = 1.0
        elif hg == ag:
            score = 0.5
        else:
            score = 0.0
        gd = abs(hg - ag)
        if gd <= 1:
            mov = 1.0
        elif gd == 2:
            mov = 1.5
        else:
            mov = (11.0 + gd) / 8.0
        exp_h = self.expected(home, away)
        delta = self.k_factor * mov * (score - exp_h)
        self.set(home, self.get(home) + delta)
        self.set(away, self.get(away) - delta)


# ---------------------------------------------------------------------------
# Match prediction with tunable hyperparams (matches predictor logic)
# ---------------------------------------------------------------------------
def _dc_tau_cell(hg: int, ag: int, lam_h: float, lam_a: float, rho: float) -> float:
    if hg == 0 and ag == 0:
        return 1.0 - lam_h * lam_a * rho
    if hg == 0 and ag == 1:
        return 1.0 + lam_h * rho
    if hg == 1 and ag == 0:
        return 1.0 + lam_a * rho
    if hg == 1 and ag == 1:
        return 1.0 - rho
    return 1.0


def _predict_probs(
    elo: TunableElo,
    home: str,
    away: str,
    *,
    home_adv: float,
    b: float,
    rho: float,
    neutral: bool,
    max_goals: int = 8,
) -> tuple[float, float, float]:
    diff = (elo.get(home) - elo.get(away)) / 400.0
    home_bonus = 0.0 if neutral else home_adv
    lam_h = math.exp(POISSON_A + b * diff + home_bonus)
    lam_a = math.exp(POISSON_A - b * diff)
    lam_h = float(np.clip(lam_h, 0.05, 8.0))
    lam_a = float(np.clip(lam_a, 0.05, 8.0))
    pmf_h = poisson.pmf(np.arange(max_goals + 1), lam_h)
    pmf_a = poisson.pmf(np.arange(max_goals + 1), lam_a)
    grid = np.outer(pmf_h, pmf_a)
    for hg, ag in ((0, 0), (0, 1), (1, 0), (1, 1)):
        grid[hg, ag] *= _dc_tau_cell(hg, ag, lam_h, lam_a, rho)
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


# ---------------------------------------------------------------------------
# CSV loader
# ---------------------------------------------------------------------------
def _load_history(csv_path: Path) -> list[tuple[str, str, str, int, int, bool, str]]:
    """Return list of (date, home, away, hg, ag, neutral, competition)."""
    rows: list[tuple[str, str, str, int, int, bool, str]] = []
    with csv_path.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            # Skip WC2026 MD1 rows (held-out per the existing backtest).
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
                r.get("competition", ""),
            ))
    rows.sort(key=lambda x: x[0])
    return rows


# ---------------------------------------------------------------------------
# Walk-forward backtest under one hyperparam combination
# ---------------------------------------------------------------------------
def backtest_one(
    history: list[tuple[str, str, str, int, int, bool, str]],
    *,
    k_factor: float,
    home_adv: float,
    b: float,
    rho: float,
    warmup_n: int,
) -> dict:
    elo = TunableElo(k_factor=k_factor)
    n_scored = 0
    winner_correct = 0
    brier_total = 0.0
    for i, (_date, home, away, hg, ag, neutral, _comp) in enumerate(history):
        if i >= warmup_n:
            p_home, p_draw, p_away = _predict_probs(
                elo, home, away,
                home_adv=home_adv, b=b, rho=rho, neutral=neutral,
            )
            if hg > ag:
                actual = "H"
                y_h, y_d, y_a = 1.0, 0.0, 0.0
            elif hg == ag:
                actual = "D"
                y_h, y_d, y_a = 0.0, 1.0, 0.0
            else:
                actual = "A"
                y_h, y_d, y_a = 0.0, 0.0, 1.0
            # argmax class
            triples = ((p_home, "H"), (p_draw, "D"), (p_away, "A"))
            cls = max(triples, key=lambda t: t[0])[1]
            if cls == actual:
                winner_correct += 1
            brier_total += (
                (p_home - y_h) ** 2
                + (p_draw - y_d) ** 2
                + (p_away - y_a) ** 2
            )
            n_scored += 1
        elo.update(home, away, hg, ag)
    if n_scored == 0:
        return {"n": 0, "winner_accuracy": 0.0, "mean_brier": 0.0}
    return {
        "n": n_scored,
        "winner_accuracy": winner_correct / n_scored,
        "mean_brier": brier_total / n_scored,
    }


# ---------------------------------------------------------------------------
# Bootstrap CI for whether the lift is real
# ---------------------------------------------------------------------------
def bootstrap_significance(
    history: list,
    baseline_params: dict,
    tuned_params: dict,
    *,
    n_boot: int = 200,
    warmup_n: int = WARMUP_N,
    seed: int = 20260619,
) -> dict:
    """Return paired-bootstrap 95% CI on (tuned_brier - baseline_brier).

    We compute per-match brier under each param set, then resample matches
    with replacement and recompute the delta `n_boot` times.
    """
    rng = np.random.default_rng(seed)
    per_match_baseline: list[float] = []
    per_match_tuned: list[float] = []
    per_match_baseline_correct: list[int] = []
    per_match_tuned_correct: list[int] = []

    for params, brier_list, correct_list in (
        (baseline_params, per_match_baseline, per_match_baseline_correct),
        (tuned_params, per_match_tuned, per_match_tuned_correct),
    ):
        elo = TunableElo(k_factor=params["k_factor"])
        for i, (_date, home, away, hg, ag, neutral, _comp) in enumerate(history):
            if i >= warmup_n:
                p_h, p_d, p_a = _predict_probs(
                    elo, home, away,
                    home_adv=params["home_adv"],
                    b=params["b"],
                    rho=params["rho"],
                    neutral=neutral,
                )
                if hg > ag:
                    y_h, y_d, y_a, actual = 1.0, 0.0, 0.0, "H"
                elif hg == ag:
                    y_h, y_d, y_a, actual = 0.0, 1.0, 0.0, "D"
                else:
                    y_h, y_d, y_a, actual = 0.0, 0.0, 1.0, "A"
                brier_list.append(
                    (p_h - y_h) ** 2 + (p_d - y_d) ** 2 + (p_a - y_a) ** 2
                )
                triples = ((p_h, "H"), (p_d, "D"), (p_a, "A"))
                cls = max(triples, key=lambda t: t[0])[1]
                correct_list.append(1 if cls == actual else 0)
            elo.update(home, away, hg, ag)

    baseline_arr = np.array(per_match_baseline)
    tuned_arr = np.array(per_match_tuned)
    correct_baseline_arr = np.array(per_match_baseline_correct)
    correct_tuned_arr = np.array(per_match_tuned_correct)

    n = len(baseline_arr)
    deltas_brier = np.empty(n_boot)
    deltas_winner = np.empty(n_boot)
    for j in range(n_boot):
        idx = rng.integers(0, n, size=n)
        deltas_brier[j] = tuned_arr[idx].mean() - baseline_arr[idx].mean()
        deltas_winner[j] = correct_tuned_arr[idx].mean() - correct_baseline_arr[idx].mean()

    ci_brier = (float(np.percentile(deltas_brier, 2.5)),
                float(np.percentile(deltas_brier, 97.5)))
    ci_winner = (float(np.percentile(deltas_winner, 2.5)),
                 float(np.percentile(deltas_winner, 97.5)))
    return {
        "n_matches": int(n),
        "n_boot": n_boot,
        "delta_brier_ci_95": ci_brier,
        "delta_winner_ci_95": ci_winner,
        "brier_lift_real": ci_brier[1] < 0.0,  # both bounds negative = tuned strictly better
        "winner_lift_real": ci_winner[0] > 0.0,
    }


# ---------------------------------------------------------------------------
# Main grid search
# ---------------------------------------------------------------------------
def main() -> dict:
    history = _load_history(HISTORY_CSV)
    logger.info("loaded %d historical matches (post-warmup score window = %d)",
                len(history), len(history) - WARMUP_N)

    # Baseline (current production params).
    baseline = {"k_factor": 40.0, "home_adv": 0.4, "b": 1.6, "rho": -0.08}

    # 10 grid points (anchored sweep — see module docstring).
    grid: list[dict] = [
        baseline,
        {"k_factor": 30.0, "home_adv": 0.4, "b": 1.6, "rho": -0.08},
        {"k_factor": 50.0, "home_adv": 0.4, "b": 1.6, "rho": -0.08},
        {"k_factor": 40.0, "home_adv": 0.3, "b": 1.6, "rho": -0.08},
        {"k_factor": 40.0, "home_adv": 0.5, "b": 1.6, "rho": -0.08},
        {"k_factor": 40.0, "home_adv": 0.4, "b": 1.4, "rho": -0.08},
        {"k_factor": 40.0, "home_adv": 0.4, "b": 1.8, "rho": -0.08},
        {"k_factor": 40.0, "home_adv": 0.4, "b": 1.6, "rho": -0.05},
        {"k_factor": 40.0, "home_adv": 0.4, "b": 1.6, "rho": -0.10},
        # 10th combo: filled in after the single-axis sweeps using the best
        # value from each axis (best-of-each combined).
    ]

    logger.info("running 9 anchored sweep combos first...")
    single_axis_results: list[tuple[dict, dict]] = []
    for params in grid:
        metrics = backtest_one(history, **params, warmup_n=WARMUP_N)
        single_axis_results.append((params, metrics))
        logger.info(
            "K=%.0f ha=%.2f b=%.2f rho=%.2f -> winner=%.4f brier=%.4f (n=%d)",
            params["k_factor"], params["home_adv"], params["b"], params["rho"],
            metrics["winner_accuracy"], metrics["mean_brier"], metrics["n"],
        )

    # Build the 10th "best-of-each" combo by walking each axis independently
    # vs baseline and picking the value with lowest brier on that axis.
    def best_on_axis(axis: str, candidates: Iterable[float]) -> float:
        best_val = baseline[axis]
        best_brier = next(m["mean_brier"] for p, m in single_axis_results
                          if p == baseline)
        for val in candidates:
            test = dict(baseline)
            test[axis] = val
            for p, m in single_axis_results:
                if p == test:
                    if m["mean_brier"] < best_brier:
                        best_brier = m["mean_brier"]
                        best_val = val
                    break
        return best_val

    combo10 = {
        "k_factor": best_on_axis("k_factor", [30.0, 50.0]),
        "home_adv": best_on_axis("home_adv", [0.3, 0.5]),
        "b": best_on_axis("b", [1.4, 1.8]),
        "rho": best_on_axis("rho", [-0.05, -0.10]),
    }
    if combo10 not in [p for p, _ in single_axis_results]:
        metrics10 = backtest_one(history, **combo10, warmup_n=WARMUP_N)
        single_axis_results.append((combo10, metrics10))
        logger.info(
            "best-of-each combo: K=%.0f ha=%.2f b=%.2f rho=%.2f -> winner=%.4f brier=%.4f",
            combo10["k_factor"], combo10["home_adv"], combo10["b"], combo10["rho"],
            metrics10["winner_accuracy"], metrics10["mean_brier"],
        )
    else:
        logger.info("best-of-each combo duplicates an earlier point; skipping rerun")

    # Pick lowest-brier combination.
    best_params, best_metrics = min(single_axis_results, key=lambda kv: kv[1]["mean_brier"])
    baseline_metrics = next(m for p, m in single_axis_results if p == baseline)
    logger.info("BEST: %s -> brier=%.4f winner=%.4f",
                best_params, best_metrics["mean_brier"], best_metrics["winner_accuracy"])

    delta_winner_pp = 100.0 * (best_metrics["winner_accuracy"] - baseline_metrics["winner_accuracy"])
    delta_brier = best_metrics["mean_brier"] - baseline_metrics["mean_brier"]

    # Significance via paired bootstrap.
    sig = bootstrap_significance(
        history,
        baseline_params=baseline,
        tuned_params=best_params,
        n_boot=300,
    )

    n_eval = baseline_metrics["n"]
    honest_note = _format_honest_note(
        n_eval=n_eval,
        delta_winner_pp=delta_winner_pp,
        delta_brier=delta_brier,
        sig=sig,
        best_params=best_params,
        baseline=baseline,
    )

    out_payload = {
        "best_k_factor": float(best_params["k_factor"]),
        "best_home_adv": float(best_params["home_adv"]),
        "best_b": float(best_params["b"]),
        "best_dc_tau": float(best_params["rho"]),
        "baseline_metrics": {
            "winner": round(baseline_metrics["winner_accuracy"], 4),
            "brier": round(baseline_metrics["mean_brier"], 4),
            "n": baseline_metrics["n"],
        },
        "tuned_metrics": {
            "winner": round(best_metrics["winner_accuracy"], 4),
            "brier": round(best_metrics["mean_brier"], 4),
            "n": best_metrics["n"],
        },
        "delta_winner_pp": round(delta_winner_pp, 2),
        "delta_brier": round(delta_brier, 4),
        "honest_note": honest_note,
        "grid_search": [
            {
                "params": p,
                "winner_accuracy": round(m["winner_accuracy"], 4),
                "mean_brier": round(m["mean_brier"], 4),
            }
            for p, m in single_axis_results
        ],
        "bootstrap_ci": sig,
    }
    OUT_JSON.write_text(json.dumps(out_payload, indent=2, ensure_ascii=False))
    logger.info("wrote tuned params -> %s", OUT_JSON)
    return out_payload


def _format_honest_note(
    *,
    n_eval: int,
    delta_winner_pp: float,
    delta_brier: float,
    sig: dict,
    best_params: dict,
    baseline: dict,
) -> str:
    if best_params == baseline:
        return (
            f"Baseline (K=40, home_adv=0.4, b=1.6, tau=-0.08) is the best "
            f"on the {n_eval}-match historical window — no tuned combination "
            f"improved Brier. Lift is zero by construction; no statistical "
            f"claim to make."
        )
    brier_ci_lo, brier_ci_hi = sig["delta_brier_ci_95"]
    winner_ci_lo, winner_ci_hi = sig["delta_winner_ci_95"]
    brier_strict = sig["brier_lift_real"]
    winner_strict = sig["winner_lift_real"]
    if brier_strict and winner_strict:
        verdict = "real (both 95% CIs exclude 0 in the favourable direction)"
    elif brier_strict or winner_strict:
        verdict = "partially real — one of {Brier, winner} is strictly better, the other CI straddles 0"
    else:
        verdict = "within noise — both bootstrap 95% CIs straddle 0"
    return (
        f"With n={n_eval} scored historical matches and 300-rep paired "
        f"bootstrap, delta_brier 95% CI=[{brier_ci_lo:+.4f}, {brier_ci_hi:+.4f}] "
        f"and delta_winner 95% CI=[{winner_ci_lo:+.4f}, {winner_ci_hi:+.4f}]. "
        f"Point estimate: winner {delta_winner_pp:+.2f} pp, Brier {delta_brier:+.4f}. "
        f"Verdict: {verdict}. Treat the new params as a marginal refinement, "
        f"not a breakthrough — international-football three-way accuracy ceiling "
        f"is ~52-58% (Groll et al.)."
    )


if __name__ == "__main__":
    main()
