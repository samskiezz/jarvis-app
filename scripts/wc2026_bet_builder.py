#!/usr/bin/env python3
"""WC2026 Bet Builder — the user-facing betting workflow.

Sits on top of worldcup_prediction_engine.py. The user supplies stake, number
of legs, strategy, market, and an odds source; this module selects the best
legs, prices three risk-spread variations (A=Mainline, B=Draw Protection,
C=Alternate Winner), and returns clean decision-focused output with an
advanced view underneath.

Honesty (hard rules, from spec):
  - Odds are blended MARKET odds, not guaranteed final bookmaker prices.
  - Mock/placeholder odds are LABELLED as such — never passed off as real.
  - The app works with no live odds API keys (manual / mock fallback).
  - No guaranteed-profit claims; a responsible-use message is always attached.

CLI:
  python3 scripts/wc2026_bet_builder.py --stake 90 --legs 4 --strategy balanced
  python3 scripts/wc2026_bet_builder.py --stake 50 --legs 3 --strategy value --odds-mode best
"""
from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"
BUILDER_OUT = DATA_DIR / "wc2026_bet_builder.json"

sys.path.insert(0, str(REPO_ROOT / "scripts"))

from worldcup_prediction_engine import (  # type: ignore
    HOME, DRAW, AWAY, Match, ModelPrediction, RiskAssessment,
    TeamState, STRATEGY_PRESETS, SAFE_DEFAULT_WEIGHTS,
    _predict_one, _fit_boosts, _universe, classify_treatment,
    load_historical_matches, load_fixtures, load_sandbox, _utcnow,
)

LOG = logging.getLogger("wc2026_bet_builder")
if not LOG.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(_h)
LOG.setLevel(logging.INFO)

RESPONSIBLE_USE = (
    "Bet sizing should be controlled. Use small stakes, avoid chasing losses, "
    "and treat model outputs as probabilistic, not guaranteed. This app does "
    "not guarantee betting profit."
)

TREATMENT_LABEL = {
    "LOCK": "Strong pick", "DRAW_HEDGE": "Protect the draw",
    "ROTATE": "Cover all realistic outcomes", "HEDGE": "Cover the likely two",
    "EXCLUDE": "Leave out",
}
RISK_LABEL = {"LOW": "Lower risk", "MEDIUM": "Balanced risk",
              "HIGH": "High risk", "EXTREME": "Too risky — excluded"}

STAKE_SPLITS = {
    "maximum_coverage": {"A": 0.34, "B": 0.33, "C": 0.33},
    "balanced": {"A": 0.50, "B": 0.30, "C": 0.20},
    "value": {"A": 0.60, "B": 0.25, "C": 0.15},
    "aggressive": {"A": 0.70, "B": 0.20, "C": 0.10},
    "safe": {"A": 0.45, "B": 0.35, "C": 0.20},
}

STRATEGY_FILTERS = {
    "safe": {"min_model_p": 0.55, "min_edge": 0.00, "max_legs": 4, "preset": "value"},
    "balanced": {"min_model_p": 0.42, "min_edge": -0.03, "max_legs": 6, "preset": "balanced"},
    "value": {"min_model_p": 0.40, "min_edge": 0.03, "max_legs": 5, "preset": "value", "require_positive_ev": True},
    "aggressive": {"min_model_p": 0.30, "min_edge": -0.10, "max_legs": 6, "preset": "maximum_coverage"},
    "maximum_coverage": {"min_model_p": 0.30, "min_edge": -0.20, "max_legs": 6, "preset": "maximum_coverage"},
}


# ---------------------------------------------------------------------------
# Pure betting math (spec formulas)
# ---------------------------------------------------------------------------
def calculate_multi_odds(odds: list[float]) -> float:
    result = 1.0
    for o in odds:
        result *= o
    return result


def calculate_return(stake: float, decimal_odds: float) -> float:
    return stake * decimal_odds


def calculate_profit(stake: float, decimal_odds: float) -> float:
    return calculate_return(stake, decimal_odds) - stake


def implied_probability(decimal_odds: float) -> float:
    return 1.0 / decimal_odds if decimal_odds > 0 else 0.0


def expected_value(model_probability: float, decimal_odds: float) -> float:
    return model_probability * decimal_odds - 1.0


def fair_bookmaker_probabilities(decimal_odds_by_outcome: dict[str, float]) -> dict[str, float]:
    raw = {o: (1.0 / d if d > 0 else 0.0) for o, d in decimal_odds_by_outcome.items()}
    total = sum(raw.values()) or 1.0
    return {o: v / total for o, v in raw.items()}


def blended_odds(bookmaker_odds: list[float], mode: str = "median") -> float:
    odds = sorted(o for o in bookmaker_odds if o and o > 1.0)
    if not odds:
        return 0.0
    if mode == "average":
        return sum(odds) / len(odds)
    if mode == "best":
        return max(odds)
    if mode == "conservative":
        idx = max(0, int(len(odds) * 0.25) - 1)
        return odds[idx]
    return statistics.median(odds)


def stake_split(total_stake: float, strategy: str) -> dict[str, float]:
    split = STAKE_SPLITS.get(strategy, STAKE_SPLITS["balanced"])
    return {k: round(total_stake * v, 2) for k, v in split.items()}


# ---------------------------------------------------------------------------
# Odds providers (abstraction; manual/mock always work without API keys)
# ---------------------------------------------------------------------------
class OddsProvider:
    name = "base"
    last_source = ""

    def fetch_match_odds(self, match: Match) -> Optional[dict[str, list[float]]]:
        raise NotImplementedError


