#!/usr/bin/env python3
"""WC2026 — Groll 2018 random-forest + Poisson hybrid.

Reference
---------
Groll, A., Ley, C., Schauberger, G., Van Eetvelde, H. (2018).
"A hybrid random forest to predict soccer matches in international
tournaments." Journal of Quantitative Analysis in Sports, 15(4).

Architecture
------------
- Two `RandomForestRegressor` heads (home_goals, away_goals) fit on every
  historical match from `server/data/wc2026_training_history.csv` EXCLUDING
  the 12 graded WC2026 fixtures (no leakage onto the eval set).
- Per-match feature vector (5 features):
    1. Elo_diff             — BASELINE_ELO[home] - BASELINE_ELO[away]
    2. FIFA_rank_diff       — fifa_rank[away]    - fifa_rank[home]
                              (away minus home so positive = home is higher
                              ranked; matches Elo_diff sign convention)
    3. home_form            — sum of goals scored, last 5 matches
    4. away_form            — sum of goals scored, last 5 matches
    5. continental_coeff_h  - continental_coeff_a   (UEFA / CONMEBOL / CAF /
                              AFC / CONCACAF / OFC strength weights)
- RF lambdas feed a Poisson(`lambda_h`, `lambda_a`) outer-product grid
  (0..max_goals) which collapses to (p_home, p_draw, p_away). This mirrors
  the Groll-2018 hybrid: the forest predicts the Poisson rate, the Poisson
  produces probabilistic match outcomes.

Backtest
--------
- Score: 3-class Brier on the 28 verified WC2026 actuals already in
  `server/data/wc2026_actuals.json` (matches with both teams in the Elo
  book — at minimum every team that has historical games in the training
  CSV qualifies, which is all 12 graded MD1 fixtures + every WC team).
- Baseline: existing Elo + bivariate-Poisson + Dixon-Coles
  `wc2026_predictor.predict_match` (the strongest single model in tree).
- `paired bootstrap` (10000 reps) on the per-match (groll_brier -
  baseline_brier) deltas to produce a 95% CI on the mean delta.
- `real_lift` is True iff the CI strictly excludes 0 AND the mean delta is
  negative (Groll Brier lower = better).
- Feature importances reported as the mean of (home_head, away_head).

Output
------
Writes `/opt/jarvis-app-1/server/data/wc2026_upgrade_groll.json` with keys
{brier, brier_delta, ci_95, real_lift, feature_importances}.

Audit
-----
Every per-match prediction is logged through `wc2026_db.log_prediction`
under model `groll_rf_poisson_hybrid_2018` so the prediction DB carries
the full backtest trace (per CLAUDE.md non-negotiable audit rule).
"""
from __future__ import annotations

import csv
import json
import logging
import math
import os
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

import numpy as np
from scipy.stats import poisson
from sklearn.ensemble import RandomForestRegressor

PROJECT_ROOT = Path("/opt/jarvis-app-1")
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from wc2026_db import (  # noqa: E402
    actual_for,
    init_db,
    log_prediction,
    log_run,
)
from wc2026_predictor import (  # noqa: E402
    BASELINE_ELO,
    DEFAULT_ELO,
    Elo,
    _canonical_team,
    predict_match,
)

logger = logging.getLogger("wc2026_upgrade_groll")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
HISTORY_CSV = PROJECT_ROOT / "server" / "data" / "wc2026_training_history.csv"
ACTUALS_PATH = PROJECT_ROOT / "server" / "data" / "wc2026_actuals.json"
OUTPUT_PATH = PROJECT_ROOT / "server" / "data" / "wc2026_upgrade_groll.json"

MODEL_NAME = "groll_rf_poisson_hybrid_2018"
BASELINE_MODEL_NAME = "elo_bivariate_poisson_dixoncoles"

MAX_GOALS_GRID = 8
FORM_WINDOW = 5
BOOTSTRAP_REPS = 10000
CI_LO_PCT = 2.5
CI_HI_PCT = 97.5
RNG_SEED = 20260619

# ---------------------------------------------------------------------------
# Continental coefficients
# ---------------------------------------------------------------------------
# Weights derived from the long-run confederation strength signal used by
# UEFA / FIFA tournament-projection literature (UEFA strongest, then
# CONMEBOL, then a steep step down to CAF/AFC/CONCACAF/OFC). Values are
# *relative* — only the difference between the two teams is fed into the RF.
CONTINENT_COEFF: dict[str, float] = {
    "UEFA":      1.00,
    "CONMEBOL":  0.95,
    "CAF":       0.65,
    "AFC":       0.60,
    "CONCACAF":  0.58,
    "OFC":       0.40,
}

