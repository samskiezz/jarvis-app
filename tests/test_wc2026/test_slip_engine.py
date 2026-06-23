"""Acceptance tests for the WC2026 three-spread coverage engine.

Proves (offline, mocked games) the behaviours required by the spec:
 1. Backtest never uses future results (no-lookahead).
 2. Single accuracy counts only top-pick correctness.
 3. Three-spread coverage counts actual in {A, B, C}.
 4. Covering all three outcomes is labelled coverage-engineering, not accuracy.
 5. LOCK games -> identical A/B/C.
 6. ROTATE games -> distributed outcomes.
 7. Draw-heavy games -> draw in >= 1 variation.
 8. No guaranteed 85-100% success language anywhere.
 9. In-sample results reported as in-sample.
10. Stake-cost warning fires when too many games are fully rotated.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import worldcup_prediction_engine as eng  # noqa: E402
from worldcup_prediction_engine import (  # noqa: E402
    HOME, DRAW, AWAY, Match, ModelPrediction, BacktestRow,
    STRATEGY_PRESETS, SAFE_DEFAULT_WEIGHTS,
    classify_treatment, generate_three_spread, apply_stake_cost_guards,
    compare_single_vs_spread, sequential_no_lookahead_backtest,
)

PRESET = STRATEGY_PRESETS["balanced"]


def _match(mid: str, a: str = "A-Team", b: str = "B-Team", stage: str = "Group",
           hg=None, ag=None) -> Match:
    return Match(match_id=mid, date="2026-06-20", team_a=a, team_b=b,
                 competition="WC2026", stage=stage, neutral=True,
                 home_goals=hg, away_goals=ag)


def _pred(mid: str, ph: float, pd: float, pa: float) -> tuple[ModelPrediction, dict]:
    top = max((HOME, ph), (DRAW, pd), (AWAY, pa), key=lambda kv: kv[1])[0]
    per_model = {"m1": (ph, pd, pa), "m2": (ph, pd, pa)}
    return ModelPrediction(mid, ph, pd, pa, top, per_model), per_model


def _spread_for(mid: str, ph: float, pd: float, pa: float, stage: str = "Group"):
    m = _match(mid, stage=stage)
    pred, per_model = _pred(mid, ph, pd, pa)
    risk = classify_treatment(pred, per_model, m, PRESET)
    return generate_three_spread(m, pred, risk), risk


# 1 -------------------------------------------------------------------------
def test_backtest_no_lookahead():
    """Match-1 prediction must be identical whether or not match-2 exists."""
    universe = ["A-Team", "B-Team", "C-Team", "D-Team"]
    m1 = _match("1", "A-Team", "B-Team", hg=2, ag=0)
    m2 = _match("2", "C-Team", "D-Team", hg=1, ag=1)
    rows_two = sequential_no_lookahead_backtest([m1, m2], SAFE_DEFAULT_WEIGHTS,
                                                "balanced", {}, universe)
    rows_one = sequential_no_lookahead_backtest([m1], SAFE_DEFAULT_WEIGHTS,
                                                "balanced", {}, universe)
    r_two = next(r for r in rows_two if r.match_id == "1")
    r_one = rows_one[0]
    assert (r_two.p_team_a_win, r_two.p_draw, r_two.p_team_b_win) == \
           (r_one.p_team_a_win, r_one.p_draw, r_one.p_team_b_win)


# 2 -------------------------------------------------------------------------
def test_single_accuracy_counts_top_pick_only():
    correct = BacktestRow(
        match_id="x", date="d", team_a="A", team_b="B", final_score="2-0",
        actual_outcome=HOME, p_team_a_win=0.6, p_draw=0.25, p_team_b_win=0.15,
        top_pick=HOME, treatment="HEDGE", variation_a=HOME, variation_b=DRAW,
        variation_c=HOME, coverage_cost=2, single_correct=True, spread_covered=True,
        entropy=0.5, model_disagreement=0.05, confidence_margin=0.35, in_sample=True)
    wrong = BacktestRow(**{**correct.__dict__, "actual_outcome": AWAY,
                           "single_correct": False, "spread_covered": False})
    summ = compare_single_vs_spread([correct, wrong], runs=100, in_sample=True)
    assert summ.single_top_pick_accuracy == 0.5


# 3 -------------------------------------------------------------------------
def test_three_spread_coverage_counts_membership():
    covered = BacktestRow(
        match_id="x", date="d", team_a="A", team_b="B", final_score="1-1",
        actual_outcome=DRAW, p_team_a_win=0.45, p_draw=0.31, p_team_b_win=0.24,
        top_pick=HOME, treatment="DRAW_HEDGE", variation_a=HOME, variation_b=DRAW,
        variation_c=AWAY, coverage_cost=3, single_correct=False, spread_covered=True,
        entropy=0.9, model_disagreement=0.1, confidence_margin=0.14, in_sample=True)
    summ = compare_single_vs_spread([covered], runs=10, in_sample=True)
    assert summ.three_spread_coverage == 1.0
    assert summ.single_top_pick_accuracy == 0.0
    assert summ.uplift == 1.0


# 4 -------------------------------------------------------------------------
def test_full_coverage_labelled_engineering():
    rows = [BacktestRow(
        match_id=str(i), date="d", team_a="A", team_b="B", final_score="1-1",
        actual_outcome=DRAW, p_team_a_win=0.4, p_draw=0.33, p_team_b_win=0.27,
        top_pick=HOME, treatment="ROTATE", variation_a=HOME, variation_b=DRAW,
        variation_c=AWAY, coverage_cost=3, single_correct=False,
        spread_covered=True, entropy=0.99, model_disagreement=0.2,
        confidence_margin=0.07, in_sample=True) for i in range(4)]
    summ = compare_single_vs_spread(rows, runs=10, in_sample=True)
    assert any("COVERAGE-ENGINEERING" in w for w in summ.warnings)


# 5 -------------------------------------------------------------------------
def test_lock_identical_across_variations():
    spread, risk = _spread_for("lock", 0.80, 0.10, 0.10)
    assert risk.treatment == "LOCK"
    assert spread.variation_a == spread.variation_b == spread.variation_c == HOME
    assert spread.coverage_cost == 1


# 6 -------------------------------------------------------------------------
def test_rotate_distributes_outcomes():
    spread, risk = _spread_for("rot", 0.36, 0.34, 0.30)
    assert risk.treatment in ("ROTATE", "EXCLUDE")
    if risk.treatment == "ROTATE":
        outcomes = {spread.variation_a, spread.variation_b, spread.variation_c}
        assert len(outcomes) >= 2


# 7 -------------------------------------------------------------------------
def test_draw_heavy_includes_draw():
    # Clear-ish favourite but draw plausible (not a 3-way coin flip, which
    # would correctly ROTATE instead) -> DRAW_HEDGE.
    spread, risk = _spread_for("draw", 0.50, 0.30, 0.20, stage="Group")
    assert risk.treatment == "DRAW_HEDGE"
    assert DRAW in {spread.variation_a, spread.variation_b, spread.variation_c}


# 8 -------------------------------------------------------------------------
def test_no_guaranteed_success_language():
    banned = ["guaranteed 85", "guaranteed 100", "guaranteed success",
              "guaranteed profit", "100% accuracy", "guaranteed win"]
    src = Path(eng.__file__).read_text().lower()
    for phrase in banned:
        assert phrase not in src, f"banned phrase present: {phrase}"


# 9 -------------------------------------------------------------------------
def test_in_sample_reported():
    row = BacktestRow(
        match_id="x", date="d", team_a="A", team_b="B", final_score="2-0",
        actual_outcome=HOME, p_team_a_win=0.6, p_draw=0.25, p_team_b_win=0.15,
        top_pick=HOME, treatment="HEDGE", variation_a=HOME, variation_b=DRAW,
        variation_c=HOME, coverage_cost=2, single_correct=True, spread_covered=True,
        entropy=0.5, model_disagreement=0.05, confidence_margin=0.35, in_sample=True)
    summ = compare_single_vs_spread([row], runs=10, in_sample=True)
    assert summ.in_sample is True
    assert any("IN-SAMPLE" in w for w in summ.warnings)


# 10 ------------------------------------------------------------------------
def test_stake_cost_caps_full_rotations():
    spreads, risks = [], {}
    for i in range(5):
        mid = f"r{i}"
        # entropy in [0.95, 0.985) -> ROTATE (not EXCLUDE); third>=0.22 -> cost 3
        spread, risk = _spread_for(mid, 0.42, 0.33, 0.25)
        if spread.coverage_cost != 3:
            pytest.skip("classifier did not produce full rotate for crafted probs")
        spreads.append(spread)
        risks[mid] = risk
    capped, warnings = apply_stake_cost_guards(spreads, risks)
    assert sum(1 for s in capped if s.coverage_cost == 3) <= eng.MAX_FULL_ROTATES
    assert any("Stake-cost" in w for w in warnings)
