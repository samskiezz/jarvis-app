# Underworld Minions — Production Deployment (Hostinger control + Vast render)

Two boxes, exactly as planned:

| Box | Hardware (verified) | Role |
|-----|--------------------|------|
| **Control** (this box, `76.13.176.135`) | 8c / 31GB / **268GB free**, no GPU | Builds + packages UE5, serves web + control API (`:8091`), Nginx HTTPS reverse proxy, coturn TURN, release storage |
| **Render** (Vast, `211.72.13.201`) | **2× RTX 4090**, 27GB free | Runs the packaged UE5 build under Pixel Streaming — GPU0→stream1, GPU1→stream2 |

The engine lives on the **control box** (it needs ~170GB; the GPU box can't hold it). Only the
~10GB packaged game ships to Vast. The 4090s' NVENC/AV1 do the video encode.

## One-time: install + package the engine (control box)
```bash
cd underworld/deploy/production
export EPIC_GH_USER=samskiezz EPIC_GH_TOKEN=<token> UE_BRANCH=5.5
./install-ue5.sh          # clone -> Setup.sh -> make -> package -> packaged-linux/
```
Prereqs (all satisfied): Epic↔GitHub linked + **EpicGames org invite accepted** (membership
`active`), token has `repo` scope, ≥180GB free. `install-ue5.sh` aborts loudly if any is missing
— it never fabricates the engine.

## Deploy a build to the render box (control box)
```bash
cd underworld/deploy/production/hostinger
export VAST_SSH='-p 41154 root@211.72.13.201'
export UNDERWORLD_WORLD_ID=<world>  UNDERWORLD_API_URL=http://76.13.176.135:8091
./deploy.sh               # rsync game + signalling + worker scripts -> Vast, launch dual-GPU
```

## Point the public URL at the live streams (control box, on a timer)
```bash
export DOMAIN=play.underworld.example VAST_HOST=211.72.13.201 VAST_SSH='-p 41154 root@211.72.13.201'
./orchestrate.sh          # reads Vast's CURRENT mapped ports, rewrites nginx, reloads, health-checks
```
Vast remaps public ports on every restart, so run `orchestrate.sh` from cron/systemd-timer
(every 1–2 min) to self-heal the proxy. Players: `https://$DOMAIN/` (GPU0), `https://$DOMAIN/2/` (GPU1).

## TURN fallback (control box)
```bash
apt-get install -y coturn
cp hostinger/turnserver.conf /etc/turnserver.conf   # set realm/external-ip/secret
systemctl enable --now coturn                       # open UDP/TCP 3478 + 49160-49200
```
Then add `turn:$DOMAIN:3478` to the SignallingWebServer `iceServers` so strict-NAT players connect.

## Milestone order (the plan)
1. ✅ Engine auth unblocked (Epic org invite accepted, access HTTP 200)
2. ⏳ `install-ue5.sh` — clone → build → **package Underworld for Linux Shipping**
3. `deploy.sh` — ship to Vast, launch ONE stream on GPU0
4. `orchestrate.sh` — Hostinger HTTPS in front of it
5. coturn TURN fallback
6. dual-GPU already wired (`start-dual-gpu.sh`) — second stream on GPU1

## How the render stays the SAME living world
The packaged build embeds the C++ `SceneStateClient` → it polls the control box's underworld
backend (`UNDERWORLD_API_URL` / `world_id`) every tick, so the UE5 render shows the exact φ/fractal
layout, live minion positions, and the awakened-sentience halos — same contracts as the web scene.
