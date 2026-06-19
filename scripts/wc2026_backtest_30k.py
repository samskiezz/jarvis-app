#!/usr/bin/env python3
"""WC2026 walk-forward backtest across the full historical corpus.

Evaluates three models chronologically through the 563-match training CSV
(1994 WC -> 2026 WC MD1):

1. **Elo + bivariate Poisson + Dixon-Coles** — uses the in-tree
   `wc2026_predictor.predict_match` with an Elo book that is updated *after*
   each prediction (true walk-forward, no leakage).
2. **Chalk** — naive higher-Elo-team-wins baseline with a margin-based
   exact-score guess (1-0 / 2-0 / 3-0).
3. **LLM (qwen2.5:14b via Ollama on the Vast brain box)** — only invoked for
   the 12 played WC2026 MD1 fixtures (calling LLM on 470+ historical games
   would take days; this matches the explicit user instruction).

For Elo+Poisson we additionally run a **Monte Carlo at n=10000** per match
and compare empirical W/D/L proportions to the closed-form values
(`mean_pp_drift_from_analytical`, `max_pp_drift_from_analytical`).

Outputs JSON to /opt/jarvis-app-1/server/data/wc2026_30k_backtest.json.
"""
from __future__ import annotations

import csv
import json
import logging
import math
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

# Ensure the existing predictor module is importable.
PROJECT_ROOT = Path("/opt/jarvis-app-1")
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from wc2026_predictor import (  # noqa: E402  (path tweak above is intentional)
    DC_RHO,
    Elo,
    _canonical_team,
    _lambdas,
    monte_carlo_match,
    predict_match,
)

# LLM is optional — gracefully skipped if Ollama is unreachable.
try:
    from wc2026_llm_predictor import (  # noqa: E402
        LATE_NEWS_CONTEXT,
        detect_available_model,
    )
    from wc2026_llm_predictor import predict_match as llm_predict_match
    _LLM_IMPORT_OK = True
except Exception as _exc:  # pragma: no cover - defensive
    _LLM_IMPORT_OK = False
    _LLM_IMPORT_ERR = repr(_exc)


HISTORY_CSV = PROJECT_ROOT / "server" / "data" / "wc2026_training_history.csv"
OUT_PATH = PROJECT_ROOT / "server" / "data" / "wc2026_30k_backtest.json"

WARMUP_MATCHES = 100
MC_SAMPLES_PER_MATCH = 10_000
WC2026_COMP = "WC2026"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("wc2026_backtest_30k")


# ---------------------------------------------------------------------------
# CSV load
# ---------------------------------------------------------------------------

def load_history(csv_path: Path) -> list[dict[str, Any]]:
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)
    rows: list[dict[str, Any]] = []
    with csv_path.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            try:
                hg = int(r["hg"])
                ag = int(r["ag"])
            except (KeyError, ValueError):
                continue
            try:
                neutral = bool(int(r.get("neutral", "0") or "0"))
            except ValueError:
                neutral = False
            rows.append({
                "date": r.get("date", ""),
                "home": _canonical_team(r["home"]),
                "away": _canonical_team(r["away"]),
                "hg": hg,
                "ag": ag,
                "neutral": neutral,
                "competition": r.get("competition", "") or "",
                "stage": r.get("stage", "") or "",
            })
    rows.sort(key=lambda x: (x["date"], x["competition"], x["home"]))
    return rows


# ---------------------------------------------------------------------------
# Chalk baseline
# ---------------------------------------------------------------------------

