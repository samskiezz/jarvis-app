#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
USE_CLOUDFLARED="${USE_CLOUDFLARED:-1}"
pkill -f "Underworld.sh|Underworld/Binaries/Linux/Underworld|dist/index.js|cloudflared tunnel|caddy run" 2>/dev/null || true
sleep 2

# Ensure a non-root game user exists (Vast containers may not have one).
if ! id uegame >/dev/null 2>&1; then
  useradd -m -s /bin/bash uegame
  usermod -aG video uegame 2>/dev/null || true
fi
chown -R uegame:uegame /workspace/pixelstream/game/Linux 2>/dev/null || true

PSI_DIR="${PSI_DIR:-/workspace/PixelStreamingInfrastructure}"
GPU="${GRAPHICSADAPTER:-0}"

# Ensure the game user can traverse into /workspace paths.
chmod 755 /workspace /workspace/pixelstream 2>/dev/null || true

CFG="${PSI_DIR}/SignallingWebServer/config.json"

# Signalling server (needs root to bind :80)
cd "${PSI_DIR}/SignallingWebServer"

# Build signalling once if it hasn't been built yet.
if [ ! -f "./dist/index.js" ] || [ ! -d "../Signalling/dist/cjs" ]; then
  echo "Building Pixel Streaming signalling infrastructure ..."
  ( cd "${PSI_DIR}" && npm ci && npm run build:all:cjs ) >/tmp/jarvis_psi_build.log 2>&1
fi

# Re-apply compatibility patch in case npm ci was run and overwrote dist.
bash "${HERE}/signalling-compat-patch.sh" "${PSI_DIR}"

# Make sure the signalling http_root points at the local www folder (some PSI
# branches ship a Windows path that breaks player.html serving).
python3 - "$CFG" "${PSI_DIR}/SignallingWebServer/www" <<'PY'
import json, sys
path, root = sys.argv[1:3]
try:
    cfg = json.load(open(path))
    if not cfg.get("http_root", "").startswith("/"):
        cfg["http_root"] = root
        json.dump(cfg, open(path, "w"), indent="\t")
        print(f"[launch-all] set http_root = {root}")
except Exception as e:
    print(f"[launch-all] http_root patch skipped: {e}")
PY

# Inject TURN relay config so WebRTC media can traverse Vast's NAT.
# Hostinger runs coturn on app.projectsolar.cloud:3478 (UDP/TCP) and :5349 (TLS).
TURN_HOST="${TURN_HOST:-app.projectsolar.cloud}"
TURN_USER="${TURN_USER:-underworld}"
TURN_PASS="${TURN_PASS:-79ff3c74f4d40327e1b591ab9e6d508d}"
CFG="${PSI_DIR}/SignallingWebServer/config.json"
if [ -f "$CFG" ]; then
  python3 - "$CFG" "$TURN_HOST" "$TURN_USER" "$TURN_PASS" <<'PY'
import json, sys
path, host, user, pwd = sys.argv[1:5]
cfg = json.load(open(path))
peer = {
    "iceServers": [
        {"urls": ["stun:stun.l.google.com:19302"]},
        {"urls": [f"turn:{host}:3478", f"turns:{host}:5349"], "username": user, "credential": pwd}
    ]
}
cfg["peer_options"] = json.dumps(peer)
json.dump(cfg, open(path, "w"), indent="\t")
PY
fi

HTTP_PORT=80 STREAMER_PORT=8888 nohup node ./dist/index.js >/tmp/jarvis_signalling.log 2>&1 </dev/null &
sleep 4

# Path proxy (strips /jarvis/UnderworldUE5 before forwarding to signalling)
CLOUDFLARED_URL="http://localhost:8081"
if command -v caddy >/dev/null 2>&1 && [ -f "${HERE}/Caddyfile" ]; then
  echo "Starting Caddy path proxy on :8081 ..."
  caddy start --config "${HERE}/Caddyfile" >/tmp/jarvis_caddy.log 2>&1
  sleep 2
else
  echo "Caddy not available; cloudflared will tunnel directly to signalling on :80"
  CLOUDFLARED_URL="http://localhost:80"
fi

# UE5 JARVIS HUD (must NOT run as root)
# On Vast.ai Ubuntu 24.04 the host-mounted NVIDIA 590 userspace is incompatible
# with glibc 2.39, so we run the game through the 590 runfile workaround wrapper.
cd /workspace/pixelstream/game/Linux
GPU="${GRAPHICSADAPTER:-0}"
rm -f /workspace/pixelstream/jarvis_stream.log
# NVENC H.264 is now available via the extracted NVIDIA runfile libs,
# so we hardware-encode the Pixel Stream instead of burning CPU on VP9.
# Pin the game to CPUs 0-2 so the render thread does not starve the SSH
# tunnel / Caddy / signalling processes that keep the public path alive.
# Resolution and FPS are capped to keep the offscreen renderer within budget.
taskset -c 0-2 runuser -u uegame -- nohup /workspace/pixelstream/launch-ue5.sh \
  -RenderOffscreen -Unattended -ForceRes -ResX=960 -ResY=540 -vulkan \
  -graphicsadapter="${GPU}" \
  -PixelStreamingURL="ws://127.0.0.1:8888" \
  -PixelStreamingEncoderCodec=H264 -AllowPixelStreamingCommands \
  -t.MaxFPS=30 \
  /Game/Maps/Underworld \
  >/workspace/pixelstream/jarvis_stream.log 2>&1 </dev/null &
sleep 20

# Public tunnel
if [ "$USE_CLOUDFLARED" = "1" ]; then
  CFG="${HERE}/cloudflared-config.yml"
  if [ -f "$CFG" ]; then
    echo "Starting permanent Cloudflare Tunnel from $CFG ..."
    nohup cloudflared tunnel --config "$CFG" >/tmp/jarvis_tunnel.log 2>&1 </dev/null &
    sleep 10
    echo "== permanent URL =="
    echo "https://app.projectsolar.cloud/jarvis/UnderworldUE5/"
  else
    echo "Starting temporary trycloudflare tunnel ..."
    nohup cloudflared tunnel --url "${CLOUDFLARED_URL}" >/tmp/jarvis_tunnel.log 2>&1 </dev/null &
    sleep 8
    echo "== tunnel URL =="
    grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/jarvis_tunnel.log | head -1 || echo "(tunnel still starting)"
  fi
else
  echo "Cloudflare tunnel disabled (USE_CLOUDFLARED=0)."
  echo "The stream should be reached via the Hostinger reverse tunnel:"
  echo "https://app.projectsolar.cloud/jarvis/UnderworldUE5/"
fi

echo "== processes =="
ps -eo pid,user,cmd | grep -iE "Underworld|dist/index.js|cloudflared|caddy" | grep -v grep || true
echo "== signalling log tail =="
tail -15 /tmp/jarvis_signalling.log 2>/dev/null || true
echo "== stream log tail =="
tail -15 /workspace/pixelstream/jarvis_stream.log 2>/dev/null || true
echo "== tunnel URL =="
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/jarvis_tunnel.log | head -1 || echo "(tunnel still starting)"
