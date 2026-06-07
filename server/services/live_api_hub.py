"""LIVE API HUB — fetches real-time data from free public APIs for all injected cities.

Open-Meteo (no API key):
  - Weather: current + forecast (temp, humidity, pressure, wind, rain, snow, etc.)
  - Air Quality: PM2.5, PM10, CO, NO2, SO2, O3, UV, aerosols
  - Marine: wave height, swell, ocean temp, salinity
  - Flood: river discharge, flood alerts

USGS (no API key): earthquakes
NWS (no API key): US weather alerts
OpenSky (no API key): flight tracking
CoinGecko (no API key): crypto prices

All data is stored as ont_object Measurements with city links, then served
by the page data service. Uses stdlib urllib only (no httpx dependency)."""
from __future__ import annotations

import json
import os
import sqlite3
import time
import urllib.request
from typing import Any, Optional

_BRAIN_DB = os.environ.get("BRAIN_DB", "server/data/brain.db")
_UA = "APEX-WorldRuntime/1.0 (ops@apex.local)"


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_BRAIN_DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _json_get(url: str, timeout: float = 15.0) -> dict | None:
    """GET JSON from url. Returns None on failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            return json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:
        return None


def get_cities(limit: int = 200) -> list[dict]:
    """Return all cities from brain.db with lat/lon."""
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id, props FROM ont_object WHERE type = 'Place' ORDER BY id LIMIT ?",
            (limit,)
        ).fetchall()
    finally:
        c.close()
    cities = []
    for r in rows:
        try:
            p = json.loads(r["props"] or "{}")
            if p.get("type") in ("city", "capital") and p.get("lat") and p.get("lon"):
                cities.append({
                    "id": r["id"],
                    "name": p.get("label", ""),
                    "country": p.get("country_code", ""),
                    "lat": float(p["lat"]),
                    "lon": float(p["lon"]),
                    "population": p.get("population", 0),
                })
        except Exception:
            continue
    return cities


def _store_measurement(
    city_id: str,
    metric_name: str,
    value: Any,
    unit: str,
    source: str,
    extra: dict | None = None,
) -> str | None:
    """Store a single measurement as an ont_object. Returns id or None."""
    now = int(time.time() * 1000)
    mid = f"meas:{metric_name}:{city_id.split(':')[1] if ':' in city_id else city_id}:{int(now/1000)}"
    props = {
        "label": f"{metric_name} — {city_id}",
        "metric": metric_name,
        "value": value,
        "unit": unit,
        "city_id": city_id,
        "source": source,
        "timestamp": now,
        **(extra or {}),
    }
    try:
        c = _conn()
        c.execute(
            "INSERT OR REPLACE INTO ont_object (id,type,props,state,created_ts,updated_ts) VALUES (?,?,?,?,?,?)",
            (mid, "Measurement", json.dumps(props, default=str), "live", now, now)
        )
        # Link measurement to city
        c.execute(
            "INSERT OR IGNORE INTO ont_link (id,type,from_id,to_id,ts) VALUES (?,?,?,?,?)",
            (f"measured:{mid}", "MEASURED_AT", mid, city_id, now)
        )
        c.commit()
        c.close()
        return mid
    except Exception:
        return None


# ── Open-Meteo Weather ────────────────────────────────────────────────────────
def fetch_weather_for_city(city: dict) -> dict:
    """Fetch current weather for a city from Open-Meteo. Returns dict of metrics."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={city['lat']}&longitude={city['lon']}"
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
        "is_day,precipitation,rain,showers,snowfall,weather_code,"
        "cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,"
        "wind_direction_10m,wind_gusts_10m"
        "&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,"
        "apparent_temperature,precipitation_probability,precipitation,"
        "weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,"
        "wind_gusts_10m,visibility,uv_index"
        "&timezone=auto"
    )
    data = _json_get(url)
    if not data:
        return {"error": "fetch failed"}

    current = data.get("current", {})
    hourly = data.get("hourly", {})
    results = {}

    if current:
        results["air_temperature"] = (current.get("temperature_2m"), "°C")
        results["relative_humidity"] = (current.get("relative_humidity_2m"), "%")
        results["apparent_temperature"] = (current.get("apparent_temperature"), "°C")
        results["precipitation"] = (current.get("precipitation"), "mm")
        results["rain"] = (current.get("rain"), "mm")
        results["showers"] = (current.get("showers"), "mm")
        results["snowfall"] = (current.get("snowfall"), "mm")
        results["cloud_cover"] = (current.get("cloud_cover"), "%")
        results["pressure_msl"] = (current.get("pressure_msl"), "hPa")
        results["surface_pressure"] = (current.get("surface_pressure"), "hPa")
        results["wind_speed"] = (current.get("wind_speed_10m"), "km/h")
        results["wind_direction"] = (current.get("wind_direction_10m"), "°")
        results["wind_gusts"] = (current.get("wind_gusts_10m"), "km/h")
        results["weather_code"] = (current.get("weather_code"), "WMO code")
        results["is_day"] = (current.get("is_day"), "bool")

    if hourly:
        temps = hourly.get("temperature_2m", [])
        if temps:
            results["hourly_temp"] = (temps[0], "°C")
        dews = hourly.get("dew_point_2m", [])
        if dews:
            results["dew_point"] = (dews[0], "°C")
        uvs = hourly.get("uv_index", [])
        if uvs:
            results["uv_index"] = (uvs[0], "index")
        vis = hourly.get("visibility", [])
        if vis:
            results["visibility"] = (vis[0], "m")

    stored = 0
    for metric, (val, unit) in results.items():
        if val is not None:
            if _store_measurement(city["id"], metric, val, unit, "open-meteo-weather", {"lat": city["lat"], "lon": city["lon"]}):
                stored += 1

    return {"stored": stored, "metrics": list(results.keys())}


