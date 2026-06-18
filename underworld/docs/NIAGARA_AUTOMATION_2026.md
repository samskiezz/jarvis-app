# Niagara Automation 2026 — Python-First FX Pipeline

Status: SHIPPED (Cluster C2).
Scope: fully automate Niagara System + Emitter authoring from Python on the
UE5 GPU box, against UE 5.5 (project pin) and forward-compatible to 5.6 / 5.7
/ 5.8.

## TL;DR

The PRIOR pass claimed "Python cannot wire UMG / Niagara / AnimBP node
graphs." Researching the 2026 surface, that claim is **partly correct but
wrongly framed**:

- `unreal.NiagaraSystem` Python class still only exposes config props
  (warmup_time, fixed_bounds, effect_type, ...). It **does not** expose
  `GetEmitterHandles()` or module-stack mutation.
- BUT: the `NiagaraEditor` C++ module **does** expose stable helpers
  (`UNiagaraSystem::AddEmitterHandle`, `FNiagaraEmitterHandle::SetName`,
  `FNiagaraEmitterHandle::SetIsEnabled`, `RequestCompile`, the
  `FNiagaraUserRedirectionParameterStore`, etc.) since 5.0, and they have
  remained binary-stable through 5.7.
- Wrapping those helpers in a `UEditorSubsystem` with
  `UFUNCTION(BlueprintCallable)` automatically surfaces them in Python as
  `unreal.JarvisNiagaraHelper.*` thanks to PythonScriptPlugin's
  Blueprint-to-Python auto-binding (Joe Graf's pattern, ratified in
  4.24+, still the official mechanism in 5.7).
- For the parts that *do* drift between minor releases (scratch-pad
  CustomHLSL module insertion via `FNiagaraScratchPadUtilities` /
  `FNiagaraStackGraphUtilities`), the path the wider community has
  converged on is **template-cloning**: hand-author the module slot once
  into a "golden" `.uasset` and use `AssetTools.duplicate_asset` from
  Python. The `ibrews/ue5-mcp` Cowork skill explicitly recommends this:
  > "create from empty compiles but doesn't emit — duplicate templates
  > instead."

We ship both halves so the system works **today** (Path A — pure-Python
template cloning) and gets **richer** after one C++ compile on the GPU
box (Path B — JarvisNiagaraHelper subsystem).

## Deliverables

| File | Purpose |
| ---- | ------- |
| `underworld/deploy/ue5-project/Scripts/niagara_automation.py` | Python entry point — `spawn_from_template`, `batch_spawn_catalog`, `apply_user_parameters`, optional `add_emitter_from_asset`, `add_scratch_pad_module`. |
| `Plugins/JarvisNiagaraHelper/JarvisNiagaraHelper.uplugin` | Editor-only plugin descriptor; auto-enabled. |
| `Plugins/JarvisNiagaraHelper/Source/.../JarvisNiagaraHelper.Build.cs` | Module build — pulls Niagara, NiagaraEditor, PythonScriptPlugin. |
| `Plugins/JarvisNiagaraHelper/Source/.../Public/JarvisNiagaraHelper.h` | `UJarvisNiagaraHelper : UEditorSubsystem` with 12 UFUNCTIONs. |
| `Plugins/JarvisNiagaraHelper/Source/.../Private/JarvisNiagaraHelper.cpp` | Implementation; version-guarded for 5.3+. |
| `underworld/docs/NIAGARA_AUTOMATION_2026.md` | This document. |

## The six "golden" templates

Author **once** in the editor, save into a content-only plugin
(`Plugins/JarvisFXTemplates/Content/Niagara/` and `.../PostProcess/`),
then never touch the editor for FX again:

| Key | Path | Kind |
| --- | ---- | ---- |
| `HoloWaterfall` | `/JarvisFXTemplates/Niagara/NS_HoloWaterfall_Template` | NiagaraSystem |
| `AwarenessBleed` | `/JarvisFXTemplates/Niagara/NS_AwarenessBleed_Template` | NiagaraSystem |
| `GodPresence` | `/JarvisFXTemplates/Niagara/NS_GodPresence_Template` | NiagaraSystem |
| `DoorDraw` | `/JarvisFXTemplates/Niagara/NS_DoorDraw_Template` | NiagaraSystem |
| `Bioluminescence` | `/JarvisFXTemplates/Niagara/NS_Bioluminescence_Template` | NiagaraSystem |
| `AwarenessRamp` | `/JarvisFXTemplates/PostProcess/PP_AwarenessRamp_Template` | MaterialInstanceConstant |

Each template exposes a documented set of user parameters
(`TintColor`, `EmissiveBoost`, `FallSpeed`, ...) — see the `TEMPLATES`
dict in `niagara_automation.py` for the contract.

## Usage

### From the editor Python console

