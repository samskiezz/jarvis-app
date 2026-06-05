"""BRAIN SOURCES — multi-source open-data connector registry.

A Palantir-style ingestion layer isn't 10,000 scrapers; it's a small set of
RELIABLE, GOVERNED connectors behind one interface, so any number of feeds plug
in without rewrites. This module is that interface.

Each connector is an adapter ``fetch(term) -> Item | None`` where ``Item`` is a
normalised, bounded, CITED record::

    {title, description, extract, url, source, license, kind}

Design:
  * stdlib only (urllib) — no key, no dependency.
  * every adapter is defensive: timeout + try/except → None, never raises.
  * bounded extracts (snippet-scale) + canonical URL + license = legitimate,
    auditable provenance, not wholesale copies.
  * data-driven roster: add a source by appending one ``Source`` entry.

All 9 connectors below were probed live and return real data from this env.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

UA = {"User-Agent": "APEX-SecondBrain/1.0 (knowledge-gap enrichment; ops@apex.local)"}
TIMEOUT = 6.0
EXTRACT_CAP = 600


# ---------------------------------------------------------------- http helpers
def _get(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                return None
            return r.read()
    except Exception:  # noqa: BLE001
        return None


def _json(url: str):
    raw = _get(url)
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8", errors="ignore"))
    except Exception:  # noqa: BLE001
        return None


def _q(term: str) -> str:
    return urllib.parse.quote(term.strip())


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").strip()


def _cap(s: str) -> str:
    s = (s or "").strip()
    return s[:EXTRACT_CAP] + ("…" if len(s) > EXTRACT_CAP else "")


def _item(title, description, extract, url, source, license, kind) -> dict | None:
    extract = _cap(extract)
    if not title or not extract:
        return None
    return {"title": str(title).strip(), "description": (description or "").strip(),
            "extract": extract, "url": url or "", "source": source,
            "license": license, "kind": kind}


# ---------------------------------------------------------------- adapters
def fetch_wikipedia(term: str) -> dict | None:
    d = _json("https://en.wikipedia.org/api/rest_v1/page/summary/" + _q(term.replace(" ", "_")))
    if not isinstance(d, dict) or d.get("type") == "disambiguation":
        return None
    url = (d.get("content_urls", {}) or {}).get("desktop", {}).get("page") or d.get("uri", "")
    return _item(d.get("title"), d.get("description"), d.get("extract"), url,
                 "wikipedia", "CC-BY-SA", "encyclopedia")


def fetch_wikidata(term: str) -> dict | None:
    d = _json("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json"
              f"&language=en&limit=1&search={_q(term)}")
    hits = (d or {}).get("search") or []
    if not hits:
        return None
    h = hits[0]
    qid = h.get("id", "")
    return _item(h.get("label"), h.get("description"), h.get("description"),
                 h.get("concepturi") or f"https://www.wikidata.org/wiki/{qid}",
                 "wikidata", "CC0", "knowledge-base")


def fetch_dbpedia(term: str) -> dict | None:
    d = _json(f"https://lookup.dbpedia.org/api/search?query={_q(term)}&maxResults=1&format=json")
    docs = (d or {}).get("docs") or []
    if not docs:
        return None
    doc = docs[0]
    def first(k):
        v = doc.get(k)
        return v[0] if isinstance(v, list) and v else (v or "")
    return _item(_strip_html(first("label")), "", _strip_html(first("comment")),
                 first("resource"), "dbpedia", "CC-BY-SA", "knowledge-base")


def fetch_dictionary(term: str) -> dict | None:
    d = _json("https://api.dictionaryapi.dev/api/v2/entries/en/" + _q(term))
    if not isinstance(d, list) or not d:
        return None
    e = d[0]
    defs = []
    for m in e.get("meanings", [])[:2]:
        pos = m.get("partOfSpeech", "")
        for df in m.get("definitions", [])[:1]:
            if df.get("definition"):
                defs.append(f"({pos}) {df['definition']}")
    if not defs:
        return None
    return _item(e.get("word", term).title(), "Dictionary definition", " ".join(defs),
                 f"https://en.wiktionary.org/wiki/{_q(term)}", "dictionaryapi", "CC-BY-SA", "lexical")


def fetch_restcountries(term: str) -> dict | None:
    d = _json(f"https://restcountries.com/v3.1/name/{_q(term)}"
              "?fields=name,region,subregion,capital,population,languages")
    if not isinstance(d, list) or not d:
        return None
    c = d[0]
    name = (c.get("name", {}) or {}).get("common", term)
    cap = ", ".join(c.get("capital", []) or [])
    langs = ", ".join((c.get("languages", {}) or {}).values())
    ex = (f"{name} is a country in {c.get('subregion') or c.get('region','')}. "
          f"Capital: {cap or 'n/a'}. Population: {c.get('population','n/a'):,}. "
          f"Languages: {langs or 'n/a'}.")
    return _item(name, "Country", ex, f"https://en.wikipedia.org/wiki/{_q(name)}",
                 "restcountries", "MPL-2.0 data", "geographic")


def fetch_openlibrary(term: str) -> dict | None:
    d = _json(f"https://openlibrary.org/search.json?q={_q(term)}&limit=1"
              "&fields=title,author_name,first_publish_year,key,subject")
    docs = (d or {}).get("docs") or []
    if not docs:
        return None
    b = docs[0]
    authors = ", ".join(b.get("author_name", []) or [])
    ex = (f"\"{b.get('title')}\"" + (f" by {authors}" if authors else "")
          + (f" ({b.get('first_publish_year')})" if b.get("first_publish_year") else "")
          + ". A work catalogued in the Open Library bibliographic dataset.")
    return _item(b.get("title", term), "Book / work", ex,
                 "https://openlibrary.org" + (b.get("key", "") or ""),
                 "openlibrary", "CC0 metadata", "bibliographic")


def fetch_arxiv(term: str) -> dict | None:
    raw = _get(f"http://export.arxiv.org/api/query?search_query=all:{_q(term)}&max_results=1")
    if not raw:
        return None
    xml = raw.decode("utf-8", errors="ignore")
    entry = re.search(r"<entry>(.*?)</entry>", xml, re.S)
    if not entry:
        return None
    blk = entry.group(1)
    def tag(t):
        m = re.search(rf"<{t}>(.*?)</{t}>", blk, re.S)
        return _strip_html(m.group(1)).replace("\n", " ").strip() if m else ""
    title, summary, link = tag("title"), tag("summary"), tag("id")
    if not title:
        return None
    return _item(title, "Research paper (arXiv)", summary or title, link,
                 "arxiv", "arXiv non-exclusive", "research")


def fetch_pubmed(term: str) -> dict | None:
    d = _json("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
              f"?db=pubmed&retmode=json&retmax=1&term={_q(term)}")
    ids = (((d or {}).get("esearchresult") or {}).get("idlist")) or []
    if not ids:
        return None
    pid = ids[0]
    s = _json("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
              f"?db=pubmed&retmode=json&id={pid}")
    rec = (((s or {}).get("result") or {}).get(pid)) or {}
    title = rec.get("title")
    if not title:
        return None
    src = rec.get("fulljournalname") or rec.get("source") or ""
    ex = f"{_strip_html(title)} — biomedical literature record ({src}, {rec.get('pubdate','')})."
    return _item(_strip_html(title), "Biomedical citation (PubMed)", ex,
                 f"https://pubmed.ncbi.nlm.nih.gov/{pid}/", "pubmed", "NLM public", "biomedical")


def fetch_worldbank(term: str) -> dict | None:
    d = _json(f"https://api.worldbank.org/v2/country/{_q(term)}?format=json")
    if not isinstance(d, list) or len(d) < 2 or not d[1]:
        return None
    c = d[0] if isinstance(d[0], dict) and d[0].get("name") else d[1][0]
    name = c.get("name", term)
    ex = (f"{name} — region: {(c.get('region') or {}).get('value','n/a')}; "
          f"income level: {(c.get('incomeLevel') or {}).get('value','n/a')}; "
          f"capital: {c.get('capitalCity','n/a')}. World Bank country dataset.")
    return _item(name, "Country (World Bank)", ex,
                 f"https://data.worldbank.org/country/{c.get('id','')}",
                 "worldbank", "CC-BY-4.0", "economic")


# ---------------------------------------------------------------- registry
@dataclass(frozen=True)
class Source:
    name: str
    fetch: Callable[[str], dict | None]
    kind: str
    license: str
    homepage: str
    priority: int  # lower = tried first / preferred as primary


SOURCES: list[Source] = [
    Source("wikipedia",     fetch_wikipedia,     "encyclopedia",   "CC-BY-SA",         "https://en.wikipedia.org",        10),
    Source("dbpedia",       fetch_dbpedia,       "knowledge-base", "CC-BY-SA",         "https://www.dbpedia.org",         20),
    Source("wikidata",      fetch_wikidata,      "knowledge-base", "CC0",              "https://www.wikidata.org",        30),
    Source("dictionaryapi", fetch_dictionary,    "lexical",        "CC-BY-SA",         "https://dictionaryapi.dev",       40),
    Source("restcountries", fetch_restcountries, "geographic",     "MPL-2.0 data",     "https://restcountries.com",       50),
    Source("worldbank",     fetch_worldbank,     "economic",       "CC-BY-4.0",        "https://data.worldbank.org",      55),
    Source("openlibrary",   fetch_openlibrary,   "bibliographic",  "CC0 metadata",     "https://openlibrary.org",         60),
    Source("arxiv",         fetch_arxiv,         "research",       "arXiv",            "https://arxiv.org",               70),
    Source("pubmed",        fetch_pubmed,        "biomedical",     "NLM public",       "https://pubmed.ncbi.nlm.nih.gov", 80),
]

_BY_PRIORITY = sorted(SOURCES, key=lambda s: s.priority)


def catalog() -> list[dict]:
    """Registered connectors (for UI / governance)."""
    return [{"name": s.name, "kind": s.kind, "license": s.license,
             "homepage": s.homepage, "priority": s.priority} for s in _BY_PRIORITY]


def probe(names: list[str] | None = None) -> dict:
    """Live reachability per source using a cheap real query."""
    out = {}
    for s in _BY_PRIORITY:
        if names and s.name not in names:
            continue
        try:
            out[s.name] = s.fetch("ontology") is not None or s.fetch("Australia") is not None
        except Exception:  # noqa: BLE001
            out[s.name] = False
    return out


def fetch_all(term: str, only: list[str] | None = None) -> list[dict]:
    """Every source that resolves ``term``, in priority order (corroboration)."""
    items = []
    for s in _BY_PRIORITY:
        if only and s.name not in only:
            continue
        try:
            it = s.fetch(term)
        except Exception:  # noqa: BLE001
            it = None
        if it:
            items.append(it)
    return items


# kinds that may DEFINE a concept note's identity (title/extract); others only corroborate
_AUTHORITATIVE = {"encyclopedia", "knowledge-base", "lexical", "geographic", "economic"}


def fetch_best(term: str, only: list[str] | None = None) -> tuple[dict | None, list[dict]]:
    """Choose the primary record (authoritative concept source, highest priority)
    so the note's identity is the concept itself — research/bibliographic feeds
    corroborate but never hijack the title. Returns (primary, all_hits)."""
    hits = fetch_all(term, only=only)  # already in priority order
    if not hits:
        return None, []
    authoritative = [h for h in hits if h["kind"] in _AUTHORITATIVE]
    primary = authoritative[0] if authoritative else hits[0]
    return primary, hits
