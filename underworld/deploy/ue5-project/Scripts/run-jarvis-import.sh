#!/usr/bin/env bash
# run-jarvis-import.sh — generate the JARVIS asset manifest + headless-import all
# chamber GLBs into the UE5 project (Interchange glTF + Nanite). Run on the GPU box.
set -euo pipefail
UE_ROOT="${UE_ROOT:-/opt/UnrealEngine}"
PROJ="${PROJ:-/opt/jarvis-app-1/underworld/deploy/ue5-project}"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd"

echo "== [1/2] generating JARVIS manifest (headless, no GPU) =="
python3 "$PROJ/Scripts/gen_jarvis_manifest.py"

echo "== [2/2] importing JARVIS GLBs via Interchange (headless editor) =="
"$EDITOR_CMD" "$PROJ/Underworld.uproject" \
  -run=pythonscript -script="$PROJ/Scripts/import_jarvis_glbs.py" \
  -unattended -nullrhi -nosplash -stdout 2>&1 | tail -n 50

echo "== JARVIS import complete =="
