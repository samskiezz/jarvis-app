#!/usr/bin/env python3
"""Quantum-inspired market-state wrapper around the WC2026 base ensemble.

This module transposes the quantum/RMT ideas from the project design into a
modular betting layer:

  1. Calibrate the base model output.
  2. Compare to de-vigged market probability.
  3. Represent the event as a mixture of hidden scenarios (density matrix).
  4. Evolve the state with timestamped operators (market, form, regime, ...).
  5. Filter fake correlation with RMT eigenvalue clipping.
  6. Model dependencies (entanglement) between coupled markets / legs.
  7. Apply edge decay (decoherence) as the market absorbs information.
  8. Weight signals by interference (agreement / conflict).
  9. Stress-test assumptions for robustness.
 10. Penalise correlated exposure in a multi-leg slip.
 11. Size bets with fractional Kelly over the adjusted edge.

The base model remains the base predictor; this layer is a wrapper around it.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

import numpy as np

HOME, DRAW, AWAY = "H", "D", "A"
CLASSES = (HOME, DRAW, AWAY)
IDX = {HOME: 0, DRAW: 1, AWAY: 2}

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"

# ---------------------------------------------------------------------------
# 1. Calibration layer
# ---------------------------------------------------------------------------
class IsotonicCalibrator:
    """Load the project's per-class isotonic calibrator and transform raw probs."""

    def __init__(self, path: Path = DATA_DIR / "wc2026_isotonic_calibrator.json") -> None:
        self._maps: dict[str, tuple[np.ndarray, np.ndarray]] = {}
        if path.exists():
            try:
                doc = json.loads(path.read_text())
                for key in CLASSES:
                    entry = doc.get("calibrators", {}).get(key)
                    if entry:
                        xs = np.asarray(entry["X_thresholds"], dtype=float)
                        ys = np.asarray(entry["y_thresholds"], dtype=float)
                        self._maps[key] = (xs, ys)
            except (OSError, ValueError, KeyError):
                pass

    def transform(self, raw: tuple[float, float, float]) -> np.ndarray:
        if not self._maps:
            return np.asarray(raw, dtype=float)
        out = np.zeros(3)
        for key, idx in IDX.items():
            xs, ys = self._maps[key]
            out[idx] = float(np.interp(raw[idx], xs, ys))
        s = out.sum()
        if s > 0:
            out /= s
        else:
            out[:] = 1.0 / 3.0
        return out


# ---------------------------------------------------------------------------
# 2. Market de-vigging
# ---------------------------------------------------------------------------
def remove_vig(book_odds: dict[str, float]) -> dict[str, float]:
    """Simple multiplicative de-vigging for home/draw/away decimal odds."""
    raw = {k: 1.0 / float(v) for k, v in book_odds.items() if float(v) > 1.0}
    total = sum(raw.values()) or 1.0
    return {k: v / total for k, v in raw.items()}


def market_probabilities(odds: Optional[dict]) -> Optional[np.ndarray]:
    if not odds:
        return None
    try:
        fair = remove_vig({"home": odds["home"], "draw": odds["draw"], "away": odds["away"]})
        return np.array([fair["home"], fair["draw"], fair["away"]], dtype=float)
    except (KeyError, ValueError, ZeroDivisionError):
        return None


# ---------------------------------------------------------------------------
# 3. Scenario / density-matrix state
# ---------------------------------------------------------------------------
@dataclass
class ScenarioState:
    name: str
    vector: np.ndarray
    weight: float


