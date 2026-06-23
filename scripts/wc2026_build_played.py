#!/usr/bin/env python3
"""Build wc2026_played.json — the single source of truth for the Results panel.

Merges fixtures, verified actuals, model predictions, live scorers and
explanations. Run after wc2026_fetch_results.py or whenever predictions are
refreshed.
"""
from __future__ import annotations

import json
import pathlib
import sys
from typing import Any

ROOT = pathlib.Path("/opt/jarvis-app-1")
DATA = ROOT / "server" / "data"
FIXTURES_PATH = DATA / "wc2026_fixtures_all.json"
RESULTS_PATH = DATA / "wc2026_results.json"
PREDICTIONS_PATH = DATA / "wc2026_model_predictions.json"
ACTIVE_MODEL_PATH = DATA / "wc2026_active_model.json"
OUTPUT_PATH = DATA / "wc2026_played.json"


def _norm(name: str) -> str:
    return (name or "").strip().lower()


def _outcome(score: str) -> str | None:
    try:
        hg, ag = map(int, str(score).replace("–", "-").replace("—", "-").split("-", 1))
    except (ValueError, AttributeError):
        return None
    if hg > ag:
        return "H"
    if hg < ag:
        return "A"
    return "D"


def _goals(score: str) -> tuple[int, int] | None:
    try:
        return tuple(map(int, str(score).replace("–", "-").replace("—", "-").split("-", 1)))  # type: ignore[return-value]
    except (ValueError, AttributeError):
        return None


def _build_explanation(m: dict, p: dict, actual_outcome: str | None, correct: bool) -> str:
    """Generate a human-readable prediction explanation for this match."""
    home, away = m.get("home", ""), m.get("away", "")
    pred = p.get("predicted_wdl")
    pick_name = home if pred == "H" else (away if pred == "A" else "Draw")
    score = p.get("predicted_score", "-")
    prob = max(p.get("p_home", 0), p.get("p_draw", 0), p.get("p_away", 0))

    if actual_outcome:
        result_text = f"The match finished {m.get('result')}."
        if correct:
            verdict = f"The model correctly picked {pick_name}."
        else:
            actual_name = home if actual_outcome == "H" else (away if actual_outcome == "A" else "the draw")
            verdict = f"The model picked {pick_name}; the actual result went to {actual_name}."
    else:
        result_text = "Result pending."
        verdict = f"The model's top pick is {pick_name}."

    spread = p.get("three_spread") or {}
    spread_bits = []
    for k in ["A", "B", "C"]:
        v = spread.get(k)
        if v:
            spread_bits.append(f"spread {k}: {home if v == 'H' else (away if v == 'A' else 'Draw')}")
    spread_sentence = f" Three-spread view: {', '.join(spread_bits)}." if spread_bits else ""

    return (
        f"{result_text} {verdict} "
        f"The ensemble projected a {score} scoreline with {prob:.0%} confidence on the pick."
        f"{spread_sentence}"
    )


def _build_match_row(m: dict, predictions: dict, scorers: dict | None) -> dict[str, Any]:
    n = str(m.get("n"))
    p = predictions.get(n) or {}
    result = m.get("result")
    home, away = m.get("home", ""), m.get("away", "")
    pred_outcome = p.get("predicted_wdl")
    actual_outcome = _outcome(result) if result else None
    correct = bool(actual_outcome and pred_outcome and actual_outcome == pred_outcome)

    pred_score = p.get("predicted_score")
    score_exact = False
    score_diff_correct = False
    over_under_2_5 = None
    pred_total = None
    if result and pred_score:
        actual_goals = _goals(result)
        pred_goals = _goals(pred_score)
        if actual_goals and pred_goals:
            score_exact = actual_goals == pred_goals
            score_diff_correct = (actual_goals[0] - actual_goals[1]) == (pred_goals[0] - pred_goals[1])
            pred_total = pred_goals[0] + pred_goals[1]
            over_under_2_5 = "over" if (actual_goals[0] + actual_goals[1]) > 2.5 else "under"

    row = {
        "n": m.get("n"),
        "date": m.get("date"),
        "kickoff_iso": m.get("kickoff_iso"),
        "stage": m.get("stage"),
        "group": m.get("group"),
        "matchday": m.get("matchday"),
        "home": home,
        "away": away,
        "venue": m.get("venue"),
        "result": result,
        "predicted_score": pred_score,
        "predicted_wdl": pred_outcome,
        "p_home": p.get("p_home"),
        "p_draw": p.get("p_draw"),
        "p_away": p.get("p_away"),
        "treatment": p.get("treatment"),
        "three_spread": p.get("three_spread"),
        "actual_outcome": actual_outcome,
        "correct": correct,
        "score_exact": score_exact,
        "score_diff_correct": score_diff_correct,
        "over_under_2_5": over_under_2_5,
        "pred_total": pred_total,
        "scorers": scorers or {"home": [], "away": []},
        "explanation": _build_explanation(m, p, actual_outcome, correct),
    }
    return row


