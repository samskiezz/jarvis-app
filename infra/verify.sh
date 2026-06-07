#!/usr/bin/env bash
# infra/verify.sh — full self-test: probes every component this session built and
# prints a PASS/FAIL line each + an overall % complete. Exit 0 only at 100%.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/.venv/bin/python"
GPU="${OLLAMA_HOST:-http://211.72.13.201:41137}"
JB="http://127.0.0.1:8001"; UB="http://127.0.0.1:8091"
PASS=0; TOTAL=0
chk() { TOTAL=$((TOTAL+1)); if eval "$2" >/dev/null 2>&1; then PASS=$((PASS+1)); printf "  \033[1;32m✓\033[0m %s\n" "$1"; else printf "  \033[1;31m✗\033[0m %s\n" "$1"; fi; }

echo "── GPU brain (vast 4090s) ──"
chk "Ollama reachable"            "curl -sf -m6 $GPU/api/version"
chk "llama3.1 chat model"         "curl -sf -m6 $GPU/api/tags | grep -q llama3.1"
chk "nomic embed model"           "curl -sf -m6 $GPU/api/tags | grep -q nomic"
chk "minicpm-v OCR vision"        "curl -sf -m6 $GPU/api/tags | grep -q minicpm"

echo "── JARVIS app ──"
chk "backend up (8001)"           "curl -sf -m6 $JB/v1/jarvis/research/status"
chk "LLM backend = ollama"        "curl -sf -m6 $JB/v1/jarvis/research/status | grep -q ollama"
chk "frontend up (5173)"          "curl -sf -m6 http://127.0.0.1:5173/"
chk "knowledge DB growing"        "$PY -c \"import sqlite3;assert sqlite3.connect('$ROOT/server/data/brain.db').execute('SELECT COUNT(*) FROM note').fetchone()[0]>100\""
chk "JARVIS agent answers"        "curl -sf -m30 -X POST $JB/v1/jarvis/agent/chat -H 'Content-Type: application/json' -d '{\"message\":\"ping\"}' | grep -q answer"

echo "── Underworld sim + 3D ──"
chk "sim backend up (8091)"       "curl -sf -m6 $UB/healthz"
chk "a world exists"              "curl -sf -m6 -H 'Authorization: Bearer dev-key' $UB/worlds | grep -q '\\['"
WID=$(curl -sf -m6 -H 'Authorization: Bearer dev-key' "$UB/worlds" 2>/dev/null | $PY -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null)
chk "scene-state has minions"     "[ -n '$WID' ] && curl -sf -m8 -H 'Authorization: Bearer dev-key' '$UB/worlds/$WID/scene-state' | grep -q minions"
chk "world-map (cities) serves"   "[ -n '$WID' ] && curl -sf -m10 -H 'Authorization: Bearer dev-key' '$UB/worlds/$WID/world-map' | grep -q cities"
chk "chunk streams structures"    "[ -n '$WID' ] && curl -sf -m20 -H 'Authorization: Bearer dev-key' '$UB/worlds/$WID/chunk?cx=0&cz=0' | grep -q placements"
chk "underworld web up (5180)"    "curl -sf -m6 http://127.0.0.1:5180/"

echo "── Design data ──"
chk "asset catalog present"       "[ -s '$ROOT/underworld/web/public/models/asset_catalog.json' ]"
chk "design assets_spec.csv"      "[ -s '$ROOT/underworld/data/design/assets_spec.csv' ]"
chk "layout engine imports"       "cd $ROOT/underworld && $PY -c 'from server.services import world_layout, asset_catalog, design_spec'"

PCT=$(( PASS * 100 / TOTAL ))
printf "\n\033[1m== %d/%d checks passed — %d%% complete ==\033[0m\n" "$PASS" "$TOTAL" "$PCT"
[ "$PASS" -eq "$TOTAL" ] && { echo "100% — everything is up."; exit 0; } || { echo "incomplete — run infra/automate.sh"; exit 1; }
