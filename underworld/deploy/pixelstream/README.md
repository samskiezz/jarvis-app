# Underworld — UE5 Pixel Streaming on vast.ai (real graphics)

This brings the **high-fidelity renderer** online. The web app already supports
two render tiers (see `WorldDetail.tsx`): a free in-browser **WebGL** scene, and
**`pixelstream`** — an **Unreal Engine 5** game rendered on a GPU host and
streamed to the browser over WebRTC (the technique Fortnite/UEFN web previews and
GeForce Now use). This harness deploys that GPU host on **vast.ai** and wires the
frontend to it.

> Why this is needed: UE5's renderer (Lumen GI, Nanite, hardware encode) runs on
> the GPU. There is no GPU in CI/dev sandboxes, so the WebGL fallback there
> renders through software WebGL and looks flat/broken. Pixel Streaming moves the
> rendering to a real GPU and streams finished frames — so the *capturing* browser
> needs no GPU at all.

## What you supply (one-time)

1. **A packaged Linux build of the Underworld UE5 game** with the **Pixel
   Streaming** plugin enabled.
   - In the UE5 editor: *Edit → Plugins → enable "Pixel Streaming"*.
   - *Platforms → Linux → Package Project* (needs the Linux toolchain installed).
   - Copy the output folder (it contains `<Project>.sh` + a `Linux/` dir) into
     **`./game/`** next to this README.
2. **Access to Epic's runtime base image** (one-time): link your Epic + GitHub
   accounts, then `docker login ghcr.io`. The base image
   `ghcr.io/epicgames/unreal-engine:runtime-pixel-streaming` carries the Vulkan +
   NVENC deps UE needs. (Docs: https://unrealcontainers.com/docs/use-cases/pixel-streaming)

That's the only content the repo can't generate for you — everything else below
is automated.

## Deploy (3 commands)

```bash
pip install vastai && vastai set api-key <YOUR_VAST_KEY>

# 1) rent a GPU node + bootstrap it (Docker + NVIDIA toolkit)
GPU=RTX_4090 MAXPRICE=0.80 ./vast-deploy.sh

# 2) on the node: copy this dir + your ./game build, then bring the stack up
#    (vast-deploy.sh prints the exact scp/ssh lines for your instance)
PUBLIC_IP=<instance-ip> docker compose up -d --build
```

The stack (`docker-compose.yml`):
- **ue5** — your game, headless `-RenderOffscreen`, NVENC H.264 over WebRTC.
- **signalling** — Epic's Pixel Streaming Infrastructure (serves the web frontend
  the React iframe loads; brokers WebRTC).
- **turn** — coturn relay for NAT traversal.

## Wire the frontend

Point the app at the GPU host and rebuild the web bundle:

```bash
# from underworld/web
echo "VITE_UNDERWORLD_PIXELSTREAM_URL=https://<instance-ip>/" >> .env
npm run build
```

Open a world → click **“Stream UE5”** → you’re looking at real UE5 graphics.

## Capture a true screenshot (from anywhere — no GPU needed)

Because frames are rendered remotely and streamed, capture works on any box:

```bash
python capture_stream.py https://<instance-ip>/ underworld_ue5.png
```

## Cost / sizing

- A single **RTX 4090 / A6000 / L40** (~$0.3–0.8/hr on vast.ai) streams one
  high-fidelity session smoothly at 1080p60.
- For many concurrent viewers, run multiple UE5 instances behind the Matchmaker
  (Epic PSInfra) and scale GPUs — the same per-GPU streaming model.

## Files

| file | purpose |
|---|---|
| `vast-deploy.sh` | rent + bootstrap a vast.ai GPU node |
| `onstart.sh` | host bootstrap (Docker + NVIDIA toolkit) |
| `docker-compose.yml` | ue5 + signalling + turn |
| `Dockerfile.ue5` / `run-ue5.sh` | wrap + launch the packaged game headless |
| `capture_stream.py` | screenshot the live stream from any machine |
| `.env.example` | host config |

Sources: [Epic Pixel Streaming Infrastructure](https://github.com/EpicGamesExt/PixelStreamingInfrastructure) ·
[Pixel Streaming in Linux containers](https://unrealcontainers.com/docs/use-cases/pixel-streaming)
