# Underworld UE5 — Finish & Go-Live Runbook

This project is a **complete code/config scaffold**: the C++ runtime that turns the
backend's live `/worlds/{id}/scene-state` into a ray-traced, pixel-streamed world is
written and wired. What remains requires the **Unreal Editor + a GPU render box +
authored art** — which a headless coding sandbox can't do. This is the exact path a
UE5 developer follows to take it live.

## Already done (in this repo)
- **Engine project**: `Underworld.uproject` (UE 5.5; PixelStreaming + MetaHuman + Water + Landmass), targets, primary game module.
- **C++ runtime** (`Source/Underworld/`) — now at **contract-v2 / Book V parity** (see `BOOK-V-UE5-CONFORMANCE.md`):
  - `USceneStateClient` — GameInstance subsystem; polls `{ApiUrl}/worlds/{WorldId}/scene-state` every 0.5s (Bearer); parses the **full v2 JSON** (Director frame: Overmind/chatter/God-beat, the PresenceField, per-minion awakening/awareness/needs/emotion) into `FUwSceneState`. Also the egress for the creator's verbs: `PostPossess`, `PostAct` (bless/gift/cull/smite/speak via `/player/act`), `PostGaze` (`/player/gaze`). Reads `-UnderworldApiUrl/WorldId/ApiKey/PlayerId` from the cmdline.
  - `AUnderworldWorldManager` — reconciles the world each tick; drives the sun; fires the Book V frame hooks (`OnOvermind`/`OnGodBeat`/`OnPresence`/`OnAwarenessBleed`/`OnChatter`), the two-tier crowd→MetaHuman promotion budget (`OnHeroPromotionChanged`), the gaze sampler, and the god-verb API (with destructive-verb confirm + cooldown).
  - `AUnderworldMinion` — smooth position/facing + dead-reckoning; carries the full per-minion signal and fires `OnAnimChanged`/`OnGuildColor`/`OnEmotionChanged`/`OnAwarenessChanged`/`OnAwakened` + prominence scale for the Anim BP / material / MetaHuman swap.
  - `AUnderworldPlayableMinion` — the possessed/embodied ACharacter; AI-steers from the kinematic, player-drives when possessed; carries emotion/awareness parity for close-ups.
  - `AUnderworldGodHud` — the God-View HUD model (Book V Part G) in **Underworld's** art palette (`UnderworldArtPalette.h`): era/pop/stance, the mean-awareness gauge, the critical-alert lane, the whisper feed. UMG widget is authored in-Editor against the palette.
  - `UnderworldEmotion.h` — the one canonical `EUwEmotion` (Book V Part F/K) for face + voice.
  - `AUnderworldPlayerController` — click-to-possess + god-verbs (bless/gift on press, cull on a Hold-to-confirm) + reticle→gaze tracking.
  - `AUnderworldSpectatorPawn` — Enhanced-Input orbit/fly/zoom camera; Pixel Streaming forwards the browser input here.
  - `AUnderworldGameMode` — default pawn = spectator; HUD = `AUnderworldGodHud`.
- **Config** (`Config/DefaultEngine.ini`): Lumen GI + reflections, **hardware ray tracing**, Nanite, Virtual Shadow Maps, TSR, NVENC H264 Pixel Streaming, C++ GameMode default.
- **Asset bridge** (`Content/Python/import_underworld_glbs.py`): bulk-imports the existing **1,488 GLBs** (same paid Tripo art as the Three.js renderer) as Nanite meshes.
- **Deploy** (`../pixelstream/`): Dockerfile (Epic pixel-streaming runtime), `docker-compose.yml` (ue5 + signalling + TURN), `run-ue5.sh`, `vast-deploy.sh`.