# ── Open-Meteo Air Quality ────────────────────────────────────────────────────
def fetch_air_quality_for_city(city: dict) -> dict:
    """Fetch air quality for a city from Open-Meteo."""
    url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={city['lat']}&longitude={city['lon']}"
        "&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,"
        "ozone,aerosol_optical_depth,dust,uv_index,alder_pollen,birch_pollen,"
        "grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen"
        "&timezone=auto"
    )
    data = _json_get(url)
    if not data:
        return {"error": "fetch failed"}

    current = data.get("current", {})
    results = {}
    mapping = {
        "pm10": ("pm10", "μg/m³"),
        "pm2_5": ("pm2_5", "μg/m³"),
        "carbon_monoxide": ("carbon_monoxide", "μg/m³"),
        "nitrogen_dioxide": ("nitrogen_dioxide", "μg/m³"),
        "sulphur_dioxide": ("sulphur_dioxide", "μg/m³"),
        "ozone": ("ozone", "μg/m³"),
        "aerosol_optical_depth": ("aerosol_optical_depth", "unitless"),
        "dust": ("dust", "μg/m³"),
        "uv_index": ("uv_index", "index"),
        "alder_pollen": ("alder_pollen", "grains/m³"),
        "birch_pollen": ("birch_pollen", "grains/m³"),
        "grass_pollen": ("grass_pollen", "grains/m³"),
        "mugwort_pollen": ("mugwort_pollen", "grains/m³"),
        "olive_pollen": ("olive_pollen", "grains/m³"),
        "ragweed_pollen": ("ragweed_pollen", "grains/m³"),
    }

    for key, (metric, unit) in mapping.items():
        val = current.get(key)
        if val is not None:
            results[metric] = (val, unit)

    stored = 0
    for metric, (val, unit) in results.items():
        if _store_measurement(city["id"], metric, val, unit, "open-meteo-aq", {"lat": city["lat"], "lon": city["lon"]}):
            stored += 1

    return {"stored": stored, "metrics": list(results.keys())}


