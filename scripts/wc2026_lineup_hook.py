"""Pre-match lineup confirmation hook for WC2026 MD2 fixtures.

Top-10 build item #2 (project item #73): when starting XIs are confirmed
~60 min before kickoff, detect any high-importance absentees vs the predicted
XI and adjust the model's p_win for the affected team by a calibrated number
of percentage points. Output is written to
``/opt/jarvis-app-1/server/data/wc2026_lineup_adjustments.json``.

Designed to be cron'd ~60 min before each MD2 kickoff::

    */5 * * * * /opt/jarvis-app-1/.venv/bin/python \\
        /opt/jarvis-app-1/scripts/wc2026_lineup_hook.py

The script self-gates: it only runs the hook for fixtures whose kickoff is
within ``KICKOFF_WINDOW_MIN``. Outside that window it logs a no-op and exits.

Sources tried in order (first non-empty wins, tolerant of 404s — lineups
release 50–60 min pre-kickoff):

* ESPN soccer lineups page
* Sofascore event lineups JSON

All HTTP failures are warnings, never crashes.
"""
from __future__ import annotations

import dataclasses
import datetime as _dt
import json
import logging
import pathlib
import re
import sys
import urllib.error
import urllib.request
from typing import Iterable

LOG = logging.getLogger("wc2026_lineup_hook")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATA_DIR = pathlib.Path("/opt/jarvis-app-1/server/data")
ADJ_PATH = DATA_DIR / "wc2026_lineup_adjustments.json"
PRED_PATH = DATA_DIR / "wc2026_model_predictions.json"

# Window (minutes before kickoff) in which the hook actually runs.
KICKOFF_WINDOW_MIN_LOW = 30
KICKOFF_WINDOW_MIN_HIGH = 90

HTTP_TIMEOUT = 8
UA = "Mozilla/5.0 jarvis-wc2026-lineup-hook"


# ---------------------------------------------------------------------------
# Fixtures + schedule
# ---------------------------------------------------------------------------

# Mirrors NEXT_12 in wc2026_fetch_results.py (kept in sync manually — small list).
# Kickoff times are placeholders aligned with the public MD2 schedule (UTC).
# Adjust if the official schedule shifts; the hook reads kickoff_iso here only
# to decide *when* to run, not for any prediction logic.
MATCH_SCHEDULE: list[tuple[int, str, str, str]] = [
    (1,  "USA",        "Australia",     "2026-06-18T20:00:00+00:00"),
    (2,  "Scotland",   "Morocco",       "2026-06-18T23:00:00+00:00"),
    (3,  "Brazil",     "Haiti",         "2026-06-19T20:00:00+00:00"),
    (4,  "Türkiye",    "Paraguay",      "2026-06-19T23:00:00+00:00"),
    (5,  "Netherlands","Sweden",        "2026-06-20T20:00:00+00:00"),
    (6,  "Germany",    "Côte d'Ivoire", "2026-06-20T23:00:00+00:00"),
    (7,  "Ecuador",    "Curaçao",       "2026-06-21T20:00:00+00:00"),
    (8,  "Tunisia",    "Japan",         "2026-06-21T23:00:00+00:00"),
    (9,  "Spain",      "Saudi Arabia",  "2026-06-22T20:00:00+00:00"),
    (10, "Belgium",    "Iran",          "2026-06-22T23:00:00+00:00"),
    (11, "Uruguay",    "Cabo Verde",    "2026-06-23T20:00:00+00:00"),
    (12, "New Zealand","Egypt",         "2026-06-23T23:00:00+00:00"),
]


# ---------------------------------------------------------------------------
# Importance weights
# ---------------------------------------------------------------------------

# Position-driven p_win deltas (percentage points reduced from the affected
# team's p_win when a top-importance player is OUT of the confirmed XI).
POSITION_PP: dict[str, int] = {
    "GK": 5,
    "DEF": 3,
    "MID": 5,
    "FWD": 8,  # top striker
}

