#!/usr/bin/env bash
# gpu-link.sh — link the backend to the vast.ai GPU's Ollama WITHOUT fighting vast.ai
# port mapping. Run on the VPS (where serve.sh runs): it opens an SSH tunnel so the
# GPU box's Ollama appears on this box at http://127.0.0.1:11434 — the backend's
# DEFAULT — so the LLM connects with zero further config.
#
# Reads the vast.ai SSH connection from .env (VAST_SSH_*). Idempotent. Requires the
# VPS to have SSH KEY access to the GPU box (vast.ai uses key auth); never hangs on a
# password prompt (BatchMode). Re-run after the instance is recreated (update .env
# first — the SSH port changes each time).
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

H="${VAST_SSH_HOST:-}"; P="${VAST_SSH_PORT:-22}"; U="${VAST_SSH_USER:-root}"
OP="${VAST_OLLAMA_PORT:-11434}"
say(){ printf '\033[36m[gpu-link]\033[0m %s\n' "$*"; }

if [ -z "$H" ]; then say "VAST_SSH_HOST not set in .env — nothing to link."; exit 0; fi

# already reachable (tunnel up, or direct)?
if curl -s -m2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  say "Ollama already reachable at 127.0.0.1:11434 ✓"; exit 0
fi
if pgrep -f "ssh.*-L *11434:localhost:$OP.*$H" >/dev/null 2>&1; then
  say "tunnel process already running."; exit 0
fi

say "tunnelling 127.0.0.1:11434 → $U@$H:$OP  (ssh -p $P)…"
ssh -fN -o BatchMode=yes -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -p "$P" -L "11434:localhost:$OP" "$U@$H" \
  && say "up ✓ — backend uses OLLAMA_HOST=http://127.0.0.1:11434 (the default)" \
  || say "FAILED — ensure the VPS has SSH key access: ssh -p $P $U@$H (and that Ollama runs with OLLAMA_HOST=0.0.0.0:11434 on the box)"