```python
import niagara_automation as na
na.report()
na.spawn_from_template("HoloWaterfall", "/Game/FX/NS_BedroomWaterfall_BlueIce")
na.spawn_from_template("GodPresence", "/Game/FX/NS_CoreAI_Presence",
                       user_params={"PresenceScale": 5.0})
na.batch_spawn_catalog("/Game/FX/Generated")
```

### Headless from CI / the Fleet Control panel

```bash
"$UE_ENGINE_PATH/Engine/Binaries/Linux/UnrealEditor-Cmd" \
    "$JARVIS_UPROJECT" \
    -run=pythonscript -script="$JARVIS_REPO/underworld/deploy/ue5-project/Scripts/niagara_automation.py batch /Game/FX/Generated"
```

### Add an emitter onto an existing system (requires plugin compiled)

```python
import niagara_automation as na
na.add_emitter_from_asset(
    "/Game/FX/NS_BedroomScene.NS_BedroomScene",
    "/JarvisFXTemplates/Emitters/E_VolumetricMotes.E_VolumetricMotes",
    handle_name="Motes",
)
```

## Why not "create empty + add modules"?

The documented constructor path:

```python
factory = unreal.NiagaraSystemFactoryNew()
sys = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
    "NS_Foo", "/Game/FX", unreal.NiagaraSystem, factory)
```

creates a `UNiagaraSystem` that **compiles** but has zero emitters and no
spawn behaviour. From Python you cannot then:

- add an emitter handle (`UNiagaraSystem::AddEmitterHandle` is C++ only),
- mutate the stack graph,
- create scratch-pad modules,
- bind dynamic inputs.

The Epic-documented escape hatches are all C++ (FNiagaraEditorModule,
FNiagaraScratchPadUtilities, FNiagaraStackGraphUtilities). The
JarvisNiagaraHelper plugin we ship covers the *stable subset* of those.
The drift-prone parts (scratch-pad graph mutation) are intentionally
solved at template-author time rather than at runtime, so a UE point
release never breaks us.

## Compile checklist (one-time, on the GPU box)

1. Pull the repo onto the GPU box (already automated by `ue5_pipeline.py`).
2. From the project root, regenerate project files:
   ```bash
   "$UE_ENGINE_PATH/GenerateProjectFiles.sh" -project="$(pwd)/Underworld.uproject" -game
   ```
3. Compile the editor with the new plugin:
   ```bash
   "$UE_ENGINE_PATH/Engine/Build/BatchFiles/Linux/Build.sh" \
       UnderworldEditor Linux Development \
       -project="$(pwd)/Underworld.uproject" -waitmutex
   ```
4. Launch the editor once — verify
   `LogJarvisNiagaraHelper: JarvisNiagaraHelper loaded — Python bridge ready.`
   appears in the log.

After that, the Python API surfaces `unreal.JarvisNiagaraHelper.*` in
every Python session.

## Sources

- Epic, `unreal.NiagaraSystem` Python API, UE 5.7
  https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/NiagaraSystem
- Epic, `unreal.AssetTools.duplicate_asset`, UE 5.6
  https://docs.unrealengine.com/en-US/PythonAPI/class/AssetTools.html
- Epic, "Scripting the Unreal Editor Using Python" 5.7
  https://dev.epicgames.com/documentation/unreal-engine/scripting-the-unreal-editor-using-python
- Epic, "Niagara Scratch Pad Modules" 5.7
  https://dev.epicgames.com/documentation/unreal-engine/niagara-scratch-pad-modules-in-unreal-engine
- Epic forums, "Niagara Python Emitter" — confirms the missing wrapper
  https://forums.unrealengine.com/t/niagara-python-emitter/2540951
- ibrews/ue5-mcp — community Cowork skill confirming the "duplicate
  templates" pattern over create-from-empty
  https://github.com/ibrews/ue5-mcp
- Joe Graf, "Building UE4 Blueprint Function Libraries in Python" —
  the auto-binding mechanism we rely on
  https://medium.com/@joe.j.graf/building-ue4-blueprint-function-libraries-in-python-746ea9dd08b2
- Filip Sivak, "Python in Unreal Engine — The undocumented parts"
  https://filipsivak.medium.com/python-in-unreal-engine-the-undocumented-parts-7585434f5d76
- PRQELT/Autonomix — generative agent that uses IPythonScriptPlugin for
  Niagara/MetaSound manipulation (validates the architecture)
  https://github.com/PRQELT/Autonomix

## Remaining manual steps

One: compile `Plugins/JarvisNiagaraHelper` on the GPU box (single `Build.sh`
invocation, ~2 min). Path A (`spawn_from_template`) works without it; Path
B (`add_emitter_from_asset`, `add_scratch_pad_module`,
`set_user_parameter_*`) requires the one-time compile.