class ManualOddsProvider(OddsProvider):
    name = "manual"

    def __init__(self, manual: dict[str, dict[str, float]]):
        self._manual = manual

    def fetch_match_odds(self, match: Match) -> Optional[dict[str, list[float]]]:
        row = self._manual.get(str(match.match_id))
        return {o: [float(v)] for o, v in row.items()} if row else None


class MockOddsProvider(OddsProvider):
    """Derives plausible odds from model probabilities. CLEARLY mock — used
    only when no real source is reachable, and always labelled mock."""
    name = "mock"

    def __init__(self, pred_lookup: dict[str, ModelPrediction], overround: float = 1.06):
        self._preds = pred_lookup
        self._overround = overround

    def fetch_match_odds(self, match: Match) -> Optional[dict[str, list[float]]]:
        pred = self._preds.get(str(match.match_id))
        if not pred:
            return None
        out = {}
        for o, p in ((HOME, pred.p_home), (DRAW, pred.p_draw), (AWAY, pred.p_away)):
            out[o] = [round(1.0 / (max(p, 1e-6) * self._overround), 2)]
        return out


class ScraperOddsProvider(OddsProvider):
    """Uses repo wc2026_odds_scraper. Falls to placeholder when books are
    unreachable (currently IP-blocked) — placeholder is flagged not-real."""
    name = "scraper"

    def fetch_match_odds(self, match: Match) -> Optional[dict[str, list[float]]]:
        try:
            from wc2026_odds_scraper import Fixture, scrape_espn  # type: ignore
            fx = Fixture(n=int(match.match_id) if str(match.match_id).isdigit() else 0,
                         home=match.team_a, away=match.team_b,
                         p_home=0.0, p_draw=0.0, p_away=0.0)
            # Call scrape_espn directly: it is the only reachable live source.
            # scrape_any would also try the IP-blocked books (8s timeouts each),
            # stalling the per-fixture loop; on an ESPN miss we yield to mock.
            bo = scrape_espn(fx)
            if bo is None:
                return None
            self.last_source = getattr(bo, "source", "espn_draftkings")
            return {HOME: [float(bo.home)], DRAW: [float(bo.draw)], AWAY: [float(bo.away)]}
        except Exception as exc:  # noqa: BLE001
            LOG.warning("scraper failed for %s vs %s: %s", match.team_a, match.team_b, exc)
            return None


class TheOddsApiProvider(OddsProvider):
    """Activates when an API key is present; otherwise returns None so the
    caller falls back to manual/mock (spec: app works without keys)."""
    name = "the_odds_api"

    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    def fetch_match_odds(self, match: Match) -> Optional[dict[str, list[float]]]:
        if not self.api_key:
            return None
        LOG.info("%s provider has a key but live fetch is not yet wired", self.name)
        return None


class OddsApiIoProvider(TheOddsApiProvider):
    name = "odds_api_io"


class OddsPapiProvider(TheOddsApiProvider):
    name = "odds_papi"


def resolve_odds_for(match: Match, providers: list[OddsProvider],
                     mode: str) -> tuple[dict[str, float], dict[str, float], bool, str]:
    for p in providers:
        raw = p.fetch_match_odds(match)
        if not raw:
            continue
        blended = {o: blended_odds(v, mode) for o, v in raw.items()}
        if not all(blended.get(o, 0) > 1.0 for o in (HOME, DRAW, AWAY)):
            continue
        source = getattr(p, "last_source", "") or p.name
        is_real = p.name != "mock" and source != "placeholder"
        breakdown = {o: round(blended[o], 2) for o in (HOME, DRAW, AWAY)}
        return blended, breakdown, is_real, source
    return {}, {}, False, "none"


# ---------------------------------------------------------------------------
# Bet Builder data structures
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class BetBuilderRequest:
    stake_amount: float
    stake_mode: str = "total_split"
    number_of_legs: int = 12
    strategy: str = "balanced"
    market: str = "1x2"
    odds_mode: str = "median"
    include_only_positive_ev: bool = False
    minimum_model_probability: float = 0.0
    minimum_edge: float = -1.0


@dataclass(frozen=True)
class BetLeg:
    match_id: str
    team_a: str
    team_b: str
    market: str
    selected_outcome: str
    model_probability: float
    blended_odds: float
    implied_probability: float
    fair_bookmaker_probability: float
    edge: Optional[float]
    expected_value: Optional[float]
    odds_are_real: bool
    odds_source: str
    treatment: str
    treatment_label: str
    reason: str


@dataclass(frozen=True)
class BetVariation:
    name: str
    purpose: str
    strategy: str
    stake: float
    legs: list[dict]
    combined_odds: float
    combined_model_probability: float
    bookmaker_implied_probability: float
    expected_value: float
    expected_value_dollars: float
    potential_return: float
    potential_profit: float
    risk_rating: str


@dataclass(frozen=True)
class BetBuilderOutput:
    request: dict
    selected_matches: list[str]
    excluded_matches: list[dict]
    variation_a: dict
    variation_b: dict
    variation_c: dict
    total_outlay: float
    best_case_return: float
    best_case_profit: float
    weighted_expected_value: float
    spread_coverage_score: float
    coverage_cost: int
    coverage_efficiency: float
    risk_rating: str
    odds_are_real: bool
    explanation: str
    warnings: list[str]
    responsible_use: str
    coverage_modes: list[dict] = field(default_factory=list)
    exploit_window: dict = field(default_factory=dict)
    recommendation: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Candidate evaluation + leg selection
