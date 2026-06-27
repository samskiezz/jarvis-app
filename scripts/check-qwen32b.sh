#!/usr/bin/env bash
set -euo pipefail
BASE="${QWEN_BASE_URL:-http://127.0.0.1:8001/v1}"
MODEL="${QWEN_MODEL:-qwen32b}"
KEY="${QWEN_API_KEY:-local-no-key}"
echo "[qwen] models:"
curl -s "$BASE/models" | python3 -m json.tool || true
echo
echo "[qwen] chat:"
curl -s "$BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [
      {\"role\":\"system\",\"content\":\"You are Jarvis. Reply with JSON only.\"},
      {\"role\":\"user\",\"content\":\"Return {\\\"status\\\":\\\"online\\\"}.\"}
    ],
    \"temperature\": 0,
    \"max_tokens\": 64
  }" | python3 -m json.tool || true
