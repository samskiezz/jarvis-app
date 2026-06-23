"""WC2026 bookmaker odds scraper + value-bet detector.

Pipeline:
    1. For each of the 12 MD2 fixtures in wc2026_model_predictions.json,
       try Pinnacle -> Bet365 -> OddsPortal in order. First success wins.
       If all fail, fall back to a clearly-marked placeholder so the
       downstream value-bet pass still runs deterministically.
    2. Strip the bookmaker overround (vig) so the three implied
       probabilities sum to 1.
    3. Compare the de-vigged book probability to our model's p_home /
       p_draw / p_away. Flag any side where the model edge >= threshold_pp
       percentage points.
    4. Size each flagged bet with a quarter-Kelly stake.
    5. Write /opt/jarvis-app-1/server/data/wc2026_value_bets.json.

Run via cron a few times per day during match days, e.g.:
    0 */4 * * * /opt/jarvis-app-1/.venv/bin/python /opt/jarvis-app-1/scripts/wc2026_odds_scraper.py

This script is read-only against the network and writes a single JSON
file. It never mutates the model predictions file and never raises on
network failure.
"""
from __future__ import annotations

import dataclasses
import datetime as _dt
import json
import logging
import os
import pathlib
import sys
import urllib.error
import urllib.request
from typing import Any, Iterable

LOG = logging.getLogger("wc2026_odds")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATA_DIR = pathlib.Path("/opt/jarvis-app-1/server/data")
MODEL_PATH = DATA_DIR / "wc2026_model_predictions.json"
OUT_PATH = DATA_DIR / "wc2026_value_bets.json"
CACHE_PATH = DATA_DIR / "wc2026_odds_cache.json"
MANUAL_PATH = DATA_DIR / "wc2026_manual_odds.json"

# Placeholder W/D/L decimal odds used when every scraper fails.
# Derived from typical WC group-stage favourite lines: home -110 US ->
# 1.91 decimal, draw +270 -> 3.70 decimal, away +280 -> 3.80 decimal.
PLACEHOLDER_ODDS: tuple[float, float, float] = (1.91, 3.70, 3.80)

# Edge threshold for flagging a value bet (percentage points).
DEFAULT_THRESHOLD_PP: float = 5.0

# Bankroll in arbitrary units. The recommended_unit field is expressed
# in the same units, so 100 units == one full bankroll.
DEFAULT_BANKROLL: float = 100.0

# Kelly fraction. Quarter Kelly is the standard "less ruinous" default
# for sports betting where the true edge is uncertain.
DEFAULT_KELLY_FRACTION: float = 0.25

HTTP_TIMEOUT_S: int = 8
HTTP_HEADERS = {"User-Agent": "Mozilla/5.0 jarvis-wc2026"}

# How many days around today to scan the ESPN scoreboard for odds.
ESPN_FUTURE_DAYS = 30
ESPN_PAST_DAYS = 3


def _safe_url(url: str) -> str:
    """Encode non-ASCII path components while leaving the scheme/netloc alone."""
    from urllib.parse import quote, urlsplit, urlunsplit
    parts = urlsplit(url)
    path = quote(parts.path, safe="/%")
    query = quote(parts.query, safe="=&?")
    return urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


@dataclasses.dataclass(frozen=True)
class Fixture:
    """One fixture pulled from wc2026_model_predictions.json."""

    n: int
    home: str
    away: str
    p_home: float
    p_draw: float
    p_away: float


@dataclasses.dataclass(frozen=True)
class BookOdds:
    """Raw decimal W/D/L odds plus the source string."""

    home: float
    draw: float
    away: float
    source: str


