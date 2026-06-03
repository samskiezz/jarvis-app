#!/usr/bin/env bash
# Provision a vast.ai GPU node and bring the Underworld UE5 Pixel Streaming stack
# online. Requires the vastai CLI (`pip install vastai`) and your API key
# (`vastai set api-key <KEY>`).
#
# Usage:
#   ./vast-deploy.sh                     # rent the cheapest suitable RTX 4090/A6000+ and deploy
#   GPU="RTX_4090" MAXPRICE=0.6 ./vast-deploy.sh
#
# It selects an on-demand offer with an NVENC-capable NVIDIA GPU + >=24 GB VRAM,
# launches it with our onstart bootstrap, and prints the public stream URL to put
# in VITE_UNDERWORLD_PIXELSTREAM_URL.
set -euo pipefail

GPU="${GPU:-RTX_4090}"          # any NVENC GPU works: RTX_4090 / A6000 / L40 / A100 ...
MAXPRICE="${MAXPRICE:-0.80}"    # $/hr ceiling
DISK="${DISK:-60}"             # GB (UE builds are large)
IMAGE="${IMAGE:-nvidia/cuda:12.4.1-runtime-ubuntu22.04}"

echo "==> searching vast.ai for a $GPU (>=24GB) under \$$MAXPRICE/hr ..."
OFFER=$(vastai search offers \
  "gpu_name=$GPU num_gpus=1 gpu_ram>=24 cuda_vers>=12.0 inet_down>=200 rentable=true dph<=$MAXPRICE verified=true" \
  -o 'dph' --raw | python3 -c "import sys,json; o=json.load(sys.stdin); print(o[0]['id'] if o else '')")

if [[ -z "$OFFER" ]]; then
  echo "No matching offer. Loosen GPU/MAXPRICE and retry." >&2; exit 1
fi
echo "==> renting offer $OFFER"

# onstart bootstraps the host: installs docker compose plugin + nvidia toolkit if
# missing, clones nothing (we push the deploy dir), and launches the stack.
ONSTART=$(cat onstart.sh | base64 -w0)

vastai create instance "$OFFER" \
  --image "$IMAGE" \
  --disk "$DISK" \
  --ssh \
  --direct \
  --env "-p 80:80 -p 8888:8888 -p 3478:3478/udp -p 49152-49252:49152-49252/udp" \
  --onstart-cmd "echo $ONSTART | base64 -d | bash" \
  --label underworld-pixelstream

echo ""
echo "==> instance created. Next:"
echo "    1. vastai show instances           # get the public IP + mapped :80"
echo "    2. scp -r ../pixelstream  root@<IP>:/root/   (or git clone on the box)"
echo "    3. copy your packaged UE5 build into pixelstream/game/  (see README)"
echo "    4. on the box:  cd /root/pixelstream && PUBLIC_IP=<IP> docker compose up -d --build"
echo "    5. set frontend:  VITE_UNDERWORLD_PIXELSTREAM_URL=https://<IP>/  (or your domain)"
echo "    6. open the world, click 'Stream UE5'  ->  real graphics."
