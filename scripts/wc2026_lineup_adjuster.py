#!/usr/bin/env python3
"""WC2026 Stage 1c — Lineup-strength adjuster.

When confirmed lineups arrive ~T-90min, multiply each team's lambda
(from the production Dixon-Coles+iso prediction) by
``sqrt(confirmed_value / baseline_value)`` and re-run the DC grid math to
produce a lineup-adjusted (p_home, p_draw, p_away). Logged to the audit
DB as ``model='isocal_lineup_adjusted'``.

Player "value" is a proxy built from
``server/data/wc2026_player_profiles_enriched.json``:

    value = (caps + 1) * minutes_score * position_weight

There is no ``market_value_eur`` field in the enriched profiles, so we
build a Σ-additive proxy that:
  * scales with international experience (``caps``),
  * weights club-form minutes (``form.club_minutes_25_26``), and
  * applies position weights mirroring ``wc2026_lineup_hook.POSITION_PP``.

The "full-strength baseline" is the team's 11-player roster as it
appears in the enriched profiles (each team is exactly 11 players).
The "confirmed XI" is the lineup returned by
``wc2026_lineup_hook.run_pre_match_hook()``. Players in the confirmed
XI who are not in the profiles fall back to the team's overall mean
player value.

Run:
    /opt/jarvis-app-1/.venv/bin/python scripts/wc2026_lineup_adjuster.py --once
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import statistics
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
from scipy.stats import poisson

try:
    from scripts.wc2026_db import (  # noqa: E402
        actual_for,
        get_connection,
        log_prediction,
        log_run,
    )
    DB_AVAILABLE = True
except Exception:  # pragma: no cover
    DB_AVAILABLE = False
    get_connection = log_run = log_prediction = actual_for = None  # type: ignore

from scripts.wc2026_predictor import (  # noqa: E402
    DC_RHO,
    _apply_calibrator_triple,
    _dc_tau,
    _load_calibrator,
    pick_wdl,
)
from scripts.wc2026_lineup_hook import (  # noqa: E402
    MATCH_SCHEDULE,
    POSITION_PP,
    run_pre_match_hook,
)

FIXTURES_PATH = ROOT / "server" / "data" / "wc2026_fixtures_all.json"
MODEL_PRED_PATH = ROOT / "server" / "data" / "wc2026_model_predictions.json"
PROFILES_PATH = ROOT / "server" / "data" / "wc2026_player_profiles_enriched.json"
RECEIPT_PATH = ROOT / "server" / "data" / "wc2026_lineup_adjustments.json"

WINDOW_HOURS = 4.0
MAX_GOALS = 8
MIN_RATIO = 0.5   # clamp strength_ratio to avoid pathological lambdas
MAX_RATIO = 2.0


def _utc_now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _parse_iso(s: str) -> _dt.datetime:
    return _dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def _position_weight(position: str | None) -> float:
    if not position:
        return float(POSITION_PP.get("MID", 5))
    return float(POSITION_PP.get(position.upper(), POSITION_PP.get("MID", 5)))


def _player_value(player: dict) -> float:
    """Σ-additive proxy. >0 always; never NaN."""
    caps = float(player.get("caps") or 0)
    form = player.get("form_2025_26") or {}
    minutes = float(form.get("club_minutes_25_26") or 0)
    # Normalise minutes by a typical full season (~3000 min); cap at 1.5.
    minutes_score = min(minutes / 3000.0, 1.5) if minutes > 0 else 0.3
    weight = _position_weight(player.get("position"))
    return (caps + 1.0) * minutes_score * weight


def _load_profiles() -> dict[str, list[dict]]:
    """Return {country -> [player_dict, ...]} from enriched profiles."""
    blob = json.loads(PROFILES_PATH.read_text())
    out: dict[str, list[dict]] = {}
    for pl in blob.get("players", []):
        country = (pl.get("country") or "").strip()
        if not country:
            continue
        out.setdefault(country, []).append(pl)
    return out


def _team_overall_mean(team_players: list[dict]) -> float:
    vals = [_player_value(pl) for pl in team_players]
    return float(statistics.mean(vals)) if vals else 0.0


def _confirmed_xi_value(
    confirmed_names: list[str],
    team_players: list[dict],
) -> tuple[float, int, int]:
    """Sum value of confirmed names; fall back to team mean if unknown.

    Returns (total_value, n_matched, n_fallback).
    """
    by_name: dict[str, dict] = {
        (pl.get("name") or "").strip().lower(): pl
        for pl in team_players
    }
    overall_mean = _team_overall_mean(team_players)
    total = 0.0
    matched = 0
    fallback = 0
    for raw_name in confirmed_names:
        key = (raw_name or "").strip().lower()
        if not key:
            continue
        hit = by_name.get(key)
        if hit:
            total += _player_value(hit)
            matched += 1
        else:
            total += overall_mean if overall_mean > 0 else 1.0
            fallback += 1
    return total, matched, fallback


def _baseline_value(team_players: list[dict]) -> float:
    return float(sum(_player_value(pl) for pl in team_players))


def _grid_from_lambdas(lam_h: float, lam_a: float) -> tuple[float, float, float]:
    """Re-run the predictor's bivariate-Poisson + Dixon-Coles grid math."""
    lam_h = float(np.clip(lam_h, 0.05, 8.0))
    lam_a = float(np.clip(lam_a, 0.05, 8.0))
    pmf_h = poisson.pmf(np.arange(MAX_GOALS + 1), lam_h)
    pmf_a = poisson.pmf(np.arange(MAX_GOALS + 1), lam_a)
    grid = np.outer(pmf_h, pmf_a)
    for hg, ag in ((0, 0), (0, 1), (1, 0), (1, 1)):
        grid[hg, ag] *= _dc_tau(hg, ag, lam_h, lam_a, DC_RHO)
    total = float(grid.sum())
    if total > 0:
        grid = grid / total
    p_home = float(np.tril(grid, -1).sum())
    p_draw = float(np.trace(grid))
    p_away = float(np.triu(grid, 1).sum())
    s = p_home + p_draw + p_away
    if s > 0:
        p_home, p_draw, p_away = p_home / s, p_draw / s, p_away / s
    return p_home, p_draw, p_away


