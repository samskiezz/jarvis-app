import unreal
unreal.log("UE_LVL start (full editor)")
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
les.new_level("/Game/Maps/Underworld")

sun = eas.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 800), unreal.Rotator(-45, 30, 0))
for cls in (unreal.SkyAtmosphere, unreal.SkyLight, unreal.ExponentialHeightFog):
    try:
        eas.spawn_actor_from_class(cls, unreal.Vector(0, 0, 300))
    except Exception as e:
        unreal.log_warning(f"{cls} {e}")

# ground plane
gp = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
pl = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Plane")
if pl:
    gp.static_mesh_component.set_static_mesh(pl)
    gp.set_actor_scale3d(unreal.Vector(400, 400, 1))

# the world manager — spawns + drives minions from the live scene-state; point it at the C++ minion
wm_cls = unreal.load_class(None, "/Script/Underworld.UnderworldWorldManager")
minion_cls = unreal.load_class(None, "/Script/Underworld.UnderworldMinion")
if wm_cls:
    wm = eas.spawn_actor_from_class(wm_cls, unreal.Vector(0, 0, 0))
    try:
        if minion_cls:
            wm.set_editor_property("MinionClass", minion_cls)
        if sun:
            wm.set_editor_property("Sun", sun)
        unreal.log("UE_LVL worldmanager configured (MinionClass + Sun)")
    except Exception as e:
        unreal.log_warning(f"wm props {e}")
else:
    unreal.log_error("UE_LVL worldmanager class NOT found")

les.save_current_level()
unreal.log("UE_LEVEL_OK saved /Game/Maps/Underworld")
unreal.SystemLibrary.quit_editor()
