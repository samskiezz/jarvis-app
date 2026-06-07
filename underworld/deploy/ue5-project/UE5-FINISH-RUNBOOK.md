# Underworld UE5 — Finish & Go-Live Runbook

This project is a **complete code/config scaffold**: the C++ runtime that turns the
backend's live `/worlds/{id}/scene-state` into a ray-traced, pixel-streamed world is
written and wired. What remains requires the **Unreal Editor + a GPU render box +
authored art** — which a headless coding sandbox can't do. This is the exact path a
UE5 developer follows to take it live.

## Already done (in this repo)
- **Engine project**: `Underworld.uproject` (UE 5.5; PixelStreaming + MetaHuman + Water + Landmass), targets, primary game module.
- **C++ runtime** (`Source/Underworld/`):
  - `USceneStateClient` — GameInstance subsystem; polls `{ApiUrl}/worlds/{WorldId}/scene-state` every 0.5s (Bearer); parses the JSON into `FUwSceneState`. Reads `-UnderworldApiUrl=`, `-UnderworldWorldId=`, `-UnderworldApiKey=` from the cmdline.
  - `AUnderworldWorldManager` — reconciles the world each tick: spawn/update/despawn `AUnderworldMinion` by id; drives the sun from time-of-day.
  - `AUnderworldMinion` — smooth position/facing interpolation + `OnAnimChanged`/`OnGuildChanged` hooks for the Anim BP / material.
  - `AUnderworldSpectatorPawn` — Enhanced-Input orbit/fly/zoom camera; Pixel Streaming forwards the browser input here.
  - `AUnderworldGameMode` — default pawn = spectator.
- **Config** (`Config/DefaultEngine.ini`): Lumen GI + reflections, **hardware ray tracing**, Nanite, Virtual Shadow Maps, TSR, NVENC H264 Pixel Streaming, C++ GameMode default.
- **Asset bridge** (`Content/Python/import_underworld_glbs.py`): bulk-imports the existing **1,488 GLBs** (same paid Tripo art as the Three.js renderer) as Nanite meshes.
- **Deploy** (`../pixelstream/`): Dockerfile (Epic pixel-streaming runtime), `docker-compose.yml` (ue5 + signalling + TURN), `run-ue5.sh`, `vast-deploy.sh`.

## Prerequisites the developer supplies
1. **Unreal Engine 5.5** (Epic Launcher or Epic-linked GitHub source).
2. **A workstation with the Editor** to compile the module, import art, build the level, and package.
3. **A GPU render box** with **Vulkan + NVENC + offscreen-capable image** — NOT the vast.ai inference box as-is (no X server; CUDA 13.0 is newer than Epic's pixel-streaming runtime supports). One RTX 4090 can stream while another serves Ollama, on a correctly-imaged box.

## Steps
1. **Open** `Underworld.uproject` → let it compile the `Underworld` C++ module.
2. **Import art**: Window → Python → `py "Content/Python/import_underworld_glbs.py"` → imports the 1,488 GLBs to `/Game/Underworld/Meshes/` as Nanite.
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
        browser <──WebRTC H264── signalling (cirrus) ◀──NVENC── UE5 headless -RenderOffscreen
            └── mouse/keyboard ──data channel──▶ AUnderworldSpectatorPawn (Enhanced Input)
```

## Honest effort
The code + deploy scaffold is done. The remaining work — authoring/importing art, building the level, rigging minion anims, packaging, and a correctly-imaged GPU box — is **multi-week, art-dependent** with the Editor. Until then the **Three.js/WebGL** Underworld (`underworld/web`, already live) is the running 3D world; this UE5 path is the high-fidelity upgrade behind the same `scene-state` contract — no backend change.
