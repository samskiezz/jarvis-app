#!/usr/bin/env bash
# tunnel.sh — serve the WHOLE app (UI + API) on ONE port, bound to 0.0.0.0.
#
# Run it on the server (vast.ai or Hostinger VPS):
#     ./tunnel.sh
# It builds the UI and runs the backend on 0.0.0.0:8080, with the backend
# serving the built UI on that SAME port. Then just open the server's public
# IP in any browser:
#     http://<server-ip>:8080/
# (one port to open in the firewall — no SSH tunnel needed).
#
# Knobs: PORT (8080), NO_AUTOBUILD=1, AUTOBUILD_BATCHES, OLLAMA_HOST=http://gpu:11434
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
PORT="${PORT:-8080}"
# UI calls the API on the SAME port (same origin) — that's what makes a single
# tunnel enough. app-params derives http://<host>:$PORT for the API.
export VITE_API_PORT="$PORT"
export BRAIN_DB="${BRAIN_DB:-$ROOT/server/data/brain.db}"
export RECON_ALLOWLIST="${RECON_ALLOWLIST:-127.0.0.1,localhost}"
LOG=/tmp/jarvis-serve; mkdir -p "$LOG"
say(){ printf '\033[36m[tunnel]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[tunnel]\033[0m %s\n' "$*"; }

# ── 1. deps ───────────────────────────────────────────────────────────────────
say "1/4 dependencies…"
python -m pip install -q -r server/requirements.txt 2>>"$LOG/pip.log" || warn "  pip issues (see $LOG/pip.log)"
[ -d node_modules ] || npm install >"$LOG/npm.log" 2>&1

# ── 2. build the UI (backend serves it on the same port) ──────────────────────
say "2/4 building UI (single-port: API + UI both on :$PORT)…"
VITE_API_PORT="$PORT" npm run build >"$LOG/build.log" 2>&1 || { warn "    UI build failed (see $LOG/build.log)"; exit 1; }

# ── 3. backend on 0.0.0.0:$PORT (also serves dist/ UI) ────────────────────────
say "3/4 backend + UI → http://0.0.0.0:$PORT …"
python -c "from server.services import document_store as d; d.restore()" 2>/dev/null || true
pkill -f "uvicorn server.main:app" 2>/dev/null || true
sleep 1
nohup python -m uvicorn server.main:app --host 0.0.0.0 --port "$PORT" >"$LOG/backend.log" 2>&1 &
up=0
for i in $(seq 1 40); do curl -s -m 2 "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && { up=1; break; }; sleep 1; done
[ "$up" = 1 ] && say "    up ✓" || { warn "    backend failed (see $LOG/backend.log)"; exit 1; }

# ── 4. first build of data (load · project; autobuild grows it) ───────────────
KEY="$(python -c 'from server.config import API_KEY; print(API_KEY)' 2>/dev/null)"
if [ "${NO_AUTOBUILD:-0}" = "1" ]; then
  say "4/4 data: loading (autobuild off)…"
  curl -s -X POST -H "Authorization: Bearer $KEY" "http://127.0.0.1:$PORT/v1/jarvis/system/startup" >/dev/null 2>&1 || true
else
  say "4/4 data: autobuild in background (load · project · scrape · live feeds)…"
  ( curl -s -m 3600 -X POST -H "Authorization: Bearer $KEY" \
      "http://127.0.0.1:$PORT/v1/jarvis/system/autobuild?scrape_batches=${AUTOBUILD_BATCHES:-1}" \
      >"$LOG/autobuild.json" 2>&1 || true ) &
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -z "$IP" ] && IP="<server-ip>"
echo
say "════════════════════════════════════════════════════════════════"
say "  UP on a SINGLE port :$PORT  (UI + API together, bound to 0.0.0.0)."
say "  Open it directly in any browser:"
say "      http://$IP:$PORT/"
say "  (make sure port $PORT is open in the vast.ai / Hostinger firewall)"
say "════════════════════════════════════════════════════════════════"