# Hardcoded importance map for top-5-league players the model cares about.
# Keys are player full names as they appear on ESPN/Sofascore lineup pages.
# Position drives the pp adjustment via POSITION_PP. This is intentionally
# small — broader player intelligence lives in wc2026_player_profiles.py.
TOP_PLAYERS: dict[str, dict[str, str]] = {
    # Brazil
    "Vinicius Junior": {"team": "Brazil", "position": "FWD"},
    "Rodrygo":         {"team": "Brazil", "position": "FWD"},
    "Alisson":         {"team": "Brazil", "position": "GK"},
    "Marquinhos":      {"team": "Brazil", "position": "DEF"},
    # Spain
    "Lamine Yamal":    {"team": "Spain", "position": "FWD"},
    "Pedri":           {"team": "Spain", "position": "MID"},
    "Rodri":           {"team": "Spain", "position": "MID"},
    "Unai Simón":      {"team": "Spain", "position": "GK"},
    # Germany
    "Florian Wirtz":   {"team": "Germany", "position": "MID"},
    "Jamal Musiala":   {"team": "Germany", "position": "MID"},
    "Kai Havertz":     {"team": "Germany", "position": "FWD"},
    "Manuel Neuer":    {"team": "Germany", "position": "GK"},
    # Netherlands
    "Virgil van Dijk": {"team": "Netherlands", "position": "DEF"},
    "Frenkie de Jong": {"team": "Netherlands", "position": "MID"},
    "Cody Gakpo":      {"team": "Netherlands", "position": "FWD"},
    # Belgium
    "Kevin De Bruyne": {"team": "Belgium", "position": "MID"},
    "Romelu Lukaku":   {"team": "Belgium", "position": "FWD"},
    # USA
    "Christian Pulisic": {"team": "USA", "position": "FWD"},
    "Weston McKennie":   {"team": "USA", "position": "MID"},
    # Uruguay
    "Federico Valverde": {"team": "Uruguay", "position": "MID"},
    "Darwin Núñez":      {"team": "Uruguay", "position": "FWD"},
    # Japan
    "Takefusa Kubo":   {"team": "Japan", "position": "MID"},
    "Wataru Endo":     {"team": "Japan", "position": "MID"},
    # Morocco
    "Achraf Hakimi":   {"team": "Morocco", "position": "DEF"},
    "Yassine Bounou":  {"team": "Morocco", "position": "GK"},
    # Türkiye
    "Arda Güler":      {"team": "Türkiye", "position": "MID"},
    # Ecuador
    "Moisés Caicedo":  {"team": "Ecuador", "position": "MID"},
    # Egypt
    "Mohamed Salah":   {"team": "Egypt", "position": "FWD"},
}


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

ESPN_LINEUP_TMPL = "https://www.espn.com/soccer/lineups?gameId={match_id}"
SOFA_LINEUP_TMPL = "https://api.sofascore.com/api/v1/event/{match_id}/lineups"


@dataclasses.dataclass(frozen=True)
class LineupChange:
    """A player who was in the predicted XI but is not in the confirmed XI."""

    player_in: str   # may be empty if unknown — kept for symmetry with API
    player_out: str
    team: str
    position: str


@dataclasses.dataclass(frozen=True)
class Adjustment:
    """The p_win delta to apply to a single team for a single match."""

    team: str
    p_win_delta_pp: int
    reasons: tuple[str, ...]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _fetch(url: str, timeout: int = HTTP_TIMEOUT) -> str | None:
    """GET ``url`` and return body text, or ``None`` on any HTTP/network error.

    404s are expected (lineups release ~60 min pre-kickoff) and logged at INFO,
    not WARNING.
    """
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 — public sport data
            return r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            LOG.info("Lineup not yet posted (404): %s", url)
        else:
            LOG.warning("HTTP %s on %s", e.code, url)
        return None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        LOG.warning("Fetch failed for %s: %s", url, e)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def fetch_lineups(match_id: str) -> dict[str, list[str]]:
    """Return ``{"home": [names], "away": [names]}`` for a match.

    Empty lists if no source has posted the confirmed XIs yet. ``match_id``
    accepts either an ESPN gameId or a Sofascore event id — both endpoints
    are tried tolerantly.
    """
    # ESPN HTML — extract starter blocks (best-effort regex; falls back to {}).
    espn = _fetch(ESPN_LINEUP_TMPL.format(match_id=match_id))
    if espn:
        parsed = _parse_espn_lineups(espn)
        if parsed.get("home") and parsed.get("away"):
            LOG.info("ESPN lineups parsed for %s (%d/%d)",
                     match_id, len(parsed["home"]), len(parsed["away"]))
            return parsed

    sofa = _fetch(SOFA_LINEUP_TMPL.format(match_id=match_id))
    if sofa:
        try:
            doc = json.loads(sofa)
        except json.JSONDecodeError as e:
            LOG.warning("Sofascore returned non-JSON for %s: %s", match_id, e)
        else:
            parsed = _parse_sofa_lineups(doc)
            if parsed.get("home") and parsed.get("away"):
                LOG.info("Sofascore lineups parsed for %s (%d/%d)",
                         match_id, len(parsed["home"]), len(parsed["away"]))
                return parsed

    return {"home": [], "away": []}


