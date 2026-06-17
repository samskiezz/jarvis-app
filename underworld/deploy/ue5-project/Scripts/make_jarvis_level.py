#!/usr/bin/env python3
"""make_jarvis_level.py — author the /Game/Maps/JarvisHUD level HEADLESS (UE5.5).

Builds the cinematic JARVIS chamber the packaged Pixel-Streaming build boots into:
  • a holographic master material  M_JarvisHolo  (unlit, translucent, Fresnel rim glow,
    animated scanline) applied to every chamber prop by AJarvisHudManager.
  • a dark star-field backdrop sphere so the additive/translucent holograms read clearly.
  • a bright key light + point light so the chamber pops against the backdrop.
  • one AJarvisHudManager actor at origin — it reads Content/JarvisAssets/manifest.json on
    BeginPlay and spawns the chamber props at their anchor transforms (see JarvisHudManager.cpp).
  • lighting (SkyLight + SkyAtmosphere + height fog) + film-grade PostProcessVolume.
  • an orbit CameraActor auto-activated for Player0 (the Pixel-Streaming view), a PlayerStart.
  • sets GameDefaultMap so the cooked game boots straight into the chamber.

Run: UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=make_jarvis_level.py \
       -unattended -nullrhi -stdout -ddc=InstalledNoZenLocalFallback
"""
from __future__ import annotations
import json, os, unreal

MAP_PKG   = "/Game/Maps/JarvisHUD"
MAT_PKG   = "/Game/JarvisAssets/M_JarvisHolo"
BACKDROP_PKG = "/Game/JarvisAssets/M_JarvisBackdrop"
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


def _delete_asset_if_exists(pkg: str):
    """Remove a stale asset so we can rebuild it idempotently."""
    try:
        if EAL.does_asset_exist(pkg):
            EAL.delete_asset(pkg)
            unreal.log(f"[level] deleted stale asset {pkg}")
    except Exception as e:
        unreal.log_warning(f"[level] could not delete {pkg}: {e}")


def make_holo_material():
    """Bright, solid-looking hologram: unlit + translucent + strong Fresnel rim + scanline."""
    _delete_asset_if_exists(MAT_PKG)
    mat = AT.create_asset("M_JarvisHolo", "/Game/JarvisAssets", unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("two_sided", True)

    # base holo tint (cyan)
    tint = ME.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, -760, -40)
    tint.set_editor_property("parameter_name", "HoloColor")
    tint.set_editor_property("default_value", unreal.LinearColor(0.25, 0.92, 1.0, 1.0))

    glow = ME.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -760, 110)
    glow.set_editor_property("parameter_name", "GlowStrength")
    glow.set_editor_property("default_value", 12.0)

    # Fresnel rim — bright edges
    fres = ME.create_material_expression(mat, unreal.MaterialExpressionFresnel, -560, 200)
    fres.set_editor_property("exponent", 2.5)
    fres.set_editor_property("base_reflect_fraction", 0.28)

    # scanline: frac(WorldPos.Z * density - Time*speed)
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
    scanAdd = ME.create_material_expression(mat, unreal.MaterialExpressionAdd, -420, 470)
    scanFloor = ME.create_material_expression(mat, unreal.MaterialExpressionConstant, -560, 660)
    scanFloor.set_editor_property("r", 0.85)

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

    # opacity = high base + Fresnel rim
    opacity = ME.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -380, 320)
    opacity.set_editor_property("parameter_name", "BaseOpacity"); opacity.set_editor_property("default_value", 0.90)
    opAdd = ME.create_material_expression(mat, unreal.MaterialExpressionAdd, -220, 300)
    ME.connect_material_expressions(fres, "", opAdd, "A")
    ME.connect_material_expressions(opacity, "", opAdd, "B")
    ME.connect_material_property(opAdd, "", unreal.MaterialProperty.MP_OPACITY)

    ME.recompile_material(mat)
    EAL.save_asset(MAT_PKG)
    unreal.log(f"[level] holo material built: {MAT_PKG}")
    return mat


