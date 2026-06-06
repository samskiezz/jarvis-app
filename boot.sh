#!/usr/bin/env bash
# boot.sh — production bootloader for the Jarvis / Palantir-class platform.
#
# One command brings the whole system up: LLM (AIP) → backend (Foundry/Gotham/
# Apollo/AIP/Underworld) → data load → frontend. Plug-and-play and idempotent:
# re-running it heals a partial boot instead of double-starting anything.
#
# LLM backend is CONFIGURABLE so the same image runs on a laptop or scales out to
# GPU servers without code changes:
#   • Remote GPU / Ollama server :  export OLLAMA_HOST=http://gpu-box:11434
#   • Cloud (OpenAI-compatible)  :  export KIMI_API_KEY=...   KIMI_BASE_URL=...
#   • Local Ollama (default)     :  started here, with the Intel AMX enable shim
#                                   (scripts/libamx_enable.so) preloaded so AMX is
#                                   used by any non-broken build; otherwise the
#                                   agent degrades to grounded corpus search.
#
# Env knobs (all optional): OLLAMA_HOST, OLLAMA_MODEL, KIMI_API_KEY, BRAIN_DB,
#   API_HOST, API_PORT, UI_PORT, NO_UI=1, NO_LLM=1.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"

export BRAIN_DB="${BRAIN_DB:-$ROOT/server/data/brain.db}"
API_HOST="${API_HOST:-127.0.0.1}"; API_PORT="${API_PORT:-8000}"
# Recon (ffuf/kiterunner/katana) may ONLY target hosts you own. Default to this
# platform's own infra; add your production host(s), comma-separated, to extend.
export RECON_ALLOWLIST="${RECON_ALLOWLIST:-127.0.0.1,localhost,$API_HOST}"
UI_PORT="${UI_PORT:-5173}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:1b}"; export OLLAMA_MODEL
LOG=/tmp/jarvis-boot; mkdir -p "$LOG"

say(){ printf '\033[36m[boot]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[boot]\033[0m %s\n' "$*"; }

is_local_host(){ case "${1:-}" in ""|*127.0.0.1*|*localhost*|*0.0.0.0*) return 0;; *) return 1;; esac; }

# ── 1/5 LLM (AIP) ─────────────────────────────────────────────────────────────
llm_mode="off"
if [ "${NO_LLM:-0}" = "1" ]; then
  say "1/5 LLM: skipped (NO_LLM=1)"
elif [ -n "${KIMI_API_KEY:-}" ]; then
  llm_mode="cloud"; say "1/5 LLM: cloud (KIMI_API_KEY set) — backend will use it"
elif [ -n "${OLLAMA_HOST:-}" ] && ! is_local_host "$OLLAMA_HOST"; then
  llm_mode="remote"; say "1/5 LLM: remote GPU server $OLLAMA_HOST"
  curl -s -m 5 "$OLLAMA_HOST/api/tags" >/dev/null 2>&1 && say "    reachable ✓" || warn "    NOT reachable — check the GPU server / network policy"
else
  llm_mode="local"; export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
  say "1/5 LLM: local Ollama ($OLLAMA_HOST)"
  if command -v ollama >/dev/null 2>&1; then
    # Build + preload the AMX enable shim (kernel-required XTILEDATA grant). Harmless
    # where AMX is absent; lets a working AMX build run without segfaulting.
    PRELOAD=""
    if [ -f "$ROOT/scripts/amx_enable.c" ]; then
      [ -f "$ROOT/scripts/libamx_enable.so" ] || gcc -shared -fPIC -O2 \
        -o "$ROOT/scripts/libamx_enable.so" "$ROOT/scripts/amx_enable.c" 2>/dev/null || true
      [ -f "$ROOT/scripts/libamx_enable.so" ] && PRELOAD="$ROOT/scripts/libamx_enable.so"
    fi
    if ! pgrep -f "ollama serve" >/dev/null 2>&1; then
      LD_PRELOAD="$PRELOAD" nohup ollama serve >"$LOG/ollama.log" 2>&1 &
      for i in $(seq 1 20); do curl -s -m 2 "http://$OLLAMA_HOST/api/tags" >/dev/null 2>&1 && break; sleep 1; done
    fi
    ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL" || ollama pull "$OLLAMA_MODEL" >"$LOG/ollama_pull.log" 2>&1 || true
    # Honest probe: does local inference actually work on this box?
    if curl -s -m 30 "http://$OLLAMA_HOST/api/chat" \
        -d "{\"model\":\"$OLLAMA_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false}" \
        2>/dev/null | grep -q '"content"'; then
      say "    local inference ✓"
    else
      warn "    local inference unavailable (e.g. prebuilt AMX GEMM crash on this CPU)."
      warn "    System still runs: the agent grounds on the real corpus. For full"
      warn "    reasoning, point OLLAMA_HOST at a GPU server or set KIMI_API_KEY."
    fi
  else
    warn "    ollama not installed; skipping. Set OLLAMA_HOST or KIMI_API_KEY for AIP."
  fi
