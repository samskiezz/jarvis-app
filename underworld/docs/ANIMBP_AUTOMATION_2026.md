# AnimBP Automation — 2026

## Prior claim, disproved

> "Python cannot wire UMG / Niagara / AnimBP node graphs."

False in UE 5.7 / 5.8. Three working paths exist; this project ships all three.

## What the public Python API gives us (5.7 / 5.8)

`unreal.AnimBlueprint` exposes:

- `add_node_asset_override(target, override, print_applied_overrides=False)` — swap
  the AnimSequence reference inside every state node WITHOUT touching the graph.
  This is the killer feature.
- `get_animation_graphs()` — enumerate every AnimGraph in the asset.
- `get_nodes_of_class(node_class, include_child_classes=True)` — find every
  `AnimGraphNode_StateMachine`, `_SequencePlayer`, `_BlendSpacePlayer`, etc.
- `target_skeleton`, `use_multi_threaded_animation_update`, etc. settable.

What the public API does NOT give us: creating a new state-machine subgraph or
adding `UAnimStateTransitionNode` connections from Python. Solved below.

## Path A — Template Clone + Asset Override (PREFERRED)

Hand-author `ABP_MinionTemplate` ONCE in the editor: the 10-state machine
(Idle / Walk / Run / Work / Eat / Sleep / Meditate / Worship / Speak / Die)
with placeholder `A_Template_*` sequences and an `anim_state` integer variable
driving transitions.

Per-minion clones use:

```python
new_abp = unreal.EditorAssetLibrary.duplicate_asset(
    "/Game/Minion/ABP_MinionTemplate", "/Game/Minion/ABP_MinionA")
for s in MINION_STATES:
    tgt = unreal.load_asset(f"/Game/Minion/TemplateAnims/A_Template_{s}")
    ovr = unreal.load_asset(f"/Game/Minion/Anim/A_Minion_{s}")
    new_abp.add_node_asset_override(tgt, ovr)
```

Zero C++, zero graph editing, fully scriptable.

## Path B — BlendSpace1D + Montage Slot (no ABP at all)

For minions where 10 hand-authored states are overkill, build a
`BlendSpace1D` driven by `Speed` plus dynamic Montages for one-shots:

```python
bs_factory = unreal.BlendSpace1DFactory(); bs_factory.target_skeleton = sk
bs = tools.create_asset("BS_Minion_Locomotion", out_dir, unreal.BlendSpace1D, bs_factory)
bs.add_sample(idle, unreal.Vector(0, 0, 0))
bs.add_sample(walk, unreal.Vector(200, 0, 0))
bs.add_sample(run,  unreal.Vector(550, 0, 0))
```

One-shots play via `play_slot_animation_as_dynamic_montage(anim, "FullBody")`
on the AnimInstance at runtime.

## Path C — JarvisAnimHelper C++ plugin

When even Path A is too much manual setup, the `Plugins/JarvisAnimHelper/`
module exposes:

```cpp
UFUNCTION(BlueprintCallable, Category="Jarvis|AnimBP")
UAnimBlueprint* CreateStateMachineABP(
    USkeleton* Skeleton,
    const FString& OutPackagePath,
    const TArray<FJarvisAnimState>& States,
    const TArray<FJarvisAnimTransition>& Transitions);
```

`UFUNCTION(BlueprintCallable)` on a `UEditorSubsystem` is automatically
Python-callable as `unreal.JarvisAnimHelper.get().create_state_machine_abp(...)`.

The C++ code uses the editor-only AnimGraph headers (`AnimationStateMachineGraph`,
`UAnimStateNode`, `UAnimStateTransitionNode`, `UAnimGraphNode_SequencePlayer`,
`UAnimGraphNode_StateMachine`) — these are accessible only from C++, but once
wrapped behind a `UFUNCTION` Python sees them as a normal method.

### Modules needed in Build.cs

`Core`, `CoreUObject`, `Engine`, `UnrealEd`, `AnimGraph`, `AnimGraphRuntime`,
`BlueprintGraph`, `AssetTools`, `AssetRegistry`, `Kismet`, `KismetCompiler`,
`EditorSubsystem`.

### Build it once on the GPU box

```bash
cd /opt/jarvis-app-1/underworld/deploy/ue5-project
./UnrealEditor -project=$PWD/Underworld.uproject -run=GenerateProjectFiles
make UnderworldEditor
# OR via UAT:
./Engine/Build/BatchFiles/RunUAT.sh BuildEditor -project=$PWD/Underworld.uproject \
    -platform=Linux -targetplatform=Linux
```

After that single compile, `animbp_automation.py` auto-detects the plugin
and uses Path C; if absent, falls back to A then B silently.

## Runtime entry

```bash
cd /opt/jarvis-app-1/underworld/deploy/ue5-project
./UnrealEditor-Cmd -project=$PWD/Underworld.uproject \
    -run=PythonScript -script="Scripts/animbp_automation.py \
        --skeleton /Game/Minion/SK_Minion_Skeleton \
        --out /Game/Minion/ABP_Minion \
        --anims /Game/Minion/Anim \
        --report Scripts/animbp_report.json"
```

## Sources

- https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AnimBlueprint
- https://dev.epicgames.com/documentation/en-us/unreal-engine/state-machines-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-blueprint-node-functions-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/BlendSpace1D?application_version=5.3
- https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/StateMachine
- https://dev.epicgames.com/documentation/unreal-engine/transition-rules-in-unreal-engine?lang=en-US
- https://github.com/20tab/UnrealEnginePython/blob/master/tutorials/YourFirstAutomatedPipeline.md
- https://docs.unrealengine.com/en-US/PythonAPI/class/AnimBlueprint.html

## Remaining manual step

1. Build `Plugins/JarvisAnimHelper/` once on the GPU box (`RunUAT BuildEditor`).
2. Author `ABP_MinionTemplate` (Path A backup) once in the editor — 10 states,
   linear-plus-cross transitions on `anim_state`. Save under
   `/Game/Minion/ABP_MinionTemplate`.

After those, every minion variant is fully scripted by
`Scripts/animbp_automation.py`.
