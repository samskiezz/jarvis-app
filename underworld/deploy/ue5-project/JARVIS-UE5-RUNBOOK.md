# JARVIS HUD — UE5 Pixel-Streaming Runbook (GPU box)

Renders the render-locked JARVIS chambers in UE5.5 from the generated GLBs and streams
them to the browser via Pixel Streaming. Reuses the existing Underworld UE5 spine
(Interchange glTF import, Lumen/Nanite/RT, PixelStreaming, docker signalling).

**Inputs produced on the build host (this repo):**
- `public/immersive/assets/*.glb` — the custom JARVIS GLBs (PBR, Tripo).
- `public/immersive/scene_assembly.json` — every GLB → scene → anchor.
- These are read by `Scripts/gen_jarvis_manifest.py` to emit `Content/JarvisAssets/manifest.json`.

> Prereqs: UE 5.5 source-built at `$UE_ROOT` (default `/opt/UnrealEngine`), this project at
> `$PROJ` (`/opt/jarvis-app-1/underworld/deploy/ue5-project`), the `assets/` GLBs present
> (rsync them to the GPU box if you generated elsewhere), a CUDA GPU + NVENC.

## 1. Generate manifest + import GLBs (headless, no Editor UI)
```bash
export UE_ROOT=/opt/UnrealEngine
export PROJ=/opt/jarvis-app-1/underworld/deploy/ue5-project
bash "$PROJ/Scripts/run-jarvis-import.sh"
```
Imports every GLB via Interchange into `/Game/JarvisAssets/<scene>/<Name>` (PBR) and enables
Nanite. Expect `[jarvis-import] DONE — N import tasks, Nanite enabled on N meshes`.

## 2. Compile the C++ (adds AJarvisHudManager)
```bash
"$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh" \
  -Project="$PROJ/Underworld.uproject" -Target=UnrealEditor -Platform=Linux -Configuration=Development
```

## 3. Level + holographic material (one-time, in the Editor)
Open `Underworld.uproject` →
1. Create material `/Game/JarvisAssets/M_HolographicMaster`: **Translucent**, Emissive = cyan
   `#29E7FF` × ~2.5 (Lumen glow), Roughness 0.2, Opacity ~0.85, Fresnel rim. (Scalar params
   `HoloEmissive`, `HoloOpacity` for per-chamber tuning.)
2. Create level `/Game/Maps/JarvisHUD`: dark sky + cool cyan directional light + a floor plane
   (black-chrome material) + post-process (bloom on, fixed exposure). Place a `BP_JarvisHudManager`
   (BP subclass of `AJarvisHudManager`); set `HolographicMasterMaterial = M_HolographicMaster`
   and `DefaultChamber = 01_command_atrium`. Save.
   - The manager auto-assembles the chamber from `manifest.json` at the procedural anchor layout
     (hero center, left/right docks, status, bottom command). Tweak `AnchorTransform()` to taste.

## 4. Cooking config
`Config/DefaultGame.ini` must cook + stage the JARVIS assets (see the edit below):
```
[/Script/UnrealEd.ProjectPackagingSettings]
+DirectoriesToAlwaysCook=(Path="/Game/JarvisAssets")
+DirectoriesToAlwaysCook=(Path="/Game/Maps")
```
Default map (or pass at runtime): `GameDefaultMap=/Game/Maps/JarvisHUD`.

## 5. Cook + package (Linux Shipping)
```bash
"$UE_ROOT/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun \
  -project="$PROJ/Underworld.uproject" -noP4 -utf8output \
  -platform=Linux -clientconfig=Shipping -build -cook -allmaps -stage -pak -archive \
  -archivedirectory="$PROJ/../pixelstream/game"
```

## 6. Start Pixel Streaming signalling (docker) + launch the stream
```bash
cd /opt/jarvis-app-1/underworld/deploy/pixelstream
docker compose up -d      # signalling + TURN (existing stack)

GAME="$PROJ/../pixelstream/game/LinuxClient/Underworld.sh"   # path from the archive step
"$GAME" -RenderOffscreen -Unattended -ForceRes -ResX=1920 -ResY=1080 \
  -PixelStreamingIP=127.0.0.1 -PixelStreamingPort=8888 \
  -PixelStreamingEncoderCodec=H264 -AllowPixelStreamingCommands -graphicsadapter=0 \
  -JarvisChamber=01_command_atrium
```
Switch chambers by relaunching with a different `-JarvisChamber=<scene_id>` (or wire the
web command bar to a PixelStreaming input command that calls `LoadChamber`).

## 7. Connect
Browser → `http://<GPU_BOX_IP>` (the signalling web frontend). For the JARVIS web shell to
embed it, set in the frontend env: `VITE_STREAM_URL=http://<GPU_BOX_IP>` — `CinematicShell`
then embeds the stream (and the boot loader video plays until it's live).

## 8. (Optional) Live data into the chambers
`USceneStateClient` already polls a backend API. Point it at `/v1/cinematic/scene/<scene_id>`
(this repo's hydration route) to drive per-anchor readouts / emissive intensity from the real
knowledge base — same pattern as Underworld's minion state feed.

---
**Files this runbook uses** (added to the project): `Scripts/gen_jarvis_manifest.py`,
`Scripts/import_jarvis_glbs.py`, `Scripts/run-jarvis-import.sh`,
`Source/Underworld/JarvisHudManager.{h,cpp}`. Reused: PixelStreaming stack under
`deploy/pixelstream/`, render config in `Config/DefaultEngine.ini`.