## Prerequisites the developer supplies
1. **Unreal Engine 5.5** (Epic Launcher or Epic-linked GitHub source).
2. **A workstation with the Editor** to compile the module, import art, build the level, and package.
3. **A GPU render box** with **Vulkan + NVENC + offscreen-capable image** — NOT the vast.ai inference box as-is (no X server; CUDA 13.0 is newer than Epic's pixel-streaming runtime supports). One RTX 4090 can stream while another serves Ollama, on a correctly-imaged box.

## Steps
1. **Open** `Underworld.uproject` → let it compile the `Underworld` C++ module.
2. **Import art** (the **2,448 GLBs** — same paid Tripo/Kenney art the WebGL renderer uses):
   - The glb-url → `/Game` asset map is **pre-generated headlessly** (no Editor) and validated — run `python3 Scripts/gen_manifest.py`. It parses `asset_catalog.json` (22 real categories, not all-"prop"), assigns **collision-free** unique paths, and writes `Content/UnderworldAssets/manifest.json` (the single source of truth the C++ `LoadManifest` loads at runtime). *(Already generated in this repo; coverage verified 9/9 against the live backend's referenced assets.)*
   - Then the Editor import just executes that manifest: `UnrealEditor-Cmd "<proj>/Underworld.uproject" -run=pythonscript -script="Scripts/import_glbs.py"` (headless commandlet) — it reads `manifest.json::by_url`, imports each GLB to its exact path via the **Interchange** glTF importer, and enables **Nanite** on every StaticMesh. *(Interchange is the default glTF/GLB importer since UE 5.0.)*
3. **Build the level** `/Game/Maps/Underworld`: landscape/water islands + imported city/props; place `BP_WorldManager` (subclass of `AUnderworldWorldManager`, set `MinionClass`=`BP_Minion`, `Sun`=Directional Light); create `BP_Minion` (subclass of `AUnderworldMinion`) with a skeletal mesh + Anim BP switching on the `Anim` string via `OnAnimChanged`; add Sky + Directional Light + Post Process (Sims grade).
4. **Input**: Enhanced-Input `IMC_Spectator` + `IA_Move/IA_Look/IA_Zoom`, assigned on `BP_Spectator` (subclass of `AUnderworldSpectatorPawn`).
5. **Package**: Platforms → Linux → Shipping → Package Project → `deploy/pixelstream/game/`.
6. **Deploy** on the GPU box:
   ```bash
   cd deploy/pixelstream
   cp .env.example .env   # UE5_PUBLIC_IP, UNDERWORLD_API_URL=http://<host>:8091,
                          # UNDERWORLD_WORLD_ID=<id>, UNDERWORLD_API_KEY=dev-key
   ./vast-deploy.sh       # or docker compose up -d
   ```
7. **Point the web at it**: `VITE_UNDERWORLD_PIXELSTREAM_URL=http://<gpu-host>:<player-port>/` in `underworld/web/.env.local` → `npm run build`. Open a world → toggle **UE5** mode.

## Frame flow
```
backend /worlds/{id}/scene-state ──poll──▶ USceneStateClient ──▶ AUnderworldWorldManager
   (Llama-driven sim, :8091)                                          │ spawn/move minions
                                                                      ▼
        browser <──WebRTC H264── SignallingWebServer (PSInfra UE5.5) ◀──NVENC── UE5 headless -RenderOffScreen
            └── mouse/keyboard ──data channel──▶ AUnderworldSpectatorPawn (Enhanced Input)
```

## Researched build/deploy commands (UE 5.5, current)
Verbatim, runnable on a Linux box with the engine + a source-built editor. Sourced from Epic's
current docs + the community refs below (the Pixel Streaming forum/repo guidance — checked Jun 2026).

**A. Headless GLB import (commandlet, no GUI):**
```bash
# manifest first (headless, already done in-repo) — then the Editor import that consumes it:
"$UE/Engine/Binaries/Linux/UnrealEditor-Cmd" "$PROJ/Underworld.uproject" \
  -run=pythonscript -script="$PROJ/Scripts/import_glbs.py" -unattended -nosplash -nullrhi
```

**B. Package Linux Shipping (RunUAT BuildCookRun):**
```bash
"$UE/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun \
  -project="$PROJ/Underworld.uproject" -noP4 -utf8output \
  -platform=Linux -targetplatform=Linux -clientconfig=Shipping \
  -build -cook -allmaps -stage -pak -archive -archivedirectory="$PROJ/../pixelstream/game"
```
`/Game/UnderworldAssets` cooks in via `DirectoriesToAlwaysCook` (assets are referenced only by the
runtime manifest string, never hard-ref'd) — confirm that entry in `Config/DefaultGame.ini`.

**C. Signalling server (UE 5.5 — the `EpicGamesExt/PixelStreamingInfrastructure` repo):**
```bash
git clone -b UE5.5 https://github.com/EpicGamesExt/PixelStreamingInfrastructure
cd PixelStreamingInfrastructure && npm install
./SignallingWebServer/platform_scripts/bash/start.sh    # streamer ws :8888, player http :80
```
> Pin the **UE5.5 branch** — there are breaking changes between UE versions (the 5.5 branch is
> marked end-of-life but is the correct match for a 5.5 build).

**D. Launch the packaged app as the streamer (the headless gotcha):**
```bash
"$PROJ/../pixelstream/game/LinuxServer/Underworld.sh" \
  -PixelStreamingURL=ws://127.0.0.1:8888 \
  -RenderOffScreen -ForceRes -ResX=1920 -ResY=1080 -AudioMixer \
  -UnderworldApiUrl=http://<host>:8091 -UnderworldWorldId=<id>
# API key via ENV, not argv (the client reads UNDERWORLD_API_KEY first — keeps the secret off ps):
export UNDERWORLD_API_KEY=<key>
```
> **Critical for a headless/cloud GPU box:** with the **Vulkan** RHI, offscreen rendering is **not**
> auto-enabled when there's no X server — you **must** pass `-RenderOffScreen` (OpenGL auto-detects
> headless; Vulkan does not). The render container must derive from an `nvidia/vulkan` base (NVIDIA
> Container Toolkit) and the box needs **NVENC**. This is exactly why the bare vast.ai inference box
> won't stream as-is — it needs the Vulkan+NVENC offscreen image, not the Ollama image.

**E. Point the web shell at the stream:** `VITE_UNDERWORLD_PIXELSTREAM_URL=http://<gpu-host>:80/`
in `underworld/web/.env.local` → `npm run build`; open a world → toggle **UE5** mode.

### Sources
- [Getting Started with Pixel Streaming — Epic](https://dev.epicgames.com/documentation/en-us/unreal-engine/getting-started-with-pixel-streaming-in-unreal-engine)
- [Pixel Streaming Infrastructure (signalling server) — EpicGamesExt GitHub](https://github.com/EpicGamesExt/PixelStreamingInfrastructure)
- [Pixel Streaming in Linux containers — Adam Rehn](https://adamrehn.com/articles/pixel-streaming-in-linux-containers/) · [ue4-runtime (NVIDIA Container Toolkit images)](https://github.com/adamrehn/ue4-runtime)
- [Importing glTF Files into Unreal Engine (Interchange) — Epic](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-gltf-files-into-unreal-engine)
- [Build/Cook/Package (BuildCookRun) — Epic](https://dev.epicgames.com/documentation/unreal-engine/build-operations-cooking-packaging-deploying-and-running-projects-in-unreal-engine)

## Honest effort
The **code + contract + the headless-derivable prep** is done (incl. the validated, collision-free
asset manifest). The remaining work — running the Editor import, building the level, rigging minion
anims, authoring the BPs/HUD widget, packaging, and a correctly-imaged Vulkan+NVENC GPU box — is
**multi-week, art- and Editor-dependent**. Until then the **Three.js/WebGL** Underworld
(`underworld/web`, live on :5180) is the running 3D world; this UE5 path is the high-fidelity upgrade
behind the same `scene-state` contract — no backend change.