def _parse_espn_lineups(html: str) -> dict[str, list[str]]:
    """Very tolerant ESPN scrape: find starter names by class hints."""
    out: dict[str, list[str]] = {"home": [], "away": []}
    # ESPN renders home/away starter blocks in repeating <div> sections; we
    # look for player name cells. This is intentionally loose — exact CSS
    # changes often, so we fall back to {} when nothing matches.
    block_pat = re.compile(
        r'class="[^"]*Lineup__Player[^"]*"[^>]*>\s*<[^>]+>([^<]{2,40})</',
        flags=re.I,
    )
    names = [m.group(1).strip() for m in block_pat.finditer(html)]
    if len(names) >= 22:
        out["home"] = names[:11]
        out["away"] = names[11:22]
    return out


def _parse_sofa_lineups(doc: dict) -> dict[str, list[str]]:
    """Sofascore JSON: ``home.players`` + ``away.players`` with substitute flag."""
    out: dict[str, list[str]] = {"home": [], "away": []}
    for side in ("home", "away"):
        players = (doc.get(side) or {}).get("players") or []
        starters = [
            (p.get("player") or {}).get("name", "").strip()
            for p in players
            if not p.get("substitute")
        ]
        out[side] = [n for n in starters if n][:11]
    return out


def detect_changes(
    predicted_xi: Iterable[str],
    confirmed_xi: Iterable[str],
) -> list[tuple[str, str]]:
    """Diff predicted vs confirmed.

    Returns ``[(player_in, player_out), ...]`` — players newly in the
    confirmed XI paired with players removed from the predicted XI. The
    pairing is positional only (order of removal/insertion); callers should
    treat both names as informational.
    """
    pred = list(dict.fromkeys(predicted_xi))  # preserve order, dedupe
    conf = list(dict.fromkeys(confirmed_xi))
    pred_set = set(pred)
    conf_set = set(conf)

    outs = [p for p in pred if p not in conf_set]
    ins = [p for p in conf if p not in pred_set]

    # Zip pairs; if lengths differ, fill the shorter side with "".
    pairs: list[tuple[str, str]] = []
    for i in range(max(len(outs), len(ins))):
        p_in = ins[i] if i < len(ins) else ""
        p_out = outs[i] if i < len(outs) else ""
        pairs.append((p_in, p_out))
    return pairs


