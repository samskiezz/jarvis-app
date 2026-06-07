#!/usr/bin/env python3
"""Derive the 95,405 PBR GLB variants from the 840 generated base meshes — NO extra credits.

For each base mesh (made by tripo_generate.py, with PBR textures), this produces its BOM
variants while PRESERVING the PBR material graph:
  • swatch  → recolor baseColor (factor + optional texture tint); normal/roughness/metallic/
              emissive maps are kept untouched
  • lod0/1/2→ quadric decimation to 100% / ~50% / ~20% triangles (textures retained)
  • style   → roughness/metallic trim tweak (geometry-identical; hero restyles are re-gens)
Emissive (neon/holo) channels are carried through so they still glow under Lumen.

Needs:  pip install trimesh pillow numpy
Run:    python3 scripts/derive_variants.py [--limit N] [--base NAME] [--run]
Without the libs (or without --run) it prints the derivation plan (no files written).
"""
from __future__ import annotations
import argparse, csv, json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOM = os.path.join(ROOT, "data", "master", "glb_bom.csv")
SPECS = os.path.join(ROOT, "data", "master", "base_mesh_specs.jsonl")
OUTDIR = os.path.join(ROOT, "web", "public", "models", "generated", "uw", "variants")

LOD_RATIO = {"lod0": 1.0, "lod1": 0.5, "lod2": 0.2}
# named swatch -> linear RGB tint applied to baseColor (PBR-correct: only albedo changes)
SWATCH_RGB = {
    "oak": (0.62, 0.46, 0.30), "walnut": (0.40, 0.26, 0.16), "white": (0.92, 0.92, 0.92),
    "black": (0.05, 0.05, 0.06), "graphite": (0.18, 0.19, 0.21), "steel": (0.62, 0.64, 0.67),
    "navy": (0.10, 0.16, 0.32), "sage": (0.52, 0.60, 0.46),
    "natural": None, "default": None, "std": None, "a": None, "b": None, "c": None,
}


def base_glb_path(base, domain):
    return os.path.join(ROOT, "web", "public", "models", "generated", "uw", domain, f"{base}.glb")


def load_libs():
    try:
        import trimesh, numpy as np  # noqa
        from PIL import Image  # noqa
        return trimesh, np, Image
    except Exception:
        return None, None, None


def derive_one(trimesh, np, Image, src, row, dest):
    scene = trimesh.load(src, process=False)
    geoms = scene.geometry.values() if hasattr(scene, "geometry") else [scene]
    tint = SWATCH_RGB.get(row["swatch"])
    ratio = LOD_RATIO.get(row["lod"], 1.0)
    for g in geoms:
        mat = getattr(g.visual, "material", None)
        if mat is not None and tint is not None:
            # recolor albedo only — keep normal/roughness/metallic/emissive intact (PBR-correct)
            if hasattr(mat, "baseColorFactor") and mat.baseColorFactor is not None:
                a = mat.baseColorFactor[3] if len(mat.baseColorFactor) > 3 else 1.0
                mat.baseColorFactor = [tint[0], tint[1], tint[2], a]
            if getattr(mat, "baseColorTexture", None) is not None:
                img = mat.baseColorTexture.convert("RGB")
                arr = (np.asarray(img).astype(np.float32) / 255.0)
                arr = arr * np.array(tint)            # multiply albedo by swatch tint
                mat.baseColorTexture = Image.fromarray((arr.clip(0, 1) * 255).astype("uint8"))
        # style: subtle roughness/metallic trim (geometry unchanged)
        if mat is not None and row["style"] in ("industrial", "luxury"):
            if hasattr(mat, "roughnessFactor"):
                mat.roughnessFactor = 0.35 if row["style"] == "luxury" else 0.8
        # LOD decimation
        if ratio < 1.0 and hasattr(g, "faces") and len(g.faces) > 200:
            try:
                tgt = max(50, int(len(g.faces) * ratio))
                dec = g.simplify_quadric_decimation(tgt)
                if dec is not None and len(dec.faces) > 0:
                    if hasattr(dec.visual, "material"): dec.visual.material = g.visual.material
                    g.vertices, g.faces = dec.vertices, dec.faces
            except Exception:
                pass
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    (scene if hasattr(scene, "geometry") else g).export(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--base", default="")
    ap.add_argument("--run", action="store_true")
    a = ap.parse_args()

    specs = {s["base_item"]: s["domain"] for s in (json.loads(l) for l in open(SPECS))}
    rows = list(csv.DictReader(open(BOM)))
    by_base = defaultdict(list)
    for r in rows:
        by_base[r["base_item"]].append(r)

    trimesh, np, Image = load_libs()
    can = bool(trimesh) and a.run
    if not trimesh:
        print("derivation libs missing -> plan only. Install:  pip install trimesh pillow numpy\n")
    elif not a.run:
        print("libs present; add --run to write files. Showing plan.\n")

    bases = [a.base] if a.base else list(by_base)
    if a.limit: bases = bases[:a.limit]
    planned = derived = missing = 0
    for base in bases:
        domain = specs.get(base, "interior")
        src = base_glb_path(base, domain)
        variants = by_base.get(base, [])
        planned += len(variants)
        if not os.path.exists(src):
            missing += 1
            if not a.base: continue
        for r in variants:
            dest = os.path.join(OUTDIR, r["domain"], f"{r['glb_id']}.glb")
            if can and os.path.exists(src) and not os.path.exists(dest):
                try:
                    derive_one(trimesh, np, Image, src, r, dest); derived += 1
                except Exception as e:
                    print(f"  fail {r['glb_id']}: {e}")
    print(f"bases considered      : {len(bases)}")
    print(f"variants planned      : {planned:,}")
    print(f"base meshes missing   : {missing} (run tripo_generate.py first)")
    print(f"variants derived now  : {derived:,}" if can else "variants derived now  : 0 (plan/dry)")
    print("Each variant keeps the base's PBR maps; only albedo(swatch)/triangles(LOD)/trim(style) change.")


if __name__ == "__main__":
    main()
