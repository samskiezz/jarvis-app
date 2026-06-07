#!/usr/bin/env bash
# run-native.sh — run the packaged Underworld build + signalling NATIVELY on the GPU
# render node (no Docker). Use after provision-render-node.sh has set up Vulkan/NVENC
# and a packaged build is in ./game/. Streams the live, Llama-driven world to the web.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GAME_SH="$(find "${HERE}/game" -maxdepth 2 -name '*.sh' ! -name 'run-*.sh' 2>/dev/null | head -n1)"
PSI_DIR="${PSI_DIR:-${WORKDIR:-/workspace}/PixelStreamingInfrastructure}"

# Backend wiring (the in-engine SceneStateClient polls this live world).
UNDERWORLD_API_URL="${UNDERWORLD_API_URL:-http://127.0.0.1:8091}"
UNDERWORLD_WORLD_ID="${UNDERWORLD_WORLD_ID:?set UNDERWORLD_WORLD_ID to the world to render}"
UNDERWORLD_API_KEY="${UNDERWORLD_API_KEY:-dev-key}"
STREAMER_PORT="${STREAMER_PORT:-8888}"
PLAYER_PORT="${PLAYER_PORT:-80}"

if [[ -z "${GAME_SH}" ]]; then
  echo "ERROR: no packaged build in ${HERE}/game/. Run package-underworld.sh on a UE5 box," >&2
  echo "       then rsync its output here. (game/<Project>.sh expected)" >&2
  exit 1
fi

# 1) Signalling server (WebRTC broker — node, no GPU). Background.
if [[ -d "${PSI_DIR}/SignallingWebServer" ]]; then
  echo "Starting signalling (player :${PLAYER_PORT}, streamer :${STREAMER_PORT})…"
  ( cd "${PSI_DIR}/SignallingWebServer" && \
    (npm ci --omit=dev >/tmp/psi_install.log 2>&1 || true) && \
    HTTP_PORT="${PLAYER_PORT}" STREAMER_PORT="${STREAMER_PORT}" \
    node ./dist/index.js >/tmp/signalling.log 2>&1 & )
  sleep 3
fi

# 2) UE5 headless render → NVENC H264 → signalling. Vulkan offscreen (no X11).
echo "Launching Underworld (Vulkan -RenderOffscreen, NVENC) → world ${UNDERWORLD_WORLD_ID}"
exec "${GAME_SH}" \
  -RenderOffscreen -Unattended -ForceRes -ResX=1920 -ResY=1080 \
  -vulkan \
  -PixelStreamingIP=127.0.0.1 -PixelStreamingPort="${STREAMER_PORT}" \
  -PixelStreamingEncoderCodec=H264 -AllowPixelStreamingCommands \
  -graphicsadapter=0 \
  -UnderworldApiUrl="${UNDERWORLD_API_URL}" \
  -UnderworldWorldId="${UNDERWORLD_WORLD_ID}" \
  -UnderworldApiKey="${UNDERWORLD_API_KEY}"
