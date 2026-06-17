#!/usr/bin/env bash
# deploy-jarvis-to-vast.sh — ONE-COMMAND finish: ship the cooked JARVIS HUD to the Vast GPU
# box, free a GPU, and Pixel-Stream it. Run from the Hostinger box.
#
# Vast SSH ports ROTATE — when the box reconnects, get the current host/port from the
# vast.ai dashboard (Instances → the running instance → SSH), then:
#     VAST_SSH_HOST=<host> VAST_SSH_PORT=<port> [USE_CLOUDFLARED=1] bash deploy-jarvis-to-vast.sh
#
# Assumes the package is cooked locally (Scripts/cook-jarvis.sh -> Packaged/Linux/).
set -euo pipefail
: "${VAST_SSH_HOST:?set VAST_SSH_HOST (from vast.ai dashboard — ports rotate)}"
: "${VAST_SSH_PORT:?set VAST_SSH_PORT}"
KEY="${VAST_KEY:-$HOME/.ssh/id_ed25519}"          # id_ed25519 works; id_ed25519_jarvis was rejected
SSH="ssh -i $KEY -p $VAST_SSH_PORT -o StrictHostKeyChecking=no -o ConnectTimeout=25"
HERE="$(cd "$(dirname "$0")" && pwd)"
PKG="${PKG:-/opt/jarvis-app-1/underworld/deploy/ue5-project/Packaged/Linux}"
REMOTE_GAME=/workspace/pixelstream/game/Linux
REMOTE_PS=/workspace/pixelstream
GPU="${GRAPHICSADAPTER:-0}"                         # default GPU0; Vast boxes may only expose one GPU
USE_CLOUDFLARED="${USE_CLOUDFLARED:-1}"             # expose a public trycloudflare.com URL by default

[ -d "$PKG" ] || { echo "ERROR: no cooked package at $PKG — run Scripts/cook-jarvis.sh first"; exit 1; }
echo "== preflight: can we reach Vast? =="
$SSH "root@$VAST_SSH_HOST" 'echo ok' >/dev/null || { echo "Vast unreachable at $VAST_SSH_HOST:$VAST_SSH_PORT — check the dashboard"; exit 1; }

echo "== [1/5] ship the cooked package + the pixelstream scripts =="
$SSH "root@$VAST_SSH_HOST" "mkdir -p $REMOTE_GAME $REMOTE_PS"
rsync -a --partial --info=progress2 -e "$SSH" "$PKG/" "root@$VAST_SSH_HOST:$REMOTE_GAME/"
rsync -a -e "$SSH" "$HERE"/*.sh "root@$VAST_SSH_HOST:$REMOTE_PS/"

echo "== [2/5] provision render user, permissions, and signalling config =="
$SSH "root@$VAST_SSH_HOST" '
  set -euo pipefail
  if ! id uegame >/dev/null 2>&1; then useradd -m -s /bin/bash uegame; echo "created uegame"; fi
  chown -R uegame:uegame /workspace/pixelstream/game /workspace/PixelStreamingInfrastructure
  chmod 1777 /tmp/uba_shm_locks 2>/dev/null || true

  CFG=/workspace/PixelStreamingInfrastructure/SignallingWebServer/config.json
  if [ -f "$CFG" ]; then
    python3 - "$CFG" <<PY
import json, sys
cfg = json.load(open(sys.argv[1]))
cfg["http_root"] = "/workspace/PixelStreamingInfrastructure/SignallingWebServer/www"
cfg["homepage"] = "player.html"
cfg["reverse_proxy"] = True
cfg["reverseProxy"] = True
cfg["reverse_proxy_num_proxies"] = 1
cfg["reverseProxyNumProxies"] = 1
json.dump(cfg, open(sys.argv[1], "w"), indent="\t")
PY
  fi

  # Epic SignallingWebServer 2.3.0 expects camelCase option names after commander parses them,
  # but the distributed dist/index.js checks snake_case. Patch so reverse-proxy trust works.
  DIST=/workspace/PixelStreamingInfrastructure/SignallingWebServer/dist/index.js
  if [ -f "$DIST" ]; then
    sed -i "s/options\\.reverse_proxy\\b/options.reverseProxy/g; s/options\\.reverse_proxy_num_proxies/options.reverseProxyNumProxies/g" "$DIST"
  fi

  # Older UE plugins don't understand endpointIdConfirm/layerPreference and can SIGSEGV on
  # duplicate subscribe offers. Patch the signalling library CJS dist before launch.
  bash /workspace/pixelstream/signalling-compat-patch.sh /workspace/PixelStreamingInfrastructure
'

echo "== [3/5] start Epic signalling server (root, player :80) =="
$SSH "root@$VAST_SSH_HOST" "pkill -f '[d]ist/index.js' 2>/dev/null || true; sleep 2; cd /workspace/PixelStreamingInfrastructure/SignallingWebServer && nohup node ./dist/index.js </dev/null >/tmp/jarvis_signalling.log 2>&1 & sleep 4; tail -6 /tmp/jarvis_signalling.log"

echo "== [4/5] launch UE5 JARVIS HUD stream as uegame on GPU$GPU =="
$SSH "root@$VAST_SSH_HOST" "pkill -f '[U]nderworld/Binaries/Linux/Underworld' 2>/dev/null || true; sleep 2; rm -f /workspace/pixelstream/jarvis_stream.log; runuser -u uegame -- bash -c 'cd $REMOTE_GAME && nohup ./Underworld.sh -RenderOffscreen -Unattended -ForceRes -ResX=1280 -ResY=720 -vulkan -graphicsadapter=$GPU -PixelStreamingURL=ws://127.0.0.1:8888 -PixelStreamingEncoderCodec=VP9 -AllowPixelStreamingCommands -t.MaxFPS=60 </dev/null >/workspace/pixelstream/jarvis_stream.log 2>&1 & echo \$! > /tmp/jarvis_stream.pid'; sleep 18; ps -eo pid,user,cmd | grep -iE 'Underworld|dist/index.js' | grep -v grep || true; grep -iE 'chamber|Connected to SS|Falling back' /workspace/pixelstream/jarvis_stream.log | tail -8"

echo "== [5/5] expose public URL =="
if [ "$USE_CLOUDFLARED" = "1" ]; then
  $SSH "root@$VAST_SSH_HOST" '
    if ! command -v cloudflared >/dev/null 2>&1; then
      echo "installing cloudflared..."
      curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
      chmod +x /tmp/cloudflared
      mv /tmp/cloudflared /usr/local/bin/cloudflared
    fi
    pkill -f "[c]loudflared tunnel" 2>/dev/null || true
    sleep 1
    nohup cloudflared tunnel --url http://127.0.0.1:80 </dev/null >/tmp/cloudflared.log 2>&1 &
    sleep 12
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log | head -1)
    echo "Public URL: $URL"
  '
else
  echo "Player URL: http://$VAST_SSH_HOST/  (requires Vast port forwarding to be open)"
fi

echo "== done =="
