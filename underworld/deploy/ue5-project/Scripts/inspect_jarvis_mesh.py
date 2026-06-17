#!/usr/bin/env python3
import json, os, unreal

out_path = "/tmp/jarvis_mesh_inspect.json"
paths = [
    "/Game/JarvisAssets/01_command_atrium/jarvis_command_atrium_data_orb/jarvis_command_atrium_data_orb",
    "/Game/JarvisAssets/01_command_atrium/jarvis_command_atrium_data_orb_core/jarvis_command_atrium_data_orb_core",
    "/Game/JarvisAssets/01_command_atrium/jarvis_command_atrium_orb_wireframe_lattice/jarvis_command_atrium_orb_wireframe_lattice",
]

results = []
for p in paths:
    entry = {"path": p, "loaded": False, "type": None, "num_lods": 0, "sections": 0, "bounds": None}
    try:
        mesh = unreal.load_asset(p)
        entry["loaded"] = mesh is not None
        if mesh is None:
            continue
        entry["type"] = type(mesh).__name__
        if not isinstance(mesh, unreal.StaticMesh):
            continue
        entry["num_lods"] = mesh.get_num_lods()
        entry["sections"] = mesh.get_num_sections(0) if entry["num_lods"] > 0 else 0
        bounds = mesh.get_bounds()
        entry["bounds"] = {
            "origin": [bounds.origin.x, bounds.origin.y, bounds.origin.z],
            "extent": [bounds.box_extent.x, bounds.box_extent.y, bounds.box_extent.z],
        }
    except Exception as e:
        entry["error"] = str(e)
    results.append(entry)

with open(out_path, "w") as f:
    json.dump(results, f, indent=2)
unreal.log(f"[inspect] wrote {out_path}")
