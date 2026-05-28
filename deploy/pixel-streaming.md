# Pixel Streaming on `projectsolar.cloud` — AAA graphics in the browser

You asked: "if Sims-4 graphics can't render in browser, how does RuneScape do
it?" The honest answer is **most modern AAA-in-browser uses Pixel Streaming**:
the game runs on a GPU server, renders to video, ships frames over WebRTC to
the browser. The browser is a thin video-player + input-forwarder. This is
how Fortnite UEFN previews work, how Boosteroid/GeForce Now run AAA games in
a tab, how Roblox Studio's web export runs.

Your existing React app embeds the stream via an `<iframe>` (see
`underworld/web/src/components/scene/PixelStreamingViewer.tsx`). The hard
work happens on the VPS. This file walks through exactly that setup.

## Architecture

```
┌──────────────────────────────────────┐
│ Browser (any device)                 │
│  • underworld React app              │
│  • <PixelStreamingViewer signaling…/>│
│      ↓ WebRTC video + input ↑        │
└──────────────────────────────────────┘
                │ HTTPS / WSS
                ▼
┌───────────────────────────────────────────────────────────────┐
│ projectsolar.cloud GPU VPS                                    │
│                                                               │
│ ┌─────────────────────────┐  ┌──────────────────────────────┐ │
│ │ Pixel-Streaming         │  │ Unreal Engine 5 client       │ │
│ │ signaling+web frontend  │←→│  • UE5.4 + PixelStreaming    │ │
│ │ :443  WSS / TURN        │  │  • MetaHumans (Quixel free)  │ │
│ └─────────────────────────┘  │  • Lumen GI + Nanite + RT    │ │
│                              │  • Polls Python backend's    │ │
│                              │    /worlds/{id}/minions      │ │
│                              └──────────────┬───────────────┘ │
│                                             │ REST            │
│ ┌──────────────────────────┐                ▼                 │
│ │ Underworld Python backend (port 8000) ←──────               │
│ │  • simulation / breeding / DNA / inventions                 │
│ └──────────────────────────────────────────────────────────── │
└───────────────────────────────────────────────────────────────┘
```

The Python backend, the Unreal client, and the Pixel-Streaming signaling
server all run on the same GPU VPS. The browser hits Caddy / nginx on :443
which routes:

- `/` → React app
- `/api/*`, `/worlds/*` → Python backend (already wired)
- `/pixelstream/` → Pixel-Streaming signaling server (new)

## VPS prerequisites

projectsolar.cloud must be a GPU VPS. NVIDIA driver 535+ required.

**Cheapest GPU VPS options (paid hourly, can dial in/out):**
| Provider | GPU | Price/hr (rough, 2026) |
|---|---|---|
| Vast.ai (interruptible) | RTX 4090 | $0.30–$0.60 |
| RunPod | RTX 4090 | $0.39 |
| Lambda Labs | A10G | $0.60 |
| Hetzner GPU | RTX 6000 Ada | $0.95 |

If projectsolar.cloud is a non-GPU box (the 503 response suggests something
basic is wrong on it right now), you must move to a GPU host or remote-render
to a separate GPU instance and have projectsolar.cloud just proxy traffic.

```bash
# On the GPU VPS — install NVIDIA driver + container toolkit
sudo apt update && sudo apt install -y nvidia-driver-535 docker.io
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi  # sanity check
```

## Pixel-Streaming signaling server

Epic Games maintains the official infra as a Docker image:

```bash
# On the GPU VPS
docker run -d --name pixstream-signal --restart unless-stopped \
  -p 8888:8888 -p 8889:8889 -p 80:80 -p 443:443 \
  -e PUBLIC_IP=$(curl -s ifconfig.me) \
  ghcr.io/epicgames/pixel-streaming-signalling-server:latest
```

