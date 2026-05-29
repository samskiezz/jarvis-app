#!/usr/bin/env bash
# ONE-PASTE Pixel Streaming bootstrap for a Vast.ai GPU instance.
#
# Runs on the Vast instance directly (the GitHub Actions runner SSHes in
# and exec's it — see .github/workflows/deploy-vast.yml). Idempotent:
# safe to re-run.
#
# What it ships:
#   1. Node 20 + dependencies for Epic's PixelStreamingInfrastructure.
#   2. Clones EpicGamesExt/PixelStreamingInfrastructure (the live repo —
#      the old EpicGames/ URL is 404).
#   3. Starts the signaling server on :80 + :8888.
#   4. Pulls TensorWorks's pre-built UE4.27 first-person Pixel-Streaming
#      demo container (tensorworks/ps-demo-minimal:linux, ~1 GB, CC-style
#      published in 2021). This gives FIRST PIXEL with no engine build.
#   5. Connects the demo to the local signaling server with --gpus all.
#
# Pixels appear at http://<PUBLIC_IP>/ within ~3 min of the script
# finishing (1 min container pull + first-frame negotiation).

set -euo pipefail

GREEN='\033[1;32m'; YEL='\033[1;33m'; RED='\033[1;31m'; NC='\033[0m'
say()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YEL}WARN${NC} $*"; }
fail() { echo -e "${RED}FAIL${NC} $*"; exit 1; }

# ── 1. Sanity ────────────────────────────────────────────────────────────
say "GPU check"
command -v nvidia-smi >/dev/null || fail "nvidia-smi not found — is this a GPU instance?"
nvidia-smi -L

# ── 2. Base packages ─────────────────────────────────────────────────────
say "Installing base packages (Node 20, Docker, Xvfb, Vulkan)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates gnupg git rsync net-tools jq lsof procps zstd \
  xvfb libvulkan1 vulkan-tools mesa-vulkan-drivers \
  libpulse0 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libasound2t64 libxcursor1 libxi6 libxtst6 \
  docker.io \
  >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
node -v
docker --version || warn "docker not available — UE4 demo container step will be skipped"

# NVIDIA Container Toolkit so docker can use --gpus all.
if ! docker info 2>/dev/null | grep -q "Runtimes.*nvidia"; then
  say "Installing NVIDIA Container Toolkit"
  distribution=$(. /etc/os-release; echo "${ID}${VERSION_ID}")
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -qq
  apt-get install -y -qq nvidia-container-toolkit >/dev/null
  systemctl restart docker 2>/dev/null || service docker restart 2>/dev/null || true
fi

# ── 3. PixelStreamingInfrastructure (NEW upstream — old EpicGames/ is dead) ──
say "Cloning EpicGamesExt/PixelStreamingInfrastructure"
mkdir -p /opt && cd /opt
[ -d PixelStreamingInfrastructure ] || git clone --depth 1 \
  https://github.com/EpicGamesExt/PixelStreamingInfrastructure.git
cd PixelStreamingInfrastructure

if   [ -d SignallingWebServer ]; then SIG_DIR=SignallingWebServer
elif [ -d Signalling ];          then SIG_DIR=Signalling
else fail "Could not locate signaling server directory in the cloned repo"
fi
cd "$SIG_DIR"
say "Signaling server: /opt/PixelStreamingInfrastructure/$SIG_DIR"

# Node deps.
[ -d node_modules ] || {
  if [ -f package-lock.json ]; then npm ci --silent; else npm install --silent; fi
}

# ── 4. Start signaling server idempotently ───────────────────────────────
PUBLIC_IP=$(curl -s ifconfig.me || echo "0.0.0.0")
say "Killing any previous signaling server"
pkill -f "node.*cirrus" 2>/dev/null || true
pkill -f "node.*platform_scripts" 2>/dev/null || true

say "Starting signaling server (public IP: ${PUBLIC_IP})"
START_SCRIPT=""
for f in platform_scripts/bash/start.sh \
         platform_scripts/bash/Start_SignallingServer.sh \
         platform_scripts/bash/start_with_turn.sh \
         start.sh; do
  [ -x "$f" ] && { START_SCRIPT="$f"; break; }