# ---------------------------------------------------------------------------
@dataclass
class Candidate:
    match: Match
    pred: ModelPrediction
    risk: RiskAssessment
    blended: dict[str, float]
    breakdown: dict[str, float]
    odds_are_real: bool
    odds_source: str

    def outcome_prob(self, o: str) -> float:
        return self.pred.prob_of(o)

    def selection_score(self) -> float:
        top = self.risk.top_outcome
        odds = self.blended.get(top, 0.0)
        ev = expected_value(self.outcome_prob(top), odds) if odds > 1.0 else 0.0
        fair = fair_bookmaker_probabilities(self.blended) if self.blended else {}
        edge = (self.outcome_prob(top) - fair.get(top, 0.0)) if fair else 0.0
        ev_norm = max(min(ev, 1.0), -1.0)
        return (0.35 * self.outcome_prob(top) + 0.30 * ev_norm + 0.15 * edge
                + 0.10 * self.risk.confidence_margin - 0.10 * self.risk.risk_score)


def _is_already_played(m: Match) -> bool:
    """True if the fixture already has a verified actual result (server-side)."""
    try:
        from wc2026_db import actual_for as _af  # type: ignore
        return bool(_af(m.team_a, m.team_b))
    except Exception:  # noqa: BLE001
        return False


def build_candidates(matches: list[Match], weights: dict[str, float], strategy: str,
                     providers: list[OddsProvider], odds_mode: str,
                     warm_history: list[Match]) -> list[Candidate]:
    preset = STRATEGY_PRESETS[STRATEGY_FILTERS[strategy]["preset"]]
    # Only build candidates for UPCOMING fixtures — never bet on a played game.
    matches = [m for m in matches if not _is_already_played(m)]
    universe = _universe(warm_history + matches)
    # Skip the gradient-boosting proxies: fitting them (sklearn HistGBM) is the
    # only slow phase and dominates runtime under load; the analytical ensemble
    # + market odds are what drive coverage decisions here.
    boosts: dict = {}
    state = TeamState()
    for m in warm_history:
        state.update(m)
    cands: list[Candidate] = []
    for m in matches:
        pred, per_model = _predict_one(state, m, universe, weights, boosts)
        risk = classify_treatment(pred, per_model, m, preset)
        blended, breakdown, is_real, source = resolve_odds_for(m, providers, odds_mode)
        cands.append(Candidate(m, pred, risk, blended, breakdown, is_real, source))
    return cands


def select_best_legs(cands: list[Candidate], req: BetBuilderRequest) -> tuple[list[Candidate], list[dict]]:
    flt = STRATEGY_FILTERS[req.strategy]
    min_p = max(req.minimum_model_probability, flt["min_model_p"])
    min_edge = max(req.minimum_edge, flt["min_edge"]) if req.minimum_edge > -1 else flt["min_edge"]
    require_pos_ev = req.include_only_positive_ev or flt.get("require_positive_ev", False)
    eligible: list[Candidate] = []
    excluded: list[dict] = []
    for c in cands:
        top = c.risk.top_outcome
        p = c.outcome_prob(top)
        fair = fair_bookmaker_probabilities(c.blended) if c.blended else {}
        edge = (p - fair.get(top, 0.0)) if fair else None
        odds = c.blended.get(top, 0.0)
        ev = expected_value(p, odds) if odds > 1.0 else None
        reason = ""
        if c.risk.treatment == "EXCLUDE":
            reason = "model flagged too risky (excluded)"
        elif p < min_p:
            reason = f"model prob {p:.2f} < min {min_p:.2f}"
        elif edge is not None and edge < min_edge:
            reason = f"edge {edge:+.2f} < min {min_edge:+.2f}"
        elif require_pos_ev and (ev is None or ev <= 0):
            reason = "no positive expected value"
        if reason:
            excluded.append({"match_id": c.match.match_id,
                             "match": f"{c.match.team_a} vs {c.match.team_b}",
                             "reason": reason})
        else:
            eligible.append(c)
    eligible.sort(key=lambda c: ease_score(c), reverse=True)  # easiest mismatches first
    # UNIQUE-TEAM RULE: a team can appear at most ONCE per multi. Walk the
    # eligible games best-first; skip any fixture whose home OR away team is
    # already used (keeps the higher-scored fixture, rejects the weaker one).
    chosen: list[Candidate] = []
    used_teams: set[str] = set()
    for c in eligible:
        if len(chosen) >= req.number_of_legs:
            excluded.append({"match_id": c.match.match_id,
                             "match": f"{c.match.team_a} vs {c.match.team_b}",
                             "reason": "outside requested leg count"})
            continue
        ta, tb = c.match.team_a.strip().lower(), c.match.team_b.strip().lower()
        if ta in used_teams or tb in used_teams:
            dup = c.match.team_a if ta in used_teams else c.match.team_b
            excluded.append({"match_id": c.match.match_id,
                             "match": f"{c.match.team_a} vs {c.match.team_b}",
                             "reason": f"duplicate-team rule: {dup} already used in the slip"})
            continue
        chosen.append(c)
        used_teams.add(ta)
        used_teams.add(tb)
    return chosen, excluded


# ---------------------------------------------------------------------------
# Variation construction + pricing
# ---------------------------------------------------------------------------
def _variation_outcome(c: Candidate, slot: str) -> str:
    top, second, third = c.risk.top_outcome, c.risk.second_outcome, c.risk.third_outcome
    t = c.risk.treatment
    if slot == "A":
        return top
    if slot == "B":
        if t in ("DRAW_HEDGE", "ROTATE"):
            return DRAW if top != DRAW else second
        if t == "HEDGE":
            return second
        return top
    if t == "ROTATE":
        return third
    if t == "DRAW_HEDGE":
        return second if second != DRAW else third
    return top