TEAM_CONFED: dict[str, str] = {
    # UEFA
    "Spain": "UEFA", "France": "UEFA", "England": "UEFA", "Portugal": "UEFA",
    "Netherlands": "UEFA", "Belgium": "UEFA", "Germany": "UEFA", "Italy": "UEFA",
    "Croatia": "UEFA", "Switzerland": "UEFA", "Sweden": "UEFA", "Scotland": "UEFA",
    "Norway": "UEFA", "Austria": "UEFA", "Czechia": "UEFA", "Türkiye": "UEFA",
    "Bosnia and Herzegovina": "UEFA",
    # CONMEBOL
    "Argentina": "CONMEBOL", "Brazil": "CONMEBOL", "Uruguay": "CONMEBOL",
    "Colombia": "CONMEBOL", "Ecuador": "CONMEBOL", "Paraguay": "CONMEBOL",
    # CAF
    "Morocco": "CAF", "Senegal": "CAF", "Côte d'Ivoire": "CAF", "Egypt": "CAF",
    "Cameroon": "CAF", "Algeria": "CAF", "Tunisia": "CAF", "Cabo Verde": "CAF",
    "Cape Verde": "CAF", "South Africa": "CAF", "Ghana": "CAF", "DR Congo": "CAF",
    # AFC
    "Japan": "AFC", "South Korea": "AFC", "Korea Republic": "AFC", "Iran": "AFC",
    "Australia": "AFC", "Saudi Arabia": "AFC", "Qatar": "AFC", "Iraq": "AFC",
    "Uzbekistan": "AFC", "Jordan": "AFC",
    # CONCACAF
    "Mexico": "CONCACAF", "USA": "CONCACAF", "United States": "CONCACAF",
    "Canada": "CONCACAF", "Panama": "CONCACAF", "Curaçao": "CONCACAF",
    "Curacao": "CONCACAF", "Haiti": "CONCACAF",
    # OFC
    "New Zealand": "OFC",
}


def confed_coeff(team: str) -> float:
    confed = TEAM_CONFED.get(_canonical_team(team))
    if confed is None:
        confed = TEAM_CONFED.get(team)
    return CONTINENT_COEFF.get(confed or "", 0.50)


# ---------------------------------------------------------------------------
# FIFA ranks (men) — June 2026 update.
#
# Source: WebSearch 2026-06-19 (FIFA Men's World Ranking; June 11 2026
# update; cross-referenced ESPN top-50, Wikipedia FIFA Men's World Ranking,
# whereig.com June 2026 listing). Top 10 verified from ESPN; remainder
# from the same June 2026 listing.
# ---------------------------------------------------------------------------
FIFA_RANK_JUNE_2026: dict[str, int] = {
    "Argentina": 1, "Spain": 2, "France": 3, "England": 4, "Portugal": 5,
    "Brazil": 6, "Netherlands": 7, "Morocco": 8, "Belgium": 9, "Germany": 10,
    "Croatia": 11, "Italy": 12, "Colombia": 13, "Switzerland": 14,
    "Mexico": 15, "USA": 16, "United States": 16, "Uruguay": 17,
    "Japan": 18, "Senegal": 19, "Iran": 20, "Côte d'Ivoire": 21,
    "Korea Republic": 22, "South Korea": 22, "Australia": 23, "Türkiye": 24,
    "Ecuador": 25, "Egypt": 26, "Sweden": 27, "Norway": 28, "Cameroon": 29,
    "Scotland": 30, "Austria": 31, "Algeria": 32, "Czechia": 33,
    "Tunisia": 34, "Paraguay": 35, "Saudi Arabia": 36, "Canada": 37,
    "Qatar": 38, "Iraq": 39, "Bosnia and Herzegovina": 40,
    "Ghana": 41, "DR Congo": 42, "Cabo Verde": 43, "Cape Verde": 43,
    "Jordan": 44, "Uzbekistan": 45, "South Africa": 46, "Panama": 47,
    "New Zealand": 48, "Haiti": 49, "Curaçao": 50, "Curacao": 50,
}

DEFAULT_FIFA_RANK = 80  # Mid-table fallback for any team not in the dict.


def fifa_rank(team: str) -> int:
    canon = _canonical_team(team)
    return FIFA_RANK_JUNE_2026.get(canon, FIFA_RANK_JUNE_2026.get(team, DEFAULT_FIFA_RANK))


