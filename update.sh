#!/usr/bin/env bash
# update.sh — ONE command to pull the latest code, rebuild, and restart everything.
# Run this on the server whenever you want the newest version:
#     bash update.sh
# Optional: API_PORT=8001 bash update.sh   (match your backend port)
set -uo pipefail
cd "$(dirname "$0")" 2>/dev/null || true
API_PORT="${API_PORT:-8001}"; UI_PORT="${UI_PORT:-5173}"
say(){ printf '\033[36m[update]\033[0m %s\n' "$*"; }

say "1/5 pulling the latest code from GitHub (main)…"
git fetch origin && git reset --hard origin/main
say "    now at: $(git rev-parse --short HEAD)  ($(git log -1 --pretty=%s | cut -c1-60))"

say "2/5 stopping old servers…"
pkill -f "uvicorn server.main:app" 2>/dev/null || true
pkill -f "vite preview" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2

say "3/5 installing deps…"
python -m pip install -q -r server/requirements.txt 2>/dev/null || true
[ -d node_modules ] || npm install >/tmp/jarvis-npm.log 2>&1

say "4/5 rebuilding UI for port $API_PORT…"
VITE_API_PORT="$API_PORT" npm run build >/tmp/jarvis-build.log 2>&1 \
  && say "    build OK" || { say "    BUILD FAILED — see /tmp/jarvis-build.log"; tail -5 /tmp/jarvis-build.log; }

say "5/5 starting fresh (backend :$API_PORT + UI :$UI_PORT, both on 0.0.0.0)…"
API_PORT="$API_PORT" UI_PORT="$UI_PORT" bash serve.sh
