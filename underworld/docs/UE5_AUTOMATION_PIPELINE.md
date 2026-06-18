# UE5 Headless Authoring Pipeline (gap cluster C1)

Last reviewed: **2026-06-18** against Epic UE 5.7 / 5.8 docs.

This pipeline authors as much of the Underworld UE5 game spine as is technically
possible **without opening the UE5 Editor GUI**, by driving the in-process
`unreal` Python module via `UnrealEditor-Cmd -run=PythonScript`.

## TL;DR

```bash
# From the GPU box, after a UE5 install at /opt/UnrealEngine:
cd /opt/jarvis-app-1/underworld/deploy/ue5-project
bash Scripts/run-auto-author.sh

# Or just write the descriptor JSON manifest (no UE5 required):
python3 Scripts/auto_author.py --write-defaults
```

## What it covers

| Gap | Asset                              | Automation                   | Notes |
|-----|------------------------------------|------------------------------|-------|
| #44 | `WBP_HUD_Main`, `WBP_AwakeningPrompt`, `WBP_AscendMenu`, `WBP_AccessibilityDock` | **Partial** — WBP shell + parent class | Layout/node wiring is a hard Python-API limit (see §UMG) |
| #45 | `SEQ_AwakeningAct1..5` LevelSequence | **Full** — sequence + Camera Cut + Shot tracks | Ready for MRQ command-line render |
| #46 | `BP_PlayableMinion`, `AnimBP_Minion` | **Partial** — assets + parent/target-skeleton | State-machine graph requires AnimBP editor |
| #47 | `NS_Awakening_Spark`, `NS_Ascend_Glow`, `NS_FireTrail` | **Partial** — empty NiagaraSystem assets | Emitter modules require Niagara editor |
| #48 | `Underworld_Player.umap`            | **Full** — level + PlayerStart + DirectionalLight + SkyLight + Fog | No GUI step required |

## Why headless

Per Epic's [Scripting the Unreal Editor Using Python][epic-py] doc, `UnrealEditor-Cmd -run=PythonScript`
runs in commandlet mode with the full `unreal` module available but no editor UI.
This is the official, supported automation entry point.

Per the [community guide on headless rendering][epic-community-headless], this is
the same path used by professional studios for nightly cinematic rebuilds.

## Hard Python-API limits we ran into

### UMG (gap #44)

Epic's Python API **cannot create or wire Blueprint nodes** as of UE 5.7
(confirmed against the current [Widget Blueprint docs][epic-widget-bp] and the
multi-year community thread on [creating blueprint assets/hierarchies with
Python][epic-bp-py-thread]). We can:

- Create the `WBP_*` asset via `unreal.WidgetBlueprintFactory`
- Set the parent class (`UserWidget` vs `EditorUtilityWidget`)
- Save the asset

We **cannot** from Python:

- Add widget tree children (`CanvasPanel`, `VerticalBox`, etc.) with bindings
- Wire blueprint event-graph nodes

**Workaround:** the auto-author emits a `pending_designer` manifest entry per
WBP. The designer opens each WBP once, drags in the root container hinted in the
descriptor, and saves. From that point forward all logic lives in the asset.

For fully programmatic widgets, the only supported path is C++ (`UMGEditor`
module) or copying pre-built `.uasset` templates — both documented in the same
thread above.

### Niagara (gap #47)

`unreal.NiagaraSystemFactoryNew` exists from 5.0 (still flagged Experimental in
the [UE 5.4 Niagara Python API][epic-niagara-py]) and creates an empty system.
Emitter module graphs are still authored in the Niagara editor. Same
designer-handoff pattern as UMG.

### Animation Blueprint (gap #46)

`AnimBlueprintFactory` accepts a `target_skeleton` and creates the AnimBP asset
([community example][epic-animbp-py]). State-machine + blend-graph still
require the AnimBP editor.

### MovieRenderQueue (gap #45)

