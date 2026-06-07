"""SCENE BUILDER — turn the backend contracts into a live USD stage for the RTX renderer.

Reads the φ/Fibonacci/fractal layout CHUNKS (buildings/walls/roads, each with a real GLB)
and the SCENE-STATE (live minions with thought/awareness/awakened) and reconciles them
into the stage every poll: reference each structure's GLB→USD, instance it at its φ-placed
transform; spawn/move minion prims, lerp them toward their target; raise a glowing emissive
HALO over minions who have awakened (Global-Workspace sentience). Engine consumes the SAME
data the Three.js path does — only the renderer differs.

Uses pxr (USD) + omni.usd; degrades to a no-op outside Kit.
"""

from __future__ import annotations

import math
import os

try:
    from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade
    _HAVE_USD = True
except Exception:  # noqa: BLE001 - only importable inside Kit/USD
    _HAVE_USD = False

# Where the GLB→USD imported assets live (built by import_glbs_to_usd.py). The catalog
# url ("/models/kenney/.../x.glb") maps to "<USD_ROOT>/kenney/.../x.usd".
USD_ROOT = os.environ.get("UNDERWORLD_USD_ROOT", "/Underworld/Assets")
WORLD_SCALE = 1.0   # backend unit = 1 metre = 1 USD unit


def _usd_path_for_glb(glb_url: str | None) -> str | None:
    if not glb_url:
        return None
    rel = glb_url.split("/models/", 1)[-1].rsplit(".", 1)[0]
    return f"{USD_ROOT}/{rel}.usd"


def _safe(name: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in str(name))[:48]