# ── Open-Meteo Marine (if coastal) ────────────────────────────────────────────
def fetch_marine_for_city(city: dict) -> dict:
    """Fetch marine data for coastal cities."""
    url = (
        "https://marine-api.open-meteo.com/v1/marine"
        f"?latitude={city['lat']}&longitude={city['lon']}"
        "&hourly=wave_height,wind_wave_height,swell_wave_height,"
        "wave_direction,wind_wave_direction,swell_wave_direction,"
        "wave_period,wind_wave_period,swell_wave_period,ocean_current_velocity,"
        "ocean_current_direction,sea_surface_temperature"
        "&timezone=auto"
    )
    data = _json_get(url)
    if not data:
        return {"error": "fetch failed"}

    hourly = data.get("hourly", {})
    results = {}
    mapping = {
        "wave_height": ("wave_height", "m"),
        "wind_wave_height": ("wind_wave_height", "m"),
        "swell_wave_height": ("swell_wave_height", "m"),
        "wave_period": ("wave_period", "s"),
        "wind_wave_period": ("wind_wave_period", "s"),
        "swell_wave_period": ("swell_wave_period", "s"),
        "sea_surface_temperature": ("sea_surface_temperature", "°C"),
        "ocean_current_velocity": ("ocean_current_velocity", "m/s"),
    }

    for key, (metric, unit) in mapping.items():
        vals = hourly.get(key, [])
        if vals and vals[0] is not None:
            results[metric] = (vals[0], unit)

    stored = 0
    for metric, (val, unit) in results.items():
        if _store_measurement(city["id"], metric, val, unit, "open-meteo-marine", {"lat": city["lat"], "lon": city["lon"]}):
            stored += 1

    return {"stored": stored, "metrics": list(results.keys())}


# ── USGS Earthquakes (global, significant week) ───────────────────────────────
def fetch_usgs_earthquakes(limit: int = 50) -> dict:
    """Fetch significant earthquakes from USGS."""
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson"
    data = _json_get(url)
    if not data:
        return {"error": "fetch failed"}

    now = int(time.time() * 1000)
    c = _conn()
    inserted = 0
    try:
        for feat in data.get("features", [])[:limit]:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            coords = geom.get("coordinates", [None, None, None])
            eid = f"usgs:{props.get('code', props.get('ids', '')).split(',')[0]}"
            if not eid.replace("usgs:", ""):
                eid = f"usgs:{props.get('time', now)}"
            c.execute(
                "INSERT OR REPLACE INTO ont_object (id,type,props,state,created_ts,updated_ts) VALUES (?,?,?,?,?,?)",
                (eid, "Event", json.dumps({
                    "label": f"Earthquake: {props.get('place', 'Unknown')}",
                    "place": props.get("place", ""),
                    "magnitude": props.get("mag"),
                    "mag_type": props.get("magType", ""),
                    "depth_km": coords[2] if len(coords) > 2 else None,
                    "lat": coords[1] if len(coords) > 1 else None,
                    "lon": coords[0] if len(coords) > 0 else None,
                    "time": props.get("time"),
                    "url": props.get("url", ""),
                    "alert": props.get("alert", ""),
                    "tsunami": props.get("tsunami", 0),
                    "status": props.get("status", ""),
                    "source": "USGS",
                }, default=str), "live", now, now)
            )
            inserted += 1
        c.commit()
    finally:
        c.close()
    return {"stored": inserted}


