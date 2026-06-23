"""LLM-based feature extractor for WC2026 MD2 fixtures.

For each MD2 fixture, scrape a public match preview (rotowire / sportsmole),
send the text to the local Ollama LLM (llama3.1:8b), and ask it to extract
structured features (lineup, key players, tactical setup, manager changes,
form summary). Results saved to wc2026_llm_features.json keyed by match_n.

Falls back to a placeholder stub per fixture when the LLM is unreachable or
the preview cannot be scraped — never crashes the pipeline.

Run manually:
    /opt/jarvis-app-1/.venv/bin/python /opt/jarvis-app-1/scripts/wc2026_llm_features.py

Cron-ready (once per MD2 cycle):
    0 6 * * * /opt/jarvis-app-1/.venv/bin/python /opt/jarvis-app-1/scripts/wc2026_llm_features.py
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import logging
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

LOG = logging.getLogger("wc2026_llm_features")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# --------------------------------------------------------------------------- #
# Config                                                                      #
# --------------------------------------------------------------------------- #

DATA_PATH = pathlib.Path("/opt/jarvis-app-1/server/data/wc2026_llm_features.json")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

# Per-request budgets — keep snappy so cron does not hang.
HTTP_TIMEOUT_S = 8
LLM_TIMEOUT_S = 60
USER_AGENT = "Mozilla/5.0 jarvis-wc2026-llm"

# MD2 fixtures — mirrors scripts/wc2026_predictor.MD2_FIXTURES (kept local to
# avoid coupling import side-effects from the predictor module).
MD2_FIXTURES: list[tuple[int, str, str]] = [
    (1, "USA", "Australia"),
    (2, "Mexico", "Korea Republic"),
    (3, "Canada", "Scotland"),
    (4, "Brazil", "Switzerland"),
    (5, "Germany", "Netherlands"),
    (6, "Argentina", "Norway"),
    (7, "France", "Senegal"),
    (8, "Spain", "Iran"),
    (9, "England", "Ecuador"),
    (10, "Portugal", "Cape Verde"),
    (11, "Belgium", "Algeria"),
    (12, "New Zealand", "Egypt"),
]

EMPTY_FEATURES: dict[str, object] = {
    "lineup_xi": [],
    "key_players": [],
    "tactical": {"formation": None, "press_intensity": None},
    "manager_change": None,
    "form_summary": None,
}

# --------------------------------------------------------------------------- #
# Preview scraping                                                            #
# --------------------------------------------------------------------------- #


def _http_get(url: str, timeout: int = HTTP_TIMEOUT_S) -> str | None:
    """GET a URL, return decoded text or None on any failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
            return r.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        LOG.debug("fetch failed %s: %s", url, exc)
        return None


def _strip_html(html: str) -> str:
    """Crude HTML -> text. Keeps paragraph breaks."""
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+\n", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _slug(team: str) -> str:
    base = team.lower().replace("'", "").replace("ô", "o").replace("ç", "c")
    base = base.replace("ü", "u").replace("ä", "a").replace("é", "e")
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-")


def _candidate_preview_urls(home: str, away: str) -> list[str]:
    """Best-effort preview URLs from public sources. Order = priority."""
    q = urllib.parse.quote_plus(f"{home} vs {away} preview world cup 2026")
    return [
        # Sportsmole search results page (often contains preview blurbs).
        f"https://www.sportsmole.co.uk/search.html?searchword={urllib.parse.quote_plus(home + ' ' + away)}",
        # Rotowire football news landing (lightweight, low block-rate).
        f"https://www.rotowire.com/soccer/news.php?term={urllib.parse.quote_plus(home + ' ' + away)}",
        # ESPN search fallback.
        f"https://www.espn.com/search/results/_/q/{urllib.parse.quote_plus(home + ' vs ' + away)}",
        # DuckDuckGo lite search — no JS required.
        f"https://lite.duckduckgo.com/lite/?q={q}",
    ]


def fetch_preview(home: str, away: str) -> tuple[str | None, str | None]:
    """Try candidate URLs in order; return (preview_text, source_url)."""
    for url in _candidate_preview_urls(home, away):
        html = _http_get(url)
        if not html:
            continue
        text = _strip_html(html)
        # Heuristic: keep if both team names appear and length is reasonable.
        if home.lower() in text.lower() and away.lower() in text.lower() and len(text) > 400:
            # Truncate to ~6000 chars to keep LLM prompt cheap.
            return text[:6000], url
    return None, None


# --------------------------------------------------------------------------- #
# LLM extraction                                                              #
# --------------------------------------------------------------------------- #

