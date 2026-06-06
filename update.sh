#!/usr/bin/env bash
# update.sh — ONE command to pull the latest code, rebuild, and restart everything.
# Run this on the server whenever you want the newest version:
#     bash update.sh
# Optional: API_PORT=8001 bash update.sh   (match your backend port)
#
# Two modes, auto-detected:
#   • PM2-managed box (this server): pulls, installs deps into .venv, then
#     `pm2 restart` — no pkill/nohup, so it cooperates with PM2 autorestart.
#   • Fresh/unmanaged box (vast.ai/VPS): stops old servers, rebuilds, runs serve.sh.
set -uo pipefail
cd "$(dirname "$0")" 2>/dev/null || true
API_PORT="${API_PORT:-8001}"; UI_PORT="${UI_PORT:-5173}"
# Prefer the project virtualenv — on this server the Python deps live in .venv,
# and bare `python` may not exist (only python3). Fall back gracefully.
if [ -x ".venv/bin/python" ]; then PY=".venv/bin/python";
elif command -v python  >/dev/null 2>&1; then PY="python";
else PY="python3"; fi
say(){ printf '\033[36m[update]\033[0m %s\n' "$*"; }

say "1/4 pulling the latest code from GitHub (main)…"
git fetch origin && git reset --hard origin/main
say "    now at: $(git rev-parse --short HEAD)  ($(git log -1 --pretty=%s | cut -c1-60))"

say "2/4 installing deps (python: $PY)…"
"$PY" -m pip install -q -r server/requirements.txt 2>/dev/null || true
[ -d node_modules ] || npm install >/tmp/jarvis-npm.log 2>&1

# ── PM2-managed path (cooperates with the running services) ───────────────────
if command -v pm2 >/dev/null 2>&1 && pm2 pid jarvis-backend >/dev/null 2>&1; then
  say "3/4 PM2 detected — restarting jarvis-backend + jarvis-frontend…"
  pm2 restart jarvis-backend jarvis-frontend --update-env >/dev/null
  say "4/4 done. UI :$UI_PORT · backend :$API_PORT (PM2-managed, dev server serves latest)."
  exit 0
fi

# ── Fresh-server path (no PM2): stop old, rebuild, serve.sh ───────────────────
say "3/4 stopping old servers + rebuilding UI for port $API_PORT…"
pkill -f "uvicorn server.main:app" 2>/dev/null || true
pkill -f "vite preview" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2
VITE_API_PORT="$API_PORT" npm run build >/tmp/jarvis-build.log 2>&1 \
  && say "    build OK" || { say "    BUILD FAILED — see /tmp/jarvis-build.log"; tail -5 /tmp/jarvis-build.log; }

say "4/4 starting fresh (backend :$API_PORT + UI :$UI_PORT, both on 0.0.0.0)…"
API_PORT="$API_PORT" UI_PORT="$UI_PORT" bash serve.sh
