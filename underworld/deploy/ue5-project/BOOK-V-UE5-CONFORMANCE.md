# Book V — UE5 Client Conformance

This is the proof that the UE5 client implements the **contract-version 2** scene-state and the
Book V (Professional Completeness Upgrade) requirements that touch the renderer. The backend
(`underworld/server/services/scene_state.py`) already emits `contract_version: 2`; this client now
parses **all** of it and drives the render/HUD/verb hooks Book V specifies. Everything here is code
+ config (no Editor); the items marked **(Editor)** are the authored half a UE5 dev finishes in the
Unreal Editor against these C++ seams.

## Underworld ≠ JARVIS
Underworld (this game — a living Minion civilisation, in the *Futuristic-Avatar × GTA5 × Sims* art
direction of `underworld/ART-DIRECTION.md`) and **JARVIS** (the separate Stark-war-room product) are
two different things. JARVIS' only relationship to Underworld is **access**: it reads *everything*
about the Minions and can command them — through the very contracts this client also consumes
(`GET /worlds/{id}/scene-state` v2, `POST /worlds/{id}/player/act`, `/player/gaze`, `/minions/{id}/
possess|release`). So the work below doubles as the **JARVIS↔Underworld access seam**: any JARVIS
surface (its "Simulation Theatre" / "World View" scenes) drives Underworld through the same v2 API,
with no extra backend. The UE5 client wears Underworld's palette (`UnderworldArtPalette.h`); the
JARVIS cyan war-room palette stays in the JARVIS product.

## The wire — contract v2 (Book V Part B.2)
`SceneStateClient.cpp::ParseScene` reads the whole v2 surface into `FUwSceneState`
(`SceneStateTypes.h`). The previous client read `time_of_day`/`weather`/`terrain_seed` at the top
level — but v2 nests them under `frame{}` / `terrain{}`; that latent mismatch is fixed.

| v2 field (backend) | UE5 type | Consumer |
|---|---|---|
| `contract_version`, `tick`, `sim_year`, `era`, `population` | `FUwSceneState` scalars | HUD top bar |
| `frame.time_of_day{fraction,sun_angle_rad,sun_elevation}` | `TimeOfDay`, `SunDir` | sun/sky drive |
| `frame.weather`, `frame.biome`, `terrain.seed` | `Weather/Biome/TerrainSeed` | sky/terrain |
| `frame.overmind{mood,toward_creator,direction,tension,realisation,omen}` | `FUwOvermind` | God-HUD stance + Overmind chorus |
| `frame.chatter[]` | `TArray<FString> Chatter` | whisper feed |
| `frame.god_beat` | `FString GodBeat` | critical-alert lane (fires once) |
| `frame.presence{attention_hotspots[],creator_present}` | `FUwPresence` | god-presence VFX |
| `frame.possessed_id` | `PossessedId` | possession swap |
| per-minion `position/velocity/move_state/speed/target_pos/facing/anim` | movement fields | dead-reckoned locomotion |
| per-minion `name/guild/role/color/action/target_building/using_asset` | identity/activity | label + tint + activity |
| per-minion `awareness/awakened/thought/identity/drive` | cognition fields | awareness-bleed, Inspector |
| per-minion `scale/generation/needs{hunger,fatigue,sanity}/gene_edit/mood` | appearance/needs | prominence, emotion, helix, lineage |
| per-minion `behavior` (object) | `BehaviorJson` (raw JSON) | micro-interaction stream for the AnimBP |
| `frame.epoch.name`, `terrain.elevation_bias/town_radius/heightmap_size` | scene scalars | era HUD, terrain shaping |
| derived `mean_awareness`, `awakened_count` | client-computed (or `frame.*` if present) | HUD gauge |
| derived per-minion voice (from stable `id`) | `VoiceSeed/VoicePitch/VoiceRate` | deterministic TTS identity (F.4) |

> **int64 fidelity:** `tick` and `terrain.seed` are read via a dedicated `GetInt64` helper (double
> path, 53-bit) — **not** through the `float` `GetNum` (24-bit), which silently corrupted large
> seeds and broke deterministic terrain parity with the WebGL renderer. Caught by the audit.

A backend test guards this both ways: `server/tests/test_scene_state.py::test_ue5_v2_contract_fields`
fails if the backend stops emitting any field this client reads.

## Discipline → UE5 implementation

