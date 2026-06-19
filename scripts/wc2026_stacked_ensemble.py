"""WC2026 Stacked Ensemble — Chalk + Elo+Poisson + llama3.3:70b.

End-to-end:
  1. Build a Chalk baseline (higher BASELINE_ELO wins 1-0) and log to DB.
  2. Pull p_home/p_draw/p_away for the 3 models on the 28 graded matches.
  3. Leave-one-out fit a multinomial LogisticRegression on the 9-feature
     stack [chalk_p, elo_p, llama_p] x [H, D, A]; log each OOF prediction
     as model "stacked_ensemble" in the audit DB.
  4. Paired bootstrap CI on the winner-accuracy delta (ensemble vs best
     single = Elo+Poisson). 300 reps.
  5. Write /opt/jarvis-app-1/server/data/wc2026_ensemble_comparison.json
     with honest per-model accuracy + delta + 95% CI + real_lift flag.

n=28 is tiny; CI will be wide. real_lift is ONLY true if the CI strictly
excludes 0 — anything else gets reported as "noise".
"""

from __future__ import annotations

import json
import random
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, "/opt/jarvis-app-1/scripts")
from wc2026_db import (
    DB_PATH,
    actual_for,
    init_db,
    log_prediction,
    log_run,
)
from wc2026_predictor import BASELINE_ELO, DEFAULT_ELO

ROOT = Path("/opt/jarvis-app-1")
ACTUALS_PATH = ROOT / "server/data/wc2026_actuals.json"
OUTPUT_PATH = ROOT / "server/data/wc2026_ensemble_comparison.json"

ELO_MODEL = "elo_bivariate_poisson_dixoncoles"
LLAMA_MODEL = "llama3.3:70b"
CHALK_MODEL = "chalk_higher_elo"
STACKED_MODEL = "stacked_ensemble"

BOOTSTRAP_REPS = 300
CI_LO_PCT = 2.5
CI_HI_PCT = 97.5
RNG_SEED = 20260619


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _wdl_from_score(score: str) -> str:
    h, a = (int(x) for x in score.split("-"))
    if h > a:
        return "H"
    if h < a:
        return "A"
    return "D"


def load_actuals() -> list[dict]:
    raw = json.loads(ACTUALS_PATH.read_text())
    matches = [m for m in raw.get("matches", []) if m.get("verified")]
    if len(matches) < 1:
        raise RuntimeError(f"no verified actuals in {ACTUALS_PATH}")
    return matches


def fetch_model_probs(conn: sqlite3.Connection, model: str) -> dict[tuple[str, str], dict]:
    """Latest graded row per (home, away) for a given model."""
    rows = conn.execute(
        """SELECT home, away, p_home, p_draw, p_away, predicted_wdl, actual_wdl,
                  generated_at
             FROM predictions
            WHERE model = ?
              AND actual_wdl IS NOT NULL
              AND p_home IS NOT NULL AND p_draw IS NOT NULL AND p_away IS NOT NULL
            ORDER BY generated_at DESC""",
        (model,),
    ).fetchall()
    out: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r["home"], r["away"])
        if key in out:
            continue  # keep newest
        out[key] = {
            "p_home": float(r["p_home"]),
            "p_draw": float(r["p_draw"]),
            "p_away": float(r["p_away"]),
            "predicted_wdl": r["predicted_wdl"],
            "actual_wdl": r["actual_wdl"],
        }
    return out


def chalk_probs(home: str, away: str) -> dict[str, float]:
    """Chalk = higher BASELINE_ELO wins 1-0 with full confidence in WDL."""
    elo_h = BASELINE_ELO.get(home, DEFAULT_ELO)
    elo_a = BASELINE_ELO.get(away, DEFAULT_ELO)
    if elo_h > elo_a:
        return {"p_home": 1.0, "p_draw": 0.0, "p_away": 0.0, "wdl": "H"}
    if elo_a > elo_h:
        return {"p_home": 0.0, "p_draw": 0.0, "p_away": 1.0, "wdl": "A"}
    # Equal Elo — call it a draw (extremely rare in BASELINE_ELO).
    return {"p_home": 0.0, "p_draw": 1.0, "p_away": 0.0, "wdl": "D"}


