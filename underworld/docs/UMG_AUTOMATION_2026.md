# UMG automation from Python — 2026 status

**Status:** the prior pass's claim that "Python can create WBP shells via
WidgetBlueprintFactory and set parent class, but layout + bindings require
either the UMG Designer or C++ UMGEditor module" is **partially wrong** and now
worked around in this repo.

## What the prior pass got right

- `unreal.WidgetBlueprintFactory` does create an empty WBP shell.
- The Python binding for `unreal.WidgetTree` was tagged Experimental from 5.0
  through 5.5 and never grew first-class binding/animation helpers.
- AnimGraph node-graph mutation and Niagara module-graph mutation are still C++-
  only in 5.7 (none of the OSS or Marketplace work disputes that as of 2026-06).

## What the prior pass got wrong

UMG **widget-tree** construction is fully scriptable from Python today via
`unreal.WidgetTree.construct_widget(class, name)` plus the `root_widget`
property and `UPanelWidget.add_child`. The 20tab issue thread
([UnrealEnginePython #388](https://github.com/20tab/UnrealEnginePython/issues/388))
showed the working pattern on 4.x; the unreal-garden tutorial
([build-widgets-in-editor](https://unreal-garden.com/tutorials/build-widgets-in-editor/))
documents the equivalent C++ surface that the Python binding wraps; and the
[UnrealMotionGraphicsMCP](https://github.com/winyunq/UnrealMotionGraphicsMCP)
project ships a 2026 production-grade JSON→UMG bridge over exactly this API.

The catch isn't capability — it's housekeeping. Pure-Python misses three steps:

1. `FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified` so the Designer
   view and the generated class refresh.
2. `FKismetEditorUtilities::CompileBlueprint` to regenerate the
   `UWidgetBlueprintGeneratedClass`.
3. `UPackage::SavePackage` with `SAVE_NoError` so the runtime cooker picks the
   asset up on the next build.

Without those three calls, the asset opens empty in the Designer next session
and the cooker drops the widget at package time. That is the failure mode the
prior pass observed — not a missing API.

## What this repo ships

```
underworld/deploy/ue5-project/
├── Plugins/JarvisUMGHelper/                       ← C++ helper plugin
│   ├── JarvisUMGHelper.uplugin
│   └── Source/JarvisUMGHelper/
│       ├── JarvisUMGHelper.Build.cs
│       ├── Public/JarvisUMGHelper.h
│       ├── Public/UMGHelperLibrary.h
│       ├── Private/JarvisUMGHelper.cpp
│       └── Private/UMGHelperLibrary.cpp
└── Scripts/
    ├── umg_automation.py                          ← Python entry point
    └── descriptors/umg/WBP_RootScreen.json        ← example descriptor
```

### `UMGHelperLibrary` (C++)

A `UBlueprintFunctionLibrary` that exposes the three missing verbs as
`UFUNCTION(BlueprintCallable, Category="Jarvis|UMG")`. Because they're
BlueprintCallable, the Python plugin auto-binds them onto
`unreal.UMGHelperLibrary` — no additional binding code required.

Surface:

| Function                          | Purpose                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `load_widget_blueprint`           | Load a WBP by package path.                             |
| `create_widget_blueprint_asset`   | Make a new WBP with chosen parent class + CanvasPanel.  |
| `construct_widget_in_blueprint`   | `Tree->ConstructWidget` + `Parent->AddChild` in one go. |
| `find_widget_by_name`             | Lookup helper for "parent" pointers across calls.       |
| `set_root_widget`                 | Swap a panel root without re-creating the BP.           |
| `recompile_and_save`              | Mark structurally modified → compile → SavePackage.     |

### `umg_automation.py` (Python)

Reads a JSON descriptor (or a directory of them) and walks the tree, calling
either the C++ helper (preferred) or the stock `unreal.WidgetTree` binding as a
fallback. The fallback path saves the asset but emits a warning that the
generated class will be stale until the Designer is opened — i.e. the prior
pass's failure mode exactly. With the C++ helper compiled, the cycle is
fully headless.

## Wiring for the GPU box

1. The plugin lives under `underworld/deploy/ue5-project/Plugins/JarvisUMGHelper/`
   so `UnrealBuildTool` discovers it automatically — nothing to add to
   `Underworld.uproject`.
2. Compile once:

   ```bash
   cd /opt/jarvis-app-1/underworld/deploy/ue5-project
   "$UE5_ROOT/Engine/Build/BatchFiles/Linux/Build.sh" \
       UnderworldEditor Linux Development \
       -Project="$(pwd)/Underworld.uproject"
   ```

   This rebuilds the editor target with the new module pulled in. The plugin's
   `.Build.cs` pins it to `Type=Editor` + `LoadingPhase=PostEngineInit` so it
   never ships in the runtime/cook target.
3. Drive it from the Python plugin:

   ```bash
   "$UE5_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd" \
       "$(pwd)/Underworld.uproject" \
       -run=pythonscript \
       -script="$(pwd)/Scripts/umg_automation.py --descriptor $(pwd)/Scripts/descriptors/umg/"
   ```

## Limits this does NOT fix

- **AnimBlueprint node graphs** — still C++-only. Workaround: ship a
  `UAnimInstance` subclass in C++ that pulls its state-machine config from a
  data asset, then drive the data asset from Python.
- **Niagara module graphs** — same story. Workaround: build the Niagara
  System once in the Editor, expose its parameters as User Parameters, then
  drive those from Python via `unreal.NiagaraSystem.set_*` accessors.
- **Event-graph / function-graph nodes** on the Widget Blueprint itself.
  Bindings to OnClick/OnMouseEnter still want the K2 graph. Workaround: keep
  event logic in C++ on a `UUserWidget` subclass and let the descriptor pick
  that subclass as `parent_class`.

## Sources

1. Epic — `unreal.WidgetTree` Python API:
   <https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/WidgetTree?application_version=5.2>
2. Epic — `unreal.WidgetBlueprint` Python API 5.6:
   <https://docs.unrealengine.com/en-US/PythonAPI/class/WidgetBlueprint.html>
3. Epic — Widget Blueprints in UMG (5.7):
   <https://dev.epicgames.com/documentation/en-us/unreal-engine/widget-blueprints-in-umg-for-unreal-engine>
4. Epic — Creating UMG Widget Templates (5.7):
   <https://dev.epicgames.com/documentation/en-us/unreal-engine/creating-umg-widget-templates-in-unreal-engine>
5. unreal-garden — "Add UWidgets to a UserWidget using C++ in the Editor":
   <https://unreal-garden.com/tutorials/build-widgets-in-editor/>
6. 20tab — UnrealEnginePython issue #388 (working WBP factory + tree pattern):
   <https://github.com/20tab/UnrealEnginePython/issues/388>
7. winyunq — UnrealMotionGraphicsMCP (2026 JSON→UMG bridge over the same API):
   <https://github.com/winyunq/UnrealMotionGraphicsMCP>
8. Forum — "C++ Adding Widget to WidgetTree doesn't update Hierarchy view in editor"
   (the MarkBlueprintAsStructurallyModified trap the prior pass hit):
   <https://forums.unrealengine.com/t/c-adding-widget-to-widgettree-doesnt-update-hierarchy-view-in-editor/361258>
9. bralkor — unreal_python_recipe_book §07 Editor Utility Widgets
   (data-driven EUW pattern in pure Python):
   <https://github.com/bralkor/unreal_python_recipe_book/blob/5.2/documentation/07_editor_utility_widgets.md>
10. ElgSoft — ElgKismetEditorWidget plugin (C++/EUW pattern for graph-level
    edits, the path AnimBP/Niagara would have to follow):
    <https://github.com/ElgSoft/ElgKismetEditorWidget>
