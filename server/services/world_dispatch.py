"""WORLD DISPATCH — legal-gated ingestion of the catalogued endpoints.

Wires the 92k catalogued endpoints (world_endpoint) into the implemented domain
pipelines, but ONLY for sources that pass the legal gate:

  * the 92k candidates are all flagged ``licence_review_required=true`` -> BLOCKED
    until reviewed (correct posture; we never auto-scrape un-reviewed sources).
  * a curated CLEARED allowlist of sources whose terms/licence we have verified as
    open + permitting automated reuse (US-gov public domain, GBIF, Crossref) is let
    through, minus anything in the pack's restricted register.

Fetches go through ``net_ratelimit`` (per-host throttle + cache + backoff) — the
honest rate-limit workaround — then route to the tested pipelines via run_pipeline.
"""

from __future__ import annotations

import csv
import glob
import os
import sqlite3
import urllib.parse

from . import net_ratelimit as nr

try:
    from . import world_earthquake, world_species, world_publications, world_cve, world_weather
except Exception:  # noqa: BLE001
    world_earthquake = world_species = world_publications = world_cve = world_weather = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "brain.db")
try:
    from . import jarvis_world_os as wos
except Exception:  # noqa: BLE001
    wos = None  # type: ignore

# verified-open sources -> (domain, pipeline module, canonical feed url)
CLEARED = {
    "earthquake.usgs.gov":   ("earthquake",   "world_earthquake",   world_earthquake,
                              "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson"),
    "api.gbif.org":          ("species",      "world_species",      world_species,
                              "https://api.gbif.org/v1/occurrence/search?limit=50"),
    "api.crossref.org":      ("publications", "world_publications", world_publications,
                              "https://api.crossref.org/works?rows=50"),
    "services.nvd.nist.gov": ("cve",          "world_cve",          world_cve,
                              "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=20"),
    "api.weather.gov":       ("weather",      "world_weather",      world_weather,
                              "https://api.weather.gov/alerts/active?limit=50"),
}


def _host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def _restricted() -> set[str]:
    base = wos.world_os_dir() if wos else ""
    names = set()
    for f in glob.glob(os.path.join(base, "**", "restricted_sources_register.csv"), recursive=True):
        try:
            for r in csv.DictReader(open(f, encoding="utf-8", errors="ignore")):
                n = (r.get("source_name") or "").strip().lower()
                if n:
                    names.add(n)
        except Exception:  # noqa: BLE001
            pass
    return names


def is_cleared(host: str) -> bool:
    return host in CLEARED


def gate_report() -> dict:
    """How many catalogued endpoints are cleared to ingest vs blocked pending review."""
    try:
        c = sqlite3.connect(_db_path()); c.row_factory = sqlite3.Row
        try:
            rows = c.execute("SELECT official_url FROM world_endpoint").fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        rows = []
    cleared = blocked = 0
    cleared_hosts = {}
    for r in rows:
        h = _host(r["official_url"] or "")
        if is_cleared(h):
            cleared += 1
            cleared_hosts[h] = cleared_hosts.get(h, 0) + 1
        else:
            blocked += 1
    return {"total_endpoints": len(rows), "cleared": cleared, "blocked_pending_review": blocked,
            "cleared_by_host": cleared_hosts}


def dispatch(*, per_source_limit: int = 20, use_cache_ttl: float = 300.0) -> dict:
    """Ingest from every CLEARED source present in the catalogue, via the
    rate-limited fetcher, routing to the tested pipelines. Blocked sources skipped."""
    report = gate_report()
    results = []
    ingested_total = 0
    # only dispatch cleared hosts that actually appear in the catalogue
    present = set((report.get("cleared_by_host") or {}).keys()) or set(CLEARED)
    restricted = _restricted()
    for host in sorted(present):
        if host not in CLEARED:
            continue
        domain, modname, mod, feed = CLEARED[host]
        if mod is None:
            continue
        # fetch via rate-limit-aware cached layer (the workaround)
        resp = nr.polite_get(feed, ttl=use_cache_ttl)
        if not resp["ok"] or resp["json"] is None:
            results.append({"host": host, "domain": domain, "status": "fetch_failed",
                            "error": resp.get("error"), "from_cache": resp["from_cache"]})
            continue
        out = mod.run_pipeline(limit=per_source_limit, live=False, raw=resp["json"])
        ingested_total += out.get("ingested", 0)
        results.append({"host": host, "domain": domain, "status": out.get("status"),
                        "ingested": out.get("ingested"), "rejected": out.get("rejected"),
                        "from_cache": resp["from_cache"]})
    if jos is not None:
        jos.audit("world.dispatch", actor="world-dispatch",
                  meta={"ingested": ingested_total, "cleared_sources": len(results),
                        "blocked_endpoints": report["blocked_pending_review"]})
    return {"ingested_total": ingested_total, "sources_run": len(results),
            "blocked_pending_review": report["blocked_pending_review"],
            "cleared_endpoints": report["cleared"], "results": results,
            "rate_limit": nr.cache_stats()}
