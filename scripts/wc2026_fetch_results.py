"""Fetch WC2026 next-12 match results from public sources and update the live JSON.

Run via cron every 5 min during match days:
    */5 * * * * /opt/jarvis-app-1/.venv/bin/python /opt/jarvis-app-1/scripts/wc2026_fetch_results.py

Sources tried in order: ESPN, FIFA. First success wins. Failures are logged, never crash.
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
import pathlib
import re
import sys
import urllib.error
import urllib.request

LOG = logging.getLogger("wc2026_fetch")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATA_PATH = pathlib.Path("/opt/jarvis-app-1/server/data/wc2026_results.json")
ACTUALS_PATH = pathlib.Path("/opt/jarvis-app-1/server/data/wc2026_actuals.json")
FIXTURES_PATH = pathlib.Path("/opt/jarvis-app-1/server/data/wc2026_fixtures_all.json")

# Canonical team-name aliases (mirrors scripts/wc2026_db._TEAM_ALIAS).
# Used to align actuals.json names with fixtures_all.json names.
_TEAM_ALIAS = {
    "usa": "united states", "united states": "united states",
    "cape verde": "cabo verde", "cabo verde": "cabo verde",
    "ivory coast": "côte d'ivoire", "cote d'ivoire": "côte d'ivoire",
    "côte d'ivoire": "côte d'ivoire",
    "south korea": "korea republic", "korea republic": "korea republic",
    "türkiye": "türkiye", "turkey": "türkiye",
    "czechia": "czechia", "czech republic": "czechia",
    "bosnia": "bosnia and herzegovina",
    "bosnia and herzegovina": "bosnia and herzegovina",
    "dr congo": "dr congo", "congo dr": "dr congo",
    "netherlands": "netherlands", "holland": "netherlands",
}


def _norm(name: str) -> str:
    n = (name or "").strip().lower()
    return _TEAM_ALIAS.get(n, n)


def _build_actuals_results() -> tuple[dict[str, str], dict[str, dict]]:
    """Map every verified match in wc2026_actuals.json to its fixture n.

    Returns ({str(n): "h-a"}, {str(n): scorers}) for the HTML to consume.
    Empty dicts on any I/O failure — never raises.
    """
    if not ACTUALS_PATH.exists() or not FIXTURES_PATH.exists():
        return {}, {}
    try:
        actuals = json.loads(ACTUALS_PATH.read_text())
        fixtures = json.loads(FIXTURES_PATH.read_text())
    except (OSError, ValueError) as exc:
        LOG.warning("actuals/fixtures read failed: %s", exc)
        return {}, {}

    # Build (home_norm, away_norm) -> n lookup from fixtures_all.json.
    pair_to_n: dict[tuple[str, str], int] = {}
    for m in fixtures.get("matches", []):
        n = m.get("n")
        h = _norm(m.get("home") or "")
        a = _norm(m.get("away") or "")
        if isinstance(n, int) and h and a:
            pair_to_n[(h, a)] = n

    results: dict[str, str] = {}
    scorers: dict[str, dict] = {}
    for row in actuals.get("matches", []):
        if not row.get("verified"):
            continue
        h = _norm(row.get("home") or "")
        a = _norm(row.get("away") or "")
        score = (row.get("result") or "").strip()
        if not (h and a and score):
            continue
        n = pair_to_n.get((h, a))
        if n is None:
            n_rev = pair_to_n.get((a, h))
            if n_rev is not None and "-" in score:
                hg, ag = score.split("-", 1)
                results[str(n_rev)] = f"{ag.strip()}-{hg.strip()}"
                if row.get("scorers"):
                    scorers[str(n_rev)] = {"home": row["scorers"].get("away", []), "away": row["scorers"].get("home", [])}
            else:
                LOG.warning("actual %s vs %s has no fixture n match", h, a)
            continue
        results[str(n)] = score
        if row.get("scorers"):
            scorers[str(n)] = row["scorers"]
    return results, scorers

NEXT_12: list[tuple[int, str, str]] = [
    (1,  "USA",        "Australia"),
    (2,  "Scotland",   "Morocco"),
    (3,  "Brazil",     "Haiti"),
    (4,  "Türkiye",    "Paraguay"),
    (5,  "Netherlands","Sweden"),
    (6,  "Germany",    "Côte d'Ivoire"),
    (7,  "Ecuador",    "Curaçao"),
    (8,  "Tunisia",    "Japan"),
    (9,  "Spain",      "Saudi Arabia"),
    (10, "Belgium",    "Iran"),
    (11, "Uruguay",    "Cabo Verde"),
    (12, "New Zealand","Egypt"),
]

ESPN_URL = "https://www.espn.com/soccer/schedule/_/league/fifa.world"
FIFA_URL = "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures"


def _fetch(url: str, timeout: int = 8) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 jarvis-wc2026"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def _parse_results(html: str) -> dict[int, str]:
    """Tolerant parse — looks for 'TeamA <score>-<score> TeamB' near our match names."""
    out: dict[int, str] = {}
    for n, home, away in NEXT_12:
        for h_token, a_token in ((home, away), (away, home)):
            pat = re.escape(h_token) + r".{0,200}?(\d{1,2})\s*[-–]\s*(\d{1,2}).{0,200}?" + re.escape(a_token)
            m = re.search(pat, html, flags=re.S | re.I)
            if m:
                hg, ag = int(m.group(1)), int(m.group(2))
                out[n] = f"{hg}-{ag}" if h_token == home else f"{ag}-{hg}"
                break
    return out


def fetch_all() -> dict[int, str]:
    """Return {match_n: 'h-a'} for matches found at any source."""
    for src_name, url in (("ESPN", ESPN_URL), ("FIFA", FIFA_URL)):
        try:
            html = _fetch(url)
            parsed = _parse_results(html)
            if parsed:
                LOG.info("Fetched %d results from %s", len(parsed), src_name)
                return parsed
        except (urllib.error.URLError, TimeoutError) as e:
            LOG.warning("%s fetch failed: %s", src_name, e)
    return {}


def update_json(new_results: dict[int, str]) -> None:
    """Merge results into live JSON, preserve first12 history."""
    if DATA_PATH.exists():
        doc = json.loads(DATA_PATH.read_text())
    else:
        doc = {"first12_results": {}, "next12_results": {}}

    next12 = doc.setdefault("next12_results", {})
    changed = 0
    for n, score in new_results.items():
        key = str(n)
        if next12.get(key) != score:
            next12[key] = score
            changed += 1

    # ALSO populate actuals_results from wc2026_actuals.json (authoritative
    # source). The HTML's mergeResults() consumes any "*_results" bucket, so
    # this surfaces all verified played games on the live page regardless of
    # whether the scraper found them this tick. Scorers travel in their own
    # bucket so the Results panel can show match narratives.
    actuals_results, actuals_scorers = _build_actuals_results()
    if actuals_results:
        doc["actuals_results"] = actuals_results
    if actuals_scorers:
        doc["actuals_scorers"] = actuals_scorers

    doc["last_updated"] = _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")
    doc["next12_status"] = f"{len(next12)} / 12 games complete"
    doc["actuals_count"] = len(actuals_results)
    DATA_PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    LOG.info("Wrote %s (%d new scraped, %d results, %d scorer sets from actuals.json)",
             DATA_PATH, changed, len(actuals_results), len(actuals_scorers))


_ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
# ESPN display names -> canonical token used in fixtures_all.json / actuals.json
_ESPN_NAME_ALIAS = {
    "ivory coast": "côte d'ivoire", "cape verde": "cabo verde",
    "congo dr": "dr congo", "bosnia-herzegovina": "bosnia and herzegovina",
    "korea republic": "south korea", "turkiye": "türkiye", "turkey": "türkiye",
    "czech republic": "czechia",
}


def _canon(name: str) -> str:
    n = (name or "").strip().lower()
    return _ESPN_NAME_ALIAS.get(n, n)


def _extract_scorers(comp: dict, espn_home: str, espn_away: str) -> dict[str, list]:
    """Return {'home': [...], 'away': [...]} goal scorers from ESPN competition details.

    Each item: {name, minute, type, own_goal, penalty}.
    """
    # Map ESPN team id -> home/away side
    team_id_to_side: dict[str, str] = {}
    for c in comp.get("competitors", []):
        tid = str(c.get("team", {}).get("id", ""))
        side = c.get("homeAway", "")
        if tid and side in ("home", "away"):
            team_id_to_side[tid] = side

    scorers: dict[str, list] = {"home": [], "away": []}
    for detail in comp.get("details", []):
        dtype = (detail.get("type") or {}).get("text", "")
        if not dtype or "Goal" not in dtype:
            continue
        team_id = str((detail.get("team") or {}).get("id", ""))
        side = team_id_to_side.get(team_id)
        if not side:
            continue
        athlete = (detail.get("athletesInvolved") or [{}])[0]
        name = athlete.get("displayName") or athlete.get("shortName") or "Unknown"
        minute = (detail.get("clock") or {}).get("displayValue", "")
        scorers[side].append({
            "name": name,
            "minute": minute,
            "type": dtype,
            "own_goal": bool(detail.get("ownGoal")),
            "penalty": bool(detail.get("penaltyKick")),
        })
    return scorers


def ingest_espn_finals() -> int:
    """Append newly-FINAL WC2026 games from the ESPN scoreboard to actuals.json.

    ESPN's scoreboard API is reachable from this host (unlike the bookmaker
    sites). For each game ESPN marks completed, we map it to the canonical
    fixture in fixtures_all.json (names + home/away orientation), and if it is
    not already in actuals.json we append it with verified=true + an ESPN
    source string. This is what makes the Played panel grow automatically.
    Also extracts goal scorers so the Results panel can show match narratives.
    Returns the number of new verified games added.
    """
    if not ACTUALS_PATH.exists() or not FIXTURES_PATH.exists():
        return 0
    try:
        actuals = json.loads(ACTUALS_PATH.read_text())
        fixtures = json.loads(FIXTURES_PATH.read_text())
    except (OSError, ValueError) as exc:
        LOG.warning("ingest: actuals/fixtures read failed: %s", exc)
        return 0

    fx_by_pair: dict[frozenset, dict] = {}
    for m in fixtures.get("matches", []):
        h, a = _canon(m.get("home", "")), _canon(m.get("away", ""))
        if h and a:
            fx_by_pair[frozenset((h, a))] = m
    have = {frozenset((_canon(r.get("home", "")), _canon(r.get("away", ""))))
            for r in actuals.get("matches", [])}

    finals: dict[frozenset, tuple] = {}
    final_scorers: dict[frozenset, dict[str, list]] = {}
    for delta in range(-12, 2):
        try:
            day = (_dt.datetime.now(_dt.timezone.utc).date() + _dt.timedelta(days=delta))
            doc = json.loads(_fetch(f"{_ESPN_SCOREBOARD}?dates={day.strftime('%Y%m%d')}", timeout=10))
        except Exception:  # noqa: BLE001 - tolerant
            continue
        for ev in doc.get("events", []):
            for comp in ev.get("competitions", []):
                if not ev.get("status", {}).get("type", {}).get("completed"):
                    continue
                home = away = hs = as_ = None
                for c in comp.get("competitors", []):
                    nm = c.get("team", {}).get("displayName", "")
                    if c.get("homeAway") == "home":
                        home, hs = nm, c.get("score")
                    elif c.get("homeAway") == "away":
                        away, as_ = nm, c.get("score")
                if home and away and hs is not None and as_ is not None:
                    pair = frozenset((_canon(home), _canon(away)))
                    finals[pair] = (_canon(home), f"{hs}-{as_}")
                    final_scorers[pair] = _extract_scorers(comp, _canon(home), _canon(away))

    added = 0
    for pair, (espn_home, score) in finals.items():
        fx = fx_by_pair.get(pair)
        if not fx:
            LOG.info("ingest: ESPN final %s has no fixture match — skipping", tuple(pair))
            continue
        canon_home = _canon(fx.get("home", ""))
        try:
            hs, as_ = score.split("-", 1)
        except ValueError:
            continue
        result = score if espn_home == canon_home else f"{as_}-{hs}"
        scorers = final_scorers.get(pair, {"home": [], "away": []})
        if espn_home != canon_home:
            scorers = {"home": scorers["away"], "away": scorers["home"]}

        if pair in have:
            # Even if we already have the result, enrich with scorers if missing.
            for row in actuals.get("matches", []):
                if frozenset((_canon(row.get("home", "")), _canon(row.get("away", "")))) == pair:
                    if not row.get("scorers"):
                        row["scorers"] = scorers
                        LOG.info("ingest: enriched scorers for %s vs %s", fx.get("home"), fx.get("away"))
                    break
            continue

        actuals.setdefault("matches", []).append({
            "date": (fx.get("kickoff_iso") or "")[:10] or fx.get("date"),
            "stage": fx.get("stage"), "group": fx.get("group"),
            "home": fx.get("home"), "away": fx.get("away"),
            "result": result, "verified": True,
            "source": "ESPN scoreboard fifa.world (status=completed, auto-ingested)",
            "scorers": scorers,
        })
        have.add(pair)
        added += 1
        LOG.info("ingest: added %s %s vs %s = %s", fx.get("stage"), fx.get("home"), fx.get("away"), result)

    if added or True:  # Always write so scorers get persisted even if no new games.
        actuals["matches_played_count"] = len(actuals.get("matches", []))
        actuals["last_updated"] = _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")
        ACTUALS_PATH.write_text(json.dumps(actuals, indent=2, ensure_ascii=False))
        LOG.info("ingest: actuals now %d games (%d new)", len(actuals.get("matches", [])), added)
    return added


def main() -> int:
    # Auto-ingest newly-finished games from ESPN into actuals.json FIRST, so the
    # Played panel + grading grow automatically (the HTML scraper below is backup).
    try:
        ingest_espn_finals()
    except Exception as exc:  # noqa: BLE001 - never crash the cron
        LOG.warning("ESPN ingest failed (non-fatal): %s", exc)
    results = fetch_all()
    # ALWAYS call update_json so the actuals_results bucket gets refreshed
    # from wc2026_actuals.json on every tick, even when the live scrape
    # returned nothing (which is common — ESPN/FIFA HTML rendering changes
    # break the regex parser, but actuals are still verified by hand).
    if not results:
        LOG.info("No live scrape results — refreshing actuals bucket only")
    update_json(results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
