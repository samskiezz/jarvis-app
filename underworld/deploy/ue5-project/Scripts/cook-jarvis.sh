#!/usr/bin/env bash
# cook-jarvis.sh — cook + stage + pak the JARVIS HUD into a Linux Pixel-Streaming package.
# Run AS ueuser (the engine + project are chowned to ueuser). Depends on:
#   1) the 48 JARVIS GLBs imported   (run-jarvis-import.sh)
#   2) /Game/Maps/JarvisHUD authored (make_jarvis_level.py)
#
# Produces a self-contained UnrealGame at $ARCHIVE/Linux that runs headless on the Vast 4090
# with Pixel Streaming:  ./Underworld.sh JarvisHUD -RenderOffScreen -PixelStreamingURL=ws://127.0.0.1:8888
#
# DDC note: -ddc=InstalledNoZenLocalFallback avoids the ZenLocal SIGSEGV seen on this box;
# the engine DerivedDataCache is writable because the engine is chowned to ueuser.
set -euo pipefail
UE_ROOT="${UE_ROOT:-/opt/UnrealEngine}"
PROJ="${PROJ:-/opt/jarvis-app-1/underworld/deploy/ue5-project}"
MAP="${MAP:-/Game/Maps/JarvisHUD}"
ARCHIVE="${ARCHIVE:-$PROJ/Packaged}"
CONFIG="${CONFIG:-Development}"
UAT="$UE_ROOT/Engine/Build/BatchFiles/RunUAT.sh"

echo "== cooking JARVIS HUD ($MAP, $CONFIG) -> $ARCHIVE =="
FULLLOG="$PROJ/Saved/cook-full.log"
# tee the FULL output to a log (the tail pipe alone swallowed the OOM error last time); don't let
# pipefail/set -e abort before we report — capture the real exit code from PIPESTATUS.
set +e
nice -n 12 "$UAT" BuildCookRun \
  -project="$PROJ/Underworld.uproject" \
  -noP4 -platform=Linux -clientconfig="$CONFIG" -serverconfig="$CONFIG" \
  -cook -build -stage -pak -package -archive -archivedirectory="$ARCHIVE" \
  -map="$MAP" -unattended -nocompileeditor -utf8output -nullrhi -waitmutex \
  -ddc=InstalledNoZenLocalFallback 2>&1 | tee "$FULLLOG" | tail -n 120
RC=${PIPESTATUS[0]}
set -e
echo "== RunUAT exit: $RC (full log: $FULLLOG) =="

echo ""
echo "== cook result =="
if [ -d "$ARCHIVE/Linux" ]; then
  echo "OK -> $ARCHIVE/Linux"
  find "$ARCHIVE/Linux" -maxdepth 2 -name '*.sh' -o -name '*.pak' 2>/dev/null | head
else
  echo "FAILED — no $ARCHIVE/Linux (see tail above)"
fi
