"""Bulk-import the existing 1,488 Underworld GLBs into UE5 as Nanite static meshes.

Run inside the Unreal Editor's Python console (Window → Python, or `-ExecutePythonScript`):

    py "Content/Python/import_underworld_glbs.py"

It walks the WebGL app's asset tree (the same paid Tripo art the Three.js renderer
uses), imports each GLB via Interchange into /Game/Underworld/Meshes/<stage>/, and
enables Nanite on every static mesh so the city/props render at film density.

Requires: the editor open on Underworld.uproject; the GLBs present at GLB_ROOT.
Idempotent-ish: re-importing overwrites the same asset path.
"""
import os
import unreal

# The 1,488 GLBs live in the WebGL app's public dir (one source of art for both renderers).
GLB_ROOT = os.path.normpath(os.path.join(
    unreal.Paths.project_dir(), "..", "..", "web", "public", "models"))
DEST_ROOT = "/Game/Underworld/Meshes"


def _task(glb_path: str, dest_pkg: str) -> unreal.AssetImportTask:
    t = unreal.AssetImportTask()
    t.filename = glb_path
    t.destination_path = dest_pkg
    t.automated = True
    t.replace_existing = True
    t.save = True
    # Interchange glTF pipeline handles .glb meshes + materials + textures.
    return t


def main():
    if not os.path.isdir(GLB_ROOT):
        unreal.log_error("GLB_ROOT not found: %s" % GLB_ROOT)
        return

    tools = unreal.AssetToolsHelpers.get_asset_tools()
    tasks, count = [], 0
    for root, _dirs, files in os.walk(GLB_ROOT):
        for f in files:
            if not f.lower().endswith((".glb", ".gltf")):
                continue
            rel = os.path.relpath(root, GLB_ROOT).replace("\\", "/").strip(".")
            dest = ("%s/%s" % (DEST_ROOT, rel)).rstrip("/")
            tasks.append(_task(os.path.join(root, f), dest))
            count += 1

    unreal.log("Underworld: importing %d GLB/GLTF assets…" % count)
    # Batch in chunks so the editor stays responsive.
    for i in range(0, len(tasks), 50):
        tools.import_asset_tasks(tasks[i:i + 50])

    # Enable Nanite on every imported static mesh.
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    assets = reg.get_assets_by_path(DEST_ROOT, recursive=True)
    n = 0
    for a in assets:
        obj = a.get_asset()
        if isinstance(obj, unreal.StaticMesh):
            settings = obj.get_editor_property("nanite_settings")
            settings.set_editor_property("enabled", True)
            obj.set_editor_property("nanite_settings", settings)
            unreal.EditorAssetLibrary.save_loaded_asset(obj)
            n += 1
    unreal.log("Underworld: Nanite enabled on %d meshes. Done." % n)


if __name__ == "__main__":
    main()
