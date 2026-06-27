#!/usr/bin/env bash
set -euo pipefail
API="${JARVIS_API_BASE:-http://127.0.0.1:8000}"
KEY="${JARVIS_API_KEY:-dev-key}"
echo "[jarvis] health:"
curl -s "$API/health" | python3 -m json.tool || true
echo
echo "[jarvis] research status:"
curl -s "$API/v1/jarvis/research/status" | python3 -m json.tool || true
echo
echo "[jarvis] tools:"
curl -s "$API/v1/jarvis/agent/tools" | python3 -m json.tool || true
echo
echo "[jarvis] agent test:"
curl -s -X POST "$API/v1/jarvis/agent/chat" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"Inspect current LLM provider status, list available tools, and propose the next safe action. Do not perform writes."}' \
  | python3 -m json.tool || true
