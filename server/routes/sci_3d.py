"""3D Data API — scientific geometry generation for the HoloCAD viewer.

Additive route module.  No existing behaviour is changed.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/v1/sci/3d")


# ── request models ───────────────────────────────────────────────────────────

class MoleculeRequest(BaseModel):
    atoms: list[dict[str, Any]]
    bonds: list[list[int]] | None = None


class TrajectoryRequest(BaseModel):
    waypoints: list[list[float]]
    steps: int = 100


class OrbitalRequest(BaseModel):
    a: float = 1.0
    e: float = 0.0
    i: float = 0.0
    omega: float = 0.0
    raan: float = 0.0
    nu_steps: int = 200


# ── helpers ──────────────────────────────────────────────────────────────────

def _interpolate_waypoints(waypoints: list[list[float]], steps: int) -> list[list[float]]:
    """Pure-Python+Numpy linear interpolation between waypoints."""
    import numpy as np

    pts = np.array(waypoints, dtype=float)
    if len(pts) < 2:
        raise HTTPException(status_code=400, detail="At least 2 waypoints required")

    diffs = np.diff(pts, axis=0)
    seg_lens = np.sqrt(np.sum(diffs**2, axis=1))
    total = float(seg_lens.sum())
    if total == 0:
        return [waypoints[0] for _ in range(steps)]

    cum = np.concatenate([[0.0], np.cumsum(seg_lens)])
    targets = np.linspace(0, cum[-1], steps)

    out = []
    for t in targets:
        idx = int(np.searchsorted(cum, t)) - 1
        idx = max(0, min(idx, len(seg_lens) - 1))
        seg_start = cum[idx]
        seg_end = cum[idx + 1]
        seg_t = 0.0 if seg_end == seg_start else (t - seg_start) / (seg_end - seg_start)
        p = pts[idx] + seg_t * (pts[idx + 1] - pts[idx])
        out.append(p.tolist())
    return out


def _kepler_orbit(params: OrbitalRequest) -> list[list[float]]:
    import numpy as np

    nu = np.linspace(0, 2 * np.pi, params.nu_steps)
    a, e = params.a, params.e
    i = np.radians(params.i)
    omega = np.radians(params.omega)
    raan = np.radians(params.raan)

    r = a * (1 - e**2) / (1 + e * np.cos(nu))
    x_orb = r * np.cos(nu)
    y_orb = r * np.sin(nu)
    z_orb = np.zeros_like(nu)

    R3_raan = np.array([
        [np.cos(raan), -np.sin(raan), 0],
        [np.sin(raan), np.cos(raan), 0],
        [0, 0, 1],
    ])
    R1_inc = np.array([
        [1, 0, 0],
        [0, np.cos(i), -np.sin(i)],
        [0, np.sin(i), np.cos(i)],
    ])
    R3_omega = np.array([
        [np.cos(omega), -np.sin(omega), 0],
        [np.sin(omega), np.cos(omega), 0],
        [0, 0, 1],
    ])
    rot = R3_raan @ R1_inc @ R3_omega
    points = np.column_stack([x_orb, y_orb, z_orb]) @ rot.T
    return points.tolist()


# ── routes ───────────────────────────────────────────────────────────────────

@router.post("/molecule")
async def molecule_3d(req: MoleculeRequest):
    """Accept atom list + bonds, return normalized 3D coordinates."""
    atoms = []
    for a in req.atoms:
        atoms.append({
            "element": str(a.get("element", "C")),
            "x": float(a.get("x", 0)),
            "y": float(a.get("y", 0)),
            "z": float(a.get("z", 0)),
        })
    bonds = req.bonds or []
    return {
        "status": "ok",
        "type": "molecule",
        "atoms": atoms,
        "bonds": bonds,
        "count": len(atoms),
    }


@router.post("/trajectory")
async def trajectory_3d(req: TrajectoryRequest):
    """Accept waypoints, return interpolated path."""
    interpolated = _interpolate_waypoints(req.waypoints, req.steps)
    return {
        "status": "ok",
        "type": "trajectory",
        "waypoints": req.waypoints,
        "interpolated": interpolated,
        "steps": len(interpolated),
    }


@router.post("/orbital")
async def orbital_3d(req: OrbitalRequest):
    """Accept orbital params, return orbital path points."""
    points = _kepler_orbit(req)
    return {
        "status": "ok",
        "type": "orbital",
        "points": points,
        "params": req.model_dump(),
    }


@router.get("/catalog")
async def catalog_3d():
    """List available 3D datasets."""
    return {
        "datasets": [
            {"id": "water", "type": "molecule", "label": "Water (H₂O)", "atoms": 3},
            {"id": "caffeine", "type": "molecule", "label": "Caffeine", "atoms": 24},
            {"id": "leo_orbit", "type": "orbital", "label": "LEO Reference Orbit", "points": 200},
            {"id": "mars_transfer", "type": "trajectory", "label": "Earth-Mars Transfer", "waypoints": 8},
            {"id": "benzene", "type": "molecule", "label": "Benzene Ring", "atoms": 12},
        ],
        "total": 5,
    }
