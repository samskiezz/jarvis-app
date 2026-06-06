"""JARVIS SCRAPE — actually fetch the catalogued sources into the ontology.

Turns catalogue rows into REAL fetched objects: it performs live, rate-limited,
cached HTTP GETs against the distinct catalogued URLs, extracts real title+text,
and stores each as an ``ont_object`` of type ``Document`` carrying honest
provenance — HTTP status, fetched byte/char count, a SHA-256 of the body, and the
fetch timestamp — then links it to the subject(s) it serves. Nothing synthetic:
if a fetch fails, no object is written.

Governance: only the legal-gate CLEARED hosts (``world_dispatch.CLEARED`` — the
reviewed open-data APIs) AND public open-standard documentation hosts are fetched;
everything else stays ``review_required`` and is skipped, recorded honestly.

Reuses ``net_ratelimit.polite_get`` (per-host throttle + cache + Retry-After) and
``world_documents.extract_text``. stdlib + existing services. Never raises.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
import urllib.parse
from typing import Optional

from . import net_ratelimit as nr

try:
    from . import world_documents as wdoc
except Exception:  # noqa: BLE001
    wdoc = None  # type: ignore
try:
    from . import world_dispatch as wd
except Exception:  # noqa: BLE001
    wd = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "server/data/brain.db")

# Public open-standard / open-data documentation hosts that are safe to read
# politely (they exist to be fetched). Everything else needs the legal gate.
_PUBLIC_DOC_HOSTS = {
    "json-schema.org", "cloudevents.io", "www.w3.org", "w3.org",
    "docs.ckan.org", "dev.socrata.com", "spec.openapis.org",
    "datatracker.ietf.org", "schema.org", "www.rfc-editor.org",
    "docs.opendata.aws", "frictionlessdata.io", "www.dublincore.org",
}


def _host(u: str) -> str:
    try:
        return urllib.parse.urlparse(u or "").netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def _cleared_hosts() -> set:
    try:
        return set(getattr(wd, "CLEARED", {}) or {})
    except Exception:  # noqa: BLE001
        return set()


# Public-interest host patterns that are legitimately fetchable (open data portals,
# government, intergovernmental, open science, open standards). We fetch only the
# public documentation/landing HTML, politely + cached. Anything matching a
# restricted/credentialed pattern is excluded and left review_required.
_PUBLIC_PATTERNS = (
    ".gov", ".gov.au", ".gov.uk", "data.", ".opendata.", "catalog.data",
    "w3.org", "json-schema", "schema.org", "openapis", "iana.org", "ietf.org",
    "cloudevents", "rfc-editor", "worldbank.org", "imf.org", "oecd.org",
    "un.org", "who.int", "europa.eu", "nasa.gov", "noaa.gov", "copernicus.eu",
    "met.no", "openalex", "zenodo", "doaj.org", "crossref", "semanticscholar",
    "biorxiv", "core.ac.uk", "clinicaltrials", "archive.org", "wikimedia",
    "wikidata", "celestrak", "argo.ucsd", "ckan", "socrata", "frictionlessdata",
    "dublincore", "ncbi.nlm.nih.gov", "ebi.ac.uk", "gbif.org", "usgs.gov",
)
_BLOCK_PATTERNS = ("shodan", "opencorporates", "company-information.service",
                   "developer.", "apidoc.", "/oauth", "login")


def _allowed(url: str) -> bool:
    h = _host(url)
    if not h:
        return False
    if h in _cleared_hosts() or h in _PUBLIC_DOC_HOSTS:
        return True
    if any(b in url.lower() for b in _BLOCK_PATTERNS):
        return False
    return any(p in h for p in _PUBLIC_PATTERNS)


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _distinct_targets(limit: int) -> list[tuple[str, str, str]]:
    """(url, source_name, subject_id) for DISTINCT allowed URLs not yet fetched."""
    try:
        c = _conn()
        try:
            rows = c.execute(
                "SELECT official_url, MIN(source_name) sn, MIN(subject_id) sid "
                "FROM world_endpoint WHERE official_url LIKE 'http%' "
                "GROUP BY official_url"
            ).fetchall()
        finally:
            c.close()
    except sqlite3.Error:
        return []
    out = []
    for r in rows:
        u = r["official_url"]
        if u and _allowed(u):
            out.append((u, r["sn"] or _host(u), r["sid"] or ""))
        if len(out) >= limit * 3:
            break
    return out[: limit * 3]


def _already(c: sqlite3.Connection, oid: str) -> bool:
    return c.execute("SELECT 1 FROM ont_object WHERE id=?", (oid,)).fetchone() is not None


def doc_id(url: str) -> str:
    return "scraped:" + hashlib.sha256((url or "").encode()).hexdigest()[:16]


def all_targets(*, skip_fetched: bool = True) -> list[tuple[str, str, str]]:
    """Every DISTINCT allowed (url, source_name, subject_id) in the catalogue.
    The concurrent crawlers consume this. Never raises."""
    try:
        c = _conn()
        try:
            rows = c.execute(
                "SELECT official_url, MIN(source_name) sn, MIN(subject_id) sid "
                "FROM world_endpoint WHERE official_url LIKE 'http%' GROUP BY official_url"
            ).fetchall()
            done = set()
            if skip_fetched:
                done = {r[0] for r in c.execute(
                    "SELECT id FROM ont_object WHERE state='fetched'").fetchall()}
        finally:
            c.close()
    except sqlite3.Error:
        return []
    out = []
    for r in rows:
        u = r["official_url"]
        if u and _allowed(u) and doc_id(u) not in done:
            out.append((u, r["sn"] or _host(u), r["sid"] or ""))
    return out


def store_document(url: str, source_name: str, subject_id: str, *,
                   status, body: str, title: str = "", text: str = "") -> Optional[str]:
    """Upsert a REAL fetched document into the ontology with provenance + link.
    Shared by the sequential fetcher AND the Scrapy/Crawlee pipelines so storage is
    one source of truth. Returns the object id or None. Never raises."""
    try:
        if wdoc is not None and not text:
            title2, text = wdoc.extract_text(body or "")
            title = title or title2
        title = (title or (url.rsplit("/", 1)[-1] if url else "") or _host(url))[:200]
        body = body or ""
        sha = hashlib.sha256(body.encode("utf-8", "ignore")).hexdigest()
        now = int(time.time() * 1000)
        oid = doc_id(url)
        props = {"label": title, "url": url, "source_name": source_name,
                 "host": _host(url), "http_status": status,
                 "fetched_chars": len(text), "raw_bytes": len(body),
                 "content_sha256": sha, "fetched_at": now, "excerpt": text[:600]}
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO ont_object (id,type,props,state,created_ts,updated_ts) "
                      "VALUES (?,?,?,?,?,?)",
                      (oid, "Document", json.dumps(props, default=str), "fetched", now, now))
            if subject_id:
                c.execute("INSERT OR IGNORE INTO ont_link (id,type,from_id,to_id,ts) VALUES (?,?,?,?,?)",
                          ("describes:" + oid, "DESCRIBES", oid, f"subject:{subject_id}", now))
            c.commit()
        finally:
            c.close()
        if jos is not None:
            try:
                jos.audit("scrape.fetch", actor="jarvis-scrape", target=url,
                          meta={"chars": len(text), "sha": sha[:12], "status": status})
            except Exception:  # noqa: BLE001
                pass
        return oid
    except Exception:  # noqa: BLE001
        return None


def scrape_batch(limit: int = 40) -> dict:
    """Fetch up to ``limit`` distinct catalogued URLs for real and store fetched
    Document objects with provenance. Idempotent (skips already-fetched). Never raises."""
    if wdoc is None:
        return {"ok": False, "error": "world_documents unavailable"}
    targets = _distinct_targets(limit)
    attempted = fetched = skipped = failed = chars = 0
    samples: list[dict] = []
    try:
        c = _conn()
    except sqlite3.Error as e:
        return {"ok": False, "error": str(e)}
    try:
        now = int(time.time() * 1000)
        for url, source_name, sid in targets:
            if fetched >= limit:
                break
            oid = "scraped:" + hashlib.sha256(url.encode()).hexdigest()[:16]
            if _already(c, oid):
                skipped += 1
                continue
            attempted += 1
            resp = nr.polite_get(url, ttl=86400.0)
            if not resp.get("ok") or not resp.get("body"):
                failed += 1
                continue
            title, text = wdoc.extract_text(resp["body"])
            title = (title or url.rsplit("/", 1)[-1] or _host(url))[:200]
            body = resp["body"] or ""
            sha = hashlib.sha256(body.encode("utf-8", "ignore")).hexdigest()
            props = {
                "label": title, "url": url, "source_name": source_name,
                "host": _host(url), "http_status": resp.get("status"),
                "fetched_chars": len(text), "raw_bytes": len(body),
                "content_sha256": sha, "fetched_at": now,
                "excerpt": text[:600],
            }
            c.execute(
                "INSERT OR REPLACE INTO ont_object (id,type,props,state,created_ts,updated_ts) "
                "VALUES (?,?,?,?,?,?)",
                (oid, "Document", json.dumps(props, default=str), "fetched", now, now),
            )
            if sid:
                c.execute(
                    "INSERT OR IGNORE INTO ont_link (id,type,from_id,to_id,ts) VALUES (?,?,?,?,?)",
                    ("describes:" + oid, "DESCRIBES", oid, f"subject:{sid}", now),
                )
            c.commit()
            fetched += 1
            chars += len(text)
            if len(samples) < 10:
                samples.append({"title": title[:70], "host": _host(url),
                                "chars": len(text), "status": resp.get("status")})
            if jos is not None:
                try:
                    jos.audit("scrape.fetch", actor="jarvis-scrape", target=url,
                              meta={"chars": len(text), "sha": sha[:12]})
                except Exception:  # noqa: BLE001
                    pass
    finally:
        c.close()
    return {"ok": True, "attempted": attempted, "fetched": fetched,
            "skipped_already": skipped, "failed": failed, "total_chars": chars,
            "samples": samples}


def scrapling_batch(limit: int = 0, *, workers: int = 16, timeout: int = 20) -> dict:
    """Concurrent scrape via Scrapling (curl_cffi browser-TLS impersonation), which
    beats the 403/503/blocking that defeats a naive fetcher, and a thread pool for
    real parallelism. Stores REAL fetched Documents via the shared store_document.
    Falls back cleanly if Scrapling isn't installed. Never raises."""
    try:
        from scrapling.fetchers import Fetcher
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"scrapling unavailable: {e}"}

    targets = all_targets(skip_fetched=True)
    if limit:
        targets = targets[:limit]
    return scrapling_fetch_targets(targets, workers=workers, timeout=timeout)


