# GPU rendering for Underworld (Pixel Streaming)

## How the GPU path actually works
The Underworld web app ships **two renderers**:
1. **WebGL (Three.js)** — the default. Renders in the browser on the *local* GPU.
   This is what you see today; a remote GPU does **not** speed this up.
2. **UE5 Pixel Streaming** — the "Stream UE5" toggle in WorldDetail. It embeds a
   video stream from an **Unreal Engine 5 app running on a GPU host**, encoded to
   H.264/H.265 and shipped over WebRTC. This is the AAA-quality path.

The web client (`PixelStreamingViewer.tsx`) is **done and pre-wired** to
`https://projectsolar.cloud/pixelstream/` (override with
`VITE_UNDERWORLD_PIXELSTREAM_URL`). The toggle connects the moment a streamer is
live there, and shows "GPU host up?" if not.

## What must run on the vast.ai GPU box (not in this repo)
Pixel Streaming needs a **built Unreal Engine application** to stream. This repo
contains the Three.js world and the streaming *client*, but **no `.uproject` /
UE5 source** — that has to be built. To light up the GPU tier:

1. **Signaling server** (Epic's Pixel Streaming Infrastructure), reverse-proxied
   by your Hostinger VPS at `projectsolar.cloud`:
   ```
   docker run -p 80:80 -p 8888:8888 \
     -e SIGNALLING_URL=wss://projectsolar.cloud/ws \
     ghcr.io/epicgames/pixel-streaming-signalling-server:5.4
   ```
2. **UE5 Underworld client** on the vast.ai GPU instance (NVIDIA driver + the
   PixelStreaming plugin), launched headless against the signaling URL:
   ```
   ./Underworld.sh -RenderOffscreen -PixelStreamingURL=ws://<gpu-host>:8888
   ```
3. Point `VITE_UNDERWORLD_PIXELSTREAM_URL` at the signaling frontend (default is
   already `projectsolar.cloud/pixelstream/`).

## Honest status / what's blocked
- **No server credentials live in this repo** (no SSH key, vast.ai key, or
  Hostinger login), and the build sandbox can't SSH out — so deployment must be
  driven from your machine / CI with those secrets, never pasted into the repo.
- **The UE5 Underworld app does not exist yet.** Building it (porting the world,
  buildings, minions, navmesh to Unreal with Nanite/Lumen) is a dedicated
  Unreal-engineering project — weeks of work — not a config or SSH task.

## The realistic options
- **(Recommended, in-repo) Push the WebGL renderer further** — GPU instancing for
  thousands of buildings/trees + chunked LOD streaming. This makes the *existing*
  open-world look far better in the browser with no UE5 and no remote GPU. I can
  build this now.
- **(Big project) Build the UE5 Underworld** and stream it from vast.ai via the
  pipeline above. I can scaffold the Unreal project + the data bridge (the UE app
  reads the same `/worlds/{id}` API), but it's a multi-week engine build and needs
  an Unreal toolchain, not this Python/TS sandbox.