| Book V item | Requirement | UE5 symbol | Status |
|---|---|---|---|
| **B.2** wire v2 | full field parse, frame/terrain nesting | `SceneStateClient::ParseScene`, `SceneStateTypes.h` | ✅ code |
| **B.3 / L.8** god-verb + gaze ingress | `player/act` (bless/gift/cull/smite/speak), `player/gaze` | `SceneStateClient::PostAct/PostGaze`, `WorldManager::Bless/Gift/Speak/Cull/Smite`, `PlayerController` inputs | ✅ code |
| **E.6** two-tier crowd→MetaHuman | promote (near ∧ awakened) ∨ possessed ∨ in-conversation, hysteresis, ≤4 budget | `WorldManager::UpdateHeroPromotion` + `OnHeroPromotionChanged` | ✅ decision in C++ · **(Editor)** mesh swap in BP |
| **E.6** guild tint | `GUILD_LOOK` colour → material | `FUwMinionState::GuildColor`, `Minion::OnGuildColor` | ✅ code · **(Editor)** material param |
| **E.7** god-presence / possession / override render | wire fields + triggers | `FUwPresence`, `WorldManager::OnPresence/OnGodBeat`, possession swap | ✅ code · **(Editor)** Niagara |
| **F / K.6** one canonical emotion | single `emotion_id` for face+voice | `EUwEmotion` + `UnderworldEmotion::Resolve` (mood+awakening+needs) | ✅ code · **(Editor)** ARKit pose table |
| **F.4** deterministic voice identity | stable per-minion voice across sessions | `FUwMinionState::VoiceSeed/VoicePitch/VoiceRate` from `FCrc::StrCrc32(id)` | ✅ code · **(Editor)** TTS voice bank |
| **G.1** God-HUD aggregates | era/pop/stance/mean-awareness/awakened | `AUnderworldGodHud` model + `OnHudModel` | ✅ code · **(Editor)** UMG widget |
| **G.2** awareness-bleed | post-process ramp as colony wakes | `Minion::OnAwarenessChanged`, `WorldManager::OnAwarenessBleed`, `UwArt::AwarenessRamp` | ✅ code · **(Editor)** post-process material |
| **G.4** intervention consequence-forecast | predict verb deltas before commit | backend `POST /player/forecast` (read-only dry-run) + `SceneStateClient::PostForecast` | ✅ code (backend route + client) · **(Editor)** UMG forecast panel |
| **G.5** possession HUD / lost-time | control-mask, lost-time | possession swap + `OnPossessionChanged` | ✅ code · **(Editor)** UMG |
| **G.6** non-diegetic critical alert | the God-Brain beat lane | `GodHud::OnCriticalAlert` (fires once) | ✅ code · **(Editor)** alert widget |
| **L.8** PresenceField gaze | sample camera/reticle → server | `WorldManager::ReportGaze` (≤10 Hz), `PlayerController::UpdateReticle` | ✅ code |
| **L.9** Overmind / God-beat | drive HUD/audio from the frame | `WorldManager::OnOvermind/OnChatter/OnGodBeat` | ✅ code · **(Editor)** audio chorus |

## Security (red-team mitigations, Book V Part B.7)
- **Credential**: the Bearer `ApiKey` is never logged; the `Authorization` header is set centrally in
  `SceneStateClient::MakeRequest` and never echoed. It is read from the **environment**
  (`UNDERWORLD_API_KEY`) first — *not* argv — because a `-UnderworldApiKey=` cmdline is visible to
  every process via `/proc/<pid>/cmdline`; the cmdline form remains only as a dev fallback. Use HTTPS
  `ApiUrl` + a real key (not `dev-key`) for any external playtest.
- **Prompt-injection (`speak`)**: `WorldManager::Speak` strips control chars and the injection-prone
  delimiters `{ } \` | < >`, caps at 280 chars, and JSON-escapes — defence in depth over the server's
  own moderation gate (`routes/god.py::_moderate`).
- **Destructive-verb spam**: `cull`/`smite` go through `DestructiveGuard` — require an explicit confirm
  (the Cull input is bound to a **Hold** trigger = the confirm) and a 3 s client cooldown that mirrors
  the server `harm` token-bucket. 429s are surfaced via `OnGodVerbWarning`.
- **Gaze rate**: capped at `GazeHz ≤ 10` so the PresenceField sampler can't flood the server.

## Adversarial audit (resolved)
A 22-agent adversarial workflow (8 review dimensions → skeptic-verify each finding → synthesize)
audited the whole client. It confirmed **10** real findings; **all 10 are fixed**: the 4 dropped wire
fields above (`behavior`, `generation`, `epoch`, the terrain extras), the `tick`/`seed` int64→float
precision loss, the prominence change-detect guard (stored raw vs. clamped factor), the API key on
argv, the idempotency key (now a 2 s wall-clock bucket so genuine double-fires dedup and survive
restart), and the two bible gaps **F.4** (deterministic voice) and **G.4** (consequence-forecast),
both now implemented. Backend tests: `test_scene_state.py` (incl. the field guard) + `test_god_forecast.py` green.

## What still needs the Editor + a GPU box
Unchanged from `UE5-FINISH-RUNBOOK.md`: import the GLBs, build the level, author `BP_Minion`/
`BP_PlayableMinion` (Anim BP + the new `OnEmotionChanged`/`OnAwarenessChanged`/`OnAwakened`/
`OnGuildColor` events + MetaHuman swap on `OnHeroPromotionChanged`), the `WBP_GodHud` widget against
`UnderworldArtPalette`, the Niagara for god-presence/awareness-bleed, package Linux Shipping, deploy
on a Vulkan+NVENC box. The **code + contract** half — the subject of Book V — is complete.