def _sync_fixtures_with_actuals(fixtures: dict, actuals_results: dict) -> dict:
    """Return fixtures with actual results + played flag merged from actuals_results."""
    updated = 0
    for m in fixtures.get("matches", []):
        n = str(m.get("n"))
        if n in actuals_results:
            if m.get("result") != actuals_results[n] or not m.get("played"):
                m["result"] = actuals_results[n]
                m["played"] = True
                m["result_verified"] = True
                updated += 1
    return fixtures, updated


def build() -> dict[str, Any]:
    fixtures_doc = json.loads(FIXTURES_PATH.read_text())
    results = json.loads(RESULTS_PATH.read_text()) if RESULTS_PATH.exists() else {}
    preds_doc = json.loads(PREDICTIONS_PATH.read_text()) if PREDICTIONS_PATH.exists() else {}
    active = json.loads(ACTIVE_MODEL_PATH.read_text()) if ACTIVE_MODEL_PATH.exists() else {}

    predictions = preds_doc.get("all_fixture_predictions") or {}
    actuals_results = results.get("actuals_results") or {}
    actuals_scorers = results.get("actuals_scorers") or {}

    fixtures_doc, updated = _sync_fixtures_with_actuals(fixtures_doc, actuals_results)
    if updated:
        FIXTURES_PATH.write_text(json.dumps(fixtures_doc, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Synced {updated} fixtures with verified actuals")
    fixtures = fixtures_doc

    played_rows = []
    for m in fixtures.get("matches", []):
        n = str(m.get("n"))
        if n not in actuals_results:
            continue
        m = dict(m)
        m["result"] = actuals_results[n]
        m["played"] = True
        row = _build_match_row(m, predictions, actuals_scorers.get(n))
        played_rows.append(row)

    played_rows.sort(key=lambda x: x["kickoff_iso"] or "")

    # Accuracy aggregates
    total = len(played_rows)
    graded = [r for r in played_rows if r["actual_outcome"]]
    correct_count = sum(1 for r in graded if r["correct"])
    exact_count = sum(1 for r in graded if r["score_exact"])
    diff_count = sum(1 for r in graded if r["score_diff_correct"])

    by_stage: dict[str, dict] = {}
    for r in graded:
        stage = r["stage"] or "OTHER"
        bucket = by_stage.setdefault(stage, {"graded": 0, "correct": 0})
        bucket["graded"] += 1
        if r["correct"]:
            bucket["correct"] += 1

    by_team: dict[str, dict] = {}
    for r in played_rows:
        for side, team in (("home", r["home"]), ("away", r["away"])):
            bucket = by_team.setdefault(team, {"played": 0, "wins": 0, "draws": 0, "losses": 0, "gf": 0, "ga": 0, "pts": 0})
            bucket["played"] += 1
            g = _goals(r["result"])
            if not g:
                continue
            gf, ga = (g[0], g[1]) if side == "home" else (g[1], g[0])
            bucket["gf"] += gf
            bucket["ga"] += ga
            if gf > ga:
                bucket["wins"] += 1
                bucket["pts"] += 3
            elif gf == ga:
                bucket["draws"] += 1
                bucket["pts"] += 1
            else:
                bucket["losses"] += 1

    accuracy = {
        "matches_played": total,
        "winner_accuracy": correct_count / total if total else None,
        "exact_score_rate": exact_count / total if total else None,
        "goal_diff_rate": diff_count / total if total else None,
        "correct_count": correct_count,
        "exact_count": exact_count,
        "diff_count": diff_count,
        "by_stage": {k: {"graded": v["graded"], "correct": v["correct"], "accuracy": v["correct"] / v["graded"] if v["graded"] else None} for k, v in by_stage.items()},
        "by_team": dict(sorted(by_team.items(), key=lambda x: (-x[1]["pts"], -(x[1]["gf"] - x[1]["ga"]), -x[1]["gf"]))[:20]),
    }

    output = {
        "generated_at": json.loads((ROOT / "server" / "data" / "wc2026_results.json").read_text()).get("last_updated") if (ROOT / "server" / "data" / "wc2026_results.json").exists() else None,
        "model_version": active.get("model_version"),
        "accuracy": accuracy,
        "matches": played_rows,
    }
    return output


def main() -> int:
    try:
        output = build()
        OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
        acc = output["accuracy"]
        print(
            f"Wrote {OUTPUT_PATH}: {acc['matches_played']} played, "
            f"winner {acc['correct_count']}/{acc['matches_played']} "
            f"({acc['winner_accuracy']:.1%}), exact {acc['exact_count']}"
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