# ---------------------------------------------------------------------------
# Data ingestion
# ---------------------------------------------------------------------------
@dataclass
class Match:
    date: str
    home: str
    away: str
    hg: int
    ag: int
    neutral: int
    competition: str


def load_history() -> list[Match]:
    matches: list[Match] = []
    with HISTORY_CSV.open() as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                matches.append(Match(
                    date=row["date"],
                    home=_canonical_team(row["home"]),
                    away=_canonical_team(row["away"]),
                    hg=int(row["hg"]),
                    ag=int(row["ag"]),
                    neutral=int(row.get("neutral", 0)),
                    competition=row.get("competition", ""),
                ))
            except (ValueError, KeyError) as exc:
                logger.warning("skipping malformed history row %s: %s", row, exc)
    matches.sort(key=lambda m: m.date)
    return matches


def load_verified_actuals() -> list[dict]:
    raw = json.loads(ACTUALS_PATH.read_text())
    rows = [m for m in raw.get("matches", []) if m.get("verified")]
    if not rows:
        raise RuntimeError(f"no verified actuals in {ACTUALS_PATH}")
    return rows


# ---------------------------------------------------------------------------
# Recent-form helper — pure (date, team) -> (goals_scored, goals_conceded)
# ---------------------------------------------------------------------------
class FormBook:
    """Per-team rolling history. `form_at(date, team)` returns the sum of
    goals scored & conceded over the last `window` matches strictly BEFORE
    `date` — no leakage from the match being predicted."""

    def __init__(self, matches: Sequence[Match]):
        self._by_team: dict[str, list[tuple[str, int, int]]] = {}
        for m in matches:
            self._by_team.setdefault(m.home, []).append((m.date, m.hg, m.ag))
            self._by_team.setdefault(m.away, []).append((m.date, m.ag, m.hg))
        for k in self._by_team:
            self._by_team[k].sort(key=lambda t: t[0])

    def form_at(self, date: str, team: str, window: int = FORM_WINDOW) -> tuple[float, float]:
        team_c = _canonical_team(team)
        rows = self._by_team.get(team_c) or self._by_team.get(team) or []
        recent = [r for r in rows if r[0] < date][-window:]
        if not recent:
            return 0.0, 0.0
        gs = sum(r[1] for r in recent) / len(recent)
        gc = sum(r[2] for r in recent) / len(recent)
        return float(gs), float(gc)


# ---------------------------------------------------------------------------
# Feature builder — Elo_diff, FIFA_rank_diff, recent_form (h/a), continental
# ---------------------------------------------------------------------------
FEATURE_NAMES = (
    "elo_diff",
    "fifa_rank_diff",
    "home_form",
    "away_form",
    "continental_coeff_diff",
)


def features(home: str, away: str, date: str, form: FormBook) -> list[float]:
    elo_h = BASELINE_ELO.get(home, BASELINE_ELO.get(_canonical_team(home), DEFAULT_ELO))
    elo_a = BASELINE_ELO.get(away, BASELINE_ELO.get(_canonical_team(away), DEFAULT_ELO))
    elo_diff = elo_h - elo_a
    rank_h = fifa_rank(home)
    rank_a = fifa_rank(away)
    # rank_diff: positive ⇒ home is higher ranked (lower rank number).
    fifa_rank_diff = rank_a - rank_h
    home_gs, _ = form.form_at(date, home)
    away_gs, _ = form.form_at(date, away)
    coeff_diff = confed_coeff(home) - confed_coeff(away)
    return [
        float(elo_diff),
        float(fifa_rank_diff),
        float(home_gs),
        float(away_gs),
        float(coeff_diff),
    ]


# ---------------------------------------------------------------------------
# Groll hybrid: RF → Poisson grid → (p_home, p_draw, p_away)
# ---------------------------------------------------------------------------
def fit_groll_rf(train: Sequence[Match], form: FormBook) -> tuple[RandomForestRegressor, RandomForestRegressor]:
    X: list[list[float]] = []
    y_h: list[int] = []
    y_a: list[int] = []
    for m in train:
        X.append(features(m.home, m.away, m.date, form))
        y_h.append(m.hg)
        y_a.append(m.ag)
    X_arr = np.asarray(X, dtype=float)
    rf_home = RandomForestRegressor(
        n_estimators=500, max_depth=10, min_samples_leaf=3,
        random_state=RNG_SEED, n_jobs=-1,
    )
    rf_away = RandomForestRegressor(
        n_estimators=500, max_depth=10, min_samples_leaf=3,
        random_state=RNG_SEED + 1, n_jobs=-1,
    )
    rf_home.fit(X_arr, y_h)
    rf_away.fit(X_arr, y_a)
    return rf_home, rf_away


