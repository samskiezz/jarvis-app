"""WORLD DOCUMENTS — baseline document ingestion for the catalogued reference URLs.

Most of the 92k catalogued endpoints are AUTHORITATIVE REFERENCE DOCUMENTS
(standards, API docs, schemas: w3.org, json-schema.org, CKAN/Socrata docs, ISO,
CloudEvents). Those are not live data feeds — they are the BASELINE KNOWLEDGE the
platform should read once, extract, store as Document objects, and index for
search/RAG. The live data APIs then keep the operational layer current.

This pipeline: fetch (rate-limited, cached) -> extract title+text (stdlib HTML
parser) -> store as a governed Document (second_brain note, which auto-indexes for
semantic search + mirrors to the ontology graph + Postgres) -> audit + lineage.

stdlib only, never raises.
"""

from __future__ import annotations

import hashlib
import sqlite3
import urllib.parse
from html.parser import HTMLParser

from . import net_ratelimit as nr

try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "brain.db")

# hosts whose full text is paywalled/closed — index only metadata, don't store body
RESTRICTED_HOSTS = {"www.iso.org", "iso.org"}
MAX_TEXT = 8000  # bounded excerpt stored per document (reference snippet scale)


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self._in_title = False
        self._skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self._skip += 1
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self._skip:
            self._skip -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._skip:
            return
        t = data.strip()
        if not t:
            return
        if self._in_title and not self.title:
            self.title = t[:200]
        else:
            self.parts.append(t)


def extract_text(html: str) -> tuple[str, str]:
    """(title, cleaned_text) from an HTML document."""
    p = _TextExtractor()
    try:
        p.feed(html or "")
    except Exception:  # noqa: BLE001
        pass
    text = " ".join(p.parts)
    text = " ".join(text.split())  # collapse whitespace
    return p.title, text


def _host(u: str) -> str:
    try:
        return urllib.parse.urlparse(u or "").netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def ingest_url(url: str, *, subject_id: str = "", source_name: str = "") -> dict:
    """Fetch a reference URL, extract text, store as a governed, searchable Document."""
    host = _host(url)
    resp = nr.polite_get(url, ttl=86400.0)  # cache docs for a day
    if not resp["ok"] or not resp["body"]:
        return {"ok": False, "url": url, "error": resp.get("error") or "no body"}
    title, text = extract_text(resp["body"])
    title = title or url.rsplit("/", 1)[-1] or host
    restricted = host in RESTRICTED_HOSTS
    excerpt = "" if restricted else text[:MAX_TEXT]
    note = None
    if sb is not None:
        body = (f"{excerpt}\n\nReference document. Source: {url}"
                + (f" Subject [[{subject_id}]]" if subject_id else "")).strip()
        fm = {"doc": True, "source": source_name or host, "url": url,
              "subject_id": subject_id, "extracted_chars": len(text),
              "licence_restricted": restricted}
        try:
            note = sb.upsert_note("document", title, body, fm, 0.6)
        except Exception:  # noqa: BLE001
            note = None
    if jos is not None:
        jos.audit("document.ingest", actor="world-documents", target=url,
                  meta={"title": title[:80], "chars": len(text), "restricted": restricted})
    return {"ok": bool(note), "url": url, "title": title, "host": host,
            "chars": len(text), "stored": bool(note), "restricted": restricted,
            "raw_hash": hashlib.sha256((resp["body"] or "").encode()).hexdigest()[:16]}


def _candidate_urls(limit: int, host_filter: str | None) -> list[tuple[str, str, str]]:
    """(url, subject_id, source_name) distinct doc URLs from the catalogue."""
    try:
        c = sqlite3.connect(_db_path()); c.row_factory = sqlite3.Row
        try:
            if host_filter:
                rows = c.execute(
                    "SELECT DISTINCT official_url, subject_id, source_name FROM world_endpoint "
                    "WHERE official_url LIKE ? LIMIT ?", (f"%{host_filter}%", limit)).fetchall()
            else:
                rows = c.execute(
                    "SELECT DISTINCT official_url, subject_id, source_name FROM world_endpoint "
                    "LIMIT ?", (limit * 4,)).fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []
    seen, out = set(), []
    for r in rows:
        u = r["official_url"]
        if u and u.startswith("http") and u not in seen:
            seen.add(u)
            out.append((u, r["subject_id"], r["source_name"]))
        if len(out) >= limit:
            break
    return out


def ingest_batch(limit: int = 20, *, host: str | None = None) -> dict:
    """Ingest a batch of reference documents from the catalogue into the baseline."""
    cands = _candidate_urls(limit, host)
    ingested, failed, samples = 0, 0, []
    for url, sid, src in cands:
        r = ingest_url(url, subject_id=sid, source_name=src)
        if r.get("stored"):
            ingested += 1
            if len(samples) < 8:
                samples.append({"title": r["title"][:70], "host": r["host"], "chars": r["chars"]})
        else:
            failed += 1
    return {"requested": len(cands), "ingested": ingested, "failed": failed, "samples": samples}
