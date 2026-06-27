#!/usr/bin/env python3
"""Sync WC2026 fixtures from the real-time GitHub-hosted API (worldcup26.ir).

Source repo: https://github.com/rezarahiminia/worldcup2026
API docs:    worldcup26.ir/api-docs

This script rebuilds:
  - server/data/wc2026_fixtures_all.json  (104 fixtures, official FIFA match nums)
  - server/data/wc2026_actuals.json       (verified played matches + scorers)

It preserves existing scorer detail when the same home/away pair exists, and
adds new API results otherwise. After running this, invoke:

  .venv/bin/python scripts/wc2026_fetch_results.py
  .venv/bin/python scripts/wc2026_build_played.py
  .venv/bin/python scripts/worldcup_prediction_engine.py --mode predict-upcoming
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path("/opt/jarvis-app-1")
DATA = ROOT / "server" / "data"
FIXTURES_PATH = DATA / "wc2026_fixtures_all.json"
ACTUALS_PATH = DATA / "wc2026_actuals.json"

GAMES_API = "https://worldcup26.ir/get/games"
STADIUMS_API = "https://worldcup26.ir/get/stadiums"

# API -> project canonical team names
NAME_MAP = {
    "Czech Republic": "Czechia",
    "Turkey": "Türkiye",
    "Ivory Coast": "Côte d'Ivoire",
    "Cape Verde": "Cabo Verde",
    "DR Congo": "Congo DR",
}

_STAGE_MAP = {
    "group": "GROUP",
    "r32": "R32",
    "r16": "R16",
    "qf": "QF",
    "sf": "SF",
    "third": "3RD",
    "final": "FINAL",
}


def _fetch(url: str) -> dict[str, Any]:
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "jarvis-wc2026-sync"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))


def _map_name(name: str | None) -> str:
    return NAME_MAP.get(name or "", name or "TBD")


def _label_to_placeholder(label: str | None) -> str:
    """Convert API labels to the filler's placeholder format."""
    if not label:
        return "TBD"
    s = label.strip()
    s = re.sub(r"\bGroup\s+", "", s)
    s = re.sub(r"\bMatch\s+", "", s)
    s = re.sub(r"\bthird place\b", "3rd", s, flags=re.IGNORECASE)
    return s


def _parse_date(local_date: str) -> str:
    return datetime.strptime(local_date, "%m/%d/%Y %H:%M").strftime("%Y-%m-%d")


def _parse_scorers(home_scorers_raw: str | None, away_scorers_raw: str | None) -> dict[str, list]:
    """Best-effort parse of API scorer strings like '{"Name minute'","Name minute'"}'."""
    scorers: dict[str, list] = {"home": [], "away": []}

    def _parse(raw: str | None, side: str) -> None:
        if not raw or raw.strip().lower() == "null":
            return
        # Strip outer braces and split by quoted comma
        inner = raw.strip().strip("{}").strip()
        if not inner:
            return
        parts = re.findall(r'"([^"]*)"', inner)
        for part in parts:
            # part like "Nestory Irankunda 27'" or "B. Khoukhi 90'+5'"
            m = re.match(r"(.+?)\s+(\d{1,3}'(?:\+\d{1,2}'?)?)\s*$", part)
            if m:
                name, minute = m.groups()
                scorers[side].append({
                    "name": name.strip(),
                    "minute": minute,
                    "type": "Goal",
                    "own_goal": False,
                    "penalty": "(p)" in part.lower(),
                })

    _parse(home_scorers_raw, "home")
    _parse(away_scorers_raw, "away")
    return scorers


