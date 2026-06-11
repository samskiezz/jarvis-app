#!/usr/bin/env bash
# vast-register.sh — RUN ON THE VAST.AI GPU BOX. Gets the ports RIGHT automatically:
#   1. ensures Ollama is serving (bound to 0.0.0.0) + the model is pulled
#   2. detects which internal port Ollama actually answers on
#   3. looks up vast.ai's EXTERNAL mapping for that port ($VAST_TCP_PORT_<internal>,
#      which is how vast.ai exposes it — separate from the SSH port)
#   4. registers the public URL with the JARVIS app on the VPS → LLM connects, GPU hammers
# Re-run / drop into the instance's On-start script to survive restarts + port changes.
set -uo pipefail

APP="${JARVIS_APP_URL:-http://76.13.176.135:8001}"   # the VPS backend (override if elsewhere)
KEY="${VITE_API_KEY:-dev-key}"
MODEL="${OLLAMA_BASE_MODEL:-${OLLAMA_MODEL:-llama3.1:8b}}"
say(){ printf '\033[36m[vast-register]\033[0m %s\n' "$*"; }
case "${MODEL,,}:${LLM_ENABLE_70B:-0}:${ENABLE_70B_TIER:-0}" in
  *70b*:1:*|*70b*:*:1) ;;
  *70b*) say "Refusing to pull/use 70B without LLM_ENABLE_70B=1; using llama3.1:8b."; MODEL="llama3.1:8b" ;;
esac

# 1) Ollama serving on all interfaces, model present
if command -v ollama >/dev/null 2>&1; then
  export OLLAMA_HOST=0.0.0.0:11434
  export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-2}"
  export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-2}"
  pgrep -f "ollama serve" >/dev/null 2>&1 || { say "starting ollama (0.0.0.0:11434)…"; nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 3; }
  ollama list 2>/dev/null | grep -q . || { say "pulling $MODEL…"; ollama pull "$MODEL" || true; }
else
  say "ollama not installed — run: curl -fsSL https://ollama.com/install.sh | sh"; exit 1
fi

IP="${PUBLIC_IPADDR:-}"; [ -z "$IP" ] && IP="$(curl -s -m5 ifconfig.me 2>/dev/null)"
say "this box public IP: ${IP:-unknown}"
say "vast.ai port mappings on this instance (internal → external):"
env | grep -E '^VAST_TCP_PORT_' | sed -E 's/VAST_TCP_PORT_([0-9]+)=([0-9]+)/    \1 → \2/' | sort -n || say "    (none exposed!)"

# 2) which INTERNAL port does Ollama answer on? (11434 default, else any exposed port)
EXPOSED="$(env | sed -nE 's/^VAST_TCP_PORT_([0-9]+)=.*/\1/p')"
INT=""
for p in 11434 $EXPOSED; do
  curl -s -m3 "http://127.0.0.1:$p/api/tags" >/dev/null 2>&1 && { INT="$p"; break; }
done
[ -z "$INT" ] && { say "Ollama isn't answering on any local port (see /tmp/ollama.log)."; exit 1; }
say "Ollama answers on internal port $INT"

# 3) external mapping for that internal port
eval EXT="\${VAST_TCP_PORT_${INT}:-}"
EXT="${EXT:-${OLLAMA_EXTERNAL_PORT:-}}"
if [ -z "$EXT" ]; then
  say "Internal port $INT is NOT exposed externally on this instance — that's the problem."
  say "Fix once: add $INT to the instance's open ports on vast.ai (Edit → Open Ports, or"
  say "recreate with -p $INT:$INT), then re-run. The mappings that DO exist are listed above."
  say "(Or set OLLAMA_EXTERNAL_PORT=<external port from the IP/Port button> and re-run.)"
  exit 1
fi
URL="http://$IP:$EXT"
say "PUBLIC Ollama URL → $URL   (internal $INT → external $EXT)"

# 4) verify the public URL works (the exact check the app does), then register
curl -s -m6 "$URL/api/tags" >/dev/null 2>&1 && say "public URL reachable ✓" \
  || say "note: $URL didn't answer from here (NAT) — the app on the VPS may still reach it; registering."
RESP="$(curl -s -m15 -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  "$APP/v1/jarvis/research/connect" -d "{\"ollama_host\":\"$URL\"}" 2>/dev/null || true)"
echo "$RESP" | grep -qE '"ok":[[:space:]]*true' \
  && say "LINKED ✓ — JARVIS reasoning on this GPU; the autopilot is hammering it." \
  || { say "the app didn't confirm. is it up at $APP ? response:"; echo "    $RESP"; }