@dataclass
class QuantumState:
    """Container for all quantum-layer outputs for a single event."""
    rho: np.ndarray                                   # 3x3 density matrix
    scenarios: list[ScenarioState]                    # scenario mixture
    market_probs: np.ndarray                          # de-vigged market 1X2
    calibrated_probs: np.ndarray                      # after isotonic calibration
    evolved_probs: np.ndarray                         # after operators + decoherence
    edge: np.ndarray                                  # model - market per outcome
    ev: np.ndarray                                    # expected value per outcome
    confidence: float                                 # interference confidence
    robustness: float                                 # stress-test robustness
    data_quality: float                               # Q_t
    liquidity: float                                  # L_t
    decay: float                                      # D_t
    regime: float                                     # S_t (regime suitability)
    exposure_penalty: float                           # phi_i
    vortex_coherence: float                           # V_i (density-matrix purity / phase coherence)
    bet_score: np.ndarray                             # per-outcome score
    kelly_fraction: np.ndarray                        # per-outcome Kelly fraction
    observables: dict[str, np.ndarray] = field(default_factory=dict)


def _entropy(p: np.ndarray) -> float:
    return -sum(pi * math.log(max(pi, 1e-12)) for pi in p)


def _normalised_entropy(p: np.ndarray) -> float:
    return _entropy(p) / math.log(3.0)


def _outer(v: np.ndarray) -> np.ndarray:
    return np.outer(v, v)


def build_scenario_vectors(match: Any, base_probs: np.ndarray,
                           market_probs: Optional[np.ndarray],
                           state: Any, per_model: dict[str, tuple]) -> dict[str, np.ndarray]:
    """Build the hidden-scenario vectors that form the density matrix."""
    h, d, a = base_probs
    scenarios: dict[str, np.ndarray] = {}
    scenarios["base"] = base_probs.copy()

    # Market-implied scenario (sharp money / public information)
    if market_probs is not None:
        scenarios["market"] = market_probs.copy()
    else:
        scenarios["market"] = base_probs.copy()

    # Draw-heavy scenario (World Cup draw bias)
    if d < 0.50:
        draw_shift = min(0.15, 0.5 * (0.50 - d))
        dh = np.array([max(h - draw_shift / 2, 0.01), d + draw_shift, max(a - draw_shift / 2, 0.01)])
    else:
        dh = np.array([h, d, a])
    dh /= dh.sum()
    scenarios["draw_heavy"] = dh

    # Underdog/upset scenario
    under = np.array([a, d, h])  # mirror home/away
    under /= under.sum()
    scenarios["underdog"] = under

    # Momentum / form scenario
    form_a = getattr(state, "form", lambda _t: 0.5)(match.team_a)
    form_b = getattr(state, "form", lambda _t: 0.5)(match.team_b)
    form_diff = form_a - form_b
    e = 1.0 / (1.0 + math.exp(-form_diff * 3.0))
    draw = 0.27
    scenarios["momentum"] = np.array([e * (1 - draw), draw, (1 - e) * (1 - draw)])

    # Injury/news scenario: proxy = market-model divergence shifts probability
    if market_probs is not None:
        injury = base_probs + 0.5 * (market_probs - base_probs)
        injury = np.clip(injury, 0.01, 0.99)
        injury /= injury.sum()
    else:
        injury = base_probs.copy()
    scenarios["injury_news"] = injury

    # Weather/venue scenario: neutral venues reduce home edge
    if getattr(match, "neutral", True):
        wv = np.array([0.5 * h + 0.25, d, 0.5 * a + 0.25])
    else:
        wv = np.array([min(h * 1.15, 0.95), d * 0.95, max(a * 0.85, 0.01)])
    wv = np.clip(wv, 0.01, 0.99)
    wv /= wv.sum()
    scenarios["weather_venue"] = wv

    # Liquidity/sharpness scenario: when market and model agree, trust market more
    if market_probs is not None:
        sharp = 0.5 * base_probs + 0.5 * market_probs
        sharp /= sharp.sum()
    else:
        sharp = base_probs.copy()
    scenarios["liquidity_sharp"] = sharp

    # Regime scenario: favourite-heavy vs underdog-heavy
    maxp = max(h, d, a)
    if maxp >= 0.60:
        regime = np.array([h * 1.05 if h == maxp else h * 0.95,
                           d * 0.95 if d != maxp else d * 1.05,
                           a * 1.05 if a == maxp else a * 0.95])
    else:
        regime = np.array([h * 0.95, d * 1.10, a * 0.95])
    regime = np.clip(regime, 0.01, 0.99)
    regime /= regime.sum()
    scenarios["regime"] = regime

    # Bookmaker-bias scenario: exaggerate model edge over market
    if market_probs is not None:
        bias = base_probs + 0.3 * (base_probs - market_probs)
        bias = np.clip(bias, 0.01, 0.99)
        bias /= bias.sum()
    else:
        bias = base_probs.copy()
    scenarios["bookmaker_bias"] = bias

    return scenarios