fi

# ── 2/5 backend ───────────────────────────────────────────────────────────────
say "2/5 backend (uvicorn $API_HOST:$API_PORT)…"
if ! pgrep -f "uvicorn server.main:app" >/dev/null 2>&1; then
  nohup python -m uvicorn server.main:app --host "$API_HOST" --port "$API_PORT" >"$LOG/uvicorn.log" 2>&1 &
fi
up=0
for i in $(seq 1 40); do curl -s -m 2 "http://$API_HOST:$API_PORT/" >/dev/null 2>&1 && { up=1; break; }; sleep 1; done
[ "$up" = 1 ] && say "    backend up ✓" || { warn "    backend failed to start (see $LOG/uvicorn.log)"; exit 1; }

# ── 3/5 load all data points + register governed jobs ─────────────────────────
# Restore the scraped document store from its committed snapshot so previously
# downloaded content is available again after an ephemeral container reset.
python -c "from server.services import document_store as d; print('    document store:', d.restore())" 2>/dev/null || true
say "3/5 load all data points + register ingestion jobs…"
KEY="$(python -c 'from server.config import API_KEY; print(API_KEY)' 2>/dev/null)"
curl -s -X POST -H "Authorization: Bearer $KEY" \
  "http://$API_HOST:$API_PORT/v1/jarvis/system/startup" >"$LOG/startup.json" 2>&1 || true
python - "$LOG/startup.json" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1])); s = (d.get("status") or {})
    f = s.get("foundry", {}); g = s.get("gotham", {}); j = s.get("ingestion_jobs", {})
    print(f"    Foundry: {f.get('endpoints',0):,} endpoints · {f.get('subjects',0):,} subjects · "
          f"{f.get('flow_edges',0):,} edges · {f.get('ocr_candidates',0):,} OCR")
    print(f"    Gotham:  {g.get('ontology_objects',0):,} objects · {g.get('neurons',0):,} neurons")
    print(f"    Jobs:    {j.get('cleared',0):,} cleared / {j.get('total',0):,} (legal gate)")
except Exception as e:
    print("    startup status:", e)
PY

# ── 4/5 frontend ──────────────────────────────────────────────────────────────
if [ "${NO_UI:-0}" = "1" ]; then
  say "4/5 frontend: skipped (NO_UI=1)"
else
  say "4/5 frontend (vite :$UI_PORT)…"
  [ -d node_modules ] || npm install >"$LOG/npm_install.log" 2>&1
  export VITE_API_BASE_URL="http://$API_HOST:$API_PORT"
  export VITE_API_KEY="$KEY"
  pgrep -f "vite" >/dev/null 2>&1 || nohup npm run dev -- --host "$API_HOST" --port "$UI_PORT" >"$LOG/vite.log" 2>&1 &
fi

# ── 5/5 ready ─────────────────────────────────────────────────────────────────
say "5/5 UP."
echo "      backend : http://$API_HOST:$API_PORT"
[ "${NO_UI:-0}" = "1" ] || echo "      UI      : http://$API_HOST:$UI_PORT   (open 'World OS' / 'Plane Graph')"
echo "      LLM     : $llm_mode   (logs in $LOG/)"
