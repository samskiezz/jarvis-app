"""GEOSPATIAL service — the Palantir-Gotham *Map* pillar (stdlib only).

A defensive, never-raising geo layer over the live ontology store. It provides:

  * great-circle distance (:func:`haversine_km`),
  * coordinate extraction from ontology objects (:func:`objects_with_coords`),
  * radius / bounding-box spatial queries,
  * persistent geofences (SQLite) with ray-casting point-in-polygon,
  * a catalog of map *layers* and their GeoJSON-ish features,
  * a lat/lon density heat-grid,
  * movement *tracks* from History-Lake-style position series.

Design rules (mirror ``ontology_store.py`` / ``history_lake.py``):
  * stdlib + ``math`` only — no new dependency, no network.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``).
  * never raise on normal use — every public function degrades gracefully and
    returns a sensible empty/zero value on error.

Honesty about data sources (important):
  * The ``entities`` layer is **real** — it reflects live ontology objects that
    carry numeric lat/lon.
  * The ``seismic`` layer is **real** — it fetches the live USGS M2.5+/day
    GeoJSON feed via stdlib ``urllib`` (network-guarded; offline → honest empty).
  * ``air_quality`` / ``buoys`` / ``flight`` layers have **no real source wired**
    yet. Rather than fabricate data, they return an *empty* FeatureCollection
    carrying ``{"note": "source not wired"}`` so callers never mistake synthetic
    for real.
  * The ``density`` layer is **derived** honestly from the ``entities`` features.

The geofence DB path comes from env ``GEO_DB`` (default ``server/data/geo.db``).
"""

from __future__ import annotations

import math
import os
import sqlite3
import time
import urllib.request
import uuid
import json as _json
from typing import Any, Optional

from . import ontology_store

# ── DB location ─────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "geo.db"
)

# Public, keyless feeds fetched synchronously via stdlib urllib so geo.py stays
# dependency-free. Every fetch is network-guarded, so offline / blocked egress
# degrades to an honest empty collection rather than fabricating data.
_USGS_SEISMIC_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
_OPENSKY_FEED = "https://opensky-network.org/api/states/all"          # live aircraft states (anon)
_NDBC_BUOY_FEED = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"  # NOAA buoy latest obs
_OPENMETEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"       # keyless air quality

# A small set of major cities to sample point-based air-quality measurements
# from (the Open-Meteo AQ API is point-based, not a global feed).
_AQ_CITIES = [
    ("Sydney", -33.87, 151.21), ("Los Angeles", 34.05, -118.24),
    ("London", 51.51, -0.13), ("Beijing", 39.90, 116.41),
    ("Delhi", 28.61, 77.21), ("São Paulo", -23.55, -46.63),
    ("Tokyo", 35.68, 139.69), ("Lagos", 6.52, 3.38),
    ("Moscow", 55.75, 37.62), ("New York", 40.71, -74.01),
]

# Layer ids that still have no real source wired into this stdlib-only module.
# (All four science layers are now live; kept for forward-compat/unknown ids.)
_UNWIRED_LAYERS: tuple[str, ...] = ()

# Property keys we will look at when hunting for coordinates (case-insensitive).
_LAT_KEYS = ("lat", "latitude", "y")
_LON_KEYS = ("lon", "lng", "long", "longitude", "x")