def scenario_weights(scenarios: dict[str, np.ndarray], base_probs: np.ndarray,
                     market_probs: Optional[np.ndarray], per_model: dict[str, tuple],
                     state: Any, match: Any) -> dict[str, float]:
    """Set mixture weights for each scenario vector."""
    h, d, a = base_probs
    norm_ent = _normalised_entropy(base_probs)

    # Base model: anchor the mixture; never let speculative scenarios dominate
    w_base = 0.5 + 0.5 * max(0.0, 1.0 - norm_ent)

    # Market: higher weight when market data exists and is close to model
    if market_probs is not None:
        market_agree = 1.0 - np.abs(base_probs - market_probs).sum() / 2.0
        w_market = 0.4 + 0.4 * market_agree
    else:
        w_market = 0.1

    # Draw-heavy: boost when draw is plausible
    w_draw = 0.2 + 0.6 * max(0.0, d - 0.20)

    # Underdog: boost when match is close
    w_under = 0.2 + 0.5 * (1.0 - abs(h - a))

    # Momentum: boost when recent form is strong
    form_a = getattr(state, "form", lambda _t: 0.5)(match.team_a)
    form_b = getattr(state, "form", lambda _t: 0.5)(match.team_b)
    w_momentum = 0.2 + 0.6 * abs(form_a - form_b)

    # Injury/news: higher when market diverges from model (unpriced info)
    if market_probs is not None:
        divergence = np.abs(base_probs - market_probs).sum() / 2.0
        w_injury = 0.2 + 0.6 * divergence
    else:
        w_injury = 0.2

    # Weather/venue
    w_weather = 0.2 if getattr(match, "neutral", True) else 0.35

    # Liquidity/sharpness
    w_liquidity = 0.3 if market_probs is not None else 0.1

    # Regime
    w_regime = 0.25

    # Bookmaker bias
    if market_probs is not None:
        w_bias = 0.2 + 0.4 * np.abs(base_probs - market_probs).sum() / 2.0
    else:
        w_bias = 0.1

    weights = {
        "base": w_base,
        "market": w_market,
        "draw_heavy": w_draw,
        "underdog": w_under,
        "momentum": w_momentum,
        "injury_news": w_injury,
        "weather_venue": w_weather,
        "liquidity_sharp": w_liquidity,
        "regime": w_regime,
        "bookmaker_bias": w_bias,
    }
    # Drop scenarios that are not present (should all be present here)
    weights = {k: v for k, v in weights.items() if k in scenarios}
    s = sum(weights.values()) or 1.0
    return {k: v / s for k, v in weights.items()}


def build_density_matrix(scenarios: dict[str, np.ndarray],
                         weights: dict[str, float]) -> np.ndarray:
    dim = len(scenarios["base"])
    rho = np.zeros((dim, dim))
    for name, vec in scenarios.items():
        pi = weights.get(name, 0.0)
        rho += pi * _outer(vec)
    # Ensure trace = 1 and PSD
    rho = (rho + rho.T) / 2.0
    tr = np.trace(rho)
    if tr > 0:
        rho /= tr
    return rho


