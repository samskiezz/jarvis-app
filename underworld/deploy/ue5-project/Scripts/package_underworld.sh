#!/bin/bash
# package_underworld.sh — Linux Shipping cook + stage + pak + archive for Pixel Streaming.
#
# Usage:
#   export UE_ROOT=/opt/UnrealEngine
#   bash Scripts/package_underworld.sh
#
# Output goes to deploy/pixelstream/game/ (sibling of the .uproject dir).
set -euo pipefail

PROJ="$(cd "$(dirname "$0")/.." && pwd)"
UE_ROOT="${UE_ROOT:-/opt/UnrealEngine}"
ARCHIVE="${ARCHIVE:-$PROJ/../pixelstream/game}"

mkdir -p "$ARCHIVE"

"$UE_ROOT/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun \
  -project="$PROJ/Underworld.uproject" \
  -noP4 -utf8output \
  -platform=Linux -targetplatform=Linux -clientconfig=Shipping \
  -build -cook -allmaps -stage -pak -archive \
  -archivedirectory="$ARCHIVE"

echo "[package] archived to $ARCHIVE"