def poisson_wdl(lam_h: float, lam_a: float) -> dict[str, float]:
    """Outer-product Poisson grid -> normalised (p_home, p_draw, p_away)."""
    lam_h = max(0.05, min(lam_h, 8.0))
    lam_a = max(0.05, min(lam_a, 8.0))
    pmf_h = poisson.pmf(np.arange(MAX_GOALS_GRID + 1), lam_h)
    pmf_a = poisson.pmf(np.arange(MAX_GOALS_GRID + 1), lam_a)
    grid = np.outer(pmf_h, pmf_a)
    grid = grid / grid.sum()
    p_home = float(np.tril(grid, -1).sum())
    p_draw = float(np.trace(grid))
    p_away = float(np.triu(grid, 1).sum())
    s = p_home + p_draw + p_away
    return {"p_home": p_home / s, "p_draw": p_draw / s, "p_away": p_away / s}


def groll_predict(
    rf_home: RandomForestRegressor,
    rf_away: RandomForestRegressor,
    home: str,
    away: str,
    date: str,
    form: FormBook,
) -> dict:
    x = np.asarray([features(home, away, date, form)], dtype=float)
    lam_h = float(rf_home.predict(x)[0])
    lam_a = float(rf_away.predict(x)[0])
    probs = poisson_wdl(lam_h, lam_a)
    return {
        "lambda_home": round(lam_h, 4),
        "lambda_away": round(lam_a, 4),
        **{k: round(v, 4) for k, v in probs.items()},
    }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def wdl_from_score(score: str) -> str:
    h, a = (int(x) for x in score.split("-"))
    if h > a:
        return "H"
    if h < a:
        return "A"
    return "D"


def onehot(wdl: str) -> tuple[float, float, float]:
    return (1.0 if wdl == "H" else 0.0,
            1.0 if wdl == "D" else 0.0,
            1.0 if wdl == "A" else 0.0)


def brier_3class(p_home: float, p_draw: float, p_away: float, actual_wdl: str) -> float:
    yh, yd, ya = onehot(actual_wdl)
    return ((p_home - yh) ** 2 + (p_draw - yd) ** 2 + (p_away - ya) ** 2)


def baseline_predict(home: str, away: str) -> dict:
    """Same Elo + bivariate-Poisson + Dixon-Coles head used everywhere
    else in tree. Uses the BASELINE_ELO book exactly the way
    `wc2026_predictor.main` does for the WC2026 fixtures."""
    elo = Elo(ratings=dict(BASELINE_ELO))
    return predict_match(elo, home, away, neutral=False)


