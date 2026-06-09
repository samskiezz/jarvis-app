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
# -ddc=InstalledNoZenLocalFallback: ZenLocal's readiness check SIGSEGVs the editor when the
# engine DerivedDataCache dir is read-only for the run-as user (ueuser). Skipping ZenLocal +
# making /opt/UnrealEngine/Engine/DerivedDataCache world-writable is the headless workaround.
# (Fab/Bridge marketplace plugins are disabled in the .uproject — they need libatk/GUI libs.)
"$EDITOR_CMD" "$PROJ/Underworld.uproject" \
  -run=pythonscript -script="$PROJ/Scripts/import_jarvis_glbs.py" \
  -unattended -nullrhi -nosplash -stdout -ddc=InstalledNoZenLocalFallback 2>&1 | tail -n 50

echo "== JARVIS import complete =="
