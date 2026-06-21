#!/usr/bin/env python3
"""SBS Watch Link Resolver for WC2026.

Attaches the official SBS / SBS On Demand watch link to every match. SBS has
free Australian streaming for all 104 FIFA World Cup 2026 matches across SBS,
SBS VICELAND and SBS On Demand. This module resolves the EXACT SBS On Demand
match page when possible (parsed from the public hub), else falls back to the
official WC hub / Australia page / full-match collection.

HARD RULES:
  - Official SBS URLs only. Never link pirate streams or scrape video files.
  - Never bypass SBS login or geoblocking.
  - Always attach a button; if no exact link, use the official fallback hub.
  - Always include the Australia rights/location note.

Status -> label:
  live          -> "Watch Now on SBS"
  starting <=2h -> "Watch Soon on SBS"
  future        -> "Watch Live on SBS"
  completed     -> "Watch Replay on SBS"
  no exact link -> "Open SBS World Cup Hub"

CLI:
  python3 scripts/sbs_watch_links.py            # resolve all fixtures, print
  python3 scripts/sbs_watch_links.py --refresh  # force cache refresh
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import logging
import re
import sys
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"
FIXTURES_JSON = DATA_DIR / "wc2026_fixtures_all.json"
CACHE_PATH = DATA_DIR / "sbs_watch_link_cache.json"

sys.path.insert(0, str(REPO_ROOT / "scripts"))
try:
    from wc2026_db import actual_for as _actual_for  # type: ignore
    _HAVE_DB = True
except Exception:  # noqa: BLE001
    _HAVE_DB = False

LOG = logging.getLogger("sbs_watch_links")
if not LOG.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(_h)
LOG.setLevel(logging.INFO)

PROVIDER = "SBS On Demand"
LOCATION_NOTE = ("Available in Australia. SBS On Demand content may be "
                 "unavailable outside Australia due to rights.")

HUB_URL = "https://www.sbs.com.au/ondemand/sports-series/fifa-world-cup-2026/season-2026"
AUSTRALIA_URL = "https://www.sbs.com.au/ondemand/fifa-world-cup-2026-australia"
REPLAY_COLLECTION_URL = "https://www.sbs.com.au/ondemand/collection/fifa-world-cup-2026-full-matches"
LIVE_UPCOMING_URL = "https://www.sbs.com.au/ondemand/collection/fifa-world-cup-2026-live-and-upcoming"
WATCH_URL_FMT = "https://www.sbs.com.au/ondemand/watch/{id}"

HTTP_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) jarvis-wc2026"}
HTTP_TIMEOUT = 15
LIVE_WINDOW_HOURS = 2.5   # a match is "live" up to this long after kickoff
SOON_WINDOW_HOURS = 2.0   # "starting soon" threshold before kickoff

# Team-name normalisation so fixture names match SBS titles.
_TEAM_ALIAS = {
    "united states": "usa", "us": "usa",
    "korea republic": "south korea", "republic of korea": "south korea",
    "côte d'ivoire": "ivory coast", "cote d'ivoire": "ivory coast",
    "czechia": "czech republic",
    "türkiye": "turkiye", "turkey": "turkiye",
    "cabo verde": "cape verde",
    "bosnia and herzegovina": "bosnia", "bosnia & herzegovina": "bosnia",
    "congo dr": "dr congo", "democratic republic of the congo": "dr congo",
    "curaçao": "curacao", "holland": "netherlands",
    "ir iran": "iran", "republic of ireland": "ireland",
}


def normalise_team_name(name: str) -> str:
    """Lowercase + de-accent + alias to a canonical token for matching."""
    n = (name or "").strip().lower()
    n = (n.replace("ü", "u").replace("ç", "c").replace("ô", "o")
           .replace("é", "e").replace("í", "i").replace("á", "a")
           .replace("ã", "a").replace("ö", "o"))
    n = re.sub(r"[^a-z0-9 ]", "", n).strip()
    return _TEAM_ALIAS.get(n, n)


# ---------------------------------------------------------------------------
# WatchLink data structure
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class WatchLink:
    provider: str
    label: str
    url: str
    status: str
    match_id: str
    team_a: str
    team_b: str
    kickoff_time: Optional[str]
    source_type: str        # live | upcoming | replay | match_hub | fallback_hub
    confidence: str         # exact | fuzzy | fallback
    requires_location: str  # Australia
    notes: str


# ---------------------------------------------------------------------------
# SBS page fetch + parse
# ---------------------------------------------------------------------------
def _http_get(url: str) -> Optional[str]:
    try:
        req = urllib.request.Request(url, headers=HTTP_HEADERS)
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:  # noqa: S310
            return resp.read().decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001 - tolerant
        LOG.info("sbs fetch failed for %s: %s", url, exc)
        return None


def fetch_sbs_worldcup_hub() -> Optional[str]:
    return _http_get(HUB_URL)


def fetch_sbs_australia_page() -> Optional[str]:
    return _http_get(AUSTRALIA_URL)


def fetch_sbs_full_match_collection() -> Optional[str]:
    return _http_get(REPLAY_COLLECTION_URL)


def fetch_sbs_live_upcoming() -> Optional[str]:
    return _http_get(LIVE_UPCOMING_URL)


# Live-stream entries: "FIFA World Cup 2026(™): TeamA v TeamB: Group X: Live Stream"
# followed (within the data blob) by  "mpxMediaID",<numeric id>.
_LIVE_TITLE_RE = re.compile(
    r'FIFA World Cup 2026[^:]*:\s*([A-Z][^":]{1,40}) v ([^":]{1,40}): Group ([A-Z]): Live Stream')
# The live-stream media id is the first 12+ digit number after the title — it
# appears either as `"mpxMediaID",<id>` or as a bare `<id>` right after the
# slug. (\d{12,} skips the 4-digit "2026" inside the slug.)
_MPX_RE = re.compile(r'(\d{12,})')


def extract_sbs_live_cards(html: str) -> list[dict[str, Any]]:
    """Parse the live-and-upcoming collection: each match's LIVE STREAM page.

    Live entries carry an `mpxMediaID` (distinct from replay watch ids), so
    upcoming/live games link to the actual live stream, not an old replay.
    """
    if not html:
        return []
    u = html.replace('\\"', '"').replace("\\/", "/")
    seen: dict[str, dict[str, Any]] = {}
    for m in _LIVE_TITLE_RE.finditer(u):
        a_raw, b_raw, grp = m.group(1).strip(), m.group(2).strip(), m.group(3)
        window = u[m.end():m.end() + 600]
        idm = _MPX_RE.search(window)
        if not idm:
            continue
        key = f"{a_raw} v {b_raw}: Group {grp}"
        if key not in seen:
            seen[key] = {
                "title": key, "raw_title": m.group(0), "watch_id": idm.group(1),
                "team_a_norm": normalise_team_name(a_raw),
                "team_b_norm": normalise_team_name(b_raw), "group": grp,
                "kind": "live",
            }
    return list(seen.values())


_TITLE_RE = re.compile(r'"([A-Z][^"]{2,48} v [^"]{2,48}: Group [A-Z])"')
_ID_RE = re.compile(r'"(\d{10,})"')
_PAIR_RE = re.compile(r"^(.+?) v (.+?): Group ([A-Z])$")


def extract_sbs_match_cards(html: str) -> list[dict[str, Any]]:
    """Parse an SBS page's embedded data into match cards with watch IDs."""
    if not html:
        return []
    u = html.replace('\\"', '"').replace("\\/", "/")
    seen: dict[str, dict[str, Any]] = {}
    for m in _TITLE_RE.finditer(u):
        title = m.group(1)
        pm = _PAIR_RE.match(title)
        if not pm:
            continue
        window = u[m.end():m.end() + 500]
        idm = _ID_RE.search(window)
        if not idm:
            continue
        if title not in seen:
            seen[title] = {
                "title": title, "raw_title": title, "watch_id": idm.group(1),
                "team_a_norm": normalise_team_name(pm.group(1)),
                "team_b_norm": normalise_team_name(pm.group(2)),
                "group": pm.group(3),
            }
    return list(seen.values())


