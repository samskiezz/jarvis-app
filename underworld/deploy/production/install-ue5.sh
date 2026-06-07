#!/usr/bin/env bash
# install-ue5.sh — install Unreal Engine 5 on the CONTROL box (this box: 268GB free,
# 8c/31GB), build it, then package Underworld Minions for Linux Shipping. The packaged
# build (~10GB) ships to the Vast GPU box to run under Pixel Streaming. The engine lives
# HERE because the GPU box only has 27GB free — far too little for the ~170GB engine.
#
# UE5 is FREE but NOT in any package repo and NOT publicly downloadable: Epic gates it
# behind YOUR account. This script needs exactly ONE of these (pick a path):
#
#   PATH A (source, recommended) — link Epic <-> a GitHub account once, then:
#       export EPIC_GH_USER=<github-username>
#       export EPIC_GH_TOKEN=<github personal access token, repo scope>
#       ./install-ue5.sh
#     (link at https://www.unrealengine.com/account/connections -> GitHub)
#
#   PATH B (prebuilt) — a URL/path to Epic's prebuilt Linux editor tarball you fetched
#     while logged into your Epic account:
#       export UE5_PREBUILT=/path/or/url/to/Linux_Unreal_Editor_5.4.x.zip
#       ./install-ue5.sh
#
# Without one of those this script STOPS — it cannot and will not fabricate the engine.
set -euo pipefail

UE_BRANCH="${UE_BRANCH:-5.4}"
UE_ROOT="${UE_ROOT:-/opt/UnrealEngine}"
PROJ="${PROJ:-/opt/jarvis-app-1/underworld/deploy/ue5-project}"
PROJ_NAME="${PROJ_NAME:-Underworld}"
OUT="${OUT:-/opt/jarvis-app-1/underworld/deploy/production/packaged-linux}"

echo "== Underworld :: UE5 install + package =="
echo "engine -> $UE_ROOT   project -> $PROJ   packaged -> $OUT"

# --- 0. preflight: disk ---
avail_gb=$(df -BG --output=avail "$(dirname "$UE_ROOT")" | tail -1 | tr -dc 0-9)
[ "${avail_gb:-0}" -ge 180 ] || { echo "ABORT: need >=180GB free at $(dirname "$UE_ROOT"), have ${avail_gb}GB"; exit 1; }

# --- 1. obtain the engine ---
if [ ! -d "$UE_ROOT/Engine" ]; then
  if [ -n "${EPIC_GH_TOKEN:-}" ] && [ -n "${EPIC_GH_USER:-}" ]; then
    echo "== PATH A: cloning EpicGames/UnrealEngine @ $UE_BRANCH (Epic-linked) =="
    git clone --depth 1 -b "$UE_BRANCH" \
      "https://${EPIC_GH_USER}:${EPIC_GH_TOKEN}@github.com/EpicGames/UnrealEngine.git" "$UE_ROOT"
  elif [ -n "${UE5_PREBUILT:-}" ]; then
    echo "== PATH B: extracting prebuilt editor from $UE5_PREBUILT =="
    mkdir -p "$UE_ROOT"; tmp=$(mktemp -d)
    case "$UE5_PREBUILT" in
      http*) curl -fL "$UE5_PREBUILT" -o "$tmp/ue.zip" && unzip -q "$tmp/ue.zip" -d "$UE_ROOT" ;;
      *.zip) unzip -q "$UE5_PREBUILT" -d "$UE_ROOT" ;;
      *)     tar -xf "$UE5_PREBUILT" -C "$UE_ROOT" ;;
    esac
  else
    cat >&2 <<'EOF'
ABORT: no engine and no credentials. UE5 cannot be installed without YOUR Epic account.
Provide ONE of:
  EPIC_GH_USER + EPIC_GH_TOKEN   (after linking Epic<->GitHub at unrealengine.com/account/connections)
  UE5_PREBUILT=<zip url or path> (Epic's prebuilt Linux editor, downloaded while logged in)
Then re-run this script. Nothing else is needed — disk and GPU are already confirmed.
EOF
    exit 2
  fi
fi

# --- 2. build the engine (Epic bundles its own clang toolchain via Setup.sh) ---
cd "$UE_ROOT"
[ -f "Engine/Binaries/Linux/UnrealEditor" ] || {
  echo "== Setup.sh (downloads bundled toolchain + deps) =="; ./Setup.sh
  echo "== GenerateProjectFiles.sh =="; ./GenerateProjectFiles.sh
  echo "== make (this takes 1-3h on 8 cores) =="; make
}

UAT="$UE_ROOT/Engine/Build/BatchFiles/RunUAT.sh"

# --- 2b. import the 1,488 GLBs as cooked StaticMesh assets (Interchange glTF, headless) ---
echo "== importing GLBs into the project (native UE5 glTF import, no manual clicking) =="
UE_ROOT="$UE_ROOT" PROJ="$PROJ" "$PROJ/Scripts/run-import.sh" || \
  echo "WARN: GLB import had issues — see log; packaging continues"

# --- 3. package Underworld Minions -> Linux Shipping (Pixel Streaming plugin baked in) ---
echo "== BuildCookRun: $PROJ_NAME -> Linux Shipping =="
"$UAT" BuildCookRun \
  -project="$PROJ/$PROJ_NAME.uproject" \
  -platform=Linux -clientconfig=Shipping -serverconfig=Shipping \
  -cook -build -stage -pak -archive -archivedirectory="$OUT" -nop4 -utf8output

echo "== DONE. Packaged build at: $OUT =="
echo "Next: ship to GPU box  ->  ./deploy/production/hostinger/deploy.sh"
