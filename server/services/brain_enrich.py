"""BRAIN ENRICH — gap-driven external knowledge acquisition.

The autopilot (``brain_autopilot.py``) consolidates what the vault ALREADY knows.
This module goes outward: it takes the vault's real knowledge gaps (referenced-
but-missing concepts, low-confidence notes) and fetches genuine factual data for
them from external open sources, writing GROUNDED, CITED notes.

Integrity rules:
  * Only ACTUAL gaps are enriched (referenced-but-missing titles / low-confidence
    notes / explicit queries) — this fills holes, it doesn't dump a corpus.
  * Stored text is a BOUNDED factual summary + a source URL + attribution
    (snippet-scale, like a search result), never a wholesale copy of the source.
  * Every enriched note carries ``frontmatter.source`` + ``frontmatter.url`` +
    ``frontmatter.fetched_ts`` so provenance is explicit and auditable.
  * Network is optional: no egress / no result → honest empty, never raises.
  * stdlib only (urllib) — no new dependency.

Source: the Wikipedia REST summary API (open content, CC-BY-SA) — returns a short
description + a bounded extract + the canonical page URL. Disambiguation / missing
pages are skipped, so we only write notes backed by a real resolved page.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request

try:
    from . import brain_health as bh
except Exception:  # noqa: BLE001
    bh = None  # type: ignore
try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore

SUMMARY_API = "https://en.wikipedia.org/api/rest_v1/page/summary/"
USER_AGENT = "APEX-SecondBrain/1.0 (knowledge-gap enrichment; contact: ops@apex.local)"
EXTRACT_CAP = 600           # max chars of factual summary stored (snippet-scale)
HTTP_TIMEOUT = 6.0          # seconds per fetch
# terms that are code/structural noise, not real-world concepts worth scraping
_STOPish = {
    "async", "await", "return", "const", "let", "function", "export", "import",
    "router", "router", "props", "params", "true", "false", "none", "null",
    "self", "class", "def", "from", "this", "value", "title", "body", "data",
    "type", "name", "list", "dict", "str", "int", "the", "and", "for", "with",
}


def network_ok() -> bool:
    """Cheap reachability probe so the UI can show an honest 'offline' state."""
    try:
        req = urllib.request.Request(SUMMARY_API + "Earth", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def _is_concept_like(term: str) -> bool:
    t = (term or "").strip().lower()
    if len(t) < 4 or t in _STOPish:
        return False
    # words only (allow spaces / hyphens); reject code-ish tokens with ::, /, ., _
    return bool(re.fullmatch(r"[a-z][a-z \-]+[a-z]", t))


def _fetch_summary(term: str) -> dict | None:
    """Fetch a real, bounded factual summary for ``term``. None if unresolved."""
    try:
        url = SUMMARY_API + urllib.parse.quote(term.strip().replace(" ", "_"))
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
            if r.status != 200:
                return None
            payload = json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("type") == "disambiguation":
        return None
    extract = (payload.get("extract") or "").strip()
    if not extract:
        return None
    page_url = (
        (payload.get("content_urls", {}) or {}).get("desktop", {}).get("page")
        or payload.get("uri") or ""
    )
    return {
        "title": payload.get("title") or term,
        "description": (payload.get("description") or "").strip(),
        "extract": extract[:EXTRACT_CAP] + ("…" if len(extract) > EXTRACT_CAP else ""),
        "url": page_url,
    }


def _gap_terms(limit: int) -> list[str]:
    """Real gap terms to enrich: missing-titles + low-confidence note titles."""
    if bh is None:
        return []
    terms: list[str] = []
    try:
        h = bh.health()
        for g in h.get("gaps", []):
            t = g.get("missing_title") or ""
            if _is_concept_like(t):
                terms.append(t)
        for lc in h.get("low_confidence", []):
            t = lc.get("title") or ""
            if _is_concept_like(t):
                terms.append(t)
    except Exception:  # noqa: BLE001
        return []
    # de-dupe preserving order
    seen, out = set(), []
    for t in terms:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out[: max(1, int(limit))]


def _write_enriched(item: dict, *, referrers: list[str] | None = None) -> bool:
    if sb is None or not item:
        return False
    cite = ""
    if referrers:
        cite = " Referenced by " + " ".join(f"[[{r}]]" for r in referrers[:6])
    body = (
        f"{item['description']}\n\n{item['extract']}\n\n"
        f"Source: {item['url']}{cite}"
    ).strip()
    fm = {
        "source": "wikipedia",
        "url": item["url"],
        "fetched_ts": int(time.time() * 1000),
        "enriched": True,
    }
    try:
        return bool(sb.upsert_note("concept", item["title"], body, fm, 0.7))
    except Exception:  # noqa: BLE001
        return False


def enrich(terms: list[str] | None = None, *, limit: int = 20) -> dict:
    """Fetch external knowledge for real gaps (or explicit ``terms``) and write
    grounded, cited notes. Returns ``{requested, fetched, written, offline,
    items:[{title,url,description}]}``."""
    out = {"requested": 0, "fetched": 0, "written": 0, "offline": False, "items": []}
    if sb is None:
        return out
    if not network_ok():
        out["offline"] = True
        return out

    # map a missing title -> who referenced it, for back-citation
    referrers: dict[str, list[str]] = {}
    if terms is None:
        try:
            for g in (bh.health().get("gaps", []) if bh else []):
                mt = (g.get("missing_title") or "").lower()
                if mt:
                    referrers[mt] = g.get("linked_from", [])
        except Exception:  # noqa: BLE001
            referrers = {}
        terms = _gap_terms(limit)
    else:
        terms = [t for t in terms if _is_concept_like(t)][: max(1, int(limit))]

    out["requested"] = len(terms)
    for t in terms:
        item = _fetch_summary(t)
        if not item:
            continue
        out["fetched"] += 1
        if _write_enriched(item, referrers=referrers.get(t.lower())):
            out["written"] += 1
            out["items"].append({"title": item["title"], "url": item["url"],
                                 "description": item["description"]})
        time.sleep(0.15)  # be polite to the source
    return out
