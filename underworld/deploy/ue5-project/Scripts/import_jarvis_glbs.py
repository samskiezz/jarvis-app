#!/usr/bin/env python3
"""import_jarvis_glbs.py — HEADLESS UE5 commandlet.

Imports every JARVIS chamber GLB via the Interchange glTF pipeline (PBR materials),
into /Game/JarvisAssets/<scene>/<Name>, then enables Nanite on every StaticMesh.
Run via:  UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=import_jarvis_glbs.py -unattended -nullrhi
Mirrors the proven Underworld import_glbs.py flow.
"""
from __future__ import annotations
import json, os, sys, unreal

GLB_ROOT = os.environ.get("JARVIS_GLB_ROOT", "/opt/jarvis-app-1/public/immersive/assets")
DEST = "/Game/JarvisAssets"
HERE = os.path.dirname(os.path.abspath(__file__))


def _manifest() -> dict:
    proj = os.path.dirname(HERE)
    p = os.path.join(proj, "Content", "JarvisAssets", "manifest.json")
    if not os.path.exists(p):
        unreal.log(f"[jarvis-import] manifest absent — generating")
        import subprocess
        subprocess.run([sys.executable, os.path.join(HERE, "gen_jarvis_manifest.py")], check=False)
    with open(p) as fh:
        return json.load(fh)


def main():
    man = _manifest()
    by_url = man.get("by_url", {})
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    tasks = []
    for url, gpath in by_url.items():
        rel = url[len("/immersive/assets/"):] if url.startswith("/immersive/assets/") else url.lstrip("/")
        src = os.path.join(GLB_ROOT, rel)
        if not os.path.exists(src):
            unreal.log_warning(f"[jarvis-import] missing: {src}")
            continue
        dest, asset = gpath.rsplit("/", 1)
        t = unreal.AssetImportTask()
        t.filename = src
        t.destination_path = dest
        t.destination_name = asset
        t.automated = True
        t.save = True
        t.replace_existing = True
        tasks.append(t)

    unreal.log(f"[jarvis-import] importing {len(tasks)} JARVIS GLBs via Interchange")
    for i in range(0, len(tasks), 64):
        try:
            tools.import_asset_tasks(tasks[i:i + 64])
        except Exception as e:  # noqa: BLE001
            unreal.log_warning(f"[jarvis-import] batch error: {e}")

    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    nanite = 0
    for a in reg.get_assets_by_path(DEST, recursive=True):
        obj = a.get_asset()
        if isinstance(obj, unreal.StaticMesh):
            s = obj.get_editor_property("nanite_settings")
            s.set_editor_property("enabled", True)
            obj.set_editor_property("nanite_settings", s)
            unreal.EditorAssetLibrary.save_loaded_asset(obj)
            nanite += 1
    unreal.log(f"[jarvis-import] DONE — {len(tasks)} import tasks, Nanite enabled on {nanite} meshes")


main()
