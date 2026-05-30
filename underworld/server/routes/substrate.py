"""World-substrate API: materials, structural checks, and resource geology.

Doc I.3 (resources), I.4 (materials), I.7 (structural integrity).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import require_bearer
from ..knowledge import materials as materials_db
from ..physics import structures
from ..world.resources import survey
from ..world.seed import derive_seed

router = APIRouter(prefix="/substrate", tags=["substrate"])


def _mat_dict(m: materials_db.Material) -> dict:
    return {
        "name": m.name, "category": m.category, "density": m.density,
        "melting_point_c": m.melting_point_c, "tensile_mpa": m.tensile_mpa,
        "compressive_mpa": m.compressive_mpa, "youngs_gpa": m.youngs_gpa,
        "thermal_wmk": m.thermal_wmk, "resistivity_ohm_m": m.resistivity_ohm_m,
        "conducts": m.conducts,
    }


@router.get("/materials")
async def list_materials(
    category: str | None = Query(default=None),
    _token: str = Depends(require_bearer),
):
    mats = materials_db.by_category(category) if category else materials_db.all_materials()
    return {"count": len(mats), "materials": [_mat_dict(m) for m in mats]}


@router.get("/materials/{name}")
async def get_material(name: str, _token: str = Depends(require_bearer)):
    m = materials_db.get(name)
    if m is None:
        raise HTTPException(status_code=404, detail=f"unknown material {name!r}")
    return _mat_dict(m)


class AlloyRequest(BaseModel):
    a: str
    b: str
    ratio: float = 0.5


@router.post("/materials/alloy")
async def make_alloy(body: AlloyRequest, _token: str = Depends(require_bearer)):
    try:
        return _mat_dict(materials_db.alloy(body.a, body.b, body.ratio))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class StructureRequest(BaseModel):
    material: str
    member: str = "beam"          # "beam" | "column"
    span_m: float = 1.0
    load_kn: float = 1.0
    size_m: float = 0.1


@router.post("/structures/evaluate")
async def evaluate_structure(body: StructureRequest, _token: str = Depends(require_bearer)):
    try:
        r = structures.evaluate(
            body.material, member=body.member, span_m=body.span_m,
            load_kn=body.load_kn, size_m=body.size_m,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "material": r.material, "member": r.member, "stress_pa": r.stress_pa,
        "capacity_pa": r.capacity_pa, "safety_factor": r.safety_factor,
        "stable": r.stable, "failure_mode": r.failure_mode,
    }


@router.get("/resources")
async def resource_survey(
    cpc_class: str = Query(default="G06"),
    size: int = Query(default=32, ge=8, le=64),
    _token: str = Depends(require_bearer),
):
    """Geological survey of the world a CPC class would generate."""
    seed = derive_seed(cpc_class)
    return {
        "cpc_class": seed.cpc_class,
        "biome_hint": seed.biome_hint,
        "resources": survey(seed, size=size),
    }
