#!/usr/bin/env bash
set -euo pipefail
PSI_DIR="${PSI_DIR:-/workspace/PixelStreamingInfrastructure}"
cd "${PSI_DIR}/SignallingWebServer"
# Kill only the actual signalling node process, not this shell.
for pid in $(pgrep -f "node ./dist/index.js" || true); do
  if [ "$pid" != "$$" ]; then
    kill "$pid" 2>/dev/null || true
  fi
done
sleep 2
nohup node ./dist/index.js >/tmp/jarvis_signalling.log 2>&1 </dev/null &
sleep 5
tail -n 15 /tmp/jarvis_signalling.log
ps -eo pid,user,cmd | grep "node ./dist/index.js" | grep -v grep || echo "not running"