# Double-chance markets for Slip B draw protection: back 'favourite OR draw'.
DC_HOME_DRAW = "1X"   # home win or draw
DC_AWAY_DRAW = "X2"   # away win or draw


def _double_chance_odds(blended: dict[str, float], fav: str) -> float:
    """Decimal odds for 'favourite OR draw' derived from the 1X2 prices.
    DC = (o_fav * o_draw) / (o_fav + o_draw); 0.0 if either side is unpriced.
    Always LOWER than the straight favourite price, since it covers two
    outcomes — that is exactly what makes Slip B genuine draw protection."""
    of, od = blended.get(fav, 0.0), blended.get(DRAW, 0.0)
    if of <= 1.0 or od <= 1.0:
        return 0.0
    return (of * od) / (of + od)


def _leg_for(c: Candidate, outcome: str, market: str) -> BetLeg:
    fair_all = fair_bookmaker_probabilities(c.blended) if c.blended else {}
    if outcome in (DC_HOME_DRAW, DC_AWAY_DRAW):
        fav = HOME if outcome == DC_HOME_DRAW else AWAY
        odds = _double_chance_odds(c.blended, fav)
        p = c.outcome_prob(fav) + c.outcome_prob(DRAW)          # wins if fav OR draw
        fair_p = (fair_all.get(fav, 0.0) + fair_all.get(DRAW, 0.0)) if fair_all else 0.0
    else:
        odds = c.blended.get(outcome, 0.0)
        p = c.outcome_prob(outcome)
        fair_p = fair_all.get(outcome, 0.0) if fair_all else 0.0
    edge = (p - fair_p) if fair_all else None
    ev = expected_value(p, odds) if odds > 1.0 else None
    return BetLeg(
        match_id=c.match.match_id, team_a=c.match.team_a, team_b=c.match.team_b,
        market=market, selected_outcome=outcome, model_probability=round(p, 4),
        blended_odds=round(odds, 2),
        implied_probability=round(implied_probability(odds), 4) if odds > 0 else 0.0,
        fair_bookmaker_probability=round(fair_p, 4),
        edge=round(edge, 4) if edge is not None else None,
        expected_value=round(ev, 4) if ev is not None else None,
        odds_are_real=c.odds_are_real, odds_source=c.odds_source,
        treatment=c.risk.treatment,
        treatment_label=TREATMENT_LABEL.get(c.risk.treatment, c.risk.treatment),
        reason=c.risk.treatment,
    )


# Per-strategy limits on how many of the SAME 12 games get changed in B/C.
CHANGE_LIMITS = {
    "safe": {"draw": 1, "alt": 1},
    "balanced": {"draw": 3, "alt": 3},
    "value": {"draw": 2, "alt": 2},
    "aggressive": {"draw": 2, "alt": 4},
    "maximum_coverage": {"draw": 5, "alt": 5},
}

# Coverage-mode thresholds (honest per-game logic — never duplicate a pick).
STRONG_LEAN_PROB = 0.62      # a clear favourite: A only, no real B/C cover
DRAW_COVER_PROB = 0.27       # draw is a live alternate
DRAW_HEDGE_FLOOR = 0.18      # min market-implied draw prob to FORCE a Slip-B hedge
VOLATILE_GAP = 0.08          # top two within this -> three-way volatile

MODE_LABEL = {
    "STRONG_LEAN": "Strong lean — no cover",
    "MAIN_PLUS_DRAW": "Main + draw cover",
    "THREE_WAY_VOLATILE": "Three-way volatile",
    "MAIN_PLUS_SECOND": "Main + second",
}


def coverage_mode_for(c: "Candidate") -> dict:
    """Per-game coverage mode. Returns {mode, a, b, c} where b/c are outcome
    keys (H/D/A) or None when there is NO genuine alternate edge (-> 'No cover').
    Never returns a duplicate of A for B or C.

    Uses MARKET-IMPLIED (devigged odds) probabilities to judge how close a game
    is — the model's ensemble is over-confident (peaked), which would mark every
    game a strong lean. The market is the honest arbiter of 'genuinely close',
    so coverage lands on the games that actually warrant it. Falls back to model
    probabilities when no real odds are available.
    """
    if c.blended and all(c.blended.get(o, 0) > 1.0 for o in (HOME, DRAW, AWAY)):
        fair = fair_bookmaker_probabilities(c.blended)
        ph, pd, pa = fair.get(HOME, 0.0), fair.get(DRAW, 0.0), fair.get(AWAY, 0.0)
    else:
        ph, pd, pa = c.outcome_prob(HOME), c.outcome_prob(DRAW), c.outcome_prob(AWAY)
    outs = sorted([("H", ph), ("D", pd), ("A", pa)], key=lambda kv: kv[1], reverse=True)
    main, second, third = outs[0], outs[1], outs[2]
    gap = main[1] - second[1]
    draw_p = pd  # market-implied (or model fallback) draw probability

    if main[1] >= STRONG_LEAN_PROB:
        return {"mode": "STRONG_LEAN", "a": main[0], "b": None, "c": None}
    if draw_p >= DRAW_COVER_PROB and main[0] != DRAW:
        return {"mode": "MAIN_PLUS_DRAW", "a": main[0], "b": DRAW,
                "c": (second[0] if second[0] != DRAW else None)}
    if gap <= VOLATILE_GAP:
        return {"mode": "THREE_WAY_VOLATILE", "a": main[0], "b": second[0], "c": third[0]}
    return {"mode": "MAIN_PLUS_SECOND", "a": main[0], "b": second[0], "c": None}


