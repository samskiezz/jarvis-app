"""
niagara_automation.py — Fully automated Niagara System + Emitter authoring
from Python, for UE 5.5 / 5.7 / 5.8.

DESIGN (2026 reality):
    The stock unreal.NiagaraSystem Python class exposes only config props
    (warmup_time, fixed_bounds, effect_type, ...). It does NOT expose
    GetEmitterHandles(), AddEmitterHandle(), or module-stack mutation.

    Two paths that DO work today, combined here:

    PATH A — Template cloning (zero-C++, ships first):
        AssetTools.duplicate_asset() on hand-authored / golden templates
        under /JarvisFXTemplates/. Then rename + re-save. This is the
        approach the ue5-mcp community skill recommends, because the
        documented "create empty NiagaraSystem" path produces an asset
        that compiles but never emits.

    PATH B — C++ helper subsystem (one compile, then full Python control):
        Plugins/JarvisNiagaraHelper exposes UFUNCTION(BlueprintCallable,
        CallInEditor) wrappers around FNiagaraEditorModule and
        UNiagaraSystem::GetEmitterHandles() so Python can call:
            unreal.JarvisNiagaraHelper.add_emitter_from_asset(system, emitter)
            unreal.JarvisNiagaraHelper.add_scratch_pad_module(system, idx, hlsl)
            unreal.JarvisNiagaraHelper.set_user_parameter(system, name, value)
        The plugin source ships in this PR. Compile once on the GPU box.

    This module auto-detects whether the helper plugin is loaded and falls
    back to PATH A when it isn't, so the script is useful even before the
    plugin is compiled.

    Six golden templates referenced (each is a hand-authored .uasset that
    a tech-artist or AI agent saves once into the JarvisFXTemplates plugin
    content folder — duplicate_asset() does the rest forever after):

        NS_HoloWaterfall_Template
        NS_AwarenessBleed_Template
        NS_GodPresence_Template
        NS_DoorDraw_Template
        NS_Bioluminescence_Template
        PP_AwarenessRamp_Template   (post-process material instance)

Usage (inside the UE editor or via `UnrealEditor-Cmd -run=pythonscript`):

        import niagara_automation as na
        na.spawn_from_template("HoloWaterfall", "/Game/FX/NS_Waterfall_BlueIce")
        na.batch_spawn_catalog("/Game/FX/Generated")

Designed to be safe to import from any environment — `unreal` is imported
lazily so the file also AST-parses cleanly on a CPU-only box.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any, Dict, Iterable, List, Optional, Tuple

LOG = logging.getLogger("niagara_automation")
if not LOG.handlers:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s"))
    LOG.addHandler(h)
LOG.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Template registry — the 6 canonical FX
# ---------------------------------------------------------------------------

TEMPLATE_ROOT = "/JarvisFXTemplates/Niagara"
PP_TEMPLATE_ROOT = "/JarvisFXTemplates/PostProcess"

TEMPLATES: Dict[str, Dict[str, Any]] = {
    "HoloWaterfall": {
        "template_path": f"{TEMPLATE_ROOT}/NS_HoloWaterfall_Template.NS_HoloWaterfall_Template",
        "kind": "niagara_system",
        "user_params": {
            "TintColor": (0.30, 0.78, 1.00, 1.0),
            "EmissiveBoost": 4.5,
            "FallSpeed": 380.0,
        },
        "purpose": "Holographic waterfall — bedroom / cinematic establish shots.",
    },
    "AwarenessBleed": {
        "template_path": f"{TEMPLATE_ROOT}/NS_AwarenessBleed_Template.NS_AwarenessBleed_Template",
        "kind": "niagara_system",
        "user_params": {
            "BleedRadius": 250.0,
            "BleedIntensity": 1.8,
            "ChromaShift": 0.012,
        },
        "purpose": "Peripheral-vision awareness halo around AI presence.",
    },
    "GodPresence": {
        "template_path": f"{TEMPLATE_ROOT}/NS_GodPresence_Template.NS_GodPresence_Template",
        "kind": "niagara_system",
        "user_params": {
            "PresenceScale": 3.2,
            "MoteCount": 1200,
            "GoldenRatioPulse": 1.618,
        },
        "purpose": "Volumetric divine presence — used for the central AI core.",
    },
    "DoorDraw": {
        "template_path": f"{TEMPLATE_ROOT}/NS_DoorDraw_Template.NS_DoorDraw_Template",
        "kind": "niagara_system",
        "user_params": {
            "DrawSpeed": 1.4,
            "EdgeGlow": 6.0,
            "Color": (0.95, 0.82, 0.20, 1.0),
        },
        "purpose": "Door / portal silhouette draw-on effect.",
    },
    "Bioluminescence": {
        "template_path": f"{TEMPLATE_ROOT}/NS_Bioluminescence_Template.NS_Bioluminescence_Template",
        "kind": "niagara_system",
        "user_params": {
            "GlowColor": (0.20, 1.00, 0.55, 1.0),
            "Density": 800,
            "BreathRate": 0.45,
        },
        "purpose": "Organic glow on plants / sea-life / underworld flora.",
    },
    "AwarenessRamp": {
        "template_path": f"{PP_TEMPLATE_ROOT}/PP_AwarenessRamp_Template.PP_AwarenessRamp_Template",
        "kind": "post_process_material_instance",
        "user_params": {
            "RampStart": 0.10,
            "RampEnd": 0.85,
            "Tint": (1.0, 0.92, 0.78, 1.0),
        },
        "purpose": "Full-screen attention ramp — drives focus / calm states.",
    },
}


# ---------------------------------------------------------------------------
# Lazy unreal import so the file is import-safe outside the editor
# ---------------------------------------------------------------------------

def _ue() -> Any:
    try:
        import unreal  # type: ignore
        return unreal
    except Exception as exc:  # pragma: no cover - only fires off-editor
        raise RuntimeError(
            "niagara_automation requires the Unreal Editor's Python runtime. "
            "Run via `UnrealEditor-Cmd -run=pythonscript=...` or the editor "
            "Python console."
        ) from exc


def _helper_available() -> bool:
    """Returns True if Plugins/JarvisNiagaraHelper exposed its subsystem."""
    try:
        ue = _ue()
        return hasattr(ue, "JarvisNiagaraHelper")
    except RuntimeError:
        return False


# ---------------------------------------------------------------------------
# Asset utilities
# ---------------------------------------------------------------------------

def _split_object_path(object_path: str) -> Tuple[str, str]:
    """`/Game/FX/NS_Foo.NS_Foo` → ("/Game/FX", "NS_Foo")."""
    pkg = object_path.split(".", 1)[0]
    pkg_path, name = pkg.rsplit("/", 1)
    return pkg_path, name


def _asset_tools() -> Any:
    ue = _ue()
    return ue.AssetToolsHelpers.get_asset_tools()


def _editor_asset_lib() -> Any:
    ue = _ue()
    # EditorAssetLibrary is the 5.x-stable surface (vs EditorAssetSubsystem
    # which was renamed mid-5.x — we accept either).
    if hasattr(ue, "EditorAssetSubsystem"):
        return ue.get_editor_subsystem(ue.EditorAssetSubsystem)
    return ue.EditorAssetLibrary


def _ensure_dir(content_dir: str) -> None:
    ue = _ue()
    lib = _editor_asset_lib()
    if not lib.does_directory_exist(content_dir):
        lib.make_directory(content_dir)


# ---------------------------------------------------------------------------
# PATH A — template duplication
# ---------------------------------------------------------------------------

def spawn_from_template(
    template_key: str,
    dest_object_path: str,
    user_params: Optional[Dict[str, Any]] = None,
    overwrite: bool = False,
) -> str:
    """Clone a template into `dest_object_path` and apply user params.

    Returns the package path of the new asset.
    """
    if template_key not in TEMPLATES:
        raise KeyError(
            f"Unknown template '{template_key}'. "
            f"Known: {sorted(TEMPLATES)}"
        )

    spec = TEMPLATES[template_key]
    src_object_path = spec["template_path"]

    ue = _ue()
    lib = _editor_asset_lib()
    tools = _asset_tools()

    if not lib.does_asset_exist(src_object_path):
        raise FileNotFoundError(
            f"Template asset missing: {src_object_path}\n"
            "Install Plugins/JarvisFXTemplates and ensure the .uasset is present."
        )

    dest_pkg, dest_name = _split_object_path(dest_object_path)
    _ensure_dir(dest_pkg)

    full_dest = f"{dest_pkg}/{dest_name}"
    if lib.does_asset_exist(full_dest):
        if not overwrite:
            LOG.info("Asset already exists, returning existing: %s", full_dest)
            return full_dest
        lib.delete_asset(full_dest)

    src_obj = lib.load_asset(src_object_path)
    if src_obj is None:
        raise RuntimeError(f"load_asset returned None for {src_object_path}")

    new_obj = tools.duplicate_asset(dest_name, dest_pkg, src_obj)
    if new_obj is None:
        raise RuntimeError(
            f"duplicate_asset failed for {src_object_path} → {full_dest}"
        )

    params = dict(spec.get("user_params") or {})
    if user_params:
        params.update(user_params)
    if params:
        apply_user_parameters(new_obj, params)

    lib.save_loaded_asset(new_obj)
    LOG.info("Spawned %s → %s", template_key, full_dest)
    return full_dest


def apply_user_parameters(asset: Any, params: Dict[str, Any]) -> None:
    """Best-effort application of user-exposed parameters on a Niagara
    system or material instance.

    Niagara: prefers JarvisNiagaraHelper.set_user_parameter when the C++
    helper is loaded (full type coverage). Falls back to the documented
    set_editor_property surface for simple float/bool/color.

    Material instance: uses MaterialEditingLibrary.
    """
    ue = _ue()

    if _helper_available() and _is_niagara_system(asset):
        helper = ue.JarvisNiagaraHelper
        for name, value in params.items():
            _helper_set_param(helper, asset, name, value)
        return

    if _is_niagara_system(asset):
        LOG.warning(
            "JarvisNiagaraHelper not loaded — user params %s on %s "
            "will only stick for properties already exposed on UNiagaraSystem.",
            list(params), asset.get_name(),
        )
        for name, value in params.items():
            try:
                asset.set_editor_property(name, value)
            except Exception as exc:
                LOG.debug("set_editor_property(%s) skipped: %s", name, exc)
        return

    if _is_material_instance(asset):
        lib = ue.MaterialEditingLibrary
        for name, value in params.items():
            try:
                if isinstance(value, tuple) and len(value) == 4:
                    lib.set_material_instance_vector_parameter_value(
                        asset, name, ue.LinearColor(*value)
                    )
                elif isinstance(value, (int, float)):
                    lib.set_material_instance_scalar_parameter_value(
                        asset, name, float(value)
                    )
                elif isinstance(value, bool):
                    lib.set_material_instance_static_switch_parameter_value(
                        asset, name, value
                    )
            except Exception as exc:
                LOG.warning("MI param %s = %r failed: %s", name, value, exc)
        return

    LOG.warning("apply_user_parameters: unknown asset type %r", type(asset))


def _is_niagara_system(asset: Any) -> bool:
    ue = _ue()
    cls = getattr(ue, "NiagaraSystem", None)
    return cls is not None and isinstance(asset, cls)


def _is_material_instance(asset: Any) -> bool:
    ue = _ue()
    cls = getattr(ue, "MaterialInstanceConstant", None)
    return cls is not None and isinstance(asset, cls)


def _helper_set_param(helper: Any, asset: Any, name: str, value: Any) -> None:
    ue = _ue()
    try:
        if isinstance(value, bool):
            helper.set_user_parameter_bool(asset, name, value)
        elif isinstance(value, (int,)):
            helper.set_user_parameter_int(asset, name, int(value))
        elif isinstance(value, float):
            helper.set_user_parameter_float(asset, name, float(value))
        elif isinstance(value, tuple) and len(value) == 4:
            helper.set_user_parameter_linear_color(asset, name, ue.LinearColor(*value))
        elif isinstance(value, tuple) and len(value) == 3:
            helper.set_user_parameter_vector(asset, name, ue.Vector(*value))
        elif isinstance(value, str):
            helper.set_user_parameter_string(asset, name, value)
        else:
            LOG.warning("Unsupported user-param type %s = %r", name, value)
    except Exception as exc:
        LOG.warning("Helper set_user_parameter %s = %r failed: %s", name, value, exc)


# ---------------------------------------------------------------------------
# PATH B — programmatic emitter / module insertion via the C++ helper
# ---------------------------------------------------------------------------

def add_emitter_from_asset(
    system_object_path: str,
    emitter_object_path: str,
    handle_name: Optional[str] = None,
) -> bool:
    """Append an emitter (referenced by its UNiagaraEmitter asset) onto an
    existing UNiagaraSystem. Requires JarvisNiagaraHelper.
    """
    if not _helper_available():
        raise RuntimeError(
            "add_emitter_from_asset requires the JarvisNiagaraHelper plugin "
            "to be compiled and loaded. Path A (spawn_from_template) does "
            "not require it."
        )
    ue = _ue()
    lib = _editor_asset_lib()
    system = lib.load_asset(system_object_path)
    emitter = lib.load_asset(emitter_object_path)
    if system is None or emitter is None:
        raise FileNotFoundError(f"system={system_object_path} or emitter={emitter_object_path} not found")
    handle = handle_name or emitter.get_name()
    ok = ue.JarvisNiagaraHelper.add_emitter_from_asset(system, emitter, handle)
    if ok:
        lib.save_loaded_asset(system)
    return bool(ok)


def add_scratch_pad_module(
    system_object_path: str,
    emitter_index: int,
    hlsl: str,
    module_name: str = "JarvisScratchModule",
) -> bool:
    """Inject a CustomHLSL scratch-pad module onto an emitter stack."""
    if not _helper_available():
        raise RuntimeError("add_scratch_pad_module requires JarvisNiagaraHelper.")
    ue = _ue()
    lib = _editor_asset_lib()
    system = lib.load_asset(system_object_path)
    if system is None:
        raise FileNotFoundError(system_object_path)
    ok = ue.JarvisNiagaraHelper.add_scratch_pad_module(
        system, int(emitter_index), module_name, hlsl
    )
    if ok:
        lib.save_loaded_asset(system)
    return bool(ok)


# ---------------------------------------------------------------------------
# Batch / catalog helpers
# ---------------------------------------------------------------------------

def batch_spawn_catalog(dest_root: str = "/Game/FX/Generated") -> List[str]:
    """Spawn one instance of every template into `dest_root/<key>/NS_<key>`."""
    spawned: List[str] = []
    for key in TEMPLATES:
        prefix = "PP_" if TEMPLATES[key]["kind"] == "post_process_material_instance" else "NS_"
        dest = f"{dest_root}/{key}/{prefix}{key}"
        try:
            spawned.append(spawn_from_template(key, dest))
        except Exception as exc:
            LOG.error("batch_spawn_catalog: %s failed: %s", key, exc)
    return spawned


def report() -> Dict[str, Any]:
    """Diagnostic snapshot for the Fleet Control panel."""
    return {
        "helper_available": _helper_available(),
        "templates": {k: v["template_path"] for k, v in TEMPLATES.items()},
        "engine_path": os.environ.get("UE_ENGINE_PATH", ""),
    }


# ---------------------------------------------------------------------------
# CLI entry — useful for `UnrealEditor-Cmd -run=pythonscript=niagara_automation.py`
# ---------------------------------------------------------------------------

def _main(argv: Optional[List[str]] = None) -> int:
    argv = list(argv or sys.argv[1:])
    if not argv or argv[0] in ("report", "--report"):
        print(json.dumps(report(), indent=2))
        return 0
    if argv[0] == "spawn" and len(argv) >= 3:
        path = spawn_from_template(argv[1], argv[2])
        print(path)
        return 0
    if argv[0] == "batch":
        dest = argv[1] if len(argv) > 1 else "/Game/FX/Generated"
        for p in batch_spawn_catalog(dest):
            print(p)
        return 0
    sys.stderr.write(
        "usage:\n"
        "  niagara_automation.py report\n"
        "  niagara_automation.py spawn <TemplateKey> <DestObjectPath>\n"
        "  niagara_automation.py batch [DestRoot]\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(_main())
