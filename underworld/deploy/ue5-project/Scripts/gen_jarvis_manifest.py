#!/usr/bin/env python3
"""gen_jarvis_manifest.py — HEADLESS JARVIS asset manifest (no Editor, no GPU).

Source of truth = scene_assembly.json (glb_id -> scene/anchor, built from the render
matrix) + a walk of the generated GLB dir. Emits Content/JarvisAssets/manifest.json:

    { "dest_root", "total",
      "by_url":   { "/immersive/assets/<file>.glb": "/Game/JarvisAssets/<scene>/<Name>" },
      "by_scene": { "<scene>": { "<anchor>": ["/Game/JarvisAssets/<scene>/<Name>", ...] } } }

Mirrors the proven Underworld gen_manifest.py flow so import_jarvis_glbs.py + the
runtime AJarvisHudManager resolve GLB url -> /Game asset path the same way.
"""
from __future__ import annotations
import json, os, re, sys

GLB_ROOT = os.environ.get("JARVIS_GLB_ROOT", "/opt/jarvis-app-1/public/immersive/assets")
ASSEMBLY = os.environ.get("SCENE_ASSEMBLY", "/opt/jarvis-app-1/public/immersive/scene_assembly.json")
DEST = "/Game/JarvisAssets"
HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", os.path.splitext(name)[0])


def main() -> int:
    if not os.path.isdir(GLB_ROOT):
        print(f"[gen-jarvis-manifest] GLB_ROOT missing: {GLB_ROOT}", file=sys.stderr); return 2
    asm = json.load(open(ASSEMBLY)) if os.path.exists(ASSEMBLY) else {}
    glb_scene = {}
    for scene, anchors in asm.items():
        for _anchor, ids in anchors.items():
            for gid in ids:
                glb_scene[gid] = scene

    by_url = {}
    for f in sorted(os.listdir(GLB_ROOT)):
        if not f.lower().endswith((".glb", ".gltf")):
            continue
        gid = os.path.splitext(f)[0]
        scene = glb_scene.get(gid, "shared_kit")
        by_url[f"/immersive/assets/{f}"] = f"{DEST}/{scene}/{_safe(f)}"

    by_scene = {}
    for scene, anchors in asm.items():
        by_scene[scene] = {}
        for anchor, ids in anchors.items():
            paths = []
            for gid in ids:
                u = f"/immersive/assets/{gid}.glb"
                if u in by_url:
                    paths.append(by_url[u])
            by_scene[scene][anchor] = paths

    payload = {"dest_root": DEST, "total": len(by_url), "by_url": by_url, "by_scene": by_scene}
    cd = os.path.join(PROJ, "Content", "JarvisAssets")
    os.makedirs(cd, exist_ok=True)
    for d in (os.path.join(HERE, "manifest_jarvis.json"), os.path.join(cd, "manifest.json")):
        json.dump(payload, open(d, "w"), indent=1)
    print(f"[gen-jarvis-manifest] {len(by_url)} GLBs across {len(by_scene)} scenes -> {cd}/manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