def draw_hedge_priority(c: Candidate) -> float:
    """How much a game deserves a draw switch in Variation B."""
    return (c.risk.draw_probability + c.risk.entropy + c.risk.model_disagreement
            - c.risk.top_probability)


def alternate_priority(c: Candidate) -> float:
    """How much a game deserves an alternate-outcome switch in Variation C."""
    second_p = c.outcome_prob(c.risk.second_outcome)
    return (second_p + c.risk.entropy + c.risk.model_disagreement
            - c.risk.top_probability)


def build_variation(name: str, purpose: str, picks: dict[str, str],
                    chosen: list[Candidate], stake: float, strategy: str,
                    market: str, changed_ids: Optional[set] = None) -> BetVariation:
    """Build a full multi over the SAME `chosen` games (same order), using the
    per-game outcome in `picks` (keyed by match_id)."""
    changed_ids = changed_ids or set()
    legs = [_leg_for(c, picks[c.match.match_id], market) for c in chosen]
    odds_list = [l.blended_odds for l in legs if l.blended_odds > 1.0]
    combined = calculate_multi_odds(odds_list) if odds_list else 0.0
    combined_p = 1.0
    for l in legs:
        combined_p *= max(l.model_probability, 1e-9)
    implied = implied_probability(combined) if combined > 0 else 0.0
    ev = (combined_p * combined - 1.0) if combined > 0 else 0.0
    ret = calculate_return(stake, combined) if combined > 0 else 0.0
    n_changed = len(changed_ids)
    rating = "High" if n_changed >= 4 else ("Medium" if n_changed >= 1 or combined > 50 else "Low")
    return BetVariation(
        name=name, purpose=purpose, strategy=strategy, stake=round(stake, 2),
        legs=[asdict(l) for l in legs], combined_odds=round(combined, 2),
        combined_model_probability=round(combined_p, 6),
        bookmaker_implied_probability=round(implied, 6),
        expected_value=round(ev, 4), expected_value_dollars=round(stake * ev, 2),
        potential_return=round(ret, 2), potential_profit=round(ret - stake, 2),
        risk_rating=rating,
    )


def calculate_spread_set_summary(chosen: list[Candidate], va: BetVariation,
                                 vb: BetVariation, vc: BetVariation,
                                 picks_abc: tuple[dict, dict, dict]) -> dict[str, Any]:
    total_outlay = round(va.stake + vb.stake + vc.stake, 2)
    returns = [va.potential_return, vb.potential_return, vc.potential_return]
    best_case_return = max(returns) if returns else 0.0
    weighted_ev = round(va.expected_value_dollars + vb.expected_value_dollars
                        + vc.expected_value_dollars, 2)
    a_picks, b_picks, c_picks = picks_abc
    covered_paths = 0
    for c in chosen:
        mid = c.match.match_id
        outs = {a_picks.get(mid), b_picks.get(mid), c_picks.get(mid)}
        covered_paths += len([o for o in outs if o])
    spread_cov = round(max(va.combined_model_probability, vb.combined_model_probability,
                           vc.combined_model_probability), 6) if chosen else 0.0
    coverage_eff = round(spread_cov / covered_paths, 6) if covered_paths else 0.0
    return {
        "total_outlay": total_outlay, "best_case_return": round(best_case_return, 2),
        "best_case_profit": round(best_case_return - total_outlay, 2),
        "weighted_expected_value": weighted_ev, "spread_coverage_score": spread_cov,
        "coverage_cost": covered_paths, "coverage_efficiency": coverage_eff,
    }


# ---------------------------------------------------------------------------
# Tournament Exploit Engine — scan all fixtures, find the easy-game window.
# ---------------------------------------------------------------------------
def _fav_prob(c: Candidate) -> float:
    """Favourite (max) probability — market-implied if real odds, else model."""
    if c.blended and all(c.blended.get(o, 0) > 1.0 for o in (HOME, DRAW, AWAY)):
        f = fair_bookmaker_probabilities(c.blended)
        return max(f.get(HOME, 0), f.get(DRAW, 0), f.get(AWAY, 0))
    return max(c.outcome_prob(HOME), c.outcome_prob(DRAW), c.outcome_prob(AWAY))


def _draw_prob_market(c: Candidate) -> float:
    if c.blended and all(c.blended.get(o, 0) > 1.0 for o in (HOME, DRAW, AWAY)):
        return fair_bookmaker_probabilities(c.blended).get(DRAW, 0.0)
    return c.outcome_prob(DRAW)


def _is_group(c: Candidate) -> bool:
    return "group" in (c.match.stage or "").lower()


def ease_score(c: Candidate) -> float:
    """How 'easy'/exploitable a fixture is: strong favourite, low draw risk,
    group-stage bonus. Used to rank the mismatch pool."""
    return _fav_prob(c) - 0.5 * _draw_prob_market(c) + (0.05 if _is_group(c) else -0.10)


def exploit_window_score(cands: list[Candidate]) -> dict[str, Any]:
    """Tournament-phase exploit window: HIGH during group stage with many
    mismatches, LOW once knockouts/balanced games dominate."""
    group = [c for c in cands if _is_group(c)]
    strong = [c for c in cands if _fav_prob(c) >= STRONG_LEAN_PROB]
    draw_risky = [c for c in cands if _draw_prob_market(c) >= 0.30]
    knockout = [c for c in cands if not _is_group(c)]
    score = (len(strong) * 1.0 + len(group) * 0.3
             - len(draw_risky) * 0.5 - len(knockout) * 1.0)
    if knockout and not group:
        level = "LOW"
    elif len(strong) >= 8 and not knockout:
        level = "HIGH"
    elif len(strong) >= 4:
        level = "MEDIUM"
    else:
        level = "LOW"
    reasons = [
        f"{len(group)} group-stage fixtures available",
        f"{len(strong)} strong favourite mismatches found",
        f"{len(draw_risky)} fixtures carry elevated draw risk",
    ]
    reasons.append(f"{len(knockout)} knockout fixtures — extra-time/penalty volatility"
                   if knockout else "no knockout volatility yet — long-leg multis still viable")
    return {"score": round(score, 2), "level": level, "reasons": reasons,
            "n_group": len(group), "n_strong": len(strong),
            "n_draw_risk": len(draw_risky), "n_knockout": len(knockout)}