# ---------------------------------------------------------------------------
# 4. Evolution operators (non-commutative updates)
# ---------------------------------------------------------------------------
def _stochastic_shift(dim: int, from_idx: int, to_idx: int, alpha: float) -> np.ndarray:
    """Build a stochastic matrix that moves alpha mass from from_idx to to_idx."""
    U = np.eye(dim)
    U[from_idx, from_idx] = 1.0 - alpha
    U[to_idx, from_idx] = alpha
    return U


def build_operator(name: str, rho: np.ndarray, update: Any, strength: float) -> np.ndarray:
    """Build a CPTP-like update operator for a given information source."""
    dim = rho.shape[0]
    if name == "market":
        # Shift toward market-implied probabilities
        market_vec = update["vector"]
        alpha = min(0.95, strength)
        U = (1.0 - alpha) * np.eye(dim) + alpha * np.ones((dim, dim)) * market_vec[:, None]
    elif name == "form":
        # Shift toward form-based expectation
        form_vec = update["vector"]
        alpha = min(0.8, strength)
        U = (1.0 - alpha) * np.eye(dim) + alpha * np.ones((dim, dim)) * form_vec[:, None]
    elif name == "injury":
        # Apply directional shock to a specific outcome
        shock = update.get("shock", np.zeros(dim))
        U = np.eye(dim)
        for i in range(dim):
            for j in range(dim):
                if i != j and shock[j] > 0:
                    U[i, j] += strength * shock[j]
        U = U / (U.sum(axis=0, keepdims=True) + 1e-12)
    elif name == "weather":
        # Reduce home advantage / increase draw
        U = np.eye(dim)
        U[0, 0] = 1.0 - strength * 0.2
        U[1, 0] = strength * 0.2
    elif name == "liquidity":
        # High liquidity pulls state toward market
        market_vec = update["vector"]
        alpha = min(0.9, strength)
        U = (1.0 - alpha) * np.eye(dim) + alpha * np.ones((dim, dim)) * market_vec[:, None]
    elif name == "regime":
        # Shift toward favourite or draw-heavy regime
        regime_vec = update["vector"]
        alpha = min(0.7, strength)
        U = (1.0 - alpha) * np.eye(dim) + alpha * np.ones((dim, dim)) * regime_vec[:, None]
    elif name == "bookmaker_bias":
        # Correct known bookmaker bias by moving opposite to market
        bias_vec = update["vector"]
        alpha = min(0.5, strength)
        U = (1.0 - alpha) * np.eye(dim) + alpha * np.ones((dim, dim)) * bias_vec[:, None]
    else:
        U = np.eye(dim)
    # Column-stochastic check
    col_sums = U.sum(axis=0)
    col_sums[col_sums == 0] = 1.0
    U = U / col_sums
    return U


def evolve_state(rho: np.ndarray, operators: list[np.ndarray],
                 decay_rate: float) -> np.ndarray:
    """Apply operators in order, then decoherence (diagonal damping)."""
    for U in operators:
        rho = U @ rho @ U.T
    # Re-normalise trace after each step
    tr = np.trace(rho)
    if tr > 0:
        rho /= tr
    # Decoherence: suppress off-diagonal coherence as market absorbs info
    diag = np.diag(np.diag(rho))
    rho = (1.0 - decay_rate) * rho + decay_rate * diag
    rho = (rho + rho.T) / 2.0
    tr = np.trace(rho)
    if tr > 0:
        rho /= tr
    return rho


