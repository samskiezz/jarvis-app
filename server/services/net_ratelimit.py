"""NET RATELIMIT — polite, rate-limit-aware cached HTTP fetcher.

The honest way to "work around" rate limits is to RESPECT them while maximizing
throughput: per-host throttling, response caching (don't refetch within TTL),
exponential backoff that honors ``Retry-After`` on 429/503, and proper UA/identity.
This is not evasion (no IP rotation, no robots bypass) — it's the standard polite
client that keeps you under documented limits and avoids bans.

Per-host minimum intervals encode known source limits (e.g. NVD ~6s without a key,
Crossref polite pool ~1s). Cache is a small SQLite table keyed by URL.

stdlib only (urllib + sqlite3), thread-safe enough for the single-process runtime.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
import urllib.parse
import urllib.request

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "brain.db")

# per-host minimum seconds between requests (documented/polite defaults)
HOST_MIN_INTERVAL = {
    "services.nvd.nist.gov": 6.5,     # NVD: ~5 req/30s without key -> 6s spacing
    "api.crossref.org": 1.0,          # Crossref polite pool
    "en.wikipedia.org": 0.3,
    "www.wikidata.org": 0.3,
    "api.gbif.org": 0.2,
    "earthquake.usgs.gov": 0.5,
    "api.weather.gov": 1.0,
    "_default": 1.0,
}
DEFAULT_UA = "APEX-WorldRuntime/1.0 (+https://apex.local; ops@apex.local)"

_lock = threading.Lock()
_last_call: dict[str, float] = {}


def _host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return "_default"


def _interval(host: str) -> float:
    return HOST_MIN_INTERVAL.get(host, HOST_MIN_INTERVAL["_default"])


# ── cache ────────────────────────────────────────────────────────────────────
def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    return c


def _init() -> None:
    try:
        c = _conn()
        try:
            c.execute("CREATE TABLE IF NOT EXISTS net_cache (url_hash TEXT PRIMARY KEY, url TEXT, "
                      "body TEXT, status INTEGER, fetched_ts REAL)")
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def _cache_get(url: str, ttl: float):
    _init()
    try:
        h = hashlib.sha256(url.encode()).hexdigest()
        c = _conn()
        try:
            row = c.execute("SELECT body, fetched_ts FROM net_cache WHERE url_hash=?", (h,)).fetchone()
        finally:
            c.close()
        if row and (time.time() - row[1]) <= ttl:
            return row[0]
    except Exception:  # noqa: BLE001
        pass
    return None


def _cache_put(url: str, body: str, status: int) -> None:
    try:
        h = hashlib.sha256(url.encode()).hexdigest()
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO net_cache (url_hash,url,body,status,fetched_ts) VALUES (?,?,?,?,?)",
                      (h, url, body, status, time.time()))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def _throttle(host: str) -> None:
    """Block until the per-host minimum interval has elapsed (thread-safe)."""
    with _lock:
        now = time.time()
        wait = _interval(host) - (now - _last_call.get(host, 0.0))
        if wait > 0:
            time.sleep(min(wait, 30.0))
        _last_call[host] = time.time()


# ── fetch ────────────────────────────────────────────────────────────────────
def polite_get(url: str, *, ttl: float = 300.0, max_retries: int = 4,
               timeout: float = 15.0, headers: dict | None = None) -> dict:
    """Cached, throttled GET with backoff. Returns
    {ok, status, body, json, from_cache, host, error}."""
    host = _host(url)
    cached = _cache_get(url, ttl)
    if cached is not None:
        try:
            j = json.loads(cached)
        except Exception:  # noqa: BLE001
            j = None
        return {"ok": True, "status": 200, "body": cached, "json": j,
                "from_cache": True, "host": host, "error": None}

    hdrs = {"User-Agent": DEFAULT_UA, "Accept": "application/json"}
    if host == "api.crossref.org":
        hdrs["User-Agent"] = "APEX-WorldRuntime/1.0 (mailto:ops@apex.local)"
    hdrs.update(headers or {})

    backoff = 1.0
    for attempt in range(max(1, max_retries)):
        _throttle(host)
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", errors="ignore")
                _cache_put(url, body, r.status)
                try:
                    j = json.loads(body)
                except Exception:  # noqa: BLE001
                    j = None
                return {"ok": True, "status": r.status, "body": body, "json": j,
                        "from_cache": False, "host": host, "error": None}
        except urllib.error.HTTPError as e:  # noqa: PERF203
            if e.code in (429, 503) and attempt < max_retries - 1:
                retry_after = e.headers.get("Retry-After") if e.headers else None
                try:
                    delay = float(retry_after) if retry_after else backoff
                except (TypeError, ValueError):
                    delay = backoff
                time.sleep(min(delay, 60.0))
                backoff *= 2
                continue
            return {"ok": False, "status": e.code, "body": None, "json": None,
                    "from_cache": False, "host": host, "error": f"HTTP {e.code}"}
        except Exception as e:  # noqa: BLE001
            if attempt < max_retries - 1:
                time.sleep(min(backoff, 30.0)); backoff *= 2; continue
            return {"ok": False, "status": None, "body": None, "json": None,
                    "from_cache": False, "host": host, "error": str(e)[:120]}
    return {"ok": False, "status": None, "body": None, "json": None,
            "from_cache": False, "host": host, "error": "exhausted"}


def cache_stats() -> dict:
    _init()
    try:
        c = _conn()
        try:
            n = c.execute("SELECT COUNT(*) FROM net_cache").fetchone()[0]
        finally:
            c.close()
        return {"cached_responses": n, "host_limits": HOST_MIN_INTERVAL}
    except Exception:  # noqa: BLE001
        return {"cached_responses": 0}
