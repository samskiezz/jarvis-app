#!/usr/bin/env python3
"""import_jarvis_glbs.py — HEADLESS UE5.5 import, hardened from forum/doc research.

Workarounds baked in (see JARVIS-UE5-WORKAROUNDS.md for sources):
  • Interchange IGNORES AssetImportTask.destination_name (the name is decided by the pipeline),
    so we import EACH glb into its OWN folder /Game/JarvisAssets/<scene>/<Name>/ and resolve the
    StaticMesh from that folder — names never collide or mis-resolve.
  • Nanite-enable can error on some imported glTF meshes (reported 5.3+), so each mesh is wrapped
    in try/except and skipped on error (import still succeeds).
  • Interchange-in-commandlet can crash headless; this script also works under the LEGACY glTF
    importer — if it crashes, relaunch with the legacy flag from the workarounds doc.
Run: UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=import_jarvis_glbs.py -unattended -nullrhi
"""
from __future__ import annotations
import json, os, re, sys, unreal

GLB_ROOT = os.environ.get("JARVIS_GLB_ROOT", "/opt/jarvis-app-1/jarvis_assets")
DEST = "/Game/JarvisAssets"
HERE = os.path.dirname(os.path.abspath(__file__))


def _manifest():
    p = os.path.join(os.path.dirname(HERE), "Content", "JarvisAssets", "manifest.json")
    if not os.path.exists(p):
        import subprocess
        subprocess.run([sys.executable, os.path.join(HERE, "gen_jarvis_manifest.py")], check=False)
    return json.load(open(p))


def main():
    by_url = _manifest().get("by_url", {})
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    ok = fail = 0
    for url, gpath in by_url.items():
        rel = url[len("/immersive/assets/"):] if url.startswith("/immersive/assets/") else url.lstrip("/")
        src = os.path.join(GLB_ROOT, rel)
        if not os.path.exists(src):
            unreal.log_warning(f"[jarvis-import] missing: {src}"); continue
        t = unreal.AssetImportTask()
        t.filename = src
        t.destination_path = gpath            # per-asset folder (destination_name is ignored by Interchange)
        t.automated = True; t.save = True; t.replace_existing = True
        try:
            tools.import_asset_tasks([t]); ok += 1
        except Exception as e:  # noqa: BLE001
            fail += 1; unreal.log_warning(f"[jarvis-import] import fail {os.path.basename(src)}: {e}")
    unreal.log(f"[jarvis-import] imported ok={ok} fail={fail}")

    reg = unreal.AssetRegistryHelpers.get_asset_registry(); nan = 0
    for a in reg.get_assets_by_path(DEST, recursive=True):
        try:
            obj = a.get_asset()
            if isinstance(obj, unreal.StaticMesh):
                s = obj.get_editor_property("nanite_settings")
                s.set_editor_property("enabled", True)
                obj.set_editor_property("nanite_settings", s)
                unreal.EditorAssetLibrary.save_loaded_asset(obj); nan += 1
        except Exception as e:  # noqa: BLE001 — glTF Nanite can error on some meshes; skip those
            unreal.log_warning(f"[jarvis-import] nanite skip: {e}")
    unreal.log(f"[jarvis-import] DONE — Nanite enabled on {nan} meshes")


main()
