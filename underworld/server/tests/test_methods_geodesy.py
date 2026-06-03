"""Each geodesy/GIS method must reproduce its KNOWN published or analytically
exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_geodesy import (
    WGS84_A,
    WGS84_B,
    cross_track_distance,
    geodetic_to_ecef,
    haversine_distance,
    initial_bearing,
    mercator_projection,
    trilateration,
    utm_zone,
    vincenty_distance,
)

# Standard test coordinates (decimal degrees).
NYC = (40.7128, -74.0060)
LONDON = (51.5074, -0.1278)


# 1. Haversine great-circle — KNOWN: NYC -> London ~= 5570 km.
#    Ref: Haversine formula (Wikipedia); R_mean = 6371.0088 km.
def test_haversine_nyc_london_5570km():
    r = haversine_distance(*NYC, *LONDON)
    assert abs(r["distance_km"] - 5570.0) < 15.0       # ~5570 km
    # symmetric
    rev = haversine_distance(*LONDON, *NYC)
    assert abs(r["distance_km"] - rev["distance_km"]) < 1e-6
    # zero distance for coincident points
    assert haversine_distance(*NYC, *NYC)["distance_km"] < 1e-9


# 2. Vincenty ellipsoidal — KNOWN: more accurate than haversine; ellipsoidal
#    NYC -> London ~= 5585 km (a few km from the spherical value), converges.
#    Ref: Vincenty (1975); WGS84.
def test_vincenty_more_accurate_than_haversine():
    v = vincenty_distance(*NYC, *LONDON)
    h = haversine_distance(*NYC, *LONDON)
    assert v["converged"]
    assert abs(v["distance_km"] - 5585.0) < 15.0       # ellipsoidal value
    # the two models differ by a small but nonzero ellipsoidal correction
    diff = abs(v["distance_km"] - h["distance_km"])
    assert 1.0 < diff < 40.0
    # coincident points -> 0
    assert vincenty_distance(*NYC, *NYC)["distance_m"] < 1e-6


# 3. GPS trilateration — KNOWN: exact ranges to known anchors recover the
#    true 3-D position to numerical precision.
#    Ref: GNSS pseudorange trilateration; linearized least squares.
def test_trilateration_recovers_known_position():
    anchors = [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0],
               [0.0, 10.0, 0.0], [0.0, 0.0, 10.0]]
    true = [1.0, 2.0, 3.0]
    ranges = [math.dist(a, true) for a in anchors]
    r = trilateration(anchors, ranges)
    for got, want in zip(r["position"], true):
        assert abs(got - want) < 1e-6
    assert r["max_range_residual_m"] < 1e-6
    # 2-D case
    anchors2 = [[0.0, 0.0], [6.0, 0.0], [0.0, 8.0]]
    true2 = [2.0, 3.0]
    ranges2 = [math.dist(a, true2) for a in anchors2]
    r2 = trilateration(anchors2, ranges2)
    assert abs(r2["position"][0] - 2.0) < 1e-6
    assert abs(r2["position"][1] - 3.0) < 1e-6


# 4. Mercator projection — KNOWN: equator maps to y=0; prime meridian to x=0;
#    forward/inverse round-trip is exact.
#    Ref: Mercator projection (Snyder, USGS PP 1395).
def test_mercator_equator_and_roundtrip():
    eq = mercator_projection(0.0, 0.0)
    assert abs(eq["y"]) < 1e-6                          # equator -> y=0
    assert abs(eq["x"]) < 1e-9                          # prime meridian -> x=0
    m = mercator_projection(45.0, 30.0)
    assert abs(m["lat_roundtrip_deg"] - 45.0) < 1e-9
    assert abs(m["lon_roundtrip_deg"] - 30.0) < 1e-9
    # y grows with latitude (conformal stretch toward poles)
    assert mercator_projection(60.0, 0.0)["y"] > mercator_projection(30.0, 0.0)["y"]


# 5. UTM zone — KNOWN: 3 deg E -> zone 31; San Francisco (-122.42) -> 10;
#    Tokyo (139.69) -> 54; Paris (2.35) -> 31.
#    Ref: Universal Transverse Mercator (Wikipedia).
def test_utm_zone_known_longitudes():
    assert utm_zone(3.0)["zone"] == 31
    assert utm_zone(-122.4194)["zone"] == 10           # San Francisco
    assert utm_zone(139.6917)["zone"] == 54            # Tokyo
    assert utm_zone(2.3522)["zone"] == 31              # Paris
    # central meridian of zone 31 is +3 deg
    assert utm_zone(3.0)["central_meridian_deg"] == 3
    # hemisphere band
    assert utm_zone(0.0, 45.0)["hemisphere"] == "N"
    assert utm_zone(0.0, -45.0)["hemisphere"] == "S"


# 6. Bearing/azimuth — KNOWN: due-east along equator -> 90 deg;
#    due-north (same longitude) -> 0 deg.
#    Ref: forward bearing formula (Movable Type scripts).
def test_bearing_cardinal_directions():
    assert abs(initial_bearing(0.0, 0.0, 0.0, 10.0)["bearing_deg"] - 90.0) < 1e-6
    assert abs(initial_bearing(0.0, 0.0, 10.0, 0.0)["bearing_deg"] - 0.0) < 1e-6
    assert abs(initial_bearing(0.0, 0.0, -10.0, 0.0)["bearing_deg"] - 180.0) < 1e-6
    assert abs(initial_bearing(0.0, 0.0, 0.0, -10.0)["bearing_deg"] - 270.0) < 1e-6


# 7. Cross-track distance — KNOWN: a point on the great-circle path has
#    cross-track ~0; an off-path point gives a nonzero signed distance whose
#    magnitude ~= its latitude offset along a near-equatorial path.
#    Ref: cross-track distance (Movable Type scripts).
def test_cross_track_on_and_off_path():
    # path along the equator from (0,0) to (0,10); point on the path at (0,5)
    on = cross_track_distance(0.0, 0.0, 0.0, 10.0, 0.0, 5.0)
    assert abs(on["cross_track_km"]) < 1e-6
    # point 1 deg north of the equatorial path: |dxt| ~= 1 deg of latitude ~111 km
    off = cross_track_distance(0.0, 0.0, 0.0, 10.0, 1.0, 5.0)
    assert abs(abs(off["cross_track_km"]) - 111.0) < 2.0
    # opposite side flips the sign
    off_s = cross_track_distance(0.0, 0.0, 0.0, 10.0, -1.0, 5.0)
    assert off["cross_track_km"] * off_s["cross_track_km"] < 0.0


# 8. Geodetic <-> ECEF — KNOWN: (0,0,0) -> (a,0,0)=(6378137,0,0);
#    North Pole -> Z = b = 6356752.3 m; round-trip is exact.
#    Ref: WGS84 geodetic<->ECEF (NIMA TR8350.2).
def test_geodetic_ecef_known_points_and_roundtrip():
    o = geodetic_to_ecef(0.0, 0.0, 0.0)
    assert abs(o["x_m"] - WGS84_A) < 1e-3              # X = a at equator/prime mer.
    assert abs(o["y_m"]) < 1e-6
    assert abs(o["z_m"]) < 1e-6
    pole = geodetic_to_ecef(90.0, 0.0, 0.0)
    assert abs(pole["z_m"] - WGS84_B) < 1e-3           # Z = b at the pole
    # round-trip a generic point (Paris-ish, with altitude)
    rt = geodetic_to_ecef(48.8566, 2.3522, 35.0)
    assert abs(rt["lat_roundtrip_deg"] - 48.8566) < 1e-7
    assert abs(rt["lon_roundtrip_deg"] - 2.3522) < 1e-7
    assert abs(rt["h_roundtrip_m"] - 35.0) < 1e-4