done

if [ -n "$START_SCRIPT" ]; then
  say "Using $START_SCRIPT"
  nohup "$START_SCRIPT" --publicIp="${PUBLIC_IP}" > /var/log/pixstream.log 2>&1 &
else
  say "Using npm start fallback"
  nohup npm start -- --publicIp="${PUBLIC_IP}" > /var/log/pixstream.log 2>&1 &
fi

say "Waiting for signaling server to come up..."
LIVE_PORT=""
for i in {1..40}; do
  for port in 80 8888 8889 8443; do
    if curl -sf "http://localhost:$port" >/dev/null 2>&1; then
      LIVE_PORT="$port"; break 2
    fi
  done
  sleep 1
done
[ -n "$LIVE_PORT" ] && say "✓ Signaling server up on port $LIVE_PORT" \
                    || warn "Signaling server did not respond — check /var/log/pixstream.log"

# ── 5. Pre-built UE4 demo container — TensorWorks ps-demo-minimal ────────
DEMO_IMAGE="tensorworks/ps-demo-minimal:linux"
say "Pulling pre-built UE4 Pixel-Streaming demo: $DEMO_IMAGE (~1 GB)"
if docker pull "$DEMO_IMAGE" 2>&1 | tail -3; then
  say "Image pulled. Stopping any previous demo container."
  docker rm -f underworld-demo 2>/dev/null || true
  say "Launching demo against local signaling server (:8888)"
  # ps-demo-minimal's entrypoint already targets 127.0.0.1:8888 with
  # -RenderOffscreen -Windowed -ResX=1920 -ResY=1080. Host network so it
  # can reach the signaling server without inter-container DNS.
  docker run -d \
    --name underworld-demo \
    --restart unless-stopped \
    --gpus all \
    --network host \
    "$DEMO_IMAGE" \
    >/dev/null
  sleep 8
  if docker ps --format '{{.Names}}' | grep -q '^underworld-demo$'; then
    say "✓ Demo container running"
    docker logs --tail 20 underworld-demo 2>&1 | sed 's/^/    /'
  else
    warn "Demo container exited — last logs:"
    docker logs --tail 30 underworld-demo 2>&1 | sed 's/^/    /' || true
  fi
else
  warn "Could not pull $DEMO_IMAGE — the signaling server is still up; drop your own UE5 build into /opt/UnderworldUE/"
fi

# ── 6. Slot for the real Underworld UE5 build ────────────────────────────
mkdir -p /opt/UnderworldUE
cat > /opt/UnderworldUE/README.txt <<'EOF'
This directory is the slot for the *real* Underworld UE5 game build.

When you have a packaged Linux server (output of UE5's
BuildCookRun -platform=Linux -clientconfig=Shipping -server), rsync the
folder here and replace the demo container:

  docker stop underworld-demo 2>/dev/null
  cd /opt/UnderworldUE
  xvfb-run -a ./UnderworldServer.sh \
    -PixelStreamingURL=ws://localhost:8888 \
    -RenderOffscreen -ResX=1920 -ResY=1080 -ForceRes \
    -graphicsadapter=0 -log -unattended

The pre-built ps-demo-minimal container that came up by default is a
UE4.27 first-person sample — proves the streaming chain works
end-to-end. Replace at will.
EOF

# ── 7. Print endpoints ───────────────────────────────────────────────────
cat <<DONE

==> ✓ Deploy complete. Open this URL in your browser to see the stream:

  http://${PUBLIC_IP}:${LIVE_PORT:-80}/

If Vast.ai exposes that port through a proxy URL (instance dashboard →
"Open Ports"), use that instead — e.g.:
  https://<vast-host>:<proxy-port>/

Set in underworld/web/.env.local on your dev machine:
  VITE_UNDERWORLD_PIXELSTREAM_URL=https://<vast-host>:<proxy-port>/

Then rebuild the React app and click the "UE5 ▶" toggle in the World
panel. The iframe loads the same stream embedded.

Tail logs:
  tail -f /var/log/pixstream.log         # signaling server
  docker logs -f underworld-demo         # UE4 demo container

DONE
