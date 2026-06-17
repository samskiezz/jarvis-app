#!/usr/bin/env python3
"""premerge_missing_glbs.py — pre-merge multi-part glTF files before UE5 import.

The UE5 Python binding's build_from_static_mesh_descriptions() treats each
MeshDescription as a separate LOD, so GLBs with more than ~8 mesh parts crash
when we try to merge them in-editor.  This script pre-processes the missing
source files so that every glTF that would produce multiple StaticMeshes is
merged into a single mesh (one node / one geometry) using trimesh.  FBX files
and already-single glTFs are copied through unchanged.

Output directory structure mirrors the web/public/models tree so that setting
UW_GLB_ROOT to the output directory lets import_glbs.py resolve the same URLs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys

import trimesh


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", os.path.splitext(name)[0])


def _is_gltf(path: str) -> bool:
    try:
        with open(path, "rb") as fh:
            return fh.read(4) == b"glTF"
    except Exception:
        return False


def _category_map(catalog_path: str) -> dict:
    out: dict[str, tuple[str, bool]] = {}
    if not os.path.exists(catalog_path):
        return out
    try:
        d = json.load(open(catalog_path))
        assets = d.get("assets", {})
        if isinstance(assets, dict):
            iterator = assets.items()
        else:
            iterator = ((a.get("url"), a) for a in assets)
        for url, a in iterator:
            if not url:
                continue
            cat = a.get("category") if isinstance(a, dict) else "prop"
            if not cat:
                cat = "prop"
            skinned = bool(a.get("skinned")) if isinstance(a, dict) else False
            out[os.path.basename(url).lower()] = (cat, skinned)
    except Exception as e:
        print(f"[premerge] catalog unreadable ({e}); defaulting all -> prop", file=sys.stderr)
    return out


def _load_manifest(manifest_path: str) -> dict:
    with open(manifest_path) as fh:
        return json.load(fh)


def _missing_entries(manifest_path: str, manifest: dict, glb_root: str, catalog_path: str, skip_urls: set, allow_urls: set) -> list[tuple[str, str, str]]:
    """Return (url, gpath, src) for missing, eligible assets."""
    proj = os.path.dirname(os.path.dirname(os.path.dirname(manifest_path)))
    cat_map = _category_map(catalog_path)
    out = []
    for url, gpath in manifest.get("by_url", {}).items():
        rel = url[len("/models/"):] if url.startswith("/models/") else url.lstrip("/")
        src = os.path.join(glb_root, rel)
        uasset_path = gpath.replace("/Game/", f"{proj}/Content/") + ".uasset"
        if os.path.exists(uasset_path):
            continue
        if not os.path.exists(src):
            continue
        if url in skip_urls and url not in allow_urls:
            continue
        cat, skinned = cat_map.get(os.path.basename(url).lower(), ("prop", False))
        if (skinned or cat in ("character", "creature")) and url not in allow_urls:
            continue
        out.append((url, gpath, src))
    return out


def _merge_glb(src: str, dst: str) -> bool:
    try:
        scene = trimesh.load(src, force="glb")
    except Exception as e:
        print(f"[premerge] trimesh load failed for {src}: {e}", file=sys.stderr)
        return False

    if isinstance(scene, trimesh.Trimesh):
        # Already a single mesh.
        combined = scene
    elif hasattr(scene, "geometry") and scene.geometry:
        geoms = list(scene.geometry.values())
        if len(geoms) == 1:
            combined = geoms[0]
        else:
            # Filter to actual Trimesh geometries (skip point clouds, etc.).
            meshes = [g for g in geoms if isinstance(g, trimesh.Trimesh)]
            if not meshes:
                return False
            combined = trimesh.util.concatenate(meshes)
    else:
        return False

    try:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        combined.export(dst)
    except Exception as e:
        print(f"[premerge] export failed for {dst}: {e}", file=sys.stderr)
        return False
    return True


def main():
    parser = argparse.ArgumentParser(description="Pre-merge multi-part GLBs for UE5 import")
    parser.add_argument("--manifest", required=True, help="Path to manifest.json")
    parser.add_argument("--glb-root", required=True, help="Source models directory")
    parser.add_argument("--catalog", required=True, help="Path to asset_catalog.json")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--skip-urls", default="[]", help="JSON list of URLs to skip")
    args = parser.parse_args()

    skip_urls = set(json.loads(args.skip_urls))
    # These specific character/creature/hero GLBs are not actually skinned, so
    # let them through the StaticMesh pipeline even though their catalog category
    # would normally skip them.
    allow_urls = {
        "/models/RobotExpressive.glb",
        "/models/hero/underworld_hero.glb",
        "/models/generated/tripo/horse_omnibus.glb",
        "/models/generated/tripo/industrial_robot_arm.glb",
        "/models/generated/tripo/predator_wolf.glb",
    }

    manifest = _load_manifest(args.manifest)
    entries = _missing_entries(args.manifest, manifest, args.glb_root, args.catalog, skip_urls, allow_urls)

    merged_count = 0
    copied_count = 0
    failed_count = 0
    skipped_count = 0

    for url, gpath, src in entries:
        rel = url[len("/models/"):] if url.startswith("/models/") else url.lstrip("/")
        dst = os.path.join(args.output, rel)
        if os.path.exists(dst):
            os.remove(dst)
        os.makedirs(os.path.dirname(dst), exist_ok=True)

        if _is_gltf(src):
            scene = trimesh.load(src, force="glb")
            geom_count = 1 if isinstance(scene, trimesh.Trimesh) else (
                len(scene.geometry) if hasattr(scene, "geometry") else 1
            )
            if geom_count > 1:
                print(f"[premerge] merging {geom_count} geometries: {url}")
                if _merge_glb(src, dst):
                    merged_count += 1
                else:
                    failed_count += 1
                continue

        # Single-part glTF or FBX: copy through.
        try:
            shutil.copy2(src, dst)
            copied_count += 1
        except Exception as e:
            print(f"[premerge] copy failed for {src}: {e}", file=sys.stderr)
            failed_count += 1

    summary = {
        "output_root": args.output,
        "total_missing": len(entries),
        "merged": merged_count,
        "copied": copied_count,
        "failed": failed_count,
        "skipped": skipped_count,
    }
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
