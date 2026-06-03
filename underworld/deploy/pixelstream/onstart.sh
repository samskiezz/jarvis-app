#!/usr/bin/env bash
# Bootstraps a fresh vast.ai GPU host: ensures Docker Compose v2 + the NVIDIA
# container toolkit are present so `docker compose up` can run GPU containers.
# Idempotent — safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)

# Compose v2 plugin
if ! docker compose version >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y docker-compose-plugin || true
fi

# NVIDIA Container Toolkit (most vast.ai images already have it)
if ! docker info 2>/dev/null | grep -qi nvidia; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -y && apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker && systemctl restart docker || true
fi

echo "host ready. Deploy: copy the pixelstream/ dir + your game build, then 'docker compose up -d --build'."
