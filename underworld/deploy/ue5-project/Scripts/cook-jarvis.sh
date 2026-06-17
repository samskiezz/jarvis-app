#!/usr/bin/env bash
# cook-jarvis.sh — cook + stage + pak the JARVIS HUD into a Linux Pixel-Streaming package.
# Run AS ueuser (the engine + project are chowned to ueuser). Depends on:
#   1) the 48 JARVIS GLBs imported   (run-jarvis-import.sh)
#   2) /Game/Maps/JarvisHUD authored (make_jarvis_level.py)
#
# Produces a self-contained UnrealGame at $ARCHIVE/Linux that runs headless on the Vast 4090
# with Pixel Streaming:  ./Underworld.sh JarvisHUD -RenderOffScreen -PixelStreamingURL=ws://127.0.0.1:8888
#
# Workflow note: on this box, running the Cook commandlet through RunUAT crashes with a
# startup SIGSEGV ("Failed to find game directory"). We work around it by cooking directly
# with UnrealEditor-Cmd, then using RunUAT only for stage/pak/package with -skipcook.
set -euo pipefail

UE_ROOT="${UE_ROOT:-/opt/UnrealEngine}"
PROJ="${PROJ:-/opt/jarvis-app-1/underworld/deploy/ue5-project}"
MAP="${MAP:-/Game/Maps/JarvisHUD}"
ARCHIVE="${ARCHIVE:-$PROJ/Packaged}"
CONFIG="${CONFIG:-Development}"

# Re-run as ueuser if invoked as root.
if [[ "$(id -un)" != "ueuser" ]]; then
  exec runuser -u ueuser -- "$0" "$@"
fi

UAT="$UE_ROOT/Engine/Build/BatchFiles/RunUAT.sh"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd"
FULLLOG="$PROJ/Saved/cook-full.log"
DIRECT_LOG="$PROJ/Saved/cook-direct.log"

mkdir -p "$PROJ/Saved"

echo "== cooking JARVIS HUD ($MAP, $CONFIG) -> $ARCHIVE =="

# Step 1: direct Cook commandlet (avoids the RunUAT startup crash).
echo "[1/2] Direct Cook commandlet..."
set +e
nice -n 12 "$EDITOR_CMD" "$PROJ/Underworld.uproject" \
  -run=Cook -Map="$MAP" -TargetPlatform=Linux \
  -unattended -nullrhi -ddc=InstalledNoZenLocalFallback \
  2>&1 | tee "$DIRECT_LOG" | tail -n 80
COOK_RC=${PIPESTATUS[0]}
set -e
if [[ $COOK_RC -ne 0 ]]; then
  echo "== Direct Cook failed with exit $COOK_RC (log: $DIRECT_LOG) =="
  exit $COOK_RC
fi

# Step 2: RunUAT stage/pak/package (skip cook since we just cooked).
echo "[2/2] RunUAT stage / pak / package..."
set +e
nice -n 12 "$UAT" BuildCookRun \
  -project="$PROJ/Underworld.uproject" \
  -noP4 -platform=Linux -clientconfig="$CONFIG" -serverconfig="$CONFIG" \
  -skipcook -stage -pak -package -archive -archivedirectory="$ARCHIVE" \
  -map="$MAP" -unattended -nocompileeditor -utf8output -nullrhi -waitmutex \
  -ddc=InstalledNoZenLocalFallback 2>&1 | tee "$FULLLOG" | tail -n 120
RC=${PIPESTATUS[0]}
set -e
echo "== RunUAT exit: $RC (full log: $FULLLOG) =="

echo ""
echo "== cook result =="
if [ -d "$ARCHIVE/Linux" ]; then
  echo "OK -> $ARCHIVE/Linux"
  find "$ARCHIVE/Linux" -maxdepth 2 \( -name '*.sh' -o -name '*.pak' -o -name '*.ucas' -o -name '*.utoc' \) 2>/dev/null | head
else
  echo "FAILED — no $ARCHIVE/Linux (see tail above)"
  exit 1
fi
