#!/usr/bin/env bash
set -euo pipefail
# -----------------------------------------------------------------------------
# Work around a NVIDIA driver / container OS mismatch on Vast.ai.
#
# Problem:
#   The host kernel module is NVIDIA 590.48.01 (open) but the container's
#   Ubuntu 24.04 glibc (2.39) cannot load the host-mounted 590 userspace.
#   vulkaninfo reports llvmpipe and UE5 falls back to CPU rendering.
#
# Fix:
#   1. Download the official NVIDIA 590.48.01 runfile.
#   2. Extract it to /workspace/nvidia-runfile.
#   3. Create the missing generic .so symlinks (libEGL.so.1, libcuda.so.1, ...).
#   4. Build a tiny LD_PRELOAD stub that provides the symbols the old driver
#      needs but which no longer exist in glibc 2.39 / headless Xorg.
#   5. Install /usr/local/bin/run-with-nvidia-590 so launch scripts can wrap
#      UE5 with the correct libraries.
# -----------------------------------------------------------------------------

DRIVER_VERSION="${DRIVER_VERSION:-$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 | tr -d ' ')}"
DRIVER_VERSION="${DRIVER_VERSION:-590.48.01}"
RUNFILE_DIR="/workspace/nvidia-runfile"
EXTRACT_DIR="${RUNFILE_DIR}/NVIDIA-Linux-x86_64-${DRIVER_VERSION}"
RUNFILE_URL="https://download.nvidia.com/XFree86/Linux-x86_64/${DRIVER_VERSION}/NVIDIA-Linux-x86_64-${DRIVER_VERSION}.run"
RUNFILE="${RUNFILE_DIR}/NVIDIA-Linux-x86_64-${DRIVER_VERSION}.run"
COMPAT_DIR="/usr/local/lib/nvidia-compat"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "${RUNFILE_DIR}" "${COMPAT_DIR}"

# Minimal graphics dispatch libraries required for the Vulkan loader to talk
# to the NVIDIA ICD inside a headless container.
echo "Installing graphics dispatch dependencies ..."
apt-get update -qq
apt-get install -y --no-install-recommends libegl1 libxext6 libglvnd0 >/dev/null

if [ ! -f "${RUNFILE}" ]; then
    echo "Downloading NVIDIA ${DRIVER_VERSION} runfile ..."
    curl -fL -o "${RUNFILE}" "${RUNFILE_URL}"
fi

if [ ! -d "${EXTRACT_DIR}" ]; then
    echo "Extracting runfile ..."
    cd "${RUNFILE_DIR}"
    sh "${RUNFILE}" --extract-only
fi

cd "${EXTRACT_DIR}"

echo "Creating generic .so symlinks ..."
# GLVND generic libraries
ln -sf libGL.so.1.7.0           libGL.so.1
ln -sf libGL.so.1.7.0           libGL.so
ln -sf libGLESv1_CM.so.1.2.0    libGLESv1_CM.so.1
ln -sf libGLESv1_CM.so.1.2.0    libGLESv1_CM.so
ln -sf libGLESv2.so.2.1.0       libGLESv2.so.2
ln -sf libGLESv2.so.2.1.0       libGLESv2.so
ln -sf libGLX.so.0              libGLX.so
ln -sf libGLdispatch.so.0       libGLdispatch.so
ln -sf libOpenCL.so.1.0.0       libOpenCL.so.1
ln -sf libOpenCL.so.1.0.0       libOpenCL.so
ln -sf libOpenGL.so.0           libOpenGL.so

# NVIDIA versioned libraries -> generic SONAMEs
for f in lib*_nvidia.so.${DRIVER_VERSION} libnvidia-*.so.${DRIVER_VERSION} \
         libcuda.so.${DRIVER_VERSION} libcudadebugger.so.${DRIVER_VERSION} \
         libnvcuvid.so.${DRIVER_VERSION} libnvoptix.so.${DRIVER_VERSION}; do
    [ -f "$f" ] || continue
    base="${f%.${DRIVER_VERSION}}"
    case "$base" in
        libGLX_nvidia.so|libEGL_nvidia.so)
            ln -sf "$f" "${base}.0" ;;
        *)
            ln -sf "$f" "${base}.1"
            ln -sf "$f" "$base" ;;
    esac
done

# EGL platform helpers
ln -sf libnvidia-egl-gbm.so.1.1.3      libnvidia-egl-gbm.so.1
ln -sf libnvidia-egl-wayland.so.1.1.20 libnvidia-egl-wayland.so.1
ln -sf libnvidia-egl-wayland2.so.1.0.1 libnvidia-egl-wayland2.so.1
ln -sf libnvidia-egl-xcb.so.1.0.4      libnvidia-egl-xcb.so.1
ln -sf libnvidia-egl-xlib.so.1.0.4     libnvidia-egl-xlib.so.1

echo "Building glibc/Xorg compatibility stub ..."
gcc -shared -fPIC -o "${COMPAT_DIR}/libnvidia_glibc_compat.so" \
    "${HERE}/nvidia_glibc_compat.c"

echo "Installing wrapper script ..."
cat > /usr/local/bin/run-with-nvidia-590 <<EOF
#!/usr/bin/env bash
set -euo pipefail
NVIDIA_DIR="/workspace/nvidia-runfile/NVIDIA-Linux-x86_64-${DRIVER_VERSION}"
if [[ ! -d "\${NVIDIA_DIR}" ]]; then
    NVIDIA_DIR="\$(find /workspace/nvidia-runfile -maxdepth 1 -type d -name 'NVIDIA-Linux-x86_64-*' 2>/dev/null | head -n1)"
fi
COMPAT="/usr/local/lib/nvidia-compat"
export LD_LIBRARY_PATH="\${NVIDIA_DIR}:\${COMPAT}\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export LD_PRELOAD="\${COMPAT}/libnvidia_glibc_compat.so\${LD_PRELOAD:+:\$LD_PRELOAD}"
export VK_ICD_FILENAMES="\${NVIDIA_DIR}/nvidia_icd.json"
export __GLX_VENDOR_LIBRARY_NAME=nvidia
export __EGL_VENDOR_LIBRARY_FILENAMES="\${NVIDIA_DIR}/10_nvidia.json"
exec "\$@"
EOF
chmod +x /usr/local/bin/run-with-nvidia-590

echo "Verifying Vulkan can see the GPU ..."
if run-with-nvidia-590 vulkaninfo --summary 2>/dev/null | grep -q "NVIDIA GeForce RTX"; then
    echo "OK: Vulkan sees the NVIDIA GPU."
else
    echo "WARNING: Vulkan still does not see the NVIDIA GPU. Check logs above." >&2
    exit 1
fi

echo "NVIDIA 590 workaround installed. Use 'run-with-nvidia-590 <command>' to run apps."
