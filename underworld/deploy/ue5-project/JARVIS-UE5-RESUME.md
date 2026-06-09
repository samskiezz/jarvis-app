# JARVIS HUD — UE5 cook/stream RESUME STATE (pick up anytime)

Last updated this session. Read this first to continue the UE5 JARVIS HUD without re-deriving the hard-won workarounds. Companion docs: `JARVIS-UE5-RUNBOOK.md`, `JARVIS-UE5-WORKAROUNDS.md`.

## Where it stands
- **C++ module COMPILES** on UE5.5. Fixed: `UnderworldMinion` `Role`→`MinionRole` (shadowed `AActor::Role`); `UnderworldPlayableMinion::IsPlayerControlled` UFUNCTION-on-override removed; `UnderworldWorldManager.h` forward-declares `USceneStateClient`. Built artifact: `Binaries/Linux/libUnrealEditor-Underworld.so`.
- **48 custom JARVIS GLBs imported** (Nanite) into `Content/JarvisAssets/<scene>/…` across 11 chambers, via `Scripts/run-jarvis-import.sh` (`ok=48 fail=0`). Manifest: `Content/JarvisAssets/manifest.json`.
- **Level authored**: `/Game/Maps/JarvisHUD` (`Content/Maps/JarvisHUD.umap`) with an `AJarvisHudManager` (assembles the chamber from the manifest on BeginPlay), the `M_JarvisHolo` master material (unlit/additive, Fresnel rim, scrolling scanline), a SkyLight/DirectionalLight/fog, a free-fly DefaultPawn + orbit CameraActor, and a PlayerStart. `DefaultEngine.ini` → `GameDefaultMap=/Game/Maps/JarvisHUD`, `GlobalDefaultGameMode=GameModeBase`.
- **Cook = the open item.** Build succeeds; the **cook's global-shader phase** is the wall on the 31GB Hostinger box, made unwinnable by a SECOND concurrent UE5 cook (the `Underworld_Render.uproject` pipeline) sharing the same engine + the single UAT build-mutex + RAM. Two UE5 cooks cannot coexist on one box/engine.

## The working cook recipe (run AS `ueuser`)
Engine is a non-root source build; run everything as `ueuser` (UID 1003). One-time/again as needed:
```
chown -R ueuser:ueuser /opt/UnrealEngine /opt/jarvis-app-1/underworld/deploy/ue5-project   # uniform owner (no uebuild/root mix)
chmod 1777 /tmp/uba_shm_locks                                                                # UBA locks writable
```
Cook: `Scripts/cook-jarvis.sh` (RunUAT BuildCookRun, `-map=/Game/Maps/JarvisHUD`, Development). Workarounds baked in / required:
- `-ddc=InstalledNoZenLocalFallback` — ZenLocal readiness SIGSEGVs the editor; engine `DerivedDataCache` must be writable by `ueuser`.
- `Fab` + `Bridge` plugins DISABLED in `Underworld.uproject` (they need `libatk` GUI libs headless). Also `apt install libatk1.0-0 …` runtime libs.
- `~/.config/Unreal Engine/UnrealBuildTool/BuildConfiguration.xml` caps `MaxParallelActions=2` (build OOM'd at 8-wide).
- `DefaultEngine.ini [DevOptions.Shaders] NumUnusedShaderCompilingThreads=6` — caps the cook's shader fan-out (default 8-wide OOMs the box).
- swap present (`/swapfile`, ~16G) as OOM backstop.

## To RESUME → stream
1. **Free the box of any other UE5 cook** (the #1 blocker). Check `ps -eo args | grep -iE 'BuildCookRun|UnrealEditor.*Cook'`. Cooking on a contended 31GB box is the anti-pattern — prefer cooking on the Vast 4090 box (more RAM + the GPU that renders it).
2. `sudo -u ueuser -H bash -c 'export UE_ROOT=/opt/UnrealEngine HOME=/home/ueuser PROJ=… MAP=/Game/Maps/JarvisHUD ARCHIVE=$PROJ/Packaged CONFIG=Development; bash Scripts/cook-jarvis.sh'` → produces `Packaged/Linux/`.
3. **Provision the Vast render node** (`deploy/pixelstream/provision-render-node.sh`): Vulkan ICD + NVENC + `PixelStreamingInfrastructure` (UE5.5).
4. `rsync Packaged/Linux/ → vast:…/deploy/pixelstream/game/` then `deploy/pixelstream/run-jarvis-stream.sh` (GPU1; GPU0 stays for the Ollama brain) → `-RenderOffscreen -vulkan` + Pixel Streaming.
5. Set the web frontend's stream URL to the Vast player port.

## BACKUP GAP (action needed for true "pick up anytime")
- The **48 source GLBs in `jarvis_assets/` (775M) are gitignored** → NOT on GitHub. They're the expensive Tripo-generated assets. Back them up to object storage (R2) — they are not reproducible for free.
- The imported `Content/JarvisAssets/*.uasset` and `Content/Maps/JarvisHUD.umap` — confirm tracked; re-derivable via `run-jarvis-import.sh` + `make_jarvis_level.py` only if the source GLBs exist.

## Disk / data safety (already installed)
`scripts/jarvis-disk-guard` (allowlist-only junk purge) runs every 30min via cron; pm2-logrotate caps logs; journald capped. NEVER delete: `server/data/*.db`, `underworld/data/*.db*`, `/opt/supabase` + docker volumes (incl. 18G `openclaw`), `/var/lib/redis`, `jarvis_assets`, any `*.glb`. See the `data-stores-map` memory.
