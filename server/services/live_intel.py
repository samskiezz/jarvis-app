"""Aggregator for the /functions/getLiveIntel endpoint.

Pulls a few public feeds (USGS earthquakes, Yahoo Finance quotes), caches them in
memory for 60s, and returns the shape the frontend panels destructure.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from ..config import LIVE_INTEL_TTL_SECONDS, USGS_FEED

# CoinGecko: free, no auth, returns price + 24h change per id.
_COINGECKO = "https://api.coingecko.com/api/v3/simple/price"
_COINS = [
    # (coingecko_id, vs_currency, display)
    ("ripple", "aud", "XRP/AUD"),
    ("bitcoin", "aud", "BTC/AUD"),
    ("ethereum", "usd", "ETH/USD"),
]

# exchangerate.host: free, no auth, daily FX rates.
_FX_HOST = "https://api.exchangerate.host/latest"
_FX_PAIRS = [
    ("AUD", "USD", "AUD/USD"),
    ("AED", "AUD", "AED/AUD"),
]


_cache: dict[str, Any] = {"ts": 0.0, "value": None}
_lock = asyncio.Lock()


async def _earthquakes(client: httpx.AsyncClient) -> list[dict]:
    try:
        resp = await client.get(USGS_FEED, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return []
    out: list[dict] = []
    for feature in data.get("features", [])[:50]:
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [])
        if len(coords) < 2:
            continue
        out.append(
            {
                "lat": coords[1],
                "lng": coords[0],
                "mag": props.get("mag"),
                "place": props.get("place"),
                "time": props.get("time"),
            }
        )
    return out


def _fmt_price(price: float) -> str:
    if abs(price) >= 1000:
        return f"{price:,.0f}"
    if abs(price) >= 10:
        return f"{price:,.2f}"
    return f"{price:,.4f}"


async def _crypto(client: httpx.AsyncClient) -> list[dict]:
    ids = ",".join({c[0] for c in _COINS})
    vs = ",".join({c[1] for c in _COINS})
    try:
        resp = await client.get(
            _COINGECKO,
            params={"ids": ids, "vs_currencies": vs, "include_24hr_change": "true"},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return []
    out: list[dict] = []
    for coin_id, vs_ccy, display in _COINS:
        row = data.get(coin_id, {})
        price = row.get(vs_ccy)
        change = row.get(f"{vs_ccy}_24h_change")
        if price is None:
            continue
        out.append(
            {
                "sym": display,
                "display": display,
                "price": _fmt_price(float(price)),
                "change_pct": round(float(change), 2) if change is not None else 0.0,
            }
        )
    return out


async def _fx(client: httpx.AsyncClient) -> list[dict]:
    out: list[dict] = []
    for base, target, display in _FX_PAIRS:
        try:
            resp = await client.get(
                _FX_HOST, params={"base": base, "symbols": target}, timeout=15.0
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError):
            continue
        rate = data.get("rates", {}).get(target)
        if rate is None:
            continue
        out.append(
            {
                "sym": display,
                "display": display,
                "price": _fmt_price(float(rate)),
                "change_pct": 0.0,
            }
        )
    return out


async def _markets(client: httpx.AsyncClient) -> list[dict]:
    # exchangerate.host now requires a paid key; we only ship the keyless feeds.
    # FX can be added back when the user supplies an API key in the env.
    return await _crypto(client)


async def get_live_intel() -> dict[str, Any]:
    now = time.time()
    if _cache["value"] is not None and now - _cache["ts"] < LIVE_INTEL_TTL_SECONDS:
        return _cache["value"]
    async with _lock:
        if _cache["value"] is not None and time.time() - _cache["ts"] < LIVE_INTEL_TTL_SECONDS:
            return _cache["value"]
        async with httpx.AsyncClient() as client:
            earthquakes, markets = await asyncio.gather(
                _earthquakes(client),
                _markets(client),
            )
        value = {
            "earthquakes": earthquakes,
            "markets": markets,
            "corpus": {
                "timeline": [],
                "investment_emails": [],
                "crypto_emails": [],
                "psg_emails": [],
                "travel_emails": [],
                "wedding_emails": [],
                "music_emails": [],
                "facts": {"predicates": {}},
            },
            "panopticon": {"maps": ["city_grid", "dockyard", "industrial_zone"]},
            "counterstrike": {"maps": ["de_dust2", "de_mirage", "de_inferno", "de_nuke"]},
            "generated_at": now,
        }
        _cache["value"] = value
        _cache["ts"] = now
        return value
