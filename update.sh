#!/usr/bin/env bash
# update.sh — THE one command. Run this on the server, every time.
#     ./update.sh
# It pulls the latest code, builds, and runs the WHOLE app (UI + API) on ONE
# port: 8080. Then on your laptop open the tunnel and browse to localhost:8080.
set -uo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
say(){ printf '\033[36m[jarvis]\033[0m %s\n' "$*"; }

say "1/4 pulling latest code…"
git fetch origin >/dev/null 2>&1 && git reset --hard origin/main >/dev/null 2>&1
say "    now at $(git rev-parse --short HEAD)"

say "2/4 stopping old servers…"
pkill -f "uvicorn server.main:app" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2

say "3/4 launching everything on ONE port :$PORT…"
PORT="$PORT" bash tunnel.sh
