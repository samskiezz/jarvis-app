"""NET RATELIMIT — per-host throttle + cache + Retry-After.

Upgraded to use ``httpx`` as the primary fetcher (with real browser TLS +
headers) so it clears Cloudflare/modern anti-bot that blocks ``urllib``.
Falls back to stdlib ``urllib`` when httpx is unavailable."""

from __future__ import annotations

import json
import os
import sqlite3
import time
import urllib.error
import urllib.request
from typing import Any

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "net_cache.db"
)
_DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


# ── DB ─────────────────────────────────────────────────────────────────────────
def _db_path() -> str:
    return os.environ.get("NET_CACHE_DB", _DEFAULT_DB)


def _init() -> None:
    try:
        c = sqlite3.connect(_db_path(), check_same_thread=False)
        c.execute(
            "CREATE TABLE IF NOT EXISTS net_cache (url TEXT PRIMARY KEY, body TEXT, status INT, ts INT)"
        )
        c.execute("CREATE INDEX IF NOT EXISTS nc_ts ON net_cache(ts)")
        c.commit()
        c.close()
    except Exception:
        pass


_init()


def _conn() -> sqlite3.Connection:
    return sqlite3.connect(_db_path(), check_same_thread=False)


# ── Throttle ───────────────────────────────────────────────────────────────────
HOST_MIN_INTERVAL: dict[str, float] = {
    "api.open-meteo.com": 0.2,
    "earthquake.usgs.gov": 1.0,
    "api.alerts.weather.gov": 1.0,
    "opensky-network.org": 2.0,
    "api.coingecko.com": 1.2,
    "api.crossref.org": 0.5,
}
_HOST_LAST: dict[str, float] = {}


def _host(u: str) -> str:
    try:
        return urllib.parse.urlparse(u or "").netloc.lower()
    except Exception:
        return ""


def _throttle(host: str) -> None:
    interval = HOST_MIN_INTERVAL.get(host, 0.15)
    last = _HOST_LAST.get(host, 0)
    wait = interval - (time.time() - last)
    if wait > 0:
        time.sleep(wait)
    _HOST_LAST[host] = time.time()


# ── Cache ──────────────────────────────────────────────────────────────────────
def _cache_get(url: str, ttl: float) -> str | None:
    try:
        c = _conn()
        row = c.execute(
            "SELECT body, ts FROM net_cache WHERE url=? AND ts>?",
            (url, int(time.time() * 1000 - ttl * 1000)),
        ).fetchone()
        c.close()
        return row[0] if row else None
    except Exception:
        return None


def _cache_put(url: str, body: str, status: int) -> None:
    try:
        c = _conn()
        c.execute(
            "INSERT OR REPLACE INTO net_cache (url, body, status, ts) VALUES (?, ?, ?, ?)",
            (url, body, status, int(time.time() * 1000)),
        )
        c.commit()
        c.close()
    except Exception:
        pass


# ── Fetch (httpx primary, urllib fallback) ─────────────────────────────────────
def polite_get(url: str, *, ttl: float = 300.0, max_retries: int = 4,
               timeout: float = 15.0, headers: dict | None = None) -> dict:
    """Cached, throttled GET with backoff. Returns
    {ok, status, body, json, from_cache, host, error}."""
    host = _host(url)
    cached = _cache_get(url, ttl)
    if cached is not None:
        try:
            j = json.loads(cached)
        except Exception:
            j = None
        return {"ok": True, "status": 200, "body": cached, "json": j,
                "from_cache": True, "host": host, "error": None}

    hdrs = {"User-Agent": _DEFAULT_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1"}
    if host == "api.crossref.org":
        hdrs["User-Agent"] = "APEX-WorldRuntime/1.0 (mailto:ops@apex.local)"
    hdrs.update(headers or {})

    # ── primary: httpx (handles modern TLS, better headers, faster) ──────────
    try:
        import httpx
        backoff = 1.0
        for attempt in range(max(1, max_retries)):
            _throttle(host)
            try:
                with httpx.Client(follow_redirects=True, timeout=timeout,
                                  headers=hdrs) as client:
                    r = client.get(url)
                body = r.text
                _cache_put(url, body, r.status_code)
                try:
                    j = json.loads(body)
                except Exception:
                    j = None
                return {"ok": True, "status": r.status_code, "body": body, "json": j,
                        "from_cache": False, "host": host, "error": None}
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (429, 503) and attempt < max_retries - 1:
                    time.sleep(min(backoff, 60.0)); backoff *= 2; continue
                return {"ok": False, "status": e.response.status_code, "body": None, "json": None,
                        "from_cache": False, "host": host, "error": f"HTTP {e.response.status_code}"}
            except Exception:
                if attempt < max_retries - 1:
                    time.sleep(min(backoff, 30.0)); backoff *= 2; continue
                # fall through to urllib fallback on final failure
                break
    except ImportError:
        pass

    # ── fallback: urllib ─────────────────────────────────────────────────────
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
                except Exception:
                    j = None
                return {"ok": True, "status": r.status, "body": body, "json": j,
                        "from_cache": False, "host": host, "error": None}
        except urllib.error.HTTPError as e:
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
        except Exception as e:
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
    except Exception:
        return {"cached_responses": 0}
