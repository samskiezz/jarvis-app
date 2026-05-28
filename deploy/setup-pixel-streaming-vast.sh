#!/usr/bin/env bash
# Pixel Streaming on a Vast.ai GPU instance.
#
# Vast.ai instances ARE Docker containers — you usually can't run nested
# Docker reliably. So this script runs Epic's signaling server *natively*
# (Node.js) inside the Vast container, not as a sub-container.
#
# Usage on the Vast instance:
#   curl -L https://raw.githubusercontent.com/samskiezz/jarvis-app/main/deploy/setup-pixel-streaming-vast.sh | bash

set -euo pipefail

echo "==> Vast.ai Pixel Streaming setup"

# 1. Sanity check — GPU?
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "ERROR: nvidia-smi not found. Are you sure this is a GPU instance?"
  exit 2
fi
nvidia-smi -L

# 2. Base packages.
apt update -qq
DEBIAN_FRONTEND=noninteractive apt install -y \
  curl ca-certificates gnupg git xvfb \
  libvulkan1 vulkan-tools \
  libssl-dev nodejs npm \
  net-tools >/dev/null

# 3. Clone Epic's official Pixel-Streaming-Infrastructure (signaling
#    server + WebRTC + frontend). Node.js, no Docker needed.
cd /opt
[ -d PixelStreamingInfrastructure ] || git clone --depth 1 \
  https://github.com/EpicGames/PixelStreamingInfrastructure.git
cd PixelStreamingInfrastructure/SignallingWebServer

# 4. Install deps + start the signaling server.
[ -d node_modules ] || npm install
# Background it. Stdout/err to /var/log/pixstream.log.
pkill -f "node cirrus" 2>/dev/null || true
nohup npm start -- --publicIp=$(curl -s ifconfig.me) > /var/log/pixstream.log 2>&1 &

# 5. Wait for it to come up.
for i in {1..30}; do
  if curl -sf http://localhost:80 >/dev/null 2>&1; then
    echo "==> ✓ Signaling server up on port 80"
    break
  fi
  sleep 1
done

# 6. Create a placeholder for the Unreal Server binary.
mkdir -p /opt/UnderworldUE
cat > /opt/UnderworldUE/README.txt <<EOF
Drop your packaged UE5 Linux server here (the output of BuildCookRun -platform=Linux
-clientconfig=Shipping). Then start it pointing at the local signaling server:

  cd /opt/UnderworldUE
  xvfb-run -a ./UnderworldServer.sh \\
    -PixelStreamingURL=ws://localhost:8888 \\
    -RenderOffscreen -ResX=1920 -ResY=1080 -ForceRes \\
    -graphicsadapter=0 -log -unattended
EOF

# 7. Print the URLs the user needs.
cat <<DONE

==> Pixel Streaming endpoints (paste into your React .env):

  Signaling frontend:   http://$(curl -s ifconfig.me):80/
  WebSocket signaling:  ws://$(curl -s ifconfig.me):8888/

If Vast.ai mapped 80 → a proxy port (check the instance dashboard for the
"Open Ports" panel), the public URL will look like:

  https://<vast-host>:<proxy-port>/

Set in underworld/web/.env on your dev machine:
  VITE_UNDERWORLD_PIXELSTREAM_URL=https://<vast-host>:<proxy-port>/

Rebuild the React app and the 'UE5 ▶' toggle in the World panel becomes
active.

The signaling server is now waiting for the Unreal client to connect. See
/opt/UnderworldUE/README.txt for how to launch it.
DONE