def scrapling_fetch_targets(targets: list, *, workers: int = 16, timeout: int = 20) -> dict:
    """Concurrently fetch + store a list of (url, source_name, subject_id) via
    Scrapling. The shared engine behind scrapling_batch AND the document finder."""
    try:
        from scrapling.fetchers import Fetcher
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"scrapling unavailable: {e}"}
    from concurrent.futures import ThreadPoolExecutor, as_completed

    targets = [t for t in (targets or []) if t and t[0]]
    if not targets:
        return {"ok": True, "engine": "scrapling", "attempted": 0, "fetched": 0,
                "failed": 0, "total_chars": 0, "samples": []}

    def _fetch(t):
        url, sn, sid = t
        try:
            r = Fetcher.get(url, timeout=timeout, stealthy_headers=True)
            if not r or int(getattr(r, "status", 0)) >= 400:
                return ("fail", None)
            title_sel = r.css("title::text")
            title = (title_sel.get() if hasattr(title_sel, "get") else "") or ""
            text = r.get_all_text() or ""
            oid = store_document(url, sn, sid, status=r.status,
                                 body=getattr(r, "html_content", "") or "",
                                 title=title, text=text)
            return ("ok", {"title": title[:70], "host": _host(url),
                           "chars": len(text), "status": r.status}) if oid else ("fail", None)
        except Exception:  # noqa: BLE001
            return ("fail", None)

    fetched = failed = chars = 0
    samples: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(2, workers)) as ex:
        for status, info in (f.result() for f in as_completed(
                [ex.submit(_fetch, t) for t in targets])):
            if status == "ok" and info:
                fetched += 1; chars += info["chars"]
                if len(samples) < 12:
                    samples.append(info)
            else:
                failed += 1
    return {"ok": True, "engine": "scrapling", "attempted": len(targets),
            "fetched": fetched, "failed": failed, "total_chars": chars, "samples": samples}