# ── NWS Weather Alerts (US only) ──────────────────────────────────────────────
def fetch_nws_alerts(limit: int = 50) -> dict:
    """Fetch active weather alerts from US NWS."""
    url = "https://api.weather.gov/alerts/active?limit=50"
    data = _json_get(url)
    if not data:
        return {"error": "fetch failed"}

    now = int(time.time() * 1000)
    c = _conn()
    inserted = 0
    try:
        for feat in data.get("features", [])[:limit]:
            props = feat.get("properties", {})
            eid = f"nws:{props.get('id', '').replace('/', '_')}"
            c.execute(
                "INSERT OR REPLACE INTO ont_object (id,type,props,state,created_ts,updated_ts) VALUES (?,?,?,?,?,?)",
                (eid, "Event", json.dumps({
                    "label": f"Weather Alert: {props.get('event', 'Unknown')}",
                    "event": props.get("event", ""),
                    "severity": props.get("severity", ""),
                    "certainty": props.get("certainty", ""),
                    "urgency": props.get("urgency", ""),
                    "headline": props.get("headline", ""),
                    "description": props.get("description", ""),
                    "area": props.get("areaDesc", ""),
                    "effective": props.get("effective", ""),
                    "expires": props.get("expires", ""),
                    "sender": props.get("senderName", ""),
                    "url": props.get("@id", ""),
                    "source": "NWS",
                }, default=str), "live", now, now)
            )
            inserted += 1
        c.commit()
    finally:
        c.close()
    return {"stored": inserted}


# ── OpenSky Flight Data ───────────────────────────────────────────────────────
def fetch_opensky_states(limit: int = 100) -> dict:
    """Fetch current flight states from OpenSky."""
    url = "https://opensky-network.org/api/states/all"
    data = _json_get(url)
    if not data:
        return {"error": "fetch failed"}

    now = int(time.time() * 1000)
    states = data.get("states", []) or []
    c = _conn()
    inserted = 0
    try:
        for s in states[:limit]:
            if not s or len(s) < 17:
                continue
            icao = s[0] or "unknown"
            call = (s[1] or "").strip()
            fid = f"flight:{icao}:{int(now/1000)}"
            c.execute(
                "INSERT OR REPLACE INTO ont_object (id,type,props,state,created_ts,updated_ts) VALUES (?,?,?,?,?,?)",
                (fid, "Asset", json.dumps({
                    "label": f"Flight {call or icao}",
                    "icao24": icao,
                    "callsign": call,
                    "origin_country": s[2] or "",
                    "time_position": s[3],
                    "last_contact": s[4],
                    "lat": s[6],
                    "lon": s[5],
                    "altitude_m": s[7],
                    "on_ground": s[8],
                    "velocity_m_s": s[9],
                    "heading": s[10],
                    "vertical_rate": s[11],
                    "sensors": s[12],
                    "baro_altitude": s[13],
                    "squawk": s[14],
                    "spi": s[15],
                    "position_source": s[16],
                    "source": "OpenSky",
                    "timestamp": now,
                }, default=str), "live", now, now)
            )
            inserted += 1
        c.commit()
    finally:
        c.close()
    return {"stored": inserted}


# ── CoinGecko Crypto ──────────────────────────────────────────────────────────
def fetch_crypto_prices() -> dict:
    """Fetch crypto prices from CoinGecko."""
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        "?ids=bitcoin,ethereum,ripple,cardano,solana,polkadot,chainlink,litecoin"
        "&vs_currencies=usd,aud"
        "&include_24hr_change=true"
    )
    data = _json_get(url)
    if not data:
        return {"error": "fetch failed"}

    now = int(time.time() * 1000)
    c = _conn()
    inserted = 0
    try:
        for coin, prices in data.items():
            for vs, val in prices.items():
                if vs.endswith("_24h_change"):
                    continue
                mid = f"crypto:{coin}:{vs}:{int(now/1000)}"
                change_key = f"{vs}_24h_change"
                c.execute(
                    "INSERT OR REPLACE INTO ont_object (id,type,props,state,created_ts,updated_ts) VALUES (?,?,?,?,?,?)",
                    (mid, "Measurement", json.dumps({
                        "label": f"{coin} / {vs.upper()}",
                        "coin": coin,
                        "vs_currency": vs,
                        "price": val,
                        "change_24h_pct": prices.get(change_key),
                        "timestamp": now,
                        "source": "CoinGecko",
                    }, default=str), "live", now, now)
                )
                inserted += 1
        c.commit()
    finally:
        c.close()
    return {"stored": inserted}


