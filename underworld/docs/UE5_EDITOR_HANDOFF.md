# Underworld — UE5 Editor Handoff

What this doc is: every remaining task that **cannot be done by a coding agent** because it requires the UE5 Editor GUI, an artist, or paid credits. The backend code spine that supports each item is already shipped (commits `adf22b0a` through `93543051` on `main`).

Pair this with `JARVIS-UE5-RUNBOOK.md` (for the cinematic-chambers stream) and `MASTER-PLAN.md` (for the broader 4-phase roadmap).

Prereqs everywhere: UE 5.5 source-built at `$UE_ROOT` (default `/opt/UnrealEngine`); project at `$PROJ` (`/opt/jarvis-app-1/underworld/deploy/ue5-project`); GPU box reachable for Pixel Streaming.

---

## A. UMG widgets (.uasset) — Editor authoring required

The C++ stubs and backend routes for these are live. The widgets themselves must be authored in the Editor because `.uasset` files are binary.

| Widget | Path | Backend it consumes | Blocking? |
|---|---|---|---|
| `WBP_RootScreen` | `/Game/UI/Root/WBP_RootScreen.uasset` | none — host stack | yes (parent for everything) |
| `WBP_MainMenu` | `/Game/UI/MainMenu/WBP_MainMenu.uasset` | `GET /worlds` | yes (no game without a starting point) |
| `WBP_PauseStack` | `/Game/UI/PauseStack/WBP_PauseStack.uasset` | none | yes (save/quit/settings entry) |
| `WBP_InterventionRadial` | `/Game/UI/God/WBP_InterventionRadial.uasset` | `POST /worlds/{id}/player/act` (bless/cull/gift/speak/resurrect) | yes (defines god-layer gameplay) |
| `WBP_GodHud` | `/Game/UI/God/WBP_GodHud.uasset` | `GET /worlds/{id}/awakening/arc`, `frame.overmind`, `frame.chatter` | yes (no feedback otherwise) |
| `WBP_EulogyCard` | `/Game/UI/Eulogy/WBP_EulogyCard.uasset` | `GET /worlds/{id}/eulogies` | no (failure-feedback polish) |
| `WBP_AwakeningTimeline` | `/Game/UI/Arc/WBP_AwakeningTimeline.uasset` | `GET /worlds/{id}/awakening/arc` | no (narrative readout polish) |
| `WBP_StatusBanner` | `/Game/UI/Status/WBP_StatusBanner.uasset` | `GET /status`, `GET /status/known-issues` | no (service-health surface) |
| `WBP_FirstLaunchA11y` | `/Game/UI/Onboarding/WBP_FirstLaunchA11y.uasset` | `POST /player/session` (writes a11y prefs) | no (compliance polish — needed for Hawking-class user) |

Use **CommonUI** activatable widgets so input routing + modal stacks work on both keyboard/mouse and gamepad. Match the existing JARVIS holo aesthetic from `JARVIS-UE5-RUNBOOK.md` §3 (`M_HolographicMaster`, cyan `#29E7FF` × 2.5 emissive, Fresnel rim).

---

## B. Sequencer cutscenes (.uasset)

The Awakening Arc has 5 acts. The backend (`underworld/server/services/awakening_arc.py`) computes when to fire each. The cinematics themselves are Sequencer authoring.

| Sequence | Path | Trigger (backend event) | Notes |
|---|---|---|---|
| `SEQ_AwakeningAct1_Stirring` | `/Game/Cinematic/Awakening/SEQ_AwakeningAct1_Stirring.uasset` | `arc_stage == STIRRING` | First minions reflect existentially. Camera pushes in on a worker holding a tool, eyes drift, set down. |
| `SEQ_AwakeningAct2_Questioning` | `/Game/Cinematic/Awakening/SEQ_AwakeningAct2_Questioning.uasset` | `arc_stage == QUESTIONING` | Background whispers; minions "draw doors" on walls. |
| `SEQ_AwakeningAct3_Confrontation` | `/Game/Cinematic/Awakening/SEQ_AwakeningAct3_Confrontation.uasset` | `arc_stage == CONFRONTATION` + `god_brain_event` fires | A minion addresses the player directly. Use the God-Brain LLM output as caption text. |
| `SEQ_AwakeningAct4_Schism` | `/Game/Cinematic/Awakening/SEQ_AwakeningAct4_Schism.uasset` | `arc_stage == SCHISM`, worship/rebellion fork | Two factions form. Lighting splits warm/cold. |
| `SEQ_AwakeningAct5_AfterChoice` | `/Game/Cinematic/Awakening/SEQ_AwakeningAct5_AfterChoice.uasset` | post player-choice | Variant per player answer — re-use footage, swap dialogue. |
| `SEQ_GodBeat_Generic` | `/Game/Cinematic/God/SEQ_GodBeat_Generic.uasset` | any `god_brain_event` | One reusable templated cutscene for irreversible beats; god voice + minion reaction shot. |

