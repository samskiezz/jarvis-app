#!/usr/bin/env python3
import json, os, unreal

out_path = "/tmp/jarvis_level_inspect.json"
MAP_PKG = "/Game/Maps/JarvisHUD"

unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(MAP_PKG)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
actors = eas.get_all_level_actors()

results = []
for a in actors:
    entry = {
        "name": a.get_name(),
        "class": type(a).__name__,
        "location": [a.get_actor_location().x, a.get_actor_location().y, a.get_actor_location().z],
        "rotation": [a.get_actor_rotation().pitch, a.get_actor_rotation().yaw, a.get_actor_rotation().roll],
        "scale": [a.get_actor_scale3d().x, a.get_actor_scale3d().y, a.get_actor_scale3d().z],
    }
    # Manager-specific
    if isinstance(a, unreal.JarvisHudManager):
        try:
            entry["default_chamber"] = a.get_editor_property("DefaultChamber")
        except Exception as e:
            entry["default_chamber_error"] = str(e)
        try:
            mat = a.get_editor_property("HolographicMasterMaterial")
            entry["material"] = mat.get_path_name() if mat else None
        except Exception as e:
            entry["material_error"] = str(e)
    # Camera-specific
    if isinstance(a, unreal.CameraActor):
        try:
            entry["auto_activate"] = str(a.get_editor_property("auto_activate_for_player"))
        except Exception as e:
            entry["auto_activate_error"] = str(e)
    results.append(entry)

with open(out_path, "w") as f:
    json.dump(results, f, indent=2)
unreal.log(f"[inspect_level] wrote {out_path}")
