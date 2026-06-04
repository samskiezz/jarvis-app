"""Real geodesy & GIS simulations.

Each function is a distinct, named geodetic method (not a shared engine reused),
implemented with numpy/math and verified against a KNOWN published or analytically
exact value in the companion tests. Domains: spherical & ellipsoidal distance,
satellite/GPS trilateration, map projections (Mercator, UTM), navigation
(bearing/azimuth, cross-track error), and Earth-centered coordinate systems (ECEF).

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_geodesy.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── WGS84 reference ellipsoid constants ───────────────────────────────────────
WGS84_A = 6378137.0                  # semi-major axis, m
WGS84_F = 1.0 / 298.257223563        # flattening
WGS84_B = WGS84_A * (1.0 - WGS84_F)  # semi-minor axis, m
WGS84_E2 = WGS84_F * (2.0 - WGS84_F) # first eccentricity squared
EARTH_R_MEAN = 6371008.8             # IUGG mean (authalic-ish) radius, m
EARTH_R_KM = 6371.0088               # mean radius, km


# ── 1. Haversine great-circle distance (spherical) ────────────────────────────
def haversine_distance(lat1_deg: float, lon1_deg: float,
                       lat2_deg: float, lon2_deg: float,
                       *, radius_km: float = EARTH_R_KM) -> dict:
    """Great-circle distance on a sphere via the haversine formula:
        a = sin^2(dphi/2) + cos(phi1)cos(phi2) sin^2(dlambda/2)
        c = 2*atan2(sqrt(a), sqrt(1-a));  d = R*c
    KNOWN: New York (40.7128,-74.0060) -> London (51.5074,-0.1278) ~= 5570 km.

    Ref: Haversine formula (Wikipedia); R_mean = 6371.0088 km.
    """
    phi1, phi2 = math.radians(lat1_deg), math.radians(lat2_deg)
    dphi = math.radians(lat2_deg - lat1_deg)
    dlmb = math.radians(lon2_deg - lon1_deg)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    dist_km = radius_km * c
    return {
        "central_angle_rad": c,
        "central_angle_deg": math.degrees(c),
        "distance_km": dist_km,
        "distance_m": dist_km * 1000.0,
        "radius_km": radius_km,
    }


# ── 2. Vincenty inverse ellipsoidal distance (WGS84) ──────────────────────────
def vincenty_distance(lat1_deg: float, lon1_deg: float,
                      lat2_deg: float, lon2_deg: float,
                      *, a: float = WGS84_A, f: float = WGS84_F,
                      tol: float = 1e-12, max_iter: int = 200) -> dict:
    """Vincenty inverse solution for the geodesic distance on an oblate ellipsoid.
    Iterates lambda to convergence; accurate to ~0.5 mm on WGS84.
    KNOWN: more accurate than the spherical haversine; reproduces published
    ellipsoidal distances (e.g. NYC->London ~= 5575 km, a few km from haversine).

    Ref: Vincenty (1975); WGS84 a=6378137 m, f=1/298.257223563.
    """
    b = (1.0 - f) * a
    phi1, phi2 = math.radians(lat1_deg), math.radians(lat2_deg)
    L = math.radians(lon2_deg - lon1_deg)
    U1 = math.atan((1.0 - f) * math.tan(phi1))
    U2 = math.atan((1.0 - f) * math.tan(phi2))
    sinU1, cosU1 = math.sin(U1), math.cos(U1)
    sinU2, cosU2 = math.sin(U2), math.cos(U2)

    lam = L
    converged = False
    sin_sigma = cos_sigma = sigma = cos2_alpha = cos2_sigma_m = 0.0
    for _ in range(max_iter):
        sin_lam, cos_lam = math.sin(lam), math.cos(lam)
        sin_sigma = math.sqrt((cosU2 * sin_lam) ** 2 +
                              (cosU1 * sinU2 - sinU1 * cosU2 * cos_lam) ** 2)
        if sin_sigma == 0.0:
            # coincident points
            return {
                "distance_m": 0.0, "distance_km": 0.0,
                "iterations": 0, "converged": True,
                "semi_major_m": a, "flattening": f,
            }
        cos_sigma = sinU1 * sinU2 + cosU1 * cosU2 * cos_lam
        sigma = math.atan2(sin_sigma, cos_sigma)
        sin_alpha = cosU1 * cosU2 * sin_lam / sin_sigma
        cos2_alpha = 1.0 - sin_alpha ** 2
        cos2_sigma_m = (cos_sigma - 2.0 * sinU1 * sinU2 / cos2_alpha
                        if cos2_alpha != 0.0 else 0.0)  # equatorial line: =0
        C = f / 16.0 * cos2_alpha * (4.0 + f * (4.0 - 3.0 * cos2_alpha))
        lam_prev = lam
        lam = L + (1.0 - C) * f * sin_alpha * (
            sigma + C * sin_sigma * (cos2_sigma_m + C * cos_sigma *
                                     (-1.0 + 2.0 * cos2_sigma_m ** 2)))
        if abs(lam - lam_prev) < tol:
            converged = True
            break

    u2 = cos2_alpha * (a ** 2 - b ** 2) / (b ** 2)
    A = 1.0 + u2 / 16384.0 * (4096.0 + u2 * (-768.0 + u2 * (320.0 - 175.0 * u2)))
    B = u2 / 1024.0 * (256.0 + u2 * (-128.0 + u2 * (74.0 - 47.0 * u2)))
    delta_sigma = B * sin_sigma * (cos2_sigma_m + B / 4.0 * (
        cos_sigma * (-1.0 + 2.0 * cos2_sigma_m ** 2) -
        B / 6.0 * cos2_sigma_m * (-3.0 + 4.0 * sin_sigma ** 2) *
        (-3.0 + 4.0 * cos2_sigma_m ** 2)))
    s = b * A * (sigma - delta_sigma)
    return {
        "distance_m": s,
        "distance_km": s / 1000.0,
        "converged": converged,
        "semi_major_m": a,
        "flattening": f,
    }


# ── 3. GPS trilateration from 3+ ranges ───────────────────────────────────────
def trilateration(anchors: list, ranges: list) -> dict:
    """Recover an unknown position from >=3 anchor points and measured ranges.
    Subtracting one (linearizing) sphere equation from the others removes the
    quadratic term, giving a linear least-squares system A x = b solved with
    numpy. Works in 2-D or 3-D.
    KNOWN: with exact ranges to known anchors it recovers the true position.

    Ref: GPS/GNSS pseudorange trilateration; linearized least squares.
    """
    P = np.asarray(anchors, dtype=float)
    r = np.asarray(ranges, dtype=float)
    n, dim = P.shape
    if n < dim + 1:
        raise ValueError("need at least dim+1 anchors for trilateration")
    # Linearize by subtracting the first equation:
    #   |x-Pi|^2 - |x-P0|^2 = ri^2 - r0^2
    #   2(Pi-P0).x = ri^2 - r0^2 - (Pi.Pi - P0.P0) ... rearranged below
    p0 = P[0]
    A = 2.0 * (P[1:] - p0)
    b = (r[0] ** 2 - r[1:] ** 2
         - (np.sum(p0 ** 2)) + np.sum(P[1:] ** 2, axis=1))
    sol, residuals, rank, _ = np.linalg.lstsq(A, b, rcond=None)
    # residual range error at the solution
    range_err = np.sqrt(np.sum((P - sol) ** 2, axis=1)) - r
    return {
        "position": sol.tolist(),
        "dim": dim,
        "n_anchors": n,
        "rank": int(rank),
        "max_range_residual_m": float(np.max(np.abs(range_err))),
        "rms_range_residual_m": float(np.sqrt(np.mean(range_err ** 2))),
    }


# ── 4. Mercator projection ────────────────────────────────────────────────────
def mercator_projection(lat_deg: float, lon_deg: float,
                        *, radius: float = WGS84_A, lon0_deg: float = 0.0) -> dict:
    """Spherical Mercator forward projection:
        x = R*(lambda - lambda0),   y = R*ln(tan(pi/4 + phi/2))
    Conformal; y diverges toward the poles. Inverse recovers lat/lon.
    KNOWN: the equator maps to y=0; on a unit sphere the prime meridian maps to
    x=0; the projection is the standard "Web Mercator" form.

    Ref: Mercator projection (Wikipedia); Snyder, USGS Prof. Paper 1395.
    """
    phi = math.radians(lat_deg)
    x = radius * math.radians(lon_deg - lon0_deg)
    y = radius * math.log(math.tan(math.pi / 4.0 + phi / 2.0))
    # inverse round-trip
    lat_back = math.degrees(2.0 * math.atan(math.exp(y / radius)) - math.pi / 2.0)
    lon_back = math.degrees(x / radius) + lon0_deg
    return {
        "x": x,
        "y": y,
        "radius": radius,
        "lat_roundtrip_deg": lat_back,
        "lon_roundtrip_deg": lon_back,
    }


# ── 5. UTM zone computation ───────────────────────────────────────────────────
def utm_zone(lon_deg: float, lat_deg: float = 0.0) -> dict:
    """UTM longitudinal zone number and hemisphere band.
        zone = floor((lon + 180)/6) + 1   (1..60), each 6 deg wide.
    Handles the Norway (zone 32) and Svalbard exceptions.
    KNOWN: lon=3 deg E -> zone 31; San Francisco (-122.42) -> zone 10;
    Tokyo (139.69) -> zone 54.

    Ref: Universal Transverse Mercator coordinate system (Wikipedia).
    """
    # normalize longitude into [-180, 180)
    lon = ((lon_deg + 180.0) % 360.0) - 180.0
    zone = int(math.floor((lon + 180.0) / 6.0)) + 1
    # Norway: 56-64N, 3-12E -> zone 32
    if 56.0 <= lat_deg < 64.0 and 3.0 <= lon < 12.0:
        zone = 32
    # Svalbard exceptions: 72-84N
    if 72.0 <= lat_deg < 84.0:
        if 0.0 <= lon < 9.0:
            zone = 31
        elif 9.0 <= lon < 21.0:
            zone = 33
        elif 21.0 <= lon < 33.0:
            zone = 35
        elif 33.0 <= lon < 42.0:
            zone = 37
    hemisphere = "N" if lat_deg >= 0.0 else "S"
    central_meridian = (zone - 1) * 6 - 180 + 3
    return {
        "zone": zone,
        "hemisphere": hemisphere,
        "central_meridian_deg": central_meridian,
        "lon_deg": lon,
    }


# ── 6. Bearing / azimuth between two points ───────────────────────────────────
def initial_bearing(lat1_deg: float, lon1_deg: float,
                    lat2_deg: float, lon2_deg: float) -> dict:
    """Initial (forward) great-circle bearing/azimuth from point 1 to point 2:
        theta = atan2(sin(dlon)cos(phi2),
                      cos(phi1)sin(phi2) - sin(phi1)cos(phi2)cos(dlon))
    Reported as a compass azimuth in [0, 360).
    KNOWN: due-east along the equator -> 90 deg; due-north (same lon) -> 0 deg.

    Ref: Bearing formula, Movable Type "lat/long" scripts.
    """
    phi1, phi2 = math.radians(lat1_deg), math.radians(lat2_deg)
    dlmb = math.radians(lon2_deg - lon1_deg)
    y = math.sin(dlmb) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlmb)
    theta = math.atan2(y, x)
    bearing_deg = (math.degrees(theta) + 360.0) % 360.0
    return {
        "bearing_deg": bearing_deg,
        "bearing_rad": math.radians(bearing_deg),
    }


# ── 7. Cross-track distance to a great circle ─────────────────────────────────
def cross_track_distance(lat1_deg: float, lon1_deg: float,
                         lat2_deg: float, lon2_deg: float,
                         lat3_deg: float, lon3_deg: float,
                         *, radius_km: float = EARTH_R_KM) -> dict:
    """Signed perpendicular ("cross-track") distance of point 3 from the
    great-circle path defined by points 1->2:
        dxt = asin(sin(d13)*sin(theta13 - theta12)) * R
    where d13 is the angular distance 1->3 and the thetas are bearings.
    KNOWN: a point lying on the path has cross-track distance ~0; sign gives
    the side of the track.

    Ref: Cross-track distance, Movable Type "lat/long" scripts.
    """
    d13 = haversine_distance(lat1_deg, lon1_deg, lat3_deg, lon3_deg,
                             radius_km=radius_km)["central_angle_rad"]
    theta13 = initial_bearing(lat1_deg, lon1_deg, lat3_deg, lon3_deg)["bearing_rad"]
    theta12 = initial_bearing(lat1_deg, lon1_deg, lat2_deg, lon2_deg)["bearing_rad"]
    dxt_ang = math.asin(math.sin(d13) * math.sin(theta13 - theta12))
    dxt_km = dxt_ang * radius_km
    # along-track distance from point 1 to the foot of the perpendicular
    dat_ang = math.acos(max(-1.0, min(1.0, math.cos(d13) / math.cos(dxt_ang))))
    return {
        "cross_track_km": dxt_km,
        "cross_track_m": dxt_km * 1000.0,
        "along_track_km": dat_ang * radius_km,
        "radius_km": radius_km,
    }


# ── 8. Geodetic <-> ECEF coordinate conversion ────────────────────────────────
def geodetic_to_ecef(lat_deg: float, lon_deg: float, h_m: float = 0.0,
                     *, a: float = WGS84_A, e2: float = WGS84_E2) -> dict:
    """Geodetic (lat, lon, height) -> Earth-Centered Earth-Fixed (X, Y, Z) on
    WGS84, plus a closed-form inverse (Bowring/Ferrari style) for the round-trip:
        N = a / sqrt(1 - e^2 sin^2(phi))
        X = (N+h) cos(phi) cos(lambda)
        Y = (N+h) cos(phi) sin(lambda)
        Z = (N(1-e^2)+h) sin(phi)
    KNOWN: (0 deg, 0 deg, 0 m) -> (a, 0, 0) = (6378137, 0, 0); the North Pole
    (90 deg) -> Z = b = 6356752.3 m.

    Ref: WGS84 geodetic<->ECEF (Wikipedia / NIMA TR8350.2).
    """
    phi, lmb = math.radians(lat_deg), math.radians(lon_deg)
    sin_phi, cos_phi = math.sin(phi), math.cos(phi)
    N = a / math.sqrt(1.0 - e2 * sin_phi ** 2)
    X = (N + h_m) * cos_phi * math.cos(lmb)
    Y = (N + h_m) * cos_phi * math.sin(lmb)
    Z = (N * (1.0 - e2) + h_m) * sin_phi

    # closed-form inverse (Bowring) for the round-trip
    b = a * math.sqrt(1.0 - e2)
    ep2 = (a ** 2 - b ** 2) / b ** 2
    p = math.sqrt(X ** 2 + Y ** 2)
    if p == 0.0:
        lat_b = math.copysign(90.0, Z)
        lon_b = 0.0
        h_b = abs(Z) - b
    else:
        theta = math.atan2(Z * a, p * b)
        lon_b = math.degrees(math.atan2(Y, X))
        lat_rad = math.atan2(Z + ep2 * b * math.sin(theta) ** 3,
                             p - e2 * a * math.cos(theta) ** 3)
        N_b = a / math.sqrt(1.0 - e2 * math.sin(lat_rad) ** 2)
        h_b = p / math.cos(lat_rad) - N_b
        lat_b = math.degrees(lat_rad)
    return {
        "x_m": X,
        "y_m": Y,
        "z_m": Z,
        "prime_vertical_radius_m": N,
        "lat_roundtrip_deg": lat_b,
        "lon_roundtrip_deg": lon_b,
        "h_roundtrip_m": h_b,
        "semi_minor_m": b,
    }