def _http_get(url: str, timeout: int = HTTP_TIMEOUT_S) -> str:
    """Fetch a URL, returning decoded text. Raises on any failure."""
    req = urllib.request.Request(_safe_url(url), headers=HTTP_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        return resp.read().decode("utf-8", errors="replace")


def _load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_json(path: pathlib.Path, data: dict[str, Any]) -> None:
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _load_odds_cache() -> dict[str, dict[str, Any]]:
    """Return cached real odds keyed by match_n, so close-to-kickoff lines persist."""
    return _load_json(CACHE_PATH).get("odds", {})


def _save_odds_cache(cache: dict[str, dict[str, Any]]) -> None:
    _save_json(CACHE_PATH, {
        "updated_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "odds": cache,
    })


def _cache_key(fixture: Fixture) -> str:
    return str(fixture.n)


def scrape_pinnacle(fixture: Fixture) -> BookOdds | None:
    """Try Pinnacle's public soccer endpoint for the fixture.

    Pinnacle's anonymous API frequently returns 401/403 outside of
    whitelisted IPs. We treat any non-success or parse miss as None and
    let the caller fall through to the next book.
    """
    url = (
        "https://guest.api.arcadia.pinnacle.com/0.1/leagues/487/markets/straight"
    )
    try:
        body = _http_get(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        LOG.info("pinnacle: network error for %s vs %s: %s", fixture.home, fixture.away, exc)
        return None
    except Exception as exc:  # noqa: BLE001 - defensive: scraper must never crash
        LOG.warning("pinnacle: unexpected error: %s", exc)
        return None

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        LOG.info("pinnacle: non-json response for %s vs %s", fixture.home, fixture.away)
        return None

    odds = _extract_pinnacle_odds(payload, fixture)
    if odds is None:
        return None
    return BookOdds(home=odds[0], draw=odds[1], away=odds[2], source="pinnacle")


def _extract_pinnacle_odds(
    payload: Any, fixture: Fixture
) -> tuple[float, float, float] | None:
    """Walk a Pinnacle markets payload looking for the W/D/L line of fixture."""
    if not isinstance(payload, list):
        return None
    for market in payload:
        if not isinstance(market, dict):
            continue
        if market.get("type") != "moneyline":
            continue
        prices = market.get("prices")
        if not isinstance(prices, list) or len(prices) < 3:
            continue
        try:
            home = float(prices[0]["price"])
            draw = float(prices[1]["price"])
            away = float(prices[2]["price"])
        except (KeyError, TypeError, ValueError):
            continue
        if home > 1.0 and draw > 1.0 and away > 1.0:
            return home, draw, away
    return None


def scrape_bet365_alt(fixture: Fixture) -> BookOdds | None:
    """Tolerant fallback against a retail-book mirror.

    Bet365 itself is locked down hard, so this hits a public mirror
    that surfaces the same lines. Any failure returns None.
    """
    url = (
        f"https://www.oddschecker.com/football/world-cup/"
        f"{fixture.home.lower().replace(' ', '-')}-v-"
        f"{fixture.away.lower().replace(' ', '-')}/winner"
    )
    try:
        body = _http_get(url)
    except Exception as exc:  # noqa: BLE001 - tolerant by design
        LOG.info("bet365_alt: network error for %s vs %s: %s", fixture.home, fixture.away, exc)
        return None

    odds = _extract_fractional_three_way(body)
    if odds is None:
        return None
    return BookOdds(home=odds[0], draw=odds[1], away=odds[2], source="bet365_alt")


def _extract_fractional_three_way(html: str) -> tuple[float, float, float] | None:
    """Very loose three-way decimal extractor for a generic odds page."""
    import re

    decs = re.findall(r"\b(\d{1,2}\.\d{1,2})\b", html)
    if len(decs) < 3:
        return None
    try:
        home = float(decs[0])
        draw = float(decs[1])
        away = float(decs[2])
    except ValueError:
        return None
    if home <= 1.0 or draw <= 1.0 or away <= 1.0:
        return None
    if home > 50 or draw > 50 or away > 50:
        return None
    return home, draw, away


def scrape_oddsportal(fixture: Fixture) -> BookOdds | None:
    """Average odds across multiple books via the OddsPortal public page."""
    slug_home = fixture.home.lower().replace(" ", "-").replace("'", "")
    slug_away = fixture.away.lower().replace(" ", "-").replace("'", "")
    url = f"https://www.oddsportal.com/football/world/world-cup/{slug_home}-{slug_away}/"
    try:
        body = _http_get(url)
    except Exception as exc:  # noqa: BLE001 - tolerant by design
        LOG.info("oddsportal: network error for %s vs %s: %s", fixture.home, fixture.away, exc)
        return None

    odds = _extract_fractional_three_way(body)
    if odds is None:
        return None
    return BookOdds(home=odds[0], draw=odds[1], away=odds[2], source="oddsportal_avg")


# ---------------------------------------------------------------------------
# ESPN scoreboard — free, no-key, reachable from server IPs. Carries real
# DraftKings 3-way (home/draw/away) moneylines for WC matches. This is the
# primary live source now that Pinnacle/Bet365/OddsPortal are IP-blocked.
# ---------------------------------------------------------------------------
_ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
# value: (espn_home_norm, home_decimal, draw_decimal, away_decimal)
_ESPN_CACHE: dict[frozenset, tuple[str, float, float, float]] | None = None

# Canonical team aliases so ESPN names match wc2026 fixture names.
_ESPN_ALIAS = {
    "united states": "usa", "us": "usa",
    "korea republic": "south korea", "republic of korea": "south korea",
    "ivory coast": "côte d'ivoire", "cote d'ivoire": "côte d'ivoire",
    "czech republic": "czechia", "turkey": "türkiye", "turkiye": "türkiye",
    "cape verde": "cabo verde", "bosnia": "bosnia and herzegovina",
    "congo dr": "dr congo", "holland": "netherlands",
}


def _norm_team(name: str) -> str:
    n = (name or "").strip().lower()
    return _ESPN_ALIAS.get(n, n)


def _american_to_decimal(ml: float) -> float | None:
    """Convert an American moneyline to decimal odds."""
    try:
        ml = float(ml)
    except (TypeError, ValueError):
        return None
    if ml == 0:
        return None
    return 1.0 + (ml / 100.0 if ml > 0 else 100.0 / abs(ml))


def _build_espn_cache() -> dict[frozenset, tuple[str, float, float, float]]:
    """Fetch ESPN scoreboard across the WC window once; cache team-pair odds.

    Cache value is (espn_home_norm, home_decimal, draw_decimal, away_decimal),
    keyed by the unordered team pair so lookups can orient to either side.
    """
    import datetime as _dt

    cache: dict[frozenset, tuple[str, float, float, float]] = {}
    urls = [_ESPN_SCOREBOARD]
    try:
        today = _dt.datetime.now(_dt.timezone.utc).date()
        for delta in range(-ESPN_PAST_DAYS, ESPN_FUTURE_DAYS + 1):
            day = today + _dt.timedelta(days=delta)
            urls.append(f"{_ESPN_SCOREBOARD}?dates={day.strftime('%Y%m%d')}")
    except Exception:  # noqa: BLE001
        pass

    for url in urls:
        try:
            body = _http_get(url, timeout=10)
            doc = json.loads(body)
        except Exception as exc:  # noqa: BLE001 - tolerant
            LOG.info("espn: fetch/parse failed for %s: %s", url, exc)
            continue
        for ev in doc.get("events", []):
            for comp in ev.get("competitions", []):
                home = away = ""
                for c in comp.get("competitors", []):
                    nm = c.get("team", {}).get("displayName", "")
                    if c.get("homeAway") == "home":
                        home = nm
                    elif c.get("homeAway") == "away":
                        away = nm
                if not (home and away):
                    continue
                odds_list = comp.get("odds") or []
                o = next((x for x in odds_list if isinstance(x, dict)), None)
                if o is None:
                    continue
                ml = o.get("moneyline", {}) or {}
                try:
                    home_ml = ml.get("home", {}).get("close", {}).get("odds")
                    away_ml = ml.get("away", {}).get("close", {}).get("odds")
                    draw_ml = o.get("drawOdds", {}).get("moneyLine")
                except AttributeError:
                    continue
                hd = _american_to_decimal(home_ml) if home_ml is not None else None
                ad = _american_to_decimal(away_ml) if away_ml is not None else None
                dd = _american_to_decimal(draw_ml) if draw_ml is not None else None
                if hd and ad and dd and hd > 1.0 and ad > 1.0 and dd > 1.0:
                    cache[frozenset((_norm_team(home), _norm_team(away)))] = (
                        _norm_team(home), hd, dd, ad)
    LOG.info("espn: cached %d match odds", len(cache))
    return cache


def scrape_espn(fixture: Fixture) -> BookOdds | None:
    """Real 3-way odds from ESPN's DraftKings feed (free, no key)."""
    global _ESPN_CACHE
    if _ESPN_CACHE is None:
        _ESPN_CACHE = _build_espn_cache()
    hit = _ESPN_CACHE.get(frozenset((_norm_team(fixture.home), _norm_team(fixture.away))))
    if hit is None:
        return None
    espn_home, home_dec, draw_dec, away_dec = hit
    # Orient to the querying fixture's home: if our home is ESPN's away side,
    # swap the home/away decimals so the price always matches the team.
    if _norm_team(fixture.home) != espn_home:
        home_dec, away_dec = away_dec, home_dec
    return BookOdds(home=home_dec, draw=draw_dec, away=away_dec, source="espn_draftkings")


def scrape_the_odds_api(fixture: Fixture) -> BookOdds | None:
    """The Odds API (paid, key-required). Returns None if no key or no match."""
    api_key = os.environ.get("THE_ODDS_API_KEY")
    if not api_key:
        return None
    url = (
        "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds"
        f"?apiKey={api_key}&regions=eu&markets=h2h&oddsFormat=decimal"
    )
    try:
        body = _http_get(url, timeout=12)
        doc = json.loads(body)
    except Exception as exc:  # noqa: BLE001
        LOG.info("the-odds-api: fetch/parse failed: %s", exc)
        return None
    if not isinstance(doc, list):
        return None
    home_norm = _norm_team(fixture.home)
    away_norm = _norm_team(fixture.away)
    for event in doc:
        if not isinstance(event, dict):
            continue
        h = _norm_team(event.get("home_team", ""))
        a = _norm_team(event.get("away_team", ""))
        if not ({h, a} == {home_norm, away_norm}):
            continue
        bookmaker = next(iter(event.get("bookmakers", [])), None)
        if not isinstance(bookmaker, dict):
            continue
        market = next(
            (m for m in bookmaker.get("markets", []) if m.get("key") == "h2h"),
            None,
        )
        if not market:
            continue
        outcomes = {o.get("name", "").lower(): o.get("price") for o in market.get("outcomes", [])}
        # orient draw: The Odds API often labels it as the away team? It uses names.
        # Try common labels.
        hd = outcomes.get(event.get("home_team", "").lower())
        ad = outcomes.get(event.get("away_team", "").lower())
        dd = outcomes.get("draw")
        if hd and ad and dd:
            if _norm_team(fixture.home) != h:
                hd, ad = ad, hd
            try:
                return BookOdds(home=float(hd), draw=float(dd), away=float(ad), source="the_odds_api")
            except (TypeError, ValueError):
                continue
    return None


def scrape_manual_odds(fixture: Fixture) -> BookOdds | None:
    """User-pasted closing odds in server/data/wc2026_manual_odds.json.

    File shape:
        {"42": {"home": 1.75, "draw": 3.50, "away": 5.00}, ...}
    """
    if not MANUAL_PATH.exists():
        return None
    doc = _load_json(MANUAL_PATH)
    raw = doc.get(str(fixture.n)) or doc.get(f"{fixture.home} vs {fixture.away}")
    if not raw:
        return None
    try:
        home = float(raw["home"])
        draw = float(raw["draw"])
        away = float(raw["away"])
        if home > 1.0 and draw > 1.0 and away > 1.0:
            return BookOdds(home=home, draw=draw, away=away, source="manual")
    except (KeyError, TypeError, ValueError):
        pass
    return None


def scrape_cached_odds(fixture: Fixture, cache: dict[str, dict[str, Any]]) -> BookOdds | None:
    """Use the last successfully scraped real odds for this fixture."""
    hit = cache.get(str(fixture.n))
    if not hit:
        return None
    try:
        home = float(hit["home"])
        draw = float(hit["draw"])
        away = float(hit["away"])
        if home > 1.0 and draw > 1.0 and away > 1.0:
            return BookOdds(home=home, draw=draw, away=away, source="cached")
    except (KeyError, TypeError, ValueError):
        pass
    return None


def scrape_any(fixture: Fixture, cache: dict[str, dict[str, Any]] | None = None) -> BookOdds:
    """Try every scraper in order; return placeholder if all fail."""
    for fn in (scrape_espn, scrape_the_odds_api, scrape_manual_odds):
        result = fn(fixture)
        if result is not None:
            return result
    if cache is not None:
        result = scrape_cached_odds(fixture, cache)
        if result is not None:
            return result
    for fn in (scrape_pinnacle, scrape_bet365_alt, scrape_oddsportal):
        result = fn(fixture)
        if result is not None:
            return result
    LOG.info(
        "all books failed for %s vs %s, using placeholder -110/+270/+280",
        fixture.home,
        fixture.away,
    )
    return BookOdds(
        home=PLACEHOLDER_ODDS[0],
        draw=PLACEHOLDER_ODDS[1],
        away=PLACEHOLDER_ODDS[2],
        source="placeholder",
    )


def remove_vig(decimal_odds: BookOdds) -> tuple[float, float, float]:
    """Convert decimal odds to fair probabilities by stripping the overround.

    Implied prob per side = 1 / decimal_price. The three implieds will
    sum to >1 by the bookmaker margin. We normalise so they sum to 1.
    Returns (p_home, p_draw, p_away).
    """
    if decimal_odds.home <= 1.0 or decimal_odds.draw <= 1.0 or decimal_odds.away <= 1.0:
        raise ValueError(f"decimal odds must be >1.0, got {decimal_odds}")
    raw_h = 1.0 / decimal_odds.home
    raw_d = 1.0 / decimal_odds.draw
    raw_a = 1.0 / decimal_odds.away
    total = raw_h + raw_d + raw_a
    if total <= 0:
        raise ValueError(f"degenerate odds: {decimal_odds}")
    return raw_h / total, raw_d / total, raw_a / total


def value_bet(
    model_p: float, book_p: float, threshold_pp: float = DEFAULT_THRESHOLD_PP
) -> bool:
    """Return True iff the model edge exceeds threshold_pp.

    model_p and book_p are both probabilities in [0, 1]. The edge is
    expressed in percentage points (model_p - book_p) * 100. EV-positive
    only when the edge is positive AND large enough to overcome
    bookmaker-margin uncertainty plus model noise.
    """
    if not 0.0 <= model_p <= 1.0:
        raise ValueError(f"model_p out of range: {model_p}")
    if not 0.0 <= book_p <= 1.0:
        raise ValueError(f"book_p out of range: {book_p}")
    edge_pp = (model_p - book_p) * 100.0
    return edge_pp >= threshold_pp


def kelly_units(
    edge: float,
    bankroll: float = DEFAULT_BANKROLL,
    fraction: float = DEFAULT_KELLY_FRACTION,
) -> float:
    """Quarter-Kelly bet size, in bankroll units.

    `edge` here is the *fractional* edge (model_p - book_p), not pp.
    Returns 0 if edge <= 0 or bankroll <= 0 to avoid betting on losers.
    """
    if edge <= 0.0 or bankroll <= 0.0:
        return 0.0
    if not 0.0 < fraction <= 1.0:
        raise ValueError(f"kelly fraction must be in (0, 1], got {fraction}")
    raw = bankroll * fraction * edge
    return round(max(raw, 0.0), 2)


def _load_model_predictions() -> list[Fixture]:
    if not MODEL_PATH.exists():
        LOG.error("model predictions file missing: %s", MODEL_PATH)
        return []
    with MODEL_PATH.open("r", encoding="utf-8") as fh:
        doc = json.load(fh)
    md2 = doc.get("md2_predictions")
    if not isinstance(md2, list):
        LOG.error("md2_predictions missing or wrong type in %s", MODEL_PATH)
        return []
    fixtures: list[Fixture] = []
    for row in md2:
        try:
            fixtures.append(
                Fixture(
                    n=int(row["n"]),
                    home=str(row["home"]),
                    away=str(row["away"]),
                    p_home=float(row["p_home"]),
                    p_draw=float(row["p_draw"]),
                    p_away=float(row["p_away"]),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            LOG.warning("skipping malformed prediction row %r: %s", row, exc)
    return fixtures


def _evaluate_one(
    fixture: Fixture, threshold_pp: float, bankroll: float, kelly_fraction: float,
    cache: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    odds = scrape_any(fixture, cache=cache)
    # Persist any non-placeholder real odds so tomorrow's run keeps the best line seen.
    if cache is not None and odds.source not in ("placeholder", "cached"):
        cache[str(fixture.n)] = {
            "home": odds.home, "draw": odds.draw, "away": odds.away,
            "source": odds.source,
            "updated_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
    book_p_home, book_p_draw, book_p_away = remove_vig(odds)

    edge_home = fixture.p_home - book_p_home
    edge_draw = fixture.p_draw - book_p_draw
    edge_away = fixture.p_away - book_p_away

    sides = (
        ("home", fixture.p_home, book_p_home, edge_home),
        ("draw", fixture.p_draw, book_p_draw, edge_draw),
        ("away", fixture.p_away, book_p_away, edge_away),
    )

    best_side, _, _, best_edge = max(sides, key=lambda s: s[3])
    has_value = value_bet(
        model_p=dict(home=fixture.p_home, draw=fixture.p_draw, away=fixture.p_away)[best_side],
        book_p=dict(home=book_p_home, draw=book_p_draw, away=book_p_away)[best_side],
        threshold_pp=threshold_pp,
    )
    stake = kelly_units(best_edge, bankroll=bankroll, fraction=kelly_fraction) if has_value else 0.0

    return {
        "match_n": fixture.n,
        "home": fixture.home,
        "away": fixture.away,
        "source": odds.source,
        "decimal_odds": {
            "home": odds.home,
            "draw": odds.draw,
            "away": odds.away,
        },
        "model_p_home": round(fixture.p_home, 4),
        "model_p_draw": round(fixture.p_draw, 4),
        "model_p_away": round(fixture.p_away, 4),
        "book_p_home_devigged": round(book_p_home, 4),
        "book_p_draw_devigged": round(book_p_draw, 4),
        "book_p_away_devigged": round(book_p_away, 4),
        "edge_pp_home": round(edge_home * 100.0, 2),
        "edge_pp_draw": round(edge_draw * 100.0, 2),
        "edge_pp_away": round(edge_away * 100.0, 2),
        "best_side": best_side,
        "edge_pp": round(best_edge * 100.0, 2),
        "value_bet": has_value,
        "recommended_unit": stake,
    }


def evaluate_all(
    fixtures: Iterable[Fixture],
    threshold_pp: float = DEFAULT_THRESHOLD_PP,
    bankroll: float = DEFAULT_BANKROLL,
    kelly_fraction: float = DEFAULT_KELLY_FRACTION,
    cache: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    rows = [
        _evaluate_one(f, threshold_pp=threshold_pp, bankroll=bankroll,
                      kelly_fraction=kelly_fraction, cache=cache)
        for f in fixtures
    ]
    if cache is not None:
        _save_odds_cache(cache)
    return rows


def main(argv: list[str] | None = None) -> int:
    _ = argv  # reserved for future flag parsing
    fixtures = _load_model_predictions()
    if not fixtures:
        LOG.error("no fixtures loaded, refusing to write empty file")
        return 1

    cache = _load_odds_cache()
    rows = evaluate_all(fixtures, cache=cache)
    out_doc = {
        "generated_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "threshold_pp": DEFAULT_THRESHOLD_PP,
        "bankroll_units": DEFAULT_BANKROLL,
        "kelly_fraction": DEFAULT_KELLY_FRACTION,
        "value_bets": rows,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(out_doc, fh, ensure_ascii=False, indent=2)
    tmp.replace(OUT_PATH)

    flagged = sum(1 for r in rows if r["value_bet"])
    LOG.info("wrote %s rows to %s (%s flagged value bets)", len(rows), OUT_PATH, flagged)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
