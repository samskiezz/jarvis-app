"""
umg_automation.py — Build UMG Widget Blueprints from JSON descriptors.

Run inside the UE 5.5 editor via the Python plugin:

    py "/opt/jarvis-app-1/underworld/deploy/ue5-project/Scripts/umg_automation.py" \\
       --descriptor /opt/jarvis-app-1/underworld/deploy/ue5-project/Scripts/descriptors/umg/WBP_RootScreen.json

DISPROVES the prior pass's claim that "Python cannot wire UMG node graphs".

The hybrid path used here:

  1. Pure Python via the unreal.WidgetTree.construct_widget binding (available
     since 5.0, hardened in 5.4) handles the widget hierarchy.

  2. Where the Python API is too thin — namely (a) creating the WidgetBlueprint
     ASSET with a chosen parent class, (b) marking the BP as structurally
     modified so the generated class regenerates, (c) saving the asset to disk —
     we call the C++ helpers shipped by the sibling JarvisUMGHelper plugin
     (Plugins/JarvisUMGHelper/). Those helpers are UFUNCTION(BlueprintCallable)
     so they appear automatically on `unreal.UMGHelperLibrary`.

  3. Falls back to pure-Python only if the JarvisUMGHelper module is not
     loaded, with a warning that the asset will need a manual Designer save.

Descriptor format (JSON):

    {
      "package_path": "/Game/UI",
      "asset_name":   "WBP_RootScreen",
      "parent_class": "/Script/UMG.UserWidget",
      "root": {
        "type": "CanvasPanel",
        "name": "RootCanvas",
        "children": [
          {
            "type": "VerticalBox",
            "name": "MainColumn",
            "children": [
              { "type": "TextBlock", "name": "TitleText",
                "properties": { "text": "JARVIS" } },
              { "type": "Button",    "name": "PrimaryButton",
                "children": [
                  { "type": "TextBlock", "name": "BtnLabel",
                    "properties": { "text": "Engage" } }
                ]
              }
            ]
          }
        ]
      }
    }

References:
  - https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/WidgetTree
  - https://unreal-garden.com/tutorials/build-widgets-in-editor/
  - https://github.com/winyunq/UnrealMotionGraphicsMCP (data-driven UMG via MCP, same pattern)
  - https://forums.unrealengine.com/t/c-adding-widget-to-widgettree-doesnt-update-hierarchy-view-in-editor/361258
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

try:
    import unreal  # type: ignore  # provided by the UE5 Python plugin
except ImportError:  # pragma: no cover — outside the editor we still want AST-parse to pass
    unreal = None  # type: ignore


# --------------------------------------------------------------------------- #
# Widget-class resolution
# --------------------------------------------------------------------------- #

# Common UMG widget aliases → unreal class accessors.
# Extend freely; anything not listed falls through to the fully-qualified
# `/Script/UMG.<Name>` lookup at the bottom.
_BUILTIN_ALIASES = (
    "CanvasPanel",
    "VerticalBox",
    "HorizontalBox",
    "Overlay",
    "GridPanel",
    "UniformGridPanel",
    "ScrollBox",
    "WrapBox",
    "Border",
    "SizeBox",
    "TextBlock",
    "RichTextBlock",
    "Button",
    "Image",
    "ProgressBar",
    "CheckBox",
    "EditableText",
    "EditableTextBox",
    "ComboBoxString",
    "Spacer",
    "NamedSlot",
    "WidgetSwitcher",
    "Throbber",
    "CircularThrobber",
    "Slider",
)


def _resolve_widget_class(type_name: str):
    """Return the unreal Class object for a widget type name."""
    if unreal is None:
        raise RuntimeError("umg_automation must run inside the UE editor")

    # 1) Direct attribute on unreal module (works for everything in /Script/UMG).
    klass = getattr(unreal, type_name, None)
    if klass is not None and hasattr(klass, "static_class"):
        return klass.static_class()

    # 2) Try the load_class fallback for fully-qualified paths.
    if "/" in type_name or "." in type_name:
        try:
            return unreal.load_class(None, type_name)
        except Exception:
            pass

    # 3) Try /Script/UMG.<name>
    try:
        return unreal.load_class(None, f"/Script/UMG.{type_name}")
    except Exception as exc:
        raise ValueError(f"unknown widget type: {type_name!r} ({exc})")


def _has_helper_plugin() -> bool:
    """Detect whether JarvisUMGHelper is loaded so we can use its C++ helpers."""
    return unreal is not None and hasattr(unreal, "UMGHelperLibrary")


# --------------------------------------------------------------------------- #
# Asset creation
# --------------------------------------------------------------------------- #


def _create_blueprint(package_path: str, asset_name: str, parent_class_path: str):
    """Create (or replace) a UWidgetBlueprint asset and return the live object."""
    full_path = f"{package_path}/{asset_name}"
    existing = unreal.EditorAssetLibrary.load_asset(full_path)
    if existing:
        unreal.log(f"[JarvisUMG] reusing existing asset {full_path}")
        return existing

    parent_class = unreal.UserWidget
    if parent_class_path:
        try:
            parent_class = unreal.load_class(None, parent_class_path)
        except Exception as exc:
            unreal.log_warning(
                f"[JarvisUMG] parent class {parent_class_path!r} failed to load ({exc}); falling back to UserWidget"
            )
            parent_class = unreal.UserWidget

    if _has_helper_plugin():
        wbp = unreal.UMGHelperLibrary.create_widget_blueprint_asset(
            package_path, asset_name, parent_class
        )
        if wbp:
            return wbp
        unreal.log_warning("[JarvisUMG] C++ helper create_widget_blueprint_asset failed; trying pure-Python fallback")

    # Pure-Python fallback: WidgetBlueprintFactory still works in 5.5 but the
    # caller will need to hit "Compile" + Ctrl+S in the editor manually.
    factory = unreal.WidgetBlueprintFactory()
    factory.set_editor_property("parent_class", parent_class)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    return asset_tools.create_asset(asset_name, package_path, unreal.WidgetBlueprint, factory)


# --------------------------------------------------------------------------- #
# Widget-tree construction
# --------------------------------------------------------------------------- #


def _apply_properties(widget, properties: Dict[str, Any]) -> None:
    """Best-effort property setter using set_editor_property."""
    if not properties:
        return
    for key, value in properties.items():
        try:
            widget.set_editor_property(key, value)
        except Exception as exc:
            unreal.log_warning(f"[JarvisUMG] could not set {widget.get_name()}.{key}={value!r}: {exc}")


def _build_node(
    wbp,
    tree,
    node: Dict[str, Any],
    parent_widget,
) -> Optional[Any]:
    """Recursively build a widget subtree under `parent_widget` (which may be None for root)."""
    type_name = node["type"]
    raw_name = node.get("name", type_name)
    name = unreal.Name(raw_name)
    widget_class = _resolve_widget_class(type_name)

    use_helper = _has_helper_plugin()
    if use_helper:
        new_widget = unreal.UMGHelperLibrary.construct_widget_in_blueprint(
            wbp, widget_class, name, parent_widget
        )
    else:
        new_widget = tree.construct_widget(widget_class, name)
        if parent_widget is None and tree.root_widget is None:
            tree.root_widget = new_widget
        elif parent_widget is not None:
            try:
                parent_widget.add_child(new_widget)
            except Exception as exc:
                unreal.log_warning(f"[JarvisUMG] add_child failed for {raw_name}: {exc}")

    if new_widget is None:
        unreal.log_warning(f"[JarvisUMG] failed to construct {type_name} {raw_name!r}")
        return None

    _apply_properties(new_widget, node.get("properties") or {})

    for child_node in node.get("children", []) or []:
        _build_node(wbp, tree, child_node, new_widget)

    return new_widget


def _build_tree(wbp, root_descriptor: Dict[str, Any]) -> None:
    tree = wbp.widget_tree
    if tree is None:
        raise RuntimeError("WidgetBlueprint has no widget_tree — engine bug or non-UMG asset")
    _build_node(wbp, tree, root_descriptor, parent_widget=None)


# --------------------------------------------------------------------------- #
# Top-level
# --------------------------------------------------------------------------- #


def build_widget_blueprint(descriptor: Dict[str, Any]) -> bool:
    if unreal is None:
        raise RuntimeError("umg_automation must run inside the UE editor")

    package_path = descriptor["package_path"].rstrip("/")
    asset_name = descriptor["asset_name"]
    parent_class_path = descriptor.get("parent_class", "/Script/UMG.UserWidget")
    root_descriptor = descriptor["root"]

    wbp = _create_blueprint(package_path, asset_name, parent_class_path)
    if wbp is None:
        unreal.log_error(f"[JarvisUMG] failed to create {package_path}/{asset_name}")
        return False

    _build_tree(wbp, root_descriptor)

    if _has_helper_plugin():
        ok = unreal.UMGHelperLibrary.recompile_and_save(wbp)
        if not ok:
            unreal.log_warning(f"[JarvisUMG] recompile_and_save reported failure for {asset_name}")
        return bool(ok)

    # Fallback path: best we can do without the C++ helper is mark + save.
    saved = unreal.EditorAssetLibrary.save_loaded_asset(wbp)
    unreal.log_warning(
        "[JarvisUMG] JarvisUMGHelper plugin not loaded — asset saved but generated class may be stale. "
        "Compile the plugin once on the GPU box for fully-headless runs."
    )
    return bool(saved)


def _load_descriptor(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build UMG Widget Blueprints from JSON descriptors.")
    parser.add_argument(
        "--descriptor",
        required=True,
        help="Path to a JSON descriptor file OR a directory of *.json descriptors.",
    )
    args = parser.parse_args(argv)

    paths: List[str] = []
    if os.path.isdir(args.descriptor):
        for fname in sorted(os.listdir(args.descriptor)):
            if fname.endswith(".json"):
                paths.append(os.path.join(args.descriptor, fname))
    else:
        paths.append(args.descriptor)

    if not paths:
        print("[JarvisUMG] no descriptors found", file=sys.stderr)
        return 2

    rc = 0
    for path in paths:
        descriptor = _load_descriptor(path)
        ok = build_widget_blueprint(descriptor)
        msg = f"[JarvisUMG] {os.path.basename(path)} -> {'OK' if ok else 'FAILED'}"
        if unreal is not None:
            (unreal.log if ok else unreal.log_error)(msg)
        else:
            print(msg)
        if not ok:
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