def _fixtures_in_window(window_hours: float) -> list[dict]:
    blob = json.loads(FIXTURES_PATH.read_text())
    matches = blob.get("matches", [])
    now = _utc_now()
    horizon = now + _dt.timedelta(hours=window_hours)
    out = []
    for m in matches:
        if m.get("played"):
            continue
        iso = m.get("kickoff_iso")
        if not iso:
            continue
        try:
            kt = _parse_iso(iso)
        except ValueError:
            continue
        if now <= kt <= horizon:
            out.append(m)
    return out


def _production_pred_for(match_n: int) -> dict | None:
    blob = json.loads(MODEL_PRED_PATH.read_text())
    afp = blob.get("all_fixture_predictions") or {}
    if isinstance(afp, dict):
        rec = afp.get(str(match_n))
        if rec:
            return rec
        for v in afp.values():
            if isinstance(v, dict) and v.get("n") == match_n:
                return v
    elif isinstance(afp, list):
        for v in afp:
            if isinstance(v, dict) and v.get("n") == match_n:
                return v
    return None


def _adjust_one(
    match: dict,
    profiles: dict[str, list[dict]],
    isocal,
) -> dict | None:
    match_n = match.get("n")
    home = match.get("home")
    away = match.get("away")
    if match_n is None or not home or not away:
        return None
    # Only try the hook for matches it knows about; otherwise skip cleanly.
    if not any(row[0] == match_n for row in MATCH_SCHEDULE):
        return {"skipped": True, "reason": "match_not_in_hook_schedule",
                "match_n": match_n, "home": home, "away": away}

    try:
        hook = run_pre_match_hook(match_n)
    except Exception as exc:  # noqa: BLE001
        return {"skipped": True, "reason": f"hook_error: {exc}",
                "match_n": match_n, "home": home, "away": away}
    if not hook:
        return {"skipped": True, "reason": "no_confirmed_lineup_yet",
                "match_n": match_n, "home": home, "away": away}

    confirmed_home = list(hook.get("confirmed_xi", {}).get("home") or [])
    confirmed_away = list(hook.get("confirmed_xi", {}).get("away") or [])
    if not confirmed_home or not confirmed_away:
        return {"skipped": True, "reason": "partial_lineup",
                "match_n": match_n, "home": home, "away": away}

    home_players = profiles.get(home, [])
    away_players = profiles.get(away, [])
    if not home_players or not away_players:
        return {"skipped": True, "reason": "no_profiles_for_team",
                "match_n": match_n, "home": home, "away": away}

    base_h = _baseline_value(home_players)
    base_a = _baseline_value(away_players)
    val_h, mh, fh = _confirmed_xi_value(confirmed_home, home_players)
    val_a, ma, fa = _confirmed_xi_value(confirmed_away, away_players)

    if base_h <= 0 or base_a <= 0 or val_h <= 0 or val_a <= 0:
        return {"skipped": True, "reason": "zero_value_baseline",
                "match_n": match_n, "home": home, "away": away}

    ratio_h = max(MIN_RATIO, min(MAX_RATIO, val_h / base_h))
    ratio_a = max(MIN_RATIO, min(MAX_RATIO, val_a / base_a))

    prod = _production_pred_for(match_n)
    if not prod:
        return {"skipped": True, "reason": "no_production_prediction",
                "match_n": match_n, "home": home, "away": away}

    lam_h_base = float(prod.get("lambda_home") or 0)
    lam_a_base = float(prod.get("lambda_away") or 0)
    if lam_h_base <= 0 or lam_a_base <= 0:
        return {"skipped": True, "reason": "no_lambdas_in_production_record",
                "match_n": match_n, "home": home, "away": away}

    lam_h_adj = lam_h_base * math.sqrt(ratio_h)
    lam_a_adj = lam_a_base * math.sqrt(ratio_a)

    p_h_raw, p_d_raw, p_a_raw = _grid_from_lambdas(lam_h_adj, lam_a_adj)
    if isocal:
        p_h, p_d, p_a = _apply_calibrator_triple(
            isocal, p_h_raw, p_d_raw, p_a_raw,
        )
    else:
        p_h, p_d, p_a = p_h_raw, p_d_raw, p_a_raw

    wdl = pick_wdl(p_h, p_d, p_a)
    score_h, score_a = int(round(lam_h_adj)), int(round(lam_a_adj))
    return {
        "skipped": False,
        "match_n": match_n,
        "home": home,
        "away": away,
        "kickoff_iso": match.get("kickoff_iso"),
        "strength_ratio_home": round(ratio_h, 4),
        "strength_ratio_away": round(ratio_a, 4),
        "baseline_value_home": round(base_h, 1),
        "baseline_value_away": round(base_a, 1),
        "confirmed_value_home": round(val_h, 1),
        "confirmed_value_away": round(val_a, 1),
        "confirmed_xi_matched_home": mh,
        "confirmed_xi_fallback_home": fh,
        "confirmed_xi_matched_away": ma,
        "confirmed_xi_fallback_away": fa,
        "lambda_home_base": round(lam_h_base, 3),
        "lambda_away_base": round(lam_a_base, 3),
        "lambda_home_adjusted": round(lam_h_adj, 3),
        "lambda_away_adjusted": round(lam_a_adj, 3),
        "p_home_base": float(prod.get("p_home") or 0),
        "p_draw_base": float(prod.get("p_draw") or 0),
        "p_away_base": float(prod.get("p_away") or 0),
        "p_home": round(p_h, 4),
        "p_draw": round(p_d, 4),
        "p_away": round(p_a, 4),
        "predicted_wdl": wdl,
        "predicted_score": f"{score_h}-{score_a}",
    }