def log_chalk_predictions(conn: sqlite3.Connection, actuals: list[dict]) -> tuple[str, int, int]:
    """Score Chalk against every verified actual; log each row to DB."""
    run_id = f"chalk-{uuid.uuid4().hex[:10]}"
    log_run(
        run_id,
        CHALK_MODEL,
        notes=f"Chalk baseline (higher BASELINE_ELO wins 1-0) scored vs {len(actuals)} verified actuals",
        generated_at=_utc_now(),
    )
    hits = 0
    for m in actuals:
        home, away = m["home"], m["away"]
        c = chalk_probs(home, away)
        score = "1-0" if c["wdl"] == "H" else ("0-1" if c["wdl"] == "A" else "1-1")
        log_prediction(
            run_id=run_id,
            model=CHALK_MODEL,
            match={
                "home": home,
                "away": away,
                "match_date": m.get("date"),
                "competition": "FIFA World Cup 2026",
            },
            prediction={
                "predicted_score": score,
                "predicted_wdl": c["wdl"],
                "p_home": c["p_home"],
                "p_draw": c["p_draw"],
                "p_away": c["p_away"],
                "source": "BASELINE_ELO higher team wins 1-0",
            },
            conn=conn,
        )
        # Actuals are resolved server-side; recompute for our local tally.
        actual = actual_for(home, away)
        if actual and _wdl_from_score(actual) == c["wdl"]:
            hits += 1
    return run_id, hits, len(actuals)


def build_overlap_dataset(
    actuals: list[dict],
    chalk: dict[tuple[str, str], dict],
    elo: dict[tuple[str, str], dict],
    llama: dict[tuple[str, str], dict],
) -> list[dict]:
    """Match-level rows containing all 3 model probs + actual WDL."""
    rows: list[dict] = []
    for m in actuals:
        key = (m["home"], m["away"])
        if key not in elo or key not in llama:
            continue
        actual = actual_for(*key)
        if not actual:
            continue
        actual_wdl = _wdl_from_score(actual)
        ch = chalk.get(key) or chalk_probs(*key)
        rows.append({
            "home": key[0],
            "away": key[1],
            "match_date": m.get("date"),
            "actual_wdl": actual_wdl,
            "chalk_h": ch["p_home"] if "p_home" in ch else ch["p_home"],
            "chalk_d": ch["p_draw"] if "p_draw" in ch else ch["p_draw"],
            "chalk_a": ch["p_away"] if "p_away" in ch else ch["p_away"],
            "elo_h": elo[key]["p_home"],
            "elo_d": elo[key]["p_draw"],
            "elo_a": elo[key]["p_away"],
            "llama_h": llama[key]["p_home"],
            "llama_d": llama[key]["p_draw"],
            "llama_a": llama[key]["p_away"],
            "elo_pred": elo[key]["predicted_wdl"],
            "llama_pred": llama[key]["predicted_wdl"],
        })
    return rows


WDL_LABELS = ["H", "D", "A"]
WDL_INDEX = {w: i for i, w in enumerate(WDL_LABELS)}


def features(row: dict) -> list[float]:
    return [
        row["chalk_h"], row["chalk_d"], row["chalk_a"],
        row["elo_h"], row["elo_d"], row["elo_a"],
        row["llama_h"], row["llama_d"], row["llama_a"],
    ]


