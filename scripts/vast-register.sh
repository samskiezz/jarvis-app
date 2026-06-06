#!/usr/bin/env bash
# vast-register.sh — RUN THIS ON THE VAST.AI GPU BOX. One command, it just works:
#   1. starts Ollama bound to 0.0.0.0:11434 (+ pulls the model) if not already up
#   2. figures out THIS box's PUBLIC Ollama URL from vast.ai's own env vars
#      ($PUBLIC_IPADDR + $VAST_TCP_PORT_11434) — no manual port hunting
#   3. registers that URL with the JARVIS app on the VPS (/research/connect), which
#      connects the LLM and kicks the GPU autopilot
# Re-run anytime (or drop into vast.ai's on-start) and it re-registers — so it keeps
# working across instance restarts / port changes. No SSH tunnel, no key setup.
set -uo pipefail

APP="${JARVIS_APP_URL:-http://76.13.176.135:8001}"   # the VPS backend (override if elsewhere)
KEY="${VITE_API_KEY:-dev-key}"
MODEL="${OLLAMA_MODEL:-llama3.1:8b}"
say(){ printf '\033[36m[vast-register]\033[0m %s\n' "$*"; }

# 1) Ollama serving, bound to all interfaces, model present
if command -v ollama >/dev/null 2>&1; then
  export OLLAMA_HOST=0.0.0.0:11434
  pgrep -f "ollama serve" >/dev/null 2>&1 || { say "starting ollama (0.0.0.0:11434)…"; nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 3; }
  ollama list 2>/dev/null | grep -q . || { say "pulling $MODEL…"; ollama pull "$MODEL" || true; }
else
  say "ollama not installed here — install it first: curl -fsSL https://ollama.com/install.sh | sh"; exit 1
fi

# 2) this box's PUBLIC Ollama URL, straight from vast.ai's env
IP="${PUBLIC_IPADDR:-}"; [ -z "$IP" ] && IP="$(curl -s -m5 ifconfig.me 2>/dev/null)"
PORT="${VAST_TCP_PORT_11434:-}"
if [ -z "$PORT" ]; then
  say "WARNING: \$VAST_TCP_PORT_11434 is empty — 11434 isn't in this instance's open ports."
  say "         Add 11434 to the instance's exposed ports (vast.ai) and re-run, OR set"
  say "         OLLAMA_EXTERNAL_PORT=<the mapped port from the IP/Port button> and re-run."
  PORT="${OLLAMA_EXTERNAL_PORT:-11434}"
fi
URL="http://$IP:$PORT"
say "this box's Ollama → $URL"

# 3) register with the app on the VPS (it tests reachability + starts the autopilot)
RESP="$(curl -s -m15 -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  "$APP/v1/jarvis/research/connect" -d "{\"ollama_host\":\"$URL\"}" 2>/dev/null || true)"
echo "$RESP" | grep -q '"ok": *true\|"ok":true' \
  && say "LINKED ✓ — JARVIS is now reasoning on this GPU; the autopilot is hammering it." \
  || { say "registered, but the app says it can't reach $URL yet. Check:"; \
       say "  • is the app up at $APP ?  (curl -s $APP/ )"; \
       say "  • is 11434 an OPEN port on this vast.ai instance? (\$VAST_TCP_PORT_11434=$VAST_TCP_PORT_11434)"; \
       echo "  app response: $RESP"; }
