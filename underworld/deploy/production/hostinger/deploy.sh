#!/usr/bin/env bash
# deploy.sh — ship the packaged UE5 build from the control box to the Vast GPU box and
# (re)launch the dual-GPU render container. Run AFTER install-ue5.sh has produced
# packaged-linux/. The engine never goes to Vast — only the ~10GB packaged game does
# (Vast has 27GB free, enough for the build + signalling infra).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"                       # underworld/deploy/production

VAST_SSH="${VAST_SSH:?set VAST_SSH (e.g. '-p 41154 root@211.72.13.201')}"
PKG="${PKG:-$ROOT/packaged-linux}"
PSI="${PSI:-$ROOT/../PixelStreamingInfrastructure}" # cloned UE5 signalling infra
WORKER="$ROOT/vast-worker"
REMOTE="/workspace/underworld-render"
: "${UNDERWORLD_WORLD_ID:?set UNDERWORLD_WORLD_ID}"
: "${UNDERWORLD_API_URL:?set UNDERWORLD_API_URL (control box, e.g. http://76.13.176.135:8091)}"

[ -d "$PKG/LinuxClient" ] || [ -d "$PKG/Linux" ] || { echo "ERROR: no packaged build at $PKG (run install-ue5.sh)"; exit 1; }
[ -d "$PSI" ] || { echo "ERROR: PixelStreamingInfrastructure missing at $PSI"; exit 1; }

# parse VAST_SSH ('-p 41154 root@211.72.13.201') into rsync's -e port + user@host target
VAST_PORT="$(echo "$VAST_SSH" | grep -oE '\-p +[0-9]+' | grep -oE '[0-9]+' || echo 22)"
VAST_TARGET="$(echo "$VAST_SSH" | grep -oE '[^ ]+@[^ ]+')"
RSH="ssh -p $VAST_PORT -o StrictHostKeyChecking=no"

echo "== rsync packaged build + signalling infra + worker scripts -> Vast =="
ssh -o StrictHostKeyChecking=no $VAST_SSH "mkdir -p $REMOTE/game $REMOTE/PixelStreamingInfrastructure"
rsync -az --delete -e "$RSH" "$PKG/"    "$VAST_TARGET:$REMOTE/game/"
rsync -az --delete -e "$RSH" "$PSI/"    "$VAST_TARGET:$REMOTE/PixelStreamingInfrastructure/"
rsync -az          -e "$RSH" "$WORKER/" "$VAST_TARGET:$REMOTE/"

echo "== launch dual-GPU render worker on Vast (one UE process per 4090) =="
ssh -o StrictHostKeyChecking=no $VAST_SSH bash -lc "'
  cd $REMOTE
  export UNDERWORLD_WORLD_ID=$UNDERWORLD_WORLD_ID
  export UNDERWORLD_API_URL=$UNDERWORLD_API_URL
  export UNDERWORLD_API_KEY=${UNDERWORLD_API_KEY:-dev-key}
  pkill -f UnderworldMinions 2>/dev/null || true
  nohup ./start-dual-gpu.sh > $REMOTE/render.log 2>&1 &
  sleep 3; echo launched; tail -n 5 $REMOTE/render.log || true
'"

echo "== now point the proxy at the live streams =="
echo "   run:  DOMAIN=... VAST_HOST=... VAST_SSH='$VAST_SSH' ./orchestrate.sh"