def chalk_predict(elo: Elo, home: str, away: str, *, neutral: bool) -> dict[str, Any]:
    """Higher-Elo team wins. Margin scales with Elo gap.

    Returns the same shape as predict_match but with a deterministic class:
    p_winner = 0.6, p_loser = 0.25, p_draw = 0.15 (rough heuristic so we can
    still score Brier and log-loss meaningfully).
    """
    eh = elo.get(home) + (0.0 if neutral else 30.0)  # small home tilt
    ea = elo.get(away)
    diff = eh - ea
    abs_diff = abs(diff)
    if abs_diff < 25:
        # Effectively a coin flip — pick draw.
        p_home, p_draw, p_away = 0.30, 0.40, 0.30
        pred_h, pred_a = 1, 1
    else:
        # Margin guess based on Elo gap.
        if abs_diff < 80:
            mh, ma = 1, 0
        elif abs_diff < 180:
            mh, ma = 2, 0
        else:
            mh, ma = 3, 0
        if diff > 0:
            p_home, p_draw, p_away = 0.60, 0.20, 0.20
            pred_h, pred_a = mh, ma
        else:
            p_home, p_draw, p_away = 0.20, 0.20, 0.60
            pred_h, pred_a = ma, mh
    return {
        "p_home": p_home,
        "p_draw": p_draw,
        "p_away": p_away,
        "expected_score": (pred_h, pred_a),
    }


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _outcome(hg: int, ag: int) -> tuple[str, tuple[float, float, float]]:
    if hg > ag:
        return "H", (1.0, 0.0, 0.0)
    if hg == ag:
        return "D", (0.0, 1.0, 0.0)
    return "A", (0.0, 0.0, 1.0)


def _picked_class(p_home: float, p_draw: float, p_away: float) -> str:
    return max(((p_home, "H"), (p_draw, "D"), (p_away, "A")))[1]


def _brier(probs: tuple[float, float, float], onehot: tuple[float, float, float]) -> float:
    return float(sum((p - o) ** 2 for p, o in zip(probs, onehot)))


def _log_loss(probs: tuple[float, float, float], onehot: tuple[float, float, float]) -> float:
    # Multi-class log loss = -sum(y_i * log(p_i)).
    eps = 1e-9
    return float(-sum(o * math.log(max(p, eps)) for p, o in zip(probs, onehot)))


# ---------------------------------------------------------------------------
# Walk-forward driver for Elo+Poisson and Chalk
# ---------------------------------------------------------------------------

