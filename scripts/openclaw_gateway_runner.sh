#!/bin/bash
# Keeps the OpenClaw gateway running inside the existing Docker container.
CONTAINER="openclaw-8zfp-openclaw-1"
PORT="18789"
exec docker exec -u node "$CONTAINER" openclaw gateway --bind loopback --port "$PORT"
