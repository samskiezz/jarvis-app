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
- **ue5** — your game, headless `-RenderOffscreen`, VP9 over WebRTC.
  (NVENC H.264/H.265 is disabled on most Vast.ai instances, so VP9 software encoding
  is used as the best supported fallback.)
- **signalling** — Epic's Pixel Streaming Infrastructure (serves the web frontend
  the React iframe loads; brokers WebRTC).
- **turn** — coturn relay for NAT traversal.

## Wire the frontend

The default target is the permanent Cloudflare Tunnel URL:

```bash
# from underworld/web
echo "VITE_UNDERWORLD_PIXELSTREAM_URL=https://app.projectsolar.cloud/jarvis/UnderworldUE5/" >> .env
npm run build
```

Open a world → click **“Stream UE5”** → you’re looking at real UE5 graphics.

## Permanent public URL (Hostinger VPS direct tunnel)

`launch-all.sh` can still spin up a temporary `trycloudflare.com` URL if you set
`USE_CLOUDFLARED=1`, but the production path keeps the stream permanently at
`https://app.projectsolar.cloud/jarvis/UnderworldUE5/` by running a persistent
reverse SSH tunnel from the GPU box into the Hostinger VPS.

1. On the GPU box, run:
   ```bash
   # For systemd hosts
   HOSTINGER_SSH=vasttunnel@76.13.176.135 bash /workspace/pixelstream/setup-hostinger-tunnel.sh

   # For container/Vast hosts without systemd
   bash /workspace/pixelstream/run-hostinger-tunnel.sh
   ```

2. On the Hostinger VPS, add the generated tunnel public key to
   `/home/vasttunnel/.ssh/authorized_keys` (the setup script prints it) and add
   the nginx location block from `hostinger-nginx-pixelstream.conf` to the
   `app.projectsolar.cloud` server config, then reload nginx:
   ```bash
   nginx -t && systemctl reload nginx
   ```

The path is now:
- `https://app.projectsolar.cloud/jarvis/UnderworldUE5/*` → Hostinger nginx →
  reverse SSH tunnel → Vast Caddy `:8081` → Epic signalling server.

so the existing web app keeps working and Cloudflare is no longer required.

## WebRTC media relay (TURN)

Signalling goes through the reverse tunnel, but WebRTC video/audio media is
peer-to-peer and needs a relay because the Vast GPU box is behind NAT.

A coturn server now runs on the Hostinger VPS (`app.projectsolar.cloud:3478`).
`launch-all.sh` injects the TURN credentials into the Epic signalling server's
`config.json` automatically, so the browser and the GPU box can fall back to the
relay when direct peer-to-peer fails.

To set coturn up manually on Hostinger:

```bash
sudo apt-get install -y coturn
sudo tee /etc/turnserver.conf <<'EOF'
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=76.13.176.135
external-ip=76.13.176.135
min-port=49152
max-port=65535
fingerprint
lt-cred-mech
user=underworld:<your-turn-password>
realm=app.projectsolar.cloud
no-cli
no-loopback-peers
no-multicast-peers
log-file=/var/log/turnserver.log
simple-log
EOF
sudo touch /var/log/turnserver.log && sudo chown turnserver:turnserver /var/log/turnserver.log
sudo systemctl restart coturn
```

Then set `TURN_USER` / `TURN_PASS` before running `launch-all.sh`.

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
| `launch-all.sh` | native one-shot start (signalling + UE + tunnel) |
| `signalling-compat-patch.sh` | compatibility patch for Epic signalling 2.x |
| `setup-hostinger-tunnel.sh` | systemd reverse-SSH tunnel to Hostinger (for real VMs) |
| `run-hostinger-tunnel.sh` | persistent reverse-SSH tunnel for container/Vast hosts |
| `hostinger-nginx-pixelstream.conf` | nginx location block for `app.projectsolar.cloud/jarvis/UnderworldUE5/` |
| `restart-signalling.sh` | restart the Epic signalling server safely |
| `setup-cloudflared-tunnel.sh` | (legacy) one-time Cloudflare Tunnel setup |
| `cloudflared-config.yml.template` | (legacy) tunnel ingress template |
| `Caddyfile` | path-strip proxy for `/jarvis/UnderworldUE5` |
| `docker-compose.yml` | ue5 + signalling + turn |
| `Dockerfile.ue5` / `run-ue5.sh` | wrap + launch the packaged game headless |
| `capture_stream.py` | screenshot the live stream from any machine |
| `.env.example` | host config |

Sources: [Epic Pixel Streaming Infrastructure](https://github.com/EpicGamesExt/PixelStreamingInfrastructure) ·
[Pixel Streaming in Linux containers](https://unrealcontainers.com/docs/use-cases/pixel-streaming)