# ---------------------------------------------------------------------------
# Status + label
# ---------------------------------------------------------------------------
def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _parse_iso(s: Optional[str]) -> Optional[_dt.datetime]:
    if not s:
        return None
    try:
        return _dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def match_status(match: dict[str, Any]) -> str:
    """Derive live | soon | upcoming | completed from kickoff + verified actual."""
    if _HAVE_DB:
        try:
            if _actual_for(match.get("home", ""), match.get("away", "")):
                return "completed"
        except Exception:  # noqa: BLE001
            pass
    if match.get("played") or match.get("result"):
        return "completed"
    ko = _parse_iso(match.get("kickoff_iso"))
    if ko is None:
        return "upcoming"
    delta_h = (ko - _now()).total_seconds() / 3600.0
    if -LIVE_WINDOW_HOURS <= delta_h <= 0:
        return "live"
    if delta_h < -LIVE_WINDOW_HOURS:
        return "completed"
    if 0 < delta_h <= SOON_WINDOW_HOURS:
        return "soon"
    return "upcoming"


def _label_for(status: str, exact: bool) -> str:
    if not exact:
        return "Open SBS World Cup Hub"
    return {
        "live": "Watch Now on SBS", "soon": "Watch Soon on SBS",
        "upcoming": "Watch Live on SBS", "completed": "Watch Replay on SBS",
    }.get(status, "Watch on SBS")