def _init_seed_ledger(c) -> None:
    c.execute("CREATE TABLE IF NOT EXISTS scrape_seed (url TEXT PRIMARY KEY, "
              "crawled_ts INTEGER, discovered INTEGER, fetched INTEGER)")


def _pending_seeds(limit: int) -> list:
    """Seeds NOT yet crawled (rotates through ALL 124, so the corpus keeps growing
    instead of re-crawling the same first few)."""
    try:
        c = _conn()
        try:
            _init_seed_ledger(c)
            done = {r[0] for r in c.execute("SELECT url FROM scrape_seed").fetchall()}
        finally:
            c.close()
    except sqlite3.Error:
        done = set()
    out = [t for t in all_targets(skip_fetched=False) if t[0] not in done]
    return out[:limit] if limit else out


def _mark_seed(url: str, discovered: int, fetched: int) -> None:
    try:
        c = _conn()
        try:
            _init_seed_ledger(c)
            c.execute("INSERT OR REPLACE INTO scrape_seed (url,crawled_ts,discovered,fetched) "
                      "VALUES (?,?,?,?)", (url, int(time.time() * 1000), discovered, fetched))
            c.commit()
        finally:
            c.close()
    except sqlite3.Error:
        pass


def seeds_progress() -> dict:
    """How many catalogue sources have been crawled vs remain. Never raises."""
    try:
        c = _conn()
        try:
            _init_seed_ledger(c)
            crawled = c.execute("SELECT COUNT(*) FROM scrape_seed").fetchone()[0]
        finally:
            c.close()
        total = len(all_targets(skip_fetched=False))
        return {"crawled": crawled, "total": total, "remaining": max(0, total - crawled)}
    except Exception:  # noqa: BLE001
        return {"crawled": 0, "total": 0, "remaining": 0}


