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


def main():
    cats = _category_map()
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    tasks, planned = [], []
    for dp, _d, files in os.walk(GLB_ROOT):
        for f in files:
            if not f.lower().endswith((".glb", ".gltf")):
                continue
            src = os.path.join(dp, f)
            cat = cats.get(f.lower(), "prop")
            dest = f"{DEST_ROOT}/{cat}"
            asset = _safe(f)
            t = unreal.AssetImportTask()
            t.filename = src
            t.destination_path = dest
            t.destination_name = asset
            t.automated = True            # no dialogs
            t.save = True
            t.replace_existing = True
            tasks.append(t)
            rel = os.path.relpath(src, GLB_ROOT)
            planned.append((f"/models/{rel.replace(os.sep, '/')}", cat, f"{dest}/{asset}"))

    unreal.log(f"[uw-import] importing {len(tasks)} GLBs -> {DEST_ROOT}/<category>/")
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

    # coverage manifest (by_url for exact resolution, by_category for fallback pick).
    # Written under Content/UnderworldAssets so it stages into the .pak (UFS) and the C++
    # resolver can load it at runtime — ONE source of truth for glb-url -> /Game asset.
    by_url, by_cat = {}, {}
    for url, cat, path in planned:
        by_url[url] = path
        by_cat.setdefault(cat, []).append(path)
    payload = {"dest_root": DEST_ROOT, "total": len(planned),
               "categories": {k: len(v) for k, v in by_cat.items()},
               "by_url": by_url, "by_category": by_cat}
    proj = os.path.dirname(HERE)  # .../ue5-project
    content_dir = os.path.join(proj, "Content", "UnderworldAssets")
    os.makedirs(content_dir, exist_ok=True)
    for dst in (os.path.join(HERE, "manifest.json"), os.path.join(content_dir, "manifest.json")):
        json.dump(payload, open(dst, "w"), indent=2)
    unreal.log(f"[uw-import] DONE {len(planned)} assets, {len(by_cat)} categories -> manifest.json")


main()