def _is_australia_match(match: dict[str, Any]) -> bool:
    teams = {normalise_team_name(match.get("home", "")), normalise_team_name(match.get("away", ""))}
    return "australia" in teams


# ---------------------------------------------------------------------------
# Candidate scoring (per spec rubric)
# ---------------------------------------------------------------------------
def build_sbs_search_terms(match: dict[str, Any]) -> dict[str, str]:
    return {"a": normalise_team_name(match.get("home", "")),
            "b": normalise_team_name(match.get("away", "")),
            "group": str(match.get("group", "")).upper()}


def score_sbs_candidate(match: dict[str, Any], candidate: dict[str, Any], status: str) -> int:
    terms = build_sbs_search_terms(match)
    a, b = terms["a"], terms["b"]
    ca, cb = candidate["team_a_norm"], candidate["team_b_norm"]
    score = 0
    if {a, b} == {ca, cb} or (a in (ca, cb) and b in (ca, cb)):
        score += 60
    if (a, b) == (ca, cb):
        score += 40
    elif (b, a) == (ca, cb):
        score += 30
    if status in ("live", "upcoming", "soon"):
        score += 20
    if status == "completed":
        score += 20
    if terms["group"] and candidate.get("group") == terms["group"]:
        score += 10
    score += 10  # fifa-world-cup-2026 context (hub-sourced)
    score += 10  # SBS On Demand
    return score


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------
def _fallback_link(match: dict[str, Any], status: str) -> WatchLink:
    if _is_australia_match(match):
        url, stype = AUSTRALIA_URL, "fallback_hub"
        note = "Available in Australia. Exact match link not found; opening the SBS Australia/Socceroos page."
    elif status == "completed":
        url, stype = REPLAY_COLLECTION_URL, "replay"
        note = "Available in Australia. Exact match link not found; opening SBS full-match collection."
    else:
        url, stype = HUB_URL, "fallback_hub"
        note = "Available in Australia. Exact match link not found; opening the official SBS World Cup hub."
    return WatchLink(
        provider=PROVIDER, label=_label_for(status, exact=False), url=url, status=status,
        match_id=str(match.get("n") or match.get("match_id") or ""),
        team_a=match.get("home", ""), team_b=match.get("away", ""),
        kickoff_time=match.get("kickoff_iso"), source_type=stype,
        confidence="fallback", requires_location="Australia", notes=note,
    )


