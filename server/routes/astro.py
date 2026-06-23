"""JARVIS solar-system tracker router (/v1/astro/*).

Surfaces the existing real-astronomy engine (server/services/discovery_astro.py):
planet ephemeris positions via astropy, a bright-star catalogue, and Keplerian
NEO/meteoroid close-approach screening. Fully additive + fail-safe — every
handler catches its own errors so a missing astropy install (planets only) or a
bad request never propagates as a 500 or takes down the backend.
"""
from __future__ import annotations

from fastapi import APIRouter

from ..services import discovery_astro

router = APIRouter()


@router.get("/v1/astro/planets")
async def planets(when: str = ""):
    """Real RA/Dec + Earth distance (AU) of the planets. Defaults to the current
    UTC time (real-time tracking); pass ?when=YYYY-MM-DD HH:MM:SS for a fixed epoch.

    Requires astropy. If astropy is unavailable the engine raises ImportError;
    we return a degraded {available: false} payload instead of erroring so the
    surface stays honest about live-vs-degraded planet tracking.
    """
    if not when:
        from datetime import datetime, timezone
        when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    try:
        data = discovery_astro.track_planets(when=when)
        return {"available": True, **data}
    except ImportError:
        return {"available": False, "reason": "astropy missing", "time": when, "planets": {}}
    except Exception as exc:  # noqa: BLE001 — never let the tracker 500 the backend
        return {"available": False, "reason": str(exc), "time": when, "planets": {}}


@router.get("/v1/astro/stars")
async def stars():
    """Catalogue positions (J2000 RA/Dec) of a few bright stars. No deps."""
    try:
        return discovery_astro.track_stars()
    except Exception as exc:  # noqa: BLE001
        return {"stars": {}, "error": str(exc)}


@router.get("/v1/astro/neo")
async def neo(a: float = 1.5, e: float = 0.4):
    """Two-body NEO screen for a meteoroid orbit (semi-major axis a in AU,
    eccentricity e): Keplerian orbit propagation + Earth close-approach MOID.
    numpy only — works without astropy."""
    try:
        return {
            "orbit": discovery_astro.propagate_orbit(a=a, e=e),
            "approach": discovery_astro.meteor_close_approach(a=a, e=e),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc), "orbit": {}, "approach": {}}
