#!/usr/bin/env bash
# serve-frontend.sh — the ONE command pm2 runs for jarvis-frontend. A wrapper so the mode + args
# are GUARANTEED (pm2's `args` field was silently dropping `preview`, leaving it in dev mode = the
# blank/wedged page). `exec` so pm2 supervises vite directly. Static preview of the built dist =
# ~0% idle CPU, instant loads, and it serves whatever is in dist/ on each request — so an atomic
# dist swap (see safe-deploy-frontend.sh) goes live with NO restart and NO downtime.
set -euo pipefail
cd /opt/jarvis-app-1
PORT="${FRONTEND_PORT:-5173}"
exec node node_modules/vite/bin/vite.js preview --host 0.0.0.0 --port "$PORT" --strictPort
