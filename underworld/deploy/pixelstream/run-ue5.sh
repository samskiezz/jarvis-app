#!/usr/bin/env bash
# Launch the packaged Underworld UE5 game headless with Pixel Streaming.
# RenderOffscreen renders on the GPU with NO display (perfect for a server).
# The PixelStreaming plugin captures frames, hardware-encodes H.264/H.265 via
# NVENC, and ships them over WebRTC through the signalling server.
set -euo pipefail

SIGNALLING_IP="${SIGNALLING_IP:-127.0.0.1}"
SIGNALLING_PORT="${SIGNALLING_PORT:-8888}"
EXTRA_UE_ARGS="${EXTRA_UE_ARGS:-}"

# Backend wiring — the in-engine USceneStateClient reads these off the cmdline and
# polls {UNDERWORLD_API_URL}/worlds/{UNDERWORLD_WORLD_ID}/scene-state (Bearer).
UNDERWORLD_API_URL="${UNDERWORLD_API_URL:-http://127.0.0.1:8091}"
UNDERWORLD_WORLD_ID="${UNDERWORLD_WORLD_ID:-}"
UNDERWORLD_API_KEY="${UNDERWORLD_API_KEY:-dev-key}"

# Find the packaged entry script (<Project>.sh) Epic generates.
GAME_SH="$(find /home/ue4/game -maxdepth 2 -name '*.sh' ! -name 'run-ue5.sh' | head -n1)"
if [[ -z "${GAME_SH}" ]]; then
  echo "ERROR: no packaged UE5 build found under /home/ue4/game (expected <Project>.sh)." >&2
  echo "       Place your 'Package Project -> Linux' output in ./game/ and rebuild." >&2
  exit 1
fi

echo "Launching ${GAME_SH} -> signalling ${SIGNALLING_IP}:${SIGNALLING_PORT}"
exec "${GAME_SH}" \
  -RenderOffscreen \
  -Unattended \
  -ForceRes -ResX=1920 -ResY=1080 \
  -PixelStreamingIP="${SIGNALLING_IP}" \
  -PixelStreamingPort="${SIGNALLING_PORT}" \
  -PixelStreamingEncoderCodec=H264 \
  -AllowPixelStreamingCommands \
  -graphicsadapter=0 \
  -UnderworldApiUrl="${UNDERWORLD_API_URL}" \
  -UnderworldWorldId="${UNDERWORLD_WORLD_ID}" \
  -UnderworldApiKey="${UNDERWORLD_API_KEY}" \
  ${EXTRA_UE_ARGS}