def adjust_prediction(
    base_prediction: dict,
    key_player_changes: list[tuple[str, str]],
) -> dict:
    """Return a new prediction dict with ``p_win`` reduced by the importance pp.

    ``base_prediction`` must contain ``home``, ``away``, ``home_p_win`` and
    ``away_p_win`` (floats 0-1). The output mirrors that shape plus an
    ``adjustments`` list documenting which player drove which pp delta. The
    input dict is not mutated.
    """
    out = dict(base_prediction)
    adjustments: list[dict[str, object]] = []

    for _player_in, player_out in key_player_changes:
        if not player_out:
            continue
        prof = TOP_PLAYERS.get(player_out)
        if not prof:
            continue
        pp = POSITION_PP.get(prof["position"], 0)
        if pp <= 0:
            continue

        team = prof["team"]
        delta = pp / 100.0
        if team == base_prediction.get("home"):
            out["home_p_win"] = max(0.0, float(base_prediction.get("home_p_win", 0.0)) - delta)
        elif team == base_prediction.get("away"):
            out["away_p_win"] = max(0.0, float(base_prediction.get("away_p_win", 0.0)) - delta)
        else:
            # Player's team isn't in this match — ignore.
            continue

        adjustments.append({
            "team": team,
            "player_out": player_out,
            "position": prof["position"],
            "p_win_delta_pp": -pp,
        })

    out["adjustments"] = adjustments
    return out


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def _load_predicted_xi(match_n: int, team: str) -> list[str]:
    """Best-effort load of the model's predicted XI for ``team`` in match ``match_n``.

    Reads ``wc2026_model_predictions.json`` if present and looks under
    ``predictions[str(match_n)].predicted_xi.{home|away}``. Returns ``[]``
    if any layer is missing.
    """
    if not PRED_PATH.exists():
        return []
    try:
        doc = json.loads(PRED_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        LOG.warning("Could not read %s: %s", PRED_PATH, e)
        return []

    pred = (doc.get("predictions") or {}).get(str(match_n)) or {}
    xi_block = pred.get("predicted_xi") or {}

    if team == pred.get("home"):
        return list(xi_block.get("home") or [])
    if team == pred.get("away"):
        return list(xi_block.get("away") or [])
    return []


def _load_base_prediction(match_n: int, home: str, away: str) -> dict:
    """Load model prediction for the match, or build a neutral fallback."""
    if PRED_PATH.exists():
        try:
            doc = json.loads(PRED_PATH.read_text(encoding="utf-8"))
            pred = (doc.get("predictions") or {}).get(str(match_n))
            if pred:
                return {
                    "home": pred.get("home", home),
                    "away": pred.get("away", away),
                    "home_p_win": float(pred.get("home_p_win", 0.40)),
                    "away_p_win": float(pred.get("away_p_win", 0.30)),
                    "draw_p": float(pred.get("draw_p", 0.30)),
                }
        except (OSError, json.JSONDecodeError, ValueError) as e:
            LOG.warning("Falling back to neutral prediction (%s): %s", match_n, e)

    # Neutral fallback if no model file yet.
    return {
        "home": home,
        "away": away,
        "home_p_win": 0.40,
        "away_p_win": 0.30,
        "draw_p": 0.30,
    }


def _load_existing_adjustments() -> dict:
    if not ADJ_PATH.exists():
        return {"adjustments": {}}
    try:
        return json.loads(ADJ_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        LOG.warning("Adjustments file unreadable, starting fresh: %s", e)
        return {"adjustments": {}}


def _write_adjustments(doc: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    doc["last_updated"] = _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")
    ADJ_PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")


def run_pre_match_hook(match_n: int, sofa_match_id: str | None = None) -> dict | None:
    """Run the full hook for a single fixture.

    Returns the adjustment record written, or ``None`` if no confirmed lineup
    was retrievable (the common case 90+ min pre-kickoff).
    """
    row = next((r for r in MATCH_SCHEDULE if r[0] == match_n), None)
    if row is None:
        LOG.warning("Unknown match_n=%s", match_n)
        return None
    _, home, away, kickoff_iso = row

    match_id = sofa_match_id or str(match_n)
    confirmed = fetch_lineups(match_id)
    if not confirmed["home"] and not confirmed["away"]:
        LOG.info("Match %d (%s v %s) — no confirmed lineup yet", match_n, home, away)
        return None

    base = _load_base_prediction(match_n, home, away)

    home_pred_xi = _load_predicted_xi(match_n, home)
    away_pred_xi = _load_predicted_xi(match_n, away)

    home_changes = detect_changes(home_pred_xi, confirmed["home"]) if home_pred_xi else []
    away_changes = detect_changes(away_pred_xi, confirmed["away"]) if away_pred_xi else []

    adjusted = adjust_prediction(base, home_changes + away_changes)

    record = {
        "match_n": match_n,
        "home": home,
        "away": away,
        "kickoff_iso": kickoff_iso,
        "confirmed_xi": confirmed,
        "predicted_xi": {"home": home_pred_xi, "away": away_pred_xi},
        "changes": {
            "home": [{"in": i, "out": o} for i, o in home_changes],
            "away": [{"in": i, "out": o} for i, o in away_changes],
        },
        "base_prediction": base,
        "adjusted_prediction": adjusted,
    }

    doc = _load_existing_adjustments()
    doc.setdefault("adjustments", {})[str(match_n)] = record
    _write_adjustments(doc)
    LOG.info("Match %d adjustments written (%d home / %d away changes)",
             match_n, len(home_changes), len(away_changes))
    return record


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _minutes_to_kickoff(kickoff_iso: str, now: _dt.datetime | None = None) -> int:
    now = now or _dt.datetime.now(_dt.timezone.utc)
    kt = _dt.datetime.fromisoformat(kickoff_iso)
    if kt.tzinfo is None:
        kt = kt.replace(tzinfo=_dt.timezone.utc)
    return int((kt - now).total_seconds() // 60)


def main() -> int:
    now = _dt.datetime.now(_dt.timezone.utc)
    triggered = 0
    for match_n, home, away, kickoff_iso in MATCH_SCHEDULE:
        mins = _minutes_to_kickoff(kickoff_iso, now)
        if KICKOFF_WINDOW_MIN_LOW <= mins <= KICKOFF_WINDOW_MIN_HIGH:
            LOG.info("Match %d (%s v %s) in window (%d min) — running hook",
                     match_n, home, away, mins)
            run_pre_match_hook(match_n)
            triggered += 1

    if triggered == 0:
        LOG.info("No fixtures within window (%d-%d min pre-kickoff) — exiting cleanly",
                 KICKOFF_WINDOW_MIN_LOW, KICKOFF_WINDOW_MIN_HIGH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
