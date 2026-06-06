#!/usr/bin/env bash
# serve.sh — PRODUCTION serve for a remote server (vast.ai / VPS).
#
# Starts the backend on 0.0.0.0:8000 and the built UI on 0.0.0.0:5173 together —
# both bound to 0.0.0.0 (not localhost) so the app is reachable from a browser at
# http://<server-ip>:5173. The UI auto-detects its backend from the page host, so
# the SAME build works on any IP — nothing to hardcode.
#
# Run it once on the server (use tmux / nohup / systemd to keep it alive):
#   ./serve.sh
#
# Knobs: API_PORT (8000), UI_PORT (5173), NO_AUTOBUILD=1, AUTOBUILD_BATCHES,
#   OLLAMA_HOST=http://gpu:11434, KIMI_API_KEY=…, GIT_AUTOSYNC=1.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
API_PORT="${API_PORT:-8000}"; UI_PORT="${UI_PORT:-5173}"
# Prefer the project virtualenv — deps live in .venv and bare `python` may be absent.
if [ -x "$ROOT/.venv/bin/python" ]; then PY="$ROOT/.venv/bin/python";
elif command -v python  >/dev/null 2>&1; then PY="python";
else PY="python3"; fi
# bake the backend port into the UI build so the browser hits the right port
# (e.g. API_PORT=8001 ./serve.sh  →  UI calls http://<host>:8001).
export VITE_API_PORT="$API_PORT"
export BRAIN_DB="${BRAIN_DB:-$ROOT/server/data/brain.db}"
export RECON_ALLOWLIST="${RECON_ALLOWLIST:-127.0.0.1,localhost}"
LOG=/tmp/jarvis-serve; mkdir -p "$LOG"
say(){ printf '\033[36m[serve]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[serve]\033[0m %s\n' "$*"; }

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -z "$IP" ] && IP="<server-ip>"

# ── 1. deps ───────────────────────────────────────────────────────────────────
say "1/4 dependencies…"
"$PY" -m pip install -q -r server/requirements.txt 2>>"$LOG/pip.log" || warn "  pip issues (see $LOG/pip.log)"
[ -d node_modules ] || npm install >"$LOG/npm.log" 2>&1

# ── 2. backend on 0.0.0.0 ─────────────────────────────────────────────────────
say "2/4 backend → http://0.0.0.0:$API_PORT (reachable at http://$IP:$API_PORT)…"
# restore the durable scraped-content snapshot if present
"$PY" -c "from server.services import document_store as d; d.restore()" 2>/dev/null || true
if ! pgrep -f "uvicorn server.main:app" >/dev/null 2>&1; then
  nohup "$PY" -m uvicorn server.main:app --host 0.0.0.0 --port "$API_PORT" >"$LOG/backend.log" 2>&1 &
fi
up=0
for i in $(seq 1 40); do curl -s -m 2 "http://127.0.0.1:$API_PORT/" >/dev/null 2>&1 && { up=1; break; }; sleep 1; done
[ "$up" = 1 ] && say "    backend up ✓" || { warn "    backend failed (see $LOG/backend.log)"; exit 1; }

# ── 3. first build of data (load + project; autobuild grows it) ────────────────
KEY="$("$PY" -c 'from server.config import API_KEY; print(API_KEY)' 2>/dev/null)"
if [ "${NO_AUTOBUILD:-0}" = "1" ]; then
  say "3/4 data: loading (autobuild off)…"
  curl -s -X POST -H "Authorization: Bearer $KEY" "http://127.0.0.1:$API_PORT/v1/jarvis/system/startup" >/dev/null 2>&1 || true
else
  say "3/4 data: autobuild in background (load · project · scrape · live feeds)…"
  ( curl -s -m 3600 -X POST -H "Authorization: Bearer $KEY" \
      "http://127.0.0.1:$API_PORT/v1/jarvis/system/autobuild?scrape_batches=${AUTOBUILD_BATCHES:-1}" \
      >"$LOG/autobuild.json" 2>&1 || true ) &
fi
# report live counts
sleep 2
curl -s -m 8 "http://127.0.0.1:$API_PORT/v1/jarvis/system/status" 2>/dev/null | "$PY" -c "
import sys,json
try:
    d=json.load(sys.stdin); f=d.get('foundry',{}); g=d.get('gotham',{})
    print(f\"    Foundry {f.get('endpoints',0):,} endpoints · Gotham {g.get('ontology_objects',0):,} objects · scraped {g.get('scraped_live',0):,}\")
except Exception: pass
" 2>/dev/null || true

# ── 4. build + serve the UI on 0.0.0.0 ────────────────────────────────────────
say "4/4 building UI (backend port baked in: $API_PORT)…"
VITE_API_PORT="$API_PORT" npm run build >"$LOG/build.log" 2>&1 || { warn "    UI build failed (see $LOG/build.log)"; exit 1; }
say "    UI → http://0.0.0.0:$UI_PORT (open http://$IP:$UI_PORT)"
pgrep -f "vite preview" >/dev/null 2>&1 || nohup npx vite preview --host 0.0.0.0 --port "$UI_PORT" --strictPort >"$LOG/ui.log" 2>&1 &
sleep 2

echo
say "════════════════════════════════════════════════════════════════"
say "  UP.  Open →  http://$IP:$UI_PORT/"
say "       backend  http://$IP:$API_PORT     (logs in $LOG/)"
say "  First load shows the install pop-up → click 'Initialise System'."
warn "  Make sure ports $UI_PORT and $API_PORT are OPEN in your vast.ai/VPS firewall."
say "════════════════════════════════════════════════════════════════"
