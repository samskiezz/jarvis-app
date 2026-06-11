#!/usr/bin/env bash
# deploy-jarvis-to-vast.sh — ONE-COMMAND finish: ship the cooked JARVIS HUD to the Vast 4090,
# free a GPU, and Pixel-Stream it. Run from the Hostinger box.
#
# Vast SSH ports ROTATE — when the box reconnects, get the current host/port from the vast.ai
# dashboard (Instances → the running instance → SSH), then:
#     VAST_SSH_HOST=<host> VAST_SSH_PORT=<port> bash deploy-jarvis-to-vast.sh
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
GPU="${GRAPHICSADAPTER:-1}"                         # GPU1 for UE5; GPU0 stays for the Ollama brain

[ -d "$PKG" ] || { echo "ERROR: no cooked package at $PKG — run Scripts/cook-jarvis.sh first"; exit 1; }
echo "== preflight: can we reach Vast? =="
$SSH "root@$VAST_SSH_HOST" 'echo ok' >/dev/null || { echo "Vast unreachable at $VAST_SSH_HOST:$VAST_SSH_PORT — check the dashboard"; exit 1; }

echo "== [1/5] ship the cooked package + the pixelstream scripts =="
$SSH "root@$VAST_SSH_HOST" "mkdir -p $REMOTE_GAME $REMOTE_PS"
rsync -a --partial --info=progress2 -e "$SSH" "$PKG/" "root@$VAST_SSH_HOST:$REMOTE_GAME/"
rsync -a -e "$SSH" "$HERE"/*.sh "root@$VAST_SSH_HOST:$REMOTE_PS/"

echo "== [2/5] free GPU$GPU VRAM — unload the LARGEST idle Ollama model (reversible; reloads on demand) =="
$SSH "root@$VAST_SSH_HOST" '
  BIG=$(/usr/local/bin/ollama ps 2>/dev/null | awk "NR>1{s=\$3; if(\$4==\"GB\")s=s*1; print \$1, s}" | sort -k2 -g | tail -1 | cut -d" " -f1)
  if [ -n "$BIG" ]; then /usr/local/bin/ollama stop "$BIG" && echo "  unloaded $BIG"; sleep 3; else echo "  (no loaded model found)"; fi
  nvidia-smi --query-gpu=index,memory.used,memory.total --format=csv,noheader'

echo "== [3/5] provision render node (Vulkan ICD + NVENC + signalling) — idempotent =="
$SSH "root@$VAST_SSH_HOST" "[ -x $REMOTE_PS/provision-render-node.sh ] && WORKDIR=/workspace bash $REMOTE_PS/provision-render-node.sh >/tmp/provision.log 2>&1; tail -2 /tmp/provision.log 2>/dev/null || true"

echo "== [4/5] launch UE5 JARVIS HUD stream on GPU$GPU + signalling =="
$SSH "root@$VAST_SSH_HOST" "pkill -f 'Underworld.sh|run-jarvis-stream' 2>/dev/null; cd $REMOTE_PS && \
  GAME_DIR=$REMOTE_GAME GRAPHICSADAPTER=$GPU PSI_DIR=/workspace/PixelStreamingInfrastructure PLAYER_PORT=80 STREAMER_PORT=8888 \
  nohup bash $REMOTE_PS/run-jarvis-stream.sh >/tmp/jarvis_stream.log 2>&1 & sleep 8; tail -8 /tmp/jarvis_stream.log 2>/dev/null"

echo "== [5/5] done =="
echo "Player URL: http://$VAST_SSH_HOST/  (or the instance's public IP on :80)."
echo "Set the JARVIS web app's UE5 stream URL to that, and open the HUD."
