"""INGESTION ADAPTERS — pull real world-data feeds into the History Lake (P0).

Each adapter pulls one source, normalises to the History Lake series/observation
shape, and persists:
  * ``ingest_crypto()``  — CoinGecko price series (reuses ``prediction.load_crypto_series``).
  * ``ingest_seismic()`` — USGS earthquake catalog (reuses ``prediction.load_seismic_catalog``).
  * ``ingest_fx()``      — open.er-api.com FX rates (reuses ``config.FX_FEED``).

Every adapter opens a ``feed_run`` row, writes observations, and closes the run
with status ``ok`` / ``error`` / ``partial``. Network errors are caught and
recorded (status='error') — one feed failing never aborts the others.

``ingest_all()`` runs every adapter once (fault-isolated). ``ingestion_loop()``
is an opt-in asyncio task (started from the app lifespan, guarded by the env flag
``HISTORY_INGEST_ENABLED``) so imports / tests never hit the network.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

from ..config import FX_FEED
from . import history_lake as lake
from .prediction import load_crypto_series, load_seismic_catalog

# Default sets to ingest. Kept small + free-tier-friendly.
_CRYPTO_ASSETS = ["bitcoin", "ethereum", "ripple", "solana"]
_FX_PAIRS = ["USD", "EUR", "GBP", "JPY", "AED", "NZD"]  # quoted per 1 AUD (FX_FEED base)
_SEISMIC_METRIC = "event_count"


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── crypto ───────────────────────────────────────────────────────────────────────
def ingest_crypto(assets: Optional[list[str]] = None, *, days: int = 90) -> dict:
    """Ingest CoinGecko daily close-price series for each asset. Returns a small
    audit dict {source, status, n_rows, n_series}."""
    assets = assets or _CRYPTO_ASSETS
    run_id = lake.start_feed_run("coingecko")
    n_rows = 0
    n_series = 0
    errors: list[str] = []
    for asset in assets:
        try:
            series = load_crypto_series(asset, days=days)
            if not series:
                continue
            sid = lake.upsert_series(
                "coingecko", asset, "close_price", unit="USD", freq="1d"
            )
            written = lake.write_observations(
                sid, [{"t": p["t"], "v": p["v"]} for p in series]
            )
            n_rows += written
            n_series += 1
        except Exception as exc:  # noqa: BLE001 - isolate per-asset failures
            errors.append(f"{asset}:{exc}")
    status = "ok" if not errors else ("partial" if n_rows else "error")
    lake.finish_feed_run(run_id, status=status, n_rows=n_rows, note="; ".join(errors) or None)
    return {"source": "coingecko", "status": status, "n_rows": n_rows, "n_series": n_series}


# ── seismic ──────────────────────────────────────────────────────────────────────
def ingest_seismic(*, days: float = 30.0, min_magnitude: float = 2.5) -> dict:
    """Ingest the USGS catalog as a global daily event-count series plus a
    rolling max-magnitude series. Each quake's ``time`` (epoch ms) is bucketed by
    UTC day; the bucket midnight is the observation ts."""
    run_id = lake.start_feed_run("usgs")
    n_rows = 0
    n_series = 0
    note: Optional[str] = None
    try:
        catalog = load_seismic_catalog(min_magnitude=min_magnitude, days=days)
        if catalog:
            # Bucket events by UTC day -> (count, max_mag).
            day_count: dict[int, int] = {}
            day_maxmag: dict[int, float] = {}
            for ev in catalog:
                t = ev.get("time")
                mag = ev.get("mag")
                if t is None or mag is None:
                    continue
                day = (int(t) // 86_400_000) * 86_400_000  # floor to UTC midnight ms
                day_count[day] = day_count.get(day, 0) + 1
                day_maxmag[day] = max(day_maxmag.get(day, float("-inf")), float(mag))

            if day_count:
                sid_c = lake.upsert_series(
                    "usgs", "global", _SEISMIC_METRIC, unit="count", freq="1d"
                )
                n_rows += lake.write_observations(
                    sid_c, [{"t": d, "v": float(c)} for d, c in sorted(day_count.items())]
                )
                n_series += 1
                sid_m = lake.upsert_series(
                    "usgs", "global", "max_magnitude", unit="Mw", freq="1d"
                )
                n_rows += lake.write_observations(
                    sid_m, [{"t": d, "v": float(m)} for d, m in sorted(day_maxmag.items())]
                )
                n_series += 1
        status = "ok"
    except Exception as exc:  # noqa: BLE001
        status = "error"
        note = str(exc)
    lake.finish_feed_run(run_id, status=status, n_rows=n_rows, note=note)
    return {"source": "usgs", "status": status, "n_rows": n_rows, "n_series": n_series}


# ── fx ───────────────────────────────────────────────────────────────────────────
def _fetch_fx() -> dict:
    """Fetch the open.er-api.com snapshot. Returns the parsed JSON dict or {}."""
    try:
        import httpx

        resp = httpx.get(FX_FEED, timeout=httpx.Timeout(15.0, connect=8.0))
        resp.raise_for_status()
        return resp.json() or {}
    except Exception:  # noqa: BLE001 - any network/parse failure
        return {}


def ingest_fx(pairs: Optional[list[str]] = None) -> dict:
    """Ingest current FX rates (one observation per pair at the feed's
    ``time_last_update_unix`` timestamp). Base currency is AUD (per FX_FEED).
    Each rate is stored as series (fx, AUD<QUOTE>, rate)."""
    pairs = pairs or _FX_PAIRS
    run_id = lake.start_feed_run("fx")
    n_rows = 0
    n_series = 0
    note: Optional[str] = None
    try:
        data = _fetch_fx()
        rates = data.get("rates") or {}
        if rates:
            upd = data.get("time_last_update_unix")
            ts = int(upd) * 1000 if upd else _now_ms()
            for quote in pairs:
                rate = rates.get(quote)
                if rate is None:
                    continue
                sid = lake.upsert_series(
                    "fx", f"AUD{quote}", "rate", unit=quote, freq="1d"
                )
                n_rows += lake.write_observations(sid, [{"t": ts, "v": float(rate)}])
                n_series += 1
            status = "ok" if n_rows else "partial"
        else:
            status = "error"
            note = "no rates returned"
    except Exception as exc:  # noqa: BLE001
        status = "error"
        note = str(exc)
    lake.finish_feed_run(run_id, status=status, n_rows=n_rows, note=note)
    return {"source": "fx", "status": status, "n_rows": n_rows, "n_series": n_series}


# ── orchestration ────────────────────────────────────────────────────────────────
def ingest_all() -> dict:
    """Run every adapter once, fault-isolated (one source failing never aborts
    the others). Returns a per-source audit summary."""
    lake.init_db()
    results: dict[str, Any] = {}
    for name, fn in (("crypto", ingest_crypto), ("seismic", ingest_seismic), ("fx", ingest_fx)):
        try:
            results[name] = fn()
        except Exception as exc:  # noqa: BLE001 - belt-and-braces isolation
            results[name] = {"source": name, "status": "error", "n_rows": 0, "error": str(exc)}
    total = sum(r.get("n_rows", 0) for r in results.values())
    return {"results": results, "total_rows": total, "ts": _now_ms()}


async def ingestion_loop(interval_s: int = 900, *, run_immediately: bool = True) -> None:
    """Opt-in asyncio task: ingest every ``interval_s`` seconds forever. Runs
    blocking adapters in a threadpool so the event loop is never blocked. Started
    from the app lifespan only when ``HISTORY_INGEST_ENABLED`` is set."""
    if run_immediately:
        try:
            await asyncio.to_thread(ingest_all)
        except Exception:  # noqa: BLE001
            pass
    while True:
        try:
            await asyncio.sleep(interval_s)
            await asyncio.to_thread(ingest_all)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - never let the loop die on a feed error
            continue
