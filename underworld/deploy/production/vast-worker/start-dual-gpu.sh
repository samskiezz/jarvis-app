#!/usr/bin/env bash
# start-dual-gpu.sh — container entrypoint on the Vast 2x4090 box. One UE5 Pixel-Streaming
# session per GPU (no NVLink on Ada, so one process each). GPU0 -> stream1, GPU1 -> stream2.
# Each pins its own signalling server + streamer port; Vast maps these to public ports that
# the Hostinger orchestrator discovers and proxies. Both render the SAME live world.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

: "${UNDERWORLD_WORLD_ID:?set UNDERWORLD_WORLD_ID}"
export UNDERWORLD_API_URL="${UNDERWORLD_API_URL:?set UNDERWORLD_API_URL (control box, e.g. http://76.13.176.135:8091)}"
export UNDERWORLD_API_KEY="${UNDERWORLD_API_KEY:-dev-key}"

echo "== Underworld dual-GPU render worker =="
nvidia-smi --query-gpu=index,name --format=csv,noheader || { echo "no GPU visible"; exit 1; }

# GPU 0 -> session 1 (signalling 8080, streamer 8888)
GPU_INDEX=0 HTTP_PORT=8080 STREAMER_PORT=8888 "$HERE/start.sh" &
P0=$!
# GPU 1 -> session 2 (signalling 8081, streamer 8889)
GPU_INDEX=1 HTTP_PORT=8081 STREAMER_PORT=8889 "$HERE/start.sh" &
P1=$!

echo "session1 pid $P0 (gpu0 :8080/:8888)   session2 pid $P1 (gpu1 :8081/:8889)"
trap 'kill $P0 $P1 2>/dev/null' TERM INT
# if either session dies, take the container down so Vast/PM2 restarts it cleanly
wait -n $P0 $P1
echo "a render session exited; shutting down for restart"
kill $P0 $P1 2>/dev/null
exit 1
