# Pixel Streaming on Vast.ai — exact deploy steps

You have a Vast.ai instance with GPUs running. Vast.ai is **container-based**
(your "instance" is a Docker container on a host GPU), with their own port
proxy. That changes the setup vs a bare VPS — this file is the Vast.ai-specific
playbook.

## 1. Pick the right Vast.ai image when launching

When you create the instance, set:

| Field | Value |
|---|---|
| **Template / Image** | `nvcr.io/nvidia/cuda:12.4.1-runtime-ubuntu22.04` (or any CUDA 12.x base) |
| **GPU** | RTX 3090 / 4090 / A5000 / A6000 — anything ≥ 12 GB VRAM |
| **Disk** | 50 GB+ (Unreal binary + assets) |
| **Open ports** | `8888/tcp` (signaling), `80/tcp` (HTTP frontend), `19302/udp` (STUN/TURN) |
| **Run script** | `bash -c "apt update && apt install -y openssh-server && service ssh start && sleep infinity"` |

After it boots, Vast.ai gives you:
- An **SSH command** (`ssh -p <port> root@<host>`)
- A **proxy URL** for each open port (e.g. `https://<host>:<proxy-port>` → maps to container port 80)

Copy the SSH command — that's how I'd push the streamer onto it.

## 2. Push the streamer onto the Vast.ai instance

From your laptop (or wherever you cloned the repo):

```bash
# Adjust the SSH host/port to whatever Vast.ai gave you.
VAST_SSH="ssh -p 12345 root@ssh4.vast.ai"
VAST_RSYNC="rsync -e 'ssh -p 12345' -avzP"

# Push the install script.
${VAST_RSYNC} deploy/setup-pixel-streaming-vast.sh root@ssh4.vast.ai:/root/
${VAST_SSH} 'chmod +x /root/setup-pixel-streaming-vast.sh && /root/setup-pixel-streaming-vast.sh'
```

`setup-pixel-streaming-vast.sh` (shipped in this repo) handles the
container-in-container quirks Vast.ai has: it uses the host Docker socket
when possible, and falls back to running the signaling server directly
inside the Vast container otherwise.

## 3. Run the Unreal binary

Once you've built `UnderworldUE.uproject` for Linux (see
`deploy/unreal-client-notes.md`), `rsync` it to the Vast instance:

```bash
${VAST_RSYNC} ./out/Linux/ root@ssh4.vast.ai:/opt/UnderworldUE/
${VAST_SSH} << 'EOF'
cd /opt/UnderworldUE
nohup xvfb-run -a ./UnderworldServer.sh \
  -PixelStreamingURL=ws://localhost:8888 \
  -RenderOffscreen -ResX=1920 -ResY=1080 \
  -ForceRes -graphicsadapter=0 \
  -log -unattended > /var/log/ue5.log 2>&1 &
EOF
```

## 4. Point projectsolar.cloud (or any front-end) at the Vast proxy

Vast.ai exposes container ports through `https://<host>:<port>/`. To make
that look like `https://projectsolar.cloud/pixelstream/` for your users,
add a CNAME or a reverse-proxy layer on projectsolar.cloud:

**Option A — DNS CNAME (simplest, leaks the Vast hostname in dev tools):**
Point `pixelstream.projectsolar.cloud` → the Vast proxy host. End users
hit `https://pixelstream.projectsolar.cloud/`.

**Option B — Caddy on projectsolar.cloud reverse-proxies the Vast URL:**
Whatever's running on projectsolar.cloud's 80/443 (currently returning 503
— you'll need to fix that) adds a route:

```caddyfile
projectsolar.cloud {
    handle /pixelstream/* {
        uri strip_prefix /pixelstream
        reverse_proxy https://vast-host:vast-port {
            header_up Host vast-host
        }
    }
    # ...rest unchanged
}
```

## 5. Flip the React tier toggle

In `underworld/web/.env`:

```
VITE_UNDERWORLD_PIXELSTREAM_URL=https://projectsolar.cloud/pixelstream/
# or, if you want to skip the projectsolar.cloud proxy and go straight
# to Vast.ai's proxy URL:
VITE_UNDERWORLD_PIXELSTREAM_URL=https://<vast-host>:<vast-port>/
```

Rebuild the React app (`npm run build`), reload — the **UE5 ▶** button in
the World panel header lights up. Click it, you're now inside a real UE5
render with Lumen GI + Nanite + hardware ray tracing, streamed live from
the Vast.ai RTX GPU.

## 6. Cost reality on Vast.ai

- RTX 4090 interruptible instances: $0.30–0.60/hr
- RTX 3090: $0.15–0.30/hr
- 1 GPU = 4-8 simultaneous 1080p Pixel Streams
- $20 buys ~50 hours of dev time

For a public game launch you'd want a **GPU autoscaler** (vagon.io / AWS
GameLift / NVIDIA CloudXR / vast.ai's API). One Vast instance handles a
demo or a small private group fine.

## 7. Stop the cost when you're done

```bash
${VAST_SSH} 'pkill -f UnderworldServer.sh; docker stop pixstream-signal'
# Then in the Vast.ai dashboard: STOP the instance (you stop paying when
# it's stopped). DESTROY if you don't need it again.
```

The React app falls back to the in-browser WebGL tier automatically when
the stream URL is unreachable — users don't see a broken page when you
turn the GPU off.
