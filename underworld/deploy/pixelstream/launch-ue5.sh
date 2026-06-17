#!/usr/bin/env bash
# launch-ue5.sh — wrapper that forces Underworld to use an extracted NVIDIA runfile
# userspace + glibc/Xorg compatibility stubs. Required on Vast.ai Ubuntu instances
# where the host-mounted NVIDIA userspace is incompatible with the container glibc.
#
# See nvidia-workaround/setup-nvidia-workaround.sh for one-off installation.
set -euo pipefail

COMPAT="/usr/local/lib/nvidia-compat"

# Auto-detect any extracted runfile tree (580, 590, ...).
NVIDIA_DIR="${NVIDIA_DIR:-}"
if [[ -z "${NVIDIA_DIR}" ]]; then
    NVIDIA_DIR="$(find /workspace/nvidia-runfile -maxdepth 1 -type d -name 'NVIDIA-Linux-x86_64-*' 2>/dev/null | head -n1)"
fi

if [[ ! -d "${NVIDIA_DIR}" || ! -f "${COMPAT}/libnvidia_glibc_compat.so" ]]; then
    echo "ERROR: NVIDIA runfile workaround files not found." >&2
    echo "       Run: bash $(dirname "$0")/nvidia-workaround/setup-nvidia-workaround.sh" >&2
    exit 1
fi

export LD_LIBRARY_PATH="${NVIDIA_DIR}:${COMPAT}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LD_PRELOAD="${COMPAT}/libnvidia_glibc_compat.so${LD_PRELOAD:+:$LD_PRELOAD}"
export VK_ICD_FILENAMES="${NVIDIA_DIR}/nvidia_icd.json"
export __GLX_VENDOR_LIBRARY_NAME=nvidia
export __EGL_VENDOR_LIBRARY_FILENAMES="${NVIDIA_DIR}/10_nvidia.json"

cd /workspace/pixelstream/game/Linux
exec ./Underworld.sh "$@"