def _db_path() -> str:
    """Resolve the geofence DB path at call-time so tests can set ``GEO_DB``."""
    return os.environ.get("GEO_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Distance ────────────────────────────────────────────────────────────────────
def haversine_km(lat1: Any, lon1: Any, lat2: Any, lon2: Any) -> float:
    """Great-circle distance between two points, in kilometres (spherical Earth,
    R=6371 km). Returns 0.0 on any bad/non-numeric input — never raises."""
    try:
        a1 = math.radians(float(lat1))
        o1 = math.radians(float(lon1))
        a2 = math.radians(float(lat2))
        o2 = math.radians(float(lon2))
    except (TypeError, ValueError):
        return 0.0
    dlat = a2 - a1
    dlon = o2 - o1
    h = math.sin(dlat / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin(dlon / 2) ** 2
    h = min(1.0, max(0.0, h))
    return 2.0 * 6371.0 * math.asin(math.sqrt(h))


# ── Coordinate extraction ─────────────────────────────────────────────────────────
def _coerce_float(value: Any) -> Optional[float]:
    """Best-effort float (handles ``"-33.8"``, ``"151.2°E"`` etc.). None if NaN."""
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        try:
            # strip non-numeric trailing junk like a degree symbol or hemisphere
            s = str(value).strip().rstrip("°NSEWnsew ").replace(",", "")
            f = float(s)
        except (TypeError, ValueError):
            return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _extract_latlon(props: Any) -> Optional[tuple[float, float]]:
    """Pull a (lat, lon) pair from a props dict defensively.

    Accepts top-level lat/lon-ish keys (any case) or a nested ``coords`` /
    ``location`` dict / ``[lat, lon]`` pair. Returns None if no valid numeric
    pair in range is found."""
    if not isinstance(props, dict):
        return None

    # 1. nested coords/location containers first.
    for nest_key in ("coords", "coord", "location", "geo", "position"):
        nested = props.get(nest_key)
        if isinstance(nested, dict):
            got = _extract_latlon(nested)
            if got:
                return got
        elif isinstance(nested, (list, tuple)) and len(nested) >= 2:
            lat = _coerce_float(nested[0])
            lon = _coerce_float(nested[1])
            if lat is not None and lon is not None and _in_range(lat, lon):
                return (lat, lon)

    # 2. flat keys (case-insensitive).
    lower = {str(k).lower(): v for k, v in props.items()}
    lat = lon = None
    for k in _LAT_KEYS:
        if k in lower:
            lat = _coerce_float(lower[k])
            if lat is not None:
                break
    for k in _LON_KEYS:
        if k in lower:
            lon = _coerce_float(lower[k])
            if lon is not None:
                break
    if lat is not None and lon is not None and _in_range(lat, lon):
        return (lat, lon)
    return None


def _in_range(lat: float, lon: float) -> bool:
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


def objects_with_coords(*, db_path: Optional[str] = None) -> list[dict]:
    """Return ontology objects that carry a valid numeric lat/lon, as
    ``[{id,label,type,lat,lon,mark}]``. Objects without coords are skipped.
    Never raises (returns [] on any error). ``db_path`` is the *ontology* DB."""
    try:
        objects = ontology_store.query_objects(db_path=db_path)
    except Exception:  # noqa: BLE001 - the store already guards, belt-and-braces
        return []
    out: list[dict] = []
    for o in objects or []:
        try:
            latlon = _extract_latlon(o.get("props"))
            if not latlon:
                continue
            out.append(
                {
                    "id": o.get("id"),
                    "label": o.get("label"),
                    "type": o.get("type"),
                    "lat": latlon[0],
                    "lon": latlon[1],
                    "mark": o.get("mark"),
                }
            )
        except Exception:  # noqa: BLE001
            continue
    return out


# ── Spatial queries ───────────────────────────────────────────────────────────────
def radius_query(
    lat: Any, lon: Any, km: Any, *, db_path: Optional[str] = None
) -> list[dict]:
    """Objects within ``km`` kilometres of ``(lat, lon)``, each annotated with
    ``distance_km`` and sorted nearest-first. Returns [] on bad input."""
    clat = _coerce_float(lat)
    clon = _coerce_float(lon)
    try:
        radius = float(km)
    except (TypeError, ValueError):
        return []
    if clat is None or clon is None or radius < 0:
        return []
    out: list[dict] = []
    for item in objects_with_coords(db_path=db_path):
        d = haversine_km(clat, clon, item["lat"], item["lon"])
        if d <= radius:
            row = dict(item)
            row["distance_km"] = round(d, 3)
            out.append(row)
    out.sort(key=lambda r: r["distance_km"])
    return out


def bbox_query(
    min_lat: Any,
    min_lon: Any,
    max_lat: Any,
    max_lon: Any,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """Objects whose lat/lon fall inside the (inclusive) bounding box. The box is
    normalised so min/max can be passed in any order. [] on bad input."""
    a = _coerce_float(min_lat)
    b = _coerce_float(min_lon)
    c = _coerce_float(max_lat)
    d = _coerce_float(max_lon)
    if None in (a, b, c, d):
        return []
    lo_lat, hi_lat = min(a, c), max(a, c)
    lo_lon, hi_lon = min(b, d), max(b, d)
    out: list[dict] = []
    for item in objects_with_coords(db_path=db_path):
        if lo_lat <= item["lat"] <= hi_lat and lo_lon <= item["lon"] <= hi_lon:
            out.append(dict(item))
    return out


# ── Geofence store (SQLite) ───────────────────────────────────────────────────────
import json as _json  # noqa: E402  (kept local-ish to underline stdlib-only)

_GEO_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS geofence (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL DEFAULT '',
    polygon_json TEXT NOT NULL DEFAULT '[]',
    created_ts   INTEGER NOT NULL
);
"""


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create the geofence table if absent. Idempotent; never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(_GEO_SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _normalize_polygon(polygon: Any) -> list[list[float]]:
    """Coerce a polygon into ``[[lat, lon], ...]`` of floats, dropping bad rows."""
    out: list[list[float]] = []
    if not isinstance(polygon, (list, tuple)):
        return out
    for pt in polygon:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            continue
        lat = _coerce_float(pt[0])
        lon = _coerce_float(pt[1])
        if lat is None or lon is None:
            continue
        out.append([lat, lon])
    return out


def add_geofence(
    name: str, polygon: Any, *, db_path: Optional[str] = None
) -> Optional[str]:
    """Persist a geofence ``[[lat, lon], ...]`` and return its id (or None on
    error / a degenerate polygon of fewer than 3 valid vertices)."""
    pts = _normalize_polygon(polygon)
    if len(pts) < 3:
        return None
    fid = uuid.uuid4().hex
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO geofence (id, name, polygon_json, created_ts) VALUES (?,?,?,?)",
                (fid, str(name or ""), _json.dumps(pts), _now_ms()),
            )
            conn.commit()
            return fid
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def geofences(*, db_path: Optional[str] = None) -> list[dict]:
    """All stored geofences as ``[{id,name,polygon,created_ts}]`` (newest first)."""
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM geofence ORDER BY created_ts DESC, id DESC"
            ).fetchall()
            out: list[dict] = []
            for r in rows:
                try:
                    poly = _json.loads(r["polygon_json"])
                except (TypeError, ValueError):
                    poly = []
                out.append(
                    {
                        "id": r["id"],
                        "name": r["name"],
                        "polygon": poly,
                        "created_ts": r["created_ts"],
                    }
                )
            return out
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def _point_in_polygon(lat: float, lon: float, polygon: list) -> bool:
    """Ray-casting point-in-polygon test. ``polygon`` is ``[[lat, lon], ...]``.
    Treats the polygon as closed. False on a degenerate ring."""
    pts = _normalize_polygon(polygon)
    n = len(pts)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = pts[i][0], pts[i][1]  # lat, lon
        yj, xj = pts[j][0], pts[j][1]
        # does the horizontal ray at `lat` cross edge (j -> i)?
        intersects = ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_geofence(lat: Any, lon: Any, *, db_path: Optional[str] = None) -> list[dict]:
    """Return the stored geofences that *contain* ``(lat, lon)`` as
    ``[{id,name}]``. Empty list if the point is outside all / on bad input."""
    clat = _coerce_float(lat)
    clon = _coerce_float(lon)
    if clat is None or clon is None:
        return []
    out: list[dict] = []
    for f in geofences(db_path=db_path):
        try:
            if _point_in_polygon(clat, clon, f.get("polygon") or []):
                out.append({"id": f["id"], "name": f["name"]})
        except Exception:  # noqa: BLE001
            continue
    return out


# ── Map layers ────────────────────────────────────────────────────────────────────
_LAYER_CATALOG = [
    {"id": "entities", "label": "Ontology Entities", "kind": "points"},
    {"id": "seismic", "label": "Seismic (USGS)", "kind": "points"},
    {"id": "air_quality", "label": "Air Quality", "kind": "points"},
    {"id": "buoys", "label": "Ocean Buoys", "kind": "points"},
    {"id": "flight", "label": "Flight Tracks", "kind": "points"},
    {"id": "density", "label": "Entity Density", "kind": "heatmap"},
]


def layers() -> list[dict]:
    """Catalog of available map layers as ``[{id,label,kind}]``."""
    return [dict(layer) for layer in _LAYER_CATALOG]


def _feature(lat: float, lon: float, props: dict) -> dict:
    """GeoJSON Feature with [lon, lat] coordinates (GeoJSON axis order)."""
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def _empty_collection(layer_id: str, note: str) -> dict:
    return {
        "type": "FeatureCollection",
        "layer": layer_id,
        "features": [],
        "note": note,
    }


def _http_get(url: str, timeout: float = 12.0) -> Optional[bytes]:
    """GET a URL via stdlib urllib, returning raw bytes or ``None`` on any
    failure (offline / egress blocked / HTTP error). Never raises."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "jarvis-apex/geo"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed https URLs
            return resp.read()
    except Exception:  # noqa: BLE001 - any fetch failure → honest fallback
        return None


def _fetch_seismic(limit: int) -> Optional[list[dict]]:
    """Fetch live USGS earthquakes (M2.5+, past day) as GeoJSON Features.

    Returns a list of features on success, or ``None`` if the network call
    fails / egress is blocked / the payload is malformed — the caller then
    falls back to an honest empty collection. Never raises.
    """
    raw = _http_get(_USGS_SEISMIC_FEED)
    if raw is None:
        return None
    try:
        data = _json.loads(raw.decode("utf-8", "replace"))
    except (ValueError, TypeError):
        return None
    feats: list[dict] = []
    for f in (data.get("features") or [])[: max(0, limit)]:
        try:
            coords = (f.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            props = f.get("properties") or {}
            feats.append(
                _feature(
                    float(coords[1]),
                    float(coords[0]),
                    {
                        "id": f.get("id"),
                        "mag": props.get("mag"),
                        "place": props.get("place"),
                        "time": props.get("time"),
                        "depth_km": coords[2] if len(coords) > 2 else None,
                        "label": props.get("title") or props.get("place"),
                    },
                )
            )
        except (TypeError, ValueError):
            continue
    return feats


def _fetch_flight(limit: int) -> Optional[list[dict]]:
    """Fetch live aircraft states from the OpenSky Network (anonymous, keyless).

    The ``/states/all`` payload is ``{"states": [[icao24, callsign, origin,
    ..., lon(5), lat(6), ...]]}``. Returns Point features or ``None`` on failure.
    """
    raw = _http_get(_OPENSKY_FEED, timeout=14.0)
    if raw is None:
        return None
    try:
        data = _json.loads(raw.decode("utf-8", "replace"))
    except (ValueError, TypeError):
        return None
    feats: list[dict] = []
    for s in (data.get("states") or [])[: max(0, limit)]:
        try:
            lon, lat = s[5], s[6]
            if lon is None or lat is None:
                continue
            feats.append(
                _feature(
                    float(lat),
                    float(lon),
                    {
                        "id": (s[0] or "").strip(),
                        "label": (s[1] or "").strip() or (s[0] or "").strip(),
                        "origin_country": s[2],
                        "velocity_ms": s[9] if len(s) > 9 else None,
                        "baro_altitude_m": s[7] if len(s) > 7 else None,
                        "heading": s[10] if len(s) > 10 else None,
                    },
                )
            )
        except (TypeError, ValueError, IndexError):
            continue
    return feats


def _fetch_buoys(limit: int) -> Optional[list[dict]]:
    """Fetch NOAA NDBC latest buoy observations (keyless, whitespace-delimited).

    Header rows start with ``#``; columns include STN, LAT, LON, plus met/ocean
    measurements. Returns Point features or ``None`` on failure.
    """
    raw = _http_get(_NDBC_BUOY_FEED, timeout=14.0)
    if raw is None:
        return None
    try:
        text = raw.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None
    lines = [ln for ln in text.splitlines() if ln.strip()]
    header: list[str] = []
    for ln in lines:
        if ln.startswith("#"):
            # first '#' line is the column names (strip the leading '#')
            if not header:
                header = ln.lstrip("#").split()
            continue
        break
    if not header:
        return None
    try:
        i_stn = header.index("STN") if "STN" in header else 0
        i_lat = header.index("LAT")
        i_lon = header.index("LON")
    except ValueError:
        return None
    feats: list[dict] = []
    for ln in lines:
        if ln.startswith("#"):
            continue
        cols = ln.split()
        if len(cols) <= max(i_lat, i_lon):
            continue
        try:
            lat = float(cols[i_lat]); lon = float(cols[i_lon])
        except (TypeError, ValueError):
            continue
        feats.append(
            _feature(lat, lon, {
                "id": cols[i_stn] if i_stn < len(cols) else None,
                "label": f"buoy {cols[i_stn]}" if i_stn < len(cols) else "buoy",
            })
        )
        if len(feats) >= max(0, limit):
            break
    return feats


def _fetch_air(limit: int) -> Optional[list[dict]]:
    """Sample real air-quality (PM2.5 / US AQI) at a set of major cities via the
    keyless Open-Meteo Air-Quality API. Point-based, so we query a fixed city
    list. Returns Point features or ``None`` if every city query failed."""
    feats: list[dict] = []
    any_ok = False
    for name, lat, lon in _AQ_CITIES[: max(0, limit)]:
        url = (
            f"{_OPENMETEO_AQ}?latitude={lat}&longitude={lon}"
            "&current=pm2_5,pm10,us_aqi"
        )
        raw = _http_get(url, timeout=10.0)
        if raw is None:
            continue
        try:
            cur = (_json.loads(raw.decode("utf-8", "replace")).get("current") or {})
        except (ValueError, TypeError):
            continue
        any_ok = True
        feats.append(_feature(lat, lon, {
            "id": name, "label": name,
            "pm2_5": cur.get("pm2_5"), "pm10": cur.get("pm10"),
            "us_aqi": cur.get("us_aqi"),
        }))
    return feats if any_ok else None


def layer_features(
    layer_id: str, limit: int = 200, *, db_path: Optional[str] = None
) -> dict:
    """A GeoJSON-ish FeatureCollection for ``layer_id``.

      * ``entities`` — **real** points from :func:`objects_with_coords`.
      * ``density``  — heat grid **derived** from the entities layer.
      * ``seismic``  — **real** live USGS M2.5+/day feed (offline → honest empty).
      * ``air_quality`` / ``buoys`` / ``flight`` — no source wired into this
        stdlib module → an honest *empty* collection carrying
        ``{"note": "source not wired"}``. Never fabricated.

    Always returns a FeatureCollection dict; never raises."""
    try:
        lim = max(0, int(limit))
    except (TypeError, ValueError):
        lim = 200
    lid = str(layer_id or "")

    if lid == "entities":
        feats = [
            _feature(
                o["lat"],
                o["lon"],
                {
                    "id": o["id"],
                    "label": o["label"],
                    "type": o["type"],
                    "mark": o["mark"],
                },
            )
            for o in objects_with_coords(db_path=db_path)[:lim]
        ]
        return {
            "type": "FeatureCollection",
            "layer": lid,
            "features": feats,
            "source": "ontology",
        }

    if lid == "density":
        ents = objects_with_coords(db_path=db_path)
        feats = [_feature(e["lat"], e["lon"], {"id": e["id"]}) for e in ents]
        grid = density_grid(feats)
        cells = [
            _feature(c["lat"], c["lon"], {"count": c["count"]})
            for c in grid[:lim]
        ]
        return {
            "type": "FeatureCollection",
            "layer": lid,
            "features": cells,
            "source": "derived:entities",
        }

    # Live science layers — each fetches a real, keyless public feed. Network
    # is guarded inside the fetcher: a None result means the feed was
    # unreachable (offline / egress blocked), and we return an honest empty
    # collection naming the source rather than fabricating points.
    _LIVE = {
        "seismic": (_fetch_seismic, "usgs:2.5_day", "USGS"),
        "flight": (_fetch_flight, "opensky:states", "OpenSky"),
        "buoys": (_fetch_buoys, "noaa:ndbc", "NOAA NDBC"),
        "air_quality": (_fetch_air, "open-meteo:air-quality", "Open-Meteo"),
    }
    if lid in _LIVE:
        fetch, source, name = _LIVE[lid]
        feats = fetch(lim)
        if feats is None:
            return _empty_collection(lid, f"{name} feed unreachable (offline / egress blocked)")
        return {
            "type": "FeatureCollection",
            "layer": lid,
            "features": feats,
            "source": source,
        }

    if lid in _UNWIRED_LAYERS:
        return _empty_collection(lid, "source not wired")

    return _empty_collection(lid, "unknown layer")


def density_grid(features: Any, cells: int = 12) -> list[dict]:
    """Bin point features into a lat/lon heat grid → ``[{lat,lon,count}]`` where
    lat/lon is each populated cell's centre. Accepts a list of GeoJSON features
    (``geometry.coordinates=[lon,lat]``) or plain ``{lat,lon}`` dicts. [] if
    empty / on error."""
    try:
        n_cells = max(1, int(cells))
    except (TypeError, ValueError):
        n_cells = 12

    points: list[tuple[float, float]] = []
    for f in features or []:
        if not isinstance(f, dict):
            continue
        geom = f.get("geometry")
        if isinstance(geom, dict):
            coords = geom.get("coordinates")
            if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                lon = _coerce_float(coords[0])
                lat = _coerce_float(coords[1])
                if lat is not None and lon is not None:
                    points.append((lat, lon))
                    continue
        lat = _coerce_float(f.get("lat"))
        lon = _coerce_float(f.get("lon"))
        if lat is not None and lon is not None:
            points.append((lat, lon))

    if not points:
        return []

    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)
    span_lat = (max_lat - min_lat) or 1e-9
    span_lon = (max_lon - min_lon) or 1e-9

    bins: dict[tuple[int, int], int] = {}
    for lat, lon in points:
        gi = min(n_cells - 1, int((lat - min_lat) / span_lat * n_cells))
        gj = min(n_cells - 1, int((lon - min_lon) / span_lon * n_cells))
        bins[(gi, gj)] = bins.get((gi, gj), 0) + 1

    out: list[dict] = []
    for (gi, gj), count in bins.items():
        center_lat = min_lat + (gi + 0.5) / n_cells * span_lat
        center_lon = min_lon + (gj + 0.5) / n_cells * span_lon
        out.append(
            {"lat": round(center_lat, 6), "lon": round(center_lon, 6), "count": count}
        )
    out.sort(key=lambda c: c["count"], reverse=True)
    return out


# ── Movement tracks ───────────────────────────────────────────────────────────────
def _coerce_track_point(pt: Any) -> Optional[dict]:
    """Normalise one position sample into ``{t,lat,lon}`` (or None)."""
    if isinstance(pt, dict):
        lower = {str(k).lower(): v for k, v in pt.items()}
        lat = None
        lon = None
        for k in _LAT_KEYS:
            if k in lower:
                lat = _coerce_float(lower[k])
                if lat is not None:
                    break
        for k in _LON_KEYS:
            if k in lower:
                lon = _coerce_float(lower[k])
                if lon is not None:
                    break
        if lat is None or lon is None:
            return None
        t = lower.get("t", lower.get("time", lower.get("ts", lower.get("timestamp"))))
        return {"t": t, "lat": lat, "lon": lon}
    if isinstance(pt, (list, tuple)) and len(pt) >= 2:
        # accept [t, lat, lon] or [lat, lon]
        if len(pt) >= 3:
            t = pt[0]
            lat = _coerce_float(pt[1])
            lon = _coerce_float(pt[2])
        else:
            t = None
            lat = _coerce_float(pt[0])
            lon = _coerce_float(pt[1])
        if lat is None or lon is None:
            return None
        return {"t": t, "lat": lat, "lon": lon}
    return None


def tracks(object_id: str, *, db_path: Optional[str] = None) -> list[dict]:
    """Ordered movement track for an object as ``[{t,lat,lon}]``.

    Looks for a ``track`` / ``positions`` / ``history`` array (or a History-Lake
    ``position`` series) inside the object's props. Returns [] if the object has
    no usable position series. Ordered by ``t`` when timestamps are present."""
    if not object_id:
        return []
    try:
        obj = ontology_store.get_object(object_id, db_path=db_path)
    except Exception:  # noqa: BLE001
        return []
    if not obj:
        return []
    props = obj.get("props")
    if not isinstance(props, dict):
        return []

    series: Any = None
    for key in ("track", "positions", "history", "position_series", "path"):
        candidate = props.get(key)
        if isinstance(candidate, list) and candidate:
            series = candidate
            break
    if series is None:
        return []

    out: list[dict] = []
    for pt in series:
        norm = _coerce_track_point(pt)
        if norm:
            out.append(norm)

    # stable sort by timestamp when all points carry a comparable one.
    if out and all(p["t"] is not None for p in out):
        try:
            out.sort(key=lambda p: p["t"])
        except TypeError:
            pass
    return out


# Bootstrap the default geofence DB on import (guarded), mirroring ontology_store.
init_db()
