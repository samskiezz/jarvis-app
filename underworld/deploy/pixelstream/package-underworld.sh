#!/usr/bin/env bash
# package-underworld.sh — headlessly COOK + PACKAGE the Underworld UE5 project into a
# Linux Shipping build, with NO editor GUI, using Epic's dev container image.
#
# This is the ONE step that needs a big box: the UE5 engine (~50GB) + an Epic Games
# account linked to GitHub (to pull ghcr.io/epicgames/unreal-engine:dev). Run it on a
# workstation or a >=120GB-disk GPU box with Docker + nvidia-container-toolkit. The
# OUTPUT (a few-GB packaged build) is then copied to the render node's game/ dir.
#
# Prereqs:
#   - Epic account linked to GitHub, `docker login ghcr.io` with that account.
#   - docker + nvidia-container-toolkit installed.
set -euo pipefail

UE_IMAGE="${UE_IMAGE:-ghcr.io/epicgames/unreal-engine:dev-5.5}"
PROJECT_DIR="$(cd "$(dirname "$0")/../ue5-project" && pwd)"
OUT_DIR="${OUT_DIR:-$(cd "$(dirname "$0")" && pwd)/game}"
PROJECT="Underworld"

echo "Project : ${PROJECT_DIR}/${PROJECT}.uproject"
echo "Output  : ${OUT_DIR}"
echo "Image   : ${UE_IMAGE}  (requires Epic/GitHub auth)"

mkdir -p "${OUT_DIR}"

# RunUAT BuildCookRun — cook + stage + package + archive a Linux Shipping client.
# -RenderOffscreen-friendly client; no editor, no GUI. Mounts the project + output.
docker run --rm --gpus all \
  -v "${PROJECT_DIR}:/project" \
  -v "${OUT_DIR}:/archive" \
  "${UE_IMAGE}" \
  bash -lc '/home/ue4/UnrealEngine/Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
      -project=/project/'"${PROJECT}"'.uproject \
      -noP4 -nocompileeditor -utf8output \
      -platform=Linux -clientconfig=Shipping \
      -cook -build -stage -pak -compressed -package \
      -archive -archivedirectory=/archive'

echo "DONE. Packaged build in ${OUT_DIR}. Copy it to the render node:"
echo "  rsync -a ${OUT_DIR}/ <render-node>:<repo>/underworld/deploy/pixelstream/game/"
echo "Then on the render node: ./run-native.sh"
