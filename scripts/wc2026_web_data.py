#!/usr/bin/env python3
"""Fetch public web data for WC2026 and merge it into the repo datasets.

Sources:
- openfootball/worldcup.json (public domain) for 2022 + 2026 fixtures & results.
- worldcup26.ir free API for live 2026 scores, groups, teams.

The script normalises team names to the repo's canonical names, updates
fixtures, and appends new completed matches to the training history.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"
FIXTURES_PATH = DATA_DIR / "wc2026_fixtures_all.json"
HISTORY_PATH = DATA_DIR / "wc2026_training_history.csv"
OUT_PATH = DATA_DIR / "wc2026_web_data.json"

LOG = logging.getLogger("wc2026_web_data")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

HTTP_HEADERS = {"User-Agent": "jarvis-wc2026-data-bot/1.0"}

# Canonical name overrides: source name -> repo name.
NAME_NORMALIZE = {
    "czech republic": "Czechia",
    "czechia": "Czechia",
    "ivory coast": "Côte d'Ivoire",
    "cote d'ivoire": "Côte d'Ivoire",
    "bosnia & herzegovina": "Bosnia and Herzegovina",
    "bosnia and herzegovina": "Bosnia and Herzegovina",
    "turkey": "Türkiye",
    "turkiye": "Türkiye",
    "curacao": "Curaçao",
    "cape verde": "Cabo Verde",
    "united states": "USA",
    "us": "USA",
    "korea republic": "South Korea",
    "republic of korea": "South Korea",
    "dr congo": "DR Congo",
    "democratic republic of the congo": "DR Congo",
    "holland": "Netherlands",
}


def _norm_name(name: str | None) -> str:
    if not name:
        return ""
    key = name.strip().lower()
    return NAME_NORMALIZE.get(key, name.strip())


def _fetch(url: str, timeout: int = 20) -> Any:
    req = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def fetch_openfootball(year: int = 2026) -> dict[str, Any]:
    url = f"https://raw.githubusercontent.com/openfootball/worldcup.json/master/{year}/worldcup.json"
    LOG.info("fetching openfootball %s", url)
    return _fetch(url)


def fetch_worldcup26_games() -> list[dict[str, Any]]:
    LOG.info("fetching worldcup26.ir games")
    doc = _fetch("https://worldcup26.ir/get/games")
    return doc.get("games", []) if isinstance(doc, dict) else []


def _result_class(home_score: int, away_score: int) -> str:
    if home_score > away_score:
        return "H"
    if away_score > home_score:
        return "A"
    return "D"


def _parse_score(score: Any) -> tuple[int | None, int | None]:
    if isinstance(score, dict):
        try:
            return int(score["ft"][0]), int(score["ft"][1])
        except (KeyError, TypeError, ValueError):
            pass
    if isinstance(score, str):
        parts = score.replace("–", "-").split("-")
        if len(parts) == 2:
            try:
                return int(parts[0].strip()), int(parts[1].strip())
            except ValueError:
                pass
    return None, None


def _extract_matches_openfootball(doc: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in doc.get("matches", []):
        home = _norm_name(m.get("team1"))
        away = _norm_name(m.get("team2"))
        date = m.get("date")
        score = m.get("score")
        hs, aws = _parse_score(score)
        if not (home and away and date):
            continue
        out.append({
            "home": home, "away": away, "date": date,
            "home_score": hs, "away_score": aws,
            "result_class": _result_class(hs or 0, aws or 0) if hs is not None else None,
            "source": f"openfootball_{doc.get('name', '')}",
            "group": m.get("group"),
            "venue": m.get("ground"),
        })
    return out


def _extract_matches_worldcup26(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for g in games:
        home = _norm_name(g.get("home_team_name_en"))
        away = _norm_name(g.get("away_team_name_en"))
        try:
            hs = int(g.get("home_score"))
            aws = int(g.get("away_score"))
        except (TypeError, ValueError):
            hs = aws = None
        local = g.get("local_date", "")
        date = None
        if local:
            try:
                date = datetime.strptime(local.split()[0], "%m/%d/%Y").date().isoformat()
            except ValueError:
                pass
        if not (home and away):
            continue
        out.append({
            "home": home, "away": away, "date": date,
            "home_score": hs, "away_score": aws,
            "result_class": _result_class(hs or 0, aws or 0) if hs is not None else None,
            "source": "worldcup26_api",
            "group": g.get("group"),
            "finished": str(g.get("finished", "")).upper() == "TRUE",
        })
    return out


def _load_existing_fixtures() -> tuple[dict[str, Any], dict[tuple[str, str, str], dict]]:
    if not FIXTURES_PATH.exists():
        return {}, {}
    doc = json.loads(FIXTURES_PATH.read_text())
    key_map: dict[tuple[str, str, str], dict] = {}
    for m in doc.get("matches", []):
        home = _norm_name(m.get("home"))
        away = _norm_name(m.get("away"))
        date = m.get("date")
        key_map[(home, away, date)] = m
    return doc, key_map


def _load_history() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not HISTORY_PATH.exists():
        return rows
    with HISTORY_PATH.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            rows.append(row)
    return rows


def _history_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (_norm_name(row.get("home", "")), _norm_name(row.get("away", "")),
            row.get("date", ""))


def _update_fixtures(matches: list[dict[str, Any]]) -> int:
    doc, key_map = _load_existing_fixtures()
    if not doc:
        LOG.warning("no existing fixtures file; skipping fixture update")
        return 0
    updated = 0
    for m in matches:
        if m.get("home_score") is None:
            continue
        key = (m["home"], m["away"], m["date"])
        existing = key_map.get(key)
        if existing is None:
            # Try reverse home/away.
            key = (m["away"], m["home"], m["date"])
            existing = key_map.get(key)
        if existing is None:
            continue
        new_result = f"{m['home_score']}-{m['away_score']}"
        if existing.get("result") != new_result or not existing.get("played"):
            existing["result"] = new_result
            existing["result_class"] = m["result_class"]
            existing["played"] = True
            existing["source"] = m.get("source")
            updated += 1
    if updated:
        doc["generated_at"] = datetime.now(timezone.utc).isoformat()
        doc["web_data_updated"] = True
        FIXTURES_PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    return updated


def _append_history(matches: list[dict[str, Any]]) -> int:
    existing = _load_history()
    fieldnames = list(existing[0].keys()) if existing else [
        "date", "home", "away", "hg", "ag", "neutral", "competition", "stage",
    ]
    today = datetime.now(timezone.utc).date().isoformat()
    original_len = len(existing)
    # Deduplicate existing rows (in case the CSV was contaminated by an older bug)
    # and drop any fixture rows that are still today or in the future.
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for r in existing:
        if r.get("date", "") >= today:
            continue
        key = _history_key(r)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    existing = deduped
    existing_keys = {_history_key(r) for r in existing}
    new_rows: list[dict[str, Any]] = []
    for m in matches:
        hs = m.get("home_score")
        if hs is None:
            continue
        date = m.get("date", "")
        if date >= today:
            continue
        key = (_norm_name(m["home"]), _norm_name(m["away"]), date)
        if key in existing_keys:
            continue
        existing_keys.add(key)
        row: dict[str, Any] = {f: "" for f in fieldnames}
        row["date"] = m.get("date", "")
        row["home"] = m["home"]
        row["away"] = m["away"]
        row["hg"] = str(hs)
        row["ag"] = str(m["away_score"])
        row["neutral"] = "1"
        src = m.get("source", "")
        for yr in ("2026", "2022", "2018", "2014", "2010"):
            if yr in src:
                row["competition"] = f"WC{yr}"
                break
        else:
            row["competition"] = "World Cup"
        row["stage"] = "Group" if m.get("group") else "Knockout"
        new_rows.append(row)
    if not new_rows and len(deduped) == original_len:
        return 0
    with HISTORY_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(existing + new_rows)
    return len(new_rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch public web data for WC2026")
    parser.add_argument("--skip-fixtures", action="store_true", help="Do not update fixtures file")
    parser.add_argument("--skip-history", action="store_true", help="Do not append to training history")
    args = parser.parse_args(argv)

    all_matches: list[dict[str, Any]] = []
    try:
        of26 = fetch_openfootball(2026)
        all_matches.extend(_extract_matches_openfootball(of26))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        LOG.warning("openfootball 2026 failed: %s", exc)
    # Older WCs (2010/2014/2018) were tested and degraded out-of-sample
    # performance; only 2022 + current 2026 cycle are kept.
    for year in (2022,):
        try:
            of = fetch_openfootball(year)
            all_matches.extend(_extract_matches_openfootball(of))
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            LOG.warning("openfootball %d failed: %s", year, exc)
    try:
        games = fetch_worldcup26_games()
        all_matches.extend(_extract_matches_worldcup26(games))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        LOG.warning("worldcup26 API failed: %s", exc)

    LOG.info("fetched %d total match records", len(all_matches))

    fixtures_updated = 0
    history_added = 0
    if not args.skip_fixtures:
        fixtures_updated = _update_fixtures(all_matches)
    if not args.skip_history:
        history_added = _append_history(all_matches)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "records_fetched": len(all_matches),
        "fixtures_updated": fixtures_updated,
        "history_added": history_added,
        "sources": sorted({m.get("source", "unknown") for m in all_matches}),
    }
    OUT_PATH.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    LOG.info("fixtures_updated=%d history_added=%d", fixtures_updated, history_added)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
