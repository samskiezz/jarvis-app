"""import_glbs.py — headless UE5 commandlet: batch-import every Underworld GLB into the
project as cooked StaticMesh assets (Interchange glTF importer, full PBR materials +
Nanite). Run by run-import.sh via UnrealEditor-Cmd; no manual clicking.

Convention (the contract the C++ world spawner relies on):
    web/public/models/<...>/<name>.glb   --import-->   /Game/UnderworldAssets/<category>/<Name>

<category> comes from asset_catalog.json (prop/wall/residential/commercial/civic/tower/…).
The spawner resolves a layout slot's GLB by (category, basename) → that /Game path, so the
deterministic backend pick lands on the right mesh. Also writes manifest.json (coverage +
exact url→asset map) next to this script for inspection.

These assets cook into the package because DefaultGame.ini lists /Game/UnderworldAssets in
DirectoriesToAlwaysCook (they're referenced only by runtime string, not hard refs).
"""
from __future__ import annotations

import json
import os
import re
import unreal

GLB_ROOT = os.environ.get("UW_GLB_ROOT", "/opt/jarvis-app-1/underworld/web/public/models")
CATALOG = os.environ.get("UW_CATALOG", os.path.join(GLB_ROOT, "asset_catalog.json"))
DEST_ROOT = "/Game/UnderworldAssets"
HERE = os.path.dirname(os.path.abspath(__file__))


def _safe(name: str) -> str:
    """UE asset-name rules: alnum + underscore; mirror this in the C++ resolver."""
    return re.sub(r"[^A-Za-z0-9_]", "_", os.path.splitext(name)[0])


def _category_map() -> dict:
    """url-basename -> category, from the same catalog the web/Omniverse renderers use."""
    out = {}
    try:
        d = json.load(open(CATALOG))
        for a in d.get("assets", []):
            url = a.get("url") or ""
            cat = a.get("category") or "prop"
            if url:
                out[os.path.basename(url).lower()] = cat
    except Exception as e:  # noqa: BLE001
        unreal.log_warning(f"[uw-import] catalog unreadable ({e}); defaulting all -> prop")
    return out


def _load_or_build_manifest() -> dict:
    """The manifest (glb-url → /Game path) is the SINGLE SOURCE OF TRUTH, generated headlessly by
    gen_manifest.py (correct catalog parse + collision-free unique paths). Prefer it; if it's
    missing, build it now by shelling gen_manifest.py so the Editor import always matches the C++
    resolver and the WebGL/backend urls exactly."""
    proj = os.path.dirname(HERE)
    man_path = os.path.join(proj, "Content", "UnderworldAssets", "manifest.json")
    if not os.path.exists(man_path):
        gen = os.path.join(HERE, "gen_manifest.py")
        unreal.log(f"[uw-import] manifest absent — generating via {gen}")
        import subprocess
        subprocess.run([os.sys.executable, gen], check=False)
    with open(man_path) as fh:
        return json.load(fh)


def main():
    man = _load_or_build_manifest()
    by_url = man.get("by_url", {})
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    tasks = []
    for url, gpath in by_url.items():
        rel = url[len("/models/"):] if url.startswith("/models/") else url.lstrip("/")
        src = os.path.join(GLB_ROOT, rel)
        if not os.path.exists(src):
            unreal.log_warning(f"[uw-import] missing source: {src}")
            continue
        dest, asset = gpath.rsplit("/", 1)         # /Game/UnderworldAssets/<cat>/<Name>
        t = unreal.AssetImportTask()
        t.filename = src
        t.destination_path = dest
        t.destination_name = asset
        t.automated = True            # no dialogs
        t.save = True
        t.replace_existing = True
        tasks.append(t)

    unreal.log(f"[uw-import] importing {len(tasks)} GLBs at the manifest's exact /Game paths")
    # import in batches so a single bad asset can't sink the whole run
    BATCH = 64
    done = 0
    for i in range(0, len(tasks), BATCH):
        chunk = tasks[i:i + BATCH]
        try:
            tools.import_asset_tasks(chunk)
            done += len(chunk)
        except Exception as e:  # noqa: BLE001
            unreal.log_warning(f"[uw-import] batch {i//BATCH} error: {e}")
        unreal.log(f"[uw-import] {min(done, len(tasks))}/{len(tasks)}")

    # Enable Nanite on every imported StaticMesh (city/props render at film density).
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    nanite = 0
    for a in reg.get_assets_by_path(DEST_ROOT, recursive=True):
        obj = a.get_asset()
        if isinstance(obj, unreal.StaticMesh):
            s = obj.get_editor_property("nanite_settings")
            s.set_editor_property("enabled", True)
            obj.set_editor_property("nanite_settings", s)
            unreal.EditorAssetLibrary.save_loaded_asset(obj)
            nanite += 1
    unreal.log(f"[uw-import] DONE — imported {done}/{len(tasks)}, Nanite on {nanite}. "
               f"Manifest is authoritative (already written by gen_manifest.py).")


main()
