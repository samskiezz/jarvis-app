#!/usr/bin/env bash
# launch-kit.sh — run the Underworld RTX world headless on the GPU box and stream it to
# the browser over WebRTC. Requires Omniverse Kit installed (see provision-omniverse.sh).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KIT="${KIT_BIN:-$HOME/.local/share/ov/pkg/kit/kit}"        # Kit runtime path
API_URL="${UNDERWORLD_API_URL:-http://127.0.0.1:8091}"
WORLD_ID="${UNDERWORLD_WORLD_ID:?set UNDERWORLD_WORLD_ID}"
API_KEY="${UNDERWORLD_API_KEY:-dev-key}"

[ -x "$KIT" ] || { echo "ERROR: Kit not found at $KIT. Run provision-omniverse.sh first." >&2; exit 1; }

# 1) one-time GLB -> USD import (idempotent)
"$KIT" --exec "$HERE/import_glbs_to_usd.py" \
  --/glb_root=/opt/jarvis-app-1/underworld/web/public/models \
  --/usd_root=/Underworld/Assets --no-window 2>&1 | tail -3 || true

# 2) run the living world with RTX Path Tracing + WebRTC livestream (headless)
exec "$KIT" \
  --ext-folder "$HERE/exts" \
  --enable underworld.world \
  --enable omni.kit.livestream.webrtc \
  --/underworld/api_url="$API_URL" \
  --/underworld/world_id="$WORLD_ID" \
  --/underworld/api_key="$API_KEY" \
  --/rtx/rendermode=PathTracing \
  --/app/livestream/enabled=true \
  --/app/livestream/port=8211 \
  --no-window -d