# ── MASTER FETCH ──────────────────────────────────────────────────────────────
def fetch_all_live_data(
    *,
    cities_limit: int = 50,
    weather: bool = True,
    air_quality: bool = True,
    marine: bool = True,
    earthquakes: bool = True,
    nws_alerts: bool = True,
    flights: bool = True,
    crypto: bool = True,
) -> dict:
    """Fetch all live data and store in brain.db. Returns summary."""
    start = time.time()
    report: dict[str, Any] = {}

    cities = get_cities(limit=cities_limit)
    report["cities_count"] = len(cities)

    if weather:
        w_stored = 0
        for city in cities:
            res = fetch_weather_for_city(city)
            w_stored += res.get("stored", 0)
        report["weather"] = {"stored": w_stored}

    if air_quality:
        aq_stored = 0
        for city in cities:
            res = fetch_air_quality_for_city(city)
            aq_stored += res.get("stored", 0)
        report["air_quality"] = {"stored": aq_stored}

    if marine:
        m_stored = 0
        for city in cities[:20]:
            res = fetch_marine_for_city(city)
            m_stored += res.get("stored", 0)
        report["marine"] = {"stored": m_stored}

    if earthquakes:
        report["earthquakes"] = fetch_usgs_earthquakes()
    if nws_alerts:
        report["nws_alerts"] = fetch_nws_alerts()
    if flights:
        report["flights"] = fetch_opensky_states()
    if crypto:
        report["crypto"] = fetch_crypto_prices()

    report["elapsed_s"] = round(time.time() - start, 2)
    return report


# ── Page Data Query — GRAPH-CORRELATED per page ───────────────────────────────
def _page_keywords(page_name: str, topics: list[dict]) -> set[str]:
    """Extract keywords from page name + topic names for matching."""
    keywords = set(page_name.lower().replace(" ", "").split())
    for t in topics:
        name = t.get("Topic Name", "")
        keywords.update(name.lower().split())
        keywords.update(t.get("Source Class", "").lower().split())
    return {k for k in keywords if len(k) > 2}


def _score_relevance(row: sqlite3.Row, keywords: set[str]) -> float:
    """Score how relevant an object is to a set of keywords (0-100)."""
    try:
        props = json.loads(row["props"] or "{}")
    except Exception:
        props = {}
    text = " ".join(str(v) for v in [
        row["id"], props.get("label"), props.get("topic_name"),
        props.get("metric"), props.get("url"), props.get("title"),
        props.get("source_name"), props.get("source_class"),
        props.get("city_id"), props.get("country_code"),
    ] if v).lower()
    matches = sum(1 for k in keywords if k in text)
    return min(100.0, matches * 10.0 + (50 if row["type"] in ("Measurement", "Event") else 0))


