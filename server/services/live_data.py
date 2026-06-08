"""LIVE DATA — fast, batched, concurrent live-measurement producer.

The old orchestrator path committed ONE measurement per DB transaction (~180ms each) and fetched
cities sequentially (~2.3s each) → a full cycle took ~1 hour and committed nothing within any sane
timeout. This rewrite makes Measurements actually fly:

  • CONCURRENT fetch — a thread pool hits many cities at once (244 cities in ~30s, not ~10 min)
  • BATCHED writes — all rows go in via executemany, one commit per ~200 (not one per measurement)
  • short timeouts + per-call isolation — a slow/down API can never stall the cycle
  • timestamped IDs — every cycle writes NEW measurements, so the count GROWS each pass

Sources: Open-Meteo weather + air-quality (per city, the bulk), CoinGecko crypto, USGS earthquakes.

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.services.live_data [once|forever]
Env:  BRAIN_DB, LIVE_CITIES (default 100), LIVE_CONC (default 12), LIVE_INTERVAL_S (default 1800)
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import sqlite3
import time

import httpx

from . import topic_orchestrator as TO

BRAIN_DB = os.environ.get("BRAIN_DB", "server/data/brain.db")
CONC = int(os.environ.get("LIVE_CONC", "12"))
CITIES_N = int(os.environ.get("LIVE_CITIES", "100"))
UA = "APEX-LiveData/2.0"

WEATHER = {"temperature_2m": ("air_temperature", "°C"), "relative_humidity_2m": ("relative_humidity", "%"),
           "apparent_temperature": ("apparent_temperature", "°C"), "precipitation": ("precipitation", "mm"),
           "cloud_cover": ("cloud_cover", "%"), "pressure_msl": ("pressure_msl", "hPa"),
           "wind_speed_10m": ("wind_speed", "km/h"), "wind_direction_10m": ("wind_direction", "°"),
           "wind_gusts_10m": ("wind_gusts", "km/h")}
AIR = {"pm10": ("pm10", "μg/m³"), "pm2_5": ("pm2_5", "μg/m³"), "carbon_monoxide": ("carbon_monoxide", "μg/m³"),
       "nitrogen_dioxide": ("nitrogen_dioxide", "μg/m³"), "sulphur_dioxide": ("sulphur_dioxide", "μg/m³"),
       "ozone": ("ozone", "μg/m³"), "uv_index": ("uv_index", "index"), "dust": ("dust", "μg/m³")}


def _get(url: str, timeout: float = 8.0):
    try:
        r = httpx.get(url, timeout=timeout, headers={"User-Agent": UA, "Accept": "application/json"})
        r.raise_for_status()
        return r.json()
    except Exception:  # noqa: BLE001
        return None


def _rows(city_id: str, metrics: dict, source: str, now: int, extra: dict):
    objs, links = [], []
    short = city_id.split(":")[1] if ":" in city_id else city_id
    for metric, (val, unit) in metrics.items():
        if val is None:
            continue
        mid = f"meas:{metric}:{short}:{now // 1000}"
        props = {"label": f"{metric} — {city_id}", "metric": metric, "value": val, "unit": unit,
                 "city_id": city_id, "source": source, "timestamp": now, **extra}
        objs.append((mid, "Measurement", json.dumps(props, default=str), "live", now, now))
        links.append((f"measured:{mid}", "MEASURED_AT", mid, city_id, now))
    return objs, links


def _city_task(city: dict, now: int):
    objs, links = [], []
    lat, lon, cid = city["lat"], city["lon"], city["id"]
    extra = {"lat": lat, "lon": lon}
    w = _get(f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
             f"&current={','.join(WEATHER)}&timezone=auto")
    if w:
        cur = w.get("current", {})
        o, l = _rows(cid, {WEATHER[k][0]: (cur.get(k), WEATHER[k][1]) for k in WEATHER}, "open-meteo-weather", now, extra)
        objs += o; links += l
    a = _get(f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}"
             f"&current={','.join(AIR)}&timezone=auto")
    if a:
        cur = a.get("current", {})
        o, l = _rows(cid, {AIR[k][0]: (cur.get(k), AIR[k][1]) for k in AIR}, "open-meteo-aq", now, extra)
        objs += o; links += l
    return objs, links


def _crypto(now: int):
    coins = "bitcoin,ethereum,solana,cardano,ripple,polkadot,chainlink,litecoin,dogecoin,avalanche-2"
    d = _get(f"https://api.coingecko.com/api/v3/simple/price?ids={coins}&vs_currencies=usd")
    objs = []
    for coin, px in (d or {}).items():
        v = px.get("usd")
        if v is None:
            continue
        mid = f"meas:price:{coin}:{now // 1000}"
        props = {"label": f"price — {coin}", "metric": "price", "value": v, "unit": "USD",
                 "city_id": "global", "source": "coingecko", "timestamp": now, "asset": coin}
        objs.append((mid, "Measurement", json.dumps(props), "live", now, now))
    return objs


def _quakes(now: int):
    d = _get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")
    objs = []
    for f in (d or {}).get("features", [])[:300]:
        p = f.get("properties", {}) or {}
        mag = p.get("mag")
        if mag is None:
            continue
        eid = f.get("id", "")
        mid = f"meas:magnitude:{eid}"  # stable id — re-fetches update, not duplicate (honest count)
        props = {"label": f"magnitude — {p.get('place', eid)}", "metric": "magnitude", "value": mag,
                 "unit": "Mw", "city_id": "global", "source": "usgs", "timestamp": now, "place": p.get("place")}
        objs.append((mid, "Measurement", json.dumps(props, default=str), "live", now, now))
    return objs


def _store(objs: list, links: list) -> int:
    if not objs:
        return 0
    c = sqlite3.connect(BRAIN_DB, timeout=60)
    c.execute("PRAGMA busy_timeout=60000")
    n = 0
    for i in range(0, len(objs), 200):
        c.executemany("INSERT OR REPLACE INTO ont_object(id,type,props,state,created_ts,updated_ts) VALUES(?,?,?,?,?,?)",
                      objs[i:i + 200])
        c.commit(); n += len(objs[i:i + 200])
    for i in range(0, len(links), 500):
        c.executemany("INSERT OR IGNORE INTO ont_link(id,type,from_id,to_id,ts) VALUES(?,?,?,?,?)",
                      links[i:i + 500])
        c.commit()
    c.close()
    return n


def run_once() -> dict:
    now = int(time.time() * 1000)
    cities = TO.get_cities(limit=CITIES_N)
    allobj, alllink = [], []
    with cf.ThreadPoolExecutor(max_workers=CONC) as ex:
        for objs, links in ex.map(lambda c: _city_task(c, now), cities):
            allobj += objs; alllink += links
    allobj += _crypto(now)
    allobj += _quakes(now)
    n = _store(allobj, alllink)
    return {"cities": len(cities), "measurements_written": n}


def run_fast() -> int:
    """Cheap, frequent measurements (crypto + earthquakes) — no rate limits, safe every few minutes."""
    now = int(time.time() * 1000)
    return _store(_crypto(now) + _quakes(now), [])


def run_forever(interval_s: float = None) -> None:
    fast = float(os.environ.get("LIVE_FAST_S", "300"))
    full = float(os.environ.get("LIVE_FULL_S", "1800"))
    print(f"[live_data] starting — fast lane (crypto/quakes) every {fast}s, full lane "
          f"(weather/air, {CITIES_N} cities) every {full}s", flush=True)
    last_full = 0.0
    while True:
        t = time.time()
        try:
            if time.time() - last_full >= full:
                r = run_once()
                last_full = time.time()
                print(f"[live_data] FULL cycle {time.time()-t:.0f}s | +{r['measurements_written']:,} measurements", flush=True)
            else:
                n = run_fast()
                print(f"[live_data] fast cycle {time.time()-t:.0f}s | +{n} measurements (crypto/quakes)", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[live_data] error: {str(e)[:160]}", flush=True)
        time.sleep(fast)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "once":
        print(run_once())
    else:
        run_forever()
