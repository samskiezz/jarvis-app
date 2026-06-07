#!/usr/bin/env bash
# run-import.sh — headlessly import every Underworld GLB into the UE5 project as cooked
# StaticMesh assets (Interchange glTF). Runs UnrealEditor-Cmd with the Python commandlet;
# install-ue5.sh calls this AFTER `make` and BEFORE packaging so the assets are baked in.
set -euo pipefail
UE_ROOT="${UE_ROOT:-/opt/UnrealEngine}"
PROJ="${PROJ:-/opt/jarvis-app-1/underworld/deploy/ue5-project}"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd"

[ -x "$EDITOR_CMD" ] || { echo "ERROR: $EDITOR_CMD not built yet (run install-ue5.sh make step)"; exit 1; }
export UW_GLB_ROOT="${UW_GLB_ROOT:-/opt/jarvis-app-1/underworld/web/public/models}"

echo "== importing GLBs headlessly via Interchange (this can take a while for 1.5k assets) =="
"$EDITOR_CMD" "$PROJ/Underworld.uproject" \
  -run=pythonscript -script="$PROJ/Scripts/import_glbs.py" \
  -unattended -nullrhi -nosplash -stdout 2>&1 | tail -n 40

echo "== imported. coverage: =="
python3 -c "import json;d=json.load(open('$PROJ/Scripts/manifest.json'));print('total',d['total']);[print(' ',k,v) for k,v in sorted(d['categories'].items(),key=lambda x:-x[1])]" 2>/dev/null || echo "(manifest not found — check log above)"
