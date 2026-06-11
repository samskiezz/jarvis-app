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
U="${VAST_SSH_USER:-root}"; OP="${VAST_OLLAMA_PORT:-11434}"; MODEL="${OLLAMA_BASE_MODEL:-${OLLAMA_MODEL:-llama3.1:8b}}"
say(){ printf '\033[36m[gpu-link]\033[0m %s\n' "$*"; }
case "${MODEL,,}:${LLM_ENABLE_70B:-0}:${ENABLE_70B_TIER:-0}" in
  *70b*:1:*|*70b*:*:1) ;;
  *70b*) say "Refusing to pull/use 70B without LLM_ENABLE_70B=1; using llama3.1:8b."; MODEL="llama3.1:8b" ;;
esac
SSHO="-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=8"

command -v ssh >/dev/null 2>&1 || { say "ssh not installed on this box — skipping."; exit 0; }

# already reachable (tunnel up or direct)?
if curl -s -m2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  say "Ollama already reachable at 127.0.0.1:11434 ✓"; exit 0
fi

# 1) ensure an SSH key on the VPS
KEY="$HOME/.ssh/id_ed25519"
[ -f "$KEY" ] || { mkdir -p "$HOME/.ssh"; ssh-keygen -t ed25519 -N "" -f "$KEY" -q; }

# 2) pick a working endpoint: DIRECT first, then the stable PROXY
H=""; P=""
for cand in "${VAST_SSH_HOST:-}:${VAST_SSH_PORT:-}" "${VAST_SSH_PROXY_HOST:-}:${VAST_SSH_PROXY_PORT:-}"; do
  ch="${cand%%:*}"; cp="${cand##*:}"
  [ -z "$ch" ] || [ -z "$cp" ] && continue
  if ssh $SSHO -p "$cp" "$U@$ch" true 2>/dev/null; then H="$ch"; P="$cp"; break; fi
done
if [ -z "$H" ]; then
  # not authorised yet on either endpoint — try to install the key, else tell the user once
  for cand in "${VAST_SSH_HOST:-}:${VAST_SSH_PORT:-}" "${VAST_SSH_PROXY_HOST:-}:${VAST_SSH_PROXY_PORT:-}"; do
    ch="${cand%%:*}"; cp="${cand##*:}"; [ -z "$ch" ] || [ -z "$cp" ] && continue
    command -v ssh-copy-id >/dev/null 2>&1 && ssh-copy-id $SSHO -p "$cp" "$U@$ch" 2>/dev/null || true
    if ssh $SSHO -p "$cp" "$U@$ch" true 2>/dev/null; then H="$ch"; P="$cp"; break; fi
  done
fi
if [ -z "$H" ]; then
  say "ONE-TIME: authorise this VPS on the GPU box (its key isn't accepted yet). Either —"
  say "  (a) add this key in vast.ai → Account → SSH Keys, then restart the instance:"
  echo "        $(cat "$KEY.pub")"
  say "  (b) or run once: ssh-copy-id -p ${VAST_SSH_PORT:-?} ${U}@${VAST_SSH_HOST:-?}"
  say "…then re-run. (Or skip SSH entirely: run scripts/vast-register.sh ON the box.)"
  exit 0
fi
say "SSH to GPU OK ✓ ($U@$H:$P)"

# 3) ensure Ollama is up on the box, bound to all interfaces, model present.
#    OLLAMA_VISIBLE_GPUS (e.g. "0,1,2") reserves a GPU for the on-box voice clone (scripts/gpu-voice-link.sh
#    runs XTTS on GPU 3) so they never fight for VRAM. Unset => Ollama uses all GPUs.
OVG="${OLLAMA_VISIBLE_GPUS:-}"
ssh $SSHO -p "$P" "$U@$H" \
  'export HOME=/root; command -v ollama >/dev/null 2>&1 || { curl -fsSL https://ollama.com/install.sh -o /root/ollama_install.sh && sh /root/ollama_install.sh; }; pgrep -x ollama >/dev/null 2>&1 || ('"${OVG:+CUDA_VISIBLE_DEVICES=$OVG }"'OLLAMA_HOST=0.0.0.0:11434 OLLAMA_KEEP_ALIVE=24h OLLAMA_MAX_LOADED_MODELS=${OLLAMA_MAX_LOADED_MODELS:-2} OLLAMA_NUM_PARALLEL=${OLLAMA_NUM_PARALLEL:-2} OLLAMA_FLASH_ATTENTION=1 setsid ollama serve >/tmp/ollama.log 2>&1 </dev/null &); sleep 3; (ollama list 2>/dev/null | grep -q . || ollama pull '"$MODEL"') >/dev/null 2>&1 &' 2>/dev/null || true

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