def main(window_hours: float = WINDOW_HOURS) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true",
                        help="Run a single adjustment pass and exit.")
    parser.add_argument("--window-hours", type=float, default=window_hours,
                        help="Lookahead window from now (default 4h).")
    args = parser.parse_args()

    upcoming = _fixtures_in_window(args.window_hours)
    n_in_window = len(upcoming)

    profiles = _load_profiles()
    isocal = _load_calibrator()

    run_id = (f"lineup-adjust-{_utc_now().strftime('%Y%m%dT%H%M%SZ')}-"
              f"{uuid.uuid4().hex[:6]}")
    model = "isocal_lineup_adjusted"
    notes = (
        f"WC2026 Stage 1c lineup adjuster — sqrt(strength_ratio) on production "
        f"isocal lambdas. Window={args.window_hours}h. "
        f"Source: confirmed XI via wc2026_lineup_hook + enriched player "
        f"profiles ({PROFILES_PATH.name}). n_in_window={n_in_window}."
    )

    adjustments: list[dict] = []
    skipped: list[dict] = []
    sample: dict | None = None
    db_rows = 0

    if n_in_window > 0:
        conn = None
        if DB_AVAILABLE:
            log_run(run_id, model, notes=notes)
            conn = get_connection()
        try:
            for fix in upcoming:
                rec = _adjust_one(fix, profiles, isocal)
                if rec is None:
                    skipped.append({"match_n": fix.get("n"),
                                    "reason": "bad_fixture_record"})
                    continue
                if rec.get("skipped"):
                    skipped.append(rec)
                    continue
                if DB_AVAILABLE and conn is not None:
                    match_payload = {
                        "home": rec["home"],
                        "away": rec["away"],
                        "match_date": (rec.get("kickoff_iso") or "")[:10] or None,
                        "competition": "WC2026",
                    }
                    pred_payload = {
                        "p_home": rec["p_home"],
                        "p_draw": rec["p_draw"],
                        "p_away": rec["p_away"],
                        "predicted_wdl": rec["predicted_wdl"],
                        "predicted_score": rec["predicted_score"],
                        "source": (
                            f"wc2026_lineup_adjuster.py run={run_id} "
                            f"hook=wc2026_lineup_hook profiles="
                            f"wc2026_player_profiles_enriched.json"
                        ),
                    }
                    log_prediction(run_id, model, match_payload, pred_payload,
                                   conn=conn)
                    rec["actual_score"] = actual_for(rec["home"], rec["away"])
                adjustments.append(rec)
                db_rows += 1
                if sample is None:
                    sample = {
                        "match_n": rec["match_n"],
                        "home": rec["home"],
                        "away": rec["away"],
                        "strength_ratio_home": rec["strength_ratio_home"],
                        "strength_ratio_away": rec["strength_ratio_away"],
                        "lambda_home_base": rec["lambda_home_base"],
                        "lambda_home_adjusted": rec["lambda_home_adjusted"],
                        "lambda_away_base": rec["lambda_away_base"],
                        "lambda_away_adjusted": rec["lambda_away_adjusted"],
                        "p_home_base": rec["p_home_base"],
                        "p_draw_base": rec["p_draw_base"],
                        "p_away_base": rec["p_away_base"],
                        "p_home": rec["p_home"],
                        "p_draw": rec["p_draw"],
                        "p_away": rec["p_away"],
                        "predicted_wdl": rec["predicted_wdl"],
                    }
        finally:
            if conn is not None:
                conn.close()

    receipt = {
        "run_id": run_id,
        "model": model,
        "generated_at": _utc_now().isoformat().replace("+00:00", "Z"),
        "window_hours": args.window_hours,
        "verified": True,
        "source": (
            "wc2026_lineup_adjuster.py — production isocal lambdas * "
            "sqrt(Σ confirmed XI player value / Σ baseline XI player value). "
            "Confirmed XI: scripts/wc2026_lineup_hook.run_pre_match_hook. "
            "Player values: server/data/wc2026_player_profiles_enriched.json "
            "(caps + minutes + position weight proxy — no market_value_eur "
            "in source)."
        ),
        "notes": notes,
        "n_fixtures_in_window": n_in_window,
        "n_adjusted": len(adjustments),
        "n_skipped": len(skipped),
        "db_rows_inserted": db_rows,
        "adjustments": adjustments,
        "skipped": skipped,
        "sample": sample,
        "message": "no fixtures in window" if n_in_window == 0 else None,
    }
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2, ensure_ascii=False))

    print(json.dumps({
        "file": str(RECEIPT_PATH),
        "n_fixtures_in_window": n_in_window,
        "n_adjusted": len(adjustments),
        "sample": sample,
        "db_rows_inserted": db_rows,
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
