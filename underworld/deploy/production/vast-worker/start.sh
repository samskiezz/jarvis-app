#!/usr/bin/env bash
# start.sh — ONE Underworld Minions Pixel-Streaming session pinned to ONE GPU.
# Args (env): GPU_INDEX, HTTP_PORT, STREAMER_PORT, and the backend wiring so the in-
# engine WorldManager polls the live world. Used by start-dual-gpu.sh (one per 4090).
set -euo pipefail

GPU_INDEX="${GPU_INDEX:-0}"
HTTP_PORT="${HTTP_PORT:-8080}"
STREAMER_PORT="${STREAMER_PORT:-8888}"
# backend (Hostinger/app box) — the engine's SceneStateClient polls this live world
UNDERWORLD_API_URL="${UNDERWORLD_API_URL:-http://127.0.0.1:8091}"
UNDERWORLD_WORLD_ID="${UNDERWORLD_WORLD_ID:?set UNDERWORLD_WORLD_ID}"
UNDERWORLD_API_KEY="${UNDERWORLD_API_KEY:-dev-key}"
RESX="${RESX:-1920}"; RESY="${RESY:-1080}"
PSI="${PSI_DIR:-/home/ue/PixelStreamingInfrastructure}"

GAME_SH="$(find /home/ue/game -maxdepth 2 -name '*.sh' ! -name 'start*.sh' 2>/dev/null | head -n1)"
[ -n "$GAME_SH" ] || { echo "ERROR: no packaged UE5 build in /home/ue/game (Package Project -> Linux)" >&2; exit 1; }

echo "[gpu $GPU_INDEX] signalling http:$HTTP_PORT streamer:$STREAMER_PORT"
( cd "$PSI/SignallingWebServer/platform_scripts/bash" && \
  ./start.sh --httpPort "$HTTP_PORT" --streamerPort "$STREAMER_PORT" \
  >/home/ue/signalling_${GPU_INDEX}.log 2>&1 & )
sleep 5

echo "[gpu $GPU_INDEX] launching UnderworldMinions -> world ${UNDERWORLD_WORLD_ID}"
exec env CUDA_VISIBLE_DEVICES="$GPU_INDEX" "$GAME_SH" \
  -RenderOffscreen -Unattended -ForceRes -ResX="$RESX" -ResY="$RESY" -AudioMixer \
  -PixelStreamingIP=127.0.0.1 -PixelStreamingPort="$STREAMER_PORT" \
  -PixelStreamingEncoderCodec=AV1 \
  -UnderworldApiUrl="$UNDERWORLD_API_URL" \
  -UnderworldWorldId="$UNDERWORLD_WORLD_ID" \
  -UnderworldApiKey="$UNDERWORLD_API_KEY" \
  -graphicsadapter="$GPU_INDEX" -Log