def make_backdrop_material():
    """A faint deep-blue nebula backdrop so holograms are visible instead of against pure black."""
    _delete_asset_if_exists(BACKDROP_PKG)
    mat = AT.create_asset("M_JarvisBackdrop", "/Game/JarvisAssets", unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_OPAQUE)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("two_sided", True)

    # deep space blue
    color = ME.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -300, 0)
    color.set_editor_property("constant", unreal.LinearColor(0.08, 0.15, 0.28, 1.0))
    ME.connect_material_property(color, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    ME.recompile_material(mat)
    EAL.save_asset(BACKDROP_PKG)
    unreal.log(f"[level] backdrop material built: {BACKDROP_PKG}")
    return mat


def build_level(mat, backdrop_mat, chamber):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    rebuilding = EAL.does_asset_exist(MAP_PKG)
    if rebuilding:
        les.load_level(MAP_PKG)
        existing = {type(a).__name__ for a in eas.get_all_level_actors()}
        unreal.log(f"[level] patching existing map; actors present: {sorted(existing)}")
    else:
        les.new_level(MAP_PKG)
        existing = set()

    def have(cls):
        return cls.__name__ in existing

    def spawn(cls, loc, rot=(0, 0, 0)):
        if have(cls):
            return None
        return eas.spawn_actor_from_class(
            cls,
            unreal.Vector(*loc),
            unreal.Rotator(pitch=rot[0], yaw=rot[1], roll=rot[2]),
        )

    # — the chamber assembler —
    hud = spawn(unreal.JarvisHudManager, (0, 0, 0))
    if hud:
        hud.set_editor_property("HolographicMasterMaterial", mat)
        hud.set_editor_property("DefaultChamber", chamber)
        unreal.log(f"[level] JarvisHudManager placed; chamber='{chamber}'")

    # — atmosphere & light —
    spawn(unreal.DirectionalLight, (0, 0, 600), (-50, -45, 0))
    sky = spawn(unreal.SkyLight, (0, 0, 400))
    if sky:
        try:
            sky.skylight_component.set_editor_property("intensity", 1.5)
            sky.skylight_component.set_editor_property("lower_hemisphere_is_black_color", unreal.LinearColor(0.0, 0.0, 0.02, 1.0))
        except Exception:
            pass
    spawn(unreal.SkyAtmosphere, (0, 0, 0))
    fog = spawn(unreal.ExponentialHeightFog, (0, 0, 0))
    if fog is None and have(unreal.ExponentialHeightFog):
        fog = next((a for a in eas.get_all_level_actors()
                    if isinstance(a, unreal.ExponentialHeightFog)), None)
    if fog:
        fc = fog.component
        for name in ("enable_volumetric_fog", "b_enable_volumetric_fog", "volumetric_fog"):
            try:
                fc.set_editor_property(name, True)
                unreal.log(f"[level] volumetric fog ON (prop '{name}')")
                break
            except Exception:
                continue
        for name, val in (("volumetric_fog_scattering_distribution", 0.35), ("fog_density", 0.035)):
            try: fc.set_editor_property(name, val)
            except Exception: pass

    # — bright cyan point light on the hero hologram —
    pt = spawn(unreal.PointLight, (0, 0, 320))
    if pt:
        try:
            pt.set_editor_property("intensity", 15000.0)
            pt.set_editor_property("light_color", unreal.Color(40, 170, 255, 255))
            pt.set_editor_property("attenuation_radius", 2500.0)
            pt.set_editor_property("cast_shadows", False)
        except Exception as e:
            unreal.log_warning(f"[level] point light setup partial: {e}")

    # — backdrop sphere (deep-blue) so holos aren't against pure black —
    # Clear any previous backdrop StaticMeshActor so material updates always apply.
    for a in list(eas.get_all_level_actors()):
        if isinstance(a, unreal.StaticMeshActor):
            try:
                eas.destroy_actor(a)
            except Exception:
                pass
    sphere_mesh = unreal.load_asset("/Engine/BasicShapes/Sphere")
    if sphere_mesh:
        backdrop = eas.spawn_actor_from_class(
            unreal.StaticMeshActor,
            unreal.Vector(0, 0, 0),
            unreal.Rotator(0, 0, 0),
        )
        comp = backdrop.static_mesh_component
        comp.set_static_mesh(sphere_mesh)
        comp.set_material(0, backdrop_mat)
        backdrop.set_actor_scale3d(unreal.Vector(120, 120, 120))
        try:
            backdrop.set_mobility(unreal.ComponentMobility.STATIC)
        except Exception:
            pass
        try:
            comp.set_editor_property("cast_shadow", False)
        except Exception:
            pass
        unreal.log("[level] backdrop sphere placed")

    # — FILM GRADE —
    ppv = spawn(unreal.PostProcessVolume, (0, 0, 0))
    if ppv:
        ppv.set_editor_property("unbound", True)
        s = ppv.settings
        try:
            s.bloom_intensity = 1.6;              s.override_bloom_intensity = True
            s.vignette_intensity = 0.45;          s.override_vignette_intensity = True
            s.scene_fringe_intensity = 0.6;       s.override_scene_fringe_intensity = True
            s.film_toe = 0.40;                    s.override_film_toe = True
            s.color_saturation = unreal.Vector4(1.05, 1.05, 1.12, 1.0); s.override_color_saturation = True
            s.color_contrast   = unreal.Vector4(1.04, 1.04, 1.04, 1.0); s.override_color_contrast = True
            s.auto_exposure_method = unreal.AutoExposureMethod.AEM_MANUAL; s.override_auto_exposure_method = True
            s.auto_exposure_bias = 1.2;           s.override_auto_exposure_bias = True
            s.depth_of_field_fstop = 2.2;         s.override_depth_of_field_fstop = True
            s.depth_of_field_focal_distance = 600.0; s.override_depth_of_field_focal_distance = True
            ppv.set_editor_property("settings", s)
            unreal.log("[level] PostProcessVolume grade applied")
        except Exception as e:
            unreal.log_warning(f"[level] PPV grade partial: {e}")

    # — Pixel-Streaming view: closer orbit camera, + PlayerStart —
    CAM_LOC = (-420, -300, 240)
    CAM_ROT = (-16, 38, 0)
    PS_LOC  = (-420, -300, 130)
    PS_ROT  = (0, 38, 0)

    cam = spawn(unreal.CameraActor, CAM_LOC, CAM_ROT)
    if cam is None and have(unreal.CameraActor):
        cam = next((a for a in eas.get_all_level_actors() if isinstance(a, unreal.CameraActor)), None)
    if cam:
        try:
            cam.set_actor_location_and_rotation(
                unreal.Vector(*CAM_LOC),
                unreal.Rotator(pitch=CAM_ROT[0], yaw=CAM_ROT[1], roll=CAM_ROT[2]),
                False, True
            )
            cam.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
        except Exception as e:
            unreal.log_warning(f"[level] camera patch failed: {e}")

    ps = spawn(unreal.PlayerStart, PS_LOC, PS_ROT)
    if ps is None and have(unreal.PlayerStart):
        ps = next((a for a in eas.get_all_level_actors() if isinstance(a, unreal.PlayerStart)), None)
    if ps:
        try:
            ps.set_actor_location_and_rotation(
                unreal.Vector(*PS_LOC),
                unreal.Rotator(pitch=PS_ROT[0], yaw=PS_ROT[1], roll=PS_ROT[2]),
                False, True
            )
        except Exception as e:
            unreal.log_warning(f"[level] playerstart patch failed: {e}")

    les.save_current_level()
    unreal.log(f"[level] saved {MAP_PKG}")


def set_default_map():
    """Boot the packaged game straight into the chamber."""
    ini = os.path.join(unreal.Paths.project_config_dir(), "DefaultEngine.ini")
    lines = []
    if os.path.exists(ini):
        lines = open(ini).read().splitlines()
    body = "\n".join(lines)
    if "GameDefaultMap=" + MAP_PKG in body:
        return
    block = (f"\n[/Script/EngineSettings.GameMapsSettings]\nGameDefaultMap={MAP_PKG}\nEditorStartupMap={MAP_PKG}\n"
             f"GameInstanceClass=/Script/Engine.GameInstance\n")
    with open(ini, "a") as f:
        f.write(block)
    unreal.log(f"[level] DefaultEngine.ini -> GameDefaultMap={MAP_PKG}")


def main():
    mat = make_holo_material()
    backdrop_mat = make_backdrop_material()
    build_level(mat, backdrop_mat, _first_chamber())
    set_default_map()
    unreal.log("[level] JarvisHUD authoring complete")


main()