def main() -> int:
    games_doc = _fetch(GAMES_API)
    stadiums_doc = _fetch(STADIUMS_API)

    games = games_doc.get("games", [])
    stadiums = {str(s["id"]): s for s in stadiums_doc.get("stadiums", [])}

    if len(games) != 104:
        print(f"WARNING: API returned {len(games)} games, expected 104", file=sys.stderr)

    # Preserve existing scorer data keyed by (home, away, date)
    existing_scorers: dict[tuple[str, str, str], dict] = {}
    if ACTUALS_PATH.exists():
        try:
            old_actuals = json.loads(ACTUALS_PATH.read_text())
            for row in old_actuals.get("matches", []):
                key = (row.get("home", ""), row.get("away", ""), row.get("date", ""))
                if row.get("scorers"):
                    existing_scorers[key] = row["scorers"]
        except (OSError, ValueError):
            pass

    fixtures: list[dict[str, Any]] = []
    actuals_matches: list[dict[str, Any]] = []

    for g in games:
        n = int(g["id"])
        home_name = g.get("home_team_name_en")
        away_name = g.get("away_team_name_en")
        home_label = g.get("home_team_label")
        away_label = g.get("away_team_label")

        home = _map_name(home_name) if home_name else _label_to_placeholder(home_label)
        away = _map_name(away_name) if away_name else _label_to_placeholder(away_label)

        local_date = g["local_date"]
        date = _parse_date(local_date)
        kickoff_iso = datetime.strptime(local_date, "%m/%d/%Y %H:%M").strftime("%Y-%m-%dT%H:%M:%SZ")

        stage_type = g["type"]
        stage = _STAGE_MAP.get(stage_type, stage_type.upper())
        group = g.get("group") if stage_type == "group" else None
        matchday = int(g["matchday"]) if g.get("matchday") else None

        stadium = stadiums.get(str(g.get("stadium_id")))
        venue = f"{stadium['name_en']}, {stadium['city_en']}" if stadium else ""

        time_elapsed = (g.get("time_elapsed") or "").lower()
        finished = g.get("finished") == "TRUE" or time_elapsed == "finished"
        home_score = g.get("home_score")
        away_score = g.get("away_score")

        result: str | None = None
        result_class: str | None = None
        played = False
        hg = ag = None

        if finished and home_score is not None and away_score is not None:
            try:
                hg = int(home_score)
                ag = int(away_score)
                result = f"{hg}-{ag}"
                result_class = "H" if hg > ag else ("A" if ag > hg else "D")
                played = True
            except (ValueError, TypeError):
                pass

        fixtures.append({
            "n": n,
            "date": date,
            "kickoff_iso": kickoff_iso,
            "kickoff_local": local_date,
            "stage": stage,
            "group": group,
            "matchday": matchday,
            "home": home,
            "away": away,
            "venue": venue,
            "result": result,
            "result_class": result_class,
            "played": played,
        })

        if played:
            scorers = existing_scorers.get((home, away, date))
            if scorers is None:
                scorers = _parse_scorers(g.get("home_scorers"), g.get("away_scorers"))
            actuals_matches.append({
                "date": date,
                "stage": stage,
                "group": group,
                "home": home,
                "away": away,
                "result": result,
                "verified": True,
                "source": "worldcup26.ir API (github.com/rezarahiminia/worldcup2026)",
                "scorers": scorers,
            })

    fixtures_doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tournament": "2026 FIFA World Cup",
        "total_matches": len(fixtures),
        "source": "Synced from worldcup26.ir API (GitHub: rezarahiminia/worldcup2026)",
        "matches": fixtures,
    }
    FIXTURES_PATH.write_text(json.dumps(fixtures_doc, indent=2, ensure_ascii=False))
    print(f"Wrote {len(fixtures)} fixtures -> {FIXTURES_PATH}")

    actuals_doc: dict[str, Any] = {
        "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "worldcup26.ir API (GitHub: rezarahiminia/worldcup2026)",
        "note": "Verified played matches synced from the public World Cup 2026 API.",
        "matches_played_count": len(actuals_matches),
        "matches": actuals_matches,
    }
    ACTUALS_PATH.write_text(json.dumps(actuals_doc, indent=2, ensure_ascii=False))
    print(f"Wrote {len(actuals_matches)} verified actuals -> {ACTUALS_PATH}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