def resolve_sbs_watch_link(match: dict[str, Any],
                           replay_candidates: Optional[list[dict[str, Any]]] = None,
                           live_candidates: Optional[list[dict[str, Any]]] = None) -> WatchLink:
    """Resolve the SBS watch link for one match — to a page that ACTUALLY loads.

    We deliberately do NOT emit per-match `/ondemand/watch/<mpxMediaID>` deep
    links. SBS On Demand is a geo-gated single-page app that returns HTTP 200
    for any `/ondemand/watch/<anything>` path and then renders "link not found"
    client-side. For an UPCOMING match SBS has not published the live-stream
    page yet, so its deep link reads "link not found" until the broadcast
    actually starts — and since the group stage is mostly upcoming, that made
    nearly every deep link dead.

    Instead we link, by status, to the official SBS On Demand collection / hub
    pages, which always load and list the match one click away:
      completed              -> full-match replay collection
      live / soon / upcoming -> live-and-upcoming collection
      Australia's matches    -> the dedicated SBS Australia/Socceroos page
    (`replay_candidates` / `live_candidates` are accepted for backward
    compatibility but no longer used.)
    """
    status = match_status(match)
    if _is_australia_match(match) and status != "completed":
        url, stype = AUSTRALIA_URL, "australia_page"
        note = ("Available in Australia. Opens the official SBS FIFA World Cup / "
                "Socceroos page where this match is listed.")
    elif status == "completed":
        url, stype = REPLAY_COLLECTION_URL, "replay_collection"
        note = ("Available in Australia. Opens the official SBS full-match replay "
                "collection where this match is listed.")
    else:  # live / soon / upcoming
        url, stype = LIVE_UPCOMING_URL, "live_upcoming_collection"
        note = ("Available in Australia. Opens the official SBS live & upcoming "
                "collection where this match is listed.")
    return WatchLink(
        provider=PROVIDER, label=_label_for(status, exact=True), url=url, status=status,
        match_id=str(match.get("n") or match.get("match_id") or ""),
        team_a=match.get("home", ""), team_b=match.get("away", ""),
        kickoff_time=match.get("kickoff_iso"), source_type=stype,
        confidence="collection", requires_location="Australia", notes=note,
    )


def resolve_sbs_watch_links_for_fixtures(fixtures: list[dict[str, Any]]) -> dict[str, WatchLink]:
    """Resolve links for many fixtures to working SBS collection/hub pages."""
    out: dict[str, WatchLink] = {}
    for m in fixtures:
        key = str(m.get("n") or m.get("match_id") or f"{m.get('home')}_{m.get('away')}")
        out[key] = resolve_sbs_watch_link(m)
    LOG.info("sbs: resolved %d fixtures to official SBS collection pages", len(out))
    return out


# ---------------------------------------------------------------------------
# Cache with refresh rules
# ---------------------------------------------------------------------------
def _refresh_seconds(status: str, confidence: str) -> int:
    if status == "live":
        return 5 * 60
    if status == "soon":
        return 30 * 60
    if status == "upcoming":
        return 6 * 60 * 60
    return 12 * 60 * 60 if confidence != "exact" else 7 * 24 * 60 * 60


def _load_cache() -> dict[str, Any]:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text())
        except (OSError, ValueError):
            return {}
    return {}


def cache_watch_links(links: dict[str, WatchLink]) -> None:
    now_iso = _now().isoformat(timespec="seconds")
    payload = {
        "verified": True,
        "source": "scripts/sbs_watch_links.py — official SBS On Demand collection "
                  "pages by status (full-match replay / live-and-upcoming / "
                  "Australia), which always load. Per-match deep links are not "
                  "used: SBS does not publish an upcoming match's watch page "
                  "until broadcast, so those read 'link not found'.",
        "generated_at": now_iso,
        "location_note": LOCATION_NOTE,
        "links": {k: {**asdict(v), "cached_at": now_iso,
                      "refresh_after_s": _refresh_seconds(v.status, v.confidence)}
                  for k, v in links.items()},
    }
    CACHE_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    LOG.info("wrote SBS watch-link cache -> %s (%d links)", CACHE_PATH, len(links))