# ---------------------------------------------------------------------------
# 5. RMT noise filter
# ---------------------------------------------------------------------------
def rmt_clean_correlation(X: np.ndarray, factor: float = 1.0) -> np.ndarray:
    """Clean a feature/residual covariance matrix with MP eigenvalue clipping."""
    n, p = X.shape
    if p < 3 or n < p:
        return np.corrcoef(X, rowvar=False) if p > 1 else np.eye(p)
    means = np.mean(X, axis=0)
    stds = np.std(X, axis=0, ddof=0)
    stds[stds == 0] = 1.0
    Z = (X - means) / stds
    try:
        _, S, Vt = np.linalg.svd(Z, full_matrices=False)
    except np.linalg.LinAlgError:
        return np.corrcoef(X, rowvar=False)
    eigvals = (S ** 2) / n
    gamma = p / n
    lambda_plus = factor * (1.0 + math.sqrt(gamma)) ** 2
    clean_eig = eigvals.copy()
    clean_eig[clean_eig <= lambda_plus] = 0.0
    # Reconstruct cleaned covariance (correlation-scale)
    clean_S = np.sqrt(np.maximum(clean_eig * n, 0.0))
    Z_clean = Vt.T @ np.diag(clean_S) @ Vt / math.sqrt(n)
    C_clean = np.corrcoef(Z_clean, rowvar=False)
    return C_clean


def per_model_disagreement(per_model: dict[str, tuple]) -> float:
    vecs = [np.asarray(v) for v in per_model.values() if v is not None]
    if len(vecs) < 2:
        return 0.0
    arr = np.stack(vecs)
    return float(np.std(arr, axis=0).mean())


# ---------------------------------------------------------------------------
# 6. Entanglement / dependency helpers
# ---------------------------------------------------------------------------
def bet_correlation(bet_a: dict[str, Any], bet_b: dict[str, Any],
                    corr_clean: Optional[np.ndarray] = None) -> float:
    """Estimate dependency between two bets (same team / market overlap)."""
    score = 0.0
    if bet_a.get("team_a") == bet_b.get("team_a") or bet_a.get("team_a") == bet_b.get("team_b"):
        score += 0.35
    if bet_a.get("team_b") == bet_b.get("team_a") or bet_a.get("team_b") == bet_b.get("team_b"):
        score += 0.35
    if bet_a.get("market") == bet_b.get("market"):
        score += 0.20
    if bet_a.get("stage") == bet_b.get("stage"):
        score += 0.10
    return min(1.0, score)


def exposure_penalty(candidate: dict[str, Any], open_bets: Sequence[dict[str, Any]],
                     corr_clean: Optional[np.ndarray] = None) -> float:
    if not open_bets:
        return 0.0
    total = 0.0
    weights = 0.0
    for ob in open_bets:
        rho = bet_correlation(candidate, ob, corr_clean)
        stake = ob.get("stake_fraction", 0.0)
        total += rho * stake
        weights += stake if stake > 0 else 1.0
    penalty = total / (weights + 1e-12)
    return min(1.0, penalty)


# ---------------------------------------------------------------------------
# 7. Decoherence / edge decay
# ---------------------------------------------------------------------------
def days_to_start(match_date: str, ref_date: Optional[datetime] = None) -> float:
    ref_date = ref_date or datetime.now(timezone.utc)
    try:
        d = datetime.fromisoformat(match_date)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return max(0.0, (d - ref_date).total_seconds() / 86400.0)
    except (ValueError, TypeError):
        return 0.0


def decoherence_rate(match_date: str, liquidity: float,
                     ref_date: Optional[datetime] = None) -> float:
    """Edges decay as the market absorbs information."""
    days = days_to_start(match_date, ref_date)
    # Higher liquidity / closer to start -> faster absorption
    lam = 0.03 + 0.10 * liquidity + 0.05 * math.exp(-days / 7.0)
    return math.exp(-lam * days)


# ---------------------------------------------------------------------------
# 8. Interference / signal confidence
# ---------------------------------------------------------------------------
def interference_confidence(signals: list[dict[str, Any]]) -> float:
    """Vector-sum confidence from aligned/conflicting probability signals.

    Probability vectors that point in similar directions reinforce; vectors that
    point in opposite directions partially cancel. The result is scaled to [0,1].
    """
    if not signals:
        return 0.5
    total = np.zeros(3)
    denom = 0.0
    for sig in signals:
        r = sig.get("reliability", 0.5)
        s = sig.get("strength", 0.5)
        v = np.asarray(sig.get("vector", np.ones(3) / 3.0))
        amp = r * s
        total += amp * v
        denom += amp
    if denom <= 0:
        return 0.5
    return float(min(1.0, np.linalg.norm(total) / denom))


