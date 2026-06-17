#!/usr/bin/env python3
"""make_underworld_level.py — author the /Game/Maps/Underworld level HEADLESS (UE5.5).

Bootstraps the playable Underworld map so the packaged game can run against the live
backend scene-state contract without manual Editor placement:
  • one AUnderworldWorldManager actor — its MinionClass/PlayableMinionClass are pointed
    at the C++ base classes (you can swap in BPs later once skeletal meshes exist);
    its Sun property is wired to the level directional light.
  • lighting + atmosphere + height fog + a film-grade unbound PostProcessVolume.
  • a large ground plane so streamed GLB chunks have something to sit on.
  • a PlayerStart + an AUnderworldSpectatorPawn auto-activated for Player0.
  • sets GameDefaultMap so the cooked game boots into Underworld.

Run: UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=Scripts/make_underworld_level.py \
       -unattended -nullrhi -stdout -ddc=InstalledNoZenLocalFallback
"""
from __future__ import annotations
import os
import unreal

MAP_PKG = "/Game/Maps/Underworld"
HERE = os.path.dirname(os.path.abspath(__file__))

EAL = unreal.EditorAssetLibrary
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
LES = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)


def build_level():
    rebuilding = EAL.does_asset_exist(MAP_PKG)
    if rebuilding:
        LES.load_level(MAP_PKG)
        existing = {type(a).__name__ for a in EAS.get_all_level_actors()}
        unreal.log(f"[uw-level] patching existing map; actors present: {sorted(existing)}")
    else:
        LES.new_level(MAP_PKG)
        existing = set()

    def have(cls):
        return cls.__name__ in existing

    def spawn(cls, loc, rot=(0, 0, 0)):
        if have(cls):
            return None
        return EAS.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(*rot))

    # — world manager (the brain that reads scene-state) —
    wm = spawn(unreal.UnderworldWorldManager, (0, 0, 200))
    if wm:
        # Use the C++ base classes until art-heavy BP_Minion/BP_PlayableMinion are authored.
        minion_cls = unreal.load_class(None, "/Script/Underworld.UnderworldMinion")
        playable_cls = unreal.load_class(None, "/Script/Underworld.UnderworldPlayableMinion")
        if minion_cls:
            wm.set_editor_property("MinionClass", minion_cls)
        if playable_cls:
            wm.set_editor_property("PlayableMinionClass", playable_cls)
        unreal.log("[uw-level] UnderworldWorldManager placed")

    # — sun (rotated by scene-state time-of-day) —
    sun = spawn(unreal.DirectionalLight, (0, 0, 1000), (-50, 45, 0))
    if sun and wm:
        wm.set_editor_property("Sun", sun)
        unreal.log("[uw-level] Sun wired to world manager")

    # — atmosphere —
    spawn(unreal.SkyLight, (0, 0, 500))
    spawn(unreal.SkyAtmosphere, (0, 0, 0))
    fog = spawn(unreal.ExponentialHeightFog, (0, 0, 0))
    if fog is None and have(unreal.ExponentialHeightFog):
        fog = next((a for a in EAS.get_all_level_actors()
                    if isinstance(a, unreal.ExponentialHeightFog)), None)
    if fog:
        fc = fog.component
        for name in ("enable_volumetric_fog", "b_enable_volumetric_fog", "volumetric_fog"):
            try:
                fc.set_editor_property(name, True)
                break
            except Exception:
                continue
        for name, val in (("volumetric_fog_scattering_distribution", 0.35),
                          ("fog_density", 0.025)):
            try:
                fc.set_editor_property(name, val)
            except Exception:
                pass

    # — film-grade post process (Sims / GTA5-class look) —
    ppv = spawn(unreal.PostProcessVolume, (0, 0, 0))
    if ppv:
        ppv.set_editor_property("unbound", True)
        s = ppv.settings
        try:
            s.bloom_intensity = 1.1;              s.override_bloom_intensity = True
            s.vignette_intensity = 0.4;           s.override_vignette_intensity = True
            s.scene_fringe_intensity = 0.5;       s.override_scene_fringe_intensity = True
            s.film_toe = 0.55;                    s.override_film_toe = True
            s.color_saturation = unreal.Vector4(1.05, 1.05, 1.12, 1.0)
            s.override_color_saturation = True
            s.color_contrast = unreal.Vector4(1.06, 1.06, 1.06, 1.0)
            s.override_color_contrast = True
            s.auto_exposure_method = unreal.AutoExposureMethod.AEM_MANUAL
            s.override_auto_exposure_method = True
            s.auto_exposure_bias = 0.4;           s.override_auto_exposure_bias = True
            ppv.set_editor_property("settings", s)
            unreal.log("[uw-level] PostProcessVolume grade applied")
        except Exception as e:
            unreal.log_warning(f"[uw-level] PPV grade partial: {e}")

    # — ground plane so streamed chunks don't float in void —
    if not have(unreal.StaticMeshActor):
        plane = EAS.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, -50))
        if plane:
            mesh = unreal.load_asset("/Engine/BasicShapes/Plane")
            if mesh:
                plane.static_mesh_component.set_static_mesh(mesh)
                plane.set_actor_scale3d(unreal.Vector(1000, 1000, 1))
                # simple dark-grey default material so it isn't bright white
                mat = unreal.load_asset("/Engine/BasicShapes/BasicShapeMaterial")
                if mat:
                    plane.static_mesh_component.set_material(0, mat)
            unreal.log("[uw-level] ground plane placed")

    # — player start for the spectator / possessed pawn —
    spawn(unreal.PlayerStart, (0, 0, 200))

    # — Pixel-Streaming default spectator view —
    cam = spawn(unreal.UnderworldSpectatorPawn, (0, 0, 500))
    if cam:
        try:
            cam.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
        except Exception:
            pass
        unreal.log("[uw-level] spectator pawn placed")

    LES.save_current_level()
    unreal.log(f"[uw-level] saved {MAP_PKG}")


def set_default_map():
    ini = os.path.join(unreal.Paths.project_config_dir(), "DefaultEngine.ini")
    section = "[/Script/EngineSettings.GameMapsSettings]"
    target = f"GameDefaultMap={MAP_PKG}"
    body = ""
    if os.path.exists(ini):
        body = open(ini).read()
    if target in body:
        return
    block = f"\n{section}\n{target}\nEditorStartupMap={MAP_PKG}\n"
    with open(ini, "a") as f:
        f.write(block)
    unreal.log(f"[uw-level] DefaultEngine.ini -> {target}")


def main():
    build_level()
    set_default_map()
    unreal.log("[uw-level] Underworld level authoring complete")


main()
