#!/usr/bin/env bash
# gpu-link.sh — FULLY automatic link from the VPS to the vast.ai GPU's Ollama.
#
# Run on the VPS (serve.sh runs it when GPU_LINK=1). It:
#   1. ensures an SSH key on the VPS
#   2. authorises it on the GPU box if it can (else prints the ONE copy-paste to do it)
#   3. makes sure Ollama is serving on the box, bound to 0.0.0.0, model pulled
#   4. holds a SELF-HEALING tunnel so the GPU's Ollama is always at 127.0.0.1:11434
#      (the backend default) — sidesteps vast.ai's changing port maps entirely
#   5. tells the backend to connect
#
# Reads VAST_SSH_* from .env. Idempotent, never hangs (BatchMode), never blocks boot.
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }
H="${VAST_SSH_HOST:-}"; P="${VAST_SSH_PORT:-22}"; U="${VAST_SSH_USER:-root}"
OP="${VAST_OLLAMA_PORT:-11434}"; MODEL="${OLLAMA_MODEL:-llama3.1:8b}"
say(){ printf '\033[36m[gpu-link]\033[0m %s\n' "$*"; }
SSHO="-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=8"

[ -z "$H" ] && { say "VAST_SSH_HOST not set in .env — skipping."; exit 0; }
command -v ssh >/dev/null 2>&1 || { say "ssh not installed on this box — skipping."; exit 0; }

# already reachable (tunnel up or direct)?
if curl -s -m2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  say "Ollama already reachable at 127.0.0.1:11434 ✓"; exit 0
fi

# 1) ensure an SSH key on the VPS
KEY="$HOME/.ssh/id_ed25519"
[ -f "$KEY" ] || { mkdir -p "$HOME/.ssh"; ssh-keygen -t ed25519 -N "" -f "$KEY" -q; }

# 2) authorised on the GPU box?
if ! ssh $SSHO -p "$P" "$U@$H" true 2>/dev/null; then
  command -v ssh-copy-id >/dev/null 2>&1 && ssh-copy-id $SSHO -p "$P" "$U@$H" 2>/dev/null || true
fi
if ! ssh $SSHO -p "$P" "$U@$H" true 2>/dev/null; then
  say "ONE-TIME setup: authorise this VPS on the GPU box. Either —"
  say "  (a) add this key in vast.ai → Account → SSH Keys (then recreate/restart the box):"
  echo "        $(cat "$KEY.pub")"
  say "  (b) or run ONCE from a shell that can reach the box (asks for password/key):"
  say "        ssh-copy-id -p $P $U@$H"
  say "…then re-run (serve.sh does it automatically next boot). App still runs meanwhile."
  exit 0
fi
say "SSH to GPU OK ✓"

# 3) ensure Ollama is up on the box, bound to all interfaces, model present
ssh $SSHO -p "$P" "$U@$H" \
  'command -v ollama >/dev/null 2>&1 && { pgrep -f "ollama serve" >/dev/null 2>&1 || (OLLAMA_HOST=0.0.0.0:11434 nohup ollama serve >/tmp/ollama.log 2>&1 &); sleep 2; (ollama list 2>/dev/null | grep -q . || ollama pull '"$MODEL"') >/dev/null 2>&1 & }' 2>/dev/null || true

# 4) self-healing tunnel → 127.0.0.1:11434
if ! pgrep -f "ssh.*-L *11434:localhost:$OP.*$H" >/dev/null 2>&1; then
  if command -v autossh >/dev/null 2>&1; then
    autossh -M 0 -fN $SSHO -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
      -p "$P" -L "11434:localhost:$OP" "$U@$H" && say "autossh tunnel up ✓ (self-healing)"
  else
    nohup bash -c "while true; do ssh -N $SSHO -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -p $P -L 11434:localhost:$OP $U@$H; \
      sleep 5; done" >/tmp/gpu-tunnel.log 2>&1 &
    say "tunnel keepalive started ✓ (re-dials if it drops)"
  fi
  sleep 3
fi

# 5) point the backend at it (default already works; persist it too)
curl -s -m4 -X POST -H "Authorization: Bearer ${VITE_API_KEY:-dev-key}" \
  -H "Content-Type: application/json" \
  "http://127.0.0.1:${API_PORT:-8001}/v1/jarvis/research/connect" \
  -d '{"ollama_host":"http://127.0.0.1:11434"}' >/dev/null 2>&1 || true
curl -s -m2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1 \
  && say "LINKED ✓ — Ollama at 127.0.0.1:11434; GPU autopilot will hammer." \
  || say "tunnel started; Ollama not answering yet (is it running on the box?)."