# ---------------------------------------------------------------------------
# Paired bootstrap
# ---------------------------------------------------------------------------
def paired_bootstrap_ci(
    deltas: Sequence[float],
    reps: int = BOOTSTRAP_REPS,
    seed: int = RNG_SEED,
) -> tuple[float, float, float]:
    rng = np.random.default_rng(seed)
    arr = np.asarray(list(deltas), dtype=float)
    n = arr.size
    if n == 0:
        return (0.0, 0.0, 0.0)
    means = np.empty(reps, dtype=float)
    for i in range(reps):
        idx = rng.integers(0, n, size=n)
        means[i] = float(arr[idx].mean())
    return (
        float(arr.mean()),
        float(np.percentile(means, CI_LO_PCT)),
        float(np.percentile(means, CI_HI_PCT)),
    )


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main() -> dict:
    random.seed(RNG_SEED)
    np.random.seed(RNG_SEED)

    history = load_history()
    actuals = load_verified_actuals()

    # Training set = every historical row EXCEPT WC2026 (the eval set lives
    # there). FormBook still indexes the full corpus — form lookups are
    # date-gated so no leakage.
    train = [m for m in history if m.competition != "WC2026"]
    form = FormBook(history)
    logger.info("training rows: %d / total history: %d", len(train), len(history))

    rf_home, rf_away = fit_groll_rf(train, form)

    importances = (
        rf_home.feature_importances_ + rf_away.feature_importances_
    ) / 2.0
    feature_importances = {
        name: float(round(val, 5))
        for name, val in zip(FEATURE_NAMES, importances)
    }

    # Audit-DB run rows.
    conn = init_db()
    groll_run_id = f"groll-{uuid.uuid4().hex[:10]}"
    log_run(
        groll_run_id,
        MODEL_NAME,
        notes=(
            "Groll 2018 RandomForestRegressor (n=500, depth=10) + Poisson "
            "outer-product. Features: elo_diff, fifa_rank_diff, "
            "home_form, away_form, continental_coeff_diff. "
            f"Trained on {len(train)} historical rows; scored on "
            f"{len(actuals)} verified WC2026 actuals."
        ),
        generated_at=_utc_now(),
    )

    rows: list[dict] = []
    for m in actuals:
        home = m["home"]
        away = m["away"]
        date = m.get("date", "2026-06-11")
        actual = actual_for(home, away)
        if not actual:
            logger.warning("no resolvable actual for %s vs %s — skipped", home, away)
            continue
        actual_wdl = wdl_from_score(actual)

        groll = groll_predict(rf_home, rf_away, home, away, date, form)
        base = baseline_predict(home, away)

        groll_brier = brier_3class(
            groll["p_home"], groll["p_draw"], groll["p_away"], actual_wdl,
        )
        base_brier = brier_3class(
            base["p_home"], base["p_draw"], base["p_away"], actual_wdl,
        )

        # Persist the Groll prediction. (Baseline rows already live in DB
        # from the regular Elo predictor runs — re-logging would be noise.)
        eh_h = max(0, int(round(groll["lambda_home"])))
        eh_a = max(0, int(round(groll["lambda_away"])))
        groll_pred_wdl = (
            "H" if groll["p_home"] >= max(groll["p_draw"], groll["p_away"])
            else "D" if groll["p_draw"] >= groll["p_away"]
            else "A"
        )
        log_prediction(
            run_id=groll_run_id,
            model=MODEL_NAME,
            match={
                "home": home,
                "away": away,
                "match_date": date,
                "competition": "FIFA World Cup 2026",
            },
            prediction={
                "predicted_score": f"{eh_h}-{eh_a}",
                "predicted_wdl": groll_pred_wdl,
                "p_home": groll["p_home"],
                "p_draw": groll["p_draw"],
                "p_away": groll["p_away"],
                "lambda_home": groll["lambda_home"],
                "lambda_away": groll["lambda_away"],
                "source": "Groll 2018 RF+Poisson hybrid",
            },
            conn=conn,
        )

        rows.append({
            "home": home,
            "away": away,
            "actual_wdl": actual_wdl,
            "groll_p_home": groll["p_home"],
            "groll_p_draw": groll["p_draw"],
            "groll_p_away": groll["p_away"],
            "base_p_home": base["p_home"],
            "base_p_draw": base["p_draw"],
            "base_p_away": base["p_away"],
            "groll_brier": groll_brier,
            "base_brier": base_brier,
        })

    if not rows:
        raise RuntimeError("no scoreable rows — Groll evaluation cannot run")

    groll_brier_mean = float(np.mean([r["groll_brier"] for r in rows]))
    base_brier_mean = float(np.mean([r["base_brier"] for r in rows]))
    deltas = [r["groll_brier"] - r["base_brier"] for r in rows]
    mean_delta, ci_lo, ci_hi = paired_bootstrap_ci(deltas)

    # `real_lift`: Groll Brier is lower (negative delta) AND CI strictly
    # excludes 0 — otherwise call it noise.
    real_lift = bool(ci_hi < 0.0 and mean_delta < 0.0)

    payload = {
        "model": MODEL_NAME,
        "baseline_model": BASELINE_MODEL_NAME,
        "generated_at": _utc_now(),
        "n_train": len(train),
        "n_eval": len(rows),
        "brier": round(groll_brier_mean, 6),
        "baseline_brier": round(base_brier_mean, 6),
        "brier_delta": round(mean_delta, 6),
        "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
        "ci_method": "paired bootstrap on per-match Brier deltas, 10000 reps",
        "real_lift": real_lift,
        "feature_importances": feature_importances,
        "feature_order": list(FEATURE_NAMES),
        "rf_params": {
            "n_estimators": 500, "max_depth": 10,
            "min_samples_leaf": 3, "random_state": RNG_SEED,
        },
        "audit_run_id": groll_run_id,
        "source": (
            "Groll, Ley, Schauberger, Van Eetvelde (2018) — RF+Poisson "
            "hybrid; FIFA ranks: WebSearch 2026-06-19 (ESPN + Wikipedia + "
            "whereig.com June 2026 update)."
        ),
        "verified": True,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=False))
    logger.info(
        "wrote %s — Groll brier=%.5f baseline=%.5f delta=%.5f ci=[%.5f, %.5f] real_lift=%s",
        OUTPUT_PATH, groll_brier_mean, base_brier_mean, mean_delta, ci_lo, ci_hi, real_lift,
    )
    return payload


if __name__ == "__main__":
    main()
