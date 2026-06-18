#!/bin/bash
# PostToolUse hook — queues newly-written large files for Wasabi migration.
#
# Fired by Claude Code on Write/Edit. We:
#   1. Parse the tool_input JSON to extract the file path.
#   2. If the file is >SIZE_THRESHOLD_BYTES (default 100 MB) AND lives outside
#      .cloudref / hot zones, append it to server/data/wasabi_queue.txt.
#   3. A separate cron drains the queue via cloud_storage.upload().
#
# Silent on errors (exit 0) — a broken hook must never block a Write.
# Set HOOK_LOG_DEBUG=1 to log to /tmp/hook_on_large_write.log.

set +e

PROJECT_ROOT="/opt/jarvis-app-1"
QUEUE_FILE="${PROJECT_ROOT}/server/data/wasabi_queue.txt"
SIZE_THRESHOLD_BYTES="${WASABI_QUEUE_THRESHOLD:-104857600}"

PAYLOAD=$(cat)

FILE_PATH=$(echo "$PAYLOAD" | python3 -c "
import json, sys
try:
    p = json.load(sys.stdin)
    print((p.get('tool_input') or {}).get('file_path') or '')
except Exception:
    print('')
" 2>/dev/null)

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
    exit 0
fi

# Skip hot zones — these must stay local
case "$FILE_PATH" in
    *.cloudref|*.git/*|*.venv/*|*.venv-tts/*|*node_modules/*|*/server/data/*.db|*/server/data/*.sqlite|*server/auth.py|*server/config.py|*scripts/auto_improve*)
        exit 0
        ;;
esac

FILE_SIZE=$(stat -c '%s' "$FILE_PATH" 2>/dev/null || echo 0)
if [ "$FILE_SIZE" -lt "$SIZE_THRESHOLD_BYTES" ]; then
    exit 0
fi

echo "$FILE_PATH" >> "$QUEUE_FILE" 2>/dev/null

if [ -n "${HOOK_LOG_DEBUG:-}" ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] queued $FILE_PATH ($FILE_SIZE bytes)" >> /tmp/hook_on_large_write.log
fi

exit 0
