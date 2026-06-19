"""WC2026 HTR child h-011 — Heuer-decay Elo + 70B + Chalk stacked ensemble.

HTR child of h-002 (Heuer 90d-decay Elo) × h-007 (LogReg stacker over Chalk +
Elo + Llama-70B). Replaces the vanilla Elo+Poisson base learner in the stack
with the Heuer time-decay Elo variant.

End-to-end:
  1. Pull graded predictions from the audit DB for:
        - elo_heuer_decay90d_bivariate_poisson_dixoncoles (h-002 model)
        - llama3.3:70b
        - chalk_higher_elo
     normalising team names through _TEAM_ALIAS so spelling drift (USA vs
     United States, Cape Verde vs Cabo Verde, Korea Republic vs South Korea)
     does not silently drop the overlap.
  2. Build the LOO overlap dataset (matches graded by all 3 models).
  3. Leave-one-out multinomial LogisticRegression(C=0.5) over 9 features
     [chalk, heuer, llama] × [H, D, A].
  4. Paired bootstrap (300 reps) on (ensemble winner_hits - heuer winner_hits)
     to give an honest CI vs the strongest single base (Heuer alone).
  5. Write /opt/jarvis-app-1/server/data/wc2026_htr_h011_heuer_ensemble.json
     with verified:true + source per WC2026 data-integrity rule.

Per the rule book:
  - WDL is resolved server-side via actual_for(home, away). No injected
    actual_score / actual_wdl parameters.
  - log_run uses non-empty notes.
  - Team-name lookups go through _TEAM_ALIAS via _norm.
  - real_lift is True ONLY if the 95% bootstrap CI strictly excludes 0
    (ci_lo > 0 → genuine winner-accuracy lift over Heuer-alone).
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
from wc2026_db import (  # noqa: E402
    DB_PATH,
    _TEAM_ALIAS,
    actual_for,
    init_db,
    log_prediction,
    log_run,
)
from wc2026_predictor import BASELINE_ELO, DEFAULT_ELO  # noqa: E402

ROOT = Path("/opt/jarvis-app-1")
ACTUALS_PATH = ROOT / "server/data/wc2026_actuals.json"
OUTPUT_PATH = ROOT / "server/data/wc2026_htr_h011_heuer_ensemble.json"

HEUER_MODEL = "elo_heuer_decay90d_bivariate_poisson_dixoncoles"
LLAMA_MODEL = "llama3.3:70b"
CHALK_MODEL = "chalk_higher_elo"
STACKED_MODEL = "stacked_ensemble_heuer_llama_chalk"

BOOTSTRAP_REPS = 300
CI_LO_PCT = 2.5
CI_HI_PCT = 97.5
RNG_SEED = 20260619

WDL_LABELS = ["H", "D", "A"]
WDL_INDEX = {w: i for i, w in enumerate(WDL_LABELS)}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _wdl_from_score(score: str) -> str:
    h, a = (int(x) for x in score.split("-"))
    if h > a:
        return "H"
    if h < a:
        return "A"
    return "D"


def _norm_team(name: str) -> str:
    """Normalise a team name through _TEAM_ALIAS (lowercased)."""
    if not name:
        return ""
    base = name.strip().lower()
    return _TEAM_ALIAS.get(base, base)


def _key(home: str, away: str) -> tuple[str, str]:
    return (_norm_team(home), _norm_team(away))


def load_actuals() -> list[dict]:
    raw = json.loads(ACTUALS_PATH.read_text())
    matches = [m for m in raw.get("matches", []) if m.get("verified")]
    if not matches:
        raise RuntimeError(f"no verified actuals in {ACTUALS_PATH}")
    return matches


def fetch_model_probs(
    conn: sqlite3.Connection, model: str
) -> dict[tuple[str, str], dict]:
    """Latest graded row per normalised (home, away) for a given model."""
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
        # Sqlite Row -> tuple unpack by index because row_factory may not be set.
        home, away = r[0], r[1]
        key = _key(home, away)
        if key in out:
            continue  # keep newest
        out[key] = {
            "home_raw": home,
            "away_raw": away,
            "p_home": float(r[2]),
            "p_draw": float(r[3]),
            "p_away": float(r[4]),
            "predicted_wdl": r[5],
            "actual_wdl": r[6],
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
    return {"p_home": 0.0, "p_draw": 1.0, "p_away": 0.0, "wdl": "D"}


def build_overlap_dataset(
    actuals: list[dict],
    heuer: dict[tuple[str, str], dict],
    llama: dict[tuple[str, str], dict],
) -> list[dict]:
    """Match-level rows containing Heuer + Llama + Chalk probs + actual WDL.

    Iterates over the verified actuals so the actual WDL is always
    resolved server-side via actual_for(). Chalk probs are derived from
    the raw (un-normalised) team names because BASELINE_ELO uses the
    same spellings as the actuals file.
    """
    rows: list[dict] = []
    for m in actuals:
        home_raw, away_raw = m["home"], m["away"]
        key = _key(home_raw, away_raw)
        if key not in heuer or key not in llama:
            continue
        actual = actual_for(home_raw, away_raw)
        if not actual:
            continue
        actual_wdl = _wdl_from_score(actual)
        ch = chalk_probs(home_raw, away_raw)
        rows.append({
            "home": home_raw,
            "away": away_raw,
            "match_date": m.get("date"),
            "actual_wdl": actual_wdl,
            "chalk_h": ch["p_home"],
            "chalk_d": ch["p_draw"],
            "chalk_a": ch["p_away"],
            "chalk_pred": ch["wdl"],
            "heuer_h": heuer[key]["p_home"],
            "heuer_d": heuer[key]["p_draw"],
            "heuer_a": heuer[key]["p_away"],
            "heuer_pred": heuer[key]["predicted_wdl"],
            "llama_h": llama[key]["p_home"],
            "llama_d": llama[key]["p_draw"],
            "llama_a": llama[key]["p_away"],
            "llama_pred": llama[key]["predicted_wdl"],
        })
    return rows


def features(row: dict) -> list[float]:
    return [
        row["chalk_h"], row["chalk_d"], row["chalk_a"],
        row["heuer_h"], row["heuer_d"], row["heuer_a"],
        row["llama_h"], row["llama_d"], row["llama_a"],
    ]


def loo_stack(rows: list[dict]) -> list[dict]:
    """Leave-one-out multinomial logistic stack over 9 features."""
    X = np.asarray([features(r) for r in rows], dtype=float)
    y = np.asarray([WDL_INDEX[r["actual_wdl"]] for r in rows], dtype=int)
    n = len(rows)
    preds: list[dict] = []
    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False
        X_tr, y_tr = X[mask], y[mask]
        unique = np.unique(y_tr)
        if len(unique) < 2:
            # Degenerate fold — mean-pool the 3 base models.
            probs = X[i].reshape(3, 3).mean(axis=0)
        else:
            clf = LogisticRegression(solver="lbfgs", max_iter=2000, C=0.5)
            clf.fit(X_tr, y_tr)
            raw = clf.predict_proba(X[i].reshape(1, -1))[0]
            full = np.zeros(3, dtype=float)
            for cls_idx, cls_label in enumerate(clf.classes_):
                full[int(cls_label)] = raw[cls_idx]
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


def log_stacked_predictions(
    conn: sqlite3.Connection, preds: list[dict]
) -> tuple[str, int]:
    run_id = f"htr-h011-{uuid.uuid4().hex[:10]}"
    log_run(
        run_id,
        STACKED_MODEL,
        notes=(
            f"HTR h-011: LOO multinomial LogisticRegression(C=0.5) over 9 features "
            f"[chalk,heuer90d,llama70b] x [H,D,A] on n={len(preds)} graded "
            f"WC2026 matches; parents h-002 (Heuer 90d-decay) x h-007 (LR stacker)"
        ),
        generated_at=_utc_now(),
    )
    hits = 0
    for p in preds:
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
                    "htr h-011 stacked ensemble: LOO multinomial logreg on "
                    "[chalk, heuer_decay90d, llama3.3:70b]"
                ),
            },
            conn=conn,
        )
        if wdl == p["actual_wdl"]:
            hits += 1
    return run_id, hits


def paired_bootstrap_ci(
    a_hits: list[int],
    b_hits: list[int],
    reps: int = BOOTSTRAP_REPS,
    seed: int = RNG_SEED,
) -> tuple[float, float, float]:
    """Paired bootstrap on (b_hit - a_hit). Returns (mean_delta_pp, lo, hi).

    Sampling with replacement preserves per-match pairing — for each
    resampled index, the same match contributes hits from BOTH models.
    """
    if len(a_hits) != len(b_hits):
        raise ValueError("paired bootstrap requires matched arrays")
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
        heuer_probs = fetch_model_probs(conn, HEUER_MODEL)
        llama_probs = fetch_model_probs(conn, LLAMA_MODEL)

        rows = build_overlap_dataset(actuals, heuer_probs, llama_probs)
        n = len(rows)
        if n < 5:
            raise RuntimeError(
                f"too few overlap matches: n={n} "
                f"(heuer={len(heuer_probs)}, llama={len(llama_probs)})"
            )

        stacked_preds = loo_stack(rows)
        stacked_run_id, ensemble_hits = log_stacked_predictions(conn, stacked_preds)

        # Per-row hits for paired bootstrap & per-model accuracy.
        per_row = {
            "chalk": [], "heuer": [], "llama": [], "ensemble": [],
        }
        for row, ens in zip(rows, stacked_preds):
            actual_wdl = row["actual_wdl"]
            per_row["chalk"].append(1 if row["chalk_pred"] == actual_wdl else 0)
            per_row["heuer"].append(1 if row["heuer_pred"] == actual_wdl else 0)
            per_row["llama"].append(1 if row["llama_pred"] == actual_wdl else 0)
            per_row["ensemble"].append(
                1 if ens["predicted_wdl"] == actual_wdl else 0
            )

        chalk_hits = sum(per_row["chalk"])
        heuer_hits = sum(per_row["heuer"])
        llama_hits = sum(per_row["llama"])

        # Paired bootstrap vs best single base = Heuer alone (per task brief).
        delta_mean, ci_lo, ci_hi = paired_bootstrap_ci(
            per_row["heuer"], per_row["ensemble"]
        )
        real_lift = (ci_lo > 0.0) and (ci_hi > 0.0)

        if real_lift:
            verdict = (
                f"HTR h-011 stacked ensemble beats Heuer alone by "
                f"{delta_mean:+.1f}pp with 95% CI [{ci_lo:+.1f}, {ci_hi:+.1f}]pp "
                f"on n={n} matches — real lift."
            )
        elif ci_hi < 0.0:
            verdict = (
                f"HTR h-011 stacked ensemble UNDERPERFORMS Heuer alone by "
                f"{delta_mean:+.1f}pp (95% CI [{ci_lo:+.1f}, {ci_hi:+.1f}]pp); "
                f"single-model Heuer is safer on n={n}."
            )
        else:
            verdict = (
                f"HTR h-011 stacked ensemble delta {delta_mean:+.1f}pp with "
                f"95% CI [{ci_lo:+.1f}, {ci_hi:+.1f}]pp straddles 0 on n={n} "
                f"matches — no real lift; CI is wide because the sample is tiny."
            )

        result = {
            "schema": "wc2026_htr_h011_heuer_ensemble.v1",
            "verified": True,
            "source": (
                "scripts/wc2026_htr_h011_heuer_ensemble.py — Heuer 90d-decay "
                "model + Llama3.3:70b + Chalk pulled from audit DB; actual_wdl "
                "resolved server-side via actual_for() on wc2026_actuals.json; "
                "stacker = sklearn LOO multinomial LogisticRegression(C=0.5); "
                "paired bootstrap (300 reps) vs Heuer-alone winner accuracy."
            ),
            "generated_at": _utc_now(),
            "htr_node": {
                "id": "h-011",
                "parent_ids": ["h-002", "h-007"],
                "hypothesis": (
                    "Stacking Heuer 90d-decay Elo (h-002) with Llama-70B and "
                    "Chalk via LOO multinomial logreg beats Heuer alone on "
                    "winner accuracy."
                ),
            },
            "sample_size": n,
            "overlap_runs": {"stacked_run_id": stacked_run_id},
            "per_model_accuracy": {
                "chalk": {
                    "hits": chalk_hits,
                    "total": n,
                    "pct": round(chalk_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(chalk_hits, n),
                },
                "heuer_decay90d": {
                    "hits": heuer_hits,
                    "total": n,
                    "pct": round(heuer_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(heuer_hits, n),
                },
                "llama_70b": {
                    "hits": llama_hits,
                    "total": n,
                    "pct": round(llama_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(llama_hits, n),
                },
                "ensemble": {
                    "hits": ensemble_hits,
                    "total": n,
                    "pct": round(ensemble_hits / n * 100.0, 2) if n else 0.0,
                    "label": fmt_acc(ensemble_hits, n),
                },
            },
            "ensemble_winners": fmt_acc(ensemble_hits, n),
            "heuer_alone_winners": fmt_acc(heuer_hits, n),
            "delta_pp": round(delta_mean, 3),
            "ci_95": [round(ci_lo, 3), round(ci_hi, 3)],
            "real_lift": bool(real_lift),
            "bootstrap_reps": BOOTSTRAP_REPS,
            "honest_verdict": verdict,
            "method": {
                "stacker": (
                    "sklearn.LogisticRegression(solver='lbfgs', C=0.5, "
                    "max_iter=2000) — multinomial by default in sklearn 1.9"
                ),
                "features": [
                    "chalk_p_home", "chalk_p_draw", "chalk_p_away",
                    "heuer_p_home", "heuer_p_draw", "heuer_p_away",
                    "llama_p_home", "llama_p_draw", "llama_p_away",
                ],
                "cv": "leave-one-out (each prediction is out-of-sample)",
                "delta_baseline": (
                    "Heuer 90d-decay Elo alone "
                    "(elo_heuer_decay90d_bivariate_poisson_dixoncoles, h-002)"
                ),
                "ci": (
                    "paired bootstrap on matched per-match winner-hit deltas, "
                    "300 reps, percentile 2.5/97.5"
                ),
            },
        }

        OUTPUT_PATH.write_text(json.dumps(result, indent=2, sort_keys=True))

        summary = {
            "ensemble_winners": fmt_acc(ensemble_hits, n),
            "heuer_alone_winners": fmt_acc(heuer_hits, n),
            "delta_pp": round(delta_mean, 3),
            "ci_95": [round(ci_lo, 3), round(ci_hi, 3)],
            "real_lift": bool(real_lift),
        }
        print(json.dumps(summary, indent=2))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
