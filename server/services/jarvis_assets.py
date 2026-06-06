"""JARVIS ASSETS — the render-asset pipeline (library → wire → generate gaps).

Backs the A-Z render map for the WebGL holo HUD:
  * library()  — every Tripo GLB already generated (the 677 in underworld).
  * wired()    — models live in public/models (loadable by the holo engine now).
  * wire(name) — copy a library model into public/models so a page can render it.
  * gaps()     — manifest surfaces with no model yet (targets for Tripo generation).

Generation of brand-new custom renders is delegated to services.tripo_client
(key-gated). stdlib + shutil; never raises.
"""

from __future__ import annotations

import os
import shutil

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_LIBRARY = os.path.join(_ROOT, "underworld", "web", "public", "models", "generated", "tripo")
_PUBLIC = os.path.join(_ROOT, "public", "models")

# manifest gaps that need a NEW render (mirror src/three/modelRegistry ASSET_MANIFEST)
GAPS = [
    {"surface": "Iron Man helmet (JARVIS avatar)", "plane": "jarvis", "gen": "iron_man_helmet"},
    {"surface": "Palantir-style globe console", "plane": "gotham", "gen": "palantir_globe_console"},
    {"surface": "Holographic city map", "plane": "gotham", "gen": "holographic_city_map"},
    {"surface": "Audit ledger vault", "plane": "audit", "gen": "audit_ledger_vault"},
]


def library() -> list[str]:
    """Every Tripo model name available to wire. Never raises."""
    try:
        return sorted(f[:-4] for f in os.listdir(_LIBRARY) if f.endswith(".glb"))
    except OSError:
        return []


def wired() -> list[str]:
    try:
        return sorted(f[:-4] for f in os.listdir(_PUBLIC) if f.endswith(".glb"))
    except OSError:
        return []


def wire(name: str) -> dict:
    """Copy a library model into public/models so the holo engine can load it."""
    name = os.path.basename(str(name or "")).replace(".glb", "")
    src = os.path.join(_LIBRARY, f"{name}.glb")
    if not os.path.isfile(src):
        return {"ok": False, "error": f"{name} not in library"}
    try:
        os.makedirs(_PUBLIC, exist_ok=True)
        dst = os.path.join(_PUBLIC, f"{name}.glb")
        shutil.copyfile(src, dst)
        return {"ok": True, "name": name, "path": f"/models/{name}.glb",
                "bytes": os.path.getsize(dst)}
    except OSError as e:
        return {"ok": False, "error": str(e)}


def search_library(query: str, limit: int = 30) -> list[str]:
    """Find models in the 677-library by keyword (for matching surfaces to renders)."""
    q = (query or "").lower().strip()
    if not q:
        return []
    terms = [t for t in q.replace("-", " ").split() if t]
    out = []
    for n in library():
        hay = n.replace("_", " ")
        if all(t in hay for t in terms) or any(t in hay for t in terms):
            out.append(n)
        if len(out) >= limit:
            break
    return out


def gaps() -> list[dict]:
    return GAPS


def status() -> dict:
    """Asset pipeline rollup for the UI. Never raises."""
    try:
        from . import tripo_client as tc
        tripo = tc.available()
    except Exception:  # noqa: BLE001
        tripo = False
    return {"library_models": len(library()), "wired_models": len(wired()),
            "gaps": len(GAPS), "tripo_generation": tripo}
