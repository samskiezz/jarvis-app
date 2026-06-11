#!/usr/bin/env python3
"""make_jarvis_level.py — author the /Game/Maps/JarvisHUD level HEADLESS (UE5.5).

Builds the cinematic JARVIS chamber the packaged Pixel-Streaming build boots into:
  • a holographic master material  M_JarvisHolo  (unlit, translucent, Fresnel rim glow,
    animated scanline, additive) applied to every chamber prop by AJarvisHudManager.
  • one AJarvisHudManager actor at origin — it reads Content/JarvisAssets/manifest.json on
    BeginPlay and spawns the chamber props at their anchor transforms (see JarvisHudManager.cpp).
  • lighting (SkyLight + SkyAtmosphere + a soft key light + height fog) so Lumen reads the holo
    rims, an orbit CameraActor auto-activated for Player0 (the Pixel-Streaming view), a PlayerStart.
  • sets GameDefaultMap so the cooked game boots straight into the chamber.

Run: UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=make_jarvis_level.py \
       -unattended -nullrhi -stdout -ddc=InstalledNoZenLocalFallback
"""
from __future__ import annotations
import json, os, unreal

MAP_PKG   = "/Game/Maps/JarvisHUD"
MAT_PKG   = "/Game/JarvisAssets/M_JarvisHolo"
MANIFEST  = os.path.join(unreal.Paths.project_content_dir(), "JarvisAssets", "manifest.json")

ME  = unreal.MaterialEditingLibrary
AT  = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary


def _first_chamber() -> str:
    try:
        d = json.load(open(MANIFEST))
        scenes = sorted((d.get("by_scene") or {}).keys())
        return scenes[0] if scenes else "01_command_atrium"
    except Exception as e:
        unreal.log_warning(f"[level] manifest read failed ({e}); default chamber")
        return "01_command_atrium"


def make_holo_material():
    """A true-hologram master material: unlit + translucent so it glows under bloom, a Fresnel
    rim that brightens edges, a scrolling scanline, additive composite. Cyan JARVIS palette."""
    if EAL.does_asset_exist(MAT_PKG):
        return unreal.load_asset(MAT_PKG)
    mat = AT.create_asset("M_JarvisHolo", "/Game/JarvisAssets", unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("two_sided", True)

    # base holo tint (cyan) — exposed as a vector param so chambers can re-tint per plane
    tint = ME.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, -760, -40)
    tint.set_editor_property("parameter_name", "HoloColor")
    tint.set_editor_property("default_value", unreal.LinearColor(0.10, 0.85, 1.0, 1.0))

    glow = ME.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -760, 110)
    glow.set_editor_property("parameter_name", "GlowStrength")
    glow.set_editor_property("default_value", 2.6)

    # Fresnel rim — bright edges, the signature hologram silhouette
    fres = ME.create_material_expression(mat, unreal.MaterialExpressionFresnel, -560, 200)
    fres.set_editor_property("exponent", 2.2)
    fres.set_editor_property("base_reflect_fraction", 0.18)

    # scanline: frac(WorldPos.Z * density - Time*speed) -> thin moving bands
    wpos = ME.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1180, 430)
    mask = ME.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -1000, 430)
    mask.set_editor_property("r", False); mask.set_editor_property("g", False)
    mask.set_editor_property("b", True);  mask.set_editor_property("a", False)
    dens = ME.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -1000, 560)
    dens.set_editor_property("parameter_name", "ScanDensity"); dens.set_editor_property("default_value", 0.06)
    muld = ME.create_material_expression(mat, unreal.MaterialExpressionMultiply, -840, 460)
    time = ME.create_material_expression(mat, unreal.MaterialExpressionTime, -1000, 690)
    tspd = ME.create_material_expression(mat, unreal.MaterialExpressionMultiply, -840, 690)
    tspdC = ME.create_material_expression(mat, unreal.MaterialExpressionConstant, -1000, 800)
    tspdC.set_editor_property("r", 1.4)
    sub  = ME.create_material_expression(mat, unreal.MaterialExpressionSubtract, -700, 520)
    frac = ME.create_material_expression(mat, unreal.MaterialExpressionFrac, -560, 520)
    # scan brightness floor so bands modulate rather than fully black out
    scanAdd = ME.create_material_expression(mat, unreal.MaterialExpressionAdd, -420, 470)
    scanFloor = ME.create_material_expression(mat, unreal.MaterialExpressionConstant, -560, 660)
    scanFloor.set_editor_property("r", 0.55)

    # emissive = tint * GlowStrength * Fresnel * scan
    mulFG = ME.create_material_expression(mat, unreal.MaterialExpressionMultiply, -380, 80)
    mulTint = ME.create_material_expression(mat, unreal.MaterialExpressionMultiply, -220, 40)
    mulScan = ME.create_material_expression(mat, unreal.MaterialExpressionMultiply, -80, 60)

    ME.connect_material_expressions(wpos, "", mask, "")
    ME.connect_material_expressions(mask, "", muld, "A")
    ME.connect_material_expressions(dens, "", muld, "B")
    ME.connect_material_expressions(time, "", tspd, "A")
    ME.connect_material_expressions(tspdC, "", tspd, "B")
    ME.connect_material_expressions(muld, "", sub, "A")
    ME.connect_material_expressions(tspd, "", sub, "B")
    ME.connect_material_expressions(sub, "", frac, "")
    ME.connect_material_expressions(frac, "", scanAdd, "A")
    ME.connect_material_expressions(scanFloor, "", scanAdd, "B")

    ME.connect_material_expressions(glow, "", mulFG, "A")
    ME.connect_material_expressions(fres, "", mulFG, "B")
    ME.connect_material_expressions(tint, "", mulTint, "A")
    ME.connect_material_expressions(mulFG, "", mulTint, "B")
    ME.connect_material_expressions(mulTint, "", mulScan, "A")
    ME.connect_material_expressions(scanAdd, "", mulScan, "B")
    ME.connect_material_property(mulScan, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)

    # opacity = Fresnel rim (edges solid, faces see-through) — the hologram volume read
    opacity = ME.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -380, 320)
    opacity.set_editor_property("parameter_name", "BaseOpacity"); opacity.set_editor_property("default_value", 0.22)
    opAdd = ME.create_material_expression(mat, unreal.MaterialExpressionAdd, -220, 300)
    ME.connect_material_expressions(fres, "", opAdd, "A")
    ME.connect_material_expressions(opacity, "", opAdd, "B")
    ME.connect_material_property(opAdd, "", unreal.MaterialProperty.MP_OPACITY)

    ME.recompile_material(mat)
    EAL.save_asset(MAT_PKG)
    unreal.log(f"[level] holo material built: {MAT_PKG}")
    return mat