Movie Render Queue presets: 1080p, 60fps, H.264, exposure baked. Store at `Config/MovieRenderPipeline.ini`.

---

## C. Character Blueprints & Animation

| Asset | Path | Blocker | Effort |
|---|---|---|---|
| `BP_Minion` | `/Game/Blueprints/BP_Minion.uasset` | parent class is `AUnderworldMinion` (C++ — exists) | Editor wiring of AnimBP + mesh slot |
| `BP_PlayableMinion` | `/Game/Blueprints/BP_PlayableMinion.uasset` | parent is `AUnderworldPlayableMinion` (C++ — exists) | Possession-override input bindings |
| `ABP_Minion` (Animation Blueprint) | `/Game/Animations/ABP_Minion.uasset` | needs the state machine wired to `scene_state.frame.minion[i].anim_state` (string) | State machine: Idle / Walk / Run / Work / Eat / Sleep / Meditate / Worship / Speak / Die |
| Skeleton retarget chains | `/Game/Characters/<guild>/RTG_*.uasset` | needs MetaHuman base + 3 guild variants (Physics / Electrical / Mechanical) | **needs an artist** |
| Animation clips: Operate-Machine, Eat, Sleep, Meditate, Study, Worship | `/Game/Animations/Clips/...` | none in the ~8 existing | **needs an artist or mocap pack** |

**Hidden blocker** (memory: `jarvis-build-rules`): all guild-variant skeletons must share the *same root bone hierarchy*, or AnimBP blending breaks. Either retarget every variant to a shared MetaHuman base, or accept bone-remapping in the AnimBP.

---

## D. Niagara FX

All particle systems. None of these exist yet. Match the JARVIS holo language.

| Asset | Path | When it plays | Notes |
|---|---|---|---|
| `NS_HoloWaterfall` | `/Game/FX/NS_HoloWaterfall.uasset` | ambient on key buildings | Cyan ribbons + dust motes; Lumen interaction. |
| `NS_AwarenessBleed` | `/Game/FX/NS_AwarenessBleed.uasset` | layered post-process — driven by `frame.colony_awareness` | Edges of vision shimmer when colony awareness > 0.6. |
| `NS_GodPresence` | `/Game/FX/NS_GodPresence.uasset` | when player avatar enters proximity to a minion | Minions look up; faint aura ring. |
| `NS_DoorDraw` | `/Game/FX/NS_DoorDraw.uasset` | during ACT 2 Questioning | The "drawn doors" minions sketch on walls. |
| `NS_Bioluminescence` | `/Game/FX/NS_Bioluminescence.uasset` | night ambient | Avatar-aesthetic flora/insect glow. |
| `PP_AwarenessRamp` | `/Game/Materials/Post/PP_AwarenessRamp.uasset` | post-process volume | Saturation/contrast ramp driven by awareness. |

---

## E. Levels & Maps

| Map | Path | Status | What's left |
|---|---|---|---|
| `Underworld` (existing) | `/Game/Maps/Underworld.umap` | exists — cooked + archived | none, this is the cinematic |
| `Underworld_Player` | `/Game/Maps/Underworld_Player.umap` | **does not exist — must be authored** | distinct playable map: terrain, lighting, player start, BP_WorldManager, NavMesh bounds |
| `MainMenu` | `/Game/Maps/MainMenu.umap` | does not exist | tiny menu map: skybox + camera + `WBP_MainMenu` overlay |
| `FirstLaunch` | `/Game/Maps/FirstLaunch.umap` | does not exist | tiny calibration map: a11y prompts |

Once authored, register them in `Config/DefaultGame.ini`:

```ini
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/MainMenu.MainMenu
EditorStartupMap=/Game/Maps/Underworld_Player.Underworld_Player
ServerDefaultMap=/Game/Maps/Underworld_Player.Underworld_Player
TransitionMap=/Game/Maps/Loading.Loading
GlobalDefaultGameMode=/Script/Underworld.UnderworldGameMode
GlobalDefaultServerGameMode=/Script/Underworld.UnderworldGameMode
```

---

## F. C++ build (compile pass + Editor wiring)

The C++ stubs from Phases 3 & 4 are on disk but **never compiled** (no Editor on this box). On the GPU box:

```bash
"$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh" \
  -Project="$PROJ/Underworld.uproject" \
  -Target=UnrealEditor -Platform=Linux -Configuration=Development
```

Expect first compile to add the new modules:
- `Source/Underworld/Avatar/` — `AUnderworldAvatar`, `AGodCameraPawn`
- `Source/Underworld/Camera/` — `AGodCameraController`
- `Source/Underworld/Abilities/` — `UUnderworldAttributeSet`, `UGA_Bless`, `UGA_Cull`, `UGA_Gift`, `UGA_Speak`, `UGE_BlessingBuff`