def get_page_data(page_name: str, limit: int = 100) -> dict:
    """Return GRAPH-CORRELATED live data for a specific page.

    Strategy:
      1. Find topics mapped to this page via the scraper master sheet.
      2. Build keyword set from topic names + source classes.
      3. Query the ontology graph for objects linked to those topics.
      4. Score every candidate by keyword overlap + recency + graph proximity.
      5. Return top-N per category so each page shows DISTINCT correlated data."""
    from . import topic_engine as te

    c = _conn()
    try:
        topics = te.topics_for_page(page_name)
        topic_names = [t["Topic Name"] for t in topics[:50]]
        keywords = _page_keywords(page_name, topics)

        # Topic IDs for graph expansion
        topic_ids = {f"topic_{t['ID']}" for t in topics}
        # Also include ontology topic IDs that match by name
        if topic_names:
            placeholders = ",".join("?" * len(topic_names))
            for r in c.execute(
                f"SELECT id FROM ont_object WHERE type='Topic' AND json_extract(props,'$.topic_name') IN ({placeholders})",
                tuple(topic_names)
            ).fetchall():
                topic_ids.add(r[0])

        # ── Graph-linked objects (objects linked to page topics) ──────────────
        linked_ids: set[str] = set()
        if topic_ids:
            placeholders = ",".join("?" * len(topic_ids))
            for r in c.execute(
                f"SELECT from_id, to_id FROM ont_link WHERE from_id IN ({placeholders}) OR to_id IN ({placeholders})",
                tuple(topic_ids) * 2
            ).fetchall():
                linked_ids.add(r[0])
                linked_ids.add(r[1])
            # Remove topic IDs themselves from linked (we query topics separately)
            linked_ids -= topic_ids

        # ── Measurements: match by metric/topic keywords + recency ─────────────
        m_rows = c.execute(
            "SELECT id, type, props, state, updated_ts FROM ont_object "
            "WHERE type = 'Measurement' AND state = 'live' ORDER BY updated_ts DESC LIMIT ?",
            (limit * 3,)
        ).fetchall()
        measurements = []
        for r in m_rows:
            score = _score_relevance(r, keywords)
            if r["id"] in linked_ids:
                score += 30
            measurements.append((score, r))
        measurements.sort(key=lambda x: (-x[0], -x[1]["updated_ts"]))
        measurements = [r for _s, r in measurements[:limit]]

        # ── Events: same scoring ───────────────────────────────────────────────
        e_rows = c.execute(
            "SELECT id, type, props, state, updated_ts FROM ont_object "
            "WHERE type = 'Event' AND state = 'live' ORDER BY updated_ts DESC LIMIT ?",
            (limit * 2,)
        ).fetchall()
        events = []
        for r in e_rows:
            score = _score_relevance(r, keywords)
            if r["id"] in linked_ids:
                score += 30
            events.append((score, r))
        events.sort(key=lambda x: (-x[0], -x[1]["updated_ts"]))
        events = [r for _s, r in events[:limit // 2]]

        # ── Assets: same scoring ───────────────────────────────────────────────
        a_rows = c.execute(
            "SELECT id, type, props, state, updated_ts FROM ont_object "
            "WHERE type = 'Asset' ORDER BY updated_ts DESC LIMIT ?",
            (limit * 2,)
        ).fetchall()
        assets = []
        for r in a_rows:
            score = _score_relevance(r, keywords)
            if r["id"] in linked_ids:
                score += 30
            assets.append((score, r))
        assets.sort(key=lambda x: (-x[0], -x[1]["updated_ts"]))
        assets = [r for _s, r in assets[:limit // 3]]

        # ── Documents: fetched docs matching keywords ──────────────────────────
        d_rows = c.execute(
            "SELECT id, type, props, state, updated_ts FROM ont_object "
            "WHERE type = 'Document' AND state = 'fetched' ORDER BY updated_ts DESC LIMIT ?",
            (limit * 3,)
        ).fetchall()
        docs = []
        for r in d_rows:
            score = _score_relevance(r, keywords)
            if r["id"] in linked_ids:
                score += 30
            docs.append((score, r))
        docs.sort(key=lambda x: (-x[0], -x[1]["updated_ts"]))
        docs = [r for _s, r in docs[:limit // 2]]

        # ── Places: match by geo_scope / country / city keywords ───────────────
        p_rows = c.execute(
            "SELECT id, type, props, state, updated_ts FROM ont_object "
            "WHERE type = 'Place' ORDER BY updated_ts DESC LIMIT ?",
            (limit * 2,)
        ).fetchall()
        places = []
        for r in p_rows:
            score = _score_relevance(r, keywords)
            if r["id"] in linked_ids:
                score += 30
            places.append((score, r))
        places.sort(key=lambda x: (-x[0], -x[1]["updated_ts"]))
        places = [r for _s, r in places[:limit // 4]]

        # ── Topics: page-mapped first, then keyword-matched ────────────────────
        topic_rows = []
        if topic_ids:
            placeholders = ",".join("?" * len(topic_ids))
            for r in c.execute(
                f"SELECT id, type, props, state, updated_ts FROM ont_object WHERE id IN ({placeholders})",
                tuple(topic_ids)
            ).fetchall():
                topic_rows.append((100.0, r))
        # Backfill with keyword-matched topics
        t_rows = c.execute(
            "SELECT id, type, props, state, updated_ts FROM ont_object WHERE type='Topic' LIMIT ?",
            (limit * 2,)
        ).fetchall()
        existing = {r[1]["id"] for r in topic_rows}
        for r in t_rows:
            if r["id"] in existing:
                continue
            score = _score_relevance(r, keywords)
            topic_rows.append((score, r))
        topic_rows.sort(key=lambda x: (-x[0], -x[1]["updated_ts"]))
        topic_objs = [r for _s, r in topic_rows[:limit // 2]]

    finally:
        c.close()

    def _serialize(rows):
        out = []
        for r in rows:
            try:
                p = json.loads(r["props"] or "{}")
            except Exception:
                p = {}
            out.append({
                "id": r["id"],
                "type": r["type"],
                "state": r["state"],
                "updated_ts": r["updated_ts"],
                "props": p,
            })
        return out

    # ── Semantic search boost: find objects vector-similar to topic queries ──
    semantic_ids: set[str] = set()
    semantic_boost: dict[str, float] = {}
    try:
        from . import embeddings as emb
        for t in topics[:3]:
            q = t.get("Topic Name", "")
            if q:
                for hit in emb.search(q, k=10, kind=None):
                    hid = hit.get("id")
                    if hid:
                        semantic_ids.add(hid)
                        semantic_boost[hid] = max(semantic_boost.get(hid, 0), hit.get("score", 0))
    except Exception:
        pass

    # Add semantic hits to categories if not already present
    c2 = _conn()
    try:
        def _add_semantic(conn, row_ids, target_type):
            added = []
            for hid in semantic_ids:
                if hid in row_ids:
                    continue
                row = conn.execute(
                    "SELECT id, type, props, state, updated_ts FROM ont_object WHERE id=? AND type=?",
                    (hid, target_type)
                ).fetchone()
                if row:
                    added.append((50.0 + semantic_boost.get(hid, 0) * 50, row))
            return added

        m_ids = {r["id"] for r in measurements}
        measurements += [r for _s, r in _add_semantic(c2, m_ids, "Measurement")]
        measurements.sort(key=lambda r: -(_score_relevance(r, keywords) + (30 if r["id"] in linked_ids else 0) + (semantic_boost.get(r["id"], 0) * 20)))
        measurements = measurements[:limit]

        d_ids = {r["id"] for r in docs}
        docs += [r for _s, r in _add_semantic(c2, d_ids, "Document")]
        docs.sort(key=lambda r: -(_score_relevance(r, keywords) + (30 if r["id"] in linked_ids else 0) + (semantic_boost.get(r["id"], 0) * 20)))
        docs = docs[:limit // 2]
    finally:
        c2.close()

    return {
        "page": page_name,
        "mapped_topics": len(topics),
        "topic_names": topic_names[:20],
        "measurements": _serialize(measurements),
        "events": _serialize(events),
        "assets": _serialize(assets),
        "documents": _serialize(docs),
        "places": _serialize(places),
        "topics": _serialize(topic_objs),
        "keywords": sorted(keywords)[:20],
        "linked_objects": len(linked_ids),
        "semantic_matches": len(semantic_ids),
    }