def refresh_watch_links(force: bool = False) -> dict[str, WatchLink]:
    """Resolve + cache links for all fixtures, honouring per-status refresh TTLs."""
    fixtures = _load_fixtures()
    cache = _load_cache().get("links", {})
    now = _now()
    stale = False
    for m in fixtures:
        key = str(m.get("n") or m.get("match_id") or f"{m.get('home')}_{m.get('away')}")
        entry = cache.get(key)
        if force or not entry:
            stale = True
            break
        cached_at = _parse_iso(entry.get("cached_at"))
        ttl = entry.get("refresh_after_s", 21600)
        if cached_at is None or (now - cached_at).total_seconds() >= ttl:
            stale = True
            break
    if not stale and cache:
        LOG.info("sbs: cache fresh, nothing to refresh")
        return {k: WatchLink(**{kk: vv for kk, vv in v.items()
                                if kk in WatchLink.__dataclass_fields__})
                for k, v in cache.items()}
    links = resolve_sbs_watch_links_for_fixtures(fixtures)
    cache_watch_links(links)
    return links


# ---------------------------------------------------------------------------
# Attach to pipelines
# ---------------------------------------------------------------------------
def _load_fixtures() -> list[dict[str, Any]]:
    if not FIXTURES_JSON.exists():
        return []
    try:
        doc = json.loads(FIXTURES_JSON.read_text())
    except (OSError, ValueError):
        return []
    out = []
    placeholders = ("winner ", "runner-up ", "3rd ", "loser ", "tbd")
    for m in doc.get("matches", []):
        h, a = str(m.get("home") or ""), str(m.get("away") or "")
        if h and a and not any(h.lower().startswith(p) or a.lower().startswith(p) for p in placeholders):
            out.append(m)
    return out


def attach_watch_links_to_predictions(predictions: dict[str, Any],
                                      links: Optional[dict[str, WatchLink]] = None) -> dict[str, Any]:
    """Add a `watch_link` dict to each prediction entry (keyed by fixture n)."""
    if links is None:
        links = refresh_watch_links()
    if isinstance(predictions, dict):
        for key, entry in predictions.items():
            if not isinstance(entry, dict):
                continue
            wl = links.get(str(entry.get("n") or key))
            if wl:
                entry["watch_link"] = asdict(wl)
    return predictions


def attach_watch_links_to_bet_builder_output(output: dict[str, Any],
                                            links: Optional[dict[str, WatchLink]] = None) -> dict[str, Any]:
    """Add a `watch_link` to every leg of every variation."""
    if links is None:
        links = refresh_watch_links()
    for vkey in ("variation_a", "variation_b", "variation_c"):
        var = output.get(vkey)
        if not isinstance(var, dict):
            continue
        for leg in var.get("legs", []):
            wl = links.get(str(leg.get("match_id")))
            if wl:
                leg["watch_link"] = asdict(wl)
    # Also attach to the per-game coverage_modes rows (what the UI table renders).
    for row in output.get("coverage_modes", []):
        wl = links.get(str(row.get("match_id")))
        if wl:
            row["watch_link"] = asdict(wl)
    return output


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="SBS Watch Link Resolver (WC2026)")
    parser.add_argument("--refresh", action="store_true", help="force cache refresh")
    args = parser.parse_args(argv)
    links = refresh_watch_links(force=args.refresh)
    exact = sum(1 for v in links.values() if v.confidence == "exact")
    fuzzy = sum(1 for v in links.values() if v.confidence == "fuzzy")
    fb = sum(1 for v in links.values() if v.confidence == "fallback")
    print(f"\nSBS watch links: {len(links)} fixtures  (exact={exact} fuzzy={fuzzy} fallback={fb})")
    for v in list(links.values())[:12]:
        print(f"  [{v.confidence:8}] {v.label:22} {v.team_a} v {v.team_b} -> {v.url}")
    print(f"\n{LOCATION_NOTE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
