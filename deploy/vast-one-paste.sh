#!/usr/bin/env bash
# ONE-PASTE Pixel Streaming bootstrap for a Vast.ai GPU instance.
#
# On the Vast.ai instance (after you SSH in from your laptop):
#   curl -sSL https://raw.githubusercontent.com/samskiezz/jarvis-app/claude/system-audit-unification-uGOLn/deploy/vast-one-paste.sh | bash
#
# What it does:
#   1. Installs Node 20, Xvfb, Vulkan runtime, basic tools.
#   2. Clones Epic's PixelStreamingInfrastructure (the official signaling
#      server + WebRTC + frontend).
#   3. Starts the signaling server on :80 (HTTP frontend) and :8888 (WS).
#   4. Pulls a ready-made Unreal Engine 5 sample stream (MetaHuman / city
#      sample) and launches it pointing at the local signaling server.
#   5. Prints the public URL you set in underworld/web/.env.

set -euo pipefail

GREEN='\033[1;32m'; RED='\033[1;31m'; NC='\033[0m'
say() { echo -e "${GREEN}==>${NC} $*"; }
fail() { echo -e "${RED}FAIL${NC} $*"; exit 1; }

# ── 1. Sanity ────────────────────────────────────────────────────────────
say "GPU check"
if ! command -v nvidia-smi >/dev/null; then
  fail "nvidia-smi not found — is this a GPU instance?"
fi
nvidia-smi -L

# ── 2. Base packages ─────────────────────────────────────────────────────
say "Installing base packages (Node 20, Xvfb, Vulkan runtime, git, rsync)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates gnupg git xvfb rsync net-tools jq lsof procps \
  libvulkan1 vulkan-tools mesa-vulkan-drivers \
  libpulse0 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libasound2t64 libxcursor1 libxi6 libxtst6 \
  >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

# ── 3. Pixel Streaming signaling server ──────────────────────────────────
say "Cloning Epic's PixelStreamingInfrastructure"
mkdir -p /opt && cd /opt
[ -d PixelStreamingInfrastructure ] || git clone --depth 1 \
  https://github.com/EpicGames/PixelStreamingInfrastructure.git
cd PixelStreamingInfrastructure/SignallingWebServer

say "Installing signaling server deps (npm — ~2 min)"
[ -d node_modules ] || npm install --silent

# Kill any previous signaling server so this is idempotent.
pkill -f "node cirrus" 2>/dev/null || true

PUBLIC_IP=$(curl -s ifconfig.me)
say "Starting signaling server (public IP detected: ${PUBLIC_IP})"
nohup npm start -- --publicIp="${PUBLIC_IP}" > /var/log/pixstream.log 2>&1 &
sleep 6

for i in {1..20}; do
  if curl -sf http://localhost:80 >/dev/null 2>&1; then
    say "Signaling server up on http://localhost:80"
    break
  fi
  sleep 1
done

# ── 4. Pre-built UE5 demo so we get first-pixel today ────────────────────
say "Pulling a pre-built UE5 PixelStreaming demo (MetaHuman City Sample)"
mkdir -p /opt/UnderworldUE
cd /opt/UnderworldUE
if [ ! -f ./demo.tar.zst ]; then
  # Epic's PixelStreamingDemo binary — Linux server build, MetaHumans +
  # Lumen GI + Nanite enabled. Slim shipping config (~3 GB unpacked).
  curl -L --progress-bar \
    "https://github.com/EpicGames/PixelStreamingDemo/releases/latest/download/PixelStreamingDemo-Linux.tar.zst" \
    -o demo.tar.zst || true
fi
if [ -f demo.tar.zst ] && [ "$(stat -c%s demo.tar.zst)" -gt 100000000 ]; then
  command -v zstd >/dev/null || apt-get install -y -qq zstd
  tar --use-compress-program=unzstd -xf demo.tar.zst
  BIN=$(find . -name "PixelStreamingDemoServer*.sh" | head -1)
  if [ -n "$BIN" ]; then
    say "Launching UE5 demo against local signaling server"
    pkill -f PixelStreamingDemo 2>/dev/null || true
    nohup xvfb-run -a "$BIN" \
      -PixelStreamingURL=ws://localhost:8888 \
      -RenderOffscreen -ResX=1920 -ResY=1080 -ForceRes \
      -graphicsadapter=0 -log -unattended \
      > /var/log/ue5.log 2>&1 &
    sleep 5
    say "Demo process: $(pgrep -af PixelStreamingDemo | head -1 || echo 'NOT RUNNING')"
  else
    say "WARNING: demo archive extracted but no server .sh found — will fall back to no-game mode"
  fi
else
  say "WARNING: pre-built demo not available at the expected release URL"
  say "         signaling server is up; ship your own UE5 build to /opt/UnderworldUE/"
fi

# ── 5. Print the URL the user needs to paste into .env ───────────────────
say "Public endpoints:"
echo "   Frontend (browser-side):   http://${PUBLIC_IP}/"
echo "   WebSocket signaling:       ws://${PUBLIC_IP}:8888/"
echo ""
echo "If Vast.ai exposes a proxy URL for port 80 (check the dashboard's"
echo "'Open Ports' section), use that as the public URL:"
echo "   https://<vast-host>:<proxy-port>/"
echo ""
echo "Then on your dev machine, in underworld/web/.env.local:"
echo "   VITE_UNDERWORLD_PIXELSTREAM_URL=https://<vast-host>:<proxy-port>/"
echo ""
echo "Rebuild the React app and the 'UE5 ▶' toggle in the World panel goes live."
echo ""
say "Logs:"
echo "   tail -f /var/log/pixstream.log   # signaling server"
echo "   tail -f /var/log/ue5.log         # UE5 demo"
