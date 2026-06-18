#!/usr/bin/env bash
# run-auto-author.sh — driver for headless UE5 authoring (gap-cluster C1).
#
# Invokes UnrealEditor-Cmd in commandlet mode to execute Scripts/auto_author.py
# inside the in-process unreal Python interpreter. If UE5 is not installed (e.g.
# running this on a VPS without GPU), falls back to dry-author mode which writes
# the descriptor manifest so a designer can review what would be authored.
#
# Env overrides:
#   UW_UE_ROOT      Root of UnrealEngine install (default: /opt/UnrealEngine)
#   UW_UE_PROJECT   Path to .uproject (default: <repo>/Underworld.uproject)
#   UW_AUTHOR_FLAGS Extra flags passed to auto_author.py (default: --all)
#
# Usage:
#   bash Scripts/run-auto-author.sh
#   UW_AUTHOR_FLAGS="--sequences --niagara" bash Scripts/run-auto-author.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${HERE}/.." && pwd)"
UW_UE_ROOT="${UW_UE_ROOT:-/opt/UnrealEngine}"
UW_UE_PROJECT="${UW_UE_PROJECT:-${PROJECT_DIR}/Underworld.uproject}"
UW_AUTHOR_FLAGS="${UW_AUTHOR_FLAGS:---all}"

UE_CMD_LINUX="${UW_UE_ROOT}/Engine/Binaries/Linux/UnrealEditor-Cmd"
UE_CMD_WIN="${UW_UE_ROOT}/Engine/Binaries/Win64/UnrealEditor-Cmd.exe"

log() { echo "[run-auto-author] $*" >&2; }

if [[ -x "${UE_CMD_LINUX}" ]]; then
    UE_CMD="${UE_CMD_LINUX}"
elif [[ -x "${UE_CMD_WIN}" ]]; then
    UE_CMD="${UE_CMD_WIN}"
else
    log "UE5 not found at ${UW_UE_ROOT} — running auto_author.py in DRY mode."
    log "  (descriptors will be written; no .uassets will be created)"
    exec python3 "${HERE}/auto_author.py" ${UW_AUTHOR_FLAGS}
fi

log "UE5 found: ${UE_CMD}"
log "project:   ${UW_UE_PROJECT}"
log "flags:     ${UW_AUTHOR_FLAGS}"

# -run=PythonScript invokes the in-process Python; the script flag is the path.
# -ScriptArguments forwards CLI flags to auto_author.py's argparse.
# -unattended -nop4 -nosplash -nullrhi keep the commandlet truly headless.
exec "${UE_CMD}" \
    "${UW_UE_PROJECT}" \
    -run=PythonScript \
    -script="${HERE}/auto_author.py" \
    -ScriptArguments="${UW_AUTHOR_FLAGS}" \
    -unattended \
    -nop4 \
    -nosplash \
    -nullrhi \
    -stdout \
    -FullStdOutLogOutput
