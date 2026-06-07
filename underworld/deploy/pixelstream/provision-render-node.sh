#!/usr/bin/env bash
# provision-render-node.sh — make a GPU box render + NVENC-encode capable for the
# packaged Underworld UE5 build, NATIVELY (no Docker needed). Run on the GPU box.
#
# This is exactly what was done on the vast.ai 2x4090 box (driver 580 / CUDA 13):
# it had libvulkan + the NVIDIA GL/Vulkan driver libs + NVENC (caps=all) but was
# MISSING the Vulkan ICD, so Vulkan couldn't see the GPUs. We install vulkan-tools,
# write the NVIDIA ICD, install node, and fetch Epic's signalling infrastructure.
set -euo pipefail

echo "[1/4] Vulkan loader + tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get install -y -q vulkan-tools libvulkan1 ffmpeg curl git

echo "[2/4] NVIDIA Vulkan ICD (the piece that was missing)"
NVVER="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1 | tr -d ' ')"
mkdir -p /usr/share/vulkan/icd.d
cat > /usr/share/vulkan/icd.d/nvidia_icd.json <<JSON
{ "file_format_version": "1.0.0",
  "ICD": { "library_path": "libGLX_nvidia.so.0", "api_version": "1.3.${NVVER%%.*}" } }
JSON
echo "  Vulkan devices:"; vulkaninfo --summary 2>/dev/null | grep deviceName | head || true

echo "[3/4] Node 20 (signalling server runtime)"
node --version >/dev/null 2>&1 || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - ; apt-get install -y -q nodejs; }

echo "[4/4] Epic Pixel Streaming signalling infrastructure (UE5.5)"
cd "${WORKDIR:-/workspace}" 2>/dev/null || cd /root
[ -d PixelStreamingInfrastructure ] || git clone --depth 1 -b UE5.5 \
  https://github.com/EpicGamesExt/PixelStreamingInfrastructure.git

echo "DONE. Render node ready: Vulkan + NVENC + signalling. Drop a packaged build in"
echo "deploy/pixelstream/game/ and run ./run-native.sh (or ./run-ue5.sh in Docker)."