_PROMPT_TEMPLATE = """You are a football analyst. Read the match preview text
below and extract structured features for the HOME team only as strict JSON.

Match: {home} vs {away}

Preview text:
\"\"\"
{preview}
\"\"\"

Return ONLY a JSON object with this exact shape (no prose, no markdown):
{{
  "lineup_xi": ["player1", "player2", ... up to 11 names],
  "key_players": [{{"name": "...", "status": "in-form|doubtful|suspended|injured"}}],
  "tactical": {{"formation": "4-3-3 or similar", "press_intensity": "high|medium|low"}},
  "manager_change": "name of new manager or null if unchanged",
  "form_summary": "one short sentence summarising recent form"
}}

If a field is unknown, use null or [] but keep the keys."""


def _ollama_generate(prompt: str, timeout: int = LLM_TIMEOUT_S) -> str | None:
    """POST to local Ollama /api/generate. Returns raw text response or None."""
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2, "num_predict": 512},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
            payload = json.loads(r.read().decode("utf-8", errors="replace"))
        return payload.get("response")
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        LOG.warning("Ollama call failed: %s", exc)
        return None


def _coerce_features(raw: str) -> dict[str, object]:
    """Parse LLM JSON output into the canonical feature schema."""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract the first {...} block.
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return dict(EMPTY_FEATURES)
        try:
            parsed = json.loads(m.group(0))
        except json.JSONDecodeError:
            return dict(EMPTY_FEATURES)

    if not isinstance(parsed, dict):
        return dict(EMPTY_FEATURES)

    out = dict(EMPTY_FEATURES)
    lineup = parsed.get("lineup_xi")
    if isinstance(lineup, list):
        out["lineup_xi"] = [str(p) for p in lineup if isinstance(p, (str, int))][:11]

    keys = parsed.get("key_players")
    if isinstance(keys, list):
        clean: list[dict[str, str]] = []
        for entry in keys:
            if isinstance(entry, dict) and "name" in entry:
                clean.append({
                    "name": str(entry.get("name", "")),
                    "status": str(entry.get("status", "")),
                })
        out["key_players"] = clean

    tactical = parsed.get("tactical")
    if isinstance(tactical, dict):
        out["tactical"] = {
            "formation": tactical.get("formation"),
            "press_intensity": tactical.get("press_intensity"),
        }

    out["manager_change"] = parsed.get("manager_change")
    out["form_summary"] = parsed.get("form_summary")
    return out


def extract_features_from_text(
    text: str,
    home: str,
    away: str,
    llm_endpoint: str | None = None,
) -> tuple[dict[str, object], str]:
    """Send `text` to the LLM and parse structured features.

    Returns (features_dict, source) where source is 'llm' or 'stub'.
    `llm_endpoint` is accepted for interface compatibility; the real endpoint
    is resolved from OLLAMA_HOST + /api/generate.
    """
    del llm_endpoint  # reserved for future routing
    if not text:
        return dict(EMPTY_FEATURES), "stub"

    prompt = _PROMPT_TEMPLATE.format(home=home, away=away, preview=text)
    raw = _ollama_generate(prompt)
    if not raw:
        return dict(EMPTY_FEATURES), "stub"

    features = _coerce_features(raw)
    # Treat fully empty parse as stub so downstream can tell.
    if features == EMPTY_FEATURES:
        return features, "stub"
    return features, "llm"


# --------------------------------------------------------------------------- #
# Bulk processing                                                             #
# --------------------------------------------------------------------------- #


def bulk_process(
    fixtures: list[tuple[int, str, str]] | None = None,
    output_path: pathlib.Path = DATA_PATH,
) -> dict[str, object]:
    """Process each fixture and persist results. Returns the full doc."""
    fixtures = fixtures or MD2_FIXTURES
    now = _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")

    matches: dict[str, object] = {}
    for match_n, home, away in fixtures:
        LOG.info("processing match %d: %s vs %s", match_n, home, away)
        preview, preview_url = fetch_preview(home, away)
        if preview:
            features, source = extract_features_from_text(preview, home, away)
        else:
            features, source = dict(EMPTY_FEATURES), "stub"
            preview_url = None

        matches[str(match_n)] = {
            "home": home,
            "away": away,
            "preview_url": preview_url,
            "fetched_at": now,
            "features": features,
            "source": source,
            "model": OLLAMA_MODEL if source == "llm" else None,
        }

    doc = {
        "last_updated": now,
        "model": OLLAMA_MODEL,
        "matchday": "MD2",
        "count": len(matches),
        "matches": matches,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    LOG.info("wrote %s (%d fixtures)", output_path, len(matches))
    return doc


# --------------------------------------------------------------------------- #
# CLI                                                                         #
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="WC2026 LLM feature extractor")
    parser.add_argument(
        "--match",
        type=int,
        default=None,
        help="Process a single MD2 match number (1..12). Default: all 12.",
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=DATA_PATH,
        help="Output JSON path.",
    )
    args = parser.parse_args(argv)

    if args.match is not None:
        fixtures = [f for f in MD2_FIXTURES if f[0] == args.match]
        if not fixtures:
            LOG.error("no MD2 fixture with match_n=%s", args.match)
            return 2
    else:
        fixtures = MD2_FIXTURES

    bulk_process(fixtures, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
