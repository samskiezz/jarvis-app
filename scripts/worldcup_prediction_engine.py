#!/usr/bin/env python3
"""WC2026 prediction + three-spread coverage engine.

Purpose (NOT a "pick the winner" app):
  1. Load historical football matches, build leakage-free pre-match features.
  2. Run a stack of models, blend them into one probability per match.
  3. Classify each match's risk -> treatment (LOCK / DRAW_HEDGE / ROTATE /
     HEDGE / EXCLUDE), explained.
  4. Generate EXACTLY THREE bet-slip variations (A/B/C) that spread risk:
       A = Mainline (best probability path)
       B = Draw Protection (covers the draw-heavy WC pattern)
       C = Alternate Winner (covers upset / other-winner path on risky games)
  5. Backtest single-top-pick accuracy vs three-spread COVERAGE separately,
     PLUS a betting-value score — three different things:
       - single-pick is correct only if its top outcome == actual.
       - three-spread is COVERED if the actual outcome appears in {A, B, C}.
       - betting value rewards coverage that is cheap (coverage_efficiency).
  6. Honesty: coverage is NOT predictive accuracy. 100% coverage by covering
     all three 1X2 outcomes is coverage-engineering. Never claim guaranteed
     success. Flag in-sample results. Warn on stake-cost. The model is NOT
     allowed to "cheat" by full-rotating every game — caps + a coverage
     priority ranking limit full rotations and draw hedges per slip set.

Self-contained: reuses repo helpers when importable (scripts/wc2026_predictor.py,
scripts/wc2026_db.py) and falls back to local implementations so `--mode
sandbox` always runs offline.

CLI:
  python3 scripts/worldcup_prediction_engine.py --mode sandbox
  python3 scripts/worldcup_prediction_engine.py --mode backtest --runs 10000
  python3 scripts/worldcup_prediction_engine.py --strategy balanced
  python3 scripts/worldcup_prediction_engine.py --historical X.csv --fixtures Y.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import statistics
import random
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

import numpy as np

try:
    from wc2026_quantum_state import QuantumAssessor, QuantumState, HOME as QS_HOME, DRAW as QS_DRAW, AWAY as QS_AWAY
except Exception:  # noqa: BLE001
    QuantumAssessor = None  # type: ignore
    QuantumState = None  # type: ignore

LOG = logging.getLogger("wc2026_engine")
if not LOG.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(_h)
LOG.setLevel(logging.INFO)

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"
HISTORICAL_CSV = DATA_DIR / "wc2026_training_history.csv"
FIXTURES_JSON = DATA_DIR / "wc2026_fixtures_all.json"

REGISTRY_OUT = DATA_DIR / "wc2026_model_registry.json"
PREDICTIONS_OUT = DATA_DIR / "wc2026_predictions_output.json"
BACKTEST_OUT = DATA_DIR / "wc2026_backtest_results.json"
SLIPS_OUT = DATA_DIR / "wc2026_bet_slips.json"
PREDICTIONS_CSV = DATA_DIR / "wc2026_predictions.csv"
VALUE_BETS_PATH = DATA_DIR / "wc2026_value_bets.json"

HOME, DRAW, AWAY = "H", "D", "A"
CLASSES = (HOME, DRAW, AWAY)

# --- Slip-engine constants (user-specified; the anti-"coverage machine" fix) ---
MAX_FULL_ROTATES = 2          # max full 3-way rotations per slip set
MAX_DRAW_HEDGES = 4           # max draw hedges per slip set
MIN_THIRD_OUTCOME_PROB = 0.22  # 3rd outcome must clear this to enter a rotation
MIN_DRAW_PROB_FOR_HEDGE = 0.23
MIN_LOCK_PROB = 0.68
MAX_DRAW_PROB_FOR_LOCK = 0.18
LOCK_MARGIN = 0.25            # top-vs-second gap needed to lock
DRAW_PROTECT_TOP_CEILING = 0.55  # protect draws when top pick < this
DRAW_PROTECT_GAP = 0.25       # ... and top-vs-draw gap < this

USE_MAJORITY_PICK = False     # set by --majority-pick
WEIGHT_OBJECTIVE = "logloss"  # set by --weight-objective
MARKET_ALPHA = 0.0            # set by --market-alpha; 0 disables market blending

# Quantum-inspired wrapper thresholds (tuneable)
# Fine-tuned via 100k backtest grid search to maximise value + accuracy.
QUANTUM_CFG = {
    "lock_min_score": 0.01,
    "lock_min_confidence": 0.45,
    "lock_min_robustness": 0.40,
    "exclude_max_confidence": 0.20,
}

SLIP_PURPOSE = {
    "A": "Mainline — best probability path",
    "B": "Draw Protection — covers the draw-heavy World Cup pattern",
    "C": "Alternate Winner — covers upset / other-winner path on risky games",
}

# ---------------------------------------------------------------------------
# Repo helper reuse (with self-contained fallbacks for standalone operation)
# ---------------------------------------------------------------------------
sys.path.insert(0, str(REPO_ROOT / "scripts"))

try:
    from wc2026_predictor import (  # type: ignore
        BASELINE_ELO as _REPO_BASELINE_ELO,
        DEFAULT_ELO as _REPO_DEFAULT_ELO,
        Elo as _RepoElo,
        pick_wdl as _repo_pick_wdl,
        remove_vig as _repo_remove_vig,
        kelly_size as _repo_kelly_size,
    )
    _HAVE_REPO_PREDICTOR = True
except Exception:  # noqa: BLE001
    _HAVE_REPO_PREDICTOR = False
    _REPO_BASELINE_ELO = {}
    _REPO_DEFAULT_ELO = 1500.0

try:
    from wc2026_db import actual_for as _repo_actual_for  # type: ignore
    _HAVE_REPO_DB = True
except Exception:  # noqa: BLE001
    _HAVE_REPO_DB = False

DEFAULT_ELO = float(_REPO_DEFAULT_ELO)


def pick_wdl(p_home: float, p_draw: float, p_away: float) -> str:
    if _HAVE_REPO_PREDICTOR:
        return _repo_pick_wdl(p_home, p_draw, p_away)
    if not (p_home >= 0 and p_draw >= 0 and p_away >= 0):
        return HOME
    max_hp = max(p_home, p_away)
    if p_draw >= 0.22 and p_draw >= max_hp - 0.15:
        return DRAW
    return HOME if p_home >= p_away else AWAY


def majority_top_pick(per_model: dict[str, tuple]) -> str:
    votes: dict[str, int] = {}
    for name, vec in per_model.items():
        if vec is None:
            continue
        top = max(zip(CLASSES, vec), key=lambda kv: kv[1])[0]
        votes[top] = votes.get(top, 0) + 1
    if not votes:
        return HOME
    return max(votes.items(), key=lambda kv: kv[1])[0]


def remove_vig(book_odds: dict[str, float]) -> dict[str, float]:
    if _HAVE_REPO_PREDICTOR:
        return _repo_remove_vig(book_odds)
    raw = {k: 1.0 / float(v) for k, v in book_odds.items() if float(v) > 0}
    total = sum(raw.values()) or 1.0
    return {k: v / total for k, v in raw.items()}


def kelly_size(model_prob: float, book_odds: float, bankroll: float,
               *, fraction: float = 0.25) -> float:
    if _HAVE_REPO_PREDICTOR:
        return _repo_kelly_size(model_prob, book_odds, bankroll, fraction=fraction)
    if book_odds <= 1.0 or bankroll <= 0:
        return 0.0
    b = book_odds - 1.0
    p = min(max(model_prob, 0.0), 1.0)
    edge = (b * p - (1 - p)) / b
    return max(0.0, bankroll * fraction * edge) if edge > 0 else 0.0


# ---------------------------------------------------------------------------
# 1. Dataclasses
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Match:
    match_id: str
    date: str
    team_a: str  # home
    team_b: str  # away
    competition: str = ""
    stage: str = ""
    neutral: bool = True
    home_goals: Optional[int] = None
    away_goals: Optional[int] = None
    odds: Optional[dict] = None  # {"home","draw","away"} decimal, or None
    matchday: int = 1
    venue: str = ""

    @property
    def is_played(self) -> bool:
        return self.home_goals is not None and self.away_goals is not None

    @property
    def is_group_stage(self) -> bool:
        return (self.stage or "").lower().startswith("group")

    @property
    def actual_outcome(self) -> Optional[str]:
        if not self.is_played:
            return None
        if self.home_goals > self.away_goals:  # type: ignore[operator]
            return HOME
        if self.home_goals < self.away_goals:  # type: ignore[operator]
            return AWAY
        return DRAW


@dataclass(frozen=True)
class ModelPrediction:
    match_id: str
    p_home: float
    p_draw: float
    p_away: float
    top_pick: str
    per_model: dict[str, tuple] = field(default_factory=dict)

    @property
    def vector(self) -> tuple[float, float, float]:
        return (self.p_home, self.p_draw, self.p_away)

    def prob_of(self, outcome: str) -> float:
        return {HOME: self.p_home, DRAW: self.p_draw, AWAY: self.p_away}[outcome]


@dataclass(frozen=True)
class RiskAssessment:
    match_id: str
    top_outcome: str
    second_outcome: str
    third_outcome: str
    top_probability: float
    draw_probability: float
    confidence_margin: float
    entropy: float
    model_disagreement: float
    risk_score: float
    coverage_priority: float
    risk_level: str   # LOW / MEDIUM / HIGH / EXTREME
    treatment: str    # LOCK / DRAW_HEDGE / ROTATE / HEDGE / EXCLUDE


@dataclass(frozen=True)
class SpreadSelection:
    match_id: str
    team_a: str
    team_b: str
    treatment: str
    variation_a: Optional[str]
    variation_b: Optional[str]
    variation_c: Optional[str]
    p_home: float
    p_draw: float
    p_away: float
    coverage_cost: int          # unique outcome paths across A/B/C (0 if excluded)
    coverage_probability: float  # P(one of the covered outcomes occurs)
    coverage_efficiency: float   # coverage_probability / coverage_cost
    edge: Optional[float]        # model_p(top) - fair_book_p(top), if odds
    expected_value: Optional[float]  # EV of top pick at book odds, if odds
    reason: str


@dataclass(frozen=True)
class BacktestRow:
    match_id: str
    date: str
    team_a: str
    team_b: str
    final_score: Optional[str]
    actual_outcome: Optional[str]
    p_team_a_win: float
    p_draw: float
    p_team_b_win: float
    top_pick: str
    treatment: str
    variation_a: Optional[str]
    variation_b: Optional[str]
    variation_c: Optional[str]
    coverage_cost: int
    single_correct: Optional[bool]
    spread_covered: Optional[bool]
    entropy: float
    model_disagreement: float
    confidence_margin: float
    in_sample: bool


@dataclass(frozen=True)
class BacktestSummary:
    matches_tested: int
    single_top_pick_accuracy: float
    three_spread_coverage: float
    betting_value_score: float      # 0..1, coverage efficiency (cheap coverage = good)
    uplift: float
    avg_coverage_cost: float
    single_4_match_slip_success: float
    three_spread_4_match_slip_success: float
    single_full_ticket_success: float
    three_spread_full_ticket_success: float
    treatment_breakdown: dict[str, int]
    bootstrap_runs: int
    in_sample: bool
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 2. Data loading
# ---------------------------------------------------------------------------
# EMBEDDED_SANDBOX — kept for offline regression (DO NOT DELETE).
EMBEDDED_SANDBOX: list[dict[str, Any]] = [
    {"match_id": "sb1", "date": "2026-06-11", "team_a": "Mexico", "team_b": "South Africa", "neutral": True, "home_goals": 2, "away_goals": 0, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb2", "date": "2026-06-11", "team_a": "South Korea", "team_b": "Czechia", "neutral": True, "home_goals": 2, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb3", "date": "2026-06-12", "team_a": "Canada", "team_b": "Bosnia and Herzegovina", "neutral": True, "home_goals": 1, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb4", "date": "2026-06-12", "team_a": "United States", "team_b": "Paraguay", "neutral": True, "home_goals": 4, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb5", "date": "2026-06-13", "team_a": "Brazil", "team_b": "Morocco", "neutral": True, "home_goals": 1, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb6", "date": "2026-06-13", "team_a": "Qatar", "team_b": "Switzerland", "neutral": True, "home_goals": 1, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb7", "date": "2026-06-13", "team_a": "Australia", "team_b": "Türkiye", "neutral": True, "home_goals": 2, "away_goals": 0, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb8", "date": "2026-06-14", "team_a": "Germany", "team_b": "Curaçao", "neutral": True, "home_goals": 7, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb9", "date": "2026-06-14", "team_a": "Netherlands", "team_b": "Japan", "neutral": True, "home_goals": 2, "away_goals": 2, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb10", "date": "2026-06-15", "team_a": "Spain", "team_b": "Cabo Verde", "neutral": True, "home_goals": 0, "away_goals": 0, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb11", "date": "2026-06-16", "team_a": "France", "team_b": "Senegal", "neutral": True, "home_goals": 3, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb12", "date": "2026-06-17", "team_a": "Argentina", "team_b": "Algeria", "neutral": True, "home_goals": 3, "away_goals": 0, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb13", "date": "2026-06-17", "team_a": "Portugal", "team_b": "DR Congo", "neutral": True, "home_goals": 1, "away_goals": 1, "competition": "WC2026", "stage": "Group"},
    {"match_id": "sb14", "date": "2026-06-17", "team_a": "England", "team_b": "Croatia", "neutral": True, "home_goals": 4, "away_goals": 2, "competition": "WC2026", "stage": "Group"},
]


def _row_to_match(row: dict[str, Any], idx: int) -> Optional[Match]:
    try:
        hg = row.get("home_goals", row.get("hg"))
        ag = row.get("away_goals", row.get("ag"))
        hg = int(hg) if hg not in (None, "") else None
        ag = int(ag) if ag not in (None, "") else None
        neutral_raw = row.get("neutral", 1)
        neutral = bool(int(neutral_raw)) if str(neutral_raw).strip().lstrip("-").isdigit() else bool(neutral_raw)
        return Match(
            match_id=str(row.get("match_id") or row.get("n") or f"m{idx}"),
            date=str(row.get("date", "")),
            team_a=str(row.get("team_a") or row.get("home") or "").strip(),
            team_b=str(row.get("team_b") or row.get("away") or "").strip(),
            competition=str(row.get("competition", "")),
            stage=str(row.get("stage", "")),
            neutral=neutral, home_goals=hg, away_goals=ag,
        )
    except (ValueError, TypeError) as exc:
        LOG.warning("skipping malformed row %s: %s", idx, exc)
        return None


def load_historical_matches(csv_path: Path = HISTORICAL_CSV) -> list[Match]:
    if not csv_path.exists():
        LOG.warning("historical CSV not found: %s", csv_path)
        return []
    out: list[Match] = []
    with csv_path.open() as fh:
        for i, row in enumerate(csv.DictReader(fh)):
            m = _row_to_match(row, i)
            if m and m.team_a and m.team_b and m.is_played:
                out.append(m)
    out.sort(key=lambda m: m.date)
    return out


def _load_fixture_odds() -> dict[str, dict]:
    """Load de-vigged book odds from the value-bets file keyed by match n."""
    odds: dict[str, dict] = {}
    if not VALUE_BETS_PATH.exists():
        return odds
    try:
        doc = json.loads(VALUE_BETS_PATH.read_text())
        for vb in doc.get("value_bets", []):
            n = str(vb.get("match_n"))
            decimal = vb.get("decimal_odds")
            if n and decimal:
                odds[n] = {
                    "home": float(decimal["home"]),
                    "draw": float(decimal["draw"]),
                    "away": float(decimal["away"]),
                }
    except (OSError, ValueError, KeyError, TypeError) as exc:
        LOG.warning("fixture odds read failed: %s", exc)
    return odds


def _load_roster_strength() -> dict[str, float]:
    """Load a static roster-strength proxy from player profiles.

    Uses player-level caps, club minutes, position weight, and a coarse
    league-tier multiplier.  No key-absentee penalty is applied here —
    absentees are handled only for upcoming fixtures so walk-forward backtests
    do not leak future injury/news information.
    """
    path = DATA_DIR / "wc2026_player_profiles_enriched.json"
    strength: dict[str, float] = {}
    if not path.exists():
        return strength

    tier1 = {"premier league", "la liga", "bundesliga", "serie a", "ligue 1"}
    tier15 = {
        "primeira liga", "eredivisie", "belgian pro league", "scottish premiership",
        "brasileirão", "liga mx", "mls", "major league soccer", "saudi pro league",
        "championship", "super lig", "russian premier league", "austrian bundesliga",
        "danish superliga", "swiss super league", "ligue 2", "serie b", "la liga 2",
        "2.bundesliga",
    }

    def _league_mult(league: str) -> float:
        l = (league or "").strip().lower()
        if l in tier1:
            return 1.0
        if l in tier15:
            return 0.85
        return 0.70

    pos_w = {"GK": 0.95, "DEF": 1.0, "MID": 1.08, "FWD": 1.15}

    try:
        doc = json.loads(path.read_text())
        by_team: dict[str, list[float]] = {}
        for pl in doc.get("players", []):
            country = str(pl.get("country") or "").strip()
            if not country:
                continue
            caps = int(pl.get("caps") or 0)
            minutes = int(pl.get("form_2025_26", {}).get("club_minutes_25_26") or 0)
            pos = str(pl.get("position") or "MID").upper()
            league = pl.get("form_2025_26", {}).get("league") or ""
            value = (caps + 1) * math.log1p(minutes + 1) * pos_w.get(pos, 1.0) * _league_mult(league)
            by_team.setdefault(country, []).append(max(value, 0.0))
        for team in doc.get("teams", []):
            country = str(team.get("country") or "").strip()
            if not country:
                continue
            values = sorted(by_team.get(country, []), reverse=True)
            if not values:
                # fallback to team-level coarse proxy
                caps = float(team.get("total_caps") or 0)
                top5 = float(team.get("top_5_league_players") or 0)
                squad = float(team.get("squad_size") or 11)
                values = [max(0.1, math.log1p(caps / max(squad, 1)) * (1.0 + top5 / max(squad, 1)))]
            # Sum of the strongest 11 (profiles are 11 per team); use mean to stay scale-robust.
            top11 = values[:11]
            baseline = statistics.mean(top11) if top11 else 0.1
            # Age seasoning: peak around 27-28.
            avg_age = float(team.get("avg_age") or 27.0)
            age_factor = max(0.7, 1.0 - abs(avg_age - 27.5) / 15.0)
            strength[country] = max(0.1, baseline * age_factor)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        LOG.warning("roster strength load failed: %s", exc)
    return strength


_ROSTER_STRENGTH = _load_roster_strength()


def _load_tracking_features() -> dict[str, dict[str, Any]]:
    """Load recent vision-derived team signatures from the tracking DB/JSON."""
    path = DATA_DIR / "wc2026_tracking_features.json"
    signatures: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return signatures
    try:
        doc = json.loads(path.read_text())
        by_team: dict[str, list[dict]] = {}
        for mid, rec in doc.get("matches", {}).items():
            home = rec.get("home")
            away = rec.get("away")
            feats = rec.get("features", {})
            rhythmic = feats.get("rhythmic", {}).get("overall", {})
            player = feats.get("player", {}).get("teams", {})
            for side, team in (("home", home), ("away", away)):
                if not team:
                    continue
                possession = rhythmic.get(f"possession_{side}", 0.5)
                territory = player.get(side, {}).get("avg_x", 0.5)
                transitions = rhythmic.get("transition_rate", 0.1)
                by_team.setdefault(team, []).append({
                    "possession": possession,
                    "territory": territory,
                    "transition_rate": transitions,
                })
        for team, recs in by_team.items():
            n = len(recs)
            signatures[team] = {
                "matches": n,
                "possession": sum(r["possession"] for r in recs) / n,
                "territory": sum(r["territory"] for r in recs) / n,
                "transition_rate": sum(r["transition_rate"] for r in recs) / n,
            }
    except (OSError, ValueError, TypeError, KeyError) as exc:
        LOG.warning("tracking features load failed: %s", exc)
    return signatures


_TEAM_TRACKING = _load_tracking_features()


def load_fixtures(fixtures_path: Path = FIXTURES_JSON,
                  exclude_played: bool = False) -> list[Match]:
    if not fixtures_path.exists():
        LOG.warning("fixtures JSON not found: %s", fixtures_path)
        return []
    try:
        doc = json.loads(fixtures_path.read_text())
    except (OSError, ValueError) as exc:
        LOG.warning("fixtures read failed: %s", exc)
        return []
    out: list[Match] = []
    placeholders = ("winner ", "runner-up ", "3rd ", "loser ", "tbd")
    fixture_odds = _load_fixture_odds()
    today = datetime.now(timezone.utc).date()
    for m in doc.get("matches", []):
        home = str(m.get("home") or "").strip()
        away = str(m.get("away") or "").strip()
        if not home or not away:
            continue
        if any(home.lower().startswith(p) or away.lower().startswith(p) for p in placeholders):
            continue
        if exclude_played:
            if m.get("played"):
                continue
            try:
                if datetime.fromisoformat(str(m.get("date") or "")).date() < today:
                    continue
            except (ValueError, TypeError):
                pass
        n = str(m.get("n") or m.get("match_id") or home + away)
        out.append(Match(
            match_id=n,
            date=str(m.get("date") or (m.get("kickoff_iso") or "")[:10]),
            team_a=home, team_b=away, competition="WC2026",
            stage=str(m.get("stage", "")), neutral=True,
            home_goals=None, away_goals=None,
            odds=fixture_odds.get(n),
            matchday=int(m.get("matchday", 1) or 1),
            venue=str(m.get("venue", "")),
        ))
    return out


def load_sandbox() -> list[Match]:
    return [m for m in (_row_to_match(r, i) for i, r in enumerate(EMBEDDED_SANDBOX)) if m]


# ---------------------------------------------------------------------------
# Team-state tracker (leakage-free): Elo + rolling form, updated AFTER eval
# ---------------------------------------------------------------------------
def _parse_date(d: Optional[str]) -> Optional[datetime]:
    if not d:
        return None
    try:
        return datetime.strptime(d[:10], "%Y-%m-%d")
    except ValueError:
        return None


class TeamState:
    def __init__(self) -> None:
        if _HAVE_REPO_PREDICTOR:
            self.elo = _RepoElo(ratings=dict(_REPO_BASELINE_ELO))
        else:
            self.elo = None
            self._ratings: dict[str, float] = {}
        self._tournament_ratings: dict[str, float] = {}
        self._form: dict[str, list[float]] = {}
        self._form_dates: dict[str, list[datetime]] = {}
        self._goals_for: dict[str, list[int]] = {}
        self._goals_against: dict[str, list[int]] = {}
        self._results: dict[str, list[str]] = {}  # H/D/A result sequence
        self._last_match_date: dict[str, datetime] = {}
        self._h2h: dict[tuple[str, str], list[str]] = {}  # keyed by (home, away)

    def rating(self, team: str) -> float:
        if self.elo is not None:
            return self.elo.get(team)
        return self._ratings.get(team, DEFAULT_ELO)

    def tournament_rating(self, team: str) -> float:
        return self._tournament_ratings.get(team, DEFAULT_ELO)

    def expected_home(self, home: str, away: str) -> float:
        diff = self.rating(home) - self.rating(away)
        return 1.0 / (1.0 + 10.0 ** (-diff / 400.0))

    def form(self, team: str) -> float:
        pts = self._form.get(team, [])
        if not pts:
            return 0.5
        return min(1.0, (sum(pts[-5:]) / len(pts[-5:])) / 3.0)

    def weighted_form(self, team: str, half_life_days: float = 90.0) -> float:
        pts = self._form.get(team, [])
        dates = self._form_dates.get(team, [])
        if not pts or not dates or len(pts) != len(dates):
            return 0.5
        now = dates[-1]
        decay = lambda dta: 0.5 ** ((now - dta).days / half_life_days) if (now - dta).days >= 0 else 1.0
        weights = [decay(d) for d in dates]
        wsum = sum(weights) or 1.0
        avg = sum(p * w for p, w in zip(pts, weights)) / wsum
        return min(1.0, avg / 3.0)

    def avg_goals_for(self, team: str) -> float:
        g = self._goals_for.get(team, [])
        return sum(g[-5:]) / len(g[-5:]) if g else 1.2

    def avg_goals_against(self, team: str) -> float:
        g = self._goals_against.get(team, [])
        return sum(g[-5:]) / len(g[-5:]) if g else 1.2

    def goal_trend(self, team: str) -> float:
        """Recent goal difference per game minus season average."""
        gf = self._goals_for.get(team, [])
        ga = self._goals_against.get(team, [])
        if not gf or not ga:
            return 0.0
        recent = [(gf[i] - ga[i]) for i in range(-5, 0) if i + len(gf) >= 0]
        all_diff = [gf[i] - ga[i] for i in range(len(gf))]
        return (sum(recent) / len(recent)) - (sum(all_diff) / len(all_diff)) if recent else 0.0

    def win_rate(self, team: str, n: int = 5) -> float:
        r = self._results.get(team, [])
        if not r:
            return 1.0 / 3.0
        recent = r[-n:]
        return recent.count(HOME) / len(recent)

    def draw_rate(self, team: str, n: int = 5) -> float:
        r = self._results.get(team, [])
        if not r:
            return 1.0 / 3.0
        recent = r[-n:]
        return recent.count(DRAW) / len(recent)

    def rest_days(self, team: str, current_date: Optional[str] = None) -> float:
        last = self._last_match_date.get(team)
        cur = _parse_date(current_date) if current_date else None
        if not last or not cur:
            return 7.0
        return max(0.0, (cur - last).days)

    def h2h_home_win_rate(self, home: str, away: str, n: int = 5) -> float:
        h2h = self._h2h.get((home, away), [])
        if not h2h:
            return 1.0 / 3.0
        recent = h2h[-n:]
        return recent.count(HOME) / len(recent)

    def update(self, m: Match) -> None:
        if not m.is_played:
            return
        hg, ag = m.home_goals, m.away_goals  # type: ignore[assignment]
        if self.elo is not None:
            self.elo.update(m.team_a, m.team_b, hg, ag, competition="worldcup")
        else:
            exp = self.expected_home(m.team_a, m.team_b)
            score = 1.0 if hg > ag else (0.5 if hg == ag else 0.0)
            delta = 40.0 * (score - exp)
            self._ratings[m.team_a] = self.rating(m.team_a) + delta
            self._ratings[m.team_b] = self.rating(m.team_b) - delta
        # Tournament-specific Elo with smaller K
        t_exp = 1.0 / (1.0 + 10.0 ** (-(self.tournament_rating(m.team_a) - self.tournament_rating(m.team_b)) / 400.0))
        t_score = 1.0 if hg > ag else (0.5 if hg == ag else 0.0)
        t_delta = 25.0 * (t_score - t_exp)
        self._tournament_ratings[m.team_a] = self.tournament_rating(m.team_a) + t_delta
        self._tournament_ratings[m.team_b] = self.tournament_rating(m.team_b) - t_delta
        ha = 3.0 if hg > ag else (1.0 if hg == ag else 0.0)
        aa = 3.0 if ag > hg else (1.0 if hg == ag else 0.0)
        mdate = _parse_date(m.date)
        self._form.setdefault(m.team_a, []).append(ha)
        self._form.setdefault(m.team_b, []).append(aa)
        if mdate:
            self._form_dates.setdefault(m.team_a, []).append(mdate)
            self._form_dates.setdefault(m.team_b, []).append(mdate)
        self._goals_for.setdefault(m.team_a, []).append(int(hg))
        self._goals_against.setdefault(m.team_a, []).append(int(ag))
        self._goals_for.setdefault(m.team_b, []).append(int(ag))
        self._goals_against.setdefault(m.team_b, []).append(int(hg))
        self._results.setdefault(m.team_a, []).append(
            HOME if hg > ag else (DRAW if hg == ag else AWAY))
        self._results.setdefault(m.team_b, []).append(
            AWAY if hg > ag else (DRAW if hg == ag else HOME))
        if mdate:
            self._last_match_date[m.team_a] = mdate
            self._last_match_date[m.team_b] = mdate
        self._h2h.setdefault((m.team_a, m.team_b), []).append(
            HOME if hg > ag else (DRAW if hg == ag else AWAY))

    def rank_of(self, team: str, universe: Sequence[str]) -> int:
        ordered = sorted(set(universe) | {team}, key=lambda t: -self.rating(t))
        return ordered.index(team) + 1


# ---------------------------------------------------------------------------
# 3. Model stack — each returns (p_home, p_draw, p_away) summing to 1
# ---------------------------------------------------------------------------
def _norm3(h: float, d: float, a: float) -> tuple[float, float, float]:
    h, d, a = max(h, 1e-9), max(d, 1e-9), max(a, 1e-9)
    s = h + d + a
    return (h / s, d / s, a / s)


def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * lam ** k / math.factorial(k)


def elo_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    e = state.expected_home(m.team_a, m.team_b)
    draw = max(0.12, 0.26 * (1.0 - 2.0 * abs(e - 0.5)))
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def elo_draw_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    """Bradley-Terry-Davidson draw term."""
    alpha_a = 10.0 ** (state.rating(m.team_a) / 400.0)
    alpha_b = 10.0 ** (state.rating(m.team_b) / 400.0)
    geo = 0.9 * math.sqrt(alpha_a * alpha_b)
    denom = alpha_a + alpha_b + geo
    return _norm3(alpha_a / denom, geo / denom, alpha_b / denom)


def fifa_rank_model(state: TeamState, m: Match, *, universe: Sequence[str] = (), **_: Any) -> tuple[float, float, float]:
    uni = universe or [m.team_a, m.team_b]
    gap = (state.rank_of(m.team_b, uni) - state.rank_of(m.team_a, uni)) / 10.0
    e = 1.0 / (1.0 + math.exp(-gap))
    draw = 0.24
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def rank_draw_model(state: TeamState, m: Match, *, universe: Sequence[str] = (), **_: Any) -> tuple[float, float, float]:
    uni = universe or [m.team_a, m.team_b]
    gap = (state.rank_of(m.team_b, uni) - state.rank_of(m.team_a, uni)) / 10.0
    e = 1.0 / (1.0 + math.exp(-gap))
    draw = 0.30 * (1.0 - 2.0 * abs(e - 0.5)) + 0.16
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def _goal_lambdas(state: TeamState, m: Match) -> tuple[float, float]:
    diff = (state.rating(m.team_a) - state.rating(m.team_b)) / 400.0
    lam_h = math.exp(0.15 + 1.6 * diff)
    lam_a = math.exp(0.15 - 1.6 * diff)
    return float(np.clip(lam_h, 0.05, 8.0)), float(np.clip(lam_a, 0.05, 8.0))


def poisson_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    lam_h, lam_a = _goal_lambdas(state, m)
    ph = pd = pa = 0.0
    for i in range(9):
        for j in range(9):
            p = _poisson_pmf(i, lam_h) * _poisson_pmf(j, lam_a)
            if i > j:
                ph += p
            elif i == j:
                pd += p
            else:
                pa += p
    return _norm3(ph, pd, pa)


def _dc_tau(hg: int, ag: int, lam_h: float, lam_a: float, rho: float) -> float:
    if hg == 0 and ag == 0:
        return 1.0 - lam_h * lam_a * rho
    if hg == 0 and ag == 1:
        return 1.0 + lam_h * rho
    if hg == 1 and ag == 0:
        return 1.0 + lam_a * rho
    if hg == 1 and ag == 1:
        return 1.0 - rho
    return 1.0


def _dc_grid(state: TeamState, m: Match, rho: float) -> tuple[float, float, float]:
    lam_h, lam_a = _goal_lambdas(state, m)
    ph = pd = pa = 0.0
    for i in range(9):
        for j in range(9):
            p = _poisson_pmf(i, lam_h) * _poisson_pmf(j, lam_a) * _dc_tau(i, j, lam_h, lam_a, rho)
            if i > j:
                ph += p
            elif i == j:
                pd += p
            else:
                pa += p
    return _norm3(ph, pd, pa)


def most_likely_score(state: TeamState, m: Match, *, outcome: Optional[str] = None,
                      max_goals: int = 6) -> tuple[int, int]:
    """Most-likely scoreline = argmax cell of the Poisson x Dixon-Coles grid.

    Replaces round(lam_h)-round(lam_a), which produced absurd lines like 7-0.
    Lambdas are clamped to a realistic range for the DISPLAYED score only
    (W/D/L probabilities use the full lambdas).

    If `outcome` (H/D/A) is given, the modal cell is restricted to that outcome
    class so the displayed score never contradicts the pick (e.g. pick=A must
    show an away-win scoreline, not a 1-1 draw).
    """
    lam_h, lam_a = _goal_lambdas(state, m)
    lam_h = min(lam_h, 3.3)
    lam_a = min(lam_a, 3.3)

    def cls(i: int, j: int) -> str:
        return HOME if i > j else (AWAY if i < j else DRAW)

    best, best_p = None, -1.0
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            if outcome and cls(i, j) != outcome:
                continue
            p = _poisson_pmf(i, lam_h) * _poisson_pmf(j, lam_a) * _dc_tau(i, j, lam_h, lam_a, -0.08)
            if p > best_p:
                best_p, best = p, (i, j)
    if best is None:  # outcome impossible in grid (shouldn't happen) — fallback
        return (1, 1) if outcome == DRAW else ((1, 0) if outcome == HOME else (0, 1))
    return best


def dixon_coles_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    return _dc_grid(state, m, rho=-0.08)


def dixon_coles_heavy_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    rho = -0.16 if m.is_group_stage else -0.10
    ph, pd, pa = _dc_grid(state, m, rho=rho)
    pd = min(0.45, pd * 1.20)
    return _norm3(ph, pd, pa)


class _BoostProxy:
    """Gradient-boosting proxy (sklearn HistGradientBoosting). xgb/lgbm/cat
    are not installed in this env, so these are honest, clearly-labelled
    gradient-boosted stand-ins on leakage-free pre-match features."""

    def __init__(self, label: str, seed: int,
                 max_iter: int = 120, max_depth: int = 4, learning_rate: float = 0.08) -> None:
        self.label = label
        self.seed = seed
        self.max_iter = max_iter
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.model = None
        self.classes_: list[str] = []

    def fit(self, X: np.ndarray, y: list[str]) -> None:
        if self.max_iter <= 0:
            self.model = None
            return
        if len(set(y)) < 2 or len(y) < 30:
            return
        try:
            from sklearn.ensemble import HistGradientBoostingClassifier
            self.model = HistGradientBoostingClassifier(
                max_iter=self.max_iter, max_depth=self.max_depth,
                learning_rate=self.learning_rate, random_state=self.seed)
            self.model.fit(X, y)
            self.classes_ = list(self.model.classes_)
        except Exception as exc:  # noqa: BLE001
            LOG.warning("%s proxy fit failed: %s", self.label, exc)
            self.model = None

    def predict(self, feat: np.ndarray) -> Optional[tuple[float, float, float]]:
        if self.model is None:
            return None
        proba = self.model.predict_proba(feat.reshape(1, -1))[0]
        pm = {c: float(p) for c, p in zip(self.classes_, proba)}
        return _norm3(pm.get(HOME, 1e-9), pm.get(DRAW, 1e-9), pm.get(AWAY, 1e-9))


def _venue_country(venue: str) -> str:
    if not venue:
        return ""
    city = venue.split(",")[-1].strip().lower()
    if city in ("mexico city", "zapopan", "guadalupe"):
        return "mexico"
    if city in ("toronto", "vancouver"):
        return "canada"
    if city in ("arlington", "kansas city", "foxborough", "miami gardens", "santa clara",
                "philadelphia", "seattle", "atlanta", "east rutherford", "houston", "inglewood"):
        return "usa"
    return ""


def _team_country(team: str) -> str:
    mapping = {
        "mexico": "mexico", "canada": "canada", "united states": "usa", "usa": "usa",
        "costa rica": "costa rica", "honduras": "honduras", "panama": "panama",
    }
    return mapping.get(team.lower().strip(), "")


def _features(state: TeamState, m: Match, universe: Sequence[str]) -> np.ndarray:
    home_rank = state.rank_of(m.team_a, universe)
    away_rank = state.rank_of(m.team_b, universe)
    stage = (m.stage or "").lower()
    is_group = 1.0 if stage.startswith("group") else 0.0
    is_knockout = 1.0 if any(s in stage for s in ("round", "quarter", "semi", "final")) else 0.0
    venue_country = _venue_country(m.venue)
    home_country = _team_country(m.team_a)
    away_country = _team_country(m.team_b)
    home_venue_adv = 1.0 if (home_country and home_country == venue_country) else 0.0
    away_venue_adv = 1.0 if (away_country and away_country == venue_country) else 0.0
    return np.array([
        state.rating(m.team_a) - state.rating(m.team_b),
        state.tournament_rating(m.team_a) - state.tournament_rating(m.team_b),
        away_rank - home_rank,
        state.form(m.team_a) - state.form(m.team_b),
        state.weighted_form(m.team_a) - state.weighted_form(m.team_b),
        1.0 if m.neutral else 0.0,
        state.avg_goals_for(m.team_a) - state.avg_goals_for(m.team_b),
        state.avg_goals_against(m.team_a) - state.avg_goals_against(m.team_b),
        state.goal_trend(m.team_a) - state.goal_trend(m.team_b),
        state.win_rate(m.team_a) - state.win_rate(m.team_b),
        state.draw_rate(m.team_a) + state.draw_rate(m.team_b),
        math.log(max(home_rank, 1)),
        math.log(max(away_rank, 1)),
        (state.rest_days(m.team_b, m.date) - state.rest_days(m.team_a, m.date)) / 7.0,
        state.h2h_home_win_rate(m.team_a, m.team_b) - 1.0 / 3.0,
        is_group,
        is_knockout,
        home_venue_adv - away_venue_adv,
        (m.matchday - 1) / 2.0,
    ], dtype=float)


def draw_guard_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    e = state.expected_home(m.team_a, m.team_b)
    draw = 0.20 + 0.30 * (1.0 - 2.0 * abs(e - 0.5))
    rem = 1.0 - draw
    return _norm3(e * rem, draw, (1 - e) * rem)


def group_table_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    e = 1.0 / (1.0 + math.exp(-(state.form(m.team_a) - state.form(m.team_b)) * 3.0))
    draw = 0.27
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def underdog_guard_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    e = state.expected_home(m.team_a, m.team_b)
    shrunk = 0.5 + (e - 0.5) * 0.7
    draw = 0.28
    return _norm3(shrunk * (1 - draw), draw, (1 - shrunk) * (1 - draw))


def tournament_elo_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    diff = state.tournament_rating(m.team_a) - state.tournament_rating(m.team_b)
    e = 1.0 / (1.0 + 10.0 ** (-diff / 400.0))
    draw = 0.25
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def form_momentum_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    diff = state.weighted_form(m.team_a) - state.weighted_form(m.team_b)
    e = 1.0 / (1.0 + math.exp(-diff * 3.0))
    draw = 0.27
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def goal_diff_model(state: TeamState, m: Match, **_: Any) -> tuple[float, float, float]:
    diff = state.goal_trend(m.team_a) - state.goal_trend(m.team_b)
    e = 1.0 / (1.0 + math.exp(-diff * 2.0))
    draw = 0.27
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def h2h_model(state: TeamState, m: Match, **_: Any) -> Optional[tuple[float, float, float]]:
    h2h = state._h2h.get((m.team_a, m.team_b), [])
    if len(h2h) < 2:
        return None
    recent = h2h[-5:]
    h = recent.count(HOME) / len(recent)
    d = recent.count(DRAW) / len(recent)
    a = recent.count(AWAY) / len(recent)
    return _norm3(h, d, a)


def roster_strength_model(state: TeamState, m: Match, **_: Any) -> Optional[tuple[float, float, float]]:
    """Static roster-quality proxy from player profiles (caps, top-5 players, absentees)."""
    if not _ROSTER_STRENGTH:
        return None
    sh = _ROSTER_STRENGTH.get(m.team_a)
    sa = _ROSTER_STRENGTH.get(m.team_b)
    if sh is None or sa is None:
        return None
    diff = (sh - sa) / max(abs(sh + sa), 1e-6)
    e = 1.0 / (1.0 + 10.0 ** (-diff * 2.0))
    draw = 0.25
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def vision_tracking_model(state: TeamState, m: Match, **_: Any) -> Optional[tuple[float, float, float]]:
    """Vision-derived team rhythm/possession/territory signal.

    Only activates when both teams have recent tracking records (from match
    videos processed by scripts/wc2026_vision). Returns None otherwise so the
    ensemble falls back to other models.
    """
    if not _TEAM_TRACKING:
        return None
    th = _TEAM_TRACKING.get(m.team_a)
    ta = _TEAM_TRACKING.get(m.team_b)
    if th is None or ta is None:
        return None
    # Composite tracking advantage: possession + territory control - transition chaos.
    home_score = th["possession"] + th["territory"] - th["transition_rate"]
    away_score = ta["possession"] + ta["territory"] - ta["transition_rate"]
    diff = home_score - away_score
    e = 1.0 / (1.0 + math.exp(-diff * 4.0))
    draw = 0.27
    return _norm3(e * (1 - draw), draw, (1 - e) * (1 - draw))


def market_implied_model(state: TeamState, m: Match, *, odds: Optional[dict] = None, **_: Any):
    if not odds:
        return None
    try:
        p = remove_vig({"home": odds["home"], "draw": odds["draw"], "away": odds["away"]})
        return _norm3(p["home"], p["draw"], p["away"])
    except (KeyError, ValueError, ZeroDivisionError):
        return None


MODEL_FUNCS: list[tuple[str, Callable]] = [
    ("elo", elo_model), ("elo_draw", elo_draw_model), ("rank", fifa_rank_model),
    ("rank_draw", rank_draw_model), ("poisson", poisson_model),
    ("dixon_coles", dixon_coles_model), ("dixon_coles_heavy", dixon_coles_heavy_model),
    ("draw_guard", draw_guard_model), ("group_table", group_table_model),
    ("underdog_guard", underdog_guard_model),
    ("tournament_elo", tournament_elo_model),
    ("form_momentum", form_momentum_model),
    ("goal_diff", goal_diff_model),
    ("h2h", h2h_model),
    ("roster_strength", roster_strength_model),
    ("vision_tracking", vision_tracking_model),
]
BOOST_LABELS = ["xgboost_proxy", "lightgbm_proxy", "catboost_proxy"]
ALL_MODEL_NAMES = [n for n, _ in MODEL_FUNCS] + BOOST_LABELS + ["market"]


# ---------------------------------------------------------------------------
# 4. Ensemble
# ---------------------------------------------------------------------------
SAFE_DEFAULT_WEIGHTS = {
    "elo": 0.0675, "elo_draw": 0.0764, "rank": 0.0671, "rank_draw": 0.0598,
    "poisson": 0.0650, "dixon_coles": 0.0652, "dixon_coles_heavy": 0.0671,
    "draw_guard": 0.0723, "group_table": 0.0856, "underdog_guard": 0.0843,
    "tournament_elo": 0.1087, "form_momentum": 0.1054, "goal_diff": 0.0756,
    "h2h": 0.0, "roster_strength": 0.0, "vision_tracking": 0.0,
    "xgboost_proxy": 0.0, "lightgbm_proxy": 0.0, "catboost_proxy": 0.0,
    "market": 0.0,
}


def blend_probabilities(per_model: dict[str, tuple], weights: dict[str, float]) -> tuple[float, float, float]:
    h = d = a = wsum = 0.0
    for name, vec in per_model.items():
        if vec is None:
            continue
        w = max(0.0, weights.get(name, 0.0))
        if w <= 0:
            continue
        h += w * vec[0]; d += w * vec[1]; a += w * vec[2]; wsum += w
    if wsum <= 0:
        present = [v for v in per_model.values() if v is not None]
        if not present:
            return (1 / 3, 1 / 3, 1 / 3)
        h = sum(v[0] for v in present) / len(present)
        d = sum(v[1] for v in present) / len(present)
        a = sum(v[2] for v in present) / len(present)
    return _norm3(h, d, a)


def optimise_weights_by_logloss(rows: list[tuple[dict[str, tuple], str]],
                                  l2: float = 0.01) -> tuple[dict[str, float], bool]:
    if len(rows) < 40:
        return dict(SAFE_DEFAULT_WEIGHTS), False
    names = [n for n in ALL_MODEL_NAMES if any(r[0].get(n) is not None for r in rows)]
    if not names:
        return dict(SAFE_DEFAULT_WEIGHTS), False
    cls_idx = {HOME: 0, DRAW: 1, AWAY: 2}

    def neg_log_loss(w_raw: np.ndarray) -> float:
        w = np.clip(w_raw, 0, None)
        w = w / (w.sum() or 1.0)
        wmap = {n: float(w[i]) for i, n in enumerate(names)}
        total = 0.0
        for per_model, actual in rows:
            p = blend_probabilities(per_model, wmap)[cls_idx[actual]]
            total += -math.log(max(p, 1e-12))
        return total / len(rows) + l2 * float(np.sum(w ** 2))

    try:
        from scipy.optimize import minimize
        x0 = np.array([SAFE_DEFAULT_WEIGHTS.get(n, 0.05) for n in names])
        res = minimize(neg_log_loss, x0, method="Nelder-Mead",
                       options={"maxiter": 2000, "xatol": 1e-4, "fatol": 1e-5})
        w = np.clip(res.x, 0, None)
        w = w / (w.sum() or 1.0)
        learned = {n: round(float(w[i]), 5) for i, n in enumerate(names)}
        for n in ALL_MODEL_NAMES:
            learned.setdefault(n, 0.0)
        return learned, True
    except Exception as exc:  # noqa: BLE001
        LOG.warning("weight optimisation failed: %s — defaults", exc)
        return dict(SAFE_DEFAULT_WEIGHTS), False


def optimise_weights_by_accuracy(rows: list[tuple[dict[str, tuple], str]],
                                  l2: float = 0.01,
                                  n_iter: int = 2000,
                                  seed: int = 20260620) -> tuple[dict[str, float], bool]:
    """Greedy random coordinate ascent maximising single-pick accuracy + L2 penalty."""
    if len(rows) < 40:
        return dict(SAFE_DEFAULT_WEIGHTS), False
    names = [n for n in ALL_MODEL_NAMES if any(r[0].get(n) is not None for r in rows)]
    if not names:
        return dict(SAFE_DEFAULT_WEIGHTS), False
    rng = random.Random(seed)
    w = np.array([SAFE_DEFAULT_WEIGHTS.get(n, 0.05) for n in names], dtype=float)
    w = np.clip(w, 0, None)
    w = w / (w.sum() or 1.0)

    def score(weights: np.ndarray) -> float:
        wmap = {n: float(weights[i]) for i, n in enumerate(names)}
        correct = 0
        for per_model, actual in rows:
            h, d, a = blend_probabilities(per_model, wmap)
            pred = max(((HOME, h), (DRAW, d), (AWAY, a)), key=lambda kv: kv[1])[0]
            if pred == actual:
                correct += 1
        acc = correct / len(rows)
        return acc - l2 * float(np.sum(weights ** 2))

    best = score(w)
    step = 0.05
    for _ in range(n_iter):
        idx = rng.randrange(len(names))
        delta = rng.choice([-step, step])
        new_w = w.copy()
        new_w[idx] = max(0.0, new_w[idx] + delta)
        s = new_w.sum()
        if s == 0:
            continue
        new_w = new_w / s
        new_score = score(new_w)
        if new_score > best:
            w = new_w
            best = new_score
    learned = {n: round(float(w[i]), 5) for i, n in enumerate(names)}
    for n in ALL_MODEL_NAMES:
        learned.setdefault(n, 0.0)
    return learned, True


def _optimise_weights(rows: list[tuple[dict[str, tuple], str]], l2: float = 0.01) -> tuple[dict[str, float], bool]:
    if WEIGHT_OBJECTIVE == "accuracy":
        return optimise_weights_by_accuracy(rows, l2=l2)
    return optimise_weights_by_logloss(rows, l2=l2)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _mp_denoise_matrix(X: np.ndarray, factor: float = 1.0) -> np.ndarray:
    """Eigenvalue-clipping denoising (Marchenko–Pastur) on a centred matrix.

    Variables are columns, observations are rows. Returns a cleaned copy of X.
    ``factor`` scales the MP upper edge; values below 1 keep more eigenvalues.
    """
    n, p = X.shape
    if p < 3 or n < p:
        return X.copy()
    means = np.mean(X, axis=0)
    stds = np.std(X, axis=0, ddof=0)
    stds[stds == 0] = 1.0
    Z = (X - means) / stds
    try:
        U, S, Vt = np.linalg.svd(Z, full_matrices=False)
    except np.linalg.LinAlgError:
        return X.copy()
    eigvals = (S ** 2) / n
    gamma = p / n
    lambda_plus = factor * (1.0 + math.sqrt(gamma)) ** 2
    keep = eigvals > lambda_plus
    if not keep.any():
        keep[0] = True
    Z_clean = U[:, keep] @ np.diag(S[keep]) @ Vt[keep, :]
    return Z_clean * stds + means


def mp_denoise_per_outcome(weight_rows: list[tuple[dict[str, tuple], str]],
                           factor: float = 1.0
                           ) -> list[tuple[dict[str, tuple], str]]:
    """Denoise the per-model 1X2 probability matrices with MP eigenvalue clipping.

    Each outcome class (home/draw/away) is treated as an n_matches x n_models
    matrix. Noise eigenvectors are clipped so the learned ensemble weights are
    driven by signal rather than sample noise.
    """
    n = len(weight_rows)
    names = sorted({name for pm, _ in weight_rows for name in pm.keys()})
    p = len(names)
    if n < 40 or p < 3 or n < p:
        return weight_rows
    name_idx = {name: i for i, name in enumerate(names)}
    cleaned = {o: None for o in CLASSES}
    for outcome_idx, outcome in enumerate(CLASSES):
        X = np.full((n, p), np.nan)
        for i, (pm, _) in enumerate(weight_rows):
            for name, probs in pm.items():
                if probs is None:
                    continue
                X[i, name_idx[name]] = probs[outcome_idx]
        col_means = np.nanmean(X, axis=0)
        for j in range(p):
            missing = np.isnan(X[:, j])
            X[missing, j] = col_means[j]
        cleaned[outcome] = _mp_denoise_matrix(X, factor=factor)
    out_rows = []
    for i, (pm, actual) in enumerate(weight_rows):
        new_pm: dict[str, tuple] = {}
        for name in names:
            j = name_idx[name]
            h = float(cleaned[HOME][i, j])
            d = float(cleaned[DRAW][i, j])
            a = float(cleaned[AWAY][i, j])
            h, d, a = max(h, 0.0), max(d, 0.0), max(a, 0.0)
            s = h + d + a
            if s > 0:
                h, d, a = h / s, d / s, a / s
            else:
                h = d = a = 1.0 / 3.0
            new_pm[name] = (h, d, a)
        out_rows.append((new_pm, actual))
    return out_rows


def save_model_registry(weights: dict[str, float], learned: bool,
                        backtest: Optional[BacktestSummary], window: str) -> None:
    doc = {
        "verified": True,
        "source": ("scripts/worldcup_prediction_engine.py — weights learned by "
                   "multiclass-logloss minimisation over leakage-free walk-forward "
                   "predictions") if learned else
                  ("scripts/worldcup_prediction_engine.py — SAFE DEFAULT weights "
                   "(insufficient history; treat as sandbox-only)"),
        "generated_at": _utcnow(),
        "active_model": "logloss_blend_v1" if learned else "safe_default_blend_v1",
        "weights_learned": learned, "weights": weights, "backtest_window": window,
        "single_top_pick_accuracy": backtest.single_top_pick_accuracy if backtest else None,
        "three_spread_coverage": backtest.three_spread_coverage if backtest else None,
        "betting_value_score": backtest.betting_value_score if backtest else None,
        "in_sample": backtest.in_sample if backtest else None,
        "reason_selected": ("Blend weights minimise multiclass log loss; "
                            "draw-protective models retained to address favourite-draw "
                            "failures.") if learned else
                           "Not enough graded history to learn weights; safe defaults.",
    }
    REGISTRY_OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    LOG.info("wrote model registry -> %s (learned=%s)", REGISTRY_OUT, learned)


# ---------------------------------------------------------------------------
# 5. Risk engine
# ---------------------------------------------------------------------------
def entropy(p: tuple[float, float, float]) -> float:
    return -sum(pi * math.log(max(pi, 1e-12)) for pi in p)


def normalised_entropy(p: tuple[float, float, float]) -> float:
    return entropy(p) / math.log(3)


def model_disagreement(per_model: dict[str, tuple]) -> float:
    vecs = [v for v in per_model.values() if v is not None]
    if len(vecs) < 2:
        return 0.0
    return float(np.array(vecs).std(axis=0).mean())


STRATEGY_PRESETS = {
    # Tuned by brute-force walk-forward search (scripts/wc2026_brute_tune.py):
    # l2=0.0001, logloss objective, majority pick.
    "balanced": {"extreme_entropy": 0.985, "extreme_margin": 0.08, "rotate_entropy": 0.95},
    "maximum_coverage": {"extreme_entropy": 1.01, "extreme_margin": 0.0, "rotate_entropy": 0.80},
    "value": {"extreme_entropy": 0.97, "extreme_margin": 0.08, "rotate_entropy": 0.93},
}


def classify_treatment(pred: ModelPrediction, per_model: dict[str, tuple],
                       match: Match, preset: dict[str, float]) -> RiskAssessment:
    probs = {HOME: pred.p_home, DRAW: pred.p_draw, AWAY: pred.p_away}
    ordered = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    top, second, third = ordered[0], ordered[1], ordered[2]
    margin = top[1] - second[1]
    h_norm = normalised_entropy(pred.vector)
    disagree = model_disagreement(per_model)
    top_draw_gap = top[1] - pred.p_draw
    risk = (0.35 * h_norm + 0.25 * min(disagree * 3.0, 1.0)
            + 0.20 * (1.0 - margin) + 0.10 * 0.5 + 0.10 * 0.5)
    # Coverage priority (user spec): which risky games most deserve coverage.
    coverage_priority = pred.p_draw + h_norm + disagree - top[1]

    # Smarter draw protection (user #6): protect draws when the favourite is
    # not clear enough, especially group-stage.
    draw_dangerous = (
        pred.p_draw >= MIN_DRAW_PROB_FOR_HEDGE
        and top[1] < DRAW_PROTECT_TOP_CEILING
        and top_draw_gap < DRAW_PROTECT_GAP
    )

    if h_norm >= preset["extreme_entropy"] or margin <= preset["extreme_margin"]:
        level, treatment = "EXTREME", "EXCLUDE"
    elif (top[1] >= MIN_LOCK_PROB and margin >= LOCK_MARGIN
          and pred.p_draw <= MAX_DRAW_PROB_FOR_LOCK and disagree <= 0.10):
        level, treatment = "LOW", "LOCK"
    elif h_norm >= preset["rotate_entropy"]:
        level, treatment = "HIGH", "ROTATE"
    elif draw_dangerous or (match.is_group_stage and pred.p_draw >= MIN_DRAW_PROB_FOR_HEDGE):
        level, treatment = "MEDIUM", "DRAW_HEDGE"
    else:
        level, treatment = "MEDIUM", "HEDGE"

    return RiskAssessment(
        match_id=pred.match_id, top_outcome=top[0], second_outcome=second[0],
        third_outcome=third[0], top_probability=round(top[1], 4),
        draw_probability=round(pred.p_draw, 4), confidence_margin=round(margin, 4),
        entropy=round(h_norm, 4), model_disagreement=round(disagree, 4),
        risk_score=round(risk, 4), coverage_priority=round(coverage_priority, 4),
        risk_level=level, treatment=treatment,
    )


def quantum_classify_treatment(qs: Any, pred: ModelPrediction,
                               match: Match, preset: dict[str, float]) -> RiskAssessment:
    """Classify treatment using the quantum-inspired market-state wrapper."""
    probs = {HOME: qs.evolved_probs[0], DRAW: qs.evolved_probs[1], AWAY: qs.evolved_probs[2]}
    ordered = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    top, second, third = ordered[0], ordered[1], ordered[2]
    margin = top[1] - second[1]
    h_norm = normalised_entropy(tuple(qs.evolved_probs))
    disagree = 1.0 - qs.confidence

    # Positive-score outcomes determine coverage
    pos = {o: qs.bet_score[i] > 0.001 for i, o in enumerate(CLASSES)}
    pos_count = sum(pos.values())

    # Require a meaningful positive edge to bet at all
    best_edge = float(np.max(qs.edge))
    best_score = float(np.max(qs.bet_score))

    cfg = QUANTUM_CFG
    if best_edge <= 0.0 or best_score <= 0.0 or qs.confidence < cfg["exclude_max_confidence"]:
        level, treatment = "EXTREME", "EXCLUDE"
    elif (best_score >= cfg["lock_min_score"]
          and qs.confidence >= cfg["lock_min_confidence"]
          and qs.robustness >= cfg["lock_min_robustness"]
          and pos_count <= 1):
        level, treatment = "LOW", "LOCK"
    elif pos_count >= 3:
        level, treatment = "HIGH", "ROTATE"
    elif pos.get(DRAW) and top[0] != DRAW:
        level, treatment = "MEDIUM", "DRAW_HEDGE"
    else:
        level, treatment = "MEDIUM", "HEDGE"

    coverage_priority = qs.evolved_probs[1] + h_norm + (1.0 - qs.confidence) - top[1]
    risk = 0.35 * h_norm + 0.25 * disagree + 0.20 * (1.0 - margin) + 0.20 * (1.0 - qs.robustness)

    return RiskAssessment(
        match_id=pred.match_id, top_outcome=top[0], second_outcome=second[0],
        third_outcome=third[0], top_probability=round(top[1], 4),
        draw_probability=round(qs.evolved_probs[1], 4), confidence_margin=round(margin, 4),
        entropy=round(h_norm, 4), model_disagreement=round(disagree, 4),
        risk_score=round(risk, 4), coverage_priority=round(coverage_priority, 4),
        risk_level=level, treatment=treatment,
    )


# ---------------------------------------------------------------------------
# 6. Three-spread engine
# ---------------------------------------------------------------------------
def _coverage_metrics(pred: ModelPrediction, a: Optional[str], b: Optional[str],
                      c: Optional[str]) -> tuple[int, float, float]:
    covered = {x for x in (a, b, c) if x}
    cost = len(covered)
    if cost == 0:
        return 0, 0.0, 0.0
    cov_prob = sum(pred.prob_of(o) for o in covered)
    return cost, round(cov_prob, 4), round(cov_prob / cost, 4)


def _edge_ev(pred: ModelPrediction, top: str, odds: Optional[dict],
             qs: Optional[Any] = None) -> tuple[Optional[float], Optional[float]]:
    if not odds:
        return None, None
    try:
        fair = remove_vig({"home": odds["home"], "draw": odds["draw"], "away": odds["away"]})
        key = {HOME: "home", DRAW: "draw", AWAY: "away"}[top]
        if qs is not None:
            idx = CLASSES.index(top)
            edge = float(qs.edge[idx])
            ev = float(qs.ev[idx])
        else:
            model_p = pred.prob_of(top)
            edge = model_p - fair[key]
            ev = model_p * float(odds[key]) - 1.0
        return round(edge, 4), round(ev, 4)
    except (KeyError, ValueError, ZeroDivisionError):
        return None, None


def generate_three_spread(match: Match, pred: ModelPrediction, risk: RiskAssessment,
                          qs: Optional[Any] = None) -> SpreadSelection:
    top, second, third = risk.top_outcome, risk.second_outcome, risk.third_outcome
    third_p = pred.prob_of(third)
    a = b = c = None
    reason = ""

    if risk.treatment == "LOCK":
        a = b = c = top
        reason = f"Lock: {top} clear (p={risk.top_probability:.2f}, margin={risk.confidence_margin:.2f}, draw={risk.draw_probability:.2f})."
    elif risk.treatment == "DRAW_HEDGE":
        a = top
        b = DRAW if top != DRAW else second
        c = second if second != DRAW else third
        reason = f"Draw-hedge: favourite not clear, draw plausible (p_draw={risk.draw_probability:.2f}, group_stage={match.is_group_stage})."
    elif risk.treatment == "ROTATE":
        a, b = top, second
        c = third if third_p >= MIN_THIRD_OUTCOME_PROB else top
        reason = f"Rotate: three-way close (entropy={risk.entropy:.2f}, third_p={third_p:.2f})."
    elif risk.treatment == "HEDGE":
        a, b, c = top, second, top
        reason = f"Hedge: second outcome meaningful (margin={risk.confidence_margin:.2f})."
    else:  # EXCLUDE
        reason = f"Exclude: too uncertain (entropy={risk.entropy:.2f}, margin={risk.confidence_margin:.2f})."

    cost, cov_prob, cov_eff = _coverage_metrics(pred, a, b, c)
    edge, ev = _edge_ev(pred, top, match.odds, qs=qs)
    return SpreadSelection(
        match_id=match.match_id, team_a=match.team_a, team_b=match.team_b,
        treatment=risk.treatment, variation_a=a, variation_b=b, variation_c=c,
        p_home=round(pred.p_home, 4), p_draw=round(pred.p_draw, 4),
        p_away=round(pred.p_away, 4), coverage_cost=cost,
        coverage_probability=cov_prob, coverage_efficiency=cov_eff,
        edge=edge, expected_value=ev, reason=reason,
    )


def apply_stake_cost_guards(spreads: list[SpreadSelection],
                            risks: dict[str, RiskAssessment]) -> tuple[list[SpreadSelection], list[str]]:
    """Cap full 3-way rotations + draw-hedges per slip set (user #1/#10).

    Only the highest coverage_priority games keep full rotation / draw hedge;
    excess are demoted to HEDGE so coverage can't be bought everywhere.
    """
    warnings: list[str] = []
    out = {s.match_id: s for s in spreads}

    full_rotates = [s for s in spreads if s.coverage_cost == 3]
    if len(full_rotates) > MAX_FULL_ROTATES:
        ranked = sorted(full_rotates, key=lambda s: risks[s.match_id].coverage_priority, reverse=True)
        for s in ranked[MAX_FULL_ROTATES:]:
            r = risks[s.match_id]
            a, b, c = r.top_outcome, r.second_outcome, r.top_outcome  # demote -> HEDGE
            cost, cov_prob, cov_eff = _coverage_metrics(
                ModelPrediction(s.match_id, s.p_home, s.p_draw, s.p_away, r.top_outcome), a, b, c)
            out[s.match_id] = SpreadSelection(**{**asdict(s), "treatment": "HEDGE",
                "variation_a": a, "variation_b": b, "variation_c": c,
                "coverage_cost": cost, "coverage_probability": cov_prob,
                "coverage_efficiency": cov_eff,
                "reason": s.reason + " [demoted: MAX_FULL_ROTATES cap]"})
        warnings.append(
            f"Stake-cost: {len(full_rotates)} full 3-way rotations exceeded cap "
            f"{MAX_FULL_ROTATES}; lowest-priority excess demoted to HEDGE so coverage "
            f"isn't bought on every game (that destroys betting value).")

    draw_hedges = [mid for mid, s in out.items() if s.treatment == "DRAW_HEDGE"]
    if len(draw_hedges) > MAX_DRAW_HEDGES:
        ranked = sorted(draw_hedges, key=lambda mid: risks[mid].coverage_priority, reverse=True)
        for mid in ranked[MAX_DRAW_HEDGES:]:
            s = out[mid]
            r = risks[mid]
            a, b, c = r.top_outcome, r.second_outcome, r.top_outcome
            cost, cov_prob, cov_eff = _coverage_metrics(
                ModelPrediction(mid, s.p_home, s.p_draw, s.p_away, r.top_outcome), a, b, c)
            out[mid] = SpreadSelection(**{**asdict(s), "treatment": "HEDGE",
                "variation_a": a, "variation_b": b, "variation_c": c,
                "coverage_cost": cost, "coverage_probability": cov_prob,
                "coverage_efficiency": cov_eff,
                "reason": s.reason + " [demoted: MAX_DRAW_HEDGES cap]"})
        warnings.append(
            f"Stake-cost: draw-hedges exceeded cap {MAX_DRAW_HEDGES}; lowest-priority "
            f"excess demoted to HEDGE to protect EV.")

    return [out[s.match_id] for s in spreads], warnings


def spread_covers(spread: SpreadSelection, actual: str) -> bool:
    return actual in {spread.variation_a, spread.variation_b, spread.variation_c}


# ---------------------------------------------------------------------------
# 7. Backtest
# ---------------------------------------------------------------------------
def _predict_one(state: TeamState, m: Match, universe: Sequence[str],
                 weights: dict[str, float], boosts: dict[str, _BoostProxy]) -> tuple[ModelPrediction, dict[str, tuple]]:
    per_model: dict[str, tuple] = {}
    for name, fn in MODEL_FUNCS:
        try:
            per_model[name] = fn(state, m, universe=universe)
        except Exception as exc:  # noqa: BLE001
            LOG.debug("model %s failed on %s: %s", name, m.match_id, exc)
            per_model[name] = None
    feat = _features(state, m, universe)
    for label in BOOST_LABELS:
        proxy = boosts.get(label)
        per_model[label] = proxy.predict(feat) if proxy else None
    per_model["market"] = market_implied_model(state, m, odds=m.odds)
    h, d, a = blend_probabilities(per_model, weights)
    # Blend in de-vigged market odds when available and requested.
    if MARKET_ALPHA > 0.0 and m.odds:
        mp = market_implied_model(state, m, odds=m.odds)
        if mp is not None:
            h = (1.0 - MARKET_ALPHA) * h + MARKET_ALPHA * mp[0]
            d = (1.0 - MARKET_ALPHA) * d + MARKET_ALPHA * mp[1]
            a = (1.0 - MARKET_ALPHA) * a + MARKET_ALPHA * mp[2]
            h, d, a = _norm3(h, d, a)
    # Single-pick is the genuine top predicted outcome (argmax/blended), per spec
    if USE_MAJORITY_PICK:
        top_pick = majority_top_pick(per_model)
    else:
        top_pick = max((HOME, h), (DRAW, d), (AWAY, a), key=lambda kv: kv[1])[0]
    return ModelPrediction(m.match_id, h, d, a, top_pick, per_model), per_model


def _fit_boosts(history: list[Match], universe: Sequence[str],
                max_iter: int = 120, max_depth: int = 4,
                learning_rate: float = 0.08) -> dict[str, _BoostProxy]:
    state = TeamState()
    X: list[np.ndarray] = []
    y: list[str] = []
    for m in history:
        if m.actual_outcome is None:
            continue
        X.append(_features(state, m, universe))
        y.append(m.actual_outcome)
        state.update(m)
    boosts: dict[str, _BoostProxy] = {}
    if X:
        Xarr = np.array(X)
        for i, label in enumerate(BOOST_LABELS):
            proxy = _BoostProxy(label, seed=20260620 + i,
                                max_iter=max_iter, max_depth=max_depth,
                                learning_rate=learning_rate)
            proxy.fit(Xarr, y)
            boosts[label] = proxy
    return boosts


def sequential_no_lookahead_backtest(history: list[Match], weights: dict[str, float],
                                     strategy: str, boosts: dict[str, _BoostProxy],
                                     universe: Sequence[str],
                                     quantum: bool = False,
                                     assessor: Optional[Any] = None) -> list[BacktestRow]:
    preset = STRATEGY_PRESETS[strategy]
    state = TeamState()
    metas: list[tuple[Match, ModelPrediction, RiskAssessment]] = []
    spreads: list[SpreadSelection] = []
    risks: dict[str, RiskAssessment] = {}

    for m in history:
        pred, per_model = _predict_one(state, m, universe, weights, boosts)
        if quantum and assessor is not None:
            qs = assessor.assess(m, pred, per_model, state)
            qpred = ModelPrediction(
                m.match_id,
                round(float(qs.evolved_probs[0]), 4),
                round(float(qs.evolved_probs[1]), 4),
                round(float(qs.evolved_probs[2]), 4),
                CLASSES[int(np.argmax(qs.evolved_probs))],
                per_model,
            )
            risk = quantum_classify_treatment(qs, qpred, m, preset)
            spread = generate_three_spread(m, qpred, risk, qs=qs)
        else:
            risk = classify_treatment(pred, per_model, m, preset)
            spread = generate_three_spread(m, pred, risk)
        risks[m.match_id] = risk
        spreads.append(spread)
        metas.append((m, pred, risk))  # single-pick stays base model; coverage uses spread
        state.update(m)  # advances AFTER prediction (no leakage)

    spreads, _ = apply_stake_cost_guards(spreads, risks)
    by_id = {s.match_id: s for s in spreads}

    rows: list[BacktestRow] = []
    for m, pred, risk in metas:
        s = by_id[m.match_id]
        actual = m.actual_outcome
        single_correct = (pred.top_pick == actual) if actual else None
        covered = (spread_covers(s, actual) if (actual and s.treatment != "EXCLUDE")
                   else (False if actual else None))
        rows.append(BacktestRow(
            match_id=m.match_id, date=m.date, team_a=m.team_a, team_b=m.team_b,
            final_score=f"{m.home_goals}-{m.away_goals}" if m.is_played else None,
            actual_outcome=actual, p_team_a_win=round(pred.p_home, 4),
            p_draw=round(pred.p_draw, 4), p_team_b_win=round(pred.p_away, 4),
            top_pick=pred.top_pick, treatment=s.treatment,
            variation_a=s.variation_a, variation_b=s.variation_b, variation_c=s.variation_c,
            coverage_cost=s.coverage_cost, single_correct=single_correct,
            spread_covered=covered, entropy=risk.entropy,
            model_disagreement=risk.model_disagreement,
            confidence_margin=risk.confidence_margin, in_sample=True,
        ))
    return rows


def bootstrap_10000_strategy_test(rows: list[BacktestRow], runs: int = 10000,
                                  legs: int = 4, seed: int = 20260620) -> dict[str, float]:
    graded = [r for r in rows if r.actual_outcome is not None and r.treatment != "EXCLUDE"]
    if len(graded) < legs:
        return {"single_4_match_slip_success": 0.0,
                "three_spread_4_match_slip_success": 0.0}
    rng = random.Random(seed)
    single_ok = spread_ok = 0
    for _ in range(runs):
        pick = rng.sample(graded, legs)
        if all(r.single_correct for r in pick):
            single_ok += 1
        if all(r.spread_covered for r in pick):
            spread_ok += 1
    return {"single_4_match_slip_success": round(single_ok / runs, 4),
            "three_spread_4_match_slip_success": round(spread_ok / runs, 4)}


def compare_single_vs_spread(rows: list[BacktestRow], runs: int, in_sample: bool) -> BacktestSummary:
    graded = [r for r in rows if r.actual_outcome is not None]
    counted = [r for r in graded if r.treatment != "EXCLUDE"]
    n = len(counted)
    single_acc = sum(1 for r in graded if r.single_correct) / len(graded) if graded else 0.0
    coverage = sum(1 for r in counted if r.spread_covered) / n if n else 0.0
    avg_cost = sum(r.coverage_cost for r in counted) / n if n else 0.0
    # Betting value (user #2/#3): cheap coverage scores high; full-rotate-everything
    # scores low. value = mean(coverage_prob / coverage_cost) over counted games.
    value = (sum((r.spread_covered and 1.0 or 0.0) / max(r.coverage_cost, 1)
                 for r in counted) / n) if n else 0.0
    boot = bootstrap_10000_strategy_test(rows, runs=runs)
    full_single = all(r.single_correct for r in counted) if counted else False
    full_spread = all(r.spread_covered for r in counted) if counted else False

    breakdown: dict[str, int] = {}
    for r in rows:
        breakdown[r.treatment] = breakdown.get(r.treatment, 0) + 1

    warnings: list[str] = []
    if in_sample:
        warnings.append("IN-SAMPLE: metrics computed on data the weights were trained "
                        "on — out-of-sample accuracy will be lower.")
    all3 = sum(1 for r in counted if r.coverage_cost == 3)
    if counted and all3 / len(counted) >= 0.5:
        warnings.append(
            f"COVERAGE-ENGINEERING: {all3}/{len(counted)} games cover all three 1X2 "
            f"outcomes. High coverage here is NOT predictive accuracy — it raises "
            f"stake cost and lowers payout.")

    return BacktestSummary(
        matches_tested=n, single_top_pick_accuracy=round(single_acc, 4),
        three_spread_coverage=round(coverage, 4), betting_value_score=round(value, 4),
        uplift=round(coverage - single_acc, 4), avg_coverage_cost=round(avg_cost, 3),
        single_4_match_slip_success=boot["single_4_match_slip_success"],
        three_spread_4_match_slip_success=boot["three_spread_4_match_slip_success"],
        single_full_ticket_success=1.0 if full_single else 0.0,
        three_spread_full_ticket_success=1.0 if full_spread else 0.0,
        treatment_breakdown=breakdown, bootstrap_runs=runs,
        in_sample=in_sample, warnings=warnings,
    )


def _collect_training_rows(history: list[Match], universe: Sequence[str],
                           boosts: dict[str, _BoostProxy]) -> list[tuple[dict[str, tuple], str]]:
    state = TeamState()
    rows: list[tuple[dict[str, tuple], str]] = []
    for m in history:
        if m.actual_outcome is None:
            state.update(m)
            continue
        pred, per_model = _predict_one(state, m, universe, SAFE_DEFAULT_WEIGHTS, boosts)
        rows.append((per_model, m.actual_outcome))
        state.update(m)
    return rows


def walk_forward_backtest(history: list[Match], strategy: str, n_folds: int = 5,
                          quantum: bool = False, l2: float = 0.01,
                          gbm_max_iter: int = 120, gbm_max_depth: int = 4,
                          gbm_lr: float = 0.08) -> tuple[BacktestSummary, list[BacktestRow], dict[str, float]]:
    """Out-of-sample backtest: learn weights/boosts only on past folds, predict the next fold.

    This is a stricter estimate of future accuracy than the default in-sample backtest.
    """
    played = [m for m in history if m.is_played and m.actual_outcome is not None]
    played.sort(key=lambda m: m.date)
    universe = _universe(played)
    assessor = QuantumAssessor() if quantum and QuantumAssessor is not None else None
    preset = STRATEGY_PRESETS[strategy]
    all_rows: list[BacktestRow] = []
    if len(played) < n_folds * 20:
        n_folds = max(2, len(played) // 20)
    fold_size = max(1, len(played) // n_folds)

    for fold in range(n_folds):
        start = fold * fold_size
        end = len(played) if fold == n_folds - 1 else (fold + 1) * fold_size
        train, test = played[:start], played[start:end]
        if not train or not test:
            continue
        boosts = _fit_boosts(train, universe,
                               max_iter=gbm_max_iter, max_depth=gbm_max_depth,
                               learning_rate=gbm_lr)
        train_rows = _collect_training_rows(train, universe, boosts)
        weights, _ = _optimise_weights(train_rows, l2=l2)
        state = TeamState()
        for m in train:
            state.update(m)
        risks: dict[str, RiskAssessment] = {}
        metas: list[tuple[Match, ModelPrediction, RiskAssessment]] = []
        spreads: list[SpreadSelection] = []
        for m in test:
            pred, per_model = _predict_one(state, m, universe, weights, boosts)
            if quantum and assessor is not None:
                qs = assessor.assess(m, pred, per_model, state)
                qpred = ModelPrediction(
                    m.match_id,
                    round(float(qs.evolved_probs[0]), 4),
                    round(float(qs.evolved_probs[1]), 4),
                    round(float(qs.evolved_probs[2]), 4),
                    CLASSES[int(np.argmax(qs.evolved_probs))],
                    per_model,
                )
                risk = quantum_classify_treatment(qs, qpred, m, preset)
                spread = generate_three_spread(m, qpred, risk, qs=qs)
            else:
                risk = classify_treatment(pred, per_model, m, preset)
                spread = generate_three_spread(m, pred, risk)
            risks[m.match_id] = risk
            spreads.append(spread)
            metas.append((m, pred, risk))
            state.update(m)
        spreads, _ = apply_stake_cost_guards(spreads, risks)
        by_id = {s.match_id: s for s in spreads}
        for m, pred, risk in metas:
            s = by_id[m.match_id]
            actual = m.actual_outcome
            all_rows.append(BacktestRow(
                match_id=m.match_id, date=m.date, team_a=m.team_a, team_b=m.team_b,
                final_score=f"{m.home_goals}-{m.away_goals}" if m.is_played else None,
                actual_outcome=actual, p_team_a_win=round(pred.p_home, 4),
                p_draw=round(pred.p_draw, 4), p_team_b_win=round(pred.p_away, 4),
                top_pick=pred.top_pick, treatment=s.treatment,
                variation_a=s.variation_a, variation_b=s.variation_b, variation_c=s.variation_c,
                coverage_cost=s.coverage_cost, single_correct=(pred.top_pick == actual),
                spread_covered=(spread_covers(s, actual) if s.treatment != "EXCLUDE" else False),
                entropy=risk.entropy, model_disagreement=risk.model_disagreement,
                confidence_margin=risk.confidence_margin, in_sample=False,
            ))
    summary = compare_single_vs_spread(all_rows, runs=10000, in_sample=False)
    return summary, all_rows, weights


# ---------------------------------------------------------------------------
# 8. Outputs
# ---------------------------------------------------------------------------
def print_match_table(rows: list[BacktestRow]) -> None:
    LOG.info("%-26s %-5s %-5s %-5s %-4s %-11s %-3s %-3s %-3s %-3s %-3s %-3s",
             "Match", "pH", "pD", "pA", "top", "treatment", "A", "B", "C", "cc", "1?", "3?")
    for r in rows:
        s1 = "" if r.single_correct is None else ("Y" if r.single_correct else "N")
        s3 = "" if r.spread_covered is None else ("Y" if r.spread_covered else "N")
        LOG.info("%-26s %-5.2f %-5.2f %-5.2f %-4s %-11s %-3s %-3s %-3s %-3d %-3s %-3s",
                 (r.team_a[:11] + " v " + r.team_b[:10])[:26], r.p_team_a_win, r.p_draw,
                 r.p_team_b_win, r.top_pick, r.treatment, r.variation_a or "-",
                 r.variation_b or "-", r.variation_c or "-", r.coverage_cost, s1, s3)


def print_report(summary: BacktestSummary, strategy: str, learned: bool) -> None:
    x = summary.single_top_pick_accuracy * 100
    y = summary.three_spread_coverage * 100
    print("\n" + "=" * 66)
    print(f"  WC2026 ENGINE REPORT — strategy: {strategy}  weights_learned: {learned}")
    print("=" * 66)
    print(f"  Matches evaluated:            {summary.matches_tested}")
    print(f"  Single-pick accuracy:         {x:.1f}%")
    print(f"  Three-spread coverage:        {y:.1f}%")
    print(f"  Betting value score:          {summary.betting_value_score*100:.1f}%  (cheap coverage = high)")
    print(f"  Difference (uplift):          {y - x:+.1f}%")
    print(f"  Avg coverage cost:            {summary.avg_coverage_cost:.2f}  (1=lock 2=hedge 3=full rotate)")
    print(f"  Single 4-match slip success:  {summary.single_4_match_slip_success*100:.2f}%  ({summary.bootstrap_runs} sims)")
    print(f"  Spread 4-match slip success:  {summary.three_spread_4_match_slip_success*100:.2f}%  ({summary.bootstrap_runs} sims)")
    print(f"  Treatment breakdown:          {summary.treatment_breakdown}")
    print("-" * 66)
    print("  THREE different scores, NOT the same thing:")
    print("   • Single-pick accuracy = was the top prediction correct.")
    print("   • Three-spread coverage = did the actual result appear in A/B/C.")
    print("   • Betting value = is that coverage CHEAP (few outcome paths) or")
    print("     bought by hedging everything. Coverage is NOT predictive certainty.")
    if summary.warnings:
        print("-" * 66)
        for w in summary.warnings:
            print(f"  ⚠ {w}")
    print("=" * 66 + "\n")


def save_results_json(summary: BacktestSummary, rows: list[BacktestRow], strategy: str) -> None:
    BACKTEST_OUT.write_text(json.dumps({
        "verified": True,
        "source": ("scripts/worldcup_prediction_engine.py — no-lookahead sequential "
                   "backtest; actuals via wc2026_db.actual_for / embedded sandbox; "
                   "single-pick vs three-spread coverage vs betting value."),
        "generated_at": _utcnow(), "strategy": strategy,
        "summary": asdict(summary), "rows": [asdict(r) for r in rows],
    }, indent=2, ensure_ascii=False))
    LOG.info("wrote backtest results -> %s", BACKTEST_OUT)


def save_predictions_json(spreads: list[SpreadSelection], summary: Optional[BacktestSummary],
                          strategy: str) -> None:
    SLIPS_OUT.write_text(json.dumps({
        "verified": True,
        "source": ("scripts/worldcup_prediction_engine.py — three-spread slip generator; "
                   "LLM does not invent probabilities."),
        "generated_at": _utcnow(), "strategy": strategy,
        "slip_purpose": SLIP_PURPOSE,
        "single_vs_spread": {
            "single_top_pick_accuracy": summary.single_top_pick_accuracy if summary else None,
            "three_spread_coverage": summary.three_spread_coverage if summary else None,
            "betting_value_score": summary.betting_value_score if summary else None,
            "uplift": summary.uplift if summary else None,
            "in_sample": summary.in_sample if summary else None,
            "warnings": summary.warnings if summary else [],
        },
        "slips": {
            "A_mainline": [{"match_id": s.match_id, "team_a": s.team_a, "team_b": s.team_b, "pick": s.variation_a} for s in spreads if s.variation_a],
            "B_draw_protection": [{"match_id": s.match_id, "team_a": s.team_a, "team_b": s.team_b, "pick": s.variation_b} for s in spreads if s.variation_b],
            "C_alternate_winner": [{"match_id": s.match_id, "team_a": s.team_a, "team_b": s.team_b, "pick": s.variation_c} for s in spreads if s.variation_c],
        },
        "selections": [asdict(s) for s in spreads],
    }, indent=2, ensure_ascii=False))
    PREDICTIONS_OUT.write_text(json.dumps({
        "verified": True,
        "source": "scripts/worldcup_prediction_engine.py — per-fixture spread selections.",
        "generated_at": _utcnow(), "strategy": strategy,
        "selections": [asdict(s) for s in spreads],
    }, indent=2, ensure_ascii=False))
    LOG.info("wrote slips -> %s and predictions -> %s", SLIPS_OUT, PREDICTIONS_OUT)


def save_predictions_csv(rows: list[BacktestRow]) -> None:
    if not rows:
        return
    with PREDICTIONS_CSV.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(asdict(rows[0]).keys()))
        w.writeheader()
        for r in rows:
            w.writerow(asdict(r))
    LOG.info("wrote predictions CSV -> %s", PREDICTIONS_CSV)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def _universe(matches: list[Match]) -> list[str]:
    teams: set[str] = set()
    for m in matches:
        teams.add(m.team_a)
        teams.add(m.team_b)
    return sorted(teams)


def run_backtest(history: list[Match], strategy: str, runs: int,
                in_sample: bool = True,
                mp_denoise: bool = False,
                mp_factor: float = 1.0,
                quantum: bool = False,
                l2: float = 0.01,
                gbm_max_iter: int = 120,
                gbm_max_depth: int = 4,
                gbm_lr: float = 0.08) -> tuple[BacktestSummary, list[BacktestRow], dict, bool]:
    universe = _universe(history)
    boosts = _fit_boosts(history, universe,
                         max_iter=gbm_max_iter, max_depth=gbm_max_depth,
                         learning_rate=gbm_lr)
    state = TeamState()
    weight_rows: list[tuple[dict[str, tuple], str]] = []
    for m in history:
        _, per_model = _predict_one(state, m, universe, SAFE_DEFAULT_WEIGHTS, boosts)
        if m.actual_outcome:
            weight_rows.append((per_model, m.actual_outcome))
        state.update(m)
    if mp_denoise:
        LOG.info("applying Marchenko–Pastur denoising (factor=%.3f) to %d weight rows",
                 mp_factor, len(weight_rows))
        weight_rows = mp_denoise_per_outcome(weight_rows, factor=mp_factor)
    weights, learned = _optimise_weights(weight_rows, l2=l2)
    assessor = QuantumAssessor() if quantum and QuantumAssessor is not None else None
    rows = sequential_no_lookahead_backtest(history, weights, strategy, boosts, universe,
                                            quantum=quantum, assessor=assessor)
    summary = compare_single_vs_spread(rows, runs, in_sample=in_sample)
    return summary, rows, weights, learned


def generate_slips(matches: list[Match], warm_history: list[Match], weights: dict[str, float],
                   strategy: str, boosts: dict[str, _BoostProxy],
                   quantum: bool = False) -> list[SpreadSelection]:
    preset = STRATEGY_PRESETS[strategy]
    universe = _universe(warm_history + matches)
    state = TeamState()
    for m in warm_history:
        state.update(m)
    spreads: list[SpreadSelection] = []
    risks: dict[str, RiskAssessment] = {}
    assessor = QuantumAssessor() if quantum and QuantumAssessor is not None else None
    for m in matches:
        pred, per_model = _predict_one(state, m, universe, weights, boosts)
        if quantum and assessor is not None:
            qs = assessor.assess(m, pred, per_model, state)
            qpred = ModelPrediction(
                m.match_id,
                round(float(qs.evolved_probs[0]), 4),
                round(float(qs.evolved_probs[1]), 4),
                round(float(qs.evolved_probs[2]), 4),
                CLASSES[int(np.argmax(qs.evolved_probs))],
                per_model,
            )
            risk = quantum_classify_treatment(qs, qpred, m, preset)
            spread = generate_three_spread(m, qpred, risk, qs=qs)
        else:
            risk = classify_treatment(pred, per_model, m, preset)
            spread = generate_three_spread(m, pred, risk)
        risks[m.match_id] = risk
        spreads.append(spread)
    spreads, _ = apply_stake_cost_guards(spreads, risks)
    return spreads


def write_engine_predictions(fixtures: list[Match], warm_history: list[Match],
                             weights: dict[str, float], strategy: str,
                             boosts: dict[str, _BoostProxy],
                             quantum: bool = False) -> int:
    """Own wc2026_model_predictions.json — the file the live Next-12 UI reads.

    Retires the old wc2026_predictor.py as the source: writes the new ensemble's
    per-fixture probabilities + treatment + three-spread (+ SBS link) into the
    all_fixture_predictions / md2_predictions shape the page consumes, merging
    into the existing file so non-prediction keys are preserved.
    """
    preset = STRATEGY_PRESETS[strategy]
    universe = _universe(warm_history + fixtures)
    spreads = generate_slips(fixtures, warm_history, weights, strategy, boosts, quantum=quantum)
    spread_by_id = {s.match_id: s for s in spreads}

    try:
        from sbs_watch_links import refresh_watch_links  # type: ignore
        links = refresh_watch_links()
    except Exception as exc:  # noqa: BLE001
        LOG.warning("SBS links unavailable for predictions: %s", exc)
        links = {}

    state = TeamState()
    for m in warm_history:
        state.update(m)

    all_fp: dict[str, dict] = {}
    md2: list[dict] = []
    for m in fixtures:
        sp = spread_by_id.get(m.match_id)
        # If quantum wrapper was used, probabilities in the spread are already wrapped.
        if sp is not None:
            pred = ModelPrediction(
                m.match_id, sp.p_home, sp.p_draw, sp.p_away,
                max(((HOME, sp.p_home), (DRAW, sp.p_draw), (AWAY, sp.p_away)), key=lambda kv: kv[1])[0]
            )
        else:
            pred, _ = _predict_one(state, m, universe, weights, boosts)
        # Score must agree with the pick (pred.top_pick): constrain the modal
        # cell to the predicted outcome class so score never contradicts pick.
        mh, ma = most_likely_score(state, m, outcome=pred.top_pick)
        score = f"{mh}-{ma}"
        n = int(m.match_id) if str(m.match_id).isdigit() else m.match_id
        wl = links.get(str(m.match_id))
        entry = {
            "n": n, "home": m.team_a, "away": m.team_b, "status": "predicted",
            "p_home": round(pred.p_home, 4), "p_draw": round(pred.p_draw, 4),
            "p_away": round(pred.p_away, 4), "predicted_wdl": pred.top_pick,
            "predicted_score": score,
            "treatment": sp.treatment if sp else None,
            "three_spread": ({"A": sp.variation_a, "B": sp.variation_b, "C": sp.variation_c}
                             if sp else None),
        }
        from dataclasses import asdict as _asdict
        if wl is not None:
            entry["watch_link"] = _asdict(wl)
        all_fp[str(n)] = entry
        md2.append({"n": n, "home": m.team_a, "away": m.team_b, "expected_score": score,
                    "p_home": entry["p_home"], "p_draw": entry["p_draw"],
                    "p_away": entry["p_away"], "predicted_wdl": pred.top_pick})

    out_path = DATA_DIR / "wc2026_model_predictions.json"
    doc: dict = {}
    if out_path.exists():
        try:
            doc = json.loads(out_path.read_text())
        except (OSError, ValueError):
            doc = {}
    doc["all_fixture_predictions"] = all_fp
    doc["md2_predictions"] = md2[:16]
    doc["generated_at"] = _utcnow()
    doc["prediction_source"] = "worldcup_prediction_engine"
    doc["model"] = "three_spread_ensemble_v1"
    doc["verified"] = True
    doc["source"] = ("scripts/worldcup_prediction_engine.py --mode predict-upcoming "
                     "— ensemble probabilities + draw-calibrated pick + three-spread "
                     "treatment; replaces the retired wc2026_predictor.py as the "
                     "Next-12 source.")
    out_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    LOG.info("wrote engine predictions -> %s (%d fixtures)", out_path, len(all_fp))
    return len(all_fp)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="WC2026 three-spread coverage engine")
    parser.add_argument("--mode", choices=["sandbox", "backtest", "quantum-backtest", "walk-forward", "predict", "predict-upcoming"], default="sandbox")
    parser.add_argument("--strategy", choices=list(STRATEGY_PRESETS), default="balanced")
    parser.add_argument("--runs", type=int, default=10000)
    parser.add_argument("--mp-denoise", action="store_true",
                        help="Apply Marchenko–Pastur eigenvalue clipping to per-model probabilities before weight learning")
    parser.add_argument("--mp-factor", type=float, default=1.0,
                        help="Scale the MP upper edge (default 1.0; lower = keep more eigenvalues)")
    parser.add_argument("--quantum", action="store_true",
                        help="Use the quantum-inspired market-state wrapper around the base ensemble")
    parser.add_argument("--lock-min-score", type=float, default=None)
    parser.add_argument("--lock-min-confidence", type=float, default=None)
    parser.add_argument("--lock-min-robustness", type=float, default=None)
    parser.add_argument("--exclude-max-confidence", type=float, default=None)
    parser.add_argument("--l2", type=float, default=0.0001, help="L2 regularisation on ensemble weight learning")
    parser.add_argument("--gbm-iter", type=int, default=120, help="Gradient-boosting proxy iterations")
    parser.add_argument("--gbm-depth", type=int, default=4, help="Gradient-boosting proxy max depth")
    parser.add_argument("--gbm-lr", type=float, default=0.08, help="Gradient-boosting proxy learning rate")
    parser.add_argument("--extreme-entropy", type=float, default=None, help="Override EXCLUDE entropy threshold")
    parser.add_argument("--extreme-margin", type=float, default=None, help="Override EXCLUDE margin threshold")
    parser.add_argument("--rotate-entropy", type=float, default=None, help="Override ROTATE entropy threshold")
    parser.add_argument("--folds", type=int, default=5, help="Walk-forward folds")
    parser.add_argument("--majority-pick", action="store_true", help="Use plurality model vote for single pick instead of blended argmax")
    parser.add_argument("--weight-objective", choices=["logloss", "accuracy"], default="logloss",
                        help="Objective for ensemble weight learning")
    parser.add_argument("--drop-models", type=str, default=None,
                        help="Comma-separated list of model names to exclude from the ensemble")
    parser.add_argument("--market-alpha", type=float, default=0.25,
                        help="Blend fraction of de-vigged market odds into final probs when available (0=off)")
    parser.add_argument("--historical", type=str, default=None)
    parser.add_argument("--fixtures", type=str, default=None)
    args = parser.parse_args(argv)

    # Apply quantum threshold overrides before any run
    if args.lock_min_score is not None:
        QUANTUM_CFG["lock_min_score"] = args.lock_min_score
    if args.lock_min_confidence is not None:
        QUANTUM_CFG["lock_min_confidence"] = args.lock_min_confidence
    if args.lock_min_robustness is not None:
        QUANTUM_CFG["lock_min_robustness"] = args.lock_min_robustness
    if args.exclude_max_confidence is not None:
        QUANTUM_CFG["exclude_max_confidence"] = args.exclude_max_confidence

    # Apply strategy threshold overrides for the selected strategy only
    if args.extreme_entropy is not None or args.extreme_margin is not None or args.rotate_entropy is not None:
        STRATEGY_PRESETS[args.strategy] = {
            "extreme_entropy": args.extreme_entropy if args.extreme_entropy is not None else STRATEGY_PRESETS[args.strategy]["extreme_entropy"],
            "extreme_margin": args.extreme_margin if args.extreme_margin is not None else STRATEGY_PRESETS[args.strategy]["extreme_margin"],
            "rotate_entropy": args.rotate_entropy if args.rotate_entropy is not None else STRATEGY_PRESETS[args.strategy]["rotate_entropy"],
        }

    global USE_MAJORITY_PICK, WEIGHT_OBJECTIVE, MARKET_ALPHA
    USE_MAJORITY_PICK = args.majority_pick
    WEIGHT_OBJECTIVE = args.weight_objective
    MARKET_ALPHA = max(0.0, min(1.0, args.market_alpha))

    if args.drop_models:
        drop = {x.strip() for x in args.drop_models.split(",") if x.strip()}
        global MODEL_FUNCS
        MODEL_FUNCS = [(n, f) for n, f in MODEL_FUNCS if n not in drop]
        LOG.info("dropping models: %s", sorted(drop))

    if args.mode == "sandbox":
        history = load_sandbox()
        LOG.info("SANDBOX mode: %d embedded completed matches", len(history))
    else:
        hist_path = Path(args.historical) if args.historical else HISTORICAL_CSV
        history = load_historical_matches(hist_path)
        LOG.info("loaded %d historical matches from %s", len(history), hist_path)
    if not history:
        LOG.error("no matches loaded — aborting")
        return 1

    # Fast path: predict-upcoming owns wc2026_model_predictions.json (the live
    # Next-12 source) without the heavy backtest/weight-learning.
    if args.mode == "predict-upcoming":
        fix_path = Path(args.fixtures) if args.fixtures else FIXTURES_JSON
        fixtures = load_fixtures(fix_path, exclude_played=True)
        if not fixtures:
            LOG.error("predict-upcoming: no fixtures loaded — aborting")
            return 1
        # Use the PROMOTED active model's weights (from the continuous-learning
        # loop) when present, so predictions reflect what was validated as best.
        # Fall back to safe defaults if no active model has been promoted yet.
        weights = SAFE_DEFAULT_WEIGHTS
        active_path = DATA_DIR / "wc2026_active_model.json"
        if active_path.exists():
            try:
                aw = json.loads(active_path.read_text()).get("ensemble_weights")
                if isinstance(aw, dict) and aw:
                    weights = aw
                    LOG.info("using promoted active-model weights")
            except (OSError, ValueError):
                pass
        # Skip the gradient-boosting proxies here: fitting them (sklearn HistGBM,
        # multi-core) is the only slow phase and dominates runtime under load,
        # while the analytical ensemble renders the Next-12 in well under a second.
        n = write_engine_predictions(fixtures, history, weights, args.strategy, {}, quantum=args.quantum)
        LOG.info("predict-upcoming wrote %d fixture predictions", n)
        return 0

    if args.mode == "walk-forward":
        summary, rows, weights = walk_forward_backtest(history, args.strategy, n_folds=args.folds,
                                                       quantum=args.quantum, l2=args.l2,
                                                       gbm_max_iter=args.gbm_iter,
                                                       gbm_max_depth=args.gbm_depth,
                                                       gbm_lr=args.gbm_lr)
        learned = False
        window = f"{history[0].date}..{history[-1].date} ({len(history)} matches)"
        save_model_registry(weights, learned, summary, window)
        save_results_json(summary, rows, args.strategy)
        save_predictions_csv(rows)
        print_match_table(rows)
        print_report(summary, args.strategy, learned)
        return 0

    summary, rows, weights, learned = run_backtest(history, args.strategy, args.runs,
                                                   in_sample=True, mp_denoise=args.mp_denoise,
                                                   mp_factor=args.mp_factor,
                                                   quantum=(args.mode == "quantum-backtest" or args.quantum),
                                                   l2=args.l2,
                                                   gbm_max_iter=args.gbm_iter,
                                                   gbm_max_depth=args.gbm_depth,
                                                   gbm_lr=args.gbm_lr)
    window = f"{history[0].date}..{history[-1].date} ({len(history)} matches)"
    save_model_registry(weights, learned, summary, window)
    save_results_json(summary, rows, args.strategy)
    save_predictions_csv(rows)

    boosts = _fit_boosts(history, _universe(history),
                         max_iter=args.gbm_iter, max_depth=args.gbm_depth,
                         learning_rate=args.gbm_lr)
    fix_path = Path(args.fixtures) if args.fixtures else FIXTURES_JSON
    fixtures = load_fixtures(fix_path) if args.mode != "sandbox" else []
    if fixtures:
        spreads = generate_slips(fixtures, history, weights, args.strategy, boosts,
                                quantum=(args.mode == "quantum-backtest" or args.quantum))
        # Own the live Next-12 source with fresh ensemble predictions (retires
        # the old wc2026_predictor.py as that section's writer).
        write_engine_predictions(fixtures, history, weights, args.strategy, boosts,
                                quantum=(args.mode == "quantum-backtest" or args.quantum))
    else:
        spreads = generate_slips(history, [], weights, args.strategy, boosts,
                                quantum=(args.mode == "quantum-backtest" or args.quantum))
    save_predictions_json(spreads, summary, args.strategy)

    print_match_table(rows)
    print_report(summary, args.strategy, learned)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