def loo_stack(rows: list[dict]) -> list[dict]:
    """Leave-one-out multinomial logistic stack. Returns one prediction per row.

    On tiny n (~28), LOO is the only honest OOF estimator. We use a modest C
    (0.5) so the stack stays close to a pooling of the 3 models rather than
    overfitting to noise. multi_class='multinomial' is the default in sklearn
    1.9 for LogisticRegression with lbfgs solver.
    """
    X = np.asarray([features(r) for r in rows], dtype=float)
    y = np.asarray([WDL_INDEX[r["actual_wdl"]] for r in rows], dtype=int)
    n = len(rows)
    preds: list[dict] = []
    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False
        X_tr, y_tr = X[mask], y[mask]
        # Need at least 2 classes present in training fold for LR. Tiny n
        # means a fold may drop the only example of a class; in that case
        # we fall back to the average of the 3 model probs (mean stack).
        unique = np.unique(y_tr)
        if len(unique) < 2:
            probs = X[i].reshape(3, 3).mean(axis=0)
        else:
            clf = LogisticRegression(
                solver="lbfgs",
                max_iter=2000,
                C=0.5,
            )
            clf.fit(X_tr, y_tr)
            # clf.classes_ may be a subset of {0,1,2}; expand to full 3-way.
            raw = clf.predict_proba(X[i].reshape(1, -1))[0]
            full = np.zeros(3, dtype=float)
            for cls_idx, cls_label in enumerate(clf.classes_):
                full[int(cls_label)] = raw[cls_idx]
            # If a class was missing, full sums to <1; renormalise.
            s = full.sum()
            probs = full / s if s > 0 else np.array([1 / 3, 1 / 3, 1 / 3])
        pick = int(np.argmax(probs))
        preds.append({
            "home": rows[i]["home"],
            "away": rows[i]["away"],
            "match_date": rows[i]["match_date"],
            "p_home": float(probs[0]),
            "p_draw": float(probs[1]),
            "p_away": float(probs[2]),
            "predicted_wdl": WDL_LABELS[pick],
            "actual_wdl": rows[i]["actual_wdl"],
        })
    return preds


def log_stacked_predictions(conn: sqlite3.Connection, preds: list[dict]) -> tuple[str, int]:
    run_id = f"stacked-{uuid.uuid4().hex[:10]}"
    log_run(
        run_id,
        STACKED_MODEL,
        notes=(
            f"Leave-one-out multinomial LogisticRegression(C=0.5) over 9 features "
            f"[chalk,elo,llama] x [H,D,A] on n={len(preds)} graded WC2026 matches"
        ),
        generated_at=_utc_now(),
    )
    hits = 0
    for p in preds:
        # Pick a representative score consistent with the WDL pick. The
        # stacked model is a probability blender, not a scoreline model;
        # use 1-0 / 0-1 / 1-1 placeholders so exact_hit stays meaningful
        # without claiming a scoreline we didn't compute.
        wdl = p["predicted_wdl"]
        score = "1-0" if wdl == "H" else ("0-1" if wdl == "A" else "1-1")
        log_prediction(
            run_id=run_id,
            model=STACKED_MODEL,
            match={
                "home": p["home"],
                "away": p["away"],
                "match_date": p["match_date"],
                "competition": "FIFA World Cup 2026",
            },
            prediction={
                "predicted_score": score,
                "predicted_wdl": wdl,
                "p_home": p["p_home"],
                "p_draw": p["p_draw"],
                "p_away": p["p_away"],
                "source": (
                    "stacked_ensemble LOO multinomial logreg "
                    f"on [chalk,elo,llama] features"
                ),
            },
            conn=conn,
        )
        if wdl == p["actual_wdl"]:
            hits += 1
    return run_id, hits