def _per_tournament_acc(per_tournament: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Finalize a per-tournament accumulator into a clean reporting dict."""
    out: dict[str, dict[str, Any]] = {}
    for comp, agg in per_tournament.items():
        n = agg["n"]
        if n == 0:
            continue
        out[comp] = {
            "n": n,
            "winner_accuracy": round(agg["winner"] / n, 4),
            "exact_accuracy": round(agg["exact"] / n, 4),
            "mean_brier": round(agg["brier"] / n, 4),
            "mean_log_loss": round(agg["log_loss"] / n, 4),
        }
    return out


def run_walk_forward(
    history: list[dict[str, Any]],
    *,
    warmup_matches: int,
    mc_samples: int,
) -> dict[str, Any]:
    elo = Elo()

    # Warm up: feed the first `warmup_matches` rows into the Elo book without
    # scoring (so the early-90s teams converge before we start predicting).
    warmup_rows = history[:warmup_matches]
    for r in warmup_rows:
        comp_kind = "worldcup"  # all rows are major-tournament rows
        elo.update(r["home"], r["away"], r["hg"], r["ag"], competition=comp_kind)

    eval_rows = history[warmup_matches:]
    log.info(
        "walk-forward: warmup=%d, evaluating=%d matches",
        len(warmup_rows), len(eval_rows),
    )

    # Accumulators per-model.
    def _empty_agg() -> dict[str, Any]:
        return {"n": 0, "winner": 0, "exact": 0, "brier": 0.0, "log_loss": 0.0}

    elo_agg = _empty_agg()
    elo_per_tournament: dict[str, dict[str, Any]] = defaultdict(_empty_agg)
    elo_wc2026_md1: dict[str, int] = {"winner": 0, "exact": 0, "n": 0}

    chalk_agg = _empty_agg()
    chalk_per_tournament: dict[str, dict[str, Any]] = defaultdict(_empty_agg)
    chalk_wc2026_md1: dict[str, int] = {"winner": 0, "exact": 0, "n": 0}

    # Per-match MC drift tracking for the Elo+Poisson sanity check.
    mc_drifts_pp: list[float] = []
    mc_check_count = 0

    started = time.monotonic()
    for i, r in enumerate(eval_rows):
        home, away = r["home"], r["away"]
        hg, ag = r["hg"], r["ag"]
        neutral = r["neutral"]
        comp = r["competition"] or "UNKNOWN"
        actual_class, onehot = _outcome(hg, ag)

        # ---------- Elo + bivariate Poisson ----------
        pred = predict_match(elo, home, away, neutral=neutral)
        ph, pd_, pa = pred["p_home"], pred["p_draw"], pred["p_away"]
        picked = _picked_class(ph, pd_, pa)
        exact_hit = pred["expected_score"] == (hg, ag)

        elo_agg["n"] += 1
        elo_agg["winner"] += int(picked == actual_class)
        elo_agg["exact"] += int(exact_hit)
        elo_agg["brier"] += _brier((ph, pd_, pa), onehot)
        elo_agg["log_loss"] += _log_loss((ph, pd_, pa), onehot)

        elo_per_tournament[comp]["n"] += 1
        elo_per_tournament[comp]["winner"] += int(picked == actual_class)
        elo_per_tournament[comp]["exact"] += int(exact_hit)
        elo_per_tournament[comp]["brier"] += _brier((ph, pd_, pa), onehot)
        elo_per_tournament[comp]["log_loss"] += _log_loss((ph, pd_, pa), onehot)

        if comp == WC2026_COMP:
            elo_wc2026_md1["n"] += 1
            elo_wc2026_md1["winner"] += int(picked == actual_class)
            elo_wc2026_md1["exact"] += int(exact_hit)

        # Monte Carlo sanity check — sample-heavy, so we limit to every match
        # in the eval set (the loop is fast enough: ~470 * 10k ~ 4.7M samples).
        mc = monte_carlo_match(elo, home, away, neutral=neutral, n=mc_samples)
        drift_h = abs(mc["p_home"] - ph) * 100.0  # in percentage points
        drift_d = abs(mc["p_draw"] - pd_) * 100.0
        drift_a = abs(mc["p_away"] - pa) * 100.0
        mc_drifts_pp.append(max(drift_h, drift_d, drift_a))
        mc_check_count += 1

        # ---------- Chalk ----------
        chalk = chalk_predict(elo, home, away, neutral=neutral)
        cph, cpd, cpa = chalk["p_home"], chalk["p_draw"], chalk["p_away"]
        c_picked = _picked_class(cph, cpd, cpa)
        c_exact = chalk["expected_score"] == (hg, ag)

        chalk_agg["n"] += 1
        chalk_agg["winner"] += int(c_picked == actual_class)
        chalk_agg["exact"] += int(c_exact)
        chalk_agg["brier"] += _brier((cph, cpd, cpa), onehot)
        chalk_agg["log_loss"] += _log_loss((cph, cpd, cpa), onehot)

        chalk_per_tournament[comp]["n"] += 1
        chalk_per_tournament[comp]["winner"] += int(c_picked == actual_class)
        chalk_per_tournament[comp]["exact"] += int(c_exact)
        chalk_per_tournament[comp]["brier"] += _brier((cph, cpd, cpa), onehot)
        chalk_per_tournament[comp]["log_loss"] += _log_loss((cph, cpd, cpa), onehot)

        if comp == WC2026_COMP:
            chalk_wc2026_md1["n"] += 1
            chalk_wc2026_md1["winner"] += int(c_picked == actual_class)
            chalk_wc2026_md1["exact"] += int(c_exact)

        # ---------- Advance Elo book ----------
        elo.update(home, away, hg, ag, competition="worldcup")

        if (i + 1) % 50 == 0:
            log.info("processed %d/%d matches", i + 1, len(eval_rows))

    elapsed = time.monotonic() - started
    log.info("walk-forward done in %.1fs", elapsed)

    n = elo_agg["n"]
    elo_summary = {
        "n": n,
        "winner_accuracy": round(elo_agg["winner"] / n, 4) if n else 0.0,
        "exact_accuracy": round(elo_agg["exact"] / n, 4) if n else 0.0,
        "mean_brier": round(elo_agg["brier"] / n, 4) if n else 0.0,
        "mean_log_loss": round(elo_agg["log_loss"] / n, 4) if n else 0.0,
        "per_tournament": _per_tournament_acc(elo_per_tournament),
        "wc2026_md1_md2_played_games": {
            "n": elo_wc2026_md1["n"],
            "winner": f"{elo_wc2026_md1['winner']}/{elo_wc2026_md1['n']}",
            "exact": f"{elo_wc2026_md1['exact']}/{elo_wc2026_md1['n']}",
            "winner_accuracy": round(
                elo_wc2026_md1["winner"] / elo_wc2026_md1["n"], 4
            ) if elo_wc2026_md1["n"] else 0.0,
            "exact_accuracy": round(
                elo_wc2026_md1["exact"] / elo_wc2026_md1["n"], 4
            ) if elo_wc2026_md1["n"] else 0.0,
        },
    }

    n2 = chalk_agg["n"]
    chalk_summary = {
        "n": n2,
        "winner_accuracy": round(chalk_agg["winner"] / n2, 4) if n2 else 0.0,
        "exact_accuracy": round(chalk_agg["exact"] / n2, 4) if n2 else 0.0,
        "mean_brier": round(chalk_agg["brier"] / n2, 4) if n2 else 0.0,
        "mean_log_loss": round(chalk_agg["log_loss"] / n2, 4) if n2 else 0.0,
        "per_tournament": _per_tournament_acc(chalk_per_tournament),
        "wc2026_md1_md2_played_games": {
            "n": chalk_wc2026_md1["n"],
            "winner": f"{chalk_wc2026_md1['winner']}/{chalk_wc2026_md1['n']}",
            "exact": f"{chalk_wc2026_md1['exact']}/{chalk_wc2026_md1['n']}",
            "winner_accuracy": round(
                chalk_wc2026_md1["winner"] / chalk_wc2026_md1["n"], 4
            ) if chalk_wc2026_md1["n"] else 0.0,
            "exact_accuracy": round(
                chalk_wc2026_md1["exact"] / chalk_wc2026_md1["n"], 4
            ) if chalk_wc2026_md1["n"] else 0.0,
        },
    }

    mc_summary = {
        "n_per_match": mc_samples,
        "matches_checked": mc_check_count,
        "total_samples": mc_check_count * mc_samples,
        "max_pp_drift_from_analytical": round(max(mc_drifts_pp) if mc_drifts_pp else 0.0, 3),
        "mean_pp_drift_from_analytical": round(
            float(np.mean(mc_drifts_pp)) if mc_drifts_pp else 0.0, 4
        ),
        "p95_pp_drift_from_analytical": round(
            float(np.percentile(mc_drifts_pp, 95)) if mc_drifts_pp else 0.0, 3
        ),
    }

    return {
        "elo_summary": elo_summary,
        "chalk_summary": chalk_summary,
        "monte_carlo_sanity_check": mc_summary,
        "final_elo_book": elo.snapshot(),
        "elapsed_seconds": round(elapsed, 1),
    }


# ---------------------------------------------------------------------------
# LLM evaluation (WC2026 MD1 played games only)
# ---------------------------------------------------------------------------

def _exact_score_from_str(score: str) -> tuple[int, int] | None:
    if not score or "-" not in score:
        return None
    try:
        hs, as_ = score.split("-", 1)
        return int(hs.strip()), int(as_.strip())
    except ValueError:
        return None


def run_llm_on_wc2026_md1(
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    """Call LLM on each of the played WC2026 MD1 fixtures and score it."""
    if not _LLM_IMPORT_OK:
        return {
            "skipped": True,
            "reason": f"llm_predictor_import_failed:{_LLM_IMPORT_ERR}",
        }

    md1_rows = [r for r in history if r["competition"] == WC2026_COMP]
    if not md1_rows:
        return {"skipped": True, "reason": "no_wc2026_rows_in_history_csv"}

    model = detect_available_model()
    if not model:
        return {
            "skipped": True,
            "reason": "ollama_unreachable_or_no_preferred_model",
        }

    log.info("LLM model selected: %s (n=%d matches)", model, len(md1_rows))

    winner = 0
    exact = 0
    n = 0
    brier_total = 0.0
    log_loss_total = 0.0
    details: list[dict[str, Any]] = []
    for r in md1_rows:
        home, away = r["home"], r["away"]
        hg, ag = r["hg"], r["ag"]
        actual_class, onehot = _outcome(hg, ag)
        result = llm_predict_match(
            home=home,
            away=away,
            context_blob=LATE_NEWS_CONTEXT,
            model=model,
            venue="neutral (MD1, host country)",
            when=r.get("date", ""),
        )
        if "error" in result:
            details.append({
                "match": f"{home} vs {away}",
                "actual": f"{hg}-{ag}",
                "error": result.get("error"),
            })
            continue
        ph = float(result.get("p_home", 0.0))
        pd_ = float(result.get("p_draw", 0.0))
        pa = float(result.get("p_away", 0.0))
        picked = _picked_class(ph, pd_, pa)
        pred_score = _exact_score_from_str(result.get("predicted_score", ""))
        exact_hit = (pred_score == (hg, ag)) if pred_score else False
        n += 1
        winner += int(picked == actual_class)
        exact += int(exact_hit)
        brier_total += _brier((ph, pd_, pa), onehot)
        log_loss_total += _log_loss((ph, pd_, pa), onehot)
        details.append({
            "match": f"{home} vs {away}",
            "actual": f"{hg}-{ag}",
            "llm_predicted_score": result.get("predicted_score", ""),
            "p_home": ph,
            "p_draw": pd_,
            "p_away": pa,
            "picked": picked,
            "actual_class": actual_class,
            "exact_hit": exact_hit,
            "rationale": result.get("rationale", "")[:160],
            "elapsed_ms": result.get("elapsed_ms"),
        })

    return {
        "skipped": False,
        "model": model,
        "n": n,
        "winner_accuracy": round(winner / n, 4) if n else 0.0,
        "exact_accuracy": round(exact / n, 4) if n else 0.0,
        "mean_brier": round(brier_total / n, 4) if n else 0.0,
        "mean_log_loss": round(log_loss_total / n, 4) if n else 0.0,
        "wc2026_md1_md2_played_games": {
            "n": n,
            "winner": f"{winner}/{n}",
            "exact": f"{exact}/{n}",
        },
        "details": details,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _interpret(
    elo_summary: dict[str, Any],
    chalk_summary: dict[str, Any],
    llm_summary: dict[str, Any],
) -> tuple[str, str]:
    """Return (best_model_id, honest_interpretation)."""
    candidates: list[tuple[str, float, float]] = []
    if elo_summary["n"]:
        candidates.append(("elo_poisson", elo_summary["winner_accuracy"], elo_summary["mean_brier"]))
    if chalk_summary["n"]:
        candidates.append(("chalk", chalk_summary["winner_accuracy"], chalk_summary["mean_brier"]))
    # LLM is evaluated only on the small WC2026 subset; report but don't crown
    # it as overall winner against models tested on 470+ matches.
    best = max(candidates, key=lambda c: c[1]) if candidates else ("none", 0.0, 0.0)
    elo_acc = elo_summary["winner_accuracy"] * 100
    chalk_acc = chalk_summary["winner_accuracy"] * 100
    parts = [
        f"Elo+Poisson hit {elo_acc:.1f}% winner accuracy across {elo_summary['n']} historical matches "
        f"(Brier {elo_summary['mean_brier']:.3f}); the chalk baseline hit {chalk_acc:.1f}%.",
    ]
    if not llm_summary.get("skipped"):
        parts.append(
            f"LLM {llm_summary.get('model','?')} hit {llm_summary['winner_accuracy']*100:.1f}% on the "
            f"{llm_summary['n']} WC2026 MD1 played games (Brier {llm_summary['mean_brier']:.3f})."
        )
    else:
        parts.append(f"LLM was skipped: {llm_summary.get('reason','unknown')}.")
    parts.append(
        "Across the full corpus the Elo+Poisson model is the strongest baseline, consistent with the "
        "52-58% three-way accuracy reported in Groll et al. for international football."
        if best[0] == "elo_poisson" else
        "Chalk happened to top Elo+Poisson on raw accuracy; Brier and log-loss should still favor "
        "the probabilistic model."
    )
    return best[0], " ".join(parts)


def main() -> int:
    log.info("loading history from %s", HISTORY_CSV)
    history = load_history(HISTORY_CSV)
    log.info("loaded %d historical rows", len(history))

    walk = run_walk_forward(
        history,
        warmup_matches=WARMUP_MATCHES,
        mc_samples=MC_SAMPLES_PER_MATCH,
    )

    log.info("running LLM evaluation on WC2026 MD1 played games")
    llm_summary = run_llm_on_wc2026_md1(history)

    best_model, interpretation = _interpret(
        walk["elo_summary"], walk["chalk_summary"], llm_summary,
    )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_csv": str(HISTORY_CSV),
        "warmup_matches": WARMUP_MATCHES,
        "total_matches_in_corpus": len(history),
        "total_matches_evaluated": walk["elo_summary"]["n"],
        "monte_carlo_samples_per_match": MC_SAMPLES_PER_MATCH,
        "elapsed_seconds": walk["elapsed_seconds"],
        "models": {
            "elo_poisson": walk["elo_summary"],
            "chalk": walk["chalk_summary"],
            "llm_qwen14b": llm_summary,
        },
        "best_model": best_model,
        "monte_carlo_sanity_check": walk["monte_carlo_sanity_check"],
        "honest_interpretation": interpretation,
        "final_elo_top20": dict(
            sorted(walk["final_elo_book"].items(), key=lambda kv: kv[1], reverse=True)[:20]
        ),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_PATH.with_suffix(OUT_PATH.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(OUT_PATH)
    log.info("wrote %s (%d bytes)", OUT_PATH, OUT_PATH.stat().st_size)

    # Print a tight human-readable summary to stdout for cron + manual runs.
    log.info("=== summary ===")
    log.info("Elo+Poisson  winner %.1f%% exact %.1f%% Brier %.3f LL %.3f (n=%d)",
             walk["elo_summary"]["winner_accuracy"] * 100,
             walk["elo_summary"]["exact_accuracy"] * 100,
             walk["elo_summary"]["mean_brier"],
             walk["elo_summary"]["mean_log_loss"],
             walk["elo_summary"]["n"])
    log.info("Chalk        winner %.1f%% exact %.1f%% Brier %.3f LL %.3f (n=%d)",
             walk["chalk_summary"]["winner_accuracy"] * 100,
             walk["chalk_summary"]["exact_accuracy"] * 100,
             walk["chalk_summary"]["mean_brier"],
             walk["chalk_summary"]["mean_log_loss"],
             walk["chalk_summary"]["n"])
    if not llm_summary.get("skipped"):
        log.info("LLM %s  winner %.1f%% exact %.1f%% Brier %.3f (n=%d)",
                 llm_summary["model"],
                 llm_summary["winner_accuracy"] * 100,
                 llm_summary["exact_accuracy"] * 100,
                 llm_summary["mean_brier"],
                 llm_summary["n"])
    log.info("MC sanity check: max drift %.3f pp / mean %.4f pp / p95 %.3f pp (n=%d/match)",
             walk["monte_carlo_sanity_check"]["max_pp_drift_from_analytical"],
             walk["monte_carlo_sanity_check"]["mean_pp_drift_from_analytical"],
             walk["monte_carlo_sanity_check"]["p95_pp_drift_from_analytical"],
             MC_SAMPLES_PER_MATCH)
    log.info("best model: %s", best_model)
    return 0


if __name__ == "__main__":
    sys.exit(main())
