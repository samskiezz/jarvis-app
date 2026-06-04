"""GEOSPATIAL routes — the Palantir-Gotham *Map* pillar.

Public read endpoints (optional_bearer); geofence creation requires a bearer.

  * ``GET  /v1/geo/objects``                       — ontology objects with coords.
  * ``GET  /v1/geo/radius?lat=&lon=&km=``           — radius query, nearest first.
  * ``GET  /v1/geo/bbox?min_lat=&min_lon=&max_lat=&max_lon=`` — bbox query.
  * ``GET  /v1/geo/layers``                         — map layer catalog.
  * ``GET  /v1/geo/layers/{layer_id}/features``     — GeoJSON-ish features.
  * ``GET  /v1/geo/geofences``                      — list stored geofences.
  * ``POST /v1/geo/geofences``  (bearer)            — add ``{name, polygon}``.
  * ``GET  /v1/geo/contains?lat=&lon=``             — geofences containing a point.
  * ``GET  /v1/geo/tracks/{object_id}``             — movement track for an object.

Mount in ``main.py`` with::

    from .routes import geo as geo_routes
    app.include_router(geo_routes.router)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import geo as geo_svc

router = APIRouter(prefix="/v1/geo", tags=["geo"])


@router.get("/objects")
async def objects_endpoint(_token: str | None = Depends(optional_bearer)):
    items = geo_svc.objects_with_coords()
    return {"count": len(items), "objects": items}


@router.get("/radius")
async def radius_endpoint(
    lat: float = Query(..., description="centre latitude"),
    lon: float = Query(..., description="centre longitude"),
    km: float = Query(..., ge=0, description="radius in kilometres"),
    _token: str | None = Depends(optional_bearer),
):
    items = geo_svc.radius_query(lat, lon, km)
    return {"lat": lat, "lon": lon, "km": km, "count": len(items), "objects": items}


@router.get("/bbox")
async def bbox_endpoint(
    min_lat: float = Query(...),
    min_lon: float = Query(...),
    max_lat: float = Query(...),
    max_lon: float = Query(...),
    _token: str | None = Depends(optional_bearer),
):
    items = geo_svc.bbox_query(min_lat, min_lon, max_lat, max_lon)
    return {
        "bbox": [min_lat, min_lon, max_lat, max_lon],
        "count": len(items),
        "objects": items,
    }


@router.get("/layers")
async def layers_endpoint(_token: str | None = Depends(optional_bearer)):
    catalog = geo_svc.layers()
    return {"count": len(catalog), "layers": catalog}


@router.get("/layers/{layer_id}/features")
async def layer_features_endpoint(
    layer_id: str,
    limit: int = Query(200, ge=0, le=5000),
    _token: str | None = Depends(optional_bearer),
):
    return geo_svc.layer_features(layer_id, limit=limit)


@router.get("/geofences")
async def geofences_endpoint(_token: str | None = Depends(optional_bearer)):
    fences = geo_svc.geofences()
    return {"count": len(fences), "geofences": fences}


class GeofenceBody(BaseModel):
    name: str = Field("", description="human label for the geofence")
    polygon: list[list[float]] = Field(
        default_factory=list,
        description="ring of [lat, lon] vertices (>=3)",
    )


@router.post("/geofences")
async def add_geofence_endpoint(
    body: GeofenceBody,
    _token: str = Depends(require_bearer),
):
    fid = geo_svc.add_geofence(body.name, body.polygon)
    if not fid:
        return {"ok": False, "error": "invalid polygon (need >=3 valid [lat,lon] vertices)"}
    return {"ok": True, "id": fid}


@router.get("/contains")
async def contains_endpoint(
    lat: float = Query(...),
    lon: float = Query(...),
    _token: str | None = Depends(optional_bearer),
):
    matches = geo_svc.point_in_geofence(lat, lon)
    return {"lat": lat, "lon": lon, "count": len(matches), "geofences": matches}


@router.get("/tracks/{object_id}")
async def tracks_endpoint(
    object_id: str,
    _token: str | None = Depends(optional_bearer),
):
    points = geo_svc.tracks(object_id)
    return {"object_id": object_id, "count": len(points), "track": points}