The signaling server's frontend lives at `https://<host>:443/`. Your
`PixelStreamingViewer` should set `signalingUrl="https://projectsolar.cloud/"`
(or `wss://…/ws` for the WebSocket variant — Epic's frontend handles both).

## The Unreal client

This is the hard part. Two routes:

### Route 1 — Build from source (one-time, ~2 hours)

```bash
# On a workstation with UE5 installed (Win/Mac/Linux)
git clone https://github.com/EpicGames/PixelStreamingInfrastructure.git
# Open your UE5 project in the editor.
# Edit→Plugins→Pixel Streaming→Enable.
# Project Settings → Pixel Streaming → set "Signalling Server URL" to
#   wss://projectsolar.cloud:8888
# Build the Linux Server target:
./Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
  -project=$(pwd)/UnderworldUE.uproject \
  -platform=Linux -clientconfig=Shipping -server -serverconfig=Shipping \
  -build -cook -stage -pak -archive -archivedirectory=./out
# rsync the resulting ./out folder to the GPU VPS.
```

On the VPS:

```bash
# Run headless against the signaling server. The -RenderOffscreen flag
# avoids needing an X server.
cd /opt/UnderworldUE
xvfb-run -a ./Linux/UnderworldServer.sh \
  -PixelStreamingURL=ws://localhost:8888 \
  -RenderOffscreen -ResX=1920 -ResY=1080 \
  -ForceRes -graphicsadapter=0
```

### Route 2 — Use Tencent's open Unreal-via-Cloud helper (faster)

`pixel-streaming-on-aws` and similar projects bundle UE5 + signaling + a
launcher script. Best maintained: https://github.com/aws-samples/unreal-engine-pixel-streaming-on-eks

Adapt that compose file to your VPS — the only thing that changes is the
container image name and the GPU runtime flag (`--gpus all`).

## Caddy reverse proxy update

Add to `deploy/Caddyfile`:

```caddyfile
underworld.example.com {
    encode gzip zstd

    # Existing routes (React app + Python backend) unchanged …
    handle /assets/* { reverse_proxy underworld:8000 }
    handle /models/* { reverse_proxy underworld:8000 }
    @api path /api/* /worlds/* /knowledge/*
    handle @api {
        uri strip_prefix /api
        reverse_proxy underworld:8000 { flush_interval -1 }
    }

    # New: Pixel-Streaming endpoints. WebRTC needs the WS and TCP/443.
    handle /pixelstream/* {
        uri strip_prefix /pixelstream
        reverse_proxy pixstream-signal:80 {
            header_up X-Forwarded-Proto https
        }
    }
    handle /pixelstream-ws {
        reverse_proxy pixstream-signal:8888
    }

    handle { reverse_proxy underworld:8000 }
}
```

## Browser-side wiring

```tsx
// underworld/web/src/pages/WorldDetail.tsx
import PixelStreamingViewer from "@/components/scene/PixelStreamingViewer";

// Replace the WorldScene3D mount with the pixel stream when the user
// chooses the "AAA" rendering tier:
const [tier, setTier] = useState<"webgl" | "pixelstream">("webgl");

{tier === "webgl" ? (
  <WorldScene3D ... />
) : (
  <PixelStreamingViewer
    signalingUrl="https://projectsolar.cloud/pixelstream/"
    worldId={id}
    width={900}
    height={560}
  />
)}
```

A tier-toggle in the HUD lets the user flip between the in-browser WebGL
scene (free, low-spec friendly) and the GPU-rendered Pixel Stream (AAA but
needs a paid GPU somewhere in the chain).

## Cost reality

- Pixel Streaming is **expensive** at scale because each viewer needs a
  dedicated GPU encoder slot. One RTX 4090 ≈ 4-8 simultaneous 1080p streams.
- Single-user / dev mode on a $0.40/hr instance is fine.
- Public game launch needs a GPU autoscaler (AWS GameLift, NVIDIA CloudXR,
  Vagon) — those handle the per-user GPU rental.

## TL;DR

- `PixelStreamingViewer.tsx` is the browser bridge — just an iframe to the
  signaling server, with input forwarding.
- `deploy/pixel-streaming.md` (this file) is the VPS playbook.
- `deploy/unreal-client-notes.md` is the Unreal-project spec — the client
  binary you run on the GPU VPS.
- Combined: a real UE5 build rendering Lumen + Nanite + hardware ray
  tracing, streamed to the browser via WebRTC.

That **is** "Sims-4-tier in the browser". Same architecture Fortnite UEFN,
Boosteroid, NVIDIA GeForce Now, and Roblox Studio web use.
