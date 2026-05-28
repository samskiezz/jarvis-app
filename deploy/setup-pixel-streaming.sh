#!/usr/bin/env bash
# Stand up Pixel Streaming on a GPU VPS for projectsolar.cloud (or any host).
#
# Run as root on a fresh Ubuntu 22.04 GPU VPS:
#   curl -L https://raw.githubusercontent.com/samskiezz/jarvis-app/main/deploy/setup-pixel-streaming.sh | sudo bash
#
# Prerequisite: an NVIDIA GPU (RTX 3060+ recommended). The script installs
# the driver, container toolkit, signaling server, and a placeholder for
# the Unreal client. You still need to copy your built UE5 binary into
# /opt/UnderworldUE/ (Route 1 in deploy/pixel-streaming.md).

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"; exit 1
fi

DOMAIN="${PIXEL_STREAM_DOMAIN:-projectsolar.cloud}"
echo "==> Setting up Pixel Streaming for ${DOMAIN}"

# 1. Sanity check — NVIDIA GPU present?
if ! lspci | grep -i nvidia >/dev/null; then
  echo "ERROR: No NVIDIA GPU detected. Pixel Streaming needs a GPU. Aborting."
  echo "Cheapest GPU VPS options: Vast.ai, RunPod, Lambda Labs, Hetzner GPU."
  exit 2
fi

# 2. Base packages + Docker.
echo "==> Installing Docker + NVIDIA driver"
apt update
apt install -y curl ca-certificates gnupg lsb-release docker.io ubuntu-drivers-common
ubuntu-drivers autoinstall || true

# 3. NVIDIA Container Toolkit (gives Docker --gpus all).
echo "==> Installing NVIDIA Container Toolkit"
distribution=$(. /etc/os-release; echo "${ID}${VERSION_ID}")
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  > /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt update
apt install -y nvidia-container-toolkit
systemctl restart docker

echo "==> Verifying GPU access from Docker"
if ! docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi >/dev/null 2>&1; then
  echo "WARNING: nvidia-smi inside Docker failed. Reboot the VPS, then re-run."
fi

# 4. Pixel-Streaming signaling server.
echo "==> Starting Epic Games' Pixel-Streaming signaling server"
docker rm -f pixstream-signal 2>/dev/null || true
PUBLIC_IP=$(curl -s ifconfig.me)
docker run -d --name pixstream-signal --restart unless-stopped \
  -p 8888:8888 \
  -p 8889:8889 \
  -p 80:80 \
  -e PUBLIC_IP="${PUBLIC_IP}" \
  ghcr.io/epicgames/pixel-streaming-signalling-server:latest

# 5. Caddy reverse proxy in front for HTTPS termination.
echo "==> Starting Caddy reverse proxy with auto-TLS"
mkdir -p /opt/underworld-caddy
cat > /opt/underworld-caddy/Caddyfile <<EOF
${DOMAIN} {
    encode gzip zstd

    handle /pixelstream/* {
        uri strip_prefix /pixelstream
        reverse_proxy localhost:80 {
            header_up X-Forwarded-Proto https
        }
    }
    handle /pixelstream-ws {
        reverse_proxy localhost:8888
    }
    # Existing Underworld routes — proxy to the FastAPI backend if you've
    # already started it with `docker compose up -d` from the repo root.
    handle /api/* /worlds/* /knowledge/* {
        uri strip_prefix /api
        reverse_proxy localhost:8000 { flush_interval -1 }
    }
    # SPA / built UI assets — if you've copied the built dist/ to /var/www.
    handle {
        root * /var/www/underworld
        file_server
        try_files {path} /index.html
    }
}
EOF

docker rm -f underworld-caddy 2>/dev/null || true
docker run -d --name underworld-caddy --restart unless-stopped \
  --network host \
  -v /opt/underworld-caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v underworld_caddy_data:/data \
  caddy:2-alpine

# 6. Placeholder for the Unreal Server binary.
mkdir -p /opt/UnderworldUE
cat > /opt/UnderworldUE/README.txt <<EOF
Drop your packaged UE5 Linux server here, then run:

  xvfb-run -a ./Linux/UnderworldServer.sh \\
    -PixelStreamingURL=ws://localhost:8888 \\
    -RenderOffscreen -ResX=1920 -ResY=1080 -ForceRes \\
    -graphicsadapter=0

See deploy/unreal-client-notes.md in the repo for the full project spec.
EOF

cat <<DONE

==> ✓ Pixel Streaming infrastructure up.

Open https://${DOMAIN}/pixelstream/ — you should see Epic's signaling
frontend. It will say "no streamer connected" until you launch the UE5
client (see /opt/UnderworldUE/README.txt).

In the React app's .env, set:
  VITE_UNDERWORLD_PIXELSTREAM_URL=https://${DOMAIN}/pixelstream/
Then the "UE5 ▶" tier toggle in the World panel becomes active.

DONE