def build_level(mat, chamber):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    les.new_level(MAP_PKG)

    def spawn(cls, loc, rot=(0, 0, 0)):
        return eas.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(*rot))

    # — the chamber assembler —
    hud = spawn(unreal.JarvisHudManager, (0, 0, 0))
    if hud:
        hud.set_editor_property("HolographicMasterMaterial", mat)
        hud.set_editor_property("DefaultChamber", chamber)
        unreal.log(f"[level] JarvisHudManager placed; chamber='{chamber}'")
    else:
        unreal.log_warning("[level] FAILED to spawn JarvisHudManager (class not compiled?)")

    # — atmosphere & light so Lumen + bloom read the holo rims —
    spawn(unreal.DirectionalLight, (0, 0, 600), (-50, -45, 0))
    sky = spawn(unreal.SkyLight, (0, 0, 400))
    if sky:
        try: sky.skylight_component.set_editor_property("intensity", 1.2)
        except Exception: pass
    spawn(unreal.SkyAtmosphere, (0, 0, 0))
    fog = spawn(unreal.ExponentialHeightFog, (0, 0, 0))
    if fog:
        try:
            fc = fog.component
            fc.set_editor_property("volumetric_fog", True)            # god rays through the holograms
            fc.set_editor_property("volumetric_fog_scattering_distribution", 0.35)
            fc.set_editor_property("fog_density", 0.035)
        except Exception as e:
            unreal.log_warning(f"[level] volumetric fog props: {e}")

    # — FILM GRADE: the unbound PostProcessVolume (the GTA5-class look) —
    ppv = spawn(unreal.PostProcessVolume, (0, 0, 0))
    if ppv:
        ppv.set_editor_property("unbound", True)
        s = ppv.settings
        try:
            s.bloom_intensity = 1.15;            s.override_bloom_intensity = True
            s.vignette_intensity = 0.45;          s.override_vignette_intensity = True
            s.scene_fringe_intensity = 0.6;       s.override_scene_fringe_intensity = True
            s.film_toe = 0.55;                    s.override_film_toe = True
            s.color_saturation = unreal.Vector4(1.05, 1.05, 1.12, 1.0); s.override_color_saturation = True
            s.color_contrast   = unreal.Vector4(1.06, 1.06, 1.06, 1.0); s.override_color_contrast = True
            s.auto_exposure_method = unreal.AutoExposureMethod.AEM_MANUAL; s.override_auto_exposure_method = True
            s.auto_exposure_bias = 0.4;           s.override_auto_exposure_bias = True
            s.depth_of_field_fstop = 2.2;         s.override_depth_of_field_fstop = True
            s.depth_of_field_focal_distance = 900.0; s.override_depth_of_field_focal_distance = True
            ppv.set_editor_property("settings", s)
            unreal.log("[level] PostProcessVolume grade applied (bloom/vignette/CA/filmic/DOF)")
        except Exception as e:
            unreal.log_warning(f"[level] PPV grade partial: {e}")

    # — Pixel-Streaming view: an orbit camera auto-activated for Player0, + a PlayerStart —
    cam = spawn(unreal.CameraActor, (-820, -560, 360), (-14, 35, 0))
    if cam:
        try: cam.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
        except Exception: pass
    spawn(unreal.PlayerStart, (-820, -560, 200), (0, 35, 0))

    les.save_current_level()
    unreal.log(f"[level] saved {MAP_PKG}")


def set_default_map():
    """Boot the packaged game straight into the chamber."""
    ini = os.path.join(unreal.Paths.project_config_dir(), "DefaultEngine.ini")
    section = "[/Script/EngineSettings.GameMapsSettings]"
    lines = []
    if os.path.exists(ini):
        lines = open(ini).read().splitlines()
    body = "\n".join(lines)
    if "GameDefaultMap=" + MAP_PKG in body:
        return
    block = (f"\n{section}\nGameDefaultMap={MAP_PKG}\nEditorStartupMap={MAP_PKG}\n"
             f"GameInstanceClass=/Script/Engine.GameInstance\n")
    with open(ini, "a") as f:
        f.write(block)
    unreal.log(f"[level] DefaultEngine.ini -> GameDefaultMap={MAP_PKG}")


def main():
    mat = make_holo_material()
    build_level(mat, _first_chamber())
    set_default_map()
    unreal.log("[level] JarvisHUD authoring complete")


main()
