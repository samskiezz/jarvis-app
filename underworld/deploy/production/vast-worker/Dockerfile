# Underworld Minions — Vast.ai GPU render worker (UE5 Pixel Streaming).
# CUDA runtime + the system libs a packaged UE5 Linux build needs + Node for the
# Pixel Streaming signalling server. NVENC/AV1 on the Ada 4090s does the encode.
#
# Build context must contain:
#   ./game/                     <- "Package Project -> Linux (Shipping)" output
#   ./PixelStreamingInfrastructure/   <- EpicGamesExt UE5.x signalling infra
#   ./start.sh ./start-dual-gpu.sh
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=graphics,utility,video,compute
ENV __GLX_VENDOR_LIBRARY_NAME=nvidia

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvulkan1 vulkan-tools \
    libx11-6 libxrandr2 libxinerama1 libxcursor1 libxi6 \
    libgl1 libegl1 libglu1-mesa \
    libpulse0 libasound2 \
    ca-certificates curl git unzip xz-utils \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# NVIDIA Vulkan ICD (so -RenderOffscreen finds the 4090s without an X server)
RUN mkdir -p /usr/share/vulkan/icd.d && \
    printf '{ "file_format_version":"1.0.0","ICD":{"library_path":"libGLX_nvidia.so.0","api_version":"1.3.0"} }' \
    > /usr/share/vulkan/icd.d/nvidia_icd.json

WORKDIR /home/ue
COPY game/ /home/ue/game/
COPY PixelStreamingInfrastructure/ /home/ue/PixelStreamingInfrastructure/
COPY start.sh start-dual-gpu.sh /home/ue/
RUN chmod +x /home/ue/start.sh /home/ue/start-dual-gpu.sh

# expose Epic's default + our dual-session ports (Vast maps these to public ports)
EXPOSE 80 8080 8081 8888 8889
ENTRYPOINT ["/home/ue/start-dual-gpu.sh"]
