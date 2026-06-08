# JARVIS UE5 bring-up — research-hardened workarounds (forums + Epic docs)

Baked into `Scripts/import_jarvis_glbs.py` + this runbook so the GPU-box session is safe.

## glTF / Interchange import (UE5.5)
1. **Interchange ignores `AssetImportTask.destination_name`** — the asset name is set by the
   pipeline, not the task. → We import each GLB into its **own folder** `/Game/JarvisAssets/<scene>/<Name>/`
   and resolve the StaticMesh from that folder. (Names never collide/mis-resolve.)
2. **Interchange-in-commandlet can crash headless.** If `import_asset_tasks` crashes, relaunch the
   import forcing the **legacy glTF importer**:
   ```
   UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=Scripts/import_jarvis_glbs.py \
     -unattended -nullrhi \
     -ini:Engine:[/Script/InterchangeEngine.InterchangeProjectSettings]bUseInterchangeWhenImportingIntoLevel=False
   ```
   (The script works under either importer.)
3. **Nanite on imported glTF errors on some meshes** (reported 5.3+). → Nanite-enable is wrapped
   per-mesh in try/except; a failing mesh is skipped, import still succeeds.

## Pixel Streaming on Linux (RTX 4090 / Vast)
Use the **official** infra, not a hand-rolled stack:
1. GPU host needs **NVIDIA driver + NVENC** and (for containers) the **NVIDIA Container Toolkit**.
2. Get the servers: `Engine/Plugins/Media/PixelStreaming/Resources/WebServers/get_ps_servers.sh`
   (or clone `github.com/EpicGamesExt/PixelStreamingInfrastructure`).
3. Signalling server (Cirrus): `SignallingWebServer/platform_scripts/bash/setup.sh` then
   `start_with_stun.sh`. Ready when it logs: *Streamer connections on :8888, Players on :80*.
4. Launch the cooked game headless:
   ```
   ./Underworld.sh -RenderOffScreen -Unattended -PixelStreamingIP=127.0.0.1 -PixelStreamingPort=8888 \
     -PixelStreamingEncoderCodec=H264 -graphicsadapter=0 -JarvisChamber=01_command_atrium
   ```
5. Browser → the SignallingWebServer (player port). Set the web shell's `VITE_STREAM_URL` to it.

## Sources
- Importing glTF / Interchange — Epic docs + forums:
  https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-gltf-files-into-unreal-engine ·
  https://forums.unrealengine.com/t/interchange-with-python-in-an-unreal-commandlet/724404 ·
  https://forums.unrealengine.com/t/nanite-error-gltf-and-fbx-import-5-3-2/1551890
- Enable Nanite with Python: https://dev.epicgames.com/community/learning/tutorials/4x7v/unreal-engine-enable-nanite-with-python
- Pixel Streaming Infrastructure: https://github.com/EpicGamesExt/PixelStreamingInfrastructure ·
  https://dev.epicgames.com/documentation/en-us/unreal-engine/getting-started-with-pixel-streaming-in-unreal-engine ·
  Linux containers: https://adamrehn.com/articles/pixel-streaming-in-linux-containers/
