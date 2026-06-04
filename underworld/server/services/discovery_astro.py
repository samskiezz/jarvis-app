"""Track real celestial bodies + meteoroids. Planet positions come from astropy's
ephemeris (genuine astronomy); meteoroid/asteroid orbits are propagated with real
Keplerian two-body mechanics and screened for Earth close-approaches (the actual
method NEO-tracking pipelines use at the two-body level).
"""
from __future__ import annotations

import math

import numpy as np

PLANETS = ("mercury", "venus", "mars", "jupiter", "saturn")
# a few real bright stars (J2000 RA/Dec degrees) — a minimal catalogue
BRIGHT_STARS = {
    "Sirius": (101.287, -16.716), "Canopus": (95.988, -52.696),
    "Arcturus": (213.915, 19.182), "Vega": (279.234, 38.784),
    "Betelgeuse": (88.793, 7.407), "Rigel": (78.634, -8.202),
    "Polaris": (37.954, 89.264),
}


def track_planets(when: str = "2026-06-03 22:00:00") -> dict:
    """Real RA/Dec + Earth distance (AU) of the planets at a given UTC time."""
    from astropy.time import Time
    from astropy.coordinates import get_body, solar_system_ephemeris
    t = Time(when)
    out = {}
    with solar_system_ephemeris.set("builtin"):
        for p in PLANETS:
            body = get_body(p, t)
            out[p] = {"ra_deg": round(float(body.ra.deg), 4),
                      "dec_deg": round(float(body.dec.deg), 4),
                      "distance_au": round(float(body.distance.au), 5)}
    return {"time": when, "planets": out}


def track_stars() -> dict:
    """Catalogue positions of bright stars (J2000)."""
    return {"stars": {n: {"ra_deg": ra, "dec_deg": dec}
                      for n, (ra, dec) in BRIGHT_STARS.items()}}


def propagate_orbit(*, a: float, e: float, steps: int = 360) -> dict:
    """Propagate a Keplerian orbit (semi-major axis a in AU, eccentricity e) one
    full period, solving Kepler's equation each step. Returns perihelion/aphelion
    and whether it's an Earth-crossing orbit (a real NEO classification)."""
    rs = []
    for k in range(steps):
        M = 2 * math.pi * k / steps                    # mean anomaly
        E = M
        for _ in range(50):                            # Newton solve Kepler's eqn
            E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        r = a * (1 - e * math.cos(E))                  # heliocentric distance (AU)
        rs.append(r)
    peri, aph = min(rs), max(rs)
    return {
        "semi_major_axis_au": a, "eccentricity": e,
        "perihelion_au": round(peri, 5), "aphelion_au": round(aph, 5),
        "earth_crossing": peri <= 1.0 <= aph,          # crosses 1 AU => NEO
        "period_years": round(a ** 1.5, 4),            # Kepler's third law
    }


def meteor_close_approach(*, a: float, e: float, n_samples: int = 720) -> dict:
    """Minimum distance between a meteoroid's orbit and Earth's (≈circular, 1 AU)
    — a two-body MOID estimate, the screen real surveys use to flag impactors."""
    earth_r = 1.0
    min_d = 1e9
    for k in range(n_samples):
        nu = 2 * math.pi * k / n_samples               # true anomaly
        r = a * (1 - e * e) / (1 + e * math.cos(nu))
        # distance in-plane between the meteoroid (r,nu) and Earth on its circle
        d = abs(r - earth_r)
        min_d = min(min_d, d)
    return {"min_orbit_intersection_au": round(min_d, 5),
            "hazardous": min_d < 0.05,                 # ~PHA threshold (0.05 AU)
            "lunar_distances": round(min_d * 389.2, 2)}
