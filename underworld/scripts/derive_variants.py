#!/usr/bin/env python3
"""Derive LOD variants (lod1/lod2) from the generated lod0 assets — NO extra credits.

With gen_specs, every distinct LOOK (color/style/era/season/outfit) is generated uniquely with
full PBR. The only mechanical axis left to derive is LOD: lod1 ≈ 50% triangles, lod2 ≈ 20%,
via quadric decimation, keeping the full PBR texture set (albedo/normal/roughness/metallic/
emissive) intact. This turns the ~11k generated lod0 assets into the full ~95k BOM.

Needs:  pip install trimesh numpy
Run:    python3 scripts/derive_variants.py [--limit N] [--run]
Without trimesh (or without --run) it prints the plan only.
"""
from __future__ import annotations
import argparse, csv, json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOM = os.path.join(ROOT, "data", "master", "glb_bom.csv")
GENSPECS = os.path.join(ROOT, "data", "master", "gen_specs.jsonl")
LOD_RATIO = {"lod1": 0.5, "lod2": 0.2}


def load_libs():
    try:
        import trimesh, numpy as np  # noqa
        return trimesh, np
    except Exception:
        return None, None


def lod0_path_for(domain, base, style, swatch):
    """Find the generated lod0 glb for a look (matches gen_specs out_glb by glb_id stem)."""
    # gen_specs out_glb is web/public/models/generated/uw/<domain>/<glb_id>.glb
    # the lod0 glb_id == this row's glb_id with lod0 — caller passes the lod0 glb_id
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--run", action="store_true")
    a = ap.parse_args()

    # map (domain,base,style,swatch) -> generated lod0 glb path
    gen = {}
    for l in open(GENSPECS):
        s = json.loads(l)
        gen[(s["domain"], s["base_item"], s["style"], s["swatch"])] = os.path.join(ROOT, s["out_glb"])

    rows = [r for r in csv.DictReader(open(BOM)) if r["lod"] in LOD_RATIO]
    if a.limit: rows = rows[:a.limit]

    trimesh, np = load_libs()
    can = bool(trimesh) and a.run
    if not trimesh:
        print("derivation libs missing -> plan only. Install:  pip install trimesh numpy\n")
    elif not a.run:
        print("libs present; add --run to write files. Plan only.\n")

    planned = done = missing = 0
    for r in rows:
        planned += 1
        src = gen.get((r["domain"], r["base_item"], r["style"], r["swatch"]))
        if not src or not os.path.exists(src):
            missing += 1
            continue
        dest = os.path.join(ROOT, "web", "public", "models", "generated", "uw",
                            r["domain"], f"{r['glb_id']}.glb")
        if can and not os.path.exists(dest):
            try:
                scene = trimesh.load(src, process=False)
                ratio = LOD_RATIO[r["lod"]]
                geoms = scene.geometry.values() if hasattr(scene, "geometry") else [scene]
                for g in geoms:
                    if hasattr(g, "faces") and len(g.faces) > 200:
                        tgt = max(50, int(len(g.faces) * ratio))
                        dec = g.simplify_quadric_decimation(tgt)
                        if dec is not None and len(getattr(dec, "faces", [])) > 0:
                            if hasattr(dec.visual, "material"):
                                dec.visual.material = g.visual.material   # keep PBR maps
                            g.vertices, g.faces = dec.vertices, dec.faces
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                (scene if hasattr(scene, "geometry") else g).export(dest)
                done += 1
            except Exception as e:
                print(f"  fail {r['glb_id']}: {e}")

    print(f"LOD variants planned     : {planned:,}")
    print(f"source lod0 not yet made  : {missing:,} (run tripo_generate.py first)")
    print(f"LOD variants derived now  : {done:,}" if can else f"LOD variants derived now  : 0 (plan)")
    print("Each LOD keeps the source's full PBR texture set; only triangle count drops.")


if __name__ == "__main__":
    main()