def build_signals(base_probs: np.ndarray, market_probs: Optional[np.ndarray],
                  per_model: dict[str, tuple]) -> list[dict[str, Any]]:
    signals = [{"reliability": 0.8, "strength": float(np.max(base_probs)), "vector": base_probs}]
    if market_probs is not None:
        signals.append({"reliability": 0.6, "strength": float(np.max(market_probs)), "vector": market_probs})
    for name, vec in per_model.items():
        if vec is None:
            continue
        v = np.asarray(vec)
        signals.append({"reliability": 0.4, "strength": float(np.max(v)), "vector": v})
    return signals


# ---------------------------------------------------------------------------
# 9. Robustness / stress test
# ---------------------------------------------------------------------------
def robustness_score(base_probs: np.ndarray, per_model: dict[str, tuple],
                     scenarios: dict[str, np.ndarray], weights: dict[str, float],
                     delta: float = 0.08) -> float:
    """Perturb scenario weights and base assumptions; return 1 - max relative edge change."""
    def probs_from(w: dict[str, float]) -> np.ndarray:
        rho = build_density_matrix(scenarios, w)
        p = np.diag(rho)
        return p / p.sum()

    base_edge = np.max(base_probs) - np.sort(base_probs)[-2]
    max_change = 0.0
    names = list(weights.keys())
    for i, name in enumerate(names):
        w2 = dict(weights)
        w2[name] = max(0.0, w2[name] + delta)
        w2 = {k: v / sum(w2.values()) for k, v in w2.items()}
        p2 = probs_from(w2)
        edge2 = np.max(p2) - np.sort(p2)[-2]
        max_change = max(max_change, abs(edge2 - base_edge))

    # Also perturb base model probability slightly
    for idx in range(3):
        p2 = base_probs.copy()
        p2[idx] = min(0.99, p2[idx] + delta)
        p2 /= p2.sum()
        edge2 = np.max(p2) - np.sort(p2)[-2]
        max_change = max(max_change, abs(edge2 - base_edge))

    return float(max(0.0, 1.0 - max_change / (base_edge + 0.01)))


# ---------------------------------------------------------------------------
# 10. Liquidity / data-quality / regime
# ---------------------------------------------------------------------------
def liquidity_score(match: Any, market_probs: Optional[np.ndarray]) -> float:
    if market_probs is None:
        return 0.4
    # World Cup matches are liquid; major stage liquid
    stage = getattr(match, "stage", "").lower()
    base = 0.75
    if "group" in stage:
        base = 0.80
    elif "knockout" in stage or "round" in stage or "final" in stage:
        base = 0.90
    # Tighter market-implied spread -> more liquid / efficient
    spread = float(np.max(market_probs) - np.min(market_probs))
    return float(min(1.0, base + 0.1 * (1.0 - spread)))


def data_quality_score(match: Any, per_model: dict[str, tuple]) -> float:
    # Penalise missing model inputs or odds
    missing = sum(1 for v in per_model.values() if v is None)
    total = max(1, len(per_model))
    present_ratio = 1.0 - missing / total
    return float(0.5 + 0.5 * present_ratio)


def regime_score(match: Any, base_probs: np.ndarray) -> float:
    """Regime suitability: avoid extreme favourites and extreme uncertainty."""
    maxp = float(np.max(base_probs))
    ent = _normalised_entropy(base_probs)
    # Sweet spot: confident favourite or close match, not total coin-flip
    if maxp >= 0.55 or ent <= 0.85:
        return float(min(1.0, 0.7 + 0.3 * (maxp - 0.55)))
    return float(max(0.4, 0.8 - ent))