def build_bet_builder(req: BetBuilderRequest, fixtures: list[Match],
                      warm_history: list[Match], weights: dict[str, float],
                      providers: list[OddsProvider]) -> BetBuilderOutput:
    cands = build_candidates(fixtures, weights, req.strategy, providers, req.odds_mode, warm_history)
    window = exploit_window_score(cands)
    # Unique-team pool, ranked easiest-first, up to the requested leg count.
    chosen, excluded = select_best_legs(cands, req)
    odds_real = bool(chosen) and all(c.odds_are_real for c in chosen)

    if req.stake_mode == "per_variation":
        sa = sb = sc = req.stake_amount
    else:
        split = stake_split(req.stake_amount, req.strategy)
        sa, sb, sc = split["A"], split["B"], split["C"]

    # Honest per-game coverage mode. B/C get a REAL alternate only where the
    # probabilities justify it; otherwise the leg locks to A and is shown as
    # "No cover" (never a duplicate pick). a/b/c here are outcome keys or None.
    coverage_modes: list[dict] = []
    # VARIABLE-LENGTH SLIPS (Exploit Engine). A = the genuinely-strong legs
    # (safest). C = the full requested stretch (more legs, for upside). B = A's
    # legs with draw swaps. Knockout window caps the safe leg count.
    # C (stretch) = the full requested unique-team pool (easiest-first). A (safe)
    # = that pool minus its riskiest tail legs, so the safe slip is genuinely
    # shorter/safer than the stretch. Knockout window caps the safe leg count
    # harder. B then layers draw protection onto A's legs where a draw is live.
    c_legs = chosen
    stretch_margin = 2 if len(chosen) >= 5 else (1 if len(chosen) >= 3 else 0)
    safe_cap = min(5, len(chosen)) if window["level"] == "LOW" else (len(chosen) - stretch_margin)
    a_legs = chosen[:max(3, min(safe_cap, len(chosen)))]
    a_ids = {c.match.match_id for c in a_legs}

    a_picks: dict[str, str] = {}
    b_picks: dict[str, str] = {}
    c_picks: dict[str, str] = {}
    b_changed: set = set()
    c_changed: set = set()
    for c in c_legs:
        mid = c.match.match_id
        cm = coverage_mode_for(c)
        a_out, b_out, c_out = cm["a"], cm["b"], cm["c"]
        in_a = mid in a_ids
        if in_a:
            a_picks[mid] = a_out
            b_picks[mid] = a_out          # B starts identical to A; the double-chance
                                          # protection pass below hedges the drawish legs.
        c_picks[mid] = c_out or a_out
        if c_out and c_out != a_out:
            c_changed.add(mid)
        coverage_modes.append({
            "match_id": mid, "n": c.match.match_id, "team_a": c.match.team_a, "team_b": c.match.team_b,
            "mode": cm["mode"], "mode_label": MODE_LABEL.get(cm["mode"], cm["mode"]),
            "in_a": in_a,
            "a": a_out if in_a else None,                 # None + not in_a => "Stretch only"
            "b": None,                                    # set by the double-chance pass below
            "c": c_out or a_out,                          # C always carries the bet
            "c_is_alt": bool(c_out and c_out != a_out),
            "a_odds": round(c.blended.get(a_out, 0.0), 2) if a_out else None,
            "b_odds": None,
            "c_odds": round(c.blended.get(c_out or a_out, 0.0), 2),
            "watch_link": None,
        })

    # Slip B = genuine DRAW PROTECTION via double chance. On its most draw-prone
    # legs we back 'favourite OR draw' (1X / X2) instead of the straight
    # favourite. Double-chance odds are LOWER than the straight pick (it covers
    # two outcomes), so B is genuinely SAFER than A — higher hit-rate, lower
    # return — never a longshot and never an exact duplicate of A. Protect the
    # most draw-prone legs (ranked by draw_hedge_priority) up to the per-strategy
    # limit, preferring genuinely-live draws, and patch the coverage rows.
    draw_limit = CHANGE_LIMITS.get(req.strategy, CHANGE_LIMITS["balanced"])["draw"]
    cm_by_id = {r["match_id"]: r for r in coverage_modes}
    ranked_draw = sorted(a_legs, key=draw_hedge_priority, reverse=True)

    def _protect_with_dc(c: Candidate) -> bool:
        """Double-chance protect a Slip-B leg: back 'favourite OR draw'."""
        mid = c.match.match_id
        if mid in b_changed:
            return False
        fav = a_picks.get(mid)
        if fav not in (HOME, AWAY):                   # only a home/away fav is DC-able
            return False
        dc_odds = _double_chance_odds(c.blended, fav)
        if dc_odds <= 1.0:                            # draw or fav unpriced
            return False
        b_picks[mid] = DC_HOME_DRAW if fav == HOME else DC_AWAY_DRAW
        b_changed.add(mid)
        row = cm_by_id.get(mid)
        if row is not None:
            row["b"] = b_picks[mid]
            row["b_odds"] = round(dc_odds, 2)
        return True

    # Preferred pass: protect the most draw-prone legs whose draw is genuinely
    # live (>= floor), up to the per-strategy limit.
    for c in ranked_draw:
        if len(b_changed) >= draw_limit:
            break
        if _draw_prob_market(c) < DRAW_HEDGE_FLOOR:   # draw too dead to bother
            continue
        _protect_with_dc(c)

    # Fallback: an all-strong-favourite pool may have no draw clearing the floor.
    # Never show Slip B as an exact duplicate of A — double-chance protect the
    # single most draw-prone leg so B is always a distinct, safer slip.
    if not b_changed:
        for c in ranked_draw:
            if _protect_with_dc(c):
                break

    va = build_variation("Slip A — Safest Income",
                         f"{len(a_legs)} strongest unique-team mismatch legs",
                         a_picks, a_legs, sa, req.strategy, req.market)
    vb = build_variation("Slip B — Draw Protection",
                         f"Slip A's {len(a_legs)} legs; {len(b_changed)} favourite(s) double-chance "
                         f"protected (win-or-draw) — safer, lower odds than A",
                         b_picks, a_legs, sb, req.strategy, req.market, b_changed)
    vc = build_variation("Slip C — Long-Leg Stretch",
                         f"{len(c_legs)} legs — {max(0,len(c_legs)-len(a_legs))} extra mismatch game(s) for upside",
                         c_picks, c_legs, sc, req.strategy, req.market, c_changed)
    summary = calculate_spread_set_summary(c_legs, va, vb, vc, (a_picks, b_picks, c_picks))

    # Validation: A and B share the same games/order; C is a superset that
    # starts with A's legs (the stretch only ADDS legs, never repeats a team).
    a_ids_list = [l["match_id"] for l in va.legs]
    assert a_ids_list == [l["match_id"] for l in vb.legs], "A and B must share legs"
    assert [l["match_id"] for l in vc.legs][:len(a_ids_list)] == a_ids_list, \
        "C must extend A's legs"

    n_dup = sum(1 for e in excluded if "duplicate-team" in e["reason"])
    n_strong = sum(1 for c in chosen if _fav_prob(c) >= STRONG_LEAN_PROB)
    recommendation = {
        "requested_legs": req.number_of_legs,
        "strong_unique_legs": n_strong,
        "recommended_safe_legs": len(a_legs),
        "stretch_legs": len(c_legs),
        "rejected_duplicate_team": n_dup,
        "exploit_window": window["level"],
        "text": (
            f"{req.number_of_legs} legs requested. Jarvis found {n_strong} genuinely "
            f"strong unique-team legs. Slip A uses the {len(a_legs)} safest; Slip C "
            f"stretches to {len(c_legs)} for upside. "
            + (f"Knockout/low-window: safe legs capped at {safe_cap}. "
               if window["level"] == "LOW" else "")
            + (f"{n_dup} fixture(s) rejected by the unique-team rule." if n_dup else "")
        ),
    }

    warnings = [
        "A repeated pick is not protection — Jarvis only shows a second or third leg "
        "where the probability gap genuinely justifies it; otherwise it reads 'No cover'.",
        "Coverage only helps when the alternate outcomes are genuinely live. For a heavy "
        "favourite the duplicate is removed and marked 'No cover'.",
        "Correct score is high variance and is kept separate from the main 1X2 engine.",
    ]
    if not odds_real:
        warnings.insert(0, "ODDS ARE MOCK/PLACEHOLDER — live bookmaker odds are not "
                           "reachable from this host. Returns shown are illustrative, "
                           "not real bookmaker prices.")
    else:
        warnings.insert(0, "Odds are blended market odds, not guaranteed final bookmaker prices.")
    if not chosen:
        warnings.append("No legs met the strategy filters — try a looser strategy or more fixtures.")

    risk_rank = {"Low": 0, "Medium": 1, "High": 2}
    overall_risk = max([va.risk_rating, vb.risk_rating, vc.risk_rating],
                       key=lambda r: risk_rank.get(r, 1)) if chosen else "n/a"

    explanation = (
        f"{req.strategy.title()} strategy, {len(chosen)}-leg slip. Variation A backs the "
        f"model's top path; B protects against draws (a recurring WC group-stage outcome); "
        f"C covers the alternate/upset path on the riskiest games. Coverage cost "
        f"{summary['coverage_cost']} paths; efficiency {summary['coverage_efficiency']}."
    )

    return BetBuilderOutput(
        request=asdict(req), selected_matches=[c.match.match_id for c in chosen],
        excluded_matches=excluded, variation_a=asdict(va), variation_b=asdict(vb),
        variation_c=asdict(vc), total_outlay=summary["total_outlay"],
        best_case_return=summary["best_case_return"], best_case_profit=summary["best_case_profit"],
        weighted_expected_value=summary["weighted_expected_value"],
        spread_coverage_score=summary["spread_coverage_score"],
        coverage_cost=summary["coverage_cost"], coverage_efficiency=summary["coverage_efficiency"],
        risk_rating=overall_risk, odds_are_real=odds_real, explanation=explanation,
        warnings=warnings, responsible_use=RESPONSIBLE_USE,
        coverage_modes=coverage_modes, exploit_window=window,
        recommendation=recommendation,
    )


