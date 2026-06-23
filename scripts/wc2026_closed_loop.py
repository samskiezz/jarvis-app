#!/usr/bin/env python3
"""Closed-loop autonomous prediction intelligence backend.

Architecture:
  Observe -> Feature -> Predict -> Calibrate -> State Engine -> Market Compare
  -> Edge/Uncertainty -> Risk Gate -> Decide -> Log -> Result Feedback
  -> Recalibrate -> repeat.

Agents communicate via typed JSON messages. All probability/edge/stake maths
are deterministic Python functions. The LLM layer is the orchestrator, not the
calculator.
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"
AUDIT_PATH = DATA_DIR / "wc2026_closed_loop_audit.jsonl"
RESULTS_PATH = DATA_DIR / "wc2026_closed_loop_results.json"

LOG = logging.getLogger("wc2026_closed_loop")
if not LOG.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(_h)
LOG.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# JSON message contracts
# ---------------------------------------------------------------------------
@dataclass
class MarketSnapshotMessage:
    type: str = "MARKET_SNAPSHOT"
    event_id: str = ""
    timestamp: str = ""
    sport: str = "football"
    league: str = "WC2026"
    market: str = "moneyline"
    bookmaker: str = "aggregate"
    odds: dict[str, Any] = field(default_factory=dict)
    market_depth: dict[str, float] = field(default_factory=dict)


@dataclass
class ModelPredictionMessage:
    type: str = "MODEL_PREDICTION"
    event_id: str = ""
    timestamp: str = ""
    selection: str = ""
    base_probability: float = 0.0
    calibrated_probability: float = 0.0
    confidence_interval: dict[str, float] = field(default_factory=dict)
    model_version: str = "logloss_blend_v1"
    features_version: str = "v1"


@dataclass
class StateEngineMessage:
    type: str = "STATE_ENGINE_OUTPUT"
    event_id: str = ""
    timestamp: str = ""
    density_state_probability: float = 0.0
    rmt_noise_score: float = 0.0
    vortex_phase_coherence: float = 0.0
    entanglement_exposure: float = 0.0
    edge_decay_factor: float = 0.0
    scenario_weights: dict[str, float] = field(default_factory=dict)


@dataclass
class RiskGateMessage:
    type: str = "RISK_GATE_OUTPUT"
    event_id: str = ""
    timestamp: str = ""
    passes_risk_gate: bool = False
    risk_reasons: list[str] = field(default_factory=list)
    data_quality_score: float = 0.0
    robustness_score: float = 0.0
    liquidity_score: float = 0.0
    correlation_penalty: float = 0.0
    max_allowed_stake_fraction: float = 0.0


@dataclass
class FinalDecisionMessage:
    type: str = "FINAL_DECISION"
    event_id: str = ""
    timestamp: str = ""
    decision: str = "NO_BET"  # BET|NO_BET|WATCH|REPRICE_REQUIRED
    selection: str = ""
    odds: float = 0.0
    model_probability: float = 0.0
    market_probability: float = 0.0
    edge: float = 0.0
    final_bet_score: float = 0.0
    kelly_fraction: float = 0.0
    approved_stake_fraction: float = 0.0
    reason_summary: str = ""
    required_follow_up: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------
class DataIngestionAgent:
    """Collects raw odds, results, team context, timestamps. Never predicts."""

    def ingest(self, match: Any) -> MarketSnapshotMessage:
        odds = getattr(match, "odds", None) or {}
        return MarketSnapshotMessage(
            event_id=str(match.match_id),
            timestamp=_utcnow(),
            market="moneyline",
            odds={k: float(v) for k, v in odds.items() if isinstance(v, (int, float, str))},
            market_depth={
                "liquidity_score": 0.8 if odds else 0.4,
                "movement_velocity": 0.0,
                "bookmaker_sharpness_score": 0.7 if odds else 0.4,
            },
        )


class FeatureEngineeringAgent:
    """Builds model-ready features from raw data."""

    def build(self, match: Any, state: Any, universe: list[str]) -> dict[str, Any]:
        from worldcup_prediction_engine import _features
        return {
            "elo_diff": state.rating(match.team_a) - state.rating(match.team_b),
            "rank_diff": state.rank_of(match.team_b, universe) - state.rank_of(match.team_a, universe),
            "form_diff": state.form(match.team_a) - state.form(match.team_b),
            "neutral": bool(getattr(match, "neutral", True)),
            "stage": getattr(match, "stage", ""),
            "is_group_stage": getattr(match, "is_group_stage", False),
            "feature_vector": _features(state, match, universe).tolist(),
        }


class PredictionAgent:
    """Runs deterministic base model."""

    def __init__(self, weights: dict[str, float], boosts: dict[str, Any]) -> None:
        self.weights = weights
        self.boosts = boosts

    def predict(self, state: Any, match: Any, universe: list[str]) -> ModelPredictionMessage:
        from worldcup_prediction_engine import _predict_one
        pred, _ = _predict_one(state, match, universe, self.weights, self.boosts)
        return ModelPredictionMessage(
            event_id=str(match.match_id),
            timestamp=_utcnow(),
            selection=pred.top_pick,
            base_probability=pred.prob_of(pred.top_pick),
            calibrated_probability=pred.prob_of(pred.top_pick),
            confidence_interval={"lower": 0.0, "upper": 1.0},
        )


class StateEngineAgent:
    """Quantum/RMT/vortex state wrapper."""

    def __init__(self) -> None:
        from wc2026_quantum_state import QuantumAssessor
        self.assessor = QuantumAssessor()

    def run(self, match: Any, pred: Any, per_model: dict[str, tuple],
            state: Any, open_bets: list[dict[str, Any]]) -> StateEngineMessage:
        qs = self.assessor.assess(match, pred, per_model, state, open_bets=open_bets)
        top_idx = int(np.argmax(qs.evolved_probs))
        from worldcup_prediction_engine import HOME, DRAW, AWAY
        idx_map = {0: HOME, 1: DRAW, 2: AWAY}
        return StateEngineMessage(
            event_id=str(match.match_id),
            timestamp=_utcnow(),
            density_state_probability=float(qs.evolved_probs[top_idx]),
            rmt_noise_score=round(1.0 - qs.confidence, 4),
            vortex_phase_coherence=qs.vortex_coherence,
            entanglement_exposure=qs.exposure_penalty,
            edge_decay_factor=qs.decay,
            scenario_weights={s.name: round(s.weight, 4) for s in qs.scenarios},
        )


class MarketComparisonAgent:
    """De-vig odds and compare model vs market."""

    def compare(self, match: Any, model_prob: float, selection: str) -> dict[str, float]:
        from wc2026_quantum_state import market_probabilities
        market_probs = market_probabilities(getattr(match, "odds", None))
        key_map = {"H": 0, "D": 1, "A": 2}
        idx = key_map.get(selection, 0)
        if market_probs is not None and market_probs[idx] > 0:
            market_p = float(market_probs[idx])
            decimal = float(1.0 / market_p)
        else:
            market_p = 1.0 / 3.0
            decimal = 3.0
        # Override with real book odds if present
        odds = getattr(match, "odds", None) or {}
        real_decimal = odds.get({"H": "home", "D": "draw", "A": "away"}[selection])
        if real_decimal is not None and float(real_decimal) > 1.0:
            decimal = float(real_decimal)
        ev = model_prob * decimal - 1.0
        return {
            "model_probability": model_prob,
            "market_probability": market_p,
            "edge": model_prob - market_p,
            "expected_value": ev,
            "decimal_odds": decimal,
        }


class RiskGateAgent:
    """Blocks bad bets through strict mathematical gates."""

    def __init__(self, cfg: dict[str, float]) -> None:
        self.cfg = cfg

    def check(self, qs: Any, edge_info: dict[str, float],
              market_depth: dict[str, float]) -> RiskGateMessage:
        reasons: list[str] = []
        if qs.confidence < self.cfg["min_confidence"]:
            reasons.append("confidence_below_threshold")
        if qs.robustness < self.cfg["min_robustness"]:
            reasons.append("edge_not_robust")
        if qs.data_quality < self.cfg["min_data_quality"]:
            reasons.append("data_quality_low")
        if qs.liquidity < self.cfg["min_liquidity"]:
            reasons.append("low_liquidity")
        if qs.exposure_penalty > self.cfg["max_exposure_penalty"]:
            reasons.append("correlated_exposure_high")
        if qs.vortex_coherence < self.cfg["min_vortex"]:
            reasons.append("low_phase_coherence")

        top_idx = int(np.argmax(qs.bet_score))
        passes = len(reasons) == 0 and float(qs.bet_score[top_idx]) > self.cfg["min_bet_score"]
        if float(qs.bet_score[top_idx]) <= self.cfg["min_bet_score"]:
            reasons.append("bet_score_below_threshold")

        lower_bound = float(qs.evolved_probs[top_idx]) - 0.5 * (1.0 - qs.confidence)
        if lower_bound <= edge_info["market_probability"] + self.cfg["min_edge_delta"]:
            reasons.append("lower_bound_edge_insufficient")
            passes = False

        approved = float(qs.kelly_fraction[top_idx]) if passes else 0.0
        return RiskGateMessage(
            event_id=str(qs.__dict__.get("match_id", "")),
            timestamp=_utcnow(),
            passes_risk_gate=passes,
            risk_reasons=reasons,
            data_quality_score=qs.data_quality,
            robustness_score=qs.robustness,
            liquidity_score=qs.liquidity,
            correlation_penalty=qs.exposure_penalty,
            max_allowed_stake_fraction=round(approved, 4),
        )


class DecisionAgent:
    """Produces BET / NO_BET / WATCH / REPRICE_REQUIRED."""

    def decide(self, qs: Any, edge_info: dict[str, float],
               risk: RiskGateMessage, state_msg: StateEngineMessage) -> FinalDecisionMessage:
        top_idx = int(np.argmax(qs.bet_score))
        from worldcup_prediction_engine import HOME, DRAW, AWAY
        selection = {0: HOME, 1: DRAW, 2: AWAY}[top_idx]
        score = float(qs.bet_score[top_idx])

        if risk.passes_risk_gate and score > 0:
            decision = "BET"
            follow_up = ["monitor_line_movement"]
        elif score > 0 and qs.confidence >= 0.35 and qs.robustness >= 0.3:
            decision = "WATCH"
            follow_up = ["monitor_line_movement", "wait_for_team_news"]
        elif edge_info["edge"] > 0 and qs.data_quality < 0.6:
            decision = "REPRICE_REQUIRED"
            follow_up = ["check_derivative_markets", "wait_for_team_news"]
        else:
            decision = "NO_BET"
            follow_up = []

        return FinalDecisionMessage(
            event_id="",
            timestamp=_utcnow(),
            decision=decision,
            selection=selection,
            odds=edge_info["decimal_odds"],
            model_probability=edge_info["model_probability"],
            market_probability=edge_info["market_probability"],
            edge=edge_info["edge"],
            final_bet_score=round(score, 4),
            kelly_fraction=round(float(qs.kelly_fraction[top_idx]), 4),
            approved_stake_fraction=risk.max_allowed_stake_fraction,
            reason_summary=(" | ".join(risk.risk_reasons) if risk.risk_reasons else "gates_passed"),
            required_follow_up=follow_up,
        )


# ---------------------------------------------------------------------------
# Learning / feedback metrics
# ---------------------------------------------------------------------------
def brier_score(probs: list[float], outcomes: list[int]) -> float:
    if not probs:
        return 0.0
    return float(np.mean([(p - o) ** 2 for p, o in zip(probs, outcomes)]))


def log_loss_score(probs: list[float], outcomes: list[int]) -> float:
    eps = 1e-12
    if not probs:
        return 0.0
    return float(-np.mean([o * math.log(max(p, eps)) + (1 - o) * math.log(max(1 - p, eps))
                           for p, o in zip(probs, outcomes)]))


def calibration_error(predicted: list[float], actual: list[int], bins: int = 10) -> float:
    if not predicted:
        return 0.0
    bucketed: dict[int, list[tuple[float, int]]] = {i: [] for i in range(bins)}
    for p, a in zip(predicted, actual):
        idx = min(bins - 1, int(p * bins))
        bucketed[idx].append((p, a))
    n = len(predicted)
    ece = 0.0
    for b in bucketed.values():
        if not b:
            continue
        avg_p = sum(p for p, _ in b) / len(b)
        avg_a = sum(a for _, a in b) / len(b)
        ece += (len(b) / n) * abs(avg_p - avg_a)
    return round(ece, 4)


def roi(profit: float, stakes: float) -> float:
    return round(profit / stakes, 4) if stakes else 0.0


def closing_line_value(model_p: float, open_odds: float, close_odds: float) -> float:
    """Simple CLV proxy: positive if closing odds are shorter than open odds
    in the direction of the model pick."""
    if open_odds <= 1.0 or close_odds <= 1.0:
        return 0.0
    open_implied = 1.0 / open_odds
    close_implied = 1.0 / close_odds
    return round(close_implied - open_implied, 4)


class LearningAgent:
    """Analyses audit log and recommends recalibration/retraining."""

    def __init__(self, audit_path: Path = AUDIT_PATH) -> None:
        self.audit_path = audit_path

    def load_recent(self, n: int = 200) -> list[dict[str, Any]]:
        if not self.audit_path.exists():
            return []
        lines = self.audit_path.read_text().strip().splitlines()
        records = [json.loads(line) for line in lines if line.strip()]
        return records[-n:]

    def analyse(self) -> dict[str, Any]:
        records = self.load_recent()
        bets = [r for r in records if r.get("decision", {}).get("decision") == "BET"]
        profits = []
        stakes = []
        probs = []
        outcomes = []
        for r in bets:
            actual = r.get("actual_outcome")
            sel = r["decision"]["selection"]
            odds = r["decision"]["odds"]
            stake = r["decision"]["approved_stake_fraction"]
            model_p = r["decision"]["model_probability"]
            if actual is None or odds <= 1.0:
                continue
            win = 1 if actual == sel else 0
            profit = stake * (odds - 1.0) * win - stake * (1 - win)
            profits.append(profit)
            stakes.append(stake)
            probs.append(model_p)
            outcomes.append(win)

        total_profit = sum(profits)
        total_stake = sum(stakes)
        return {
            "n_decisions": len(records),
            "n_bets": len(bets),
            "total_profit": round(total_profit, 4),
            "total_stake": round(total_stake, 4),
            "roi": roi(total_profit, total_stake),
            "brier": round(brier_score(probs, outcomes), 4),
            "log_loss": round(log_loss_score(probs, outcomes), 4),
            "calibration_error": round(calibration_error(probs, outcomes), 4),
            "recommendation": "recalibrate" if (total_stake and roi(total_profit, total_stake) < -0.1) else "monitor",
        }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
class ClosedLoop:
    def __init__(self, weights: dict[str, float], boosts: dict[str, Any],
                 cfg: Optional[dict[str, float]] = None) -> None:
        self.weights = weights
        self.boosts = boosts
        self.cfg = cfg or DEFAULT_RISK_CFG
        self.data_agent = DataIngestionAgent()
        self.feature_agent = FeatureEngineeringAgent()
        self.prediction_agent = PredictionAgent(weights, boosts)
        self.state_agent = StateEngineAgent()
        self.market_agent = MarketComparisonAgent()
        self.risk_agent = RiskGateAgent(self.cfg)
        self.decision_agent = DecisionAgent()
        self.learning_agent = LearningAgent()

    def run_event(self, match: Any, state: Any, universe: list[str],
                  open_bets: list[dict[str, Any]]) -> dict[str, Any]:
        from worldcup_prediction_engine import _predict_one
        market_msg = self.data_agent.ingest(match)
        features = self.feature_agent.build(match, state, universe)
        pred, per_model = _predict_one(state, match, universe, self.weights, self.boosts)
        pred_msg = self.prediction_agent.predict(state, match, universe)
        qs = self.state_agent.assessor.assess(match, pred, per_model, state, open_bets=open_bets)
        state_msg = self.state_agent.run(match, pred, per_model, state, open_bets)
        edge_info = self.market_agent.compare(match, float(qs.evolved_probs[int(np.argmax(qs.evolved_probs))]),
                                              pred_msg.selection)
        risk_msg = self.risk_agent.check(qs, edge_info, market_msg.market_depth)
        decision = self.decision_agent.decide(qs, edge_info, risk_msg, state_msg)
        decision.event_id = str(match.match_id)

        record = {
            "timestamp": _utcnow(),
            "event_id": str(match.match_id),
            "match": {"home": match.team_a, "away": match.team_b, "date": match.date},
            "market_snapshot": asdict(market_msg),
            "prediction": asdict(pred_msg),
            "state_engine": asdict(state_msg),
            "edge": edge_info,
            "risk_gate": asdict(risk_msg),
            "decision": asdict(decision),
            "features": features,
            "actual_outcome": getattr(match, "actual_outcome", None),
        }
        return record

    def run_backtest(self, history: list[Any], strategy: str = "balanced") -> dict[str, Any]:
        from worldcup_prediction_engine import TeamState, _universe, _fit_boosts
        universe = _universe(history)
        state = TeamState()
        open_bets: list[dict[str, Any]] = []
        decisions: list[dict[str, Any]] = []
        for m in history:
            rec = self.run_event(m, state, universe, open_bets)
            decisions.append(rec)
            if rec["decision"]["decision"] == "BET":
                open_bets.append({
                    "event_id": rec["event_id"],
                    "team_a": m.team_a,
                    "team_b": m.team_b,
                    "market": "1x2",
                    "selection": rec["decision"]["selection"],
                    "stake_fraction": rec["decision"]["approved_stake_fraction"],
                })
            state.update(m)
        return self._summarise_decisions(decisions)

    def _summarise_decisions(self, decisions: list[dict[str, Any]]) -> dict[str, Any]:
        total = len(decisions)
        bets = [d for d in decisions if d["decision"]["decision"] == "BET"]
        profits = []
        stakes = []
        for d in bets:
            actual = d.get("actual_outcome")
            odds = d["decision"]["odds"]
            stake = d["decision"]["approved_stake_fraction"]
            sel = d["decision"]["selection"]
            if actual is None or odds <= 1.0:
                continue
            win = 1 if actual == sel else 0
            profit = stake * (odds - 1.0) * win - stake * (1 - win)
            profits.append(profit)
            stakes.append(stake)
        total_profit = sum(profits)
        total_stake = sum(stakes)
        return {
            "total_events": total,
            "bets": len(bets),
            "no_bet": sum(1 for d in decisions if d["decision"]["decision"] == "NO_BET"),
            "watch": sum(1 for d in decisions if d["decision"]["decision"] == "WATCH"),
            "reprice": sum(1 for d in decisions if d["decision"]["decision"] == "REPRICE_REQUIRED"),
            "total_stake": round(total_stake, 4),
            "total_profit": round(total_profit, 4),
            "roi": roi(total_profit, total_stake),
        }

    def append_audit(self, record: dict[str, Any]) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with AUDIT_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")


DEFAULT_RISK_CFG = {
    "min_bet_score": 0.005,
    "min_confidence": 0.25,
    "min_robustness": 0.25,
    "min_data_quality": 0.35,
    "min_liquidity": 0.30,
    "min_vortex": 0.30,
    "max_exposure_penalty": 0.60,
    "min_edge_delta": 0.0,
}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="WC2026 closed-loop autonomous prediction backend")
    parser.add_argument("--mode", choices=["backtest", "loop", "analyse"], default="backtest")
    parser.add_argument("--strategy", default="balanced")
    parser.add_argument("--sleep", type=float, default=60.0)
    args = parser.parse_args(argv)

    sys.path.insert(0, str(REPO_ROOT / "scripts"))
    from worldcup_prediction_engine import (
        load_historical_matches, _fit_boosts, _universe, SAFE_DEFAULT_WEIGHTS, HISTORICAL_CSV
    )

    history = load_historical_matches(HISTORICAL_CSV)
    if not history:
        LOG.error("no history loaded")
        return 1

    universe = _universe(history)
    boosts = _fit_boosts(history, universe)
    weights = SAFE_DEFAULT_WEIGHTS
    active_path = DATA_DIR / "wc2026_active_model.json"
    if active_path.exists():
        try:
            aw = json.loads(active_path.read_text()).get("ensemble_weights")
            if isinstance(aw, dict) and aw:
                weights = aw
        except (OSError, ValueError):
            pass

    loop = ClosedLoop(weights, boosts)

    if args.mode == "backtest":
        summary = loop.run_backtest(history, strategy=args.strategy)
        print(json.dumps(summary, indent=2))
        return 0

    if args.mode == "analyse":
        print(json.dumps(loop.learning_agent.analyse(), indent=2))
        return 0

    # Continuous loop over fixtures
    from worldcup_prediction_engine import load_fixtures, FIXTURES_JSON, TeamState
    fixtures = load_fixtures(FIXTURES_JSON)
    if not fixtures:
        LOG.error("no fixtures for loop")
        return 1

    state = TeamState()
    for m in history:
        state.update(m)
    open_bets: list[dict[str, Any]] = []
    LOG.info("starting continuous closed loop over %d fixtures", len(fixtures))
    while True:
        for m in fixtures:
            rec = loop.run_event(m, state, universe, open_bets)
            loop.append_audit(rec)
            if rec["decision"]["decision"] == "BET":
                open_bets.append({
                    "event_id": rec["event_id"],
                    "team_a": m.team_a,
                    "team_b": m.team_b,
                    "market": "1x2",
                    "selection": rec["decision"]["selection"],
                    "stake_fraction": rec["decision"]["approved_stake_fraction"],
                })
                LOG.info("BET %s %s @ %.2f stake=%.4f", m.match_id,
                         rec["decision"]["selection"], rec["decision"]["odds"],
                         rec["decision"]["approved_stake_fraction"])
        LOG.info("learning: %s", loop.learning_agent.analyse())
        LOG.info("sleeping %.0fs", args.sleep)
        time.sleep(args.sleep)


if __name__ == "__main__":
    import sys
    raise SystemExit(main())