# ---------------------------------------------------------------------------
# 11. Edge, EV, bet score, Kelly
# ---------------------------------------------------------------------------
def compute_edge(model_probs: np.ndarray, market_probs: Optional[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    if market_probs is None or market_probs.sum() <= 0:
        market_probs = np.ones(3) / 3.0
    edge = model_probs - market_probs
    # Approximate decimal odds from de-vigged market probability
    with np.errstate(divide="ignore", invalid="ignore"):
        odds = np.where(market_probs > 0, 1.0 / market_probs, 0.0)
    b = np.maximum(odds - 1.0, 0.0)
    ev = model_probs * odds - 1.0
    ev = np.nan_to_num(ev, nan=0.0, posinf=0.0, neginf=0.0)
    return edge, ev


def kelly_fraction(p: np.ndarray, b: np.ndarray, fractional: float = 0.20,
                   confidence: float = 1.0, robustness: float = 1.0,
                   data_quality: float = 1.0, liquidity: float = 1.0,
                   decay: float = 1.0, regime: float = 1.0,
                   exposure_penalty: float = 0.0,
                   vortex: float = 1.0) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        kelly = np.where(b > 0, (b * p - (1.0 - p)) / b, 0.0)
    kelly = np.nan_to_num(kelly, nan=0.0, posinf=0.0, neginf=0.0)
    penalties = confidence * robustness * data_quality * liquidity * decay * regime * (1.0 - exposure_penalty) * vortex
    frac = fractional * kelly * penalties
    return np.clip(frac, 0.0, 1.0)


def final_bet_score(edge: np.ndarray, confidence: float, robustness: float,
                    data_quality: float, liquidity: float, decay: float,
                    regime: float, exposure_penalty: float,
                    vortex: float = 1.0) -> np.ndarray:
    penalties = confidence * robustness * data_quality * liquidity * decay * regime * (1.0 - exposure_penalty) * vortex
    return edge * penalties


# ---------------------------------------------------------------------------
# 12. Top-level quantum assessment
# ---------------------------------------------------------------------------
class QuantumAssessor:
    def __init__(self, calibrator_path: Optional[Path] = None) -> None:
        self.calibrator = IsotonicCalibrator(calibrator_path or DATA_DIR / "wc2026_isotonic_calibrator.json")

    def assess(self, match: Any, base_pred: Any, per_model: dict[str, tuple],
               state: Any, open_bets: Optional[Sequence[dict[str, Any]]] = None,
               ref_date: Optional[datetime] = None) -> QuantumState:
        raw = np.asarray(base_pred.vector, dtype=float)
        cal = self.calibrator.transform(tuple(raw))
        # Blend calibrated and raw to avoid overfitting the small isotonic fit
        calibrated = 0.5 * raw + 0.5 * cal
        calibrated = np.clip(calibrated, 0.01, 0.99)
        calibrated /= calibrated.sum()
        market_probs = market_probabilities(getattr(match, "odds", None))

        scenarios = build_scenario_vectors(match, calibrated, market_probs, state, per_model)
        weights = scenario_weights(scenarios, calibrated, market_probs, per_model, state, match)
        rho = build_density_matrix(scenarios, weights)

        # Build timestamped operators (order matters)
        operators: list[np.ndarray] = []
        # 1. Market update
        if market_probs is not None:
            operators.append(build_operator("market", rho, {"vector": market_probs}, strength=0.20))
        # 2. Form/fatigue update
        form_a = getattr(state, "form", lambda _t: 0.5)(match.team_a)
        form_b = getattr(state, "form", lambda _t: 0.5)(match.team_b)
        form_diff = form_a - form_b
        e = 1.0 / (1.0 + math.exp(-form_diff * 3.0))
        operators.append(build_operator("form", rho, {"vector": np.array([e, 0.27, 1 - e])}, strength=0.15))
        # 3. Injury/news proxy (market divergence)
        if market_probs is not None:
            shock = calibrated - market_probs
            operators.append(build_operator("injury", rho, {"shock": shock}, strength=0.08))
        # 4. Weather/venue
        operators.append(build_operator("weather", rho, {}, strength=0.08 if getattr(match, "neutral", True) else 0.12))
        # 5. Liquidity / sharpness
        if market_probs is not None:
            operators.append(build_operator("liquidity", rho, {"vector": market_probs}, strength=0.10))
        # 6. Regime
        maxp = float(np.max(calibrated))
        if maxp >= 0.60:
            regime_vec = calibrated.copy()
        else:
            regime_vec = np.array([calibrated[0] * 0.9, calibrated[1] * 1.2, calibrated[2] * 0.9])
            regime_vec /= regime_vec.sum()
        operators.append(build_operator("regime", rho, {"vector": regime_vec}, strength=0.08))
        # 7. Bookmaker bias correction
        if market_probs is not None:
            bias_vec = calibrated + 0.2 * (calibrated - market_probs)
            bias_vec = np.clip(bias_vec, 0.01, 0.99)
            bias_vec /= bias_vec.sum()
            operators.append(build_operator("bookmaker_bias", rho, {"vector": bias_vec}, strength=0.05))

        # Decoherence rate
        L = liquidity_score(match, market_probs)
        decay = decoherence_rate(match.date, L, ref_date)
        rho = evolve_state(rho, operators, decay_rate=1.0 - decay)

        evolved = np.diag(rho).copy()
        evolved = np.clip(evolved, 0.01, 0.99)
        evolved /= evolved.sum()

        # Confidence / interference
        signals = build_signals(calibrated, market_probs, per_model)
        confidence = interference_confidence(signals)

        # Robustness
        robust = robustness_score(calibrated, per_model, scenarios, weights)

        # Quality scores
        Q = data_quality_score(match, per_model)
        S = regime_score(match, evolved)

        # Edge / EV
        edge, ev = compute_edge(evolved, market_probs)
        # Approximate decimal odds for Kelly (use market when available, else model-implied)
        with np.errstate(divide="ignore", invalid="ignore"):
            odds = np.where(market_probs > 0, 1.0 / market_probs, 1.0 / evolved) if market_probs is not None else (1.0 / evolved)
            b = np.maximum(odds - 1.0, 0.0)
            b = np.nan_to_num(b, nan=0.0, posinf=0.0, neginf=0.0)

        # Exposure penalty (for multi-leg context)
        candidate = {
            "team_a": match.team_a,
            "team_b": match.team_b,
            "market": "1x2",
            "stage": getattr(match, "stage", ""),
        }
        phi = exposure_penalty(candidate, open_bets or [])

        # Vortex / phase coherence = density-matrix purity (Tr(rho^2))
        vortex = float(np.trace(rho @ rho))

        bet_score = final_bet_score(edge, confidence, robust, Q, L, decay, S, phi, vortex=vortex)
        kelly = kelly_fraction(evolved, b, fractional=0.20,
                               confidence=confidence, robustness=robust,
                               data_quality=Q, liquidity=L, decay=decay,
                               regime=S, exposure_penalty=phi, vortex=vortex)

        return QuantumState(
            rho=rho, scenarios=[ScenarioState(n, v, weights.get(n, 0.0)) for n, v in scenarios.items()],
            market_probs=market_probs if market_probs is not None else np.zeros(3),
            calibrated_probs=calibrated, evolved_probs=evolved,
            edge=edge, ev=ev, confidence=round(confidence, 4),
            robustness=round(robust, 4), data_quality=round(Q, 4),
            liquidity=round(L, 4), decay=round(decay, 4), regime=round(S, 4),
            exposure_penalty=round(phi, 4), vortex_coherence=round(vortex, 4),
            bet_score=bet_score, kelly_fraction=kelly,
        )