def save_bet_builder(out: BetBuilderOutput) -> None:
    out_dict = asdict(out)
    # Attach official SBS watch links to every selected leg (best-effort;
    # never blocks the save if SBS is unreachable).
    try:
        from sbs_watch_links import attach_watch_links_to_bet_builder_output  # type: ignore
        out_dict = attach_watch_links_to_bet_builder_output(out_dict)
    except Exception as exc:  # noqa: BLE001
        LOG.warning("SBS watch links unavailable: %s", exc)
    BUILDER_OUT.write_text(json.dumps({
        "verified": True,
        "source": "scripts/wc2026_bet_builder.py — three-spread bet builder over "
                  "worldcup_prediction_engine predictions; odds via provider "
                  "abstraction (mock/placeholder labelled when books unreachable); "
                  "official SBS watch links attached per leg.",
        "generated_at": _utcnow(), "output": out_dict,
    }, indent=2, ensure_ascii=False))
    LOG.info("wrote bet builder -> %s", BUILDER_OUT)


def print_bet_builder(out: BetBuilderOutput) -> None:
    print("\n" + "=" * 64)
    print("  BEST BET BUILDER RESULT")
    print("=" * 64)
    print(f"  Strategy: {out.request['strategy']}   Legs: {len(out.selected_matches)}   "
          f"Odds real: {out.odds_are_real}")
    print(f"  Total stake (outlay): ${out.total_outlay}")
    for v in (out.variation_a, out.variation_b, out.variation_c):
        print("-" * 64)
        print(f"  {v['name']}  —  {v['purpose']}")
        print(f"    stake ${v['stake']}  combined odds {v['combined_odds']}  "
              f"return ${v['potential_return']}  profit ${v['potential_profit']}")
        for l in v["legs"]:
            print(f"      {l['team_a']} v {l['team_b']}: {l['selected_outcome']} "
                  f"@ {l['blended_odds']}  ({l['treatment_label']})")
    print("-" * 64)
    print(f"  Single-slip (A) model probability: {out.variation_a['combined_model_probability']*100:.1f}%")
    print(f"  Three-spread coverage estimate:    {out.spread_coverage_score*100:.1f}%")
    print(f"  Best-case return: ${out.best_case_return}   best-case profit: ${out.best_case_profit}")
    print(f"  Coverage cost: {out.coverage_cost} paths   risk: {out.risk_rating}")
    if out.excluded_matches:
        print(f"  Excluded: {len(out.excluded_matches)} games (see JSON for reasons)")
    print("-" * 64)
    for w in out.warnings:
        print(f"  ⚠ {w}")
    print(f"  • {out.responsible_use}")
    print("=" * 64 + "\n")


