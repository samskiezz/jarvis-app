#!/usr/bin/env bash
# run-jarvis-stream.sh — run the packaged JARVIS HUD build + Epic signalling NATIVELY on
# the GPU render node (no Docker). Defaults to GPU1 so GPU0 stays free for the Ollama LLM
# brain. The packaged game boots straight into /Game/Maps/JarvisHUD (GameDefaultMap), whose
# AJarvisHudManager assembles the holographic chamber from manifest.json on BeginPlay.
#
# Prereqs on the node (one-time): provision-render-node.sh  (Vulkan ICD + NVENC + node +
# PixelStreamingInfrastructure UE5.5). Drop the cooked build under ./game/ then run this.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GAME_SH="$(find "${GAME_DIR:-${HERE}/game}" -maxdepth 3 -name '*.sh' ! -name 'run-*.sh' 2>/dev/null | head -n1)"
PSI_DIR="${PSI_DIR:-${WORKDIR:-/workspace}/PixelStreamingInfrastructure}"
[ -d "$PSI_DIR" ] || PSI_DIR=/root/PixelStreamingInfrastructure
STREAMER_PORT="${STREAMER_PORT:-8888}"
PLAYER_PORT="${PLAYER_PORT:-80}"
GRAPHICSADAPTER="${GRAPHICSADAPTER:-1}"   # GPU1 free; GPU0 runs the Ollama brain

if [[ -z "${GAME_SH}" ]]; then
  echo "ERROR: no packaged build under ${GAME_DIR:-${HERE}/game}/ (expected <Project>.sh)." >&2
  echo "       Cook on the UE5 box (cook-jarvis.sh), then rsync Packaged/Linux/ here." >&2
  exit 1
fi
echo "game: ${GAME_SH}"

# 1) Signalling server (WebRTC broker — node, no GPU). Background; serves the player page.
if [[ -d "${PSI_DIR}/SignallingWebServer" ]]; then
  echo "Signalling up (player :${PLAYER_PORT}, streamer :${STREAMER_PORT})…"
  ( cd "${PSI_DIR}/SignallingWebServer" && \
    (npm ci --omit=dev >/tmp/psi_install.log 2>&1 || true) && \
    HTTP_PORT="${PLAYER_PORT}" STREAMER_PORT="${STREAMER_PORT}" \
    node ./dist/index.js >/tmp/jarvis_signalling.log 2>&1 & )
  sleep 3
else
  echo "WARN: no SignallingWebServer at ${PSI_DIR} — run provision-render-node.sh first." >&2
fi

# 2) UE5 headless render of the JARVIS HUD → NVENC H264 → signalling. Vulkan offscreen (no X11).
echo "Launching JARVIS HUD (Vulkan -RenderOffscreen, NVENC, GPU${GRAPHICSADAPTER}) → streamer :${STREAMER_PORT}"
exec "${GAME_SH}" \
  -RenderOffscreen -Unattended -ForceRes -ResX=1920 -ResY=1080 -vulkan \
  -graphicsadapter="${GRAPHICSADAPTER}" \
  -PixelStreamingIP=127.0.0.1 -PixelStreamingPort="${STREAMER_PORT}" \
  -PixelStreamingEncoderCodec=H264 -AllowPixelStreamingCommands \
  ${EXTRA_UE_ARGS:-}
