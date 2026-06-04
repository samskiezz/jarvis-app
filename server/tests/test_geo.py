"""GEOSPATIAL service tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used via env (ONTOLOGY_DB for the
ontology store, GEO_DB for the geofence store) so the real on-disk stores are
never touched. Run:

    python3 -m pytest server/tests/test_geo.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def geo(tmp_path, monkeypatch):
    """Reload ontology_store + geo against fresh temp DBs for each test."""
    ont_db = tmp_path / "test_ontology.db"
    geo_db = tmp_path / "test_geo.db"
    monkeypatch.setenv("ONTOLOGY_DB", str(ont_db))
    monkeypatch.setenv("GEO_DB", str(geo_db))

    from server.services import ontology_store as os_store

    importlib.reload(os_store)
    os_store.init_db()

    from server.services import geo as geo_svc

    importlib.reload(geo_svc)  # picks up the reloaded ontology_store + GEO_DB
    geo_svc.init_db()
    return geo_svc


def _seed_object(geo, **props):
    """Insert one ontology object with the given props and return its id."""
    from server.services import ontology_store as os_store

    obj = os_store.upsert_object(
        {"id": props.pop("id", "geo-1"), "type": "asset", "label": "Sydney HQ", "props": props}
    )
    assert obj is not None
    return obj["id"]


# ── Distance ─────────────────────────────────────────────────────────────────────
def test_haversine_zero_and_known(geo):
    assert geo.haversine_km(0, 0, 0, 0) == 0.0
    # Sydney -> Melbourne is roughly 700 km.
    d = geo.haversine_km(-33.87, 151.21, -37.81, 144.96)
    assert 680 < d < 730


def test_haversine_never_raises_on_bad_input(geo):
    assert geo.haversine_km("x", None, [], {}) == 0.0


# ── Coordinate extraction ─────────────────────────────────────────────────────────
def test_objects_with_coords_returns_seeded(geo):
    oid = _seed_object(geo, lat=-33.8688, lon=151.2093)
    items = geo.objects_with_coords()
    assert any(it["id"] == oid for it in items)
    me = next(it for it in items if it["id"] == oid)
    assert me["lat"] == pytest.approx(-33.8688)
    assert me["lon"] == pytest.approx(151.2093)
    assert me["label"] == "Sydney HQ"
    assert me["type"] == "asset"


def test_objects_without_coords_skipped(geo):
    _seed_object(geo, id="no-coords", note="no location here")
    items = geo.objects_with_coords()
    assert all(it["id"] != "no-coords" for it in items)


# ── Spatial queries ───────────────────────────────────────────────────────────────
def test_radius_query_includes_and_excludes(geo):
    near = _seed_object(geo, id="near", lat=-33.8688, lon=151.2093)
    _seed_object(geo, id="far", lat=40.7128, lon=-74.0060)  # NYC
    hits = geo.radius_query(-33.87, 151.21, 50.0)
    ids = [h["id"] for h in hits]
    assert near in ids
    assert "far" not in ids
    # distance present and sorted ascending
    dists = [h["distance_km"] for h in hits]
    assert dists == sorted(dists)


def test_bbox_query(geo):
    inside = _seed_object(geo, id="inside", lat=-33.8, lon=151.2)
    _seed_object(geo, id="outside", lat=10.0, lon=10.0)
    hits = geo.bbox_query(-34.0, 150.0, -33.0, 152.0)
    ids = [h["id"] for h in hits]
    assert inside in ids
    assert "outside" not in ids


def test_spatial_queries_bad_input_empty(geo):
    assert geo.radius_query("x", None, "y") == []
    assert geo.bbox_query(None, None, None, None) == []


# ── Geofences ─────────────────────────────────────────────────────────────────────
SQUARE = [[0.0, 0.0], [0.0, 10.0], [10.0, 10.0], [10.0, 0.0]]


def test_add_geofence_and_contains(geo):
    fid = geo.add_geofence("box", SQUARE)
    assert fid
    assert any(f["id"] == fid for f in geo.geofences())

    inside = geo.point_in_geofence(5.0, 5.0)
    assert any(f["id"] == fid for f in inside)

    outside = geo.point_in_geofence(50.0, 50.0)
    assert all(f["id"] != fid for f in outside)


def test_add_geofence_rejects_degenerate(geo):
    assert geo.add_geofence("line", [[0, 0], [1, 1]]) is None
    assert geo.add_geofence("junk", "not-a-polygon") is None


# ── Layers / features / density ────────────────────────────────────────────────────
def test_layers_non_empty(geo):
    cat = geo.layers()
    assert cat
    ids = {layer["id"] for layer in cat}
    assert "entities" in ids
    for layer in cat:
        assert {"id", "label", "kind"} <= set(layer)


def test_entities_layer_is_real(geo):
    _seed_object(geo, id="pt", lat=-33.8688, lon=151.2093)
    fc = geo.layer_features("entities")
    assert fc["type"] == "FeatureCollection"
    assert fc.get("source") == "ontology"
    assert len(fc["features"]) >= 1
    feat = fc["features"][0]
    assert feat["geometry"]["type"] == "Point"
    # GeoJSON axis order [lon, lat]
    assert len(feat["geometry"]["coordinates"]) == 2


def test_unknown_layer_is_honest_empty(geo):
    fc = geo.layer_features("does_not_exist")
    assert fc["features"] == []
    assert fc.get("note") == "unknown layer"


def test_live_science_layers_are_real_or_honest_offline(geo, monkeypatch):
    # The four science layers (seismic/flight/buoys/air_quality) fetch real,
    # keyless public feeds. Each is network-guarded: force the fetch to fail
    # (offline-safe, deterministic) → honest empty collection naming the source,
    # never fabricated points; force success → features flow through with a
    # real `source` tag.
    cases = {
        "seismic": ("_fetch_seismic", "usgs:2.5_day", "USGS"),
        "flight": ("_fetch_flight", "opensky:states", "OpenSky"),
        "buoys": ("_fetch_buoys", "noaa:ndbc", "NOAA"),
        "air_quality": ("_fetch_air", "open-meteo:air-quality", "Open-Meteo"),
    }
    for lid, (fn, source, name) in cases.items():
        monkeypatch.setattr(geo, fn, lambda limit: None)
        fc = geo.layer_features(lid)
        assert fc["features"] == []
        assert name.split()[0] in (fc.get("note") or "")

        sample = [geo._feature(35.0, -118.0, {"id": "x", "label": "test"})]
        monkeypatch.setattr(geo, fn, lambda limit, _s=sample: _s)
        fc2 = geo.layer_features(lid)
        assert fc2.get("source") == source
        assert len(fc2["features"]) == 1


def test_density_grid(geo):
    feats = [
        {"lat": 0.0, "lon": 0.0},
        {"lat": 0.1, "lon": 0.1},
        {"lat": 10.0, "lon": 10.0},
    ]
    grid = geo.density_grid(feats, cells=4)
    assert grid
    assert sum(c["count"] for c in grid) == 3
    for c in grid:
        assert {"lat", "lon", "count"} <= set(c)


def test_density_grid_empty(geo):
    assert geo.density_grid([]) == []


# ── Tracks ─────────────────────────────────────────────────────────────────────────
def test_tracks_from_props(geo):
    _seed_object(
        geo,
        id="mover",
        track=[
            {"t": 2, "lat": 1.0, "lon": 1.0},
            {"t": 1, "lat": 0.0, "lon": 0.0},
        ],
    )
    pts = geo.tracks("mover")
    assert len(pts) == 2
    # ordered by timestamp ascending
    assert [p["t"] for p in pts] == [1, 2]


def test_tracks_missing_object(geo):
    assert geo.tracks("nope") == []
    assert geo.tracks("") == []