def build_from_params(stake: float = 100.0, stake_mode: str = "total_split",
                      legs: int = 10, strategy: str = "balanced", market: str = "1x2",
                      odds_mode: str = "median", positive_ev_only: bool = False,
                      sandbox: bool = False) -> BetBuilderOutput:
    """Build a bet-builder result from explicit params (used by CLI + the live
    on-demand endpoint). Fast: no boosting proxies; ESPN/SBS are cached."""
    legs = max(2, min(int(legs), 20))
    if strategy not in STAKE_SPLITS:
        strategy = "balanced"
    if sandbox:
        warm, matches = [], load_sandbox()
    else:
        warm = load_historical_matches()
        matches = load_fixtures() or load_sandbox()
    universe = _universe(warm + matches)
    boosts: dict = {}
    state = TeamState()
    for m in warm:
        state.update(m)
    pred_lookup: dict[str, ModelPrediction] = {}
    for m in matches:
        pred, _ = _predict_one(state, m, universe, SAFE_DEFAULT_WEIGHTS, boosts)
        pred_lookup[str(m.match_id)] = pred
    providers: list[OddsProvider] = [ScraperOddsProvider(), MockOddsProvider(pred_lookup)]
    req = BetBuilderRequest(
        stake_amount=float(stake), stake_mode=stake_mode, number_of_legs=legs,
        strategy=strategy, market=market, odds_mode=odds_mode,
        include_only_positive_ev=positive_ev_only,
    )
    return build_bet_builder(req, matches, warm, SAFE_DEFAULT_WEIGHTS, providers)


def build_output_dict(**params) -> dict:
    """build_from_params + SBS watch links, returned as a plain dict (for the
    live endpoint). Never raises — returns {error: ...} on failure."""
    try:
        out = build_from_params(**params)
        d = asdict(out)
        try:
            from sbs_watch_links import (attach_watch_links_to_bet_builder_output,
                                         refresh_watch_links)
            attach_watch_links_to_bet_builder_output(d, refresh_watch_links())
        except Exception as exc:  # noqa: BLE001
            LOG.warning("watch-link attach failed: %s", exc)
        return d
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="WC2026 Bet Builder")
    parser.add_argument("--stake", type=float, default=90.0)
    parser.add_argument("--stake-mode", choices=["total_split", "per_variation"], default="total_split")
    parser.add_argument("--legs", type=int, default=12)
    parser.add_argument("--strategy", choices=list(STAKE_SPLITS), default="balanced")
    parser.add_argument("--market", choices=["1x2", "over_under", "btts", "correct_score"], default="1x2")
    parser.add_argument("--odds-mode", choices=["median", "average", "best", "conservative", "manual"], default="median")
    parser.add_argument("--positive-ev-only", action="store_true")
    parser.add_argument("--mode", choices=["sandbox", "fixtures"], default="sandbox")
    args = parser.parse_args(argv)

    out = build_from_params(
        stake=args.stake, stake_mode=args.stake_mode, legs=args.legs,
        strategy=args.strategy, market=args.market, odds_mode=args.odds_mode,
        positive_ev_only=args.positive_ev_only, sandbox=(args.mode == "sandbox"),
    )
    save_bet_builder(out)
    print_bet_builder(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