class StageBuilder:
    """Holds the stage roots and reconciles structures + minions into USD."""

    def __init__(self, stage: "Usd.Stage"):
        self.stage = stage
        self._minions: dict[str, str] = {}     # id -> prim path
        self._chunks: set[tuple[int, int]] = set()
        if _HAVE_USD:
            for p in ("/World", "/World/Structures", "/World/Minions", "/World/Lights"):
                if not stage.GetPrimAtPath(p):
                    UsdGeom.Xform.Define(stage, p)
            self._ensure_sun()

    # ── lighting / sky ───────────────────────────────────────────────────────────
    def _ensure_sun(self):
        from pxr import UsdLux
        sun = self.stage.GetPrimAtPath("/World/Lights/Sun")
        if not sun:
            d = UsdLux.DistantLight.Define(self.stage, "/World/Lights/Sun")
            d.CreateIntensityAttr(3.0)
            d.CreateAngleAttr(0.53)
            UsdGeom.Xformable(d).AddRotateXYZOp().Set(Gf.Vec3f(-45, 30, 0))
            dome = UsdLux.DomeLight.Define(self.stage, "/World/Lights/Sky")
            dome.CreateIntensityAttr(1.0)

    def set_time_of_day(self, frac: float):
        sun = UsdGeom.Xformable(self.stage.GetPrimAtPath("/World/Lights/Sun"))
        if sun:
            ops = sun.GetOrderedXformOps()
            pitch = frac * 360.0 - 90.0
            (ops[0] if ops else sun.AddRotateXYZOp()).Set(Gf.Vec3f(pitch, 30, 0))

    # ── structures from a φ/fractal chunk ────────────────────────────────────────
    def apply_chunk(self, chunk: dict):
        if not _HAVE_USD:
            return
        cx, cz = chunk.get("chunk", [0, 0])
        if (cx, cz) in self._chunks:
            return                              # already materialised this chunk
        self._chunks.add((cx, cz))
        root = f"/World/Structures/chunk_{cx}_{cz}"
        UsdGeom.Xform.Define(self.stage, root)
        i = 0
        for settle in chunk.get("settlements", []):
            for p in (settle.get("placements", []) + settle.get("walls", [])):
                usd = _usd_path_for_glb(p.get("glb"))
                if not usd:
                    continue
                prim_path = f"{root}/s_{i}"
                i += 1
                xf = UsdGeom.Xform.Define(self.stage, prim_path)
                xf.GetPrim().GetReferences().AddReference(usd)
                pos = p.get("pos", [0, 0, 0])
                xf.AddTranslateOp().Set(Gf.Vec3d(pos[0] * WORLD_SCALE, pos[1], pos[2] * WORLD_SCALE))
                xf.AddRotateYOp().Set(float(p.get("rot_y", 0.0)))
                s = float(p.get("scale", 1.0))
                xf.AddScaleOp().Set(Gf.Vec3f(s, s, s))

    # ── live minions from scene-state ────────────────────────────────────────────
    def apply_scene_state(self, scene: dict, minion_usd: str | None = None):
        if not _HAVE_USD:
            return
        self.set_time_of_day(float(scene.get("time_of_day", 0.5)))
        seen = set()
        for m in scene.get("minions", []):
            mid = m.get("id")
            if not mid:
                continue
            seen.add(mid)
            path = self._minions.get(mid) or f"/World/Minions/m_{_safe(mid)}"
            prim = self.stage.GetPrimAtPath(path)
            if not prim:
                xf = UsdGeom.Xform.Define(self.stage, path)
                if minion_usd:
                    xf.GetPrim().GetReferences().AddReference(minion_usd)
                self._minions[mid] = path
                self._make_halo(path)
                prim = xf.GetPrim()
            self._place_minion(path, m)

    def _place_minion(self, path: str, m: dict):
        xf = UsdGeom.Xformable(self.stage.GetPrimAtPath(path))
        ops = {op.GetOpName(): op for op in xf.GetOrderedXformOps()}
        pos = m.get("position", [0, 0, 0])
        t = ops.get("xformOp:translate") or xf.AddTranslateOp()
        t.Set(Gf.Vec3d(pos[0] * WORLD_SCALE, pos[1], pos[2] * WORLD_SCALE))
        r = ops.get("xformOp:rotateY") or xf.AddRotateYOp()
        r.Set(float(m.get("facing", 0.0)))
        # awareness halo brightness + visibility
        aware = float(m.get("awareness", 0.0))
        awakened = bool(m.get("awakened"))
        halo = self.stage.GetPrimAtPath(f"{path}/Halo")
        if halo:
            UsdGeom.Imageable(halo).MakeVisible() if (awakened or aware >= 0.5) else \
                UsdGeom.Imageable(halo).MakeInvisible()
            mat = UsdShade.MaterialBindingAPI(halo)
            em = self.stage.GetPrimAtPath(f"{path}/Halo/Mat/Shader")
            if em:
                col = (0.55, 0.96, 1.0) if awakened else (0.6, 0.49, 1.0)
                UsdShade.Shader(em).GetInput("emissive_color").Set(Gf.Vec3f(*col))
                UsdShade.Shader(em).GetInput("emissive_intensity").Set(2.0 + 6.0 * aware)

    def _make_halo(self, path: str):
        from pxr import UsdGeom as G
        halo = G.Cylinder.Define(self.stage, f"{path}/Halo")
        halo.CreateRadiusAttr(0.6)
        halo.CreateHeightAttr(0.05)
        G.Xformable(halo).AddTranslateOp().Set(Gf.Vec3d(0, 2.4, 0))
        # emissive MDL-ish material (OmniPBR emissive)
        mat = UsdShade.Material.Define(self.stage, f"{path}/Halo/Mat")
        sh = UsdShade.Shader.Define(self.stage, f"{path}/Halo/Mat/Shader")
        sh.CreateIdAttr("UsdPreviewSurface")
        sh.CreateInput("emissive_color", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.55, 0.96, 1.0))
        sh.CreateInput("emissive_intensity", Sdf.ValueTypeNames.Float).Set(4.0)
        mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), "surface")
        UsdShade.MaterialBindingAPI(halo).Bind(mat)