The current [MRQ docs][epic-mrq] confirm: MRQ extension is not exposed to
Python, but the Python `MoviePipelineQueue` / `MoviePipelineExecutorBase`
classes ARE exposed and let us:

- Create LevelSequence assets (`LevelSequenceFactoryNew`)
- Add `MovieSceneCameraCutTrack` + `MovieSceneCinematicShotTrack`
- Queue a render with `MoviePipelinePythonHostExecutor` from the command line

This is enough to fully automate cutscene scaffolding for gap #45.

## File layout

```
underworld/deploy/ue5-project/Scripts/
├── auto_author.py             # the headless authoring script (this file's source of truth)
├── run-auto-author.sh         # bash driver; auto-detects UE5 install, falls back to dry mode
├── descriptors/
│   └── auto_author.default.json   # written by `--write-defaults`; designers can edit
└── auto_author_report.json    # written every run; created/skipped/pending/errors
```

## How to plug in hardware/credentials

1. **GPU box with UE5 5.5+ installed** at `/opt/UnrealEngine` (override with `UW_UE_ROOT`).
2. Run `bash Scripts/run-auto-author.sh` — it will detect UE5 and switch from
   dry mode to live authoring automatically.
3. Inspect `auto_author_report.json` for any `pending_designer` entries; those
   are the only items needing one-time GUI touch.
4. Re-running is idempotent: existing assets land in `skipped`.

If UE5 isn't available yet, the dry mode still writes
`descriptors/auto_author.default.json` so the designer can review or override
the canonical spine before the GPU box is ready.

## Integration with the existing pipeline

`ue5_pipeline.py` (the established one-shot resumable build) already covers
steps 0-7 (validate → manifest → import_glbs → materials → media → level →
package). `auto_author.py` slots in **between step 6 (level) and step 7
(package)** — it adds the game-spine assets (cutscenes, characters, FX, HUD)
the existing pipeline does not.

To wire it as an explicit pipeline step, add to `ue5_pipeline.py` step list:

```python
("auto_author", run_in_editor("Scripts/auto_author.py", flags=["--all"])),
```

(Wiring is left for the owner since `ue5_pipeline.py` is high-risk per
project rules — touching it requires its own focused validation.)

## Citations

- [Scripting the Unreal Editor Using Python — Epic Developer Community][epic-py]
- [Run Headless Unreal Editor with Python Script — Epic community snippet][epic-community-headless]
- [Command Line Rendering With Movie Render Queue — Epic 5.7 docs][epic-mrq]
- [Creating blueprint assets/hierarchies with Python — Epic forum, multi-year canonical thread][epic-bp-py-thread]
- [`unreal.NiagaraSystem` Python API (5.4, Experimental)][epic-niagara-py]
- [`unreal.AnimBlueprint` Python API (5.0, Experimental)][epic-animbp-py]
- [Widget Blueprints — Epic Developer Community][epic-widget-bp]
- [UE 5.7 PCG framework — production status & GPU compute path][ue57-pcg]

[epic-py]: https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python
[epic-community-headless]: https://dev.epicgames.com/community/snippets/J5R1/unreal-engine-run-headless-unreal-editor-with-python-script
[epic-mrq]: https://dev.epicgames.com/documentation/unreal-engine/using-command-line-rendering-with-move-render-queue-in-unreal-engine
[epic-bp-py-thread]: https://forums.unrealengine.com/t/creating-blueprint-assets-hierarchies-with-python/115929
[epic-niagara-py]: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/NiagaraSystem?application_version=5.4
[epic-animbp-py]: https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AnimBlueprint?application_version=5.0
[epic-widget-bp]: https://dev.epicgames.com/documentation/en-us/unreal-engine/creating-umg-widget-templates-in-unreal-engine
[ue57-pcg]: https://blog.imseankim.com/unreal-engine-5-7-pcg-framework-gdc-2026-procedural-worlds/