def paired_bootstrap_ci(
    a_hits: list[int], b_hits: list[int], reps: int = BOOTSTRAP_REPS, seed: int = RNG_SEED
) -> tuple[float, float, float]:
    """Paired bootstrap on (b_hit - a_hit). Returns (mean_delta_pp, lo, hi)."""
    assert len(a_hits) == len(b_hits), "paired bootstrap requires matched arrays"
    n = len(a_hits)
    rng = random.Random(seed)
    deltas: list[float] = []
    for _ in range(reps):
        idx = [rng.randrange(n) for _ in range(n)]
        a_acc = sum(a_hits[i] for i in idx) / n
        b_acc = sum(b_hits[i] for i in idx) / n
        deltas.append((b_acc - a_acc) * 100.0)
    deltas.sort()
    lo = deltas[int(reps * CI_LO_PCT / 100.0)]
    hi = deltas[int(reps * CI_HI_PCT / 100.0) - 1]
    mean_delta = sum(deltas) / len(deltas)
    return mean_delta, lo, hi


def fmt_acc(hits: int, total: int) -> str:
    pct = (hits / total * 100.0) if total else 0.0
    return f"{hits}/{total} ({pct:.1f}%)"


def main() -> int:
    actuals = load_actuals()
    conn = init_db(DB_PATH)
    try:
        # --- 1) Chalk baseline against ALL verified actuals (the brief
        #        asks for chalk vs 28; this naturally lines up).
        chalk_run_id, chalk_hits, chalk_total = log_chalk_predictions(conn, actuals)

        # --- 2) Pull the existing graded probabilities for the 3 models.
        elo_probs = fetch_model_probs(conn, ELO_MODEL)
        llama_probs = fetch_model_probs(conn, LLAMA_MODEL)
        # Chalk probs by match (computed from BASELINE_ELO, not the DB).
        chalk_by_match: dict[tuple[str, str], dict] = {}
        for m in actuals:
            key = (m["home"], m["away"])
            chalk_by_match[key] = chalk_probs(*key)

        # --- 3) Build the overlap dataset (matches graded by ALL 3 models).
        rows = build_overlap_dataset(actuals, chalk_by_match, elo_probs, llama_probs)
        n = len(rows)
        if n < 5:
            raise RuntimeError(
                f"too few overlap matches for an ensemble: n={n} "
                f"(elo={len(elo_probs)}, llama={len(llama_probs)})"
            )

        # --- 4) Leave-one-out stacked predictions + log to audit DB.
        stacked_preds = loo_stack(rows)
        stacked_run_id, stacked_hits = log_stacked_predictions(conn, stacked_preds)

        # --- 5) Per-model accuracy on the SAME overlap set (apples to
        #        apples). Chalk's own 28-match score above includes matches
        #        outside the overlap if any actuals aren't in both DBs.
        per_row_chalk_hit, per_row_elo_hit, per_row_llama_hit, per_row_ens_hit = [], [], [], []
        for row, ens in zip(rows, stacked_preds):
            actual_wdl = row["actual_wdl"]
            ch = chalk_by_match[(row["home"], row["away"])]
            per_row_chalk_hit.append(1 if ch["wdl"] == actual_wdl else 0)
            per_row_elo_hit.append(1 if row["elo_pred"] == actual_wdl else 0)
            per_row_llama_hit.append(1 if row["llama_pred"] == actual_wdl else 0)
            per_row_ens_hit.append(1 if ens["predicted_wdl"] == actual_wdl else 0)

        elo_acc_hits = sum(per_row_elo_hit)
        llama_acc_hits = sum(per_row_llama_hit)
        chalk_overlap_hits = sum(per_row_chalk_hit)
        ensemble_hits = sum(per_row_ens_hit)

        # --- 6) Paired bootstrap on (ensemble - best_single). best single
        #        = Elo+Poisson per the brief.
        best_single_hits = per_row_elo_hit
        delta_mean, ci_lo, ci_hi = paired_bootstrap_ci(best_single_hits, per_row_ens_hit)
        real_lift = (ci_lo > 0.0) and (ci_hi > 0.0)

        # Verdict — honest sentence.
        if real_lift:
            verdict = (
                f"Stacked ensemble beats Elo+Poisson by {delta_mean:+.1f}pp "
                f"with 95% CI [{ci_lo:+.1f}, {ci_hi:+.1f}]pp on n={n} matches — "
                f"a small but real out-of-sample lift."
            )
        elif ci_hi < 0.0:
            verdict = (
                f"Stacked ensemble UNDERPERFORMS Elo+Poisson by {delta_mean:+.1f}pp "
                f"(95% CI [{ci_lo:+.1f}, {ci_hi:+.1f}]pp); single-model Elo is safer on n={n}."
            )
        else:
            verdict = (
                f"Stacked ensemble delta {delta_mean:+.1f}pp with 95% CI "
                f"[{ci_lo:+.1f}, {ci_hi:+.1f}]pp straddles 0 on n={n} matches — "
                f"no real lift; CI is wide because the sample is tiny."
            )

        result = {
            "generated_at": _utc_now(),
            "sample_size": n,
            "overlap_runs": {
                "chalk_run_id": chalk_run_id,
                "stacked_run_id": stacked_run_id,
            },
            "per_model_accuracy": {
                "chalk_overlap": {
                    "hits": chalk_overlap_hits,
                    "total": n,
                    "pct": round(chalk_overlap_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(chalk_overlap_hits, n),
                },
                "chalk_full_28": {
                    "hits": chalk_hits,
                    "total": chalk_total,
                    "pct": round(chalk_hits / chalk_total * 100.0, 2) if chalk_total else 0.0,
                    "label": fmt_acc(chalk_hits, chalk_total),
                },
                "elo_poisson": {
                    "hits": elo_acc_hits,
                    "total": n,
                    "pct": round(elo_acc_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(elo_acc_hits, n),
                },
                "llama_70b": {
                    "hits": llama_acc_hits,
                    "total": n,
                    "pct": round(llama_acc_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(llama_acc_hits, n),
                },
                "ensemble": {
                    "hits": ensemble_hits,
                    "total": n,
                    "pct": round(ensemble_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(ensemble_hits, n),
                },
            },
            "winner_delta_pp": round(delta_mean, 3),
            "ci_95": [round(ci_lo, 3), round(ci_hi, 3)],
            "real_lift": bool(real_lift),
            "bootstrap_reps": BOOTSTRAP_REPS,
            "honest_verdict": verdict,
            "method": {
                "stacker": "sklearn.LogisticRegression(solver='lbfgs', C=0.5, max_iter=2000) — multinomial by default in sklearn 1.9",
                "features": [
                    "chalk_p_home", "chalk_p_draw", "chalk_p_away",
                    "elo_p_home", "elo_p_draw", "elo_p_away",
                    "llama_p_home", "llama_p_draw", "llama_p_away",
                ],
                "cv": "leave-one-out (each prediction is out-of-sample)",
                "delta_baseline": "Elo+Poisson (best single model per brief)",
                "ci": "paired bootstrap on matched per-match hits, 300 reps, percentile 2.5/97.5",
            },
            "verified": True,
            "source": "wc2026_actuals.json + audit DB graded predictions (server-side via actual_for)",
        }

        OUTPUT_PATH.write_text(json.dumps(result, indent=2, sort_keys=True))

        # Compact stdout summary for the caller.
        summary = {
            "elo_winners": fmt_acc(19, 32),  # caller-supplied frame for the full DB row
            "elo_winners_on_overlap": fmt_acc(elo_acc_hits, n),
            "llama_70b_winners": fmt_acc(llama_acc_hits, n),
            "chalk_winners": fmt_acc(chalk_hits, chalk_total),
            "chalk_winners_on_overlap": fmt_acc(chalk_overlap_hits, n),
            "ensemble_winners": fmt_acc(ensemble_hits, n),
            "delta_pp": round(delta_mean, 3),
            "ci_95": [round(ci_lo, 3), round(ci_hi, 3)],
            "real_lift": bool(real_lift),
            "honest_verdict": verdict,
        }
        print(json.dumps(summary, indent=2))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
