"""Deep-history scrapers for assets whose full history exceeds the CoinGecko
Demo-tier 365-day cap. Free, key-less sources only.

Primary: CryptoCompare histoday (paginated via toTs back to listing) for crypto +
gold tokens vs USD. Returns the canonical [{t: ms, v: price}, ...] shape the
forecaster/backtester already consume.

(Stooq now requires an API key; Binance klines are geo-restricted from this host —
so CryptoCompare is the working free deep-history source.)
"""
from __future__ import annotations

import time

_CC_BASE = "https://min-api.cryptocompare.com/data/v2/histoday"


def cryptocompare_full(fsym: str, tsym: str = "USD", *, max_calls: int = 6) -> list[dict]:
    """Full daily history for a symbol from CryptoCompare, paginating backward with
    toTs until the API stops returning earlier data (or max_calls). Returns
    [{t: ms, v: close}, ...] sorted ascending, de-duplicated. [] on error."""
    import httpx

    out: dict[int, float] = {}
    to_ts: int | None = None
    try:
        for _ in range(max_calls):
            params = {"fsym": fsym.upper(), "tsym": tsym.upper(), "limit": 2000}
            if to_ts is not None:
                params["toTs"] = to_ts
            r = httpx.get(_CC_BASE, params=params, timeout=httpx.Timeout(30.0, connect=8.0))
            if r.status_code != 200:
                break
            data = (r.json().get("Data") or {}).get("Data") or []
            data = [d for d in data if d.get("close")]  # drop zero-fill rows
            if not data:
                break
            for d in data:
                out[int(d["time"])] = float(d["close"])
            earliest = min(d["time"] for d in data)
            if to_ts is not None and earliest >= to_ts:
                break  # no further back-fill
            to_ts = earliest - 1
            time.sleep(0.4)  # be polite
    except Exception:  # noqa: BLE001
        pass
    return [{"t": t * 1000, "v": v} for t, v in sorted(out.items())]


# CoinGecko-id / ticker -> CryptoCompare fsym
_CC_SYM = {
    "ripple": "XRP", "xrp": "XRP", "bitcoin": "BTC", "btc": "BTC",
    "ethereum": "ETH", "eth": "ETH", "solana": "SOL", "cardano": "ADA",
    "dogecoin": "DOGE", "binancecoin": "BNB", "tron": "TRX", "chainlink": "LINK",
    "avalanche-2": "AVAX", "litecoin": "LTC", "pax-gold": "PAXG",
    "tether-gold": "XAUT", "tether": "USDT",
}


def yahoo_daily(symbol: str, *, rng: str = "10y", interval: str = "1d") -> list[dict]:
    """Free daily history for a stock / index / ETF from Yahoo Finance chart API
    (no key). Indices use a caret, e.g. ^GSPC (S&P 500), ^IXIC (NASDAQ Composite),
    ^NDX (Nasdaq-100), ^DJI. Returns [{t: ms, v: close}, ...] ascending, [] on error."""
    import httpx

    try:
        r = httpx.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            params={"range": rng, "interval": interval},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=httpx.Timeout(30.0, connect=8.0),
        )
        r.raise_for_status()
        res = r.json()["chart"]["result"][0]
        ts = res["timestamp"]
        close = res["indicators"]["quote"][0]["close"]
        return [{"t": int(t) * 1000, "v": float(c)}
                for t, c in zip(ts, close) if c is not None]
    except Exception:  # noqa: BLE001
        return []


# Friendly names -> Yahoo symbols for indices the user cares about.
_YAHOO_SYM = {
    "sp500": "^GSPC", "s&p500": "^GSPC", "spx": "^GSPC", "gspc": "^GSPC",
    "nasdaq": "^IXIC", "ixic": "^IXIC", "nasdaq100": "^NDX", "ndx": "^NDX",
    "dow": "^DJI", "djia": "^DJI",
}


# ── S&P 500 constituents (Wikipedia scrape) ──────────────────────────────────
_SP500_CACHE: list[dict] | None = None
_WIKI_SP500 = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"


def sp500_constituents() -> list[dict]:
    """Current S&P 500 constituents scraped from the Wikipedia "List of S&P 500
    companies" page (first table). Returns ``[{"ticker": str, "sector": str}, ...]``
    with symbols converted to Yahoo format (``BRK.B`` -> ``BRK-B``). Cached in
    process. Returns ``[]`` gracefully on any error (network / parse).

    Parses the first wikitable, reading the ``Symbol`` and ``GICS Sector`` columns
    by header name (robust to column reordering).
    """
    global _SP500_CACHE
    if _SP500_CACHE is not None:
        return _SP500_CACHE
    import html as _html
    import re

    import httpx

    out: list[dict] = []
    try:
        r = httpx.get(
            _WIKI_SP500,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=httpx.Timeout(30.0, connect=8.0),
            follow_redirects=True,
        )
        r.raise_for_status()
        text = r.text
        # isolate the first wikitable (the constituents table)
        m = re.search(r'<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>(.*?)</table>',
                      text, re.DOTALL)
        if not m:
            return []
        table = m.group(1)
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.DOTALL)
        if not rows:
            return []

        def _cells(row: str, tag: str) -> list[str]:
            raw = re.findall(rf"<{tag}[^>]*>(.*?)</{tag}>", row, re.DOTALL)
            cleaned = []
            for c in raw:
                c = re.sub(r"<[^>]+>", "", c)        # strip nested tags
                c = _html.unescape(c).strip()
                cleaned.append(c)
            return cleaned

        # header row -> locate Symbol / Sector column indices
        header = _cells(rows[0], "th")
        sym_idx, sec_idx = 0, 2
        for i, h in enumerate(header):
            hl = h.lower()
            if "symbol" in hl:
                sym_idx = i
            elif "sector" in hl and "sub" not in hl:
                sec_idx = i

        seen: set[str] = set()
        for row in rows[1:]:
            cells = _cells(row, "td")
            if not cells or len(cells) <= max(sym_idx, sec_idx):
                continue
            sym = cells[sym_idx].strip().upper()
            sym = sym.replace(".", "-")  # BRK.B -> BRK-B for Yahoo
            sym = re.sub(r"[^A-Z0-9\-]", "", sym)
            if not sym or sym in seen:
                continue
            sector = cells[sec_idx].strip() or "Unknown"
            seen.add(sym)
            out.append({"ticker": sym, "sector": sector})
    except Exception:  # noqa: BLE001
        return []
    _SP500_CACHE = out
    return out


def deep_history(asset: str) -> list[dict]:
    """Best free deep-history series for `asset`: crypto/gold via CryptoCompare,
    indices/stocks via Yahoo Finance. Accepts CoinGecko ids, tickers, index names
    (sp500/nasdaq), or raw Yahoo symbols (^GSPC, AAPL)."""
    a = asset.lower().strip()
    if a in _YAHOO_SYM:
        return yahoo_daily(_YAHOO_SYM[a])
    if asset.startswith("^") or (asset.isupper() and "." not in asset and a not in _CC_SYM and len(asset) <= 5 and a not in {"xrp", "btc", "eth", "sol", "ada", "bnb", "trx", "ltc", "link"}):
        # looks like a stock ticker (e.g. AAPL, TSLA) or an index symbol
        y = yahoo_daily(asset)
        if y:
            return y
    sym = _CC_SYM.get(a, asset.upper().strip())
    return cryptocompare_full(sym)

