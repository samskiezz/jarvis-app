#!/usr/bin/env bash
# boot.sh — turn the whole platform on: Llama + backend + data load + frontend.
set -uo pipefail
cd "$(dirname "$0")"
export BRAIN_DB="${BRAIN_DB:-$PWD/server/data/brain.db}"

echo "[boot] 1/5 Llama (Ollama)…"
if ! command -v ollama >/dev/null; then
  command -v zstd >/dev/null || sudo apt-get install -y zstd >/dev/null 2>&1 || true
  curl -fsSL https://ollama.com/install.sh | sh >/tmp/ollama_install.log 2>&1 || echo "  (ollama install skipped)"
fi
(pgrep -f "ollama serve" >/dev/null) || (nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 4)
ollama list 2>/dev/null | grep -q llama3.2:1b || ollama pull llama3.2:1b >/tmp/ollama_pull.log 2>&1 || true
export OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:1b}"

echo "[boot] 2/5 backend (uvicorn :8000)…"
(pgrep -f "uvicorn server.main:app" >/dev/null) || \
  (nohup python -m uvicorn server.main:app --host 127.0.0.1 --port 8000 >/tmp/uvicorn.log 2>&1 &)
for i in $(seq 1 30); do (echo >/dev/tcp/127.0.0.1/8000) 2>/dev/null && break; sleep 1; done

echo "[boot] 3/5 load all data points + register jobs…"
KEY="$(python -c 'from server.config import API_KEY; print(API_KEY)' 2>/dev/null)"
curl -s -X POST -H "Authorization: Bearer $KEY" http://127.0.0.1:8000/v1/jarvis/system/startup >/tmp/startup.json 2>&1 || true
python - <<'PY'
import json
try:
    d=json.load(open("/tmp/startup.json")); s=d.get("status",{}).get("foundry",{})
    print("  endpoints:", s.get("endpoints"), "subjects:", s.get("subjects"))
except Exception as e: print("  startup:", e)
PY

echo "[boot] 4/5 frontend (vite :5173)…"
[ -d node_modules ] || npm install >/tmp/npm_install.log 2>&1
export VITE_API_BASE_URL="http://127.0.0.1:8000"
export VITE_API_KEY="$KEY"
(pgrep -f "vite" >/dev/null) || (nohup npm run dev -- --host 127.0.0.1 --port 5173 >/tmp/vite.log 2>&1 &)

echo "[boot] 5/5 up. backend http://127.0.0.1:8000  ·  UI http://127.0.0.1:5173  ·  open the 'World OS' page"