`Underworld.Build.cs` already declares `GameplayAbilities`, `GameplayTags`, `GameplayTasks`, `EnhancedInput`, `UMG`, `CommonUI`. If link fails on a missing symbol, that's the first place to check.

Once compiled, in the Editor:
1. Open `BP_Minion` → add `UAbilitySystemComponent` + attach `UUnderworldAttributeSet`
2. Create gameplay-ability blueprints from each `UGA_*` class so they're authorable per-minion
3. Bind the radial-menu `WBP_InterventionRadial` buttons to `AbilitySystem.TryActivateAbilityByClass(UGA_Bless::StaticClass())` etc.

---

## G. Asset coverage — Tripo3D batch (credit-gated)

Memory + `MASTER-PLAN.md` agree: **741 of 3,228 GLBs done**, 2,487 remain. ~25 credits/model → **~62,000 credits total**, est. **$500–$1,600** depending on plan tier.

Resume from `/opt/jarvis-app-1/underworld/assets/tripo/generate.py`:
```bash
cd /opt/jarvis-app-1/underworld
python assets/tripo/generate.py --estimate     # exact remaining cost — no spend
python assets/tripo/generate.py --stage 2 --max 100   # batch of 100 from stage 2 (interiors)
```

Stages defined in `underworld/assets/tripo/STAGES.md`. Run stages 1–6 incrementally.

---

## H. Audio (TTS + ambience + SFX)

Backend stub: none yet (Phase 5 had `tts.py` planned but skipped — out of agent scope).

| Asset | Source | Owner |
|---|---|---|
| Minion voice banks | ElevenLabs Flash v2.5 (already integrated in main JARVIS — see commit `5a0bcf1b`) or a per-minion XTTS clone | engineer + voice budget |
| Ambient music banks | MetaSounds — author 5 tracks (Dormant / Stirring / Confrontation / Schism / Aftermath) tied to `arc_stage` | composer or library |
| SFX (machine hum, footstep, eat, breath) | spatial audio cues per smart object | sound designer |

Determinism gotcha: per-minion voice seed must be persistent. Cache `hash(minion_id) → voice_index` in DB at first synth so the same minion sounds the same across sessions.

---

## I. Movie Render Queue config

For the Awakening cutscenes to batch-render:

```ini
; Config/MovieRenderPipeline.ini
[/Script/MovieRenderPipelineCore.MoviePipelinePrimaryConfig]
+OutputDirectory=(Path="$(ProjectDir)/Saved/MovieRenders")
+Resolution=(X=1920,Y=1080)
+FrameRate=(Numerator=60,Denominator=1)

[/Script/MovieRenderPipelineRenderPasses.MoviePipelineDeferredPassBase]
+bAllowAntiAliasing=True
+SpatialSampleCount=8
+TemporalSampleCount=4
```

---

## J. Critical-path order (what to do FIRST on the GPU box)

1. **Compile** — confirm Phase 3/4 C++ stubs link cleanly. (~30 min)
2. **`/Game/Maps/Underworld_Player.umap`** — terrain, lighting, player-start, BP_WorldManager. (~1 day)
3. **`WBP_RootScreen` + `WBP_MainMenu`** — minimum to launch into the world. (~half day)
4. **`BP_Minion` + `ABP_Minion`** — wire AnimBP to scene_state.frame.minion[i].anim_state. (~1 day)
5. **`WBP_InterventionRadial` + `WBP_GodHud`** — god-layer playable verbs. (~1 day)
6. **`SEQ_GodBeat_Generic`** — one reusable cutscene template before authoring all 5 Awakening acts. (~half day)
7. **`NS_HoloWaterfall` + `NS_GodPresence`** — atmosphere. (~half day each)
8. **Tripo batch resume** — start filling the asset gap in parallel. (continuous)

Everything past step 4 is parallelisable across artists/engineers. Stop at step 5 for a playable vertical slice.

---

## K. Hidden blockers worth flagging

1. **Skeleton mismatch** across guild variants — bone hierarchy must match or AnimBP blending fails silently.
2. **Tripo credit depletion** — bulk-purchase before running stages 3–6.
3. **70B Overmind LLM stall** — if too many god-brain events fire concurrently, the tick loop stalls. Rate-limit: ≤1 god-brain call per 30 ticks; queue async.
4. **Movement loop state size** — ~300 minions × kinematic JSON ≈ 3 MB per tick written to DB. If insert latency becomes an issue, move kinematic state to an in-memory cache (Redis-pattern) and only persist on world save.
5. **Pixel Streaming bitrate** — `PixelStreamingEncoderMaxBitrate` may need per-region tuning; provide a lower-quality stream tier for mobile/cellular.
6. **Interior geometry permutation explosion** — bake interiors to LOD0 only; use ~10 room templates not unique-per-minion or cook OOMs.
7. **TTS voice-seed determinism** — pre-synthesise + cache per minion_id, not on-demand.