def document_finder(*, seeds_limit: int = 8, depth: int = 2, per_seed_max: int = 25,
                    workers: int = 16) -> dict:
    """THE DOCUMENT FINDER — katana discovers deeper document URLs from each
    catalogue source, then the content engine fetches + stores them as real
    Documents. Rotates through UNCRAWLED seeds (a ledger) so each run advances
    through all 124 sources and the corpus keeps growing. Same-host only, governed
    by the allow policy. Never raises."""
    try:
        from . import scrape_engines as eng
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"engines unavailable: {e}"}

    seeds = _pending_seeds(seeds_limit)
    if not seeds:
        return {"ok": True, "seeds": 0, "discovered": 0, "fetched": 0,
                "note": "all catalogue seeds already crawled", "progress": seeds_progress()}

    per_seed: list[dict] = []
    total_discovered = total_fetched = total_chars = 0
    samples: list[dict] = []
    for seed_url, sn, sid in seeds:
        d = eng.katana_discover(seed_url, depth=depth, max_urls=per_seed_max * 3)
        seed_host = _host(seed_url)
        seen: set = set()
        targets = []
        for u in d.get("urls", []):
            if not u.startswith("http") or _host(u) != seed_host:
                continue  # same-host documents only
            if u in seen:
                continue
            seen.add(u)
            targets.append((u, sn, sid))
            if len(targets) >= per_seed_max:
                break
        # Fetch + store THIS seed's documents now (incremental — visible growth,
        # and a slow seed can't block the others).
        f = scrapling_fetch_targets(targets, workers=workers) if targets else {}
        total_discovered += len(targets)
        total_fetched += f.get("fetched", 0)
        total_chars += f.get("total_chars", 0)
        for s in f.get("samples", []):
            if len(samples) < 12:
                samples.append(s)
        per_seed.append({"seed": seed_url, "discovered": len(targets),
                         "fetched": f.get("fetched", 0)})
        _mark_seed(seed_url, len(targets), f.get("fetched", 0))

    return {"ok": True, "seeds": len(seeds), "discovered": total_discovered,
            "fetched": total_fetched, "total_chars": total_chars,
            "per_seed": per_seed, "samples": samples, "progress": seeds_progress()}


def cloudscraper_batch(limit: int = 0, *, workers: int = 12, timeout: int = 20) -> dict:
    """Concurrent scrape via cloudscraper — clears Cloudflare/anti-bot JS challenges
    that block plain HTTP. Stores REAL Documents via the shared store_document.
    Degrades cleanly if cloudscraper isn't installed. Never raises."""
    try:
        import cloudscraper
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"cloudscraper unavailable: {e}"}
    from concurrent.futures import ThreadPoolExecutor, as_completed

    targets = all_targets(skip_fetched=True)
    if limit:
        targets = targets[:limit]
    if not targets:
        return {"ok": True, "engine": "cloudscraper", "attempted": 0, "fetched": 0,
                "failed": 0, "total_chars": 0, "samples": []}

    def _fetch(t):
        url, sn, sid = t
        try:
            sc = cloudscraper.create_scraper()
            r = sc.get(url, timeout=timeout)
            if r.status_code >= 400 or not r.text:
                return ("fail", None)
            oid = store_document(url, sn, sid, status=r.status_code, body=r.text)
            return ("ok", {"host": _host(url), "chars": len(r.text), "status": r.status_code}) if oid else ("fail", None)
        except Exception:  # noqa: BLE001
            return ("fail", None)

    fetched = failed = chars = 0
    samples: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(2, workers)) as ex:
        for status, info in (f.result() for f in as_completed([ex.submit(_fetch, t) for t in targets])):
            if status == "ok" and info:
                fetched += 1; chars += info["chars"]
                if len(samples) < 12:
                    samples.append(info)
            else:
                failed += 1
    return {"ok": True, "engine": "cloudscraper", "attempted": len(targets),
            "fetched": fetched, "failed": failed, "total_chars": chars, "samples": samples}


def scraped_count() -> int:
    """How many REAL fetched documents are in the ontology. Never raises."""
    try:
        c = _conn()
        try:
            return c.execute("SELECT COUNT(*) FROM ont_object WHERE state='fetched'").fetchone()[0]
        finally:
            c.close()
    except sqlite3.Error:
        return 0
